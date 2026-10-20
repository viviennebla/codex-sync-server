import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { frameIndex, resolveSpriteState } from "../public/rider-runtime.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
const riderDir = join(root, "riders/presets/helmet-commuter");
const loadJson = async (path) => JSON.parse(await readFile(path, "utf8"));

test("default character uses approved transparent atlas and independent head/body/backpack slots", async () => {
  const catalog = await loadJson(join(root, "riders/manifest.json"));
  const preset = await loadJson(join(riderDir, "manifest.json"));
  assert.equal(catalog.default_preset, "helmet-commuter");
  assert.equal(preset.view, "side-right");
  assert.equal(preset.atlas.src, "/riders/presets/helmet-commuter/atlas.webp");
  assert.deepEqual(Object.keys(preset.slots), ["backpack", "body", "head"]);
  assert.deepEqual(Object.keys(preset.limbs), ["arm_back", "arm_front", "leg_back", "leg_front"]);
  const image = await readFile(join(riderDir, "atlas.webp"));
  assert.equal(image.subarray(0, 4).toString("ascii"), "RIFF");
  assert.equal(image.subarray(8, 12).toString("ascii"), "WEBP");
  for (const part of Object.values({ ...preset.slots, ...preset.limbs })) {
    assert.equal(part.src, preset.atlas.src);
    assert.ok(part.x >= 0 && part.y >= 0 && part.width > 0 && part.height > 0);
    assert.ok(Array.isArray(part.crop) && part.crop.length === 4);
    const [x, y, w, h] = part.crop;
    assert.ok(x >= 0 && y >= 0 && w > 0 && h > 0);
    assert.ok(x + w <= preset.atlas.width && y + h <= preset.atlas.height);
  }
});

test("helmet rider supports bike mounting, pedaling, gliding, braking, and walking emotions", () => {
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

test("animation frame selection wraps at the configured frame count", () => {
  const states = { idle: { frames: 4, fps: 5 }, bike_ride: { frames: 6, fps: 10 } };
  assert.equal(frameIndex("idle", 0, states), 0);
  assert.equal(frameIndex("idle", 201, states), 1);
  assert.equal(frameIndex("idle", 800, states), 0);
  assert.equal(frameIndex("bike_ride", 599, states), 5);
  assert.equal(frameIndex("bike_ride", 600, states), 0);
  assert.equal(frameIndex("missing", 123, states), 0);
});

test("approved helmet character has no default ghost outfit and no emoji face", async () => {
  const preset = await loadJson(join(riderDir, "manifest.json"));
  const runtime = await readFile(join(root, "rider-runtime.js"), "utf8");
  assert.doesNotMatch(runtime, /emoji-avatar|halloweenCostumeEmoji/);
  assert.doesNotMatch(JSON.stringify(preset), /ghost|witch|pumpkin_costume/);
});
