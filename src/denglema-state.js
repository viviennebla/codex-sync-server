import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const MAX_USAGE_HISTORY_SAMPLES = 96;

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

export const DENGLEMA_TRANSPORTS = Object.freeze([
  "bike",
  "scooter",
  "skateboard",
  "walk",
  "surf",
  "skate",
]);

export function normalizeDenglemaTransport(value) {
  const transport = String(value || "bike").trim().toLowerCase();
  if (!DENGLEMA_TRANSPORTS.includes(transport)) {
    throw new Error("transport must be one of: " + DENGLEMA_TRANSPORTS.join(", "));
  }
  return transport;
}

export const MAX_DENGLEMA_SLOGANS = 8;
export const MAX_DENGLEMA_SLOGAN_LENGTH = 28;
export const DENGLEMA_OFFICE_X_MIN = 22;
export const DENGLEMA_OFFICE_X_MAX = 78;

export function normalizeDenglemaSlogans(value) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error("slogans must be an array");
  if (value.length > MAX_DENGLEMA_SLOGANS) {
    throw new Error("slogans supports at most " + MAX_DENGLEMA_SLOGANS + " lines");
  }
  const seen = new Set();
  const slogans = [];
  for (const item of value) {
    const slogan = String(item ?? "").replace(/\s+/g, " ").trim();
    if (!slogan) continue;
    if ([...slogan].length > MAX_DENGLEMA_SLOGAN_LENGTH) {
      throw new Error("each slogan must be at most " + MAX_DENGLEMA_SLOGAN_LENGTH + " characters");
    }
    if (seen.has(slogan)) continue;
    seen.add(slogan);
    slogans.push(slogan);
  }
  return slogans;
}

export function normalizeDenglemaOfficePosition(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("office_position must be an object");
  }
  const lane = Number(value.lane);
  const x = Number(value.x);
  if (!Number.isInteger(lane) || lane < 1 || lane > 4) {
    throw new Error("office_position lane must be 1-4");
  }
  if (!Number.isFinite(x) || x < DENGLEMA_OFFICE_X_MIN || x > DENGLEMA_OFFICE_X_MAX) {
    throw new Error(
      "office_position x must be between "
      + DENGLEMA_OFFICE_X_MIN
      + " and "
      + DENGLEMA_OFFICE_X_MAX
    );
  }
  return { lane, x: Math.round(x * 10) / 10 };
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
    transport: "bike",
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

export async function updateWebUserAvatar(userId, avatarUrl, stateDir = "state", options = {}) {
  const id = String(userId || "").trim();
  if (!id) return null;
  const file = paths(stateDir).users;
  const store = await readJson(file, { version: 1, by_id: {} });
  const user = store.by_id?.[id];
  if (!user) return null;

  user.avatar_url = avatarUrl ? String(avatarUrl) : null;
  user.updated_at = (options.now?.() || new Date()).toISOString();
  store.by_id[id] = user;
  await writeJson(file, store);
  return user;
}

export async function updateWebUserEmoji(userId, avatarEmoji, stateDir = "state", options = {}) {
  const id = String(userId || "").trim();
  if (!id) return null;
  const file = paths(stateDir).users;
  const store = await readJson(file, { version: 1, by_id: {} });
  const user = store.by_id?.[id];
  if (!user) return null;

  user.avatar_emoji = cleanAvatarEmoji(avatarEmoji);
  user.avatar_url = null;
  user.updated_at = (options.now?.() || new Date()).toISOString();
  store.by_id[id] = user;
  await writeJson(file, store);
  return user;
}

export async function updateWebUserTransport(userId, transport, stateDir = "state", options = {}) {
  const id = String(userId || "").trim();
  if (!id) return null;
  const file = paths(stateDir).users;
  const store = await readJson(file, { version: 1, by_id: {} });
  const user = store.by_id?.[id];
  if (!user) return null;

  user.transport = normalizeDenglemaTransport(transport);
  user.updated_at = (options.now?.() || new Date()).toISOString();
  store.by_id[id] = user;
  await writeJson(file, store);
  return user;
}

