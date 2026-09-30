import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  consumePairingCode,
  createPairingCode,
  createWebUser,
  readUserUsageHistory,
  upsertUsageSample,
} from "../src/denglema-state.js";
import {
  addDenglemaComment,
  analyzeDenglemaUsageRhythm,
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
  assert.equal(comments[0].user.avatar_emoji, "🐱");
  assert.equal(comments[0].user.avatar_url, null);
});

test("release announcements publish once, link to notes, and do not reappear", async (t) => {
  const root = await withRoot(t, "denglema-social-release-announcement-");
  let now = new Date("2026-09-30T03:00:00Z");

  assert.equal(
    await ensureDenglemaReleaseAnnouncements(root, { now: () => now }),
    2,
  );
  assert.equal(
    await ensureDenglemaReleaseAnnouncements(root, { now: () => now }),
    0,
  );

  let events = await readDenglemaEvents(root, { now: () => now });
  const releases = events.filter((item) => item.kind === "release");
  assert.equal(releases.length, 2);

  const pluginRelease = releases.find(
    (item) => item.meta?.announcement_id === "plugin-0.1.16-auto-upload",
  );
  assert.ok(pluginRelease);
  assert.equal(pluginRelease.message, "蹬了吗插件升级到 0.1.16 · 新增自动上传");
  assert.equal(pluginRelease.meta.emoji, "📦");
  assert.equal(pluginRelease.meta.href, "/plugin#upgrade-0-1-16");

  const webRelease = releases.find(
    (item) => item.meta?.announcement_id === "web-2026-09-social-transports",
  );
  assert.ok(webRelease);
  assert.equal(webRelease.message, "蹬了吗更新 · 支持在线 24h 留言和更多交通工具");
  assert.equal(webRelease.meta.emoji, "💬");
  assert.equal(webRelease.meta.href, "/plugin#web-social-transports");

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
  assert.equal(first.filter((item) => item.unlocked).length, 9);
  assert.equal(first.find((item) => item.id === "multi_harness").unlocked, true);
  assert.equal(first.find((item) => item.id === "took_the_crown").unlocked, true);

  const firstEvents = await readDenglemaEvents(root, {
    now: () => new Date("2026-09-29T03:02:01Z"),
    limit: 20,
  });
  assert.equal(firstEvents.filter((item) => item.kind === "achievement").length, 9);

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
  assert.equal(secondEvents.filter((item) => item.kind === "achievement").length, 9);
});


function rhythmSamples(startIso, totals, stepMinutes = 60) {
  const start = Date.parse(startIso);
  return totals.map((total_tokens, index) => ({
    observed_at: new Date(start + index * stepMinutes * 60_000).toISOString(),
    total_tokens,
    installations: 1,
    introduced_installation: index === 0,
  }));
}

test("work rhythm uses the Asia/Shanghai weekday 09:00-18:00 window", () => {
  const rhythm = analyzeDenglemaUsageRhythm([
    { observed_at: "2026-09-30T01:00:00Z", total_tokens: 0, installations: 1, introduced_installation: true },
    { observed_at: "2026-09-30T10:00:00Z", total_tokens: 54_000, installations: 1, introduced_installation: false },
  ]);
  assert.equal(rhythm.timezone, "Asia/Shanghai");
  assert.equal(rhythm.work_intervals.length, 1);
  assert.equal(rhythm.work_intervals[0].minutes, 9 * 60);
});

test("09:00 boundary excludes pre-work interval and includes interval starting at 09:00", () => {
  const rhythm = analyzeDenglemaUsageRhythm([
    { observed_at: "2026-09-30T00:00:00Z", total_tokens: 0, installations: 1, introduced_installation: true },
    { observed_at: "2026-09-30T01:00:00Z", total_tokens: 600, installations: 1, introduced_installation: false },
    { observed_at: "2026-09-30T02:00:00Z", total_tokens: 1_200, installations: 1, introduced_installation: false },
  ]);
  assert.equal(rhythm.work_intervals.length, 1);
  assert.equal(rhythm.work_intervals[0].start_at, "2026-09-30T01:00:00.000Z");
  assert.equal(rhythm.early_bird, true);
});

test("18:00 boundary includes interval ending at 18:00 and excludes later work rhythm", () => {
  const rhythm = analyzeDenglemaUsageRhythm([
    { observed_at: "2026-09-30T09:00:00Z", total_tokens: 0, installations: 1, introduced_installation: true },
    { observed_at: "2026-09-30T10:00:00Z", total_tokens: 600, installations: 1, introduced_installation: false },
    { observed_at: "2026-09-30T11:00:00Z", total_tokens: 1_200, installations: 1, introduced_installation: false },
  ]);
  assert.equal(rhythm.work_intervals.length, 1);
  assert.equal(rhythm.work_intervals[0].end_at, "2026-09-30T10:00:00.000Z");
  assert.equal(rhythm.night_ride, true);
});

