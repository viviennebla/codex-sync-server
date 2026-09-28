import assert from "node:assert/strict";
import test from "node:test";

import {
  createWebSession,
  parseCookieHeader,
  verifyWebSession,
} from "../src/denglema-auth.js";

test("signed web session rejects tampering and expiry", () => {
  const now = () => new Date("2026-09-24T09:00:00Z");
  const token = createWebSession("usr_1", "secret", { now, ttlSeconds: 60 });
  assert.equal(verifyWebSession(token, "secret", { now }).user_id, "usr_1");
  assert.equal(verifyWebSession(token + "x", "secret", { now }), null);
  assert.equal(
    verifyWebSession(token, "secret", { now: () => new Date("2026-09-24T09:02:00Z") }),
    null,
  );
});

test("cookie parser keeps opaque signed session value", () => {
  assert.deepEqual(parseCookieHeader("a=1; denglema_session=abc.def; b=2"), {
    a: "1",
    denglema_session: "abc.def",
    b: "2",
  });
});
