import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  consumePairingCode,
  createPairingCode,
  createWebUser,
  upsertUsageSample,
} from "../src/denglema-state.js";
import {
  addDenglemaComment,
  appendDenglemaEvent,
  backfillHistoricalJoinEvents,
  ensureDenglemaReleaseAnnouncements,
  readDenglemaEvents,
  syncLeaderboardLeader,
  syncUserAchievements,
} from "../src/denglema-social.js";

async function withRoot(t, prefix) {
  const root = await mkdtemp(join(tmpdir(), prefix));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test("24h event feed prunes old events, enriches users, and rate-limits comments", async (t) => {
  const root = await withRoot(t, "denglema-social-events-");
  await createWebUser({ display_name: "Alice", avatar_emoji: "🐱" }, root, {
    userId: "user-a",
    recoveryCode: "EVENT-USER-A",
    now: () => new Date("2026-09-28T00:00:00Z"),
  });

  await appendDenglemaEvent({
    kind: "upload",
    user_id: "user-a",
    message: "old event",
  }, root, { now: () => new Date("2026-09-28T00:00:00Z") });

  await addDenglemaComment(
    "user-a",
    "今天谁先把额度蹬没？",
    root,
    { now: () => new Date("2026-09-29T03:00:00Z") },
  );

  await assert.rejects(
    addDenglemaComment(
      "user-a",
      "太快了",
      root,
      { now: () => new Date("2026-09-29T03:00:01Z") },
    ),
    /3 秒/,
  );

  const events = await readDenglemaEvents(root, {
    now: () => new Date("2026-09-29T03:00:02Z"),
  });
  const comments = events.filter((item) => item.kind === "comment");
  assert.equal(comments.length, 1);
  assert.equal(comments[0].message, "今天谁先把额度蹬没？");
  assert.equal(comments[0].user.display_name, "Alice");
});

test("release announcement publishes once, links to upgrade notes, and does not reappear", async (t) => {
  const root = await withRoot(t, "denglema-social-release-announcement-");
  let now = new Date("2026-09-30T03:00:00Z");

  assert.equal(
    await ensureDenglemaReleaseAnnouncements(root, { now: () => now }),
    1,
  );
  assert.equal(
    await ensureDenglemaReleaseAnnouncements(root, { now: () => now }),
    0,
  );

  let events = await readDenglemaEvents(root, { now: () => now });
  const release = events.find((item) => item.kind === "release");
  assert.ok(release);
  assert.equal(release.message, "蹬了吗插件升级到 0.1.16 · 新增自动上传");
  assert.equal(release.meta.emoji, "📦");
  assert.equal(release.meta.href, "/plugin#upgrade-0-1-16");

  now = new Date("2026-10-02T04:00:00Z");
  events = await readDenglemaEvents(root, { now: () => now });
  assert.equal(events.some((item) => item.kind === "release"), false);
  assert.equal(
    await ensureDenglemaReleaseAnnouncements(root, { now: () => now }),
    0,
  );
});

test("historical join events backfill from the earliest binding within 24h", async (t) => {
  const root = await withRoot(t, "denglema-social-backfill-");
  await createWebUser({ display_name: "Recent", avatar_emoji: "🚲" }, root, {
    userId: "user-recent",
    recoveryCode: "RECENT-USER",
    now: () => new Date("2026-09-29T00:00:00Z"),
  });
  await createWebUser({ display_name: "Old", avatar_emoji: "🐢" }, root, {
    userId: "user-old",
    recoveryCode: "OLD-USER",
    now: () => new Date("2026-09-27T00:00:00Z"),
  });

  const recentPair = await createPairingCode("user-recent", root, {
    code: "RECENT-A",
    now: () => new Date("2026-09-29T01:00:00Z"),
  });
  await consumePairingCode(recentPair.code, "Cursor", root, {
    token: "recent-a",
    installationId: "recent-a",
    now: () => new Date("2026-09-29T01:01:00Z"),
  });
  const recentPair2 = await createPairingCode("user-recent", root, {
    code: "RECENT-B",
    now: () => new Date("2026-09-29T02:00:00Z"),
  });
  await consumePairingCode(recentPair2.code, "Codex", root, {
    token: "recent-b",
    installationId: "recent-b",
    now: () => new Date("2026-09-29T02:01:00Z"),
  });

  const oldPair = await createPairingCode("user-old", root, {
    code: "OLD-A",
    now: () => new Date("2026-09-27T01:00:00Z"),
  });
  await consumePairingCode(oldPair.code, "Old", root, {
    token: "old-a",
    installationId: "old-a",
    now: () => new Date("2026-09-27T01:01:00Z"),
  });

  const now = new Date("2026-09-29T03:00:00Z");
  assert.equal(await backfillHistoricalJoinEvents(root, { now: () => now }), 1);
  assert.equal(await backfillHistoricalJoinEvents(root, { now: () => now }), 0);

  const events = await readDenglemaEvents(root, { now: () => now });
  const joins = events.filter((item) => item.kind === "join");
  assert.equal(joins.length, 1);
  assert.equal(joins[0].user.display_name, "Recent");
  assert.equal(joins[0].created_at, "2026-09-29T01:01:00.000Z");
});

test("achievement events expose the unlocked achievement name", async (t) => {
  const root = await withRoot(t, "denglema-social-achievement-name-");
  await createWebUser({ display_name: "Alice", avatar_emoji: "🐱" }, root, {
    userId: "alice",
    recoveryCode: "ALICE-ACHIEVEMENT",
    now: () => new Date("2026-09-29T00:00:00Z"),
  });
  await appendDenglemaEvent({
    kind: "achievement",
    user_id: "alice",
    message: "解锁成就「百万燃料」",
    meta: { achievement_id: "million_day", emoji: "🔥" },
  }, root, { now: () => new Date("2026-09-29T02:00:00Z") });

  const events = await readDenglemaEvents(root, {
    now: () => new Date("2026-09-29T02:01:00Z"),
  });
  const achievement = events.find((item) => item.kind === "achievement");
  assert.ok(achievement);
  assert.equal(achievement.message, "解锁成就「百万燃料」");
  assert.equal(achievement.meta.emoji, "🔥");
});

test("leader event emits only when first place changes", async (t) => {
  const root = await withRoot(t, "denglema-social-leader-");
  for (const [id, name] of [["u-a", "Alice"], ["u-b", "Bob"]]) {
    await createWebUser({ display_name: name, avatar_emoji: "🚴" }, root, {
      userId: id,
      recoveryCode: "RECOVERY-" + id,
      now: () => new Date("2026-09-29T00:00:00Z"),
    });
  }

  const pairA = await createPairingCode("u-a", root, { code: "LEAD-A", now: () => new Date("2026-09-29T00:01:00Z") });
  const a = await consumePairingCode(pairA.code, "A", root, { token: "ta", installationId: "ia", now: () => new Date("2026-09-29T00:02:00Z") });
  const pairB = await createPairingCode("u-b", root, { code: "LEAD-B", now: () => new Date("2026-09-29T00:03:00Z") });
  const b = await consumePairingCode(pairB.code, "B", root, { token: "tb", installationId: "ib", now: () => new Date("2026-09-29T00:04:00Z") });

  await upsertUsageSample({ id: a.installation_id, user_id: "u-a" }, {
    schema_version: 2, harness: "codex", date: "2026-09-29",
    observed_at: "2026-09-29T01:00:00Z", total_tokens: 100, models: [], projects: [],
  }, root);
  const initial = await syncLeaderboardLeader("2026-09-29", root, { now: () => new Date("2026-09-29T01:00:01Z") });
  assert.equal(initial.changed, false);

  await upsertUsageSample({ id: b.installation_id, user_id: "u-b" }, {
    schema_version: 2, harness: "cursor", date: "2026-09-29",
    observed_at: "2026-09-29T01:10:00Z", total_tokens: 150, models: [], projects: [],
  }, root);
  const changed = await syncLeaderboardLeader("2026-09-29", root, { now: () => new Date("2026-09-29T01:10:01Z") });
  assert.equal(changed.changed, true);
  assert.equal(changed.current, "u-b");
  assert.equal(changed.previous, "u-a");

  const again = await syncLeaderboardLeader("2026-09-29", root, { now: () => new Date("2026-09-29T01:11:00Z") });
  assert.equal(again.changed, false);

  const events = await readDenglemaEvents(root, { now: () => new Date("2026-09-29T01:11:01Z") });
  const leader = events.find((item) => item.kind === "leader");
  assert.equal(leader.user.display_name, "Bob");
  assert.equal(leader.message, "超车成为第一名");
});

test("upload events coalesce within the configured window", async (t) => {
  const root = await withRoot(t, "denglema-social-coalesce-");

  await appendDenglemaEvent({
    kind: "upload",
    user_id: "user-a",
    message: "刷新至 100",
    coalesce_key: "upload:inst-a",
    coalesce_window_ms: 10 * 60 * 1000,
  }, root, { now: () => new Date("2026-09-29T03:00:00Z") });

  await appendDenglemaEvent({
    kind: "upload",
    user_id: "user-a",
    message: "刷新至 200",
    coalesce_key: "upload:inst-a",
    coalesce_window_ms: 10 * 60 * 1000,
  }, root, { now: () => new Date("2026-09-29T03:05:00Z") });

  const events = await readDenglemaEvents(root, {
    now: () => new Date("2026-09-29T03:05:01Z"),
  });
  const uploads = events.filter((item) => item.kind === "upload");
  assert.equal(uploads.length, 1);
  assert.equal(uploads[0].message, "刷新至 200");
});

test("achievements unlock once and include multi-harness progress", async (t) => {
  const root = await withRoot(t, "denglema-social-achievements-");
  await createWebUser({ display_name: "Rider", avatar_emoji: "🚴" }, root, {
    userId: "user-rider",
    recoveryCode: "ACHIEVE-RIDER",
    now: () => new Date("2026-09-29T00:00:00Z"),
  });

  const baseline = await syncUserAchievements(
    "user-rider",
    "2026-09-29",
    root,
    { now: () => new Date("2026-09-29T00:00:30Z") },
  );
  assert.equal(baseline.filter((item) => item.unlocked).length, 0);

  const pairA = await createPairingCode("user-rider", root, {
    code: "PAIR-A",
    now: () => new Date("2026-09-29T00:01:00Z"),
  });
  const instA = await consumePairingCode(pairA.code, "Cursor", root, {
    token: "token-a",
    installationId: "inst-a",
    now: () => new Date("2026-09-29T00:02:00Z"),
  });
  const pairB = await createPairingCode("user-rider", root, {
    code: "PAIR-B",
    now: () => new Date("2026-09-29T00:03:00Z"),
  });
  const instB = await consumePairingCode(pairB.code, "Codex", root, {
    token: "token-b",
    installationId: "inst-b",
    now: () => new Date("2026-09-29T00:04:00Z"),
  });

  await upsertUsageSample(
    { id: instA.installation_id, user_id: "user-rider" },
    {
      schema_version: 2,
      harness: "cursor",
      date: "2026-09-29",
      observed_at: "2026-09-29T03:00:00Z",
      total_tokens: 6_000_000,
      models: [
        { name: "model-a", total_tokens: 3_000_000 },
        { name: "model-b", total_tokens: 3_000_000 },
      ],
      projects: [
        { name: "project-a", total_tokens: 3_000_000 },
        { name: "project-b", total_tokens: 3_000_000 },
      ],
    },
    root,
  );
  await upsertUsageSample(
    { id: instB.installation_id, user_id: "user-rider" },
    {
      schema_version: 2,
      harness: "codex",
      date: "2026-09-29",
      observed_at: "2026-09-29T03:01:00Z",
      total_tokens: 5_000_000,
      models: [{ name: "model-c", total_tokens: 5_000_000 }],
      projects: [{ name: "project-c", total_tokens: 5_000_000 }],
    },
    root,
  );

  const first = await syncUserAchievements(
    "user-rider",
    "2026-09-29",
    root,
    { now: () => new Date("2026-09-29T03:02:00Z") },
  );
  assert.equal(first.filter((item) => item.unlocked).length, 7);
  assert.equal(first.find((item) => item.id === "multi_harness").unlocked, true);
  assert.equal(first.find((item) => item.id === "took_the_crown").unlocked, true);

  const firstEvents = await readDenglemaEvents(root, {
    now: () => new Date("2026-09-29T03:02:01Z"),
    limit: 20,
  });
  assert.equal(firstEvents.filter((item) => item.kind === "achievement").length, 7);

  await syncUserAchievements(
    "user-rider",
    "2026-09-29",
    root,
    { now: () => new Date("2026-09-29T04:00:00Z") },
  );
  const secondEvents = await readDenglemaEvents(root, {
    now: () => new Date("2026-09-29T04:00:01Z"),
    limit: 20,
  });
  assert.equal(secondEvents.filter((item) => item.kind === "achievement").length, 7);
});
