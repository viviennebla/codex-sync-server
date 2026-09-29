import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { readFile, readdir, mkdir, writeFile, rm } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readDeviceStates, writeDeviceState, removeDeviceState } from "./state.js";
import {
  authenticateInstallation,
  consumePairingCode,
  createPairingCode,
  createWebUser,
  readPairingCodeStatus,
  readDenglemaUser,
  readDenglemaUsers,
  readDimensionLeaderboard,
  recoverWebUser,
  readUserInstallations,
  readUserTotals,
  revokeUserInstallation,
  upsertUsageSample,
  updateWebUserAvatar,
} from "./denglema-state.js";
import { createCodexRunwayReader } from "./codex-runway.js";
import {
  clearSessionCookie,
  createWebSession,
  parseCookieHeader,
  sessionCookie,
  verifyWebSession,
} from "./denglema-auth.js";

const PORT = Number(process.env.PORT) || 34777;
const BIND = process.env.BIND || "0.0.0.0";
const STATE_DIR = process.env.STATE_DIR || "state";
const SKILLS_DIR = process.env.SKILLS_DIR || "skills-store";
const SKILL_BUNDLE_FILE = "skills-bundle.json";
const TOKEN = process.env.DASHBOARD_TOKEN || null;
const DENGLEMA_TIMEZONE = process.env.DENGLEMA_TIMEZONE || "UTC";
const DENGLEMA_BASE_URL = (process.env.DENGLEMA_BASE_URL || `http://${BIND}:${PORT}`).replace(/\/+$/, "");
const DENGLEMA_SESSION_SECRET = process.env.DENGLEMA_SESSION_SECRET || TOKEN || "";
const WEB_SESSION_TTL_SECONDS = Number(process.env.DENGLEMA_SESSION_TTL_SECONDS) || 90 * 24 * 60 * 60;
const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
const STARTED_AT = Date.now();
const RESET_BEG_FILE = join(STATE_DIR, "denglema", "reset-beg.json");
const AVATAR_DIR = join(STATE_DIR, "denglema", "avatars");
const readCodexRunwayStatus = createCodexRunwayReader();

/* ── Logging ─────────────────────────────── */

function log(level, msg, extra = {}) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...extra,
  };
  const line = JSON.stringify(entry);
  if (level === "error") process.stderr.write(line + "\n");
  else process.stdout.write(line + "\n");
}

/* ── Auth ─────────────────────────────────── */

function bearerToken(req) {
  const header = req.headers.authorization || "";
  return header.replace(/^Bearer\s+/i, "").trim();
}

function checkAuth(req) {
  if (!TOKEN) return true; // auth disabled if no token configured
  return bearerToken(req) === TOKEN;
}

function requestIsSecure(req) {
  return DENGLEMA_BASE_URL.startsWith("https://")
    || String(req.headers["x-forwarded-proto"] || "").toLowerCase() === "https";
}

function currentDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: DENGLEMA_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function trailingDateKeys(endDate, days = 7) {
  const anchor = new Date(`${endDate}T12:00:00Z`);
  if (!Number.isFinite(anchor.getTime())) return [];
  return Array.from({ length: days }, (_value, index) => {
    const date = new Date(anchor.getTime() - (days - 1 - index) * 24 * 60 * 60 * 1000);
    return date.toISOString().slice(0, 10);
  });
}

async function webUserFromRequest(req) {
  if (!DENGLEMA_SESSION_SECRET) return null;
  const cookies = parseCookieHeader(req.headers.cookie || "");
  const session = verifyWebSession(cookies.denglema_session, DENGLEMA_SESSION_SECRET);
  if (!session?.user_id) return null;
  return readDenglemaUser(session.user_id, STATE_DIR);
}

/* ── Helpers ──────────────────────────────── */

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw.trim()) return resolve(null);
      try { resolve(JSON.parse(raw)); } catch { resolve(null); }
    });
  });
}

function sendJson(res, status, data, headers = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...headers,
  });
  res.end(body);
}

function sendError(res, status, message) {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  res.end(message);
}

function decodeAvatarDataUrl(value) {
  const match = String(value || "").match(/^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error("Avatar must be a JPEG data URL");
  const bytes = Buffer.from(match[1], "base64");
  if (bytes.length < 4 || bytes.length > 300 * 1024) {
    throw new Error("Avatar must be smaller than 300 KB");
  }
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) {
    throw new Error("Invalid JPEG avatar");
  }
  return bytes;
}

