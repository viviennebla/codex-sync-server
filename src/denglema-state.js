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

function normalizeRecoveryCode(value) {
  return String(value || "").replace(/[^a-z0-9]/gi, "").toUpperCase();
}

function recoveryHash(value) {
  const normalized = normalizeRecoveryCode(value);
  return normalized ? sha256(normalized) : null;
}

function formatRecoveryCode(hex) {
  return String(hex || "").toUpperCase().match(/.{1,4}/g)?.join("-") || "";
}

function cleanDisplayName(value) {
  const name = String(value || "").trim();
  if (!name || name.length > 24) throw new Error("display_name must be 1-24 characters");
  return name;
}

function cleanAvatarEmoji(value) {
  const emoji = String(value || "").trim();
  if (!emoji) return "🚴";
  if ([...emoji].length > 4) throw new Error("avatar_emoji is too long");
  return emoji;
}

export async function createWebUser(profile, stateDir = "state", options = {}) {
  const now = options.now?.() || new Date();
  const file = paths(stateDir).users;
  const store = await readJson(file, {
    version: 1,
    by_id: {},
    by_feishu_open_id: {},
    by_recovery_hash: {},
  });
  store.by_id ||= {};
  store.by_feishu_open_id ||= {};
  store.by_recovery_hash ||= {};

  const userId = options.userId || ("usr_" + randomUUID());
  const recoveryCode = options.recoveryCode || formatRecoveryCode(randomBytes(10).toString("hex"));
  const hash = recoveryHash(recoveryCode);
  if (!hash) throw new Error("recovery code generation failed");

  const user = {
    id: userId,
    display_name: cleanDisplayName(profile?.display_name),
    avatar_emoji: cleanAvatarEmoji(profile?.avatar_emoji),
    avatar_url: null,
    created_at: now.toISOString(),
    last_login_at: now.toISOString(),
  };
  store.by_id[userId] = user;
  store.by_recovery_hash[hash] = userId;
  await writeJson(file, store);
  return { user, recovery_code: recoveryCode };
}

export async function recoverWebUser(recoveryCode, stateDir = "state", options = {}) {
  const hash = recoveryHash(recoveryCode);
  if (!hash) return null;
  const file = paths(stateDir).users;
  const store = await readJson(file, { version: 1, by_id: {}, by_recovery_hash: {} });
  const userId = store.by_recovery_hash?.[hash];
  const user = userId ? store.by_id?.[userId] : null;
  if (!user) return null;
  const now = options.now?.() || new Date();
  user.last_login_at = now.toISOString();
  store.by_id[userId] = user;
  await writeJson(file, store);
  return user;
}

