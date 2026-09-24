import assert from "node:assert/strict";
import test from "node:test";

import {
  createWebSession,
  exchangeFeishuCode,
  parseCookieHeader,
  verifyWebSession,
} from "../src/denglema-auth.js";

test("Feishu code exchange uses server credentials and returns only identity fields", async () => {
  const calls = [];
  const profile = await exchangeFeishuCode("one-time-code", {
    appId: "cli_test",
    appSecret: "super-secret",
    fetch: async (url, init) => {
      calls.push({ url, init });
      if (calls.length === 1) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            code: 0,
            access_token: "u-access-token",
            expires_in: 7200,
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          code: 0,
          data: {
            open_id: "ou_123",
            avatar_url: "https://example.test/avatar",
            email: "must-not-be-persisted@example.test",
          },
        }),
      };
    },
  });

  assert.deepEqual(profile, {
    open_id: "ou_123",
    avatar_url: "https://example.test/avatar",
  });
  assert.equal(calls[0].url, "https://open.feishu.cn/open-apis/authen/v2/oauth/token");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    grant_type: "authorization_code",
    client_id: "cli_test",
    client_secret: "super-secret",
    code: "one-time-code",
  });
  assert.equal(calls[1].init.headers.authorization, "Bearer u-access-token");
});

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