async function sendStatic(res, filename, contentType) {
  const body = await readFile(join(PUBLIC_DIR, filename));
  res.writeHead(200, {
    "content-type": contentType,
    "cache-control": "no-store",
  });
  res.end(body);
}

async function readJson(path) {
  try { return JSON.parse(await readFile(path, "utf8")); } catch { return null; }
}

async function writeJson(path, data) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2), "utf8");
}

let resetBegWriteQueue = Promise.resolve();

async function readResetBeg(epochId) {
  const value = await readJson(RESET_BEG_FILE);
  if (!value || value.epoch_id !== epochId) {
    return { epoch_id: epochId, count: 0, updated_at: null };
  }
  return {
    epoch_id: epochId,
    count: Math.max(0, Number(value.count || 0)),
    updated_at: value.updated_at || null,
  };
}

async function incrementResetBeg(epochId) {
  const run = resetBegWriteQueue.then(async () => {
    const current = await readResetBeg(epochId);
    const next = {
      epoch_id: epochId,
      count: current.count + 1,
      updated_at: new Date().toISOString(),
    };
    await writeJson(RESET_BEG_FILE, next);
    return next;
  });
  resetBegWriteQueue = run.catch(() => {});
  return run;
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

function validSkillName(name) {
  return typeof name === "string"
    && name.trim().length > 0
    && name !== "."
    && name !== ".."
    && !name.includes("/")
    && !name.includes("\\");
}

function safeBundlePath(path) {
  const normalized = String(path || "").replace(/\\/g, "/");
  if (!normalized || normalized.startsWith("/") || normalized.split("/").some((part) => part === ".." || part === "")) {
    throw new Error(`Unsafe bundle path: ${path}`);
  }
  return normalized;
}

function bundleHash(files = []) {
  const hash = createHash("sha256");
  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    hash.update(file.path);
    hash.update("\0");
    hash.update(file.sha256 || sha256(file.content || ""));
    hash.update("\0");
  }
  return hash.digest("hex").slice(0, 16);
}

function canonicalSkillMarkdown(name, files = {}) {
  const markdownFiles = Object.entries(files)
    .filter(([path, content]) => path.toLowerCase().endsWith(".md") && typeof content === "string")
    .sort(([a], [b]) => a.localeCompare(b));
  const primary = markdownFiles.find(([path]) => path.split(/[\\/]/).at(-1)?.toLowerCase() === "skill.md");
  if (primary) return primary[1].trimEnd() + "\n";
  if (markdownFiles.length === 1) return markdownFiles[0][1].trimEnd() + "\n";
  if (!markdownFiles.length) return "";
  return [
    `# ${name}`,
    "",
    ...markdownFiles.flatMap(([path, content]) => [`## ${path}`, "", content.trim(), ""]),
  ].join("\n").trimEnd() + "\n";
}

async function readSkillFiles(root) {
  const files = {};
  async function collect(directory, prefix = "") {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(directory, entry.name);
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await collect(fullPath, relativePath);
      else if (entry.isFile() && entry.name !== "meta.json") files[relativePath] = await readFile(fullPath, "utf8");
    }
  }
  await collect(root);
  return files;
}

function normalizeSkillBundle(bundle, deviceId = "unknown") {
  if (!bundle?.files || !Array.isArray(bundle.files)) throw new Error("Invalid skill bundle payload");
  const files = bundle.files.map((file) => {
    const content = String(file.content ?? "").trimEnd() + "\n";
    return {
      path: safeBundlePath(file.path),
      content,
      sha256: file.sha256 || sha256(content),
      last_modified: file.last_modified || null,
    };
  }).sort((a, b) => a.path.localeCompare(b.path));
  return {
    version: 1,
    generated_at: bundle.generated_at || new Date().toISOString(),
    source_dir: bundle.source_dir || null,
    device_id: bundle.device_id || deviceId,
    sha256: bundle.sha256 || bundleHash(files),
    file_count: files.length,
    skills: Array.isArray(bundle.skills) ? bundle.skills : [],
    files,
  };
}

async function readStoredSkillBundle() {
  const stored = await readJson(join(STATE_DIR, SKILL_BUNDLE_FILE));
  return stored?.files && Array.isArray(stored.files) ? stored : null;
}

