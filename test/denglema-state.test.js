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
  recoverWebUser,
  readUserInstallations,
  readUserTotals,
  revokeUserInstallation,
  upsertUsageSample,
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
    { user_id: "user-1", total_tokens: 170, installations: 2 },
    { user_id: "user-2", total_tokens: 60, installations: 1 },
  ]);
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
