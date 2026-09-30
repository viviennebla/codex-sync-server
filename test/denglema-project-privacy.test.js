import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  consumePairingCode,
  createPairingCode,
  upsertUsageSample,
} from "../src/denglema-state.js";

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForHealth(baseUrl, child) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode != null) throw new Error("server exited before health check");
    try {
      const response = await fetch(baseUrl + "/health");
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("server did not become healthy");
}

function sessionCookie(response) {
  return (response.headers.get("set-cookie") || "").split(";")[0];
}

test("project privacy API keeps raw names private and public views projected", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "denglema-project-privacy-http-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const port = await freePort();
  const baseUrl = "http://127.0.0.1:" + port;
  const serverPath = fileURLToPath(new URL("../src/server.js", import.meta.url));
  const child = spawn(process.execPath, [serverPath], {
    env: {
      ...process.env,
      PORT: String(port),
      BIND: "127.0.0.1",
      STATE_DIR: root,
      DENGLEMA_BASE_URL: baseUrl,
      DENGLEMA_SESSION_SECRET: "privacy-test-secret",
      DENGLEMA_TIMEZONE: "Asia/Shanghai",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => {
    if (child.exitCode == null) child.kill("SIGTERM");
  });
  await waitForHealth(baseUrl, child);

  assert.equal((await fetch(baseUrl + "/privacy")).status, 200);
  assert.equal((await fetch(baseUrl + "/privacy.js")).status, 200);

  const registerResponse = await fetch(baseUrl + "/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ display_name: "Privacy Rider", avatar_emoji: "🔒" }),
  });
  assert.equal(registerResponse.status, 201);
  const cookie = sessionCookie(registerResponse);
  const registration = await registerResponse.json();
  const userId = registration.user.user_id;

  const pair = await createPairingCode(userId, root, { code: "PRIVACY-HTTP" });
  const installation = await consumePairingCode(pair.code, "Privacy device", root, {
    token: "privacy-http-token",
    installationId: "privacy-http-inst",
  });
  await upsertUsageSample(
    { id: installation.installation_id, user_id: userId },
    {
      schema_version: 2,
      harness: "codex",
      date: "2026-09-30",
      observed_at: "2026-09-30T08:00:00Z",
      total_tokens: 300,
      models: [],
      projects: [
        { name: "secret-client", total_tokens: 200 },
        { name: "normal-project", total_tokens: 100 },
      ],
    },
    root,
  );

  assert.equal((await fetch(baseUrl + "/api/me/projects")).status, 401);

  const rawResponse = await fetch(baseUrl + "/api/me/projects?date=2026-09-30", {
    headers: { cookie },
  });
  assert.equal(rawResponse.status, 200);
  const raw = await rawResponse.json();
  assert.deepEqual(raw.projects.map((row) => row.name), [
    "secret-client",
    "normal-project",
  ]);

  const hideResponse = await fetch(baseUrl + "/api/me/project-privacy", {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ project: "secret-client", mode: "hidden" }),
  });
  assert.equal(hideResponse.status, 200);

  const aliasResponse = await fetch(baseUrl + "/api/me/project-privacy", {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      project: "normal-project",
      mode: "alias",
      alias: "公开项目",
    }),
  });
  assert.equal(aliasResponse.status, 200);

  const detailResponse = await fetch(
    baseUrl + "/api/riders/" + encodeURIComponent(userId) + "?date=2026-09-30",
    { headers: { cookie } },
  );
  assert.equal(detailResponse.status, 200);
  const detail = await detailResponse.json();
  assert.deepEqual(detail.projects, [
    { name: "公开项目", total_tokens: 100 },
  ]);
  assert.equal(JSON.stringify(detail).includes("secret-client"), false);
  assert.equal(JSON.stringify(detail).includes("normal-project"), false);

  const boardResponse = await fetch(
    baseUrl + "/api/leaderboards/dimensions?date=2026-09-30",
  );
  assert.equal(boardResponse.status, 200);
  const board = await boardResponse.json();
  assert.equal(board.projects_have_private_entries, true);
  assert.deepEqual(board.projects.map((row) => row.name), ["公开项目"]);
  assert.equal(JSON.stringify(board).includes("secret-client"), false);
  assert.equal(JSON.stringify(board).includes("normal-project"), false);

  const settingsResponse = await fetch(baseUrl + "/api/me/projects?date=2026-09-30", {
    headers: { cookie },
  });
  assert.equal(settingsResponse.status, 200);
  const settings = await settingsResponse.json();
  assert.equal(settings.projects.find((row) => row.name === "secret-client").mode, "hidden");
  assert.equal(settings.projects.find((row) => row.name === "normal-project").alias, "公开项目");
});
