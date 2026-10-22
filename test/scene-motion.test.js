import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { adjacentSameRoadPairs, nextAmbientOffset } from "../public/scene-motion.js";

test("five evenly spaced riders on a full-width road can still greet adjacent riders", () => {
  const riders = [5.5, 27.8, 50, 72.2, 94.5]
    .map((x, i) => ({ user_id: "r" + (i + 1), x, lane: 1 }));
  const pairs = adjacentSameRoadPairs(riders);
  assert.deepEqual(pairs.map(([a,b]) => [a.user_id, b.user_id]), [
    ["r1", "r2"], ["r2", "r3"], ["r3", "r4"], ["r4", "r5"],
  ]);
  assert.ok(pairs.every(([a,b]) => b.x - a.x > 22),
    "This is the old 22% cutoff regression");
});

test("greetings stay on one visible road and survive arbitrary input order", () => {
  const input = [
    {user_id:"upper-right", lane:1, x:80},
    {user_id:"lower-center", lane:3, x:50},
    {user_id:"upper-left", lane:1, x:20},
    {user_id:"lower-right", lane:3, x:80},
    {user_id:"lower-left", lane:3, x:20},
  ];
  const expected = [
    ["upper-left", "upper-right"],
    ["lower-left", "lower-center"],
    ["lower-center", "lower-right"],
  ];
  const pairs = adjacentSameRoadPairs(input).map(([a,b])=>[a.user_id,b.user_id]);
  assert.deepEqual(pairs, expected);
  assert.deepEqual(adjacentSameRoadPairs([...input].reverse()).map(([a,b])=>[a.user_id,b.user_id]), expected);
  assert.deepEqual(adjacentSameRoadPairs([input[0]]), []);
  assert.deepEqual(adjacentSameRoadPairs([]), []);
});

test("ambient step is visible on desktop but bounded and deterministic", () => {
  const width = 1528;
  const right = nextAmbientOffset(0, width, .95, 1);
  const left = nextAmbientOffset(0, width, .05, 1);
  assert.ok(right * width / 100 >= 20 && right * width / 100 <= 32.01);
  assert.equal(Math.round(left * 100000), -Math.round(right * 100000));
  for(let i=0;i<20;i++) {
    const offset = nextAmbientOffset(15, width, .9, i/20);
    assert.ok(offset <= 48 / width * 100 + 1e-8);
    assert.ok(offset >= -48 / width * 100 - 1e-8);
  }
  assert.ok(Math.abs(nextAmbientOffset(0,375,.95,1)) < right);
  assert.equal(nextAmbientOffset(0,0,.95,1), null);
});

test("scene refresh preserves drift except when the real layout changes", async () => {
  const app = await readFile(new URL("../public/app.js", import.meta.url),"utf8");
  assert.match(app, /return adjacentSameRoadPairs\(available\)/);
  assert.match(app, /nextAmbientOffset\(current, laneRect.width, Math.random\(\), Math.random\(\)\)/);
  assert.match(app, /node\.dataset\.sceneLayoutKey !== layoutKey/);
  assert.match(app, /delete node\.dataset\.driftAfter/);
  const renderPart = app.slice(app.indexOf("function renderRiders("), app.indexOf("function layoutRiderIdentities("));
  assert.ok(renderPart.indexOf("node.style.left = \"\"") > renderPart.indexOf("node.dataset.sceneLayoutKey !== layoutKey"),
    "reset is only performed on a changed layout anchor");
});
