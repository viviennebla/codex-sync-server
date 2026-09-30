import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  readDenglemaUser,
  readDenglemaUsers,
  readUserInstallations,
  readUserTotals,
  readUserUsageHistory,
} from "./denglema-state.js";

const EVENT_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_EVENTS = 240;
const COMMENT_COOLDOWN_MS = 3000;
const WORK_START_MINUTE = 9 * 60;
const WORK_END_MINUTE = 18 * 60;
const EARLY_BIRD_START_MINUTE = 5 * 60;
const DEEP_NIGHT_END_MINUTE = 5 * 60;
const MIN_RHYTHM_INTERVALS = 5;
const MIN_RHYTHM_COVERAGE_MINUTES = 3 * 60;
const STEADY_RATE_CV_MAX = 0.25;
const HEARTBEAT_RATE_CV_MIN = 0.9;

export const DENGLEMA_PRODUCT_TIMEZONE = "Asia/Shanghai";

export const DENGLEMA_RELEASE_ANNOUNCEMENTS = [
  {
    id: "daily-routes-52-2026-09",
    emoji: "🗺️",
    message: "#52 燃烧榜改成今日蹬况 · 排名还在地下室，只是终于不坐主席台了",
    href: "/leaderboards",
  },
  {
    id: "project-privacy-49-2026-09",
    emoji: "🔒",
    message: "#49 Project 可隐藏或改名 · 客户代号终于不用在燃烧榜裸奔",
    href: "/privacy",
  },
  {
    id: "ci-superseded-deploys-2026-09",
    emoji: "🧹",
    message: "#50 CI 旧部署被新 main 超车时改为正常跳过 · 红灯终于学会分辨失败和迟到",
  },
  {
    id: "plugin-0.1.17-usage-limits",
    emoji: "📦",
    message: "蹬了吗插件升级到 0.1.17 · 新增剩余额度情绪",
    href: "/plugin#upgrade-0-1-17",
  },
  {
    id: "plugin-0.1.16-auto-upload",
    emoji: "📦",
    message: "蹬了吗插件升级到 0.1.16 · 新增自动上传",
    href: "/plugin#upgrade-0-1-16",
  },
];

export const DENGLEMA_ACHIEVEMENTS = [
  { id: "first_ride", emoji: "🚲", name: "第一脚", description: "第一次把 usage 蹬进赛道" },
  { id: "million_day", emoji: "🔥", name: "百万燃料", description: "单日累计 1M token" },
  { id: "ten_million_day", emoji: "☄️", name: "千万马力", description: "单日累计 10M token" },
  { id: "model_explorer", emoji: "🧪", name: "模型探险家", description: "一天用过 3 个模型" },
  { id: "project_hopper", emoji: "🛠️", name: "项目穿梭机", description: "一天蹬过 3 个项目" },
  { id: "multi_harness", emoji: "🤹", name: "多 Agent 骑手", description: "同一天用过 2 种 Agent Harness" },
  { id: "took_the_crown", emoji: "👑", name: "戴过皇冠", description: "拿过一次今日第一" },
  { id: "precise_rider", emoji: "🎯", name: "精准骑手", description: "有真实 usage 的一天，主要沿一条项目路线前进" },
  { id: "light_multitasker", emoji: "🧳", name: "轻装多面手", description: "有真实 usage 的一天，在多个项目间均衡穿梭" },
  { id: "all_round_route", emoji: "🧭", name: "全能路线", description: "同一天留下多 Agent、模型和项目足迹" },
  { id: "three_day_streak", emoji: "🗓️", name: "三日连蹬", description: "连续 3 个自然日都有 usage 足迹" },
  { id: "steady_cruise", emoji: "🧘", name: "匀速巡航", description: "工作时段 burn rate 很稳定" },
  { id: "heartbeat_rider", emoji: "📈", name: "心电图骑手", description: "工作时段 burn rate 大起大落，纯属节奏梗" },
  { id: "early_bird", emoji: "🌅", name: "早鸟", description: "工作日 05:00–09:00 留下过 usage 足迹" },
  { id: "night_ride", emoji: "🌙", name: "夜骑", description: "工作日 18:00 之后留下过 usage 足迹" },
  { id: "deep_night_rider", emoji: "🦉", name: "深夜选手", description: "00:00–05:00 留下过 usage 足迹" },
  { id: "weekend_rider", emoji: "🏖️", name: "周末还在蹬", description: "周末留下过 usage 足迹，只是趣味记录" },
];