export async function provisionRecoveryForUser(userId, profile = {}, stateDir = "state", options = {}) {
  const id = String(userId || "").trim();
  if (!id) return null;
  const file = paths(stateDir).users;
  const store = await readJson(file, {
    version: 1,
    by_id: {},
    by_feishu_open_id: {},
    by_recovery_hash: {},
  });
  const user = store.by_id?.[id];
  if (!user) return null;
  store.by_recovery_hash ||= {};

  user.display_name = cleanDisplayName(profile.display_name || user.display_name || "骑手");
  user.avatar_emoji = cleanAvatarEmoji(profile.avatar_emoji || user.avatar_emoji || "🚴");
  const recoveryCode = options.recoveryCode || formatRecoveryCode(randomBytes(10).toString("hex"));
  const hash = recoveryHash(recoveryCode);
  store.by_recovery_hash[hash] = id;
  store.by_id[id] = user;
  await writeJson(file, store);
  return { user, recovery_code: recoveryCode };
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

function normalizeUsageBreakdown(rows, field) {
  if (rows == null) return [];
  if (!Array.isArray(rows)) throw new Error(`Invalid ${field} breakdown`);
  if (rows.length > 256) throw new Error(`Too many ${field} rows`);

  const totals = new Map();
  for (const row of rows) {
    const name = String(row?.name || "").trim();
    if (!name || name.length > 96) throw new Error(`Invalid ${field} name`);
    const tokens = Number(row?.total_tokens);
    if (!Number.isSafeInteger(tokens) || tokens < 0) {
      throw new Error(`Invalid ${field} total_tokens`);
    }
    if (tokens === 0) continue;
    totals.set(name, (totals.get(name) || 0) + tokens);
  }

  return [...totals.entries()]
    .map(([name, total_tokens]) => ({ name, total_tokens }))
    .sort((a, b) => b.total_tokens - a.total_tokens || a.name.localeCompare(b.name));
}

function mergeMaxBreakdown(existing = [], incoming = []) {
  const totals = new Map();
  for (const row of Array.isArray(existing) ? existing : []) {
    const name = String(row?.name || "").trim();
    const tokens = Number(row?.total_tokens || 0);
    if (name && Number.isSafeInteger(tokens) && tokens > 0) totals.set(name, tokens);
  }
  for (const row of Array.isArray(incoming) ? incoming : []) {
    const current = totals.get(row.name) || 0;
    totals.set(row.name, Math.max(current, row.total_tokens));
  }
  return [...totals.entries()]
    .map(([name, total_tokens]) => ({ name, total_tokens }))
    .sort((a, b) => b.total_tokens - a.total_tokens || a.name.localeCompare(b.name));
}

function addBreakdown(target, rows = []) {
  for (const row of Array.isArray(rows) ? rows : []) {
    target.set(row.name, (target.get(row.name) || 0) + Number(row.total_tokens || 0));
  }
}

function breakdownRows(target) {
  return [...target.entries()]
    .map(([name, total_tokens]) => ({ name, total_tokens }))
    .sort((a, b) => b.total_tokens - a.total_tokens || a.name.localeCompare(b.name));
}

export function validateUsageSample(sample) {
  const version = Number(sample?.schema_version);
  if (version !== 1 && version !== 2) throw new Error("Unsupported usage sample schema");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(sample.date || ""))) throw new Error("Invalid usage date");
  const observed = Date.parse(sample.observed_at || "");
  if (!Number.isFinite(observed)) throw new Error("Invalid observed_at");
  const total = Number(sample.total_tokens);
  if (!Number.isSafeInteger(total) || total < 0) throw new Error("Invalid total_tokens");

  return {
    schema_version: version,
    date: sample.date,
    observed_at: new Date(observed).toISOString(),
    total_tokens: total,
    ...(version === 2 ? {
      models: normalizeUsageBreakdown(sample.models, "models"),
      projects: normalizeUsageBreakdown(sample.projects, "projects"),
    } : {}),
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
  const acceptedModels = mergeMaxBreakdown(existing?.max_models, sample.models);
  const acceptedProjects = mergeMaxBreakdown(existing?.max_projects, sample.projects);
  day.version = 2;
  day.installations[installation.id] = {
    installation_id: installation.id,
    user_id: installation.user_id,
    previous: existing?.latest || null,
    latest: sample,
    max_total_tokens: acceptedTotal,
    max_models: acceptedModels,
    max_projects: acceptedProjects,
    reset_detected: reset || Boolean(existing?.reset_detected),
  };
  await writeJson(file, day);

  const installations = await readJson(p.installations, { version: 1, items: {} });
  if (installations.items?.[installation.id]) {
    installations.items[installation.id].last_seen_at = sample.observed_at;
    await writeJson(p.installations, installations);
  }
  return {
    accepted_total: acceptedTotal,
    accepted_models: acceptedModels,
    accepted_projects: acceptedProjects,
    reset_detected: reset,
  };
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
        models: usage?.max_models || [],
        projects: usage?.max_projects || [],
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
    const current = totals.get(userId) || {
      user_id: userId,
      total_tokens: 0,
      installations: 0,
      modelTotals: new Map(),
      projectTotals: new Map(),
    };
    current.total_tokens += Number(row.max_total_tokens || 0);
    current.installations += 1;
    addBreakdown(current.modelTotals, row.max_models || row.latest?.models);
    addBreakdown(current.projectTotals, row.max_projects || row.latest?.projects);
    totals.set(userId, current);
  }
  return [...totals.values()]
    .map((row) => ({
      user_id: row.user_id,
      total_tokens: row.total_tokens,
      installations: row.installations,
      models: breakdownRows(row.modelTotals),
      projects: breakdownRows(row.projectTotals),
    }))
    .sort((a, b) => b.total_tokens - a.total_tokens);
}

export async function readDimensionLeaderboard(date, stateDir = "state") {
  const [day, users] = await Promise.all([
    readJson(paths(stateDir).usage(date), { installations: {} }),
    readDenglemaUsers(stateDir),
  ]);
  const profiles = new Map(users.map((user) => [user.id, user]));
  const models = new Map();
  const projects = new Map();
  let totalTokens = 0;
  let coveredTokens = 0;
  let installations = 0;
  let v2Installations = 0;

  const add = (target, rows, userId) => {
    for (const row of Array.isArray(rows) ? rows : []) {
      const name = String(row?.name || "").trim();
      const tokens = Number(row?.total_tokens || 0);
      if (!name || !Number.isFinite(tokens) || tokens <= 0) continue;
      const current = target.get(name) || {
        name,
        total_tokens: 0,
        contributors: new Map(),
      };
      current.total_tokens += tokens;
      current.contributors.set(
        userId,
        (current.contributors.get(userId) || 0) + tokens,
      );
      target.set(name, current);
    }
  };

  for (const row of Object.values(day.installations || {})) {
    const userId = row?.user_id;
    if (!userId) continue;
    const tokens = Number(row?.max_total_tokens || 0);
    totalTokens += tokens;
    installations += 1;

    const isV2 = Number(row?.latest?.schema_version) === 2;
    if (isV2) {
      coveredTokens += tokens;
      v2Installations += 1;
    }
    add(models, row?.max_models || row?.latest?.models, userId);
    add(projects, row?.max_projects || row?.latest?.projects, userId);
  }

  const rows = (target) => [...target.values()]
    .map((row) => ({
      name: row.name,
      total_tokens: row.total_tokens,
      contributors: [...row.contributors.entries()]
        .map(([user_id, total_tokens]) => ({
          user_id,
          display_name: profiles.get(user_id)?.display_name || "骑手",
          avatar_emoji: profiles.get(user_id)?.avatar_emoji || "🚴",
          total_tokens,
        }))
        .sort((a, b) => b.total_tokens - a.total_tokens),
    }))
    .sort((a, b) => b.total_tokens - a.total_tokens || a.name.localeCompare(b.name));

  return {
    date,
    total_tokens: totalTokens,
    covered_tokens: coveredTokens,
    coverage_ratio: totalTokens > 0 ? coveredTokens / totalTokens : 0,
    installations,
    v2_installations: v2Installations,
    models: rows(models),
    projects: rows(projects),
  };
}