test("weekend usage is excluded from work stability and only feeds playful timing", () => {
  const rhythm = analyzeDenglemaUsageRhythm([
    { observed_at: "2026-10-03T01:00:00Z", total_tokens: 0, installations: 1, introduced_installation: true },
    { observed_at: "2026-10-03T02:00:00Z", total_tokens: 600, installations: 1, introduced_installation: false },
  ]);
  assert.equal(rhythm.work_intervals.length, 0);
  assert.equal(rhythm.weekend_rider, true);
  assert.equal(rhythm.rhythm_eligible, false);
});

test("steady positive work burn rate unlocks steady cruise", () => {
  const rhythm = analyzeDenglemaUsageRhythm(
    rhythmSamples("2026-09-30T01:00:00Z", [0, 6_000, 12_000, 18_000, 24_000, 30_000]),
  );
  assert.equal(rhythm.interval_count, 5);
  assert.equal(rhythm.coverage_minutes, 300);
  assert.equal(rhythm.rhythm_eligible, true);
  assert.equal(rhythm.coefficient_of_variation, 0);
  assert.equal(rhythm.steady_cruise, true);
  assert.equal(rhythm.heartbeat_rider, false);
});

test("highly variable positive work burn rate unlocks heartbeat rider", () => {
  const rhythm = analyzeDenglemaUsageRhythm(
    rhythmSamples("2026-09-30T01:00:00Z", [0, 600, 12_600, 13_200, 25_200, 25_800]),
  );
  assert.equal(rhythm.rhythm_eligible, true);
  assert.ok(rhythm.coefficient_of_variation >= 0.9);
  assert.equal(rhythm.steady_cruise, false);
  assert.equal(rhythm.heartbeat_rider, true);
});

test("insufficient samples never unlock a rhythm achievement", () => {
  const rhythm = analyzeDenglemaUsageRhythm(
    rhythmSamples("2026-09-30T01:00:00Z", [0, 6_000, 12_000, 18_000, 24_000]),
  );
  assert.equal(rhythm.interval_count, 4);
  assert.equal(rhythm.rhythm_eligible, false);
  assert.equal(rhythm.steady_cruise, false);
  assert.equal(rhythm.heartbeat_rider, false);
});

test("multiple installations aggregate into one user timeline without duplicate intervals", async (t) => {
  const root = await withRoot(t, "denglema-rhythm-multi-install-");
  const sample = (observed_at, total_tokens) => ({
    schema_version: 2,
    harness: "codex",
    date: "2026-09-30",
    observed_at,
    total_tokens,
    models: [],
    projects: [],
  });

  await upsertUsageSample({ id: "inst-a", user_id: "multi" }, sample("2026-09-30T01:00:00Z", 100), root);
  await upsertUsageSample({ id: "inst-b", user_id: "multi" }, sample("2026-09-30T01:00:00Z", 50), root);
  await upsertUsageSample({ id: "inst-a", user_id: "multi" }, sample("2026-09-30T02:00:00Z", 200), root);
  await upsertUsageSample({ id: "inst-b", user_id: "multi" }, sample("2026-09-30T02:00:00Z", 100), root);

  const history = await readUserUsageHistory("multi", "2026-09-30", root);
  assert.deepEqual(history.map((item) => item.total_tokens), [150, 300]);
  const rhythm = analyzeDenglemaUsageRhythm(history);
  assert.equal(rhythm.interval_count, 1);
  assert.equal(rhythm.work_intervals[0].token_delta, 150);
});

test("usage sample history is bounded to 96 lightweight points per installation", async (t) => {
  const root = await withRoot(t, "denglema-rhythm-history-bound-");
  const start = Date.parse("2026-09-30T00:00:00Z");
  for (let index = 0; index < 100; index += 1) {
    await upsertUsageSample({ id: "inst-bounded", user_id: "bounded" }, {
      schema_version: 2,
      harness: "codex",
      date: "2026-09-30",
      observed_at: new Date(start + index * 5 * 60_000).toISOString(),
      total_tokens: (index + 1) * 10,
      models: [],
      projects: [],
    }, root);
  }
  const history = await readUserUsageHistory("bounded", "2026-09-30", root);
  assert.equal(history.length, 96);
  assert.equal(history[0].total_tokens, 50);
  assert.equal(history.at(-1).total_tokens, 1_000);
});


test("balance achievements require real activity instead of rewarding zero tokens", async (t) => {
  const root = await withRoot(t, "denglema-balance-real-activity-");
  await createWebUser({ display_name: "Focus", avatar_emoji: "🎯" }, root, {
    userId: "focus",
    recoveryCode: "FOCUS-USER",
  });
  const pairing = await createPairingCode("focus", root, { code: "FOCUS-INSTALL" });
  const installation = await consumePairingCode(pairing.code, "Focus device", root, {
    token: "focus-token",
    installationId: "focus-inst",
  });

  const empty = await syncUserAchievements("focus", "2026-09-30", root);
  assert.equal(empty.find((item) => item.id === "precise_rider").unlocked, false);
  assert.equal(empty.find((item) => item.id === "light_multitasker").unlocked, false);

  await upsertUsageSample({ id: installation.installation_id, user_id: "focus" }, {
    schema_version: 2,
    harness: "codex",
    date: "2026-09-30",
    observed_at: "2026-09-30T02:00:00Z",
    total_tokens: 100,
    models: [{ name: "gpt-5.6-sol", total_tokens: 100 }],
    projects: [{ name: "one-project", total_tokens: 100 }],
  }, root);

  const active = await syncUserAchievements("focus", "2026-09-30", root);
  assert.equal(active.find((item) => item.id === "precise_rider").unlocked, true);
});

