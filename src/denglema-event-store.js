import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";

const LEGACY_MIGRATION_KEY = "legacy-json-events-v1";

function denglemaRoot(stateDir) {
  return join(stateDir, "denglema");
}

export function denglemaEventDatabasePath(stateDir = "state") {
  return join(denglemaRoot(stateDir), "events.sqlite3");
}

function readLegacyJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

function parseMeta(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function rowToEvent(row) {
  if (!row) return null;
  return {
    id: row.id,
    kind: row.kind,
    user_id: row.user_id || null,
    message: row.message,
    created_at: row.created_at,
    meta: parseMeta(row.meta_json),
    expires_at: row.expires_at || null,
    coalesce_key: row.coalesce_key || null,
  };
}

function validLegacyEvent(item) {
  return (
    item
    && typeof item === "object"
    && typeof item.id === "string"
    && item.id
    && typeof item.message === "string"
    && Number.isFinite(Date.parse(item.created_at || ""))
  );
}

function migrateLegacyJson(db, stateDir) {
  const migrated = db.prepare(
    "SELECT value FROM storage_meta WHERE key = ?"
  ).get(LEGACY_MIGRATION_KEY);
  if (migrated) return;

  const root = denglemaRoot(stateDir);
  const eventsPath = join(root, "events.json");
  const announcementsPath = join(root, "announcements.json");
  const legacyEvents = existsSync(eventsPath)
    ? readLegacyJson(eventsPath, { version: 1, items: [] })
    : { version: 1, items: [] };
  const legacyAnnouncements = existsSync(announcementsPath)
    ? readLegacyJson(announcementsPath, { version: 1, published: {} })
    : { version: 1, published: {} };

  const insertEvent = db.prepare(`
    INSERT OR IGNORE INTO events (
      id,
      kind,
      user_id,
      message,
      created_at,
      meta_json,
      expires_at,
      coalesce_key
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertAnnouncement = db.prepare(`
    INSERT OR IGNORE INTO release_announcements (id, published_at)
    VALUES (?, ?)
  `);
  const markMigration = db.prepare(`
    INSERT OR REPLACE INTO storage_meta (key, value)
    VALUES (?, ?)
  `);

  db.transaction(() => {
    for (const item of Array.isArray(legacyEvents.items) ? legacyEvents.items : []) {
      if (!validLegacyEvent(item)) continue;
      insertEvent.run(
        item.id,
        String(item.kind || "system").slice(0, 32),
        item.user_id ? String(item.user_id) : null,
        item.message,
        new Date(Date.parse(item.created_at)).toISOString(),
        item.meta == null ? null : JSON.stringify(item.meta),
        Number.isFinite(Date.parse(item.expires_at || ""))
          ? new Date(Date.parse(item.expires_at)).toISOString()
          : null,
        item.coalesce_key ? String(item.coalesce_key) : null,
      );
    }

    for (const [id, publishedAt] of Object.entries(legacyAnnouncements.published || {})) {
      if (!id) continue;
      const parsed = Date.parse(publishedAt || "");
      insertAnnouncement.run(
        String(id),
        Number.isFinite(parsed)
          ? new Date(parsed).toISOString()
          : new Date().toISOString(),
      );
    }

    markMigration.run(LEGACY_MIGRATION_KEY, new Date().toISOString());
  })();
}

function openDatabase(stateDir) {
  const root = denglemaRoot(stateDir);
  mkdirSync(root, { recursive: true });
  const db = new Database(denglemaEventDatabasePath(stateDir));
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("busy_timeout = 3000");
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      user_id TEXT,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL,
      meta_json TEXT,
      expires_at TEXT,
      coalesce_key TEXT
    );

    CREATE INDEX IF NOT EXISTS events_created_at_idx
      ON events(created_at DESC);

    CREATE INDEX IF NOT EXISTS events_kind_user_created_idx
      ON events(kind, user_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS events_coalesce_created_idx
      ON events(coalesce_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS release_announcements (
      id TEXT PRIMARY KEY,
      published_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS storage_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  migrateLegacyJson(db, stateDir);
  return db;
}

function pruneExpired(db, now, windowMs) {
  const cutoff = new Date(now.getTime() - windowMs).toISOString();
  const nowIso = now.toISOString();
  db.prepare(`
    DELETE FROM events
    WHERE created_at < ?
       OR (expires_at IS NOT NULL AND expires_at <= ?)
  `).run(cutoff, nowIso);
}

function withDatabase(stateDir, callback) {
  const db = openDatabase(stateDir);
  try {
    return callback(db);
  } finally {
    db.close();
  }
}

export function appendStoredEvent(
  event,
  stateDir = "state",
  options = {},
) {
  const now = options.now?.() || new Date();
  const windowMs = Number(options.windowMs);
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new Error("windowMs must be positive");
  }

  return withDatabase(stateDir, (db) => db.transaction(() => {
    pruneExpired(db, now, windowMs);

    const coalesceKey = event?.coalesce_key ? String(event.coalesce_key) : null;
    const coalesceWindowMs = Number(event?.coalesce_window_ms || 0);
    if (coalesceKey && coalesceWindowMs > 0) {
      const threshold = new Date(now.getTime() - coalesceWindowMs).toISOString();
      const previous = db.prepare(`
        SELECT *
        FROM events
        WHERE coalesce_key = ?
          AND created_at >= ?
        ORDER BY created_at DESC
        LIMIT 1
      `).get(coalesceKey, threshold);

      if (previous) {
        const expiresAt = event?.expires_at || previous.expires_at || null;
        db.prepare(`
          UPDATE events
          SET kind = ?,
              user_id = ?,
              message = ?,
              created_at = ?,
              meta_json = ?,
              expires_at = ?
          WHERE id = ?
        `).run(
          event.kind,
          event.user_id || null,
          event.message,
          now.toISOString(),
          event.meta == null ? null : JSON.stringify(event.meta),
          expiresAt,
          previous.id,
        );
        return rowToEvent(
          db.prepare("SELECT * FROM events WHERE id = ?").get(previous.id)
        );
      }
    }

    const item = {
      id: event?.id || "evt_" + randomUUID(),
      kind: event.kind,
      user_id: event.user_id || null,
      message: event.message,
      created_at: event.created_at || now.toISOString(),
      meta: event.meta || null,
      expires_at: event.expires_at || null,
      coalesce_key: coalesceKey,
    };
    db.prepare(`
      INSERT INTO events (
        id,
        kind,
        user_id,
        message,
        created_at,
        meta_json,
        expires_at,
        coalesce_key
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      item.id,
      item.kind,
      item.user_id,
      item.message,
      item.created_at,
      item.meta == null ? null : JSON.stringify(item.meta),
      item.expires_at,
      item.coalesce_key,
    );
    return item;
  })());
}

