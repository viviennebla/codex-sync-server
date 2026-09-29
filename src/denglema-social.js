import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  readDenglemaUser,
  readDenglemaUsers,
  readUserInstallations,
  readUserTotals,
} from "./denglema-state.js";

const EVENT_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_EVENTS = 240;
const COMMENT_COOLDOWN_MS = 3000;

export const DENGLEMA_ACHIEVEMENTS = [
  { id: "first_ride", emoji: "🚲", name: "第一脚", description: "第一次把 usage 蹬进赛道" },
  { id: "million_day", emoji: "🔥", name: "百万燃料", description: "单日累计 1M token" },
  { id: "ten_million_day", emoji: "☄️", name: "千万马力", description: "单日累计 10M token" },
  { id: "model_explorer", emoji: "🧪", name: "模型探险家", description: "一天用过 3 个模型" },
  { id: "project_hopper", emoji: "🛠️", name: "项目穿梭机", description: "一天蹬过 3 个项目" },
  { id: "multi_harness", emoji: "🤹", name: "多 Agent 骑手", description: "同一天用过 2 种 Agent Harness" },
  { id: "took_the_crown", emoji: "👑", name: "戴过皇冠", description: "拿过一次今日第一" },
];

function paths(stateDir) {
  const root = join(stateDir, "denglema");
  return {
    events: join(root, "events.json"),
    achievements: join(root, "achievements.json"),
    leaders: join(root, "leaders.json"),
  };
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
  const tmp = path + ".tmp." + randomUUID();
  await writeFile(tmp, JSON.stringify(value, null, 2) + "\n", "utf8");
  await rename(tmp, path);
}

function cleanMessage(value) {
  const text = String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) throw new Error("留言不能为空");
  if ([...text].length > 120) throw new Error("留言最多 120 个字符");
  return text;
}

function pruneEvents(items, now) {
  const cutoff = now.getTime() - EVENT_WINDOW_MS;
  return (Array.isArray(items) ? items : [])
    .filter((item) => Number.isFinite(Date.parse(item?.created_at)) && Date.parse(item.created_at) >= cutoff)
    .slice(-MAX_EVENTS);
}

let eventQueue = Promise.resolve();

export async function appendDenglemaEvent(event, stateDir = "state", options = {}) {
  const run = eventQueue.then(async () => {
    const now = options.now?.() || new Date();
    const file = paths(stateDir).events;
    const store = await readJson(file, { version: 1, items: [] });
    const items = pruneEvents(store.items, now);
    const kind = String(event?.kind || "system").slice(0, 32);
    const userId = String(event?.user_id || "").trim() || null;
    const message = cleanMessage(event?.message || "");

    if (event?.coalesce_key) {
      const key = String(event.coalesce_key);
      const windowMs = Number(event.coalesce_window_ms || 0);
      const previous = [...items].reverse().find((item) => (
        item.coalesce_key === key
        && now.getTime() - Date.parse(item.created_at) <= windowMs
      ));
      if (previous) {
        previous.kind = kind;
        previous.user_id = userId;
        previous.message = message;
        previous.created_at = now.toISOString();
        previous.meta = event.meta || null;
        await writeJson(file, { version: 1, items: pruneEvents(items, now) });
        return previous;
      }
    }

    const item = {
      id: "evt_" + randomUUID(),
      kind,
      user_id: userId,
      message,
      created_at: now.toISOString(),
      meta: event?.meta || null,
      coalesce_key: event?.coalesce_key ? String(event.coalesce_key) : null,
    };
    items.push(item);
    await writeJson(file, { version: 1, items: pruneEvents(items, now) });
    return item;
  });
  eventQueue = run.catch(() => {});
  return run;
}

export async function addDenglemaComment(userId, message, stateDir = "state", options = {}) {
  const id = String(userId || "").trim();
  if (!id) throw new Error("Login required");
  const now = options.now?.() || new Date();
  const existing = await readJson(paths(stateDir).events, { version: 1, items: [] });
  const recent = pruneEvents(existing.items, now);
  const latestComment = [...recent].reverse().find((item) => item.kind === "comment" && item.user_id === id);
  if (latestComment && now.getTime() - Date.parse(latestComment.created_at) < COMMENT_COOLDOWN_MS) {
    throw new Error("说慢一点，3 秒后再发");
  }
  return appendDenglemaEvent({ kind: "comment", user_id: id, message }, stateDir, { now: () => now });
}

export async function backfillHistoricalJoinEvents(stateDir = "state", options = {}) {
  const now = options.now?.() || new Date();
  const run = eventQueue.then(async () => {
    const eventFile = paths(stateDir).events;
    const installationFile = join(stateDir, "denglema", "installations.json");
    const [eventStore, installationStore] = await Promise.all([
      readJson(eventFile, { version: 1, items: [] }),
      readJson(installationFile, { version: 1, items: {} }),
    ]);
    const items = pruneEvents(eventStore.items, now);
    const existingUsers = new Set(
      items.filter((item) => item.kind === "join" && item.user_id).map((item) => item.user_id),
    );
    const earliest = new Map();

    for (const installation of Object.values(installationStore.items || {})) {
      const userId = String(installation?.user_id || "").trim();
      const createdAt = installation?.created_at || null;
      const createdMs = Date.parse(createdAt || "");
      if (!userId || !Number.isFinite(createdMs)) continue;
      const previous = earliest.get(userId);
      if (!previous || createdMs < previous.ms) {
        earliest.set(userId, { ms: createdMs, created_at: new Date(createdMs).toISOString() });
      }
    }

    const cutoff = now.getTime() - EVENT_WINDOW_MS;
    let added = 0;
    for (const [userId, value] of earliest) {
      if (existingUsers.has(userId)) continue;
      if (value.ms < cutoff || value.ms > now.getTime()) continue;
      items.push({
        id: "evt_" + randomUUID(),
        kind: "join",
        user_id: userId,
        message: "加入了赛道",
        created_at: value.created_at,
        meta: { historical: true },
        coalesce_key: "join:user:" + userId,
      });
      added += 1;
    }

    if (added) {
      items.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
      await writeJson(eventFile, { version: 1, items: pruneEvents(items, now) });
    }
    return added;
  });
  eventQueue = run.catch(() => {});
  return run;
}