test("balanced breadth and three consecutive active days unlock planned balance achievements", async (t) => {
  const root = await withRoot(t, "denglema-balance-planned-");
  await createWebUser({ display_name: "Balanced", avatar_emoji: "🧭" }, root, {
    userId: "balanced",
    recoveryCode: "BALANCED-USER",
  });
  const pairA = await createPairingCode("balanced", root, { code: "BALANCED-A" });
  const instA = await consumePairingCode(pairA.code, "A", root, {
    token: "balanced-a",
    installationId: "balanced-a",
  });
  const pairB = await createPairingCode("balanced", root, { code: "BALANCED-B" });
  const instB = await consumePairingCode(pairB.code, "B", root, {
    token: "balanced-b",
    installationId: "balanced-b",
  });

  for (const date of ["2026-09-28", "2026-09-29"]) {
    await upsertUsageSample({ id: instA.installation_id, user_id: "balanced" }, {
      schema_version: 2,
      harness: "codex",
      date,
      observed_at: `${date}T02:00:00Z`,
      total_tokens: 100,
      models: [{ name: "model-a", total_tokens: 100 }],
      projects: [{ name: "project-a", total_tokens: 100 }],
    }, root);
  }

  await upsertUsageSample({ id: instA.installation_id, user_id: "balanced" }, {
    schema_version: 2,
    harness: "codex",
    date: "2026-09-30",
    observed_at: "2026-09-30T02:00:00Z",
    total_tokens: 200,
    models: [{ name: "model-a", total_tokens: 200 }],
    projects: [
      { name: "project-a", total_tokens: 80 },
      { name: "project-b", total_tokens: 60 },
      { name: "project-c", total_tokens: 60 },
    ],
  }, root);
  await upsertUsageSample({ id: instB.installation_id, user_id: "balanced" }, {
    schema_version: 2,
    harness: "cursor",
    date: "2026-09-30",
    observed_at: "2026-09-30T02:05:00Z",
    total_tokens: 100,
    models: [{ name: "model-b", total_tokens: 100 }],
    projects: [{ name: "project-b", total_tokens: 100 }],
  }, root);

  const achievements = await syncUserAchievements("balanced", "2026-09-30", root);
  assert.equal(achievements.find((item) => item.id === "light_multitasker").unlocked, true);
  assert.equal(achievements.find((item) => item.id === "all_round_route").unlocked, true);
  assert.equal(achievements.find((item) => item.id === "three_day_streak").unlocked, true);
});


test("achievement sync emits a bounded structured rhythm summary without affecting unlocks", async (t) => {
  const root = await withRoot(t, "denglema-rhythm-log-");
  await createWebUser({ display_name: "Logger", avatar_emoji: "🧘" }, root, {
    userId: "logger",
    recoveryCode: "LOGGER-USER",
  });
  const pair = await createPairingCode("logger", root, { code: "LOGGER-INSTALL" });
  const installation = await consumePairingCode(pair.code, "Logger device", root, {
    token: "logger-token",
    installationId: "logger-inst",
  });

  for (const [index, total] of [0, 6000, 12000, 18000, 24000, 30000].entries()) {
    await upsertUsageSample({ id: installation.installation_id, user_id: "logger" }, {
      schema_version: 2,
      harness: "codex",
      date: "2026-09-30",
      observed_at: new Date(Date.parse("2026-09-30T01:00:00Z") + index * 60 * 60_000).toISOString(),
      total_tokens: total,
      models: [],
      projects: [],
    }, root);
  }

  let summary = null;
  const achievements = await syncUserAchievements("logger", "2026-09-30", root, {
    timezone: "Asia/Shanghai",
    onRhythm: (value) => { summary = value; },
  });

  assert.equal(achievements.find((item) => item.id === "steady_cruise").unlocked, true);
  assert.equal(summary.user_id, "logger");
  assert.equal(summary.date, "2026-09-30");
  assert.equal(summary.timezone, "Asia/Shanghai");
  assert.equal(summary.sample_count, 6);
  assert.equal(summary.interval_count, 5);
  assert.equal(summary.coverage_minutes, 300);
  assert.equal(summary.active_tokens, 30000);
  assert.equal(summary.mean_rate_tpm, 100);
  assert.equal(summary.coefficient_of_variation, 0);
  assert.equal(summary.rhythm_eligible, true);
  assert.equal(summary.steady_cruise, true);
  assert.equal(summary.heartbeat_rider, false);
  assert.deepEqual(summary.playful_timing, {
    early_bird: false,
    night_ride: false,
    deep_night_rider: false,
    weekend_rider: false,
  });
  assert.ok(summary.newly_unlocked.includes("first_ride"));
  assert.ok(summary.newly_unlocked.includes("steady_cruise"));
});
