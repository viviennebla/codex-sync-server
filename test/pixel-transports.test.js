import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { PIXEL_TRANSPORTS, resolveSpriteState } from "../public/rider-runtime.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const modes = ["bike", "walk", "scooter", "skateboard", "surf", "skate"];
const vehicles = ["scooter", "skateboard", "surf", "skate"];
const read = async path => readFile(join(root, path), "utf8");
const json = async path => JSON.parse(await read(path));

test("every supported transport renders the same pixel rider irrespective of profile avatar", async () => {
  const manifest = await json("public/riders/manifest.json");
  assert.deepEqual(PIXEL_TRANSPORTS, modes);
  assert.deepEqual(manifest.active_transports, modes);
  const app = await read("public/app.js");
  assert.match(app, /mountFrameRider/);
  assert.doesNotMatch(app, /mountRiderSprite/);
  assert.match(app, /openRiderDetail\(node\._riderData\)/);
  // The uploaded avatar stays in profile/social identity; it doesn't select
  // the stage rider's artwork.
  assert.match(app, /image\.src = rider\.avatar_url/);
  const runtime = await read("public/rider-runtime.js");
  assert.doesNotMatch(runtime, /if\s*\(.*avatar_url.*\)\s*return/);
});

test("each new vehicle has independently loadable SVG artwork and own basic motion state", async () => {
  const preset = await json("public/riders/presets/helmet-commuter/manifest.json");
  const rig = await json("public/riders/rigs/compact-side-right-v1.json");
  for (const mode of vehicles) {
    const src = preset.vehicles[mode]?.src;
    assert.equal(src, "/riders/presets/helmet-commuter/" + mode + ".svg");
    const svg = await read("public" + src);
    assert.match(svg, /viewBox="0 0 128 100"/);
    assert.match(svg, /<path/);
    const config = rig.vehicles[mode];
    assert.ok(config && Number.isFinite(config.lift));
    assert.equal(resolveSpriteState(mode, {}), mode + "_ride");
    assert.equal(resolveSpriteState(mode, { coasting:true }), mode + "_glide");
    assert.ok(preset.states[mode + "_ride"].frames >= 2);
    assert.ok(preset.states[mode + "_glide"].frames >= 2);
  }
});

test("wheel placement is only vehicle visual geometry; no duplicate rider pose system", async () => {
  const rig = await json("public/riders/rigs/compact-side-right-v1.json");
  assert.equal(rig.vehicles.scooter.wheels.length, 2);
  assert.equal(rig.vehicles.skateboard.wheels.length, 2);
  assert.equal(rig.vehicles.skate.wheels.length, 4);
  assert.equal(rig.vehicles.surf.wheels, undefined);
  const runtime = await read("public/rider-runtime.js");
  for(const mode of vehicles) assert.ok(runtime.includes('entry.transport === "'+mode+'"') || runtime.includes('entry.transport !== "walk" && !bike'), mode);
  assert.match(runtime, /\.pixel-extra-wheel/);
  assert.match(runtime, /prefers-reduced-motion/);
});

test("preview exposes all transport choices and server strictly allowlists their static assets", async () => {
  const preview = await read("public/rider-preview.html");
  const server = await read("src/server.js");
  for(const mode of modes) assert.match(preview,new RegExp('data-state="'+mode+'"'));
  assert.match(server,/additionalVehicleMatch/);
  assert.match(server, /\(scooter\|skateboard\|surf\|skate\)/);
  assert.doesNotMatch(server, /\*\.svg/);
});
