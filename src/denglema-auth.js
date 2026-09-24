import { createHmac, timingSafeEqual } from "node:crypto";

export const FEISHU_TOKEN_URL = "https://open.feishu.cn/open-apis/authen/v2/oauth/token";
export const FEISHU_USER_INFO_URL = "https://open.feishu.cn/open-apis/authen/v1/user_info";

function authError(message, status = 502) {
  const error = new Error(message);
  error.statusCode = status;
  return error;
}

async function readJsonResponse(response, label) {
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw authError(`${label} returned invalid JSON`);
  }
  if (!response.ok) {
    throw authError(`${label} failed with HTTP ${response.status}`);
  }
  if (payload?.code && payload.code !== 0) {
    throw authError(`${label} failed: ${payload.message || payload.msg || payload.code}`);
  }
  return payload;
}

export async function exchangeFeishuCode(code, options = {}) {
  const appId = String(options.appId || "").trim();
  const appSecret = String(options.appSecret || "").trim();
  const authCode = String(code || "").trim();
  const fetchFn = options.fetch || fetch;
  if (!appId || !appSecret) throw authError("Feishu auth is not configured", 503);
  if (!authCode) throw authError("Missing Feishu authorization code", 400);

  const body = {
    grant_type: "authorization_code",
    client_id: appId,
    client_secret: appSecret,
    code: authCode,
  };
  if (options.redirectUri) body.redirect_uri = options.redirectUri;

  const tokenResponse = await fetchFn(options.tokenUrl || FEISHU_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const tokenPayload = await readJsonResponse(tokenResponse, "Feishu token exchange");
  const accessToken = tokenPayload?.access_token || tokenPayload?.data?.access_token;
  if (!accessToken) throw authError("Feishu token exchange returned no access token");

  const userResponse = await fetchFn(options.userInfoUrl || FEISHU_USER_INFO_URL, {
    method: "GET",
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const userPayload = await readJsonResponse(userResponse, "Feishu user info");
  const data = userPayload?.data || userPayload || {};
  const openId = String(data.open_id || "").trim();
  if (!openId) throw authError("Feishu user info returned no open_id");

  return {
    open_id: openId,
    avatar_url: data.avatar_middle || data.avatar_url || data.avatar_thumb || data.avatar_big || null,
  };
}
function encode(value) {
  return Buffer.from(value).toString("base64url");
}

function sign(value, secret) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function createWebSession(userId, secret, options = {}) {
  const key = String(secret || "");
  const id = String(userId || "").trim();
  if (!key) throw new Error("DENGLEMA_SESSION_SECRET is required");
  if (!id) throw new Error("user_id is required");
  const nowMs = (options.now?.() || new Date()).getTime();
  const ttlSeconds = options.ttlSeconds ?? 7 * 24 * 60 * 60;
  const payload = {
    v: 1,
    user_id: id,
    iat: Math.floor(nowMs / 1000),
    exp: Math.floor(nowMs / 1000) + ttlSeconds,
  };
  const encoded = encode(JSON.stringify(payload));
  return `${encoded}.${sign(encoded, key)}`;
}

export function verifyWebSession(token, secret, options = {}) {
  const key = String(secret || "");
  if (!key || !token) return null;
  const [encoded, signature, extra] = String(token).split(".");
  if (!encoded || !signature || extra !== undefined) return null;
  const expected = sign(encoded, key);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const now = Math.floor((options.now?.() || new Date()).getTime() / 1000);
  if (payload?.v !== 1 || !payload.user_id || !Number.isFinite(payload.exp) || payload.exp <= now) return null;
  return payload;
}

export function parseCookieHeader(header = "") {
  const cookies = {};
  for (const part of String(header).split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (name) cookies[name] = value;
  }
  return cookies;
}

export function sessionCookie(token, options = {}) {
  const maxAge = options.maxAge ?? 7 * 24 * 60 * 60;
  const parts = [
    `denglema_session=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (options.secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearSessionCookie(options = {}) {
  const parts = [
    "denglema_session=",
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (options.secure) parts.push("Secure");
  return parts.join("; ");
}