export async function updateWebUserSlogans(userId, slogans, stateDir = "state", options = {}) {
  const id = String(userId || "").trim();
  if (!id) return null;
  const file = paths(stateDir).users;
  const store = await readJson(file, { version: 1, by_id: {} });
  const user = store.by_id?.[id];
  if (!user) return null;

  user.slogans = normalizeDenglemaSlogans(slogans);
  user.updated_at = (options.now?.() || new Date()).toISOString();
  store.by_id[id] = user;
  await writeJson(file, store);
  return user;
}

export async function updateWebUserEquippedAchievement(userId, achievementId, stateDir = "state", options = {}) {
  const id = String(userId || "").trim();
  if (!id) return null;
  const file = paths(stateDir).users;
  const store = await readJson(file, { version: 1, by_id: {} });
  const user = store.by_id?.[id];
  if (!user) return null;

  user.equipped_achievement_id = achievementId ? String(achievementId) : null;
  user.updated_at = (options.now?.() || new Date()).toISOString();
  store.by_id[id] = user;
  await writeJson(file, store);
  return user;
}

export async function readDenglemaUsers(stateDir = "state") {
  const store = await readJson(paths(stateDir).users, { by_id: {} });
  return Object.values(store.by_id || {});
}

export async function readDenglemaOfficeLayoutVersion(stateDir = "state") {
  const store = await readJson(paths(stateDir).users, { layout_version: 0 });
  return Math.max(0, Number(store.layout_version || 0));
}

let officeLayoutWriteQueue = Promise.resolve();

export async function updateWebUserOfficePosition(
  userId,
  position,
  expectedLayoutVersion,
  stateDir = "state",
  options = {},
) {
  const id = String(userId || "").trim();
  if (!id) return null;
  const expected = Number(expectedLayoutVersion);
  if (!Number.isInteger(expected) || expected < 0) {
    throw new Error("expected_layout_version must be a non-negative integer");
  }
  const normalized = normalizeDenglemaOfficePosition(position);

  const run = officeLayoutWriteQueue.then(async () => {
    const file = paths(stateDir).users;
    const store = await readJson(file, { version: 1, by_id: {}, layout_version: 0 });
    const currentVersion = Math.max(0, Number(store.layout_version || 0));
    if (currentVersion !== expected) {
      const error = new Error("office layout changed");
      error.code = "DENGLEMA_LAYOUT_CONFLICT";
      error.layout_version = currentVersion;
      throw error;
    }

    const user = store.by_id?.[id];
    if (!user) return null;
    const nextVersion = currentVersion + 1;
    user.office_position = normalized;
    user.updated_at = (options.now?.() || new Date()).toISOString();
    store.by_id[id] = user;
    store.layout_version = nextVersion;
    await writeJson(file, store);
    return { user, layout_version: nextVersion };
  });

  officeLayoutWriteQueue = run.catch(() => {});
  return run;
}

function normalizeHarness(value) {
  if (value == null || value === "") return null;
  const harness = String(value).trim().toLowerCase();
  if (!/^[a-z0-9._-]{1,32}$/.test(harness)) {
    throw new Error("Invalid harness");
  }
  return harness;
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

function mergeUsageHistory(existing = [], incoming = null) {
  const byObservedAt = new Map();
  for (const row of [...(Array.isArray(existing) ? existing : []), incoming]) {
    const observed = Date.parse(row?.observed_at || "");
    const total = Number(row?.total_tokens);
    if (!Number.isFinite(observed) || !Number.isSafeInteger(total) || total < 0) continue;
    byObservedAt.set(new Date(observed).toISOString(), total);
  }

  let monotonicTotal = 0;
  return [...byObservedAt.entries()]
    .sort((a, b) => Date.parse(a[0]) - Date.parse(b[0]))
    .map(([observed_at, total_tokens]) => {
      monotonicTotal = Math.max(monotonicTotal, total_tokens);
      return { observed_at, total_tokens: monotonicTotal };
    })
    .slice(-MAX_USAGE_HISTORY_SAMPLES);
}

function normalizeUsageLimitPercent(value, field) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 100) {
    throw new Error(`Invalid ${field}`);
  }
  return number;
}

