import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { frameIndex, resolveSpriteState } from "../public/rider-runtime.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

test("default helmet commuter has three independently replaceable art slots", async () => {
  const catalog = JSON.parse(await readFile(join(root, "riders/manifest.json"), "utf8"));
  const preset = JSON.parse(await readFile(
    join(root, "riders/presets/helmet-commuter/manifest.json"), "utf8"
  ));
  assert.equal(catalog.default_preset, "helmet-commuter");
  assert.equal(preset.view, "side-right");
  assert.deepEqual(Object.keys(preset.slots), ["backpack", "body", "head"]);
  for (const [name, part] of Object.entries(preset.slots)) {
    assert.match(part.src, new RegExp("/" + name + "\\.svg$"));
    assert.ok(part.x >= 0 && part.y >= 0 && part.width > 0 && part.height > 0);
    assert.ok((await stat(join(root, part.src.slice(1)))).size > 0);
  }
  assert.ok((await stat(join(root, preset.vehicles.bike.src.slice(1)))).size > 0);
});

test("helmet rider state machine maps bike mounting, pedaling, gliding and braking", () => {
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

test("animation frame selection uses configured frame counts and wraps cleanly", () => {
  const states = { idle: { frames: 4, fps: 5 }, bike_ride: { frames: 6, fps: 10 } };
  assert.equal(frameIndex("idle", 0, states), 0);
  assert.equal(frameIndex("idle", 201, states), 1);
  assert.equal(frameIndex("idle", 800, states), 0);
  assert.equal(frameIndex("bike_ride", 599, states), 5);
  assert.equal(frameIndex("bike_ride", 600, states), 0);
  assert.equal(frameIndex("missing", 123, states), 0);
});

test("default art does not bake in Halloween costume or emoji", async () => {
  const paths = ["head.svg", "body.svg", "backpack.svg", "bike.svg"];
  for (const path of paths) {
    const svg = await readFile(join(root, "riders/presets/helmet-commuter", path), "utf8");
    assert.match(svg, /viewBox=/);
    assert.doesNotMatch(svg, /<emoji|ghost|halloween|🎃|👻/i);
  }
});
