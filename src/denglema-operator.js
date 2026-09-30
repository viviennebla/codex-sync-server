import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { appendDenglemaEvent } from "./denglema-social.js";

const MAX_IDEMPOTENCY_KEYS = 512;
const MAX_AUDIT_ITEMS = 512;
const DEFAULT_TTL_HOURS = 24;
const MAX_TTL_HOURS = 24;

function operatorStatePath(stateDir) {
  return join(stateDir, "denglema", "operator.json");
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const tmp = path + ".tmp." + randomUUID();
  await writeFile(tmp, JSON.stringify(value, null, 2) + "\n", "utf8");
  await rename(tmp, path);
}

function boundedObject(entries, maxItems) {
  return Object.fromEntries(
    Object.entries(entries || {})
      .sort((a, b) => Date.parse(b[1]?.created_at || "") - Date.parse(a[1]?.created_at || ""))
      .slice(0, maxItems),
  );
}

function boundedAudit(items) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => Number.isFinite(Date.parse(item?.created_at || "")))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .slice(0, MAX_AUDIT_ITEMS);
}

function cleanText(value, label, maxChars) {
  const text = String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) throw new Error(label + " is required");
  if ([...text].length > maxChars) throw new Error(label + " is too long");
  return text;
}

function cleanIdempotencyKey(value) {
  const key = String(value || "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(key)) {
    throw new Error("Invalid idempotency_key");
  }
  return key;
}

function cleanEmoji(value) {
  if (value == null || value === "") return "🤖";
  return cleanText(value, "emoji", 8);
}

function cleanHref(value) {
  if (value == null || value === "") return null;
  const href = String(value).trim();
  if (!href.startsWith("/") || href.startsWith("//") || href.length > 240) {
    throw new Error("href must be a local path");
  }
  return href;
}

function cleanTtlHours(value) {
  if (value == null || value === "") return DEFAULT_TTL_HOURS;
  const ttl = Number(value);
  if (!Number.isInteger(ttl) || ttl < 1 || ttl > MAX_TTL_HOURS) {
    throw new Error("ttl_hours must be an integer between 1 and 24");
  }
  return ttl;
}

export function operatorTokenAuthorized(authorizationHeader, configuredToken) {
  const expected = String(configuredToken || "");
  if (!expected) return false;
  const match = String(authorizationHeader || "").match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  const provided = match[1].trim();
  if (!provided) return false;

  const expectedHash = createHash("sha256").update(expected).digest();
  const providedHash = createHash("sha256").update(provided).digest();
  return timingSafeEqual(expectedHash, providedHash);
}

let operatorQueue = Promise.resolve();

export async function publishOperatorAnnouncement(input, stateDir = "state", options = {}) {
  const run = operatorQueue.then(async () => {
    const now = options.now?.() || new Date();
    const idempotencyKey = cleanIdempotencyKey(input?.idempotency_key);
    const message = cleanText(input?.message, "message", 120);
    const emoji = cleanEmoji(input?.emoji);
    const href = cleanHref(input?.href);
    const ttlHours = cleanTtlHours(input?.ttl_hours);
    const file = operatorStatePath(stateDir);
    const store = await readJson(file, {
      version: 1,
      idempotency: {},
      audit: [],
    });
    store.idempotency ||= {};
    store.audit ||= [];

    const previous = store.idempotency[idempotencyKey];
    if (previous?.event_id) {
      return {
        created: false,
        event_id: previous.event_id,
        published_at: previous.created_at,
        expires_at: previous.expires_at || null,
        idempotency_key: idempotencyKey,
      };
    }

    const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60 * 1000).toISOString();
    const event = await appendDenglemaEvent({
      kind: "release",
      user_id: null,
      message,
      expires_at: expiresAt,
      meta: {
        announcement_id: idempotencyKey,
        emoji,
        href,
        source: "ai_operator",
        actor: {
          type: "ai_operator",
          id: "ai_operator",
          display_name: "蹬了吗 AI",
          avatar_emoji: "🤖",
        },
      },
    }, stateDir, { now: () => now });

    const record = {
      event_id: event.id,
      created_at: now.toISOString(),
      expires_at: expiresAt,
    };
    store.idempotency[idempotencyKey] = record;
    store.idempotency = boundedObject(store.idempotency, MAX_IDEMPOTENCY_KEYS);
    store.audit.unshift({
      action_id: "op_" + randomUUID(),
      actor: "ai_operator",
      action: "publish_announcement",
      idempotency_key: idempotencyKey,
      event_id: event.id,
      created_at: now.toISOString(),
    });
    store.audit = boundedAudit(store.audit);
    await writeJson(file, store);

    return {
      created: true,
      event_id: event.id,
      published_at: record.created_at,
      expires_at: expiresAt,
      idempotency_key: idempotencyKey,
    };
  });
  operatorQueue = run.catch(() => {});
  return run;
}

export async function readOperatorAudit(stateDir = "state", options = {}) {
  const limit = Math.min(100, Math.max(1, Number(options.limit || 50)));
  const store = await readJson(operatorStatePath(stateDir), {
    version: 1,
    idempotency: {},
    audit: [],
  });
  return boundedAudit(store.audit).slice(0, limit);
}