export function latestStoredComment(
  userId,
  stateDir = "state",
  options = {},
) {
  const now = options.now?.() || new Date();
  const windowMs = Number(options.windowMs);
  return withDatabase(stateDir, (db) => {
    pruneExpired(db, now, windowMs);
    return rowToEvent(db.prepare(`
      SELECT *
      FROM events
      WHERE kind = 'comment'
        AND user_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(String(userId)));
  });
}

export function readStoredEvents(
  stateDir = "state",
  options = {},
) {
  const now = options.now?.() || new Date();
  const windowMs = Number(options.windowMs);
  const limit = Math.max(1, Math.min(500, Number(options.limit || 240)));

  return withDatabase(stateDir, (db) => {
    pruneExpired(db, now, windowMs);
    return db.prepare(`
      SELECT *
      FROM events
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit).map(rowToEvent);
  });
}

export function backfillStoredJoinEvents(
  candidates,
  stateDir = "state",
  options = {},
) {
  const now = options.now?.() || new Date();
  const windowMs = Number(options.windowMs);
  const cutoff = now.getTime() - windowMs;

  return withDatabase(stateDir, (db) => db.transaction(() => {
    pruneExpired(db, now, windowMs);
    const exists = db.prepare(`
      SELECT 1
      FROM events
      WHERE kind = 'join'
        AND user_id = ?
      LIMIT 1
    `);
    const insert = db.prepare(`
      INSERT INTO events (
        id,
        kind,
        user_id,
        message,
        created_at,
        meta_json,
        expires_at,
        coalesce_key
      ) VALUES (?, 'join', ?, '加入了赛道', ?, ?, NULL, ?)
    `);

    let added = 0;
    for (const candidate of Array.isArray(candidates) ? candidates : []) {
      const userId = String(candidate?.user_id || "").trim();
      const createdMs = Date.parse(candidate?.created_at || "");
      if (!userId || !Number.isFinite(createdMs)) continue;
      if (createdMs < cutoff || createdMs > now.getTime()) continue;
      if (exists.get(userId)) continue;

      insert.run(
        "evt_" + randomUUID(),
        userId,
        new Date(createdMs).toISOString(),
        JSON.stringify({ historical: true }),
        "join:user:" + userId,
      );
      added += 1;
    }
    return added;
  })());
}

export function ensureStoredReleaseAnnouncements(
  announcements,
  stateDir = "state",
  options = {},
) {
  const now = options.now?.() || new Date();
  const windowMs = Number(options.windowMs);

  return withDatabase(stateDir, (db) => db.transaction(() => {
    pruneExpired(db, now, windowMs);
    const published = db.prepare(
      "SELECT 1 FROM release_announcements WHERE id = ?"
    );
    const markPublished = db.prepare(`
      INSERT INTO release_announcements (id, published_at)
      VALUES (?, ?)
    `);
    const insertEvent = db.prepare(`
      INSERT INTO events (
        id,
        kind,
        user_id,
        message,
        created_at,
        meta_json,
        expires_at,
        coalesce_key
      ) VALUES (?, 'release', NULL, ?, ?, ?, NULL, NULL)
    `);

    let added = 0;
    for (const announcement of Array.isArray(announcements) ? announcements : []) {
      if (!announcement?.id || published.get(String(announcement.id))) continue;
      const createdAt = now.toISOString();
      markPublished.run(String(announcement.id), createdAt);
      insertEvent.run(
        "evt_" + randomUUID(),
        announcement.message,
        createdAt,
        JSON.stringify({
          announcement_id: announcement.id,
          emoji: announcement.emoji,
          href: announcement.href,
        }),
      );
      added += 1;
    }
    return added;
  })());
}

export function countStoredEvents(
  stateDir = "state",
  options = {},
) {
  const now = options.now?.() || new Date();
  const windowMs = Number(options.windowMs);
  return withDatabase(stateDir, (db) => {
    pruneExpired(db, now, windowMs);
    return Number(db.prepare("SELECT COUNT(*) AS count FROM events").get().count || 0);
  });
}
