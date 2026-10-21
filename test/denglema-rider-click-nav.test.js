import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";

const app = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const start = app.indexOf("function attachOwnRiderDrag(node) {");
const end = app.indexOf("\nfunction renderRiders(riders) {", start);
assert.ok(start >= 0 && end > start, "own-rider pointer handler exists");
const handler = app.slice(start, end);

function emitter() {
  const handlers = new Map();
  return {
    addEventListener(name, fn) {
      if (!handlers.has(name)) handlers.set(name, new Set());
      handlers.get(name).add(fn);
    },
    removeEventListener(name, fn) { handlers.get(name)?.delete(fn); },
    fire(name, event) {
      for (const fn of [...(handlers.get(name) || [])]) fn(event);
    },
  };
}

function makeHarness() {
  const activeClasses = new Set();
  const node = {
    ...emitter(),
    _riderData: { user_id: "own", lane: 1, x: 50 },
    classList: {
      add(...classes) { classes.forEach((c) => activeClasses.add(c)); },
      remove(...classes) { classes.forEach((c) => activeClasses.delete(c)); },
      toggle(c, on) { if (on) activeClasses.add(c); else activeClasses.delete(c); },
      contains(c) { return activeClasses.has(c); },
    },
    style: { left: "" },
    dataset: {},
  };
  const stage = {
    ...emitter(),
    captured: null,
    captures: 0,
    setPointerCapture(id) { this.captured = id; this.captures += 1; },
    hasPointerCapture(id) { return this.captured === id; },
    releasePointerCapture(id) { if (this.captured === id) this.captured = null; },
  };
  const win = { ...emitter(), setTimeout: () => 0 };
  let saves = 0;
  const env = {
    node,
    window: win,
    document: { querySelector: () => stage },
    me: { user_id: "own" },
    previewMode: false,
    pointerOfficePosition: () => ({ lane: 1, x: 55 }),
    hasHardOfficeCollision: () => false,
    $: () => ({ appendChild() {} }),
    rollbackRiderDrag: () => {},
    saveDraggedRider: () => { saves += 1; },
  };
  const instance = runInNewContext(
    "let riderDragState = null;\n" + handler +
    "\nattachOwnRiderDrag(node); ({ getState: () => riderDragState });",
    env,
  );
  const down = () => {
    let prevented = false;
    node.fire("pointerdown", {
      pointerId: 7,
      clientX: 100,
      clientY: 200,
      button: 0,
      isPrimary: true,
      target: { closest: () => null },
      preventDefault() { prevented = true; },
    });
    return () => prevented;
  };
  const move = (x) => win.fire("pointermove", { pointerId: 7, clientX: x, clientY: 200 });
  const up = () => win.fire("pointerup", { pointerId: 7 });
  return { node, stage, down, move, up, instance, getSaves: () => saves };
}

test("clicking own rider retains native click semantics instead of giving stage pointer capture", () => {
  const h = makeHarness();
  let detailClicks = 0;
  h.node.addEventListener("click", () => { detailClicks += 1; });
  const wasPrevented = h.down();
  h.move(103); // small jitter does not begin a drag or move the rider
  assert.equal(wasPrevented(), false);
  assert.equal(h.stage.captures, 0);
  assert.equal(h.node.style.left, "");
  assert.equal(h.node.classList.contains("is-dragging"), false);
  h.up();
  assert.equal(h.getSaves(), 0);
  assert.equal(h.instance.getState(), null);
  h.node.fire("click", {}); // browser-generated click still targets the rider
  assert.equal(detailClicks, 1);
});

test("own rider starts dragging after 5px and saves only on release", () => {
  const h = makeHarness();
  h.down();
  h.move(105); // the threshold itself is still a click
  assert.equal(h.stage.captures, 0);
  h.move(106);
  assert.equal(h.stage.captures, 1);
  assert.equal(h.node.classList.contains("is-dragging"), true);
  assert.equal(h.node.style.left, "55%");
  assert.equal(h.getSaves(), 0);
  h.up();
  assert.equal(h.getSaves(), 1);
  assert.equal(h.stage.captured, null);
  assert.equal(h.node.classList.contains("is-dragging"), false);
  assert.equal(h.node.dataset.justDragged, "1");
});

test("profile navigation spans its own row without vertically squeezed labels", () => {
  const css = readFileSync(new URL("../public/styles.css", import.meta.url), "utf8");
  assert.match(css, /grid-template-areas:\s*"brand back" "actions actions"/);
  assert.match(css, /\.profile-actions\s*\{[^}]*flex-wrap:\s*wrap/s);
  assert.match(css, /\.profile-actions \.profile-button\s*\{[^}]*white-space:\s*nowrap/s);
});
