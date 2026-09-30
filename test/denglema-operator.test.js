import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  operatorTokenAuthorized,
  publishOperatorAnnouncement,
  readOperatorAudit,
} from "../src/denglema-operator.js";
import { readDenglemaEvents } from "../src/denglema-social.js";

async function withRoot(t, prefix) {
  const root = await mkdtemp(join(tmpdir(), prefix));
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });
  return root;
}

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

test("operator token auth is opt-in and bearer-only", () => {
  assert.equal(operatorTokenAuthorized("", ""), false);
  assert.equal(operatorTokenAuthorized("Bearer secret", ""), false);
  assert.equal(operatorTokenAuthorized("", "secret"), false);
  assert.equal(operatorTokenAuthorized("Basic secret", "secret"), false);
  assert.equal(operatorTokenAuthorized("Bearer wrong", "secret"), false);
  assert.equal(operatorTokenAuthorized("Bearer secret", "secret"), true);
});

test("operator announcement is idempotent, audited, and expires by ttl", async (t) => {
  const root = await withRoot(t, "denglema-operator-");
  const now = new Date("2026-09-30T08:00:00Z");
  const payload = {
    idempotency_key: "web-social-transports-2026-09",
    message: "蹬了吗更新 · 支持在线 24h 留言和更多交通工具",
    emoji: "💬",
    href: "/plugin#web-social-transports",
    ttl_hours: 1,
  };

  const first = await publishOperatorAnnouncement(payload, root, { now: () => now });
  const replay = await publishOperatorAnnouncement(payload, root, {
    now: () => new Date("2026-09-30T08:05:00Z"),
  });

  assert.equal(first.created, true);
  assert.equal(replay.created, false);
  assert.equal(replay.event_id, first.event_id);

  await assert.rejects(
    publishOperatorAnnouncement({ ...payload, message: "不同内容" }, root, {
      now: () => new Date("2026-09-30T08:06:00Z"),
    }),
    /different content/,
  );

  const during = await readDenglemaEvents(root, {
    now: () => new Date("2026-09-30T08:30:00Z"),
    limit: 50,
  });
  const event = during.find((item) => item.id === first.event_id);
  assert.ok(event);
  assert.equal(event.actor?.type, "ai_operator");
  assert.equal(event.meta?.source, "ai_operator");
  assert.equal(event.meta?.href, "/plugin#web-social-transports");

  const expired = await readDenglemaEvents(root, {
    now: () => new Date("2026-09-30T09:01:00Z"),
    limit: 50,
  });
  assert.equal(expired.some((item) => item.id === first.event_id), false);

  const audit = await readOperatorAudit(root);
  assert.equal(audit.length, 1);
  assert.equal(audit[0].actor, "ai_operator");
  assert.equal(audit[0].action, "publish_announcement");
  assert.equal(audit[0].event_id, first.event_id);
  assert.equal(audit[0].idempotency_key, payload.idempotency_key);
});

test("operator announcement rejects unsafe runtime content", async (t) => {
  const root = await withRoot(t, "denglema-operator-validation-");
  const base = {
    idempotency_key: "safe-key",
    message: "hello",
  };

  await assert.rejects(
    publishOperatorAnnouncement({ ...base, href: "https://example.com" }, root),
    /local path/,
  );
  await assert.rejects(
    publishOperatorAnnouncement({ ...base, idempotency_key: "../bad" }, root),
    /Invalid idempotency_key/,
  );
  await assert.rejects(
    publishOperatorAnnouncement({ ...base, ttl_hours: 25 }, root),
    /ttl_hours/,
  );
});

test("operator HTTP API requires the dedicated token and replays idempotently", async (t) => {
  const root = await withRoot(t, "denglema-operator-http-");
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
      DENGLEMA_SESSION_SECRET: "test-session-secret",
      DENGLEMA_OPERATOR_TOKEN: "operator-secret",
      DASHBOARD_TOKEN: "legacy-dashboard-secret",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => {
    if (child.exitCode == null) child.kill("SIGTERM");
  });
  await waitForHealth(baseUrl, child);

  const payload = {
    idempotency_key: "operator-http-test",
    message: "AI Operator API online",
    emoji: "🤖",
    href: "/plugin",
    ttl_hours: 24,
  };
  const request = async (authorization) => fetch(baseUrl + "/api/operator/announcements", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(authorization ? { authorization } : {}),
    },
    body: JSON.stringify(payload),
  });

  assert.equal((await request()).status, 401);
  assert.equal((await request("Bearer legacy-dashboard-secret")).status, 401);
  assert.equal((await request("Bearer wrong")).status, 401);

  const createdResponse = await request("Bearer operator-secret");
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json();
  assert.equal(created.ok, true);
  assert.equal(created.created, true);

  const replayResponse = await request("Bearer operator-secret");
  assert.equal(replayResponse.status, 200);
  const replay = await replayResponse.json();
  assert.equal(replay.created, false);
  assert.equal(replay.event_id, created.event_id);

  const conflictResponse = await fetch(baseUrl + "/api/operator/announcements", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer operator-secret",
    },
    body: JSON.stringify({ ...payload, message: "changed content" }),
  });
  assert.equal(conflictResponse.status, 400);

  const auditResponse = await fetch(baseUrl + "/api/operator/audit", {
    headers: { authorization: "Bearer operator-secret" },
  });
  assert.equal(auditResponse.status, 200);
  const audit = await auditResponse.json();
  assert.equal(audit.actor, "ai_operator");
  assert.equal(audit.audit.length, 1);
  assert.equal(audit.audit[0].event_id, created.event_id);

  const feedResponse = await fetch(baseUrl + "/api/events");
  assert.equal(feedResponse.status, 200);
  const feed = await feedResponse.json();
  const event = feed.events.find((item) => item.id === created.event_id);
  assert.ok(event);
  assert.equal(event.actor?.type, "ai_operator");
  assert.equal(event.meta?.source, "ai_operator");
});
