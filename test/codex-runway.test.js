import assert from "node:assert/strict";
import test from "node:test";

import { createCodexRunwayReader } from "../src/codex-runway.js";

function response(data, meta = {}) {
  return {
    ok: true,
    async json() {
      return { ok: true, data, meta };
    },
  };
}

test("CodexRunway reader caches two upstream lookups and normalizes records", async () => {
  let calls = 0;
  let now = Date.parse("2026-09-29T02:00:00Z");
  const fetch = async (url) => {
    calls += 1;
    if (String(url).includes("kind=reset_completed")) {
      return response({
        id: "done-1",
        kind: "reset_completed",
        resetType: "global",
        announcedAt: "2026-09-28T00:00:00Z",
        text: "Reset completed",
        scope: { plans: ["all"], windows: ["unknown"] },
        source: { handle: "thsottiaux", url: "https://x.com/example" },
      }, { generatedAt: "2026-09-29T01:59:00Z" });
    }
    return response({
      id: "schedule-1",
      kind: "reset_scheduled",
      resetType: "banked",
      announcedAt: "2026-09-29T01:00:00Z",
      confidence: 0.91,
      scope: { plans: ["plus", "pro"], windows: ["weekly"] },
      scheduleState: "pending",
      scheduleWindow: {
        startAt: "2026-09-30T07:00:00Z",
        endAt: "2026-10-01T07:00:00Z",
      },
    }, { generatedAt: "2026-09-29T01:59:00Z" });
  };

  const read = createCodexRunwayReader({
    fetch,
    now: () => now,
    cacheMs: 15 * 60 * 1000,
  });

  const first = await read();
  const second = await read();
  assert.equal(calls, 2);
  assert.equal(first.cache, "refresh");
  assert.equal(second.cache, "hit");
  assert.equal(first.latest_signal.reset_type, "banked");
  assert.equal(first.latest_signal.schedule_window.start_at, "2026-09-30T07:00:00Z");
  assert.equal(first.latest_completed.source_url, "https://x.com/example");
});

test("CodexRunway reader serves stale cache when refresh fails", async () => {
  let calls = 0;
  let now = 1000;
  let failing = false;
  const fetch = async (url) => {
    calls += 1;
    if (failing) throw new Error("upstream offline");
    return response({
      id: String(calls),
      kind: String(url).includes("kind=reset_completed") ? "reset_completed" : "reset_scheduled",
      resetType: "global",
      announcedAt: "2026-09-29T00:00:00Z",
      scope: { plans: ["all"], windows: ["unknown"] },
    });
  };
  const read = createCodexRunwayReader({
    fetch,
    now: () => now,
    cacheMs: 100,
  });

  const first = await read();
  assert.equal(first.cache, "refresh");
  failing = true;
  now += 200;
  const stale = await read();
  assert.equal(stale.cache, "stale");
  assert.match(stale.warning, /upstream offline/);
  assert.equal(calls, 4);
});