function paths(stateDir) {
  const root = join(stateDir, "denglema");
  return {
    events: join(root, "events.json"),
    announcements: join(root, "announcements.json"),
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
  const nowMs = now.getTime();
  const cutoff = nowMs - EVENT_WINDOW_MS;
  return (Array.isArray(items) ? items : [])
    .filter((item) => {
      const createdAt = Date.parse(item?.created_at || "");
      const expiresAt = Date.parse(item?.expires_at || "");
      return Number.isFinite(createdAt)
        && createdAt >= cutoff
        && (!Number.isFinite(expiresAt) || expiresAt > nowMs);
    })
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
        previous.expires_at = event?.expires_at || previous.expires_at || null;
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
      expires_at: event?.expires_at || null,
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

export async function ensureDenglemaReleaseAnnouncements(
  stateDir = "state",
  options = {},
) {
  const now = options.now?.() || new Date();
  const run = eventQueue.then(async () => {
    const p = paths(stateDir);
    const [eventStore, announcementStore] = await Promise.all([
      readJson(p.events, { version: 1, items: [] }),
      readJson(p.announcements, { version: 1, published: {} }),
    ]);

    announcementStore.published ||= {};
    const items = pruneEvents(eventStore.items, now);
    let added = 0;

    for (const announcement of DENGLEMA_RELEASE_ANNOUNCEMENTS) {
      if (announcementStore.published[announcement.id]) continue;

      const createdAt = now.toISOString();
      items.push({
        id: "evt_" + randomUUID(),
        kind: "release",
        user_id: null,
        message: announcement.message,
        created_at: createdAt,
        meta: {
          announcement_id: announcement.id,
          emoji: announcement.emoji,
          href: announcement.href,
        },
        coalesce_key: null,
      });
      announcementStore.published[announcement.id] = createdAt;
      added += 1;
    }

    if (added) {
      await Promise.all([
        writeJson(p.events, { version: 1, items: pruneEvents(items, now) }),
        writeJson(p.announcements, announcementStore),
      ]);
    }

    return added;
  });
  eventQueue = run.catch(() => {});
  return run;
}

export async function readDenglemaEvents(stateDir = "state", options = {}) {
  const now = options.now?.() || new Date();
  await ensureDenglemaReleaseAnnouncements(stateDir, { now: () => now });
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
      expires_at: item.expires_at || null,
      actor: item.meta?.actor || null,
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

function dateKeyOffset(date, offsetDays) {
  const anchor = new Date(`${date}T12:00:00Z`);
  if (!Number.isFinite(anchor.getTime())) return null;
  anchor.setUTCDate(anchor.getUTCDate() + offsetDays);
  return anchor.toISOString().slice(0, 10);
}

function localTimeParts(value, timezone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${byType.year}-${byType.month}-${byType.day}`,
    weekday: byType.weekday,
    minute: Number(byType.hour) * 60 + Number(byType.minute),
  };
}

function isWeekday(weekday) {
  return weekday !== "Sat" && weekday !== "Sun";
}

function isWeekend(weekday) {
  return weekday === "Sat" || weekday === "Sun";
}

export function analyzeDenglemaUsageRhythm(samples, options = {}) {
  const timezone = options.timezone || DENGLEMA_PRODUCT_TIMEZONE;
  const workIntervals = [];
  let earlyBird = false;
  let nightRide = false;
  let deepNight = false;
  let weekendRide = false;

  const rows = Array.isArray(samples) ? samples : [];
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1];
    const current = rows[index];
    if (current?.introduced_installation) continue;

    const startMs = Date.parse(previous?.observed_at || "");
    const endMs = Date.parse(current?.observed_at || "");
    const startTotal = Number(previous?.total_tokens);
    const endTotal = Number(current?.total_tokens);
    const minutes = (endMs - startMs) / 60_000;
    const delta = endTotal - startTotal;
    if (!Number.isFinite(minutes) || minutes <= 0 || !Number.isFinite(delta) || delta < 0) continue;

    const start = localTimeParts(startMs, timezone);
    const end = localTimeParts(endMs, timezone);
    if (start.date !== end.date) continue;

    const active = delta > 0;
    const weekday = isWeekday(start.weekday) && isWeekday(end.weekday);
    const weekend = isWeekend(start.weekday) && isWeekend(end.weekday);

    if (
      weekday
      && start.minute >= WORK_START_MINUTE
      && end.minute <= WORK_END_MINUTE
    ) {
      workIntervals.push({
        start_at: new Date(startMs).toISOString(),
        end_at: new Date(endMs).toISOString(),
        minutes,
        token_delta: delta,
        rate_tpm: delta / minutes,
      });
    }

    if (
      active
      && weekday
      && start.minute >= EARLY_BIRD_START_MINUTE
      && end.minute <= WORK_START_MINUTE
    ) earlyBird = true;

    if (
      active
      && weekday
      && start.minute >= WORK_END_MINUTE
    ) nightRide = true;

    if (
      active
      && start.minute < DEEP_NIGHT_END_MINUTE
      && end.minute <= DEEP_NIGHT_END_MINUTE
    ) deepNight = true;

    if (active && weekend) weekendRide = true;
  }

  const coverageMinutes = workIntervals.reduce((sum, item) => sum + item.minutes, 0);
  const activeTokens = workIntervals.reduce((sum, item) => sum + item.token_delta, 0);
  const rates = workIntervals.map((item) => item.rate_tpm);
  const meanRate = rates.length
    ? rates.reduce((sum, rate) => sum + rate, 0) / rates.length
    : 0;
  const variance = rates.length
    ? rates.reduce((sum, rate) => sum + (rate - meanRate) ** 2, 0) / rates.length
    : 0;
  const coefficientOfVariation = meanRate > 0 ? Math.sqrt(variance) / meanRate : null;
  const rhythmEligible = (
    workIntervals.length >= MIN_RHYTHM_INTERVALS
    && coverageMinutes >= MIN_RHYTHM_COVERAGE_MINUTES
    && activeTokens > 0
    && meanRate > 0
  );

  return {
    timezone,
    work_intervals: workIntervals,
    interval_count: workIntervals.length,
    coverage_minutes: coverageMinutes,
    active_tokens: activeTokens,
    mean_rate_tpm: meanRate,
    coefficient_of_variation: coefficientOfVariation,
    rhythm_eligible: rhythmEligible,
    steady_cruise: rhythmEligible && coefficientOfVariation <= STEADY_RATE_CV_MAX,
    heartbeat_rider: rhythmEligible && coefficientOfVariation >= HEARTBEAT_RATE_CV_MIN,
    early_bird: earlyBird,
    night_ride: nightRide,
    deep_night_rider: deepNight,
    weekend_rider: weekendRide,
  };
}

function balancedProjectSpread(projects) {
  const rows = (Array.isArray(projects) ? projects : [])
    .filter((item) => Number(item?.total_tokens) > 0);
  if (rows.length < 3) return false;
  const total = rows.reduce((sum, item) => sum + Number(item.total_tokens), 0);
  const largest = Math.max(...rows.map((item) => Number(item.total_tokens)));
  return total > 0 && largest / total <= 0.7;
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
  const timezone = options.timezone || DENGLEMA_PRODUCT_TIMEZONE;
  const previousDate = dateKeyOffset(date, -1);
  const twoDaysAgo = dateKeyOffset(date, -2);
  const [totals, installations, user, usageHistory, previousTotals, twoDaysAgoTotals] = await Promise.all([
    readUserTotals(date, stateDir),
    readUserInstallations(id, date, stateDir),
    readDenglemaUser(id, stateDir),
    readUserUsageHistory(id, date, stateDir),
    previousDate ? readUserTotals(previousDate, stateDir) : [],
    twoDaysAgo ? readUserTotals(twoDaysAgo, stateDir) : [],
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
  const rhythm = analyzeDenglemaUsageRhythm(usageHistory, { timezone });
  const realActivity = row.total_tokens > 0;
  const currentProjects = (row.projects || []).filter((item) => Number(item.total_tokens) > 0);
  const currentModels = (row.models || []).filter((item) => Number(item.total_tokens) > 0);
  const hadUsage = (dayTotals) => (
    dayTotals.find((item) => item.user_id === id)?.total_tokens > 0
  );
  const conditions = {
    first_ride: realActivity,
    million_day: row.total_tokens >= 1_000_000,
    ten_million_day: row.total_tokens >= 10_000_000,
    model_explorer: currentModels.length >= 3,
    project_hopper: currentProjects.length >= 3,
    multi_harness: harnesses.size >= 2,
    took_the_crown: leader,
    precise_rider: realActivity && currentProjects.length === 1,
    light_multitasker: realActivity && balancedProjectSpread(currentProjects),
    all_round_route: (
      realActivity
      && harnesses.size >= 2
      && currentModels.length >= 2
      && currentProjects.length >= 2
    ),
    three_day_streak: realActivity && hadUsage(previousTotals) && hadUsage(twoDaysAgoTotals),
    steady_cruise: rhythm.steady_cruise,
    heartbeat_rider: rhythm.heartbeat_rider,
    early_bird: rhythm.early_bird,
    night_ride: rhythm.night_ride,
    deep_night_rider: rhythm.deep_night_rider,
    weekend_rider: rhythm.weekend_rider,
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

  if (typeof options.onRhythm === "function") {
    try {
      options.onRhythm({
        user_id: id,
        date,
        timezone,
        sample_count: usageHistory.length,
        interval_count: rhythm.interval_count,
        coverage_minutes: Math.round(rhythm.coverage_minutes * 100) / 100,
        active_tokens: rhythm.active_tokens,
        mean_rate_tpm: Math.round(rhythm.mean_rate_tpm * 100) / 100,
        coefficient_of_variation: rhythm.coefficient_of_variation == null
          ? null
          : Math.round(rhythm.coefficient_of_variation * 1000) / 1000,
        rhythm_eligible: rhythm.rhythm_eligible,
        steady_cruise: rhythm.steady_cruise,
        heartbeat_rider: rhythm.heartbeat_rider,
        playful_timing: {
          early_bird: rhythm.early_bird,
          night_ride: rhythm.night_ride,
          deep_night_rider: rhythm.deep_night_rider,
          weekend_rider: rhythm.weekend_rider,
        },
        newly_unlocked: newlyUnlocked.map((achievement) => achievement.id),
      });
    } catch {}
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
