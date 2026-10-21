import assert from "node:assert/strict";
import { readFile, readdir, access } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { frameIndex, resolveSpriteState } from "../public/rider-runtime.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
const riderDir = join(root, "riders/presets/helmet-commuter");
const loadJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const parts = ["head", "body", "backpack", "arm_back", "arm_front", "leg_back", "leg_front"];

test("art manifest lists independent transparent resources and has no handwritten atlas crops", async () => {
  const catalog = await loadJson(join(root, "riders/manifest.json"));
  const preset = await loadJson(join(riderDir, "manifest.json"));
  const rig = await loadJson(join(root, preset.rig.slice(1)));
  assert.equal(catalog.default_preset, "helmet-commuter");
  assert.equal(preset.view, "side-right");
  assert.equal(preset.schema_version, 2);
  assert.equal(rig.view, "side-right");
  assert.deepEqual(Object.keys(preset.slots), ["head", "body", "backpack"]);
  assert.deepEqual(Object.keys(preset.limbs), ["arm_back", "arm_front", "leg_back", "leg_front"]);
  assert.deepEqual(new Set(rig.layer_order), new Set(parts));
  assert.doesNotMatch(JSON.stringify(preset), /"crop"|"atlas"|"x"|"y"|"width"|"height"/);
  const names = (await readdir(riderDir)).sort();
  assert.deepEqual(names, [...parts.map(name => name + ".webp"), "bike.svg", "manifest.json"].sort());
  for (const name of parts) {
    const path = (preset.slots[name] || preset.limbs[name]).slice(1);
    const file = await readFile(join(root, path));
    assert.equal(file.subarray(0, 4).toString("ascii"), "RIFF");
    assert.equal(file.subarray(8, 12).toString("ascii"), "WEBP");
    assert.ok(file.length > 200, name + " must not be an empty placeholder");
    const geometry = rig.slots[name] || rig.limbs[name];
    assert.ok(geometry.x >= 0 && geometry.y >= 0 && geometry.width > 0 && geometry.height > 0);
    assert.ok(geometry.x + geometry.width <= rig.canvas.width);
    assert.ok(geometry.y + geometry.height <= rig.canvas.height);
  }
});

test("rig owns all animation pivots, art manifest owns no pixel offsets", async () => {
  const rig = await loadJson(join(root, "riders/rigs/compact-side-right-v1.json"));
  for (const name of ["arm_back", "arm_front", "leg_back", "leg_front"]) {
    assert.equal(rig.limbs[name].pivot.length, 2);
    assert.ok(rig.limbs[name].pivot.every(Number.isFinite));
  }
  const runtime = await readFile(join(root, "rider-runtime.js"), "utf8");
  assert.doesNotMatch(runtime, /\.crop|atlasLayer|atlas\.webp|imageLayer\(/);
  assert.match(runtime, /rig\.layer_order/);
});

test("helmet rider supports bike mounting, pedaling, gliding, braking and walking emotions", () => {
  assert.equal(resolveSpriteState("bike", { mounting: true }), "bike_mount");
  assert.equal(resolveSpriteState("bike", {}), "bike_ride");
  assert.equal(resolveSpriteState("bike", { coasting: true }), "bike_glide");
  assert.equal(resolveSpriteState("bike", { tired: true }), "bike_brake");
  assert.equal(resolveSpriteState("bike", { bonking: true }), "bike_brake");
  assert.equal(resolveSpriteState("walk", { tired: true }), "tired");
  assert.equal(resolveSpriteState("walk", { celebrating: true }), "happy");
  assert.equal(resolveSpriteState("walk", { fast: true }), "focused");
  assert.equal(resolveSpriteState("walk", { idle: true }), "idle");
  assert.equal(resolveSpriteState("walk", {}), "walk");
});

test("animation frame selection wraps cleanly", () => {
  const states = { idle: { frames: 4, fps: 5 }, bike_ride: { frames: 6, fps: 10 } };
  assert.equal(frameIndex("idle", 0, states), 0);
  assert.equal(frameIndex("idle", 201, states), 1);
  assert.equal(frameIndex("idle", 800, states), 0);
  assert.equal(frameIndex("bike_ride", 599, states), 5);
  assert.equal(frameIndex("bike_ride", 600, states), 0);
});

test("retired art is absent and only the declared art paths are available", async () => {
  await assert.rejects(
    access(join(root, "../docs/assets/denglema/helmet-commuter-v01-design-board.svg")),
    { code: "ENOENT" }
  );
  await assert.rejects(
    access(join(riderDir, "atlas.webp")),
    { code: "ENOENT" }
  );
  const preset = await loadJson(join(riderDir, "manifest.json"));
  assert.doesNotMatch(JSON.stringify(preset), /ghost|witch|pumpkin_costume/);
  const server = await readFile(join(root, "../src/server.js"), "utf8");
  assert.match(server, /riderPartMatch/);
  assert.doesNotMatch(server, /helmet-commuter\/atlas\.webp/);
});
