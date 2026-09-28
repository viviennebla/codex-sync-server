import { createHmac, timingSafeEqual } from "node:crypto";

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
