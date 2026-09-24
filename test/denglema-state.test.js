import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  authenticateInstallation,
  consumePairingCode,
  createPairingCode,
  readUserTotals,
  upsertUsageSample,
} from "../src/denglema-state.js";

test("pairing binds an installation to the internal user id", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "denglema-pair-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const pair = await createPairingCode("user-1", root, {
    code: "ABCD-EFGH",
    now: () => new Date("2026-09-24T00:00:00Z"),
  });
  assert.equal(pair.user_id, "user-1");

  const install = await consumePairingCode("ABCD-EFGH", "gpu-a", root, {
    token: "secret-a",
    installationId: "inst-a",
    now: () => new Date("2026-09-24T00:01:00Z"),
  });
  assert.equal(install.user_id, "user-1");
  assert.equal((await authenticateInstallation("secret-a", root)).id, "inst-a");
  assert.equal(await consumePairingCode("ABCD-EFGH", "again", root), null);
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