import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { readFile, readdir, mkdir, writeFile, rm } from "node:fs/promises";
import { join, dirname } from "node:path";
import { readDeviceStates, writeDeviceState, removeDeviceState } from "./state.js";

const PORT = Number(process.env.PORT) || 34777;
const BIND = process.env.BIND || "0.0.0.0";
const STATE_DIR = process.env.STATE_DIR || "state";
const SKILLS_DIR = process.env.SKILLS_DIR || "skills-store";
const SKILL_BUNDLE_FILE = "skills-bundle.json";
const TOKEN = process.env.DASHBOARD_TOKEN || null;
const STARTED_AT = Date.now();

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

function checkAuth(req) {
  if (!TOKEN) return true; // auth disabled if no token configured
  const header = req.headers.authorization || "";
  const bearer = header.replace(/^Bearer\s+/i, "").trim();
  return bearer === TOKEN;
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

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(body);
}

function sendError(res, status, message) {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  res.end(message);
}

async function readJson(path) {
  try { return JSON.parse(await readFile(path, "utf8")); } catch { return null; }
}

async function writeJson(path, data) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2), "utf8");
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

    // ── GET /health ──
    if (method === "GET" && url.pathname === "/health") {
      const devices = await readDeviceStates(STATE_DIR);
      sendJson(res, 200, {
        ok: true,
        uptime_seconds: Math.floor((Date.now() - STARTED_AT) / 1000),
        device_count: devices.size,
        auth_enabled: !!TOKEN,
      });
      log("info", "health", { status: 200, ms: Date.now() - start });
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
