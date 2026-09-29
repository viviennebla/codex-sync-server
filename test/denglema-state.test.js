import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  authenticateInstallation,
  consumePairingCode,
  createPairingCode,
  createWebUser,
  readPairingCodeStatus,
  readDenglemaUser,
  readDimensionLeaderboard,
  recoverWebUser,
  readUserInstallations,
  readUserTotals,
  revokeUserInstallation,
  upsertUsageSample,
  updateWebUserAvatar,
  updateWebUserEmoji,
  updateWebUserEquippedAchievement,
  validateUsageSample,
} from "../src/denglema-state.js";

test("web identity can be created and recovered without storing the raw recovery code", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "denglema-web-user-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const created = await createWebUser({
    display_name: "Alice",
    avatar_emoji: "🐱",
  }, root, {
    userId: "usr-web",
    recoveryCode: "DGLM-1234-5678-ABCD",
    now: () => new Date("2026-09-28T00:00:00Z"),
  });
  assert.equal(created.user.id, "usr-web");
  assert.equal(created.user.display_name, "Alice");
  assert.equal(created.user.avatar_emoji, "🐱");
  assert.equal(created.recovery_code, "DGLM-1234-5678-ABCD");

  const userStore = await import("node:fs/promises").then(({ readFile }) =>
    readFile(join(root, "denglema", "users.json"), "utf8"));
  assert.equal(userStore.includes("DGLM-1234-5678-ABCD"), false);

  const recovered = await recoverWebUser("dglm 1234 5678 abcd", root, {
    now: () => new Date("2026-09-28T01:00:00Z"),
  });
  assert.equal(recovered.id, "usr-web");
  assert.equal(recovered.display_name, "Alice");
  assert.equal(recovered.last_login_at, "2026-09-28T01:00:00.000Z");
  assert.equal(await recoverWebUser("WRONG-CODE", root), null);
});

test("rider avatar can be updated and restored to emoji fallback", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "denglema-avatar-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  await createWebUser({
    display_name: "Avatar Test",
    avatar_emoji: "🐙",
  }, root, {
    userId: "usr-avatar",
    recoveryCode: "AVATAR-1234-5678",
    now: () => new Date("2026-09-29T00:00:00Z"),
  });

  const updated = await updateWebUserAvatar(
    "usr-avatar",
    "/api/avatars/usr-avatar.jpg?v=1",
    root,
    { now: () => new Date("2026-09-29T00:01:00Z") },
  );
  assert.equal(updated.avatar_url, "/api/avatars/usr-avatar.jpg?v=1");

  const reread = await readDenglemaUser("usr-avatar", root);
  assert.equal(reread.avatar_url, "/api/avatars/usr-avatar.jpg?v=1");
  assert.equal(reread.avatar_emoji, "🐙");

  const restored = await updateWebUserAvatar(
    "usr-avatar",
    null,
    root,
    { now: () => new Date("2026-09-29T00:02:00Z") },
  );
  assert.equal(restored.avatar_url, null);
  assert.equal(restored.avatar_emoji, "🐙");
});

test("rider can change emoji and persist an equipped achievement preference", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "denglema-profile-prefs-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  await createWebUser({
    display_name: "Prefs",
    avatar_emoji: "🚴",
  }, root, {
    userId: "usr-prefs",
    recoveryCode: "PREFS-1234",
    now: () => new Date("2026-09-29T00:00:00Z"),
  });
  await updateWebUserAvatar("usr-prefs", "/api/avatars/usr-prefs.jpg?v=1", root);
  const emoji = await updateWebUserEmoji("usr-prefs", "🐙", root);
  assert.equal(emoji.avatar_emoji, "🐙");
  assert.equal(emoji.avatar_url, null);

  const equipped = await updateWebUserEquippedAchievement("usr-prefs", "million_day", root);
  assert.equal(equipped.equipped_achievement_id, "million_day");
  const cleared = await updateWebUserEquippedAchievement("usr-prefs", null, root);
  assert.equal(cleared.equipped_achievement_id, null);
});

