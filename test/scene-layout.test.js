import test from "node:test";
import assert from "node:assert/strict";
import {
  LAYOUT_MODE, visibleLaneIds, resolveVisualLane, readLaneLayout,
  nearestVisibleLane, getFootBaseline, projectSavedPosition,
  pointerToLayoutPosition,
} from "../public/scene-layout.js";

const rect = (left, top, width, height) => ({ left, top, width, height });
function stageWithLanes(stageRect, layoutRects) {
  const nodes = new Map(Object.entries(layoutRects).map(([id, r]) => [
    "#lane" + id, { getBoundingClientRect: () => r },
  ]));
  return {
    getBoundingClientRect: () => stageRect,
    querySelector: (id) => nodes.get(id) || null,
  };
}
const officeRects = () => ({
  1: rect(100, 200, 1000, 100),
  2: rect(100, 300, 1000, 100),
  3: rect(100, 400, 1000, 100),
  4: rect(100, 500, 1000, 100),
});
const halloweenRects = () => ({
  1: rect(100, 460, 1000, 84),
  3: rect(100, 560, 1000, 84),
});

test("office and Halloween are separate layouts: four visible lanes versus two roads", () => {
  assert.deepEqual(visibleLaneIds(LAYOUT_MODE.OFFICE), [1, 2, 3, 4]);
  assert.deepEqual(visibleLaneIds(LAYOUT_MODE.HALLOWEEN), [1, 3]);
  for (const id of [1, 2, 3, 4]) assert.equal(resolveVisualLane(LAYOUT_MODE.OFFICE, id), id);
  assert.deepEqual(
    [1, 2, 3, 4].map((id) => resolveVisualLane(LAYOUT_MODE.HALLOWEEN, id)),
    [1, 1, 3, 3],
  );
  assert.equal(resolveVisualLane(LAYOUT_MODE.HALLOWEEN, 5), null);
  assert.throws(() => visibleLaneIds("halloween-three-lane"), RangeError);
});

test("DOM snapshots use actual lane rectangles without inventing extra walkable space", () => {
  const office = readLaneLayout(stageWithLanes(rect(100, 200, 1000, 400), officeRects()), LAYOUT_MODE.OFFICE);
  const halloween = readLaneLayout(
    stageWithLanes(rect(100, 200, 1000, 600), halloweenRects()),
    LAYOUT_MODE.HALLOWEEN,
  );
  assert.deepEqual(office.lanes.map((l) => l.id), [1, 2, 3, 4]);
  assert.deepEqual(halloween.lanes.map((l) => l.id), [1, 3]);
  assert.deepEqual(halloween.lanes[0].rect, {
    left: 100, top: 460, right: 1100, bottom: 544, width: 1000, height: 84,
  });
  assert.equal(readLaneLayout(
    stageWithLanes(rect(0, 0, 1000, 600), { 1: rect(0, 0, 1000, 100) }),
    LAYOUT_MODE.HALLOWEEN,
  ), null, "A hidden or missing second road must not be treated as a third standable area");
  assert.equal(readLaneLayout(stageWithLanes(rect(0, 0, 0, 0), halloweenRects()), LAYOUT_MODE.HALLOWEEN), null);
});

test("pointer dragging picks nearest of the TWO real roads, not a fabricated central lane", () => {
  const scene = readLaneLayout(
    stageWithLanes(rect(100, 200, 1000, 600), halloweenRects()),
    LAYOUT_MODE.HALLOWEEN,
  );
  assert.equal(nearestVisibleLane(scene, 500).id, 1);
  assert.equal(nearestVisibleLane(scene, 600).id, 3);
  assert.equal(nearestVisibleLane(scene, 550).id, 1);
  assert.deepEqual(pointerToLayoutPosition(scene, { clientX: 700, clientY: 550 }), { lane: 1, x: 60 });
  assert.deepEqual(pointerToLayoutPosition(scene, { clientX: 700, clientY: 554 }), { lane: 3, x: 60 });
  assert.deepEqual(pointerToLayoutPosition(scene, { clientX: -40, clientY: 600 }), { lane: 3, x: 22 });
  assert.deepEqual(pointerToLayoutPosition(scene, { clientX: 5000, clientY: 600 }), { lane: 3, x: 78 });
});

test("ordinary four-lane positions resolve via DOM rectangles instead of fixed 25%-Y buckets", () => {
  const office = readLaneLayout(
    stageWithLanes(rect(100, 150, 1000, 500), {
      1: rect(100, 210, 1000, 100), 2: rect(100, 315, 1000, 100),
      3: rect(100, 430, 1000, 100), 4: rect(100, 545, 1000, 100),
    }),
    LAYOUT_MODE.OFFICE,
  );
  assert.deepEqual(pointerToLayoutPosition(office, {clientX: 370, clientY: 357}), {lane: 2, x: 27});
  assert.deepEqual(pointerToLayoutPosition(office, {clientX: 710, clientY: 610}), {lane: 4, x: 61});
});

test("saved logical 2/4 display on roads 1/3 without modifying persisted lane", () => {
  const snapshot = readLaneLayout(stageWithLanes(rect(100, 200, 1000, 600), halloweenRects()), LAYOUT_MODE.HALLOWEEN);
  const stored = {lane: 4, x: 39};
  const projected = projectSavedPosition(snapshot, stored);
  assert.equal(stored.lane, 4);
  assert.deepEqual(projected, {lane: 3, x: 39, clientX: 490, clientY: 627.2});
  assert.equal(getFootBaseline(snapshot, 1, 1), 544);
  assert.equal(getFootBaseline(snapshot, 3, 0), 560);
  assert.equal(projectSavedPosition(snapshot, {lane: 5, x: 50}), null);
});

test("existing PUT semantics remain visible lane IDs; preserving old logical lane requires explicit opt-in", () => {
  const snapshot = readLaneLayout(stageWithLanes(rect(100, 200, 1000, 600), halloweenRects()), LAYOUT_MODE.HALLOWEEN);
  const pointer = {clientX: 640, clientY: 604};
  assert.deepEqual(pointerToLayoutPosition(snapshot, pointer, {priorLogicalLane: 4}), {lane: 3, x: 54});
  assert.deepEqual(pointerToLayoutPosition(snapshot, pointer, {
    priorLogicalLane: 4, preserveLogicalLane: true,
  }), {lane: 4, x: 54});
  assert.deepEqual(pointerToLayoutPosition(snapshot, pointer, {
    priorLogicalLane: 2, preserveLogicalLane: true,
  }), {lane: 3, x: 54});
  assert.equal(pointerToLayoutPosition(null, pointer), null);
  assert.equal(pointerToLayoutPosition(snapshot, {clientX: NaN, clientY: 604}), null);
  assert.throws(() => pointerToLayoutPosition(snapshot, pointer, {minX: 81, maxX: 78}), RangeError);
});

test("mobile and resize positions are derived from new lane DOM measurements", () => {
  const mobile = readLaneLayout(stageWithLanes(
    rect(30, 75, 375, 560),
    {1: rect(30, 390, 375, 90), 3: rect(30, 500, 375, 90)},
  ), LAYOUT_MODE.HALLOWEEN);
  assert.deepEqual(pointerToLayoutPosition(mobile, {clientX: 217.5, clientY: 570}), {lane:3, x:50});
  assert.equal(projectSavedPosition(mobile, {lane:1, x:50}).clientX, 217.5);
  assert.equal(projectSavedPosition(mobile, {lane:1, x:50}).clientY, 462);
});
