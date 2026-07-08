import { readFile, writeFile, rename, mkdir, readdir, unlink } from "node:fs/promises";
import { join, extname } from "node:path";

/**
 * Atomically write a JSON object to a file path.
 */
async function writeJson(path, data) {
  const tmp = path + ".tmp." + Math.random().toString(36).slice(2, 8);
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await writeFile(path, JSON.stringify(data, null, 2), "utf8"); // fallback if rename fails cross-device
  try {
    await rename(tmp, path);
  } catch {
    // cross-device rename may fail — the direct writeFile above already worked
  }
  try { await unlink(tmp); } catch {}
}

/**
 * Read and parse a JSON file. Returns null on any error.
 */
async function readJson(path) {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Scan the state directory and return all device snapshots.
 * Skips "latest.json" (reserved for local dashboard use).
 * @param {string} stateDir
 * @returns {Promise<Map<string, {deviceId: string, deviceName: string, path: string, snapshot: object}>>}
 */
export async function readDeviceStates(stateDir = "state") {
  const devices = new Map();
  let entries;
  try {
    entries = await readdir(stateDir, { withFileTypes: true });
  } catch {
    return devices;
  }

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (extname(entry.name) !== ".json") continue;
    if (entry.name === "latest.json") continue;

    const deviceId = entry.name.replace(/\.json$/, "");
    const filePath = join(stateDir, entry.name);
    const snapshot = await readJson(filePath);
    if (!snapshot) continue;

    devices.set(deviceId, {
      deviceId,
      deviceName: snapshot._device_name || deviceId,
      path: filePath,
      snapshot,
    });
  }

  return devices;
}

/**
 * Write a device snapshot to the state directory.
 * Injects metadata (_device_id, _device_name, _received_at).
 * @param {string} deviceId
 * @param {string} deviceName
 * @param {object} snapshot
 * @param {string} stateDir
 */
export async function writeDeviceState(deviceId, deviceName, snapshot, stateDir = "state") {
  const safeId = String(deviceId).replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = join(stateDir, `${safeId}.json`);

  const stored = {
    ...snapshot,
    _device_id: safeId,
    _device_name: deviceName || safeId,
    _received_at: new Date().toISOString(),
  };

  await writeJson(path, stored);
  return { deviceId: safeId, path };
}

/**
 * Remove a device's state file.
 * @param {string} deviceId
 * @param {string} stateDir
 */
export async function removeDeviceState(deviceId, stateDir = "state") {
  const safeId = String(deviceId).replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = join(stateDir, `${safeId}.json`);
  try {
    await unlink(path);
    return true;
  } catch {
    return false;
  }
}