test("schema v2 accepts bounded harness metadata", () => {
  const sample = validateUsageSample({
    schema_version: 2,
    harness: "Cursor",
    date: "2026-09-29",
    observed_at: "2026-09-29T07:00:00Z",
    total_tokens: 123,
    models: [],
    projects: [],
  });
  assert.equal(sample.harness, "cursor");

  assert.throws(() => validateUsageSample({
    schema_version: 2,
    harness: "/home/user/.cursor",
    date: "2026-09-29",
    observed_at: "2026-09-29T07:00:00Z",
    total_tokens: 123,
    models: [],
    projects: [],
  }), /Invalid harness/);
});

test("pairing binds an installation to the internal user id", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "denglema-pair-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const pair = await createPairingCode("user-1", root, {
    code: "ABCD-EFGH",
    now: () => new Date("2026-09-24T00:00:00Z"),
  });
  assert.equal(pair.user_id, "user-1");
  assert.equal(pair.status, "pending");
  assert.deepEqual(
    await readPairingCodeStatus("ABCD-EFGH", "user-1", root, {
      now: () => new Date("2026-09-24T00:00:30Z"),
    }),
    { status: "pending", expires_at: pair.expires_at },
  );
  assert.equal(await readPairingCodeStatus("ABCD-EFGH", "user-2", root), null);

  const install = await consumePairingCode("ABCD-EFGH", "gpu-a", root, {
    token: "secret-a",
    installationId: "inst-a",
    now: () => new Date("2026-09-24T00:01:00Z"),
  });
  assert.equal(install.user_id, "user-1");
  assert.equal((await authenticateInstallation("secret-a", root)).id, "inst-a");
  assert.deepEqual(
    await readPairingCodeStatus("ABCD-EFGH", "user-1", root),
    {
      status: "consumed",
      installation_id: "inst-a",
      consumed_at: "2026-09-24T00:01:00.000Z",
    },
  );
  assert.equal(await consumePairingCode("ABCD-EFGH", "again", root), null);
});

test("expired pairing code remains observable to its user", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "denglema-pair-expired-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const pair = await createPairingCode("user-1", root, {
    code: "OLD-CODE",
    ttlMs: 60_000,
    now: () => new Date("2026-09-24T00:00:00Z"),
  });

  assert.deepEqual(
    await readPairingCodeStatus("OLD-CODE", "user-1", root, {
      now: () => new Date("2026-09-24T00:02:00Z"),
    }),
    { status: "expired", expires_at: pair.expires_at },
  );
});

test("cumulative samples are idempotent and aggregate multiple installations by user", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "denglema-usage-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const installA = { id: "inst-a", user_id: "user-1" };
  const installB = { id: "inst-b", user_id: "user-1" };
  const installC = { id: "inst-c", user_id: "user-2" };
  const sample = (total, minute) => ({
    schema_version: 1,
    date: "2026-09-24",
    observed_at: `2026-09-24T00:${String(minute).padStart(2, "0")}:00Z`,
    total_tokens: total,
  });

  await upsertUsageSample(installA, sample(100, 1), root);
  await upsertUsageSample(installA, sample(100, 2), root);
  await upsertUsageSample(installA, sample(120, 3), root);
  const reset = await upsertUsageSample(installA, sample(80, 4), root);
  assert.equal(reset.accepted_total, 120);
  assert.equal(reset.reset_detected, true);

  await upsertUsageSample(installB, sample(50, 5), root);
  await upsertUsageSample(installC, sample(60, 6), root);

  const totals = await readUserTotals("2026-09-24", root);
  assert.deepEqual(totals, [
    { user_id: "user-1", total_tokens: 170, installations: 2, models: [], projects: [] },
    { user_id: "user-2", total_tokens: 60, installations: 1, models: [], projects: [] },
  ]);
});


