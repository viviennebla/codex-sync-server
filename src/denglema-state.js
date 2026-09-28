import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp.${randomBytes(4).toString("hex")}`;
  await writeFile(tmp, JSON.stringify(value, null, 2) + "\n", "utf8");
  await rename(tmp, path);
  try { await unlink(tmp); } catch {}
}

function paths(stateDir) {
  const root = join(stateDir, "denglema");
  return {
    root,
    installations: join(root, "installations.json"),
    pairingCodes: join(root, "pairing-codes.json"),
    users: join(root, "users.json"),
    usage: (date) => join(root, "usage", `${date}.json`),
  };
}

export async function upsertFeishuUser(profile, stateDir = "state", options = {}) {
  const openId = String(profile?.open_id || "").trim();
  if (!openId) throw new Error("feishu open_id is required");
  const now = options.now?.() || new Date();
  const file = paths(stateDir).users;
  const store = await readJson(file, { version: 1, by_id: {}, by_feishu_open_id: {} });
  let userId = store.by_feishu_open_id[openId] || null;
  if (!userId) {
    userId = options.userId || `usr_${randomUUID()}`;
    store.by_feishu_open_id[openId] = userId;
  }
  const current = store.by_id[userId] || {};
  store.by_id[userId] = {
    id: userId,
    feishu_open_id: openId,
    avatar_url: profile?.avatar_url || current.avatar_url || null,
    created_at: current.created_at || now.toISOString(),
    last_login_at: now.toISOString(),
  };
  await writeJson(file, store);
  return store.by_id[userId];
}

export async function readDenglemaUser(userId, stateDir = "state") {
  const id = String(userId || "").trim();
  if (!id) return null;
  const store = await readJson(paths(stateDir).users, { by_id: {} });
  return store.by_id?.[id] || null;
}

export async function readDenglemaUsers(stateDir = "state") {
  const store = await readJson(paths(stateDir).users, { by_id: {} });
  return Object.values(store.by_id || {});
}

export function validateUsageSample(sample) {
  if (!sample || sample.schema_version !== 1) throw new Error("Unsupported usage sample schema");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(sample.date || ""))) throw new Error("Invalid usage date");
  const observed = Date.parse(sample.observed_at || "");
  if (!Number.isFinite(observed)) throw new Error("Invalid observed_at");
  const total = Number(sample.total_tokens);
  if (!Number.isSafeInteger(total) || total < 0) throw new Error("Invalid total_tokens");
  return {
    schema_version: 1,
    date: sample.date,
    observed_at: new Date(observed).toISOString(),
    total_tokens: total,
  };
}

export async function createPairingCode(userId, stateDir = "state", options = {}) {
  const user = String(userId || "").trim();
  if (!user) throw new Error("user_id is required");
  const ttlMs = options.ttlMs ?? 5 * 60_000;
  const now = options.now?.() || new Date();
  const code = (options.code || randomBytes(4).toString("hex")).toUpperCase();
  const file = paths(stateDir).pairingCodes;
  const current = await readJson(file, {});
  const expiresAt = new Date(now.getTime() + ttlMs).toISOString();
  current[code] = {
    user_id: user,
    created_at: now.toISOString(),
    expires_at: expiresAt,
    status: "pending",
  };
  await writeJson(file, current);
  return { code, user_id: user, expires_at: expiresAt, status: "pending" };
}

export async function readPairingCodeStatus(code, userId, stateDir = "state", options = {}) {
  const key = String(code || "").trim().toUpperCase();
  const user = String(userId || "").trim();
  if (!key || !user) return null;

  const current = await readJson(paths(stateDir).pairingCodes, {});
  const pairing = current[key];
  if (!pairing || pairing.user_id !== user) return null;

  if (pairing.status === "consumed") {
    return {
      status: "consumed",
      installation_id: pairing.installation_id || null,
      consumed_at: pairing.consumed_at || null,
    };
  }

  const now = options.now?.() || new Date();
  const expiresAt = Date.parse(pairing.expires_at || "");
  if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) {
    return { status: "expired", expires_at: pairing.expires_at || null };
  }

  return { status: "pending", expires_at: pairing.expires_at };
}

export async function consumePairingCode(code, installationName, stateDir = "state", options = {}) {
  const key = String(code || "").trim().toUpperCase();
  if (!key) throw new Error("pairing code is required");
  const p = paths(stateDir);
  const codes = await readJson(p.pairingCodes, {});
  const pairing = codes[key];
  if (!pairing || pairing.status === "consumed") return null;
  const now = options.now?.() || new Date();
  if (!Number.isFinite(Date.parse(pairing.expires_at)) || Date.parse(pairing.expires_at) <= now.getTime()) {
    pairing.status = "expired";
    pairing.expired_at = now.toISOString();
    codes[key] = pairing;
    await writeJson(p.pairingCodes, codes);
    return null;
  }

  const rawToken = options.token || randomBytes(32).toString("base64url");
  const installationId = options.installationId || `inst_${randomUUID()}`;
  const installations = await readJson(p.installations, { version: 1, items: {} });
  installations.items[installationId] = {
    id: installationId,
    user_id: pairing.user_id,
    name: String(installationName || installationId),
    token_hash: sha256(rawToken),
    created_at: now.toISOString(),
    last_seen_at: null,
    revoked_at: null,
  };
  await writeJson(p.installations, installations);

  pairing.status = "consumed";
  pairing.consumed_at = now.toISOString();
  pairing.installation_id = installationId;
  codes[key] = pairing;
  await writeJson(p.pairingCodes, codes);

  return { installation_id: installationId, user_id: pairing.user_id, token: rawToken };
}

export async function authenticateInstallation(rawToken, stateDir = "state") {
  const token = String(rawToken || "");
  if (!token) return null;
  const store = await readJson(paths(stateDir).installations, { version: 1, items: {} });
  const hash = sha256(token);
  return Object.values(store.items || {}).find((item) => item.token_hash === hash && !item.revoked_at) || null;
}

export async function upsertUsageSample(installation, rawSample, stateDir = "state") {
  const sample = validateUsageSample(rawSample);
  const p = paths(stateDir);
  const file = p.usage(sample.date);
  const day = await readJson(file, { version: 1, date: sample.date, installations: {} });
  const existing = day.installations[installation.id] || null;
  const reset = Boolean(existing && sample.total_tokens < existing.max_total_tokens);
  const acceptedTotal = existing ? Math.max(existing.max_total_tokens, sample.total_tokens) : sample.total_tokens;
  day.installations[installation.id] = {
    installation_id: installation.id,
    user_id: installation.user_id,
    previous: existing?.latest || null,
    latest: sample,
    max_total_tokens: acceptedTotal,
    reset_detected: reset || Boolean(existing?.reset_detected),
  };
  await writeJson(file, day);

  const installations = await readJson(p.installations, { version: 1, items: {} });
  if (installations.items?.[installation.id]) {
    installations.items[installation.id].last_seen_at = sample.observed_at;
    await writeJson(p.installations, installations);
  }
  return { accepted_total: acceptedTotal, reset_detected: reset };
}

export async function revokeUserInstallation(userId, installationId, stateDir = "state", options = {}) {
  const user = String(userId || "").trim();
  const id = String(installationId || "").trim();
  if (!user || !id) return null;

  const file = paths(stateDir).installations;
  const store = await readJson(file, { version: 1, items: {} });
  const installation = store.items?.[id];
  if (!installation || installation.user_id !== user) return null;

  if (!installation.revoked_at) {
    const now = options.now?.() || new Date();
    installation.revoked_at = now.toISOString();
    store.items[id] = installation;
    await writeJson(file, store);
  }

  return {
    id: installation.id,
    name: installation.name || installation.id,
    revoked_at: installation.revoked_at,
  };
}

export async function readUserInstallations(userId, date, stateDir = "state") {
  const user = String(userId || "").trim();
  if (!user) return [];

  const p = paths(stateDir);
  const [store, day] = await Promise.all([
    readJson(p.installations, { version: 1, items: {} }),
    readJson(p.usage(date), { version: 1, date, installations: {} }),
  ]);

  return Object.values(store.items || {})
    .filter((installation) => installation.user_id === user && !installation.revoked_at)
    .map((installation) => {
      const usage = day.installations?.[installation.id] || null;
      return {
        id: installation.id,
        name: installation.name || installation.id,
        created_at: installation.created_at || null,
        last_seen_at: installation.last_seen_at || null,
        today_tokens: Number(usage?.max_total_tokens || 0),
        has_today_sample: Boolean(usage),
      };
    })
    .sort((a, b) => (
      b.today_tokens - a.today_tokens
      || String(b.last_seen_at || "").localeCompare(String(a.last_seen_at || ""))
      || a.name.localeCompare(b.name)
    ));
}

export async function readUserTotals(date, stateDir = "state") {
  const day = await readJson(paths(stateDir).usage(date), { installations: {} });
  const totals = new Map();
  for (const row of Object.values(day.installations || {})) {
    const userId = row.user_id;
    if (!userId) continue;
    const current = totals.get(userId) || { user_id: userId, total_tokens: 0, installations: 0 };
    current.total_tokens += Number(row.max_total_tokens || 0);
    current.installations += 1;
    totals.set(userId, current);
  }
  return [...totals.values()].sort((a, b) => b.total_tokens - a.total_tokens);
}