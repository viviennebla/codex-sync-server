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
  readDenglemaOfficeLayoutVersion,
  readDimensionLeaderboard,
  recoverWebUser,
  readUserInstallations,
  readUserTotals,
  revokeUserInstallation,
  upsertUsageSample,
  updateWebUserAvatar,
  updateWebUserEmoji,
  updateWebUserEquippedAchievement,
  updateWebUserOfficePosition,
  updateWebUserQuotaEmotion,
  updateWebUserSlogans,
  updateWebUserTransport,
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

test("rider transport is cosmetic, validated, and persisted", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "denglema-transport-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const created = await createWebUser({
    display_name: "Surfer",
    avatar_emoji: "🏄",
  }, root, {
    userId: "usr-transport",
    recoveryCode: "TRANSPORT-1234",
    now: () => new Date("2026-09-30T00:00:00Z"),
  });
  assert.equal(created.user.transport, "bike");

  const updated = await updateWebUserTransport(
    "usr-transport",
    "surf",
    root,
    { now: () => new Date("2026-09-30T00:01:00Z") },
  );
  assert.equal(updated.transport, "surf");
  assert.equal(
    (await readDenglemaUser("usr-transport", root)).transport,
    "surf",
  );

  for (const transport of ["bike", "scooter", "skateboard", "walk", "surf", "skate"]) {
    assert.equal(
      (await updateWebUserTransport("usr-transport", transport, root)).transport,
      transport,
    );
  }

  await assert.rejects(
    updateWebUserTransport("usr-transport", "rocket", root),
    /transport must be one of/,
  );
});

test("quota emotion is cosmetic, defaults to sweat, and persists", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "denglema-quota-emotion-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const created = await createWebUser({
    display_name: "Anxious Rider",
    avatar_emoji: "😪",
  }, root, {
    userId: "usr-quota-emotion",
    recoveryCode: "QUOTA-EMOTION-1234",
    now: () => new Date("2026-09-30T08:00:00Z"),
  });
  assert.equal(created.user.quota_emotion, "sweat");

  for (const quotaEmotion of ["sweat", "gloom", "sleepy"]) {
    const updated = await updateWebUserQuotaEmotion(
      "usr-quota-emotion",
      quotaEmotion,
      root,
      { now: () => new Date("2026-09-30T08:01:00Z") },
    );
    assert.equal(updated.quota_emotion, quotaEmotion);
    assert.equal(
      (await readDenglemaUser("usr-quota-emotion", root)).quota_emotion,
      quotaEmotion,
    );
  }

  await assert.rejects(
    updateWebUserQuotaEmotion("usr-quota-emotion", "rage", root),
    /quota_emotion must be one of/,
  );
});

test("rider slogans are bounded, deduplicated, and persisted", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "denglema-slogans-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  await createWebUser({
    display_name: "Catchphrase",
    avatar_emoji: "🙂",
  }, root, {
    userId: "usr-slogans",
    recoveryCode: "SLOGAN-1234",
    now: () => new Date("2026-09-30T00:00:00Z"),
  });

  const updated = await updateWebUserSlogans(
    "usr-slogans",
    [" 今天不卷 ", "先蹬两下", "今天不卷", ""],
    root,
    { now: () => new Date("2026-09-30T00:01:00Z") },
  );
  assert.deepEqual(updated.slogans, ["今天不卷", "先蹬两下"]);
  assert.deepEqual((await readDenglemaUser("usr-slogans", root)).slogans, ["今天不卷", "先蹬两下"]);

  assert.deepEqual((await updateWebUserSlogans("usr-slogans", [], root)).slogans, []);
  await assert.rejects(
    updateWebUserSlogans("usr-slogans", Array.from({ length: 9 }, (_, i) => "s" + i), root),
    /at most 8/,
  );
  await assert.rejects(
    updateWebUserSlogans("usr-slogans", ["太".repeat(29)], root),
    /at most 28 characters/,
  );
});