test("schema v2 keeps model and project breakdowns cumulative per installation and aggregated per user", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "denglema-breakdown-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const installA = { id: "inst-a", user_id: "user-1" };
  const installB = { id: "inst-b", user_id: "user-1" };

  await upsertUsageSample(installA, {
    schema_version: 2,
    date: "2026-09-28",
    observed_at: "2026-09-28T01:00:00Z",
    total_tokens: 100,
    models: [
      { name: "gpt-5.6-sol", total_tokens: 70 },
      { name: "gpt-5.6-luna", total_tokens: 30 },
    ],
    projects: [
      { name: "vimo-sop", total_tokens: 60 },
      { name: "codex-family", total_tokens: 40 },
    ],
  }, root);

  await upsertUsageSample(installA, {
    schema_version: 2,
    date: "2026-09-28",
    observed_at: "2026-09-28T02:00:00Z",
    total_tokens: 130,
    models: [
      { name: "gpt-5.6-sol", total_tokens: 90 },
      { name: "gpt-5.6-luna", total_tokens: 40 },
    ],
    projects: [
      { name: "vimo-sop", total_tokens: 80 },
      { name: "codex-family", total_tokens: 50 },
    ],
  }, root);

  await upsertUsageSample(installB, {
    schema_version: 2,
    date: "2026-09-28",
    observed_at: "2026-09-28T02:05:00Z",
    total_tokens: 50,
    models: [{ name: "gpt-5.6-sol", total_tokens: 50 }],
    projects: [{ name: "vimo-sop", total_tokens: 50 }],
  }, root);

  const totals = await readUserTotals("2026-09-28", root);
  assert.deepEqual(totals, [{
    user_id: "user-1",
    total_tokens: 180,
    installations: 2,
    models: [
      { name: "gpt-5.6-sol", total_tokens: 140 },
      { name: "gpt-5.6-luna", total_tokens: 40 },
    ],
    projects: [
      { name: "vimo-sop", total_tokens: 130 },
      { name: "codex-family", total_tokens: 50 },
    ],
  }]);
});

test("user installations expose today's per-device token totals without credentials", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "denglema-installations-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const pairA = await createPairingCode("user-1", root, {
    code: "PAIR-A",
    now: () => new Date("2026-09-28T00:00:00Z"),
  });
  const a = await consumePairingCode(pairA.code, "Windows Laptop", root, {
    token: "secret-a",
    installationId: "inst-a",
    now: () => new Date("2026-09-28T00:01:00Z"),
  });
  const pairB = await createPairingCode("user-1", root, {
    code: "PAIR-B",
    now: () => new Date("2026-09-28T00:02:00Z"),
  });
  const b = await consumePairingCode(pairB.code, "WSL", root, {
    token: "secret-b",
    installationId: "inst-b",
    now: () => new Date("2026-09-28T00:03:00Z"),
  });

  await upsertUsageSample(
    { id: a.installation_id, user_id: "user-1" },
    {
      schema_version: 1,
      date: "2026-09-28",
      observed_at: "2026-09-28T01:00:00Z",
      total_tokens: 120,
    },
    root,
  );
  await upsertUsageSample(
    { id: b.installation_id, user_id: "user-1" },
    {
      schema_version: 1,
      date: "2026-09-28",
      observed_at: "2026-09-28T01:05:00Z",
      total_tokens: 80,
    },
    root,
  );

  const devices = await readUserInstallations("user-1", "2026-09-28", root);
  assert.deepEqual(devices.map((device) => ({
    id: device.id,
    name: device.name,
    today_tokens: device.today_tokens,
    has_today_sample: device.has_today_sample,
  })), [
    { id: "inst-a", name: "Windows Laptop", today_tokens: 120, has_today_sample: true },
    { id: "inst-b", name: "WSL", today_tokens: 80, has_today_sample: true },
  ]);
  assert.equal(JSON.stringify(devices).includes("secret-a"), false);
});

