import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { filterEventFeed } from "../public/event-feed-filter.js";

const rows = [
  { id: "1", kind: "join" },
  { id: "2", kind: "comment", message: "大家好" },
  { id: "3", kind: "upload" },
  { id: "4", kind: "achievement" },
  { id: "5", kind: "comment", message: "今天蹬了吗" },
  { id: "6", kind: "leader" },
  { id: "7", kind: "release" },
  { id: "8", kind: "future-system-event" },
];

test("24h feed includes every event in All, preserving order and identity", () => {
  assert.equal(filterEventFeed(rows), rows);
  assert.equal(filterEventFeed(rows, "all"), rows);
  assert.equal(filterEventFeed(rows, "unknown"), rows);
});

test("User messages include only manually written comments", () => {
  assert.deepEqual(filterEventFeed(rows, "user").map((row) => row.id), ["2", "5"]);
});

test("System notices include non-comment events, including future event kinds", () => {
  assert.deepEqual(filterEventFeed(rows, "system").map((row) => row.id), ["1", "3", "4", "6", "7", "8"]);
});

test("Empty, invalid and missing categories produce stable empty results", () => {
  assert.deepEqual(filterEventFeed([], "system"), []);
  assert.deepEqual(filterEventFeed(null, "user"), []);
  assert.deepEqual(filterEventFeed(undefined, "all"), []);
  assert.deepEqual(filterEventFeed([{ kind: "comment" }], "system"), []);
});

test("Homepage picker is wired to client-side filtering, without filtering social effects", async () => {
  const [html, script, server] = await Promise.all([
    readFile(new URL("../public/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/app.js", import.meta.url), "utf8"),
    readFile(new URL("../src/server.js", import.meta.url), "utf8"),
  ]);
  for (const value of ["all", "user", "system"]) {
    assert.match(html, new RegExp('<option value="' + value + '">'));
  }
  assert.match(script, /eventFilter\?\.addEventListener\("change", renderEventList\)/);
  assert.match(script, /filterEventFeed\(latestEventRows, eventFilter\?\.value \|\| "all"\)/);
  assert.match(script, /celebrateNewAchievements\(values\);[\s\S]*renderEventList\(\);[\s\S]*syncRiderCommentBubbles\(values\)/);
  assert.match(server, /url\.pathname === "\/event-feed-filter\.js"/);
});