async function writeStoredSkillBundle(bundle) {
  const normalized = normalizeSkillBundle(bundle, bundle?.device_id || "unknown");
  await writeJson(join(STATE_DIR, SKILL_BUNDLE_FILE), normalized);
  return normalized;
}

async function buildLegacySkillBundle() {
  const files = [];
  const skills = [];
  try {
    const entries = (await readdir(SKILLS_DIR, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const name = entry.name;
      if (!validSkillName(name)) continue;
      const skillDir = join(SKILLS_DIR, name);
      const skillFiles = await readSkillFiles(skillDir);
      const markdown = skillFiles["skill.md"] || canonicalSkillMarkdown(name, skillFiles);
      if (!markdown.trim()) continue;
      const meta = await readJson(join(skillDir, "meta.json")) || {};
      const content = markdown.trimEnd() + "\n";
      const file = {
        path: `${name}.md`,
        content,
        sha256: sha256(content),
        last_modified: meta.last_modified || null,
      };
      files.push(file);
      skills.push({
        name,
        markdown: content,
        last_modified: meta.last_modified || null,
        sha256: meta.sha256 || file.sha256,
        markdown_file_count: meta.markdown_file_count || 1,
        source_markdown: file.path,
        device_id: meta.device_id || "unknown",
      });
    }
  } catch {}
  if (!files.length) return null;
  return normalizeSkillBundle({
    version: 1,
    source_dir: null,
    generated_at: new Date().toISOString(),
    files,
    skills,
  }, "legacy-skills-store");
}

/* ── Routes ───────────────────────────────── */

const server = createServer(async (req, res) => {
  const start = Date.now();
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const method = req.method;

    // ── POST /api/auth/register ── create a lightweight Denglema web identity
    if (method === "POST" && url.pathname === "/api/auth/register") {
      const body = await readBody(req);
      try {
        const created = await createWebUser({
          display_name: body?.display_name,
          avatar_emoji: body?.avatar_emoji,
        }, STATE_DIR);
        const session = createWebSession(created.user.id, DENGLEMA_SESSION_SECRET, {
          ttlSeconds: WEB_SESSION_TTL_SECONDS,
        });
        sendJson(res, 201, {
          ok: true,
          user: {
            user_id: created.user.id,
            display_name: created.user.display_name,
            avatar_emoji: created.user.avatar_emoji,
            avatar_url: created.user.avatar_url || null,
          },
          recovery_code: created.recovery_code,
        }, {
          "set-cookie": sessionCookie(session, {
            secure: requestIsSecure(req),
            maxAge: WEB_SESSION_TTL_SECONDS,
          }),
        });
      } catch (error) {
        sendError(res, 400, error?.message || "Could not create user");
      }
      return;
    }

    // ── POST /api/auth/recover ── restore the same Denglema user on another browser
    if (method === "POST" && url.pathname === "/api/auth/recover") {
      const body = await readBody(req);
      const user = await recoverWebUser(body?.recovery_code, STATE_DIR);
      if (!user) {
        sendError(res, 401, "Invalid recovery code");
        return;
      }
      const session = createWebSession(user.id, DENGLEMA_SESSION_SECRET, {
        ttlSeconds: WEB_SESSION_TTL_SECONDS,
      });
      sendJson(res, 200, {
        ok: true,
        user: {
          user_id: user.id,
          display_name: user.display_name || "骑手",
          avatar_emoji: user.avatar_emoji || "🚴",
          avatar_url: user.avatar_url || null,
        },
      }, {
        "set-cookie": sessionCookie(session, {
          secure: requestIsSecure(req),
          maxAge: WEB_SESSION_TTL_SECONDS,
        }),
      });
      return;
    }

    // ── POST /api/auth/logout ── clear local session
    if (method === "POST" && url.pathname === "/api/auth/logout") {
      sendJson(res, 200, { ok: true }, {
        "set-cookie": clearSessionCookie({ secure: requestIsSecure(req) }),
      });
      return;
    }

    // ── PUT/DELETE /api/me/avatar ── update rider profile image
    if (url.pathname === "/api/me/avatar" && (method === "PUT" || method === "DELETE")) {
      const user = await webUserFromRequest(req);
      if (!user) {
        sendJson(res, 401, { error: "Not logged in" });
        return;
      }
      const avatarPath = join(AVATAR_DIR, user.id + ".jpg");

      if (method === "DELETE") {
        await rm(avatarPath, { force: true });
        const updated = await updateWebUserAvatar(user.id, null, STATE_DIR);
        sendJson(res, 200, {
          ok: true,
          user: {
            user_id: updated.id,
            display_name: updated.display_name || "骑手",
            avatar_emoji: updated.avatar_emoji || "🚴",
            avatar_url: null,
          },
        });
        return;
      }

      const contentLength = Number(req.headers["content-length"] || 0);
      if (contentLength > 420 * 1024) {
        sendError(res, 413, "Avatar payload is too large");
        return;
      }
      const body = await readBody(req);
      try {
        const bytes = decodeAvatarDataUrl(body?.image_data_url);
        await mkdir(AVATAR_DIR, { recursive: true });
        await writeFile(avatarPath, bytes, { mode: 0o600 });
        const avatarUrl = "/api/avatars/" + encodeURIComponent(user.id) + ".jpg?v=" + Date.now();
        const updated = await updateWebUserAvatar(user.id, avatarUrl, STATE_DIR);
        sendJson(res, 200, {
          ok: true,
          user: {
            user_id: updated.id,
            display_name: updated.display_name || "骑手",
            avatar_emoji: updated.avatar_emoji || "🚴",
            avatar_url: updated.avatar_url,
          },
        });
      } catch (error) {
        sendError(res, 400, error?.message || "Could not update avatar");
      }
      return;
    }

    // ── GET /api/avatars/:id.jpg ── public rider avatar asset
    const avatarMatch = url.pathname.match(/^\/api\/avatars\/([A-Za-z0-9_-]+)\.jpg$/);
    if (method === "GET" && avatarMatch) {
      try {
        const body = await readFile(join(AVATAR_DIR, avatarMatch[1] + ".jpg"));
        res.writeHead(200, {
          "content-type": "image/jpeg",
          "cache-control": "public, max-age=86400, immutable",
          "x-content-type-options": "nosniff",
        });
        res.end(body);
      } catch {
        sendError(res, 404, "Avatar not found");
      }
      return;
    }

    // ── GET /api/me ── current Denglema user
    if (method === "GET" && url.pathname === "/api/me") {
      const user = await webUserFromRequest(req);
      if (!user) {
        sendJson(res, 401, { error: "Not logged in" });
        return;
      }
      const date = currentDateKey();
      const [totals, installations] = await Promise.all([
        readUserTotals(date, STATE_DIR),
        readUserInstallations(user.id, date, STATE_DIR),
      ]);
      const today = totals.find((row) => row.user_id === user.id) || null;
      sendJson(res, 200, {
        user: {
          user_id: user.id,
          display_name: user.display_name || "骑手",
          avatar_emoji: user.avatar_emoji || "🚴",
          avatar_url: user.avatar_url || null,
          today_tokens: today?.total_tokens || 0,
          has_today_sample: Boolean(today),
          installation_count: installations.length,
          latest_seen_at: installations
            .map((item) => item.last_seen_at)
            .filter(Boolean)
            .sort()
            .at(-1) || null,
          needs_onboarding: installations.length === 0,
        },
      });
      return;
    }

    // ── GET /api/me/installations ── current user's bound native Codex environments
    if (method === "GET" && url.pathname === "/api/me/installations") {
      const user = await webUserFromRequest(req);
      if (!user) {
        sendJson(res, 401, { error: "Not logged in" });
        return;
      }
      const date = url.searchParams.get("date") || currentDateKey();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        sendError(res, 400, "Invalid date");
        return;
      }
      const installations = await readUserInstallations(user.id, date, STATE_DIR);
      sendJson(res, 200, {
        date,
        total_tokens: installations.reduce((sum, item) => sum + item.today_tokens, 0),
        installations,
      });
      return;
    }

    // ── DELETE /api/me/installations/:id ── revoke one of the current user's installations
    const revokeInstallationMatch = url.pathname.match(/^\/api\/me\/installations\/([^/]+)$/);
    if (method === "DELETE" && revokeInstallationMatch) {
      const user = await webUserFromRequest(req);
      if (!user) {
        sendJson(res, 401, { error: "Not logged in" });
        return;
      }
      const installationId = decodeURIComponent(revokeInstallationMatch[1]);
      const revoked = await revokeUserInstallation(user.id, installationId, STATE_DIR);
      if (!revoked) {
        sendError(res, 404, "Installation not found");
        return;
      }
      sendJson(res, 200, { ok: true, installation: revoked });
      return;
    }

    // ── GET /api/riders/:id ── lightweight rider detail for the race UI
    const riderDetailMatch = url.pathname.match(/^\/api\/riders\/([^/]+)$/);
    if (method === "GET" && riderDetailMatch) {
      const viewer = await webUserFromRequest(req);
      if (!viewer) {
        sendJson(res, 401, { error: "Not logged in" });
        return;
      }
      const userId = decodeURIComponent(riderDetailMatch[1]);
      const rider = await readDenglemaUser(userId, STATE_DIR);
      if (!rider) {
        sendError(res, 404, "Rider not found");
        return;
      }
      const date = url.searchParams.get("date") || currentDateKey();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        sendError(res, 400, "Invalid date");
        return;
      }

      const dates = trailingDateKeys(date, 7);
      const [todayTotals, installations, ...history] = await Promise.all([
        readUserTotals(date, STATE_DIR),
        readUserInstallations(userId, date, STATE_DIR),
        ...dates.map((key) => readUserTotals(key, STATE_DIR)),
      ]);
      const today = todayTotals.find((row) => row.user_id === userId) || null;
      const trend = dates.map((key, index) => {
        const row = history[index]?.find((item) => item.user_id === userId) || null;
        return { date: key, total_tokens: row?.total_tokens || 0 };
      });

      sendJson(res, 200, {
        date,
        user: {
          user_id: rider.id,
          display_name: rider.display_name || "骑手",
          avatar_emoji: rider.avatar_emoji || "🚴",
          avatar_url: rider.avatar_url || null,
        },
        today_tokens: today?.total_tokens || 0,
        models: today?.models || [],
        projects: today?.projects || [],
        installations: installations.map((item) => ({
          id: item.id,
          name: item.name,
          harness: item.harness || null,
          today_tokens: item.today_tokens,
          last_seen_at: item.last_seen_at,
        })),
        trend,
      });
      return;
    }

    // ── GET/POST /api/reset-beg ── playful Denglema-wide reset begging counter
    if (url.pathname === "/api/reset-beg" && (method === "GET" || method === "POST")) {
      let epochId = "no-signal";
      try {
        const runway = await readCodexRunwayStatus();
        epochId = runway?.latest_signal?.id || "no-signal";
      } catch {}
      if (method === "POST") {
        const user = await webUserFromRequest(req);
        if (!user) {
          sendJson(res, 401, { error: "Not logged in" });
          return;
        }
        sendJson(res, 200, { ok: true, ...(await incrementResetBeg(epochId)) });
        return;
      }
      sendJson(res, 200, { ok: true, ...(await readResetBeg(epochId)) });
      return;
    }

    // ── GET /api/codex-runway ── cached public reset signal
    if (method === "GET" && url.pathname === "/api/codex-runway") {
      try {
        sendJson(res, 200, await readCodexRunwayStatus());
      } catch (error) {
        log("error", "codex_runway_failed", { error: error?.message || String(error) });
        sendJson(res, 503, { ok: false, error: "codex_runway_unavailable" });
      }
      return;
    }

    // ── GET /api/leaderboards/dimensions ── model/project burn board
    if (method === "GET" && url.pathname === "/api/leaderboards/dimensions") {
      const date = url.searchParams.get("date") || currentDateKey();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        sendError(res, 400, "Invalid date");
        return;
      }
      sendJson(res, 200, await readDimensionLeaderboard(date, STATE_DIR));
      return;
    }

    // ── GET /api/riders ── team projection for the future race UI
    if (method === "GET" && url.pathname === "/api/riders") {
      const date = url.searchParams.get("date") || currentDateKey();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        sendError(res, 400, "Invalid date");
        return;
      }
      const [totals, users] = await Promise.all([
        readUserTotals(date, STATE_DIR),
        readDenglemaUsers(STATE_DIR),
      ]);
      const totalsByUser = new Map(totals.map((row) => [row.user_id, row]));
      sendJson(res, 200, {
        date,
        riders: users.map((user) => {
          const row = totalsByUser.get(user.id) || null;
          return {
            user_id: user.id,
            display_name: user.display_name || "骑手",
            avatar_emoji: user.avatar_emoji || "🚴",
            avatar_url: user.avatar_url || null,
            today_tokens: row?.total_tokens || 0,
            installations: row?.installations || 0,
            recent_rate_tpm: null,
          };
        }),
      });
      return;
    }

    // ── GET /health ──
    if (method === "GET" && url.pathname === "/health") {
      const devices = await readDeviceStates(STATE_DIR);
      sendJson(res, 200, {
        ok: true,
        uptime_seconds: Math.floor((Date.now() - STARTED_AT) / 1000),
        device_count: devices.size,
        auth_enabled: !!TOKEN,
        denglema_auth_configured: Boolean(DENGLEMA_SESSION_SECRET),
      });
      log("info", "health", { status: 200, ms: Date.now() - start });
      return;
    }

    // ── POST /api/pairing-codes ── logged-in user creates own pairing code
    if (method === "POST" && url.pathname === "/api/pairing-codes") {
      const webUser = await webUserFromRequest(req);
      let userId = webUser?.id || null;

      // Keep bearer-admin compatibility for development/bootstrap only.
      if (!userId) {
        if (!TOKEN || !checkAuth(req)) {
          sendError(res, 401, "Login required");
          return;
        }
        const body = await readBody(req);
        userId = String(body?.user_id || "").trim();
        if (!userId) {
          sendError(res, 400, "Missing user_id");
          return;
        }
      }

      const pairing = await createPairingCode(userId, STATE_DIR);
      sendJson(res, 200, pairing);
      return;
    }

    // ── GET /api/pairing-codes/:code/status ── let the web page observe CLI binding
    const pairingStatusMatch = url.pathname.match(/^\/api\/pairing-codes\/([^/]+)\/status$/);
    if (method === "GET" && pairingStatusMatch) {
      const webUser = await webUserFromRequest(req);
      if (!webUser) {
        sendError(res, 401, "Login required");
        return;
      }
      const code = decodeURIComponent(pairingStatusMatch[1]);
      const status = await readPairingCodeStatus(code, webUser.id, STATE_DIR);
      if (!status) {
        sendError(res, 404, "Pairing code not found");
        return;
      }
      sendJson(res, 200, status);
      return;
    }

    // ── POST /api/installations/pair ── exchange one-time code for installation credentials
    if (method === "POST" && url.pathname === "/api/installations/pair") {
      const body = await readBody(req);
      if (!body?.code) {
        sendError(res, 400, "Missing pairing code");
        return;
      }
      const result = await consumePairingCode(body.code, body.installation_name, STATE_DIR);
      if (!result) {
        sendError(res, 401, "Invalid or expired pairing code");
        return;
      }
      sendJson(res, 200, { ...result, timezone: DENGLEMA_TIMEZONE });
      return;
    }

    // ── POST /api/usage/sample ── cumulative daily usage for one installation
    if (method === "POST" && url.pathname === "/api/usage/sample") {
      const installation = await authenticateInstallation(bearerToken(req), STATE_DIR);
      if (!installation) {
        sendError(res, 401, "Unauthorized installation");
        return;
      }
      const body = await readBody(req);
      try {
        const result = await upsertUsageSample(installation, body, STATE_DIR);
        sendJson(res, 200, {
          ok: true,
          installation_id: installation.id,
          user_id: installation.user_id,
          ...result,
        });
      } catch (error) {
        sendError(res, 400, error?.message || "Invalid usage sample");
      }
      return;
    }

    // ── POST /api/push ── receive device snapshot
    if (method === "POST" && url.pathname === "/api/push") {
      if (!checkAuth(req)) {
        sendError(res, 401, "Unauthorized — invalid or missing token");
        log("warn", "push rejected", { status: 401, ip: req.socket.remoteAddress });
        return;
      }
      const body = await readBody(req);
      if (!body || !body.device_id) {
        sendError(res, 400, "Missing device_id");
        return;
      }
      if (!body.snapshot) {
        sendError(res, 400, "Missing snapshot");
        return;
      }
      const deviceId = String(body.device_id).replace(/[^a-zA-Z0-9._-]/g, "_");
      const deviceName = body.device_name || deviceId;
      const result = await writeDeviceState(deviceId, deviceName, body.snapshot, STATE_DIR);
      log("info", result.updated ? "push received" : "stale push ignored", {
        device_id: deviceId,
        device_name: deviceName,
        reason: result.reason,
      });
      sendJson(res, 200, { ok: true, device_id: deviceId, ...result });
      return;
    }

    // ── DELETE /api/push?device=... ── remove device
    if (method === "DELETE" && url.pathname === "/api/push") {
      if (!checkAuth(req)) {
        sendError(res, 401, "Unauthorized");
        return;
      }
      const deviceId = url.searchParams.get("device");
      if (!deviceId) {
        sendError(res, 400, "Missing ?device= query parameter");
        return;
      }
      const removed = await removeDeviceState(deviceId, STATE_DIR);
      log("info", removed ? "device removed" : "device not found", { device_id: deviceId });
      sendJson(res, 200, { ok: true, removed: deviceId, existed: removed });
      return;
    }

    // ── GET /api/devices ── list known devices
    if (method === "GET" && url.pathname === "/api/devices") {
      const devices = await readDeviceStates(STATE_DIR);
      const list = [...devices.values()].map((d) => ({
        device_id: d.deviceId,
        device_name: d.deviceName,
        generated_at: d.snapshot?.generated_at || null,
        today_tokens: d.snapshot?.today?.totalTokens || 0,
      }));
      sendJson(res, 200, list);
      return;
    }

    // ── GET /api/snapshot/:deviceId ──
    if (method === "GET" && url.pathname.startsWith("/api/snapshot/")) {
      const deviceId = url.pathname.slice("/api/snapshot/".length);
      if (!deviceId) {
        sendError(res, 400, "Missing device ID");
        return;
      }
      const devices = await readDeviceStates(STATE_DIR);
      const device = devices.get(deviceId);
      if (!device) {
        sendError(res, 404, `Device "${deviceId}" not found`);
        return;
      }
      sendJson(res, 200, device.snapshot);
      return;
    }

    // ── GET /api/skills ── list all stored skills
    if (method === "GET" && url.pathname === "/api/skills") {
      const storedBundle = await readStoredSkillBundle();
      if (storedBundle) {
        sendJson(res, 200, storedBundle.skills || []);
        return;
      }
      const skills = [];
      try {
        const ents = await readdir(SKILLS_DIR, { withFileTypes: true });
        for (const e of ents) {
          if (!e.isDirectory()) continue;
          const metaPath = join(SKILLS_DIR, e.name, "meta.json");
          const meta = await readJson(metaPath);
          if (meta) skills.push(meta);
        }
      } catch {}
      sendJson(res, 200, skills);
      return;
    }

    // ── GET/POST /api/skills/bundle ── sync a complete skill source bundle
    if (url.pathname === "/api/skills/bundle") {
      if (method === "GET") {
        const bundle = await readStoredSkillBundle() || await buildLegacySkillBundle();
        if (!bundle) {
          sendError(res, 404, "No skill bundle is available");
          return;
        }
        sendJson(res, 200, bundle);
        return;
      }
      if (method === "POST") {
        if (!checkAuth(req)) { sendError(res, 401, "Unauthorized"); return; }
        const body = await readBody(req);
        try {
          const bundle = normalizeSkillBundle(body?.bundle || body, body?.device_id || "unknown");
          const stored = await writeStoredSkillBundle(bundle);
          log("info", "skill bundle stored", {
            device: stored.device_id,
            sha256: stored.sha256,
            file_count: stored.file_count,
            skills_count: stored.skills?.length || 0,
          });
          sendJson(res, 200, {
            ok: true,
            sha256: stored.sha256,
            file_count: stored.file_count,
            skills_count: stored.skills?.length || 0,
          });
        } catch (err) {
          sendError(res, 400, err.message || "Invalid skill bundle");
        }
        return;
      }
    }

    // ── POST /api/skills ── upload/update a skill
    if (method === "POST" && url.pathname === "/api/skills") {
      if (!checkAuth(req)) { sendError(res, 401, "Unauthorized"); return; }
      const body = await readBody(req);
      const markdown = typeof body?.markdown === "string"
        ? body.markdown.trimEnd() + "\n"
        : canonicalSkillMarkdown(body?.name, body?.files);
      if (!body || !validSkillName(body.name) || !markdown.trim()) {
        sendError(res, 400, "Missing or invalid skill name/Markdown");
        return;
      }
      const skillDir = join(SKILLS_DIR, body.name);
      await rm(skillDir, { recursive: true, force: true });
      await mkdir(skillDir, { recursive: true });
      await writeFile(join(skillDir, "skill.md"), markdown, "utf8");
      // Write metadata
      const meta = {
        name: body.name,
        last_modified: body.last_modified || new Date().toISOString(),
        sha256: body.sha256 || "",
        device_id: body.device_id || "unknown",
        format_version: 2,
        markdown_file_count: 1,
      };
      await writeJson(join(skillDir, "meta.json"), meta);
      log("info", "skill stored", { name: body.name, device: meta.device_id });
      sendJson(res, 200, { ok: true, name: body.name });
      return;
    }

    // ── GET /api/skills/:name ── download a skill
    if (method === "GET" && url.pathname.startsWith("/api/skills/")) {
      const name = decodeURIComponent(url.pathname.slice("/api/skills/".length));
      if (!validSkillName(name)) { sendError(res, 400, "Missing or invalid skill name"); return; }
      const skillDir = join(SKILLS_DIR, name);
      let files;
      try {
        files = await readSkillFiles(skillDir);
      } catch { sendError(res, 404, `Skill "${name}" not found`); return; }
      const meta = await readJson(join(skillDir, "meta.json")) || {};
      const markdown = files["skill.md"] || canonicalSkillMarkdown(name, files);
      if (!markdown) { sendError(res, 422, `Skill "${name}" does not contain Markdown`); return; }
      sendJson(res, 200, { name, markdown, ...meta });
      return;
    }

    // ── DELETE /api/skills/:name ── remove a skill
    if (method === "DELETE" && url.pathname.startsWith("/api/skills/")) {
      if (!checkAuth(req)) { sendError(res, 401, "Unauthorized"); return; }
      const name = decodeURIComponent(url.pathname.slice("/api/skills/".length));
      if (!validSkillName(name)) { sendError(res, 400, "Missing or invalid skill name"); return; }
      try {
        await rm(join(SKILLS_DIR, name), { recursive: true, force: true });
        log("info", "skill removed", { name });
        sendJson(res, 200, { ok: true, removed: name });
      } catch { sendError(res, 404, `Skill "${name}" not found`); }
      return;
    }

    // ── Denglema web shell ──
    if (method === "GET" && url.pathname === "/") {
      await sendStatic(res, "index.html", "text/html; charset=utf-8");
      return;
    }
    if (method === "GET" && url.pathname === "/me") {
      await sendStatic(res, "profile.html", "text/html; charset=utf-8");
      return;
    }
    if (method === "GET" && url.pathname === "/plugin") {
      await sendStatic(res, "plugin.html", "text/html; charset=utf-8");
      return;
    }
    if (method === "GET" && url.pathname === "/leaderboards") {
      await sendStatic(res, "leaderboards.html", "text/html; charset=utf-8");
      return;
    }
    if (method === "GET" && url.pathname === "/leaderboards.js") {
      await sendStatic(res, "leaderboards.js", "text/javascript; charset=utf-8");
      return;
    }
    if (method === "GET" && url.pathname === "/app.js") {
      await sendStatic(res, "app.js", "text/javascript; charset=utf-8");
      return;
    }
    if (method === "GET" && url.pathname === "/profile.js") {
      await sendStatic(res, "profile.js", "text/javascript; charset=utf-8");
      return;
    }
    if (method === "GET" && url.pathname === "/styles.css") {
      await sendStatic(res, "styles.css", "text/css; charset=utf-8");
      return;
    }

    // ── 404 ──
    sendError(res, 404, "Not Found");
    log("warn", "not found", { method, path: url.pathname });
  } catch (err) {
    log("error", "server error", { error: err.message, stack: err.stack });
    if (!res.headersSent) {
      sendError(res, 500, "Internal Server Error");
    }
  }
});

/* ── Start ────────────────────────────────── */

server.listen(PORT, BIND, () => {
  log("info", "listening", { bind: BIND, port: PORT, auth: !!TOKEN, state_dir: STATE_DIR });
  console.error(`Codex Sync Server: http://${BIND}:${PORT}`);
  if (!TOKEN) console.error("  ⚠  DASHBOARD_TOKEN not set — push auth is disabled");
});

/* ── Graceful shutdown ────────────────────── */

function shutdown(signal) {
  log("info", "shutting down", { signal });
  server.close(() => {
    log("info", "server closed");
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));