function normalizeUsageLimitWindow(window, field) {
  if (window === null || window === undefined) return null;
  if (typeof window !== "object" || Array.isArray(window)) {
    throw new Error(`Invalid ${field}`);
  }

  let used = normalizeUsageLimitPercent(window.used_percent, `${field}.used_percent`);
  let remaining = normalizeUsageLimitPercent(window.remaining_percent, `${field}.remaining_percent`);
  if (used === null && remaining === null) {
    throw new Error(`Invalid ${field}: missing quota percentage`);
  }
  if (used !== null && remaining !== null && Math.abs((used + remaining) - 100) > 0.5) {
    throw new Error(`Invalid ${field}: used + remaining must equal 100`);
  }
  if (used === null) used = 100 - remaining;
  if (remaining === null) remaining = 100 - used;

  const windowMinutesRaw = window.window_minutes;
  const windowMinutes = windowMinutesRaw === null || windowMinutesRaw === undefined
    ? null
    : Number(windowMinutesRaw);
  if (windowMinutes !== null && (!Number.isFinite(windowMinutes) || windowMinutes < 0)) {
    throw new Error(`Invalid ${field}.window_minutes`);
  }

  let resetsAt = null;
  if (window.resets_at !== null && window.resets_at !== undefined) {
    const parsed = Date.parse(window.resets_at);
    if (!Number.isFinite(parsed)) throw new Error(`Invalid ${field}.resets_at`);
    resetsAt = new Date(parsed).toISOString();
  }

  return {
    used_percent: used,
    remaining_percent: remaining,
    window_minutes: windowMinutes,
    resets_at: resetsAt,
  };
}

function normalizeUsageLimits(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid usage_limits");
  }

  const updatedAt = Date.parse(value.updated_at || "");
  if (!Number.isFinite(updatedAt)) throw new Error("Invalid usage_limits.updated_at");
  const primary = normalizeUsageLimitWindow(value.primary, "usage_limits.primary");
  const secondary = normalizeUsageLimitWindow(value.secondary, "usage_limits.secondary");
  if (!primary && !secondary) throw new Error("usage_limits must include a quota window");

  return {
    updated_at: new Date(updatedAt).toISOString(),
    primary,
    secondary,
  };
}

