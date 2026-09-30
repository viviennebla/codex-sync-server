import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import net from "node:net";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  DENGLEMA_UPDATES,
  publicDenglemaUpdates,
} from "../src/denglema-updates.js";

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

test("update registry is stable, unique, newest-first, and uses safe internal links", () => {
  assert.ok(DENGLEMA_UPDATES.length >= 8);
  const ids = new Set();
  let previousDate = "9999-12-31";

  for (const item of DENGLEMA_UPDATES) {
    assert.match(item.id, /^[a-z0-9][a-z0-9-]*$/);
    assert.equal(ids.has(item.id), false);
    ids.add(item.id);

    assert.match(item.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(item.date <= previousDate);
    previousDate = item.date;

    assert.ok(item.title);
    assert.ok(item.summary);
    assert.ok(item.category);
    assert.ok(item.emoji);

    if (item.pr != null) {
      assert.equal(Number.isInteger(item.pr), true);
      assert.ok(item.pr > 0);
    }
    if (item.href) {
      assert.equal(item.href.startsWith("/"), true);
      assert.equal(item.href.startsWith("//"), false);
    }
  }

  const publicCopy = publicDenglemaUpdates();
  assert.deepEqual(publicCopy, DENGLEMA_UPDATES);
  publicCopy[0].title = "mutated";
  assert.notEqual(publicCopy[0].title, DENGLEMA_UPDATES[0].title);
});

test("update log page and API are public and consistent", async (t) => {
  const port = await freePort();
  const baseUrl = "http://127.0.0.1:" + port;
  const serverPath = fileURLToPath(new URL("../src/server.js", import.meta.url));
  const child = spawn(process.execPath, [serverPath], {
    env: {
      ...process.env,
      PORT: String(port),
      BIND: "127.0.0.1",
      DENGLEMA_BASE_URL: baseUrl,
      DENGLEMA_SESSION_SECRET: "updates-test-secret",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  t.after(() => {
    if (child.exitCode == null) child.kill("SIGTERM");
  });

  await waitForHealth(baseUrl, child);

  const [page, script, api] = await Promise.all([
    fetch(baseUrl + "/updates"),
    fetch(baseUrl + "/updates.js"),
    fetch(baseUrl + "/api/updates"),
  ]);

  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-type") || "", /text\/html/);
  assert.equal(script.status, 200);
  assert.match(script.headers.get("content-type") || "", /javascript/);
  assert.equal(api.status, 200);

  const payload = await api.json();
  assert.deepEqual(payload.updates, DENGLEMA_UPDATES);
  assert.equal(payload.updates[0].id, "update-log");
});


test("top navigation exposes exactly one update log entry per page", async () => {
  for (const file of ["index.html", "profile.html", "plugin.html"]) {
    const html = await readFile(new URL("../public/" + file, import.meta.url), "utf8");
    const matches = html.match(/href="\/updates"/g) || [];
    assert.equal(matches.length, 1, file + " should contain exactly one /updates link");
  }
});
