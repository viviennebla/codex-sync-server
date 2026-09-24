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
    usage: (date) => join(root, "usage", `${date}.json`),
  };
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
  current[code] = { user_id: user, created_at: now.toISOString(), expires_at: expiresAt };
  await writeJson(file, current);
  return { code, user_id: user, expires_at: expiresAt };
}

export async function consumePairingCode(code, installationName, stateDir = "state", options = {}) {
  const key = String(code || "").trim().toUpperCase();
  if (!key) throw new Error("pairing code is required");
  const p = paths(stateDir);
  const codes = await readJson(p.pairingCodes, {});
  const pairing = codes[key];
  if (!pairing) return null;
  const now = options.now?.() || new Date();
  if (!Number.isFinite(Date.parse(pairing.expires_at)) || Date.parse(pairing.expires_at) <= now.getTime()) {
    delete codes[key];
    await writeJson(p.pairingCodes, codes);
    return null;
  }
  delete codes[key];
  await writeJson(p.pairingCodes, codes);

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