export function validateUsageSample(sample) {
  const version = Number(sample?.schema_version);
  if (version !== 1 && version !== 2) throw new Error("Unsupported usage sample schema");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(sample.date || ""))) throw new Error("Invalid usage date");
  const observed = Date.parse(sample.observed_at || "");
  if (!Number.isFinite(observed)) throw new Error("Invalid observed_at");
  const total = Number(sample.total_tokens);
  if (!Number.isSafeInteger(total) || total < 0) throw new Error("Invalid total_tokens");
  const usageLimits = version === 2 ? normalizeUsageLimits(sample.usage_limits) : null;

  return {
    schema_version: version,
    date: sample.date,
    observed_at: new Date(observed).toISOString(),
    total_tokens: total,
    ...(version === 2 ? {
      harness: normalizeHarness(sample.harness),
      models: normalizeUsageBreakdown(sample.models, "models"),
      projects: normalizeUsageBreakdown(sample.projects, "projects"),
      ...(usageLimits ? { usage_limits: usageLimits } : {}),
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
  const firstUserInstallation = !Object.values(installations.items || {}).some(
    (item) => item.user_id === pairing.user_id,
  );
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

  return {
    installation_id: installationId,
    user_id: pairing.user_id,
    token: rawToken,
    first_user_installation: firstUserInstallation,
    created_at: now.toISOString(),
  };
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
  const previousAcceptedTotal = Number(existing?.max_total_tokens || 0);
  const reset = Boolean(existing && sample.total_tokens < existing.max_total_tokens);
  const acceptedTotal = existing ? Math.max(existing.max_total_tokens, sample.total_tokens) : sample.total_tokens;
  const acceptedModels = mergeMaxBreakdown(existing?.max_models, sample.models);
  const acceptedProjects = mergeMaxBreakdown(existing?.max_projects, sample.projects);
  const historySeed = Array.isArray(existing?.history)
    ? existing.history
    : [existing?.previous, existing?.latest].filter(Boolean);
  const history = mergeUsageHistory(historySeed, sample);
  day.version = 2;
  day.installations[installation.id] = {
    installation_id: installation.id,
    user_id: installation.user_id,
    previous: existing?.latest || null,
    latest: sample,
    max_total_tokens: acceptedTotal,
    max_models: acceptedModels,
    max_projects: acceptedProjects,
    history,
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
    previous_accepted_total: previousAcceptedTotal,
    accepted_delta: Math.max(0, acceptedTotal - previousAcceptedTotal),
    first_sample: !existing,
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
        harness: usage?.latest?.harness || null,
        models: usage?.max_models || [],
        projects: usage?.max_projects || [],
        usage_limits: usage?.latest?.usage_limits || null,
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
      quota_remaining_percent: null,
      quota_updated_at: null,
    };
    current.total_tokens += Number(row.max_total_tokens || 0);
    current.installations += 1;
    addBreakdown(current.modelTotals, row.max_models || row.latest?.models);
    addBreakdown(current.projectTotals, row.max_projects || row.latest?.projects);

    const usageLimits = row.latest?.usage_limits || null;
    const remainingValues = [
      usageLimits?.primary?.remaining_percent,
      usageLimits?.secondary?.remaining_percent,
    ].map(Number).filter(Number.isFinite);
    if (remainingValues.length) {
      const remaining = Math.min(...remainingValues);
      const updatedAt = Date.parse(usageLimits?.updated_at || "");
      const currentUpdatedAt = Date.parse(current.quota_updated_at || "");
      if (Number.isFinite(updatedAt)) {
        if (!Number.isFinite(currentUpdatedAt) || updatedAt > currentUpdatedAt) {
          current.quota_remaining_percent = remaining;
          current.quota_updated_at = new Date(updatedAt).toISOString();
        } else if (updatedAt === currentUpdatedAt) {
          current.quota_remaining_percent = current.quota_remaining_percent === null
            ? remaining
            : Math.min(current.quota_remaining_percent, remaining);
        }
      }
    }
    totals.set(userId, current);
  }
  return [...totals.values()]
    .map((row) => ({
      user_id: row.user_id,
      total_tokens: row.total_tokens,
      installations: row.installations,
      models: breakdownRows(row.modelTotals),
      projects: breakdownRows(row.projectTotals),
      ...(Number.isFinite(row.quota_remaining_percent) ? {
        quota_remaining_percent: row.quota_remaining_percent,
        quota_pressure: Math.max(0, Math.min(1, (100 - row.quota_remaining_percent) / 100)),
        quota_updated_at: row.quota_updated_at,
      } : {}),
    }))
    .sort((a, b) => b.total_tokens - a.total_tokens);
}

export async function readUserUsageHistory(userId, date, stateDir = "state") {
  const user = String(userId || "").trim();
  if (!user) return [];

  const day = await readJson(paths(stateDir).usage(date), { installations: {} });
  const events = [];
  for (const row of Object.values(day.installations || {})) {
    if (row?.user_id !== user) continue;
    const history = Array.isArray(row.history) ? row.history : [];
    for (const sample of history) {
      const observed = Date.parse(sample?.observed_at || "");
      const total = Number(sample?.total_tokens);
      if (!Number.isFinite(observed) || !Number.isSafeInteger(total) || total < 0) continue;
      events.push({
        installation_id: row.installation_id,
        observed_at: new Date(observed).toISOString(),
        total_tokens: total,
      });
    }
  }

  events.sort((a, b) => (
    Date.parse(a.observed_at) - Date.parse(b.observed_at)
    || a.installation_id.localeCompare(b.installation_id)
  ));

  const totalsByInstallation = new Map();
  const seenInstallations = new Set();
  const samples = [];
  for (let index = 0; index < events.length;) {
    const observedAt = events[index].observed_at;
    let introducedInstallation = false;
    while (index < events.length && events[index].observed_at === observedAt) {
      const event = events[index];
      if (!seenInstallations.has(event.installation_id)) {
        seenInstallations.add(event.installation_id);
        introducedInstallation = true;
      }
      totalsByInstallation.set(event.installation_id, event.total_tokens);
      index += 1;
    }
    samples.push({
      observed_at: observedAt,
      total_tokens: [...totalsByInstallation.values()].reduce((sum, value) => sum + value, 0),
      installations: seenInstallations.size,
      introduced_installation: introducedInstallation,
    });
  }

  return samples;
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
