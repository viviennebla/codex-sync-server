import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import net from "node:net";
import { fileURLToPath } from "node:url";
import test from "node:test";

const appFile = new URL("../public/app.js", import.meta.url);
const serverFile = new URL("../src/server.js", import.meta.url);

async function freePort() {
  const socket = net.createServer();
  await new Promise((resolve, reject) => {
    socket.once("error", reject);
    socket.listen(0, "127.0.0.1", resolve);
  });
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  return port;
}

async function waitForHealth(url, child) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode != null) throw Error("server exited before layout smoke");
    try {
      if ((await fetch(url + "/health")).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw Error("layout smoke server not healthy");
}

test("homepage uses the shared DOM lane mapping and nearest-road pointer projection", async () => {
  const app = await readFile(appFile, "utf8");
  assert.match(app, /from "\.\/scene-layout\.js"/);
  assert.match(app, /const seasonalTrackLanes = visibleLaneIds\(layoutMode\)/);
  assert.match(app, /const trackLane = resolveVisualLane\(layoutMode, manualLane\)/);
  const pointerHandler = app.match(/function pointerOfficePosition\(event\) \{([\s\S]*?)\n\}/)?.[1];
  assert.ok(pointerHandler);
  assert.match(pointerHandler, /readLaneLayout\(stage, layoutMode\)/);
  assert.match(pointerHandler, /pointerToLayoutPosition\(layout, event/);
  assert.doesNotMatch(pointerHandler, /relativeY|0\.70|Math\.floor\(relativeY/);
  // The rider's new tap-vs-drag behavior must survive adapter integration.
  assert.match(app, /if \(distance <= 5\) return;/);
  assert.match(app, /stage\.setPointerCapture\(pointerId\)/);
  assert.match(app, /expected_layout_version: officeLayoutVersion/);
  assert.match(app, /scheduleAmbientDrift\(\)/);
  assert.match(app, /scheduleDirector\(\)/);
});

test("the browser can fetch the layout module through the server's allowlisted route", async (t) => {
  const port = await freePort();
  const baseUrl = "http://127.0.0.1:" + port;
  const child = spawn(process.execPath, [fileURLToPath(serverFile)], {
    env: {
      ...process.env,
      BIND: "127.0.0.1",
      PORT: String(port),
      DENGLEMA_BASE_URL: baseUrl,
      DENGLEMA_SESSION_SECRET: "layout-integration-test-secret",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => { if (child.exitCode == null) child.kill("SIGTERM"); });
  await waitForHealth(baseUrl, child);
  const [moduleRes, appRes, blockedRes] = await Promise.all([
    fetch(baseUrl + "/scene-layout.js"),
    fetch(baseUrl + "/app.js"),
    fetch(baseUrl + "/scene-layout-private.js"),
  ]);
  assert.equal(moduleRes.status, 200);
  assert.match(moduleRes.headers.get("content-type") || "", /javascript/);
  assert.match(await moduleRes.text(), /export function pointerToLayoutPosition/);
  assert.equal(appRes.status, 200);
  assert.match(await appRes.text(), /from "\.\/scene-layout\.js"/);
  assert.equal(blockedRes.status, 404);
});
