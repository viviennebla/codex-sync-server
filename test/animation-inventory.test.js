import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// A lightweight audit guard, not a visual/behavior test.
// When action names or CSS keyframes change, update the animation inventory
// instead of allowing the new behavior to disappear from project handoffs.
const readRepoFile = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

function readCatalog(document) {
  const match = document.match(/<!-- animation-catalog:start -->\s*```json\s*([\s\S]*?)\s*```\s*<!-- animation-catalog:end -->/);
  assert.ok(match, "animation system document must contain one JSON catalog");
  return JSON.parse(match[1]);
}

const doc = await readRepoFile("docs/denglema-animation-system.md");
const catalog = readCatalog(doc);
const app = await readRepoFile("public/app.js");

function assertUnique(values, label) {
  assert.equal(new Set(values).size, values.length, label + " must not contain duplicates");
}

test("animation catalog covers every actual CSS keyframe (including dormant ones)", async () => {
  for (const path of ["public/styles.css", "public/halloween-theme.css"]) {
    const css = await readRepoFile(path);
    const actual = [...css.matchAll(/@keyframes\s+([a-zA-Z][\w-]*)/g)].map((match) => match[1]);
    const documented = catalog.keyframes[path];
    assert.ok(Array.isArray(documented), path + " is missing from animation catalog");
    assertUnique(documented, path);
    assertUnique(actual, path + " CSS");
    assert.deepEqual([...documented].sort(), [...actual].sort(),
      "Update docs/denglema-animation-system.md for changed @keyframes in " + path);
  }
});

test("animation catalog covers all Director motion action IDs", () => {
  const source = app.match(/const MOTION_ACTIONS = \{([\s\S]*?)^\};/m)?.[1];
  assert.ok(source, "MOTION_ACTIONS registry must exist in app.js");
  const actual = [...source.matchAll(/^\s{2}([a-zA-Z][\w]*): \{/gm)].map((m) => m[1]);
  assertUnique(catalog.motionActions, "motionActions");
  assert.deepEqual([...catalog.motionActions].sort(), actual.sort(),
    "When modifying MOTION_ACTIONS, update the motion table and JSON catalog");
});

test("animation inventory owns known event, movement and lifecycle entry points", () => {
  assertUnique(catalog.runtimeHooks, "runtimeHooks");
  for (const name of catalog.runtimeHooks) {
    assert.match(app, new RegExp("\\b(?:async )?function " + name + "\\s*\\("),
      "Missing or renamed animation system entry point: " + name);
  }
  assert.match(doc, /Ambient Drift/);
  assert.match(doc, /scheduleDirector/);
  assert.match(doc, /Bubble/);
  assert.match(doc, /Locomotion/);
});
