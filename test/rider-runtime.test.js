import assert from "node:assert/strict";
import { readFile, readdir, access } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { frameIndex, resolveSpriteState, resolveEmotion, pedalTargets, walkPose, advanceWheel, resolveBikeContactPose } from "../public/rider-runtime.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
const riderDir = join(root, "riders/presets/helmet-commuter");
const loadJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const parts = ["head", "body", "backpack", "arm_back", "arm_front", "leg_back", "leg_front"];
const heads = ["head-happy.webp", "head-focused.webp", "head-tired.webp"];

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
  assert.deepEqual(Object.keys(preset.expressions), ["neutral", "happy", "focused", "tired"]);
  for (const [emotion, path] of Object.entries(preset.expressions)) {
    const image = await readFile(join(root, path.slice(1)));
    assert.equal(image.subarray(0, 4).toString("ascii"), "RIFF", emotion);
    assert.equal(image.subarray(8, 12).toString("ascii"), "WEBP", emotion);
  }
  assert.equal(preset.vehicles.bike.frame.endsWith("bike-frame.svg"), true);
  assert.equal(preset.vehicles.bike.wheel.endsWith("bike-wheel.svg"), true);
  assert.deepEqual(new Set(rig.layer_order), new Set(parts));
  assert.doesNotMatch(JSON.stringify(preset), /"crop"|"atlas"|"x"|"y"|"width"|"height"/);
  const names = (await readdir(riderDir)).sort();
  assert.deepEqual(names, [
    ...parts.map(name => name + ".webp"),
    ...heads, "bike-frame.svg", "bike-wheel.svg", "manifest.json"
  ].sort());
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

test("emotions select distinct preloaded head images instead of drawing runtime visor paths", async () => {
  const preset = await loadJson(join(riderDir, "manifest.json"));
  assert.notEqual(preset.expressions.neutral, preset.expressions.happy);
  assert.notEqual(preset.expressions.happy, preset.expressions.focused);
  assert.notEqual(preset.expressions.focused, preset.expressions.tired);
  assert.equal(resolveEmotion("happy"), "happy");
  assert.equal(resolveEmotion("focused"), "focused");
  assert.equal(resolveEmotion("bike_brake"), "tired");
  assert.equal(resolveEmotion("bike_ride", { celebrating: true }), "happy");
  assert.equal(resolveEmotion("walk"), "neutral");
  const runtime = await readFile(join(root, "rider-runtime.js"), "utf8");
  assert.doesNotMatch(runtime, /pixel-expression-eyes|renderFace/);
});

test("six-step walking gait alternates planted and lifted feet without spinning boots", async () => {
  const rig = await loadJson(join(root, "riders/rigs/compact-side-right-v1.json"));
  const poses = Array.from({ length: 6 }, (_, i) => walkPose(rig, i));
  assert.deepEqual(walkPose(rig, 6), poses[0]);
  assert.equal(poses.length, rig.gait.walk.length);
  assert.equal(poses[0].front[1], 0);
  assert.equal(poses[3].back[1], 0);
  for (const p of poses) {
    for (const side of ["front", "back"]) {
      const [dx, dy, angle] = p[side];
      assert.ok(Math.abs(dx) <= 6 && Math.abs(dy) <= 6);
      assert.ok(Math.abs(angle) <= 5, "whole foot should not spin freely");
    }
  }
});

test("pedal targets are antipodal; front and rear wheels move and brake independently of feet", async () => {
  const rig = await loadJson(join(root, "riders/rigs/compact-side-right-v1.json"));
  const {center, radius} = rig.vehicles.bike.crank;
  for (let i = 0; i < 6; i++) {
    const target = pedalTargets(rig, 2 * Math.PI * i / 6);
    for (let axis = 0; axis < 2; axis++) {
      assert.ok(Math.abs((target.front[axis] + target.back[axis]) / 2 - center[axis]) < 1e-9);
      assert.ok(Math.abs(target.front[axis] - center[axis]) <= radius[axis] + 1e-9);
    }
  }
  assert.equal(advanceWheel(0, 360, 250), 90);
  assert.equal(advanceWheel(350, 360, 100), 26);
  assert.equal(advanceWheel(45, 0, 300), 45);
  assert.equal(rig.vehicles.bike.wheels.rear.center[1], rig.vehicles.bike.wheels.front.center[1]);
  const frame = await readFile(join(riderDir, "bike-frame.svg"), "utf8");
  const wheel = await readFile(join(riderDir, "bike-wheel.svg"), "utf8");
  assert.match(frame, /viewBox/);
  assert.match(wheel, /viewBox/);
  assert.match(wheel, /stroke-dasharray/);
});

test("rider and bike bob together while a single visual offset raises the rider", async () => {
  const runtime = await readFile(join(root, "rider-runtime.js"), "utf8");
  assert.match(runtime, /pixel-rider-assembly/);
  assert.match(runtime, /assembly\.append\(vehicle\)/);
  assert.match(runtime, /assembly\.append\(core\)/);
  assert.match(runtime, /transform\(art\.querySelector\("\.pixel-rider-assembly"\), 0, bob\)/);
  assert.match(runtime, /const riderLift = bike \? -12 : 0/);
  assert.doesNotMatch(runtime, /seatOffset|handleOffset|perVehicleJointAnchors/);
});

test("bike seat and rider hip share world coordinates; pedals compensate translated torso", async () => {
  const rig = await loadJson(join(root, "riders/rigs/compact-side-right-v1.json"));
  const pose = resolveBikeContactPose(rig);
  const worldHip = pose.hipReference.map((coordinate, axis) => coordinate + pose.offset[axis]);
  assert.deepEqual(worldHip, pose.seat, "seated rider hip must coincide with the visible seat");
  const bike = rig.vehicles.bike;
  assert.ok(bike.y > 35, "bike should sit below torso with tires on the road");
  assert.ok(bike.width <= 105, "bicycle should remain smaller than original oversized frame");
  const [rearX,rearY] = bike.wheels.rear.center;
  const displayedWheelY = bike.y + bike.height / bike.art_canvas[1] * rearY;
  assert.ok(displayedWheelY > pose.seat[1] + 20, "tires must be below the seat");
  const visibleFoot = pedalTargets(rig, Math.PI / 3).front;
  const leg = rig.limbs.leg_front;
  const artFoot = [leg.x + leg.foot_anchor[0],leg.y + leg.foot_anchor[1]];
  const correction = visibleFoot.map((point,i) => point - pose.offset[i] - artFoot[i]);
  const finalWorldFoot = artFoot.map((point,i) => point + correction[i] + pose.offset[i]);
  finalWorldFoot.forEach((v,i) => assert.ok(Math.abs(v-visibleFoot[i]) < 1e-9));
});

test("acceptance preview exposes a real interactive state picker", async () => {
  const page = await readFile(join(root, "rider-preview.html"), "utf8");
  for (const state of ["bike","walk","idle","happy","bike-happy","tired","coasting"]) {
    assert.match(page, new RegExp('data-state="' + state + '"'));
  }
  assert.match(page, /mountRiderSprite/);
});