test("rider office anchors use a simple optimistic layout version", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "denglema-office-position-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  for (const [id, code] of [["usr-drag-a", "DRAG-A"], ["usr-drag-b", "DRAG-B"]]) {
    await createWebUser({
      display_name: id,
      avatar_emoji: "🙂",
    }, root, {
      userId: id,
      recoveryCode: code,
      now: () => new Date("2026-09-30T00:00:00Z"),
    });
  }

  assert.equal(await readDenglemaOfficeLayoutVersion(root), 0);

  const first = await updateWebUserOfficePosition(
    "usr-drag-a",
    { lane: 2, x: 50 },
    0,
    root,
  );
  assert.deepEqual(first.user.office_position, { lane: 2, x: 50 });
  assert.equal(first.layout_version, 1);

  await assert.rejects(
    updateWebUserOfficePosition("usr-drag-b", { lane: 2, x: 51 }, 0, root),
    (error) => error?.code === "DENGLEMA_LAYOUT_CONFLICT" && error.layout_version === 1,
  );

  // Slight overlap is allowed by persistence; the client only blocks very
  // close centers. The version, not a heavyweight transaction, arbitrates races.
  const second = await updateWebUserOfficePosition(
    "usr-drag-b",
    { lane: 2, x: 51 },
    1,
    root,
  );
  assert.deepEqual(second.user.office_position, { lane: 2, x: 51 });
  assert.equal(second.layout_version, 2);
  assert.equal(await readDenglemaOfficeLayoutVersion(root), 2);

  await assert.rejects(
    updateWebUserOfficePosition("usr-drag-a", { lane: 5, x: 50 }, 2, root),
    /lane must be 1-4/,
  );
  await assert.rejects(
    updateWebUserOfficePosition("usr-drag-a", { lane: 1, x: 90 }, 2, root),
    /x must be between/,
  );
});

test("pairing marks only the rider's first installation as first", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "denglema-first-install-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const pairA = await createPairingCode("user-first", root, {
    code: "FIRST-A",
    now: () => new Date("2026-09-29T00:00:00Z"),
  });
  const first = await consumePairingCode(pairA.code, "Cursor", root, {
    token: "first-a",
    installationId: "inst-first-a",
    now: () => new Date("2026-09-29T00:01:00Z"),
  });
  assert.equal(first.first_user_installation, true);

  const pairB = await createPairingCode("user-first", root, {
    code: "FIRST-B",
    now: () => new Date("2026-09-29T00:02:00Z"),
  });
  const second = await consumePairingCode(pairB.code, "Codex", root, {
    token: "first-b",
    installationId: "inst-first-b",
    now: () => new Date("2026-09-29T00:03:00Z"),
  });
  assert.equal(second.first_user_installation, false);
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

test("schema v2 stores remaining quota and projects user pressure from the tightest window", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "denglema-quota-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const sample = validateUsageSample({
    schema_version: 2,
    harness: "codex",
    date: "2026-09-30",
    observed_at: "2026-09-30T07:00:00Z",
    total_tokens: 123,
    models: [],
    projects: [],
    usage_limits: {
      updated_at: "2026-09-30T06:59:59Z",
      primary: {
        used_percent: 84,
        remaining_percent: 16,
        window_minutes: 300,
        resets_at: "2026-09-30T09:00:00Z",
      },
      secondary: {
        used_percent: 55,
        remaining_percent: 45,
        window_minutes: 10080,
        resets_at: "2026-10-05T00:00:00Z",
      },
    },
  });
  assert.equal(sample.usage_limits.primary.remaining_percent, 16);

  await upsertUsageSample({ id: "inst-quota", user_id: "user-quota" }, sample, root);
  const totals = await readUserTotals("2026-09-30", root);
  assert.deepEqual(totals, [{
    user_id: "user-quota",
    total_tokens: 123,
    installations: 1,
    models: [],
    projects: [],
    quota_remaining_percent: 16,
    quota_pressure: 0.84,
    quota_updated_at: "2026-09-30T06:59:59.000Z",
  }]);

  assert.throws(() => validateUsageSample({
    schema_version: 2,
    harness: "codex",
    date: "2026-09-30",
    observed_at: "2026-09-30T07:00:00Z",
    total_tokens: 123,
    models: [],
    projects: [],
    usage_limits: {
      updated_at: "2026-09-30T06:59:59Z",
      primary: {
        used_percent: 90,
        remaining_percent: 30,
      },
    },
  }), /used \+ remaining must equal 100/);
});

test("freshest installation limit wins over a stale lower remaining quota", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "denglema-quota-freshness-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const base = {
    schema_version: 2,
    harness: "codex",
    date: "2026-09-30",
    models: [],
    projects: [],
  };
  await upsertUsageSample({ id: "inst-old", user_id: "user-quota-fresh" }, {
    ...base,
    observed_at: "2026-09-30T06:00:00Z",
    total_tokens: 100,
    usage_limits: {
      updated_at: "2026-09-30T05:59:59Z",
      primary: { remaining_percent: 2 },
    },
  }, root);
  await upsertUsageSample({ id: "inst-new", user_id: "user-quota-fresh" }, {
    ...base,
    observed_at: "2026-09-30T07:00:00Z",
    total_tokens: 100,
    usage_limits: {
      updated_at: "2026-09-30T06:59:59Z",
      primary: { remaining_percent: 64 },
    },
  }, root);

  const [total] = await readUserTotals("2026-09-30", root);
  assert.equal(total.quota_remaining_percent, 64);
  assert.equal(total.quota_pressure, 0.36);
  assert.equal(total.quota_updated_at, "2026-09-30T06:59:59.000Z");
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
