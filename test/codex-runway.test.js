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

function scheduledRecord() {
  return {
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
  };
}

function completedRecord(effectiveAt) {
  return {
    id: "manual:reset-1",
    kind: "reset_completed",
    resetType: "banked",
    effectiveAt,
    completedAt: effectiveAt,
    scope: { plans: ["all"], windows: ["weekly"] },
  };
}

test("CodexRunway reader caches schedule plus recent completed lookup", async () => {
  let calls = 0;
  const now = Date.parse("2026-09-30T04:00:00Z");
  const fetch = async (url) => {
    calls += 1;
    return String(url).includes("kind=reset_completed")
      ? response(completedRecord("2026-09-30T02:10:55Z"), { generatedAt: "2026-09-30T03:59:00Z" })
      : response(scheduledRecord(), { generatedAt: "2026-09-30T03:59:00Z" });
  };

  const read = createCodexRunwayReader({ fetch, now: () => now, cacheMs: 15 * 60 * 1000 });
  const first = await read();
  const second = await read();

  assert.equal(calls, 2);
  assert.equal(first.cache, "refresh");
  assert.equal(second.cache, "hit");
  assert.equal(first.latest_signal.reset_type, "banked");
  assert.equal(first.latest_signal.schedule_window.start_at, "2026-09-30T07:00:00Z");
  assert.equal(first.latest_completed.kind, "reset_completed");
  assert.equal(first.latest_completed.effective_at, "2026-09-30T02:10:55Z");
});

test("completed reset is exposed only for 24 hours", async () => {
  let now = Date.parse("2026-09-30T04:00:00Z");
  const fetch = async (url) => (
    String(url).includes("kind=reset_completed")
      ? response(completedRecord("2026-09-29T04:00:00Z"))
      : response(scheduledRecord())
  );
  const read = createCodexRunwayReader({ fetch, now: () => now, cacheMs: 100 });

  const atBoundary = await read();
  assert.equal(atBoundary.latest_completed?.kind, "reset_completed");

  now += 101;
  const expired = await read();
  assert.equal(expired.latest_completed, null);
  assert.equal(expired.latest_signal.kind, "reset_scheduled");
});

test("completed reset prefers effectiveAt and falls back to completedAt", async () => {
  const now = Date.parse("2026-09-30T04:00:00Z");
  const fetch = async (url) => {
    if (!String(url).includes("kind=reset_completed")) return response(scheduledRecord());
    return response({
      ...completedRecord(null),
      effectiveAt: null,
      completedAt: "2026-09-30T03:30:00Z",
    });
  };
  const read = createCodexRunwayReader({ fetch, now: () => now });
  const value = await read();
  assert.equal(value.latest_completed.completed_at, "2026-09-30T03:30:00Z");
});

test("completed global reset with only announcedAt is visible for 24 hours", async () => {
  // didcodexreset's 2026-10-20 global reset has no effectiveAt or completedAt.
  const announcedAt = "2026-10-20T06:33:48.000Z";
  let now = Date.parse("2026-10-20T06:47:00.000Z");
  const fetch = async (url) => (
    String(url).includes("kind=reset_completed")
      ? response({
          kind: "reset_completed",
          resetType: "global",
          announcedAt,
          effectiveAt: null,
          completedAt: null,
          confidence: 0.82,
          scope: { plans: ["all"], windows: ["unknown"] },
        })
      : response(null)
  );
  const read = createCodexRunwayReader({ fetch, now: () => now, cacheMs: 100 });
  const recent = await read();

  assert.equal(recent.latest_completed?.kind, "reset_completed");
  assert.equal(recent.latest_completed?.reset_type, "global");
  assert.equal(recent.latest_completed?.announced_at, announcedAt);
  assert.equal(recent.latest_completed?.confidence, 0.82);

  now = Date.parse("2026-10-21T06:33:49.000Z");
  const expired = await read();
  assert.equal(expired.latest_completed, null);
});

test("CodexRunway reader serves stale cache when refresh fails", async () => {
  let calls = 0;
  let now = Date.parse("2026-09-30T04:00:00Z");
  let failing = false;
  const fetch = async (url) => {
    calls += 1;
    if (failing) throw new Error("upstream offline");
    return String(url).includes("kind=reset_completed")
      ? response(completedRecord("2026-09-30T03:00:00Z"))
      : response(scheduledRecord());
  };
  const read = createCodexRunwayReader({ fetch, now: () => now, cacheMs: 100 });

  const first = await read();
  assert.equal(first.cache, "refresh");
  failing = true;
  now += 200;
  const stale = await read();
  assert.equal(stale.cache, "stale");
  assert.match(stale.warning, /upstream offline/);
  assert.equal(calls, 4);
  assert.equal(stale.latest_completed.kind, "reset_completed");
});
