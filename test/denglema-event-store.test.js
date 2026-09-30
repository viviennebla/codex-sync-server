import assert from "node:assert/strict";
import {
  access,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  appendStoredEvent,
  countStoredEvents,
  denglemaEventDatabasePath,
  ensureStoredReleaseAnnouncements,
  readStoredEvents,
} from "../src/denglema-event-store.js";

const WINDOW_MS = 24 * 60 * 60 * 1000;

async function withRoot(t, prefix) {
  const root = await mkdtemp(join(tmpdir(), prefix));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test("SQLite event store imports legacy JSON without deleting rollback files", async (t) => {
  const root = await withRoot(t, "denglema-event-sqlite-migrate-");
  const stateRoot = join(root, "denglema");
  await mkdir(stateRoot, { recursive: true });

  const now = new Date("2026-09-30T08:00:00Z");
  const legacyEvent = {
    id: "evt_legacy_comment",
    kind: "comment",
    user_id: "legacy-user",
    message: "旧留言还在",
    created_at: "2026-09-30T07:30:00.000Z",
    meta: { from: "json" },
    expires_at: null,
    coalesce_key: null,
  };
  await writeFile(
    join(stateRoot, "events.json"),
    JSON.stringify({ version: 1, items: [legacyEvent] }, null, 2) + "\n",
  );
  await writeFile(
    join(stateRoot, "announcements.json"),
    JSON.stringify({
      version: 1,
      published: {
        "legacy-release": "2026-09-30T07:00:00.000Z",
      },
    }, null, 2) + "\n",
  );

  const first = readStoredEvents(root, {
    now: () => now,
    windowMs: WINDOW_MS,
    limit: 50,
  });
  assert.equal(first.length, 1);
  assert.equal(first[0].id, "evt_legacy_comment");
  assert.deepEqual(first[0].meta, { from: "json" });

  await access(denglemaEventDatabasePath(root));
  await access(join(stateRoot, "events.json"));
  await access(join(stateRoot, "announcements.json"));

  assert.equal(
    ensureStoredReleaseAnnouncements([{
      id: "legacy-release",
      emoji: "📦",
      message: "不应该重复发布",
      href: "/",
    }], root, {
      now: () => now,
      windowMs: WINDOW_MS,
    }),
    0,
  );

  const afterRollbackEvent = {
    id: "evt_after_rollback",
    kind: "comment",
    user_id: "legacy-user",
    message: "回滚期间的新留言也要回来",
    created_at: "2026-09-30T07:45:00.000Z",
    meta: null,
    expires_at: null,
    coalesce_key: null,
  };
  await writeFile(
    join(stateRoot, "events.json"),
    JSON.stringify(
      { version: 1, items: [legacyEvent, afterRollbackEvent] },
      null,
      2,
    ) + "\n",
  );

  const afterRollback = readStoredEvents(root, {
    now: () => now,
    windowMs: WINDOW_MS,
    limit: 50,
  });
  assert.deepEqual(
    afterRollback.map((item) => item.id),
    ["evt_after_rollback", "evt_legacy_comment"],
  );

  const legacyText = await readFile(join(stateRoot, "events.json"), "utf8");
  assert.match(legacyText, /evt_after_rollback/);
});

test("SQLite event store keeps more than the old 20-row feed and prunes by 24h time", async (t) => {
  const root = await withRoot(t, "denglema-event-sqlite-window-");
  const now = new Date("2026-09-30T08:00:00Z");

  for (let index = 0; index < 25; index += 1) {
    appendStoredEvent({
      id: "evt_recent_" + index,
      kind: "comment",
      user_id: "user-a",
      message: "消息 " + index,
      created_at: new Date(now.getTime() - index * 1000).toISOString(),
    }, root, {
      now: () => now,
      windowMs: WINDOW_MS,
    });
  }

  appendStoredEvent({
    id: "evt_too_old",
    kind: "comment",
    user_id: "user-a",
    message: "一天以前",
    created_at: new Date(now.getTime() - WINDOW_MS - 1000).toISOString(),
  }, root, {
    now: () => now,
    windowMs: WINDOW_MS,
  });

  const events = readStoredEvents(root, {
    now: () => now,
    windowMs: WINDOW_MS,
    limit: 100,
  });
  assert.equal(events.length, 25);
  assert.equal(events.some((item) => item.id === "evt_too_old"), false);
  assert.equal(countStoredEvents(root, {
    now: () => now,
    windowMs: WINDOW_MS,
  }), 25);
});
