import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const app = read("public/app.js");
const identityCss = read("public/rider-identity.css");
const server = read("src/server.js");
const profile = read("public/profile.js");

test("crown and achievement belong to rider motion / identity, not free-floating layer decorations", () => {
  assert.match(app, /'<div class="rider-motion">'\s*\+\s*\(rider\.is_leader/);
  assert.match(app, /next\.prepend\(leaderCrown\)/);
  assert.doesNotMatch(app, /class="rider-achievement"/);
  assert.match(app, /class="rider-title-name"/);
  assert.match(app, /class="rider-title-tooltip"/);
  assert.match(app, /rider\.equipped_achievement\.description/);
  assert.match(identityCss, /\.rider\.has-pixel-rider \.rider-motion > \.leader-crown/);
  assert.match(identityCss, /prefers-reduced-motion:\s*reduce/);
  assert.match(server, /description: achievement\.description/);
});

test("both homepage and profile can request the new allowlisted stylesheet", () => {
  assert.match(read("public/index.html"), /href="\/rider-identity\.css"/);
  assert.match(read("public/profile.html"), /href="\/rider-identity\.css"/);
  assert.match(server, /url\.pathname === "\/rider-identity\.css"[\s\S]*?sendStatic\(res, "rider-identity\.css"/);
  assert.match(profile, /aria-pressed/);
  assert.match(profile, /unlocked_at/);
});

const start = app.indexOf("function layoutRiderIdentities() {");
const end = app.indexOf("\nasync function loadRaceData()", start);
assert.ok(start >= 0 && end > start, "layout collision logic is bounded and extractable");
const snippet = app.slice(start, end);

function fakeRider(x, y = 10) {
  const flags = new Set();
  const node = {
    classList: {
      add: (...names) => names.forEach((name) => flags.add(name)),
      remove: (...names) => names.forEach((name) => flags.delete(name)),
      contains: (name) => flags.has(name)
    },
    getClientRects: () => [{}],
    querySelector: (selector) => selector === ".name-chip" ? chip : null
  };
  const chip = {
    getBoundingClientRect: () => {
      const left = flags.has("identity-flipped") ? x - 120 : x;
      const width = flags.has("identity-icon-only") ? 25
        : flags.has("identity-tight") ? 55 : 90;
      return { left, right: left + width, top: y, bottom: y + 20 };
    }
  };
  return node;
}

function layout(riders, stageRight = 600) {
  const stage = { getBoundingClientRect: () => ({ left: 0, right: stageRight }) };
  const document = {
    querySelectorAll: (selector) => selector === ".rider" ? riders : [],
    querySelector: (selector) => selector === ".race-stage" ? stage : null
  };
  runInNewContext(snippet + "\nlayoutRiderIdentities()", { document });
}

test("name collisions first remove token numbers, then abbreviate achievements", () => {
  const near = [fakeRider(100), fakeRider(180)];
  layout(near);
  near.forEach((node) => {
    assert.ok(node.classList.contains("identity-tight"));
    assert.equal(node.classList.contains("identity-icon-only"), false);
  });
  const stacked = [fakeRider(100), fakeRider(130)];
  layout(stacked);
  stacked.forEach((node) => {
    assert.ok(node.classList.contains("identity-tight"));
    assert.ok(node.classList.contains("identity-icon-only"));
  });
});

test("identity labels reverse direction at the stage right edge", () => {
  const rider = fakeRider(270);
  layout([rider], 330);
  assert.ok(rider.classList.contains("identity-flipped"));
});

test("unlock celebration only reacts to new events after initial feed load", () => {
  assert.match(app, /let achievementEventsInitialized = false/);
  assert.match(app, /if \(achievementEventsInitialized && event\.user\?\.user_id === me\?\.user_id/);
  assert.match(app, /Date\.parse\(event\.created_at \|\| ""\)/);
});
