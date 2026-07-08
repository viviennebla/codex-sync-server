import { createServer } from "node:http";
import { readDeviceStates, writeDeviceState, removeDeviceState } from "./state.js";

const PORT = Number(process.env.PORT) || 34777;
const BIND = process.env.BIND || "0.0.0.0";
const STATE_DIR = process.env.STATE_DIR || "state";
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
      await writeDeviceState(deviceId, deviceName, body.snapshot, STATE_DIR);
      log("info", "push received", { device_id: deviceId, device_name: deviceName });
      sendJson(res, 200, { ok: true, device_id: deviceId });
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