export async function readDenglemaEvents(stateDir = "state", options = {}) {
  const now = options.now?.() || new Date();
  await backfillHistoricalJoinEvents(stateDir, { now: () => now });
  const limit = Math.min(50, Math.max(1, Number(options.limit || 20)));
  const file = paths(stateDir).events;
  const store = await readJson(file, { version: 1, items: [] });
  const items = pruneEvents(store.items, now);
  const users = await readDenglemaUsers(stateDir);
  const byId = new Map(users.map((user) => [user.id, user]));
  return items.slice(-limit).reverse().map((item) => {
    const user = item.user_id ? byId.get(item.user_id) : null;
    return {
      id: item.id,
      kind: item.kind,
      message: item.message,
      created_at: item.created_at,
      meta: item.meta || null,
      user: user ? {
        user_id: user.id,
        display_name: user.display_name || "骑手",
        avatar_emoji: user.avatar_emoji || "🚴",
        avatar_url: user.avatar_url || null,
      } : null,
    };
  });
}

export async function syncLeaderboardLeader(date, stateDir = "state", options = {}) {
  const now = options.now?.() || new Date();
  const totals = await readUserTotals(date, stateDir);
  const current = totals[0]?.total_tokens > 0 ? totals[0].user_id : null;
  const file = paths(stateDir).leaders;
  const store = await readJson(file, { version: 1, by_date: {} });
  store.by_date ||= {};
  const previous = store.by_date[date]?.user_id || null;

  if (!current) return { changed: false, current: null, previous };

  store.by_date[date] = {
    user_id: current,
    total_tokens: totals[0].total_tokens,
    updated_at: now.toISOString(),
  };
  await writeJson(file, store);

  if (!previous || previous === current) {
    return { changed: false, current, previous };
  }

  await appendDenglemaEvent({
    kind: "leader",
    user_id: current,
    message: "超车成为第一名",
    meta: {
      previous_user_id: previous,
      total_tokens: totals[0].total_tokens,
      date,
    },
    coalesce_key: "leader:" + date + ":" + current,
    coalesce_window_ms: 60 * 60 * 1000,
  }, stateDir, { now: () => now });

  return { changed: true, current, previous };
}

function achievementMap(store, userId) {
  store.by_user ||= {};
  store.by_user[userId] ||= {};
  return store.by_user[userId];
}

export async function syncUserAchievements(userId, date, stateDir = "state", options = {}) {
  const id = String(userId || "").trim();
  if (!id) return [];
  const now = options.now?.() || new Date();
  const [totals, installations, user] = await Promise.all([
    readUserTotals(date, stateDir),
    readUserInstallations(id, date, stateDir),
    readDenglemaUser(id, stateDir),
  ]);
  if (!user) return [];

  const row = totals.find((item) => item.user_id === id) || {
    total_tokens: 0,
    models: [],
    projects: [],
  };
  const harnesses = new Set(
    installations.map((item) => item.harness).filter(Boolean),
  );
  const leader = totals.length > 0 && totals[0].user_id === id && totals[0].total_tokens > 0;
  const conditions = {
    first_ride: row.total_tokens > 0,
    million_day: row.total_tokens >= 1_000_000,
    ten_million_day: row.total_tokens >= 10_000_000,
    model_explorer: (row.models || []).length >= 3,
    project_hopper: (row.projects || []).length >= 3,
    multi_harness: harnesses.size >= 2,
    took_the_crown: leader,
  };

  const file = paths(stateDir).achievements;
  const store = await readJson(file, { version: 1, by_user: {} });
  const initializedBefore = Boolean(store.by_user?.[id]);
  const unlocked = achievementMap(store, id);
  const newlyUnlocked = [];

  for (const achievement of DENGLEMA_ACHIEVEMENTS) {
    if (!conditions[achievement.id] || unlocked[achievement.id]) continue;
    unlocked[achievement.id] = {
      unlocked_at: now.toISOString(),
      date,
    };
    newlyUnlocked.push(achievement);
  }

  if (newlyUnlocked.length) {
    await writeJson(file, store);
    if (initializedBefore) {
      for (const achievement of newlyUnlocked) {
        await appendDenglemaEvent({
          kind: "achievement",
          user_id: id,
          message: "解锁成就「" + achievement.name + "」",
          meta: { achievement_id: achievement.id, emoji: achievement.emoji },
        }, stateDir, { now: () => now });
      }
    }
  } else if (!initializedBefore) {
    await writeJson(file, store);
  }

  return DENGLEMA_ACHIEVEMENTS.map((achievement) => ({
    ...achievement,
    unlocked: Boolean(unlocked[achievement.id]),
    unlocked_at: unlocked[achievement.id]?.unlocked_at || null,
  })).sort((a, b) => (
    Number(b.unlocked) - Number(a.unlocked)
    || String(b.unlocked_at || "").localeCompare(String(a.unlocked_at || ""))
  ));
}