test("user can revoke only their own installation and the token stops authenticating", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "denglema-revoke-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const pair = await createPairingCode("user-1", root, {
    code: "REVOKE-ME",
    now: () => new Date("2026-09-28T00:00:00Z"),
  });
  await consumePairingCode(pair.code, "Old Laptop", root, {
    token: "revoke-secret",
    installationId: "inst-revoke",
    now: () => new Date("2026-09-28T00:01:00Z"),
  });

  assert.equal(
    await revokeUserInstallation("user-2", "inst-revoke", root),
    null,
  );
  assert.notEqual(await authenticateInstallation("revoke-secret", root), null);

  const revoked = await revokeUserInstallation("user-1", "inst-revoke", root, {
    now: () => new Date("2026-09-28T02:00:00Z"),
  });
  assert.deepEqual(revoked, {
    id: "inst-revoke",
    name: "Old Laptop",
    revoked_at: "2026-09-28T02:00:00.000Z",
  });
  assert.equal(await authenticateInstallation("revoke-secret", root), null);
  assert.deepEqual(
    await readUserInstallations("user-1", "2026-09-28", root),
    [],
  );
});

test("dimension leaderboard aggregates v2 breakdowns and reports coverage", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "denglema-dimensions-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  for (const [id, name, emoji] of [
    ["user-a", "Alice", "🐱"],
    ["user-b", "Bob", "🐶"],
    ["user-c", "Carol", "🐼"],
  ]) {
    await createWebUser({ display_name: name, avatar_emoji: emoji }, root, {
      userId: id,
      recoveryCode: "RECOVERY-" + id,
    });
  }

  async function install(userId, code, installationId) {
    await createPairingCode(userId, root, { code });
    return consumePairingCode(code, installationId, root, {
      token: "token-" + installationId,
      installationId,
    });
  }

  const a = await install("user-a", "PAIR-A-DIM", "inst-a-dim");
  const b = await install("user-b", "PAIR-B-DIM", "inst-b-dim");
  const c = await install("user-c", "PAIR-C-DIM", "inst-c-dim");

  await upsertUsageSample(
    { id: a.installation_id, user_id: "user-a" },
    {
      schema_version: 2,
      date: "2026-09-28",
      observed_at: "2026-09-28T08:00:00Z",
      total_tokens: 1000,
      models: [
        { name: "gpt-5.6-luna", total_tokens: 600 },
        { name: "gpt-5.6-sol", total_tokens: 400 },
      ],
      projects: [{ name: "alpha", total_tokens: 700 }],
    },
    root,
  );
  await upsertUsageSample(
    { id: b.installation_id, user_id: "user-b" },

    {
      schema_version: 2,
      date: "2026-09-28",
      observed_at: "2026-09-28T08:05:00Z",
      total_tokens: 500,
      models: [{ name: "gpt-5.6-luna", total_tokens: 300 }],
      projects: [{ name: "alpha", total_tokens: 200 }],
    },
    root,
  );
  await upsertUsageSample(
    { id: c.installation_id, user_id: "user-c" },
    {
      schema_version: 1,
      date: "2026-09-28",
      observed_at: "2026-09-28T08:10:00Z",
      total_tokens: 250,
    },
    root,
  );

  const board = await readDimensionLeaderboard("2026-09-28", root);
  assert.equal(board.total_tokens, 1750);
  assert.equal(board.covered_tokens, 1500);

  assert.equal(board.installations, 3);
  assert.equal(board.v2_installations, 2);
  assert.equal(board.coverage_ratio, 1500 / 1750);
  assert.deepEqual(board.models[0], {
    name: "gpt-5.6-luna",
    total_tokens: 900,
    contributors: [
      { user_id: "user-a", display_name: "Alice", avatar_emoji: "🐱", total_tokens: 600 },
      { user_id: "user-b", display_name: "Bob", avatar_emoji: "🐶", total_tokens: 300 },
    ],
  });
  assert.deepEqual(board.projects[0], {
    name: "alpha",
    total_tokens: 900,
    contributors: [
      { user_id: "user-a", display_name: "Alice", avatar_emoji: "🐱", total_tokens: 700 },
      { user_id: "user-b", display_name: "Bob", avatar_emoji: "🐶", total_tokens: 200 },
    ],
  });
});
