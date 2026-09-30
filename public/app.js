const $ = (id) => document.getElementById(id);

const loginOverlay = $("loginOverlay");
const statusEl = $("status");
const pairButton = $("pairButton");
const pairDialog = $("pairDialog");
const devicesButton = $("devicesButton");
const devicesDialog = $("devicesDialog");
const devicesSummary = $("devicesSummary");
const devicesList = $("devicesList");
const riderDialog = $("riderDialog");
const riderDetailTitle = $("riderDetailTitle");
const riderDetailSummary = $("riderDetailSummary");
const riderModels = $("riderModels");
const riderProjects = $("riderProjects");
const riderTrend = $("riderTrend");
const riderDevices = $("riderDevices");
const uploadPromptButton = $("uploadPromptButton");
const uploadDialog = $("uploadDialog");
const copyUploadPromptButton = $("copyUploadPromptButton");
const uploadPromptText = $("uploadPromptText");
const createPairingButton = $("createPairingButton");
const pairingResult = $("pairingResult");
const pairingCodeEl = $("pairingCode");
const bindCommandEl = $("bindCommand");
const copyBindCommandButton = $("copyBindCommandButton");
const useShellCommandButton = $("useShellCommandButton");
const usePowerShellCommandButton = $("usePowerShellCommandButton");
const useAgentPromptButton = $("useAgentPromptButton");
const bindHelpText = $("bindHelpText");
const autoUploadConsent = $("autoUploadConsent");
const autoUploadInterval = $("autoUploadInterval");
const todayTotalEl = $("todayTotal");
const todayFreshnessEl = $("todayFreshness");
const resetNotchStatus = $("resetNotchStatus");
const resetBegButton = $("resetBegButton");
const resetBegCount = $("resetBegCount");
const eventRail = $("eventRail");
const eventList = $("eventList");
const eventComposer = $("eventComposer");
const eventMessageInput = $("eventMessageInput");
const eventSendButton = $("eventSendButton");
const toastEl = $("toast");
const registerPanel = $("registerPanel");
const recoverPanel = $("recoverPanel");
const recoveryCreated = $("recoveryCreated");
const displayNameInput = $("displayNameInput");
const avatarEmojiInput = $("avatarEmojiInput");
const recoveryCodeInput = $("recoveryCodeInput");
const recoveryCodeCreated = $("recoveryCodeCreated");
const registerButton = $("registerButton");
const recoverButton = $("recoverButton");
const showRecoverButton = $("showRecoverButton");
const showRegisterButton = $("showRegisterButton");
const copyRecoveryButton = $("copyRecoveryButton");
const enterAfterRecoveryButton = $("enterAfterRecoveryButton");

let me = null;
let visibleRiders = [];
let directorTimer = null;
let refreshTimer = null;
let ambientTimer = null;
let pairingPollTimer = null;
let pairingCodeCurrent = null;
let pairingCommandMode = "shell";
let previewMode = false;
const activeMotion = new Map();
const shownCommentEventIds = new Set();
const riderMessageTimers = new Map();
const latestCommentByRider = new Map();
let pinnedMessageRiderId = null;
const COMMENT_BUBBLE_MS = 7000;
const COMMENT_BUBBLE_RECENCY_MS = 2 * 60 * 1000;

const DENGLEMA_SERVER = "https://vimo-dev-server.taila62aff.ts.net";
const DENGLEMA_MARKETPLACE = "viviennebla/codex-usage-dashboard";
const DENGLEMA_CONTRACT_URL =
  "https://github.com/viviennebla/codex-sync-server/blob/main/docs/denglema-usage-contract.md";

const TIME_THEME_CLASSES = ["time-morning", "time-day", "time-evening", "time-night"];

function themeForHour(hour) {
  if (hour >= 6 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "day";
  if (hour >= 18 && hour < 24) return "evening";
  return "night";
}

function applyTimeTheme() {
  const forced = new URLSearchParams(location.search).get("theme");
  const theme = ["morning", "day", "evening", "night"].includes(forced)
    ? forced
    : themeForHour(new Date().getHours());
  TIME_THEME_CLASSES.forEach((className) => document.body.classList.remove(className));
  document.body.classList.add("time-" + theme);
  document.body.dataset.timeTheme = theme;
  return theme;
}

applyTimeTheme();
setInterval(applyTimeTheme, 60 * 1000);

function avatarSvg(bg, ink, mood) {
  const eyes = mood === "rage"
    ? '<path d="M40 55 L50 50 M70 50 L80 55" stroke="' + ink + '" stroke-width="5" stroke-linecap="round"/>'
    : '<circle cx="45" cy="56" r="4" fill="' + ink + '"/><circle cx="75" cy="56" r="4" fill="' + ink + '"/>';
  const mouth = mood === "rage"
    ? '<path d="M45 76 Q60 64 76 76" fill="none" stroke="' + ink + '" stroke-width="5" stroke-linecap="round"/>'
    : '<path d="M43 70 Q60 84 77 70" fill="none" stroke="' + ink + '" stroke-width="5" stroke-linecap="round"/>';
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">' +
    '<rect width="120" height="120" rx="60" fill="' + bg + '"/>' +
    '<circle cx="60" cy="58" r="42" fill="#fff6e8" stroke="' + ink + '" stroke-width="4"/>' +
    '<path d="M30 43 Q60 13 91 43" fill="' + ink + '" opacity=".9"/>' +
    eyes + mouth +
    '</svg>';
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

const PREVIEW_RIDERS = [
  {
    user_id: "preview_me",
    display_name: "我",
    avatar_url: avatarSvg("#a7c7f4", "#26354b", "smile"),
    today_tokens: 72432,
    recent_rate_tpm: 0,
    transport: "surf",
    accent: "#4c8ad9"
  },
  {
    user_id: "preview_alice",
    display_name: "Alice",
    avatar_url: avatarSvg("#f7b7c4", "#49323a", "smile"),
    today_tokens: 960000,
    recent_rate_tpm: 15000,
    transport: "scooter",
    accent: "#dd718e"
  },
  {
    user_id: "preview_bob",
    display_name: "Bob",
    avatar_url: avatarSvg("#b7dfc7", "#29443a", "smile"),
    today_tokens: 640000,
    recent_rate_tpm: 7000,
    transport: "skateboard",
    accent: "#4ca87c"
  },
  {
    user_id: "preview_tired",
    display_name: "摸鱼中",
    avatar_url: avatarSvg("#d6d5ea", "#3b3a4b", "smile"),
    today_tokens: 220000,
    recent_rate_tpm: 0,
    mood: "tired",
    transport: "walk",
    accent: "#7b79ac"
  },
  {
    user_id: "preview_bike",
    display_name: "古典蹬法",
    avatar_emoji: "🚴",
    today_tokens: 0,
    transport: "bike",
    accent: "#c98464",
    equipped_achievement: { emoji: "🧪", name: "模型探险家" }
  },
  {
    user_id: "preview_skate",
    display_name: "名字有一点点长的同事",
    avatar_url: avatarSvg("#f1d3a8", "#514334", "smile"),
    today_tokens: 2380000,
    transport: "skate",
    accent: "#9a77b7"
  }
];

function showToast(message, ms) {
  toastEl.textContent = message;
  toastEl.classList.remove("hidden");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toastEl.classList.add("hidden"), ms || 2200);
}

async function jsonFetch(url, options) {
  options = options || {};
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch {}
  if (!response.ok) {
    const error = new Error((payload && payload.error) || text || ("HTTP " + response.status));
    error.status = response.status;
    throw error;
  }
  return payload;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function showRegisterPanel() {
  registerPanel.classList.remove("hidden");
  recoverPanel.classList.add("hidden");
  recoveryCreated.classList.add("hidden");
  statusEl.textContent = "第一次来只需要一个昵称。换浏览器时用恢复码找回同一个 rider。";
}

function showRecoverPanel() {
  registerPanel.classList.add("hidden");
  recoverPanel.classList.remove("hidden");
  recoveryCreated.classList.add("hidden");
  statusEl.textContent = "输入你之前保存的恢复码。";
}

async function registerIdentity() {
  const displayName = displayNameInput.value.trim();
  const avatarEmoji = avatarEmojiInput.value.trim() || "🚴";
  if (!displayName) {
    statusEl.textContent = "先取个昵称。";
    displayNameInput.focus();
    return;
  }

  registerButton.disabled = true;
  statusEl.textContent = "正在领车…";
  try {
    const result = await jsonFetch("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        display_name: displayName,
        avatar_emoji: avatarEmoji
      })
    });
    me = result.user;
    recoveryCodeCreated.textContent = result.recovery_code;
    registerPanel.classList.add("hidden");
    recoverPanel.classList.add("hidden");
    recoveryCreated.classList.remove("hidden");
    statusEl.textContent = "身份创建好了。保存恢复码后就可以开蹬。";
  } catch (error) {
    statusEl.textContent = "创建失败：" + error.message;
  } finally {
    registerButton.disabled = false;
  }
}

async function recoverIdentity() {
  const code = recoveryCodeInput.value.trim();
  if (!code) {
    statusEl.textContent = "请输入恢复码。";
    recoveryCodeInput.focus();
    return;
  }

  recoverButton.disabled = true;
  statusEl.textContent = "正在找车…";
  try {
    const result = await jsonFetch("/api/auth/recover", {
      method: "POST",
      body: JSON.stringify({ recovery_code: code })
    });
    me = result.user;
    loginOverlay.classList.add("hidden");
    await enterRace();
  } catch (error) {
    statusEl.textContent = "恢复失败：" + error.message;
  } finally {
    recoverButton.disabled = false;
  }
}

async function copyRecoveryCode() {
  const code = recoveryCodeCreated.textContent.trim();
  try {
    await navigator.clipboard.writeText(code);
    copyRecoveryButton.textContent = "已复制 ✓";
  } catch {
    const range = document.createRange();
    range.selectNodeContents(recoveryCodeCreated);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }
  window.setTimeout(() => {
    copyRecoveryButton.textContent = "复制恢复码";
  }, 1600);
}

function formatTokens(value) {
  const n = Number(value || 0);
  if (n >= 10000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000000) return (n / 1000000).toFixed(2) + "M";
  if (n >= 100000) return Math.round(n / 1000) + "K";
  return n.toLocaleString("en-US");
}

function formatFreshness(value) {
  if (!value) return "还没上传";
  const ms = Date.now() - Date.parse(value);
  if (!Number.isFinite(ms)) return "时间未知";
  const minutes = Math.max(0, Math.floor(ms / 60000));
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return minutes + " 分钟前";
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + " 小时前";
  return Math.floor(hours / 24) + " 天前";
}

function renderFreshness() {
  if (!todayFreshnessEl) return;
  todayFreshnessEl.textContent = formatFreshness(me?.latest_seen_at);
}

function formatSocialTime(value) {
  const ms = Date.now() - Date.parse(value || "");
  if (!Number.isFinite(ms) || ms < 0) return "刚刚";
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return minutes + "m";
  const hours = Math.floor(minutes / 60);
  return hours + "h";
}

function eventKindIcon(event) {
  if (event.kind === "comment") return "💬";
  if (event.kind === "release") return event.meta?.emoji || "📦";
  if (event.kind === "achievement") return event.meta?.emoji || "🏆";
  if (event.kind === "join") return "🏁";
  if (event.kind === "leader") return "👑";
  if (event.kind === "upload") return "⚡";
  return "•";
}

function eventIconNode(event) {
  const icon = document.createElement("span");
  icon.className = "event-icon";

  if (event.user) {
    icon.classList.add("event-avatar");
    if (event.user.avatar_url) {
      const image = document.createElement("img");
      image.src = event.user.avatar_url;
      image.alt = "";
      icon.appendChild(image);
    } else {
      icon.textContent = event.user.avatar_emoji || "🙂";
    }
    return icon;
  }

  icon.textContent = eventKindIcon(event);
  return icon;
}

function syncMessageLayer() {
  const stage = document.querySelector(".race-stage");
  const hasOpenMessage = Boolean(document.querySelector(".rider.has-message"));
  stage?.classList.toggle("message-layer-active", hasOpenMessage);
}

function updateRiderMessageButton(node, riderId) {
  const button = node?.querySelector(".rider-message-button");
  if (!button) return;
  const event = latestCommentByRider.get(riderId) || null;
  button.hidden = !event;
  button.setAttribute("aria-expanded", String(
    Boolean(event) && pinnedMessageRiderId === riderId && node.classList.contains("has-message")
  ));
  if (event) {
    button.setAttribute("aria-label", "查看最近留言：" + event.message);
    button.title = "查看最近留言";
  } else {
    button.removeAttribute("title");
  }
}

function refreshRiderMessageButtons() {
  document.querySelectorAll(".rider[data-rider-id]").forEach((node) => {
    updateRiderMessageButton(node, node.dataset.riderId);
  });
}

function closeRiderMessage(riderId, options = {}) {
  const node = document.querySelector('[data-rider-id="' + CSS.escape(riderId) + '"]');
  if (!node) return;
  if (!options.force && pinnedMessageRiderId === riderId) return;
  const bubble = node.querySelector(".rider-message-bubble");
  node.classList.remove("has-message");
  if (bubble) bubble.textContent = "";
  clearTimeout(riderMessageTimers.get(riderId));
  riderMessageTimers.delete(riderId);
  if (pinnedMessageRiderId === riderId) pinnedMessageRiderId = null;
  updateRiderMessageButton(node, riderId);
  syncMessageLayer();
}

function showRiderMessage(event, options = {}) {
  const riderId = event.user?.user_id;
  if (!riderId || !event.message) return;
  const node = document.querySelector('[data-rider-id="' + CSS.escape(riderId) + '"]');
  const bubble = node?.querySelector(".rider-message-bubble");
  if (!node || !bubble) return;

  if (options.pinned && pinnedMessageRiderId && pinnedMessageRiderId !== riderId) {
    closeRiderMessage(pinnedMessageRiderId, { force: true });
  }

  bubble.textContent = event.message;
  node.classList.add("has-message");
  clearTimeout(riderMessageTimers.get(riderId));

  if (options.pinned) {
    pinnedMessageRiderId = riderId;
  } else if (pinnedMessageRiderId !== riderId) {
    riderMessageTimers.set(riderId, window.setTimeout(() => {
      closeRiderMessage(riderId);
    }, COMMENT_BUBBLE_MS));
  }

  updateRiderMessageButton(node, riderId);
  syncMessageLayer();
}

function togglePinnedRiderMessage(riderId) {
  const event = latestCommentByRider.get(riderId);
  if (!event) return;
  const node = document.querySelector('[data-rider-id="' + CSS.escape(riderId) + '"]');
  if (!node) return;

  if (pinnedMessageRiderId === riderId && node.classList.contains("has-message")) {
    closeRiderMessage(riderId, { force: true });
    return;
  }
  showRiderMessage(event, { pinned: true });
}

function syncRiderCommentBubbles(events) {
  const now = Date.now();
  const newestAutoByRider = new Map();
  const nextLatest = new Map();

  for (const event of Array.isArray(events) ? events : []) {
    if (event.kind !== "comment" || !event.user?.user_id) continue;
    const riderId = event.user.user_id;
    const createdAt = Date.parse(event.created_at || "");
    const previous = nextLatest.get(riderId);
    if (
      !previous
      || Date.parse(previous.created_at || "") < createdAt
    ) {
      nextLatest.set(riderId, event);
    }

    const key = event.id || [riderId, event.created_at, event.message].join(":");
    if (shownCommentEventIds.has(key)) continue;
    shownCommentEventIds.add(key);

    const age = now - createdAt;
    if (!Number.isFinite(createdAt) || age < 0 || age > COMMENT_BUBBLE_RECENCY_MS) continue;
    if (!newestAutoByRider.has(riderId)) newestAutoByRider.set(riderId, event);
  }

  latestCommentByRider.clear();
  nextLatest.forEach((event, riderId) => latestCommentByRider.set(riderId, event));

  if (pinnedMessageRiderId && !latestCommentByRider.has(pinnedMessageRiderId)) {
    closeRiderMessage(pinnedMessageRiderId, { force: true });
  }
  refreshRiderMessageButtons();
  newestAutoByRider.forEach((event) => showRiderMessage(event));
}

function renderEvents(rows) {
  if (!eventList) return;
  const values = Array.isArray(rows) ? rows : [];
  eventList.replaceChildren();

  if (!values.length) {
    const empty = document.createElement("div");
    empty.className = "event-empty";
    empty.textContent = "24 小时内还很安静。";
    eventList.appendChild(empty);
  }

  values.forEach((event) => {
    const href = typeof event.meta?.href === "string" && event.meta.href.startsWith("/")
      ? event.meta.href
      : null;
    const item = document.createElement(href ? "a" : "div");
    item.className = "event-item event-" + (event.kind || "system");
    if (href) {
      item.href = href;
      item.setAttribute("aria-label", (event.message || "更新公告") + "，查看详情");
    }

    const icon = eventIconNode(event);

    const body = document.createElement("div");
    body.className = "event-body";
    const line = document.createElement("div");
    line.className = "event-line";

    const name = document.createElement("strong");
    name.textContent = event.kind === "release"
      ? "更新"
      : (event.user?.display_name || "赛道");
    const message = document.createElement("span");
    message.textContent = event.message || "";
    line.append(name, message);

    const time = document.createElement("small");
    time.textContent = formatSocialTime(event.created_at);

    body.append(line, time);
    item.append(icon, body);
    eventList.appendChild(item);
  });

  eventRail.classList.remove("hidden");
  syncRiderCommentBubbles(values);
}

async function loadEvents() {
  if (!eventRail) return;
  if (previewMode) {
    renderEvents([
      { id: "preview-join", kind: "join", message: "加入了赛道", created_at: new Date().toISOString(), meta: { harness: "cursor" }, user: { user_id: "preview_alice", display_name: "Alice", avatar_url: PREVIEW_RIDERS[1].avatar_url, avatar_emoji: "🙂" } },
      { id: "preview-leader", kind: "leader", message: "超车成为第一名", created_at: new Date(Date.now() - 5 * 60000).toISOString(), user: { user_id: "preview_bob", display_name: "Bob", avatar_url: PREVIEW_RIDERS[2].avatar_url, avatar_emoji: "🙂" } },
      { id: "preview-comment", kind: "comment", message: "今天谁先把额度蹬没？", created_at: new Date(Date.now() - 20 * 1000).toISOString(), user: { user_id: "preview_tired", display_name: "摸鱼中", avatar_url: PREVIEW_RIDERS[3].avatar_url, avatar_emoji: "🙂" } },
    ]);
    return;
  }
  try {
    const payload = await jsonFetch("/api/events");
    renderEvents(payload.events || []);
  } catch {}
}

async function postEventMessage() {
  const message = eventMessageInput?.value.trim();
  if (!message || !eventSendButton) return;
  eventSendButton.disabled = true;
  try {
    const payload = await jsonFetch("/api/events", {
      method: "POST",
      body: JSON.stringify({ message })
    });
    eventMessageInput.value = "";
    renderEvents(payload.events || []);
  } catch (error) {
    showToast(error.message || "留言失败", 2600);
  } finally {
    eventSendButton.disabled = false;
  }
}


function resetNotchLabel(runway) {
  const completed = runway?.latest_completed || null;
  if (completed) {
    const occurredAt = completed.effective_at || completed.completed_at;
    const date = occurredAt ? new Date(occurredAt) : null;
    if (date && !Number.isNaN(date.getTime())) {
      const resetTime = date.toLocaleTimeString("zh-CN", {
        timeZone: "Asia/Shanghai",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      });
      const resetDate = date.toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
      const dayLabel = resetDate === today ? "今天 " : "";
      return "🎉 Reset · " + dayLabel + resetTime + " 已重置";
    }
  }

  const signal = runway?.latest_signal || null;
  const record = signal?.kind === "reset_scheduled" && signal?.schedule_state === "pending"
    ? signal
    : null;
  if (!record) return "🙏 Reset · 暂无排期";
  const confidence = Number.isFinite(Number(record.confidence))
    ? Math.round(Number(record.confidence) * 100) + "%"
    : "";
  const end = record?.schedule_window?.end_at ? Date.parse(record.schedule_window.end_at) : NaN;
  const now = Date.now();
  const soon = Number.isFinite(end) && end >= now && end - now <= 7 * 24 * 60 * 60 * 1000;
  const when = soon
    ? "本周"
    : (record?.schedule_window?.end_at
      ? new Date(record.schedule_window.end_at).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })
      : "待定");
  return ["🙏 Reset", confidence, when].filter(Boolean).join(" · ");
}

async function loadResetNotch() {
  try {
    const [runway, beg] = await Promise.all([
      jsonFetch("/api/codex-runway"),
      jsonFetch("/api/reset-beg"),
    ]);
    if (resetNotchStatus) {
      resetNotchStatus.textContent = resetNotchLabel(runway);
      if (runway?.site_url) resetNotchStatus.href = runway.site_url;
    }
    if (resetBegCount) resetBegCount.textContent = Number(beg?.count || 0).toLocaleString("en-US");
  } catch {
    if (resetNotchStatus) resetNotchStatus.textContent = "🙏 Reset · 雷达离线";
  }
}

function burstBegParticles(button) {
  if (!button || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const rect = button.getBoundingClientRect();
  const layer = document.createElement("div");
  layer.className = "beg-particle-layer";
  layer.setAttribute("aria-hidden", "true");
  const emojis = ["🙏", "🙏", "🙏", "✨", "✨", "🥺"];

  for (let index = 0; index < 9; index += 1) {
    const particle = document.createElement("span");
    particle.className = "beg-particle";
    particle.textContent = emojis[Math.floor(Math.random() * emojis.length)];
    const angle = (25 + Math.random() * 130) * Math.PI / 180;
    const distance = 34 + Math.random() * 48;
    particle.style.left = (rect.left + rect.width * (0.25 + Math.random() * 0.5)) + "px";
    particle.style.top = (rect.bottom - 2) + "px";
    particle.style.setProperty("--dx", Math.cos(angle) * distance + "px");
    particle.style.setProperty("--dy", Math.sin(angle) * distance + 16 + "px");
    particle.style.setProperty("--spin", (-35 + Math.random() * 70) + "deg");
    particle.style.setProperty("--delay", (Math.random() * 80) + "ms");
    layer.appendChild(particle);
  }

  document.body.appendChild(layer);
  window.setTimeout(() => layer.remove(), 1000);
}

async function begForReset() {
  if (!resetBegButton || resetBegButton.disabled) return;
  resetBegButton.disabled = true;
  resetBegButton.classList.remove("is-begging");
  void resetBegButton.offsetWidth;
  resetBegButton.classList.add("is-begging");
  try {
    const result = await jsonFetch("/api/reset-beg", { method: "POST", body: "{}" });
    if (resetBegCount) resetBegCount.textContent = Number(result?.count || 0).toLocaleString("en-US");
    burstBegParticles(resetBegButton);
  } catch {
    showToast("求重置失败，再戳一次试试", 2400);
  } finally {
    window.setTimeout(() => {
      resetBegButton.disabled = false;
      resetBegButton.classList.remove("is-begging");
    }, 550);
  }
}

function renderBreakdown(container, rows) {
  container.replaceChildren();
  const values = Array.isArray(rows) ? rows.slice(0, 6) : [];
  if (!values.length) {
    const empty = document.createElement("div");
    empty.className = "breakdown-empty";
    empty.textContent = "还没有明细";
    container.appendChild(empty);
    return;
  }

  const max = Math.max(...values.map((row) => Number(row.total_tokens || 0)), 1);
  values.forEach((row) => {
    const item = document.createElement("div");
    item.className = "breakdown-row";

    const label = document.createElement("span");
    label.className = "breakdown-name";
    label.textContent = row.name || "unknown";

    const bar = document.createElement("span");
    bar.className = "breakdown-bar";
    bar.style.setProperty("--fill", Math.max(3, Number(row.total_tokens || 0) / max * 100) + "%");

    const value = document.createElement("strong");
    value.textContent = formatTokens(row.total_tokens || 0);

    item.append(label, bar, value);
    container.appendChild(item);
  });
}

function renderRiderTrend(rows) {
  riderTrend.replaceChildren();
  const values = Array.isArray(rows) ? rows : [];
  const max = Math.max(...values.map((row) => Number(row.total_tokens || 0)), 1);
  values.forEach((row) => {
    const item = document.createElement("div");
    item.className = "trend-bar-item";

    const value = document.createElement("div");
    value.className = "trend-value";
    value.style.height = Math.max(5, Number(row.total_tokens || 0) / max * 72) + "px";
    value.title = row.date + " · " + formatTokens(row.total_tokens || 0);

    const label = document.createElement("span");
    label.textContent = String(row.date || "").slice(5).replace("-", "/");

    item.append(value, label);
    riderTrend.appendChild(item);
  });
}

function renderRiderDevices(items) {
  riderDevices.replaceChildren();
  const devices = Array.isArray(items) ? items : [];
  if (!devices.length) {
    riderDevices.textContent = "今天没有设备快照";
    return;
  }
  devices.forEach((device) => {
    const item = document.createElement("div");
    item.className = "rider-device-chip";
    const harness = device.harness ? String(device.harness) + " · " : "";
    item.textContent = harness + (device.name || "Agent 环境") + " · " + formatTokens(device.today_tokens || 0);
    riderDevices.appendChild(item);
  });
}

async function openRiderDetail(rider) {
  if (!rider || rider.demo) return;
  riderDetailTitle.textContent = rider.display_name || "骑手";
  riderDetailSummary.textContent = "正在读取今天的 model / project 明细…";
  riderModels.replaceChildren();
  riderProjects.replaceChildren();
  riderTrend.replaceChildren();
  riderDevices.replaceChildren();
  if (!riderDialog.open) riderDialog.showModal();

  try {
    if (previewMode) {
      const fake = {
        today_tokens: rider.today_tokens || 0,
        models: [{ name: "gpt-5.6-sol", total_tokens: Math.round((rider.today_tokens || 0) * .8) }],
        projects: [{ name: "vimo-sop", total_tokens: Math.round((rider.today_tokens || 0) * .55) }],
        trend: Array.from({ length: 7 }, (_v, i) => ({
          date: "09/" + String(22 + i).padStart(2, "0"),
          total_tokens: Math.round((rider.today_tokens || 0) * (.35 + i * .1)),
        })),
        installations: [{ name: "Preview", harness: "codex", today_tokens: rider.today_tokens || 0 }],
      };
      riderDetailSummary.textContent = "今日 " + formatTokens(fake.today_tokens);
      renderBreakdown(riderModels, fake.models);
      renderBreakdown(riderProjects, fake.projects);
      renderRiderTrend(fake.trend);
      renderRiderDevices(fake.installations);
      return;
    }

    const payload = await jsonFetch("/api/riders/" + encodeURIComponent(rider.user_id));
    riderDetailTitle.textContent = payload.user?.display_name || rider.display_name || "骑手";
    riderDetailSummary.textContent =
      "今日 " + formatTokens(payload.today_tokens || 0) +
      " · " + (payload.installations || []).length + " 个 Agent 环境";
    renderBreakdown(riderModels, payload.models);
    renderBreakdown(riderProjects, payload.projects);
    renderRiderTrend(payload.trend);
    renderRiderDevices(payload.installations);
  } catch (error) {
    riderDetailSummary.textContent = "读取失败：" + error.message;
  }
}

function stateFor(rider) {
  if (rider.mood === "chill") return ["is-chill"];
  if (rider.mood === "tired") return ["is-tired"];
  return [];
}

function stableHash(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}
function lanePlan(riders) {
  // Stable pseudo-random order, then round-robin across all four lanes.
  // This keeps the layout playful between identities while preventing the
  // leaderboard leaders from permanently crowding the top lanes.
  const ordered = [...riders].sort((a, b) => {
    const ah = stableHash(a.user_id + ":lane");
    const bh = stableHash(b.user_id + ":lane");
    return ah - bh || String(a.user_id).localeCompare(String(b.user_id));
  });
  const laneById = new Map();
  const offset = ordered.length
    ? stableHash(ordered.map((rider) => rider.user_id).join("|")) % 4
    : 0;

  ordered.forEach((rider, index) => {
    laneById.set(rider.user_id, ((index + offset) % 4) + 1);
  });

  return riders.map((rider) => ({
    ...rider,
    lane: laneById.get(rider.user_id) || 1
  }));
}

function positionPlan(riders) {
  const targetById = new Map();

  for (let lane = 1; lane <= 4; lane += 1) {
    const laneRiders = riders
      .filter((rider) => rider.lane === lane)
      .sort((a, b) => (
        stableHash(a.user_id + ":club-order")
        - stableHash(b.user_id + ":club-order")
      ));
    const count = laneRiders.length;
    laneRiders.forEach((rider, index) => {
      const x = count <= 1
        ? 50
        : 20 + index * (60 / Math.max(1, count - 1));
      const jitter = ((stableHash(rider.user_id + ":club-jitter") % 7) - 3) * 0.7;
      targetById.set(rider.user_id, Math.max(16, Math.min(84, x + jitter)));
    });
  }

  return riders.map((rider) => ({
    ...rider,
    x: targetById.get(rider.user_id) || 50
  }));
}

const TRANSPORT_LABELS = Object.freeze({
  bike: "自行车",
  scooter: "滑板车",
  skateboard: "滑板",
  walk: "古法通勤",
  surf: "冲浪",
  skate: "轮滑",
});

const PERSONALITIES = Object.freeze([
  { id: "coffee", emoji: "☕", label: "通勤党" },
  { id: "headphones", emoji: "🎧", label: "摸鱼骑手" },
  { id: "cat", emoji: "🐈", label: "带猫上班" },
  { id: "gear", emoji: "🎒", label: "装备党" },
  { id: "plant", emoji: "🌱", label: "佛系骑手" },
  { id: "engineer", emoji: "💻", label: "工程师" },
  { id: "milk-tea", emoji: "🧋", label: "奶茶骑手" },
  { id: "sleepy", emoji: "💤", label: "困困骑手" },
]);

function transportFor(rider) {
  const value = String(rider.transport || "bike");
  return TRANSPORT_LABELS[value] ? value : "bike";
}

function personalityFor(rider) {
  return PERSONALITIES[
    stableHash(String(rider.user_id || "rider") + ":personality") % PERSONALITIES.length
  ];
}

function transportMarkup(transport) {
  if (transport === "scooter") {
    return '<div class="transport transport-scooter">' +
      '<i class="mini-wheel rear"></i><i class="mini-wheel front"></i>' +
      '<i class="scooter-deck"></i><i class="scooter-stem"></i><i class="scooter-handle"></i>' +
    '</div>';
  }
  if (transport === "skateboard") {
    return '<div class="transport transport-skateboard">' +
      '<i class="skateboard-deck"></i><i class="board-wheel rear"></i><i class="board-wheel front"></i>' +
    '</div>';
  }
  if (transport === "walk") {
    return '<div class="transport transport-walk">' +
      '<i class="walk-shadow"></i><i class="shoe shoe-a"></i><i class="shoe shoe-b"></i>' +
    '</div>';
  }
  if (transport === "surf") {
    return '<div class="transport transport-surf">' +
      '<i class="surf-wave">≈≈</i><i class="surf-board"></i>' +
    '</div>';
  }
  if (transport === "skate") {
    return '<div class="transport transport-skate">' +
      '<i class="skate-boot boot-a"></i><i class="skate-boot boot-b"></i>' +
    '</div>';
  }
  return '<div class="bike transport transport-bike">' +
    '<div class="wheel back"></div>' +
    '<div class="wheel front"></div>' +
    '<div class="frame"></div>' +
  '</div>';
}

function raceAvatarEmoji(rider) {
  const emoji = String(rider.avatar_emoji || "🙂");
  const transportLike = new Set(["🚴", "🚵", "🚲", "🛴", "🛹", "🏄", "🛼"]);
  return transportLike.has(emoji) ? "🙂" : emoji;
}

function riderMarkup(rider) {
  const classes = stateFor(rider).join(" ");
  const transport = transportFor(rider);
  const personality = personalityFor(rider);
  const phase = -((stableHash(rider.user_id) % 90) / 100).toFixed(2);
  const cadence = rider.mood === "chill" ? 1.14 : 0.78;
  const edgeClass = Number(rider.x || 0) >= 80 ? " is-near-right" : "";
  return (
    '<div class="rider mode-' + transport + ' ' + classes + edgeClass + '" data-rider-id="' + rider.user_id + '"' +
      ' data-transport="' + transport + '"' +
      ' style="--x:' + rider.x + '%;--accent:' + (rider.accent || "#4c8ad9") +
      ';--phase:' + phase + 's;--cadence:' + cadence + 's">' +
      '<div class="effect-speed"></div>' +
      '<div class="effect-fire"></div>' +
      '<div class="effect-dust"></div>' +
      '<div class="effect-sweat"></div>' +
      '<div class="effect-music">♪</div>' +
      '<div class="effect-burst">嘿!</div>' +
      '<div class="rider-message-bubble" role="status" aria-live="polite"></div>' +
      '<button class="rider-message-button" type="button" aria-label="查看最近留言" aria-expanded="false" hidden>…</button>' +
      (rider.is_leader ? '<div class="leader-crown" aria-label="今日第一" title="今日第一">👑</div>' : '') +
      '<div class="rider-motion">' +
        '<div class="rider-inner">' +
          '<div class="avatar-ring">' +
            (rider.avatar_url
              ? '<img src="' + escapeHtml(rider.avatar_url) + '" alt="">'
              : '<span class="emoji-avatar">' + escapeHtml(raceAvatarEmoji(rider)) + '</span>') +
          '</div>' +
          '<span class="personality-accessory" title="' + escapeHtml(personality.label) + '">' +
            personality.emoji +
          '</span>' +
          '<span class="social-prop" aria-hidden="true"></span>' +
          '<div class="body"></div>' +
          '<div class="arm"></div>' +
          '<div class="leg leg-a"></div>' +
          '<div class="leg leg-b"></div>' +
          transportMarkup(transport) +
        '</div>' +
      '</div>' +
      (rider.equipped_achievement
        ? '<div class="rider-achievement" title="' +
            escapeHtml(rider.equipped_achievement.name || "成就") + '">' +
            escapeHtml(rider.equipped_achievement.emoji || "🏅") +
          '</div>'
        : '') +
      '<div class="name-chip" title="' + escapeHtml(TRANSPORT_LABELS[transport]) + '">' +
        '<span class="rider-name">' + escapeHtml(rider.display_name || "同事") + '</span>' +
        '<small class="tokens"' +
          (Number(rider.today_tokens || 0) > 0 ? "" : " hidden") + ">" +
          (Number(rider.today_tokens || 0) > 0 ? formatTokens(rider.today_tokens) : "") +
        '</small>' +
      '</div>' +
    '</div>'
  );
}

const RIDER_STATE_CLASSES = ["is-fast", "is-burning", "is-chill", "is-tired"];

function updateRiderNode(node, rider) {
  node._riderData = rider;

  RIDER_STATE_CLASSES.forEach((className) => node.classList.remove(className));
  stateFor(rider).forEach((className) => {
    if (className !== "effect-heavy") node.classList.add(className);
  });

  const baselineHeavy = stateFor(rider).includes("effect-heavy");
  if (baselineHeavy) {
    node.classList.add("effect-heavy");
  } else if (!activeMotion.has(rider.user_id)) {
    node.classList.remove("effect-heavy");
  }

  node.style.setProperty("--x", rider.x + "%");
  node.classList.toggle("is-near-right", Number(rider.x || 0) >= 80);
  node.style.setProperty("--accent", rider.accent || "#4c8ad9");
  node.style.setProperty(
    "--cadence",
    (rider.mood === "chill" ? 1.14 : rider.mood === "burning" ? 0.48 : 0.72) + "s",
  );

  const name = node.querySelector(".name-chip .rider-name");
  const tokens = node.querySelector(".name-chip .tokens");
  if (name) name.textContent = rider.display_name || "同事";
  if (tokens) {
    tokens.textContent = Number(rider.today_tokens || 0) > 0 ? formatTokens(rider.today_tokens) : "";
    tokens.hidden = Number(rider.today_tokens || 0) <= 0;
  }

  const nextTransport = transportFor(rider);
  if (node.dataset.transport !== nextTransport) {
    const currentTransport = node.querySelector(".transport");
    currentTransport?.insertAdjacentHTML("afterend", transportMarkup(nextTransport));
    currentTransport?.remove();
    Object.keys(TRANSPORT_LABELS).forEach((key) => node.classList.remove("mode-" + key));
    node.classList.add("mode-" + nextTransport);
    node.dataset.transport = nextTransport;
    const chip = node.querySelector(".name-chip");
    if (chip) chip.title = TRANSPORT_LABELS[nextTransport];
  }

  const equipped = rider.equipped_achievement || null;
  let achievement = node.querySelector(".rider-achievement");
  if (equipped) {
    if (!achievement) {
      achievement = document.createElement("div");
      achievement.className = "rider-achievement";
      const chip = node.querySelector(".name-chip");
      node.insertBefore(achievement, chip);
    }
    achievement.textContent = equipped.emoji || "🏅";
    achievement.title = equipped.name || "成就";
  } else if (achievement) {
    achievement.remove();
  }

  const ring = node.querySelector(".avatar-ring");
  const avatarKey = rider.avatar_url
    ? "url:" + rider.avatar_url
    : "emoji:" + raceAvatarEmoji(rider);
  if (ring && node.dataset.avatarKey !== avatarKey) {
    node.dataset.avatarKey = avatarKey;
    ring.replaceChildren();
    if (rider.avatar_url) {
      const image = document.createElement("img");
      image.src = rider.avatar_url;
      image.alt = "";
      ring.appendChild(image);
    } else {
      const emoji = document.createElement("span");
      emoji.className = "emoji-avatar";
      emoji.textContent = raceAvatarEmoji(rider);
      ring.appendChild(emoji);
    }
  }

  const crown = node.querySelector(".leader-crown");
  if (rider.is_leader && !crown) {
    const next = node.querySelector(".rider-motion");
    const leaderCrown = document.createElement("div");
    leaderCrown.className = "leader-crown";
    leaderCrown.setAttribute("aria-label", "第一名");
    leaderCrown.textContent = "👑";
    node.insertBefore(leaderCrown, next);
  } else if (!rider.is_leader && crown) {
    crown.remove();
  }

  if (rider.demo) {
    node.classList.remove("is-clickable");
  } else {
    node.classList.add("is-clickable");
  }
}

function renderRiders(riders) {
  const realLeader = [...riders]
    .filter((rider) => !rider.demo)
    .sort((a, b) => Number(b.today_tokens || 0) - Number(a.today_tokens || 0))[0];
  const leaderId = realLeader?.user_id || null;

  visibleRiders = positionPlan(lanePlan(riders)).map((rider) => ({
    ...rider,
    is_leader: rider.user_id === leaderId,
  }));

  const existing = new Map(
    [...document.querySelectorAll(".rider")]
      .map((node) => [node.dataset.riderId, node]),
  );
  const liveIds = new Set(visibleRiders.map((rider) => rider.user_id));

  existing.forEach((node, riderId) => {
    if (!liveIds.has(riderId)) {
      activeMotion.delete(riderId);
      clearTimeout(riderMessageTimers.get(riderId));
      riderMessageTimers.delete(riderId);
      if (pinnedMessageRiderId === riderId) pinnedMessageRiderId = null;
      node.remove();
    }
  });

  visibleRiders.forEach((rider) => {
    const lane = $("lane" + rider.lane);
    let node = existing.get(rider.user_id);

    if (!node) {
      lane.insertAdjacentHTML("beforeend", riderMarkup(rider));
      node = lane.lastElementChild;
      const sizeJitter = (stableHash(rider.user_id + ":size") % 5) * 0.035;
      node.style.setProperty("--scale", String(1.06 + sizeJitter));
      node.dataset.avatarKey = rider.avatar_url
        ? "url:" + rider.avatar_url
        : "emoji:" + raceAvatarEmoji(rider);
      node.addEventListener("click", () => {
        if (node._riderData && !node._riderData.demo) {
          void openRiderDetail(node._riderData);
        }
      });
      node.querySelector(".rider-message-button")?.addEventListener("click", (event) => {
        event.stopPropagation();
        togglePinnedRiderMessage(rider.user_id);
      });
    } else if (node.parentElement !== lane) {
      lane.appendChild(node);
    }

    updateRiderNode(node, rider);
    updateRiderMessageButton(node, rider.user_id);
  });

  const total = visibleRiders
    .filter((rider) => !rider.demo)
    .reduce((sum, rider) => sum + Number(rider.today_tokens || 0), 0);
  todayTotalEl.textContent = formatTokens(total);
}

async function loadRaceData() {
  if (previewMode) {
    renderRiders(PREVIEW_RIDERS);
    return;
  }
  const payload = await jsonFetch("/api/riders");
  const real = (payload.riders || []).map((rider) => ({
    ...rider,
    display_name: rider.user_id === (me && me.user_id)
      ? ("我 · " + (rider.display_name || "骑手"))
      : (rider.display_name || "骑手"),
    accent: rider.user_id === (me && me.user_id) ? "#4c8ad9" : "#5eaa7d"
  }));

  renderRiders(real);
}

const MOTION_ACTIONS = {
  wave: {
    className: "is-waving",
    duration: 3200,
    bursts: ["嗨～", "还蹬呢?", "早啊", "下班没?"],
    props: ["👋"]
  },
  sip: {
    className: "is-sipping",
    duration: 3400,
    bursts: ["喝口水", "咖啡续命", "奶茶时间", "先抿一口"],
    props: ["☕", "🧋", "🥤"]
  },
  stretch: {
    className: "is-stretching",
    duration: 3300,
    bursts: ["伸个懒腰", "肩膀报警", "活动一下"]
  },
  yawn: {
    className: "is-yawning",
    duration: 3500,
    bursts: ["哈欠…", "眼睛下班了", "困了"],
    props: ["💤"]
  },
  coast: {
    className: "is-coasting",
    duration: 3800,
    bursts: ["滑一会", "这段不蹬", "省点腿", "随缘前进"]
  },
  sprint: {
    className: "is-sprinting",
    duration: 1800,
    bursts: ["突然来劲!", "冲两秒!", "腿自己动了"]
  },
  wheelie: {
    className: "is-wheelie",
    duration: 1800,
    bursts: ["小整一下", "芜湖!", "别摔!"]
  },
  bonk: {
    className: "is-bonking",
    duration: 2200,
    bursts: ["歇会儿", "摸会鱼", "CPU 凉一下"]
  },
  celebrate: {
    className: "is-celebrating",
    duration: 1900,
    bursts: ["嘿!", "今天也行", "准备下班"]
  }
};

function chooseMotion(rider) {
  const personality = personalityFor(rider).id;
  const personalityRoll = Math.random();

  if ((personality === "coffee" || personality === "milk-tea") && personalityRoll < 0.34) {
    return MOTION_ACTIONS.sip;
  }
  if (personality === "sleepy" && personalityRoll < 0.38) {
    return MOTION_ACTIONS.yawn;
  }
  if (personality === "plant" && personalityRoll < 0.3) {
    return MOTION_ACTIONS.coast;
  }

  const roll = Math.random();
  if (roll < 0.20) return MOTION_ACTIONS.wave;
  if (roll < 0.36) return MOTION_ACTIONS.sip;
  if (roll < 0.50) return MOTION_ACTIONS.stretch;
  if (roll < 0.64) return MOTION_ACTIONS.yawn;
  if (roll < 0.88) return MOTION_ACTIONS.coast;
  if (roll < 0.91) return MOTION_ACTIONS.sprint;
  if (roll < 0.94) return MOTION_ACTIONS.wheelie;
  if (roll < 0.97) return MOTION_ACTIONS.bonk;
  return MOTION_ACTIONS.celebrate;
}

function randomFrom(values) {
  return values[Math.floor(Math.random() * values.length)];
}

function triggerMotion(rider, node, action, options = {}) {
  if (!node || activeMotion.has(rider.user_id)) return false;
  const burst = node.querySelector(".effect-burst");
  const motion = node.querySelector(".rider-motion");
  const prop = node.querySelector(".social-prop");
  const text = options.text || randomFrom(action.bursts || ["嘿"]);

  if (burst) burst.textContent = text;
  if (prop) {
    const propText = options.prop || (action.props?.length ? randomFrom(action.props) : "");
    prop.textContent = propText;
    node.classList.toggle("has-social-prop", Boolean(propText));
  }

  activeMotion.set(rider.user_id, action.className);
  node.classList.add(action.className);
  if (action === MOTION_ACTIONS.sprint && Math.random() > 0.86) {
    node.classList.add("effect-heavy");
  }

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    node.classList.remove(action.className);
    node.classList.remove("effect-heavy");
    node.classList.remove("has-social-prop");
    if (prop) prop.textContent = "";
    activeMotion.delete(rider.user_id);
  };

  const onEnd = (event) => {
    if (event.target !== motion) return;
    motion.removeEventListener("animationend", onEnd);
    finish();
  };

  motion?.addEventListener("animationend", onEnd);
  window.setTimeout(() => {
    motion?.removeEventListener("animationend", onEnd);
    finish();
  }, action.duration + 180);
  return true;
}

function nearbyRiderPairs() {
  const available = visibleRiders
    .filter((rider) => !activeMotion.has(rider.user_id))
    .sort((a, b) => a.lane - b.lane || Number(a.x || 0) - Number(b.x || 0));
  const pairs = [];

  for (let index = 1; index < available.length; index += 1) {
    const left = available[index - 1];
    const right = available[index];
    if (
      left.lane === right.lane
      && Math.abs(Number(left.x || 0) - Number(right.x || 0)) <= 22
    ) {
      pairs.push([left, right]);
    }
  }
  return pairs;
}

function triggerNearbyWave() {
  const pairs = nearbyRiderPairs();
  if (!pairs.length) return false;
  const [first, second] = randomFrom(pairs);
  const firstNode = document.querySelector('[data-rider-id="' + first.user_id + '"]');
  const secondNode = document.querySelector('[data-rider-id="' + second.user_id + '"]');
  if (!firstNode || !secondNode) return false;

  const lines = [
    ["嗨～", "还蹬呢?"],
    ["早啊", "早!"],
    ["下班没?", "快了快了"],
    ["今天咋样?", "随缘蹬"],
  ];
  const [firstText, secondText] = randomFrom(lines);
  const firstTriggered = triggerMotion(first, firstNode, MOTION_ACTIONS.wave, { text: firstText });
  const secondTriggered = triggerMotion(second, secondNode, MOTION_ACTIONS.wave, { text: secondText });
  return firstTriggered || secondTriggered;
}

function scheduleDirector() {
  clearTimeout(directorTimer);
  const delay = 2600 + Math.random() * 2600;
  directorTimer = setTimeout(() => {
    if (!visibleRiders.length) {
      scheduleDirector();
      return;
    }

    // Social interactions win over performance theatre when two riders happen
    // to drift close together.
    if (visibleRiders.length > 1 && Math.random() < 0.34 && triggerNearbyWave()) {
      scheduleDirector();
      return;
    }

    const available = visibleRiders.filter((rider) => !activeMotion.has(rider.user_id));
    const chosen = available.length ? randomFrom(available) : null;
    const node = chosen && document.querySelector('[data-rider-id="' + chosen.user_id + '"]');

    if (node) triggerMotion(chosen, node, chooseMotion(chosen));
    scheduleDirector();
  }, delay);
}

function scheduleAmbientDrift() {
  clearInterval(ambientTimer);
  ambientTimer = setInterval(() => {
    visibleRiders.forEach((rider) => {
      const node = document.querySelector('[data-rider-id="' + rider.user_id + '"]');
      if (!node || activeMotion.has(rider.user_id)) return;
      const current = Number(node.dataset.drift || 0);
      const next = Math.max(-2.2, Math.min(2.2, current + (Math.random() - 0.5) * 1.4));
      node.dataset.drift = String(next);
      node.style.left = Math.max(17, Math.min(84, Number(rider.x || 50) + next)) + "%";
    });
  }, 4200);
}

function stopRaceRuntime() {
  clearTimeout(directorTimer);
  clearInterval(ambientTimer);
  clearInterval(refreshTimer);
  directorTimer = null;
  ambientTimer = null;
  refreshTimer = null;
}

function startRaceRuntime() {
  stopRaceRuntime();
  if (document.hidden) return;
  scheduleDirector();
  scheduleAmbientDrift();
  refreshTimer = setInterval(() => {
    if (document.hidden) return;
    loadRaceData().catch(() => {});
    loadEvents().catch(() => {});
  }, 20000);
}

async function enterRace() {
  loginOverlay.classList.add("hidden");

  if (!previewMode && typeof me?.installation_count !== "number") {
    try {
      const result = await jsonFetch("/api/me");
      me = result.user;
    } catch {}
  }

  renderFreshness();
  await loadRaceData();
  void loadResetNotch();
  void loadEvents();
  if (me?.has_today_sample === false && !me?.needs_onboarding) {
    showToast("今天还没刷新赛道；对当前 Agent 说「上传蹬了吗」即可", 5200);
  }
  startRaceRuntime();

  const params = new URLSearchParams(location.search);
  const wantsBind = params.get("bind") === "1" || params.get("action") === "bind";
  if (me?.needs_onboarding || wantsBind) {
    pairingResult.classList.add("hidden");
    pairingCodeCurrent = null;
    pairingCommandMode = "shell";
    if (!pairDialog.open) pairDialog.showModal();
    if (me?.needs_onboarding) createPairingButton.click();
  }
}

async function bootstrap() {
  previewMode = new URLSearchParams(location.search).get("preview") === "1";

  if (previewMode) {
    me = { user_id: "preview_me", display_name: "我", avatar_emoji: "🚴" };
    loginOverlay.classList.add("hidden");
    await loadRaceData();
    await loadEvents();
    startRaceRuntime();

    const forcedMotion = new URLSearchParams(location.search).get("motion");
    if (forcedMotion && MOTION_ACTIONS[forcedMotion]) {
      window.setTimeout(() => {
        const rider = visibleRiders[0];
        const node = rider && document.querySelector('[data-rider-id="' + rider.user_id + '"]');
        if (rider && node) triggerMotion(rider, node, MOTION_ACTIONS[forcedMotion]);
      }, 120);
    }
    return;
  }

  try {
    const result = await jsonFetch("/api/me");
    me = result.user;
    await enterRace();
  } catch (error) {
    if (error.status !== 401) throw error;
    showRegisterPanel();
    loginOverlay.classList.remove("hidden");
  }
}

function selectedAutoUploadInterval() {
  return autoUploadConsent?.checked
    ? (autoUploadInterval?.value || "3h")
    : "off";
}

function buildAgentConnectPrompt(code) {
  if (!code) return "";
  const autoInterval = selectedAutoUploadInterval();
  return [
    "接入蹬了吗。请把当前 Agent Harness 作为一个独立 installation 绑定并上传第一次 usage。",
    "",
    "Denglema server: " + DENGLEMA_SERVER,
    "Pairing code: " + code,
    "Usage Contract: " + DENGLEMA_CONTRACT_URL,
    "",
    "要求：",
    "1. 识别当前 harness（例如 cursor / claude-code / other），不要假装成 Codex。",
    "2. 优先使用当前 harness 自己可信的 usage API、日志或状态文件；不要读取/上传 prompt、代码、tool 内容、完整路径、chat/thread 名或 transcript。",
    "3. POST /api/installations/pair，body 包含 code 和一个友好的 installation_name；必须拿到 installation_id + token 才算绑定成功。",
    "4. 将 server / installation_id / token / timezone / harness 保存在本机私有状态中（建议 ~/.denglema/connection.json，权限尽量 0600）。绝对不要把 token 打印给我。",
    "5. 收集当前日期的累计 usage，不是只统计当前会话。生成 schema v2：schema_version=2、harness、date、observed_at、total_tokens、models[]、projects[]。projects 只用 workspace basename；拿不到 breakdown 就传 []，不要猜。",
    "6. 用 Authorization: Bearer <token> POST /api/usage/sample 上传第一次快照。",
    "7. 完成后只告诉我 harness、installation_id、日期和 total_tokens；不要回显 token。",
    autoInterval === "off"
      ? "8. 用户未授权自动上传：不要创建后台上传任务。"
      : "8. 用户已明确授权自动上传，周期为 " + autoInterval + "。如果当前 harness 有可靠的本地 scheduler / 常驻进程，请按该周期上传；如果没有，不要假装已配置成功，要明确说明限制。",
    "",
    "以后我说「上传蹬了吗」时，复用同一 connection，并按同一 Usage Contract 上传当前 harness 的累计 usage。"
  ].join("\n");
}

function buildOneStepCommand(code, mode = pairingCommandMode) {
  if (!code) return "";
  const autoInterval = selectedAutoUploadInterval();
  if (mode === "agent") return buildAgentConnectPrompt(code);
  if (mode === "powershell") {
    return [
      "codex plugin marketplace add " + DENGLEMA_MARKETPLACE + " 2>$null | Out-Null",
      "codex plugin marketplace upgrade denglema | Out-Null",
      "$p = codex plugin add --json denglema@denglema | ConvertFrom-Json",
      "$cli = Join-Path $p.installedPath 'src/cli.js'",
      "node $cli denglema bind --server " + DENGLEMA_SERVER + " --code " + code,
      "node $cli denglema auto-upload --interval " + autoInterval
    ].join("; ");
  }

  const readRoot =
    "node -e 'let s=\"\";process.stdin.on(\"data\",c=>s+=c).on(\"end\",()=>process.stdout.write(JSON.parse(s).installedPath))'";
  return [
    "codex plugin marketplace add " + DENGLEMA_MARKETPLACE + " >/dev/null 2>&1 || true",
    "codex plugin marketplace upgrade denglema >/dev/null",
    "ROOT=$(codex plugin add --json denglema@denglema | " + readRoot + ")",
    "node \"$ROOT/src/cli.js\" denglema bind --server " + DENGLEMA_SERVER + " --code " + code,
    "node \"$ROOT/src/cli.js\" denglema auto-upload --interval " + autoInterval
  ].join("; ");
}

function renderOneStepCommand() {
  const isAgent = pairingCommandMode === "agent";
  bindCommandEl.textContent = buildOneStepCommand(pairingCodeCurrent);
  useShellCommandButton.classList.toggle("is-selected", pairingCommandMode === "shell");
  usePowerShellCommandButton.classList.toggle("is-selected", pairingCommandMode === "powershell");
  useAgentPromptButton?.classList.toggle("is-selected", isAgent);
  copyBindCommandButton.textContent = isAgent ? "复制 Agent Prompt" : "复制命令";
  if (bindHelpText) {
    const autoInterval = selectedAutoUploadInterval();
    bindHelpText.textContent = isAgent
      ? "把 Prompt 发给当前 Agent；它会绑定并上传第一份 usage。" +
        (autoInterval === "off" ? " 自动上传保持关闭。" : " 已授权自动更新：" + autoInterval + "。")
      : "执行完后不用再操作网页；第一次快照会自动上传。" +
        (autoInterval === "off" ? " 后续保持手动刷新。" : " 后续自动更新：" + autoInterval + "。");
  }
}

function stopPairingPoll() {
  if (pairingPollTimer !== null) clearInterval(pairingPollTimer);
  pairingPollTimer = null;
}

function clearBindIntentFromUrl() {
  const next = new URL(location.href);
  next.searchParams.delete("bind");
  next.searchParams.delete("action");
  history.replaceState(null, "", next.pathname + next.search + next.hash);
}

async function waitForTodaySample(maxAttempts = 8, delayMs = 850) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const meResult = await jsonFetch("/api/me");
      me = meResult.user;
      renderFreshness();
      if (me?.has_today_sample) return true;
    } catch {}
    await new Promise((resolve) => window.setTimeout(resolve, delayMs));
  }
  return false;
}

function startPairingPoll(code) {
  stopPairingPoll();

  const check = async () => {
    try {
      const result = await jsonFetch(
        "/api/pairing-codes/" + encodeURIComponent(code) + "/status"
      );

      if (result.status === "consumed") {
        stopPairingPoll();
        pairingCodeEl.textContent = "接入成功 ✓";
        bindCommandEl.textContent = "正在完成第一次快照上传…";
        clearBindIntentFromUrl();

        const uploaded = await waitForTodaySample();
        if (pairDialog.open) pairDialog.close();

        try { await loadRaceData(); } catch {}

        if (uploaded) {
          showToast("Agent 接入成功，usage 已上传并刷新赛道", 4800);
        } else {
          showToast("Agent 已绑定，但第一次 usage 还没上传完成。可点「刷新赛道」复制 Prompt", 6500);
        }
        return;
      }

      if (result.status === "expired") {
        stopPairingPoll();
        pairingCodeEl.textContent = "命令已过期";
        bindCommandEl.textContent = "请重新生成接入内容";
      }
    } catch (error) {
      if (error.status === 401 || error.status === 404) stopPairingPoll();
    }
  };

  void check();
  pairingPollTimer = setInterval(() => { void check(); }, 1200);
}

function formatDeviceTime(value) {
  if (!value) return "还没上传";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未知";
  return date.toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function renderDevices(payload) {
  const devices = payload.installations || [];
  devicesSummary.textContent =
    "今日合计 " + formatTokens(payload.total_tokens || 0) + " · " + devices.length + " 个 Agent 环境";
  devicesList.replaceChildren();

  if (!devices.length) {
    const empty = document.createElement("div");
    empty.className = "device-row";
    empty.textContent = "还没有接入 Agent";
    devicesList.appendChild(empty);
    return;
  }

  devices.forEach((device) => {
    const row = document.createElement("div");
    row.className = "device-row";

    const left = document.createElement("div");
    const name = document.createElement("div");
    name.className = "device-name";
    name.textContent = device.name || "Agent 设备";
    const meta = document.createElement("div");
    meta.className = "device-meta";
    meta.textContent = device.has_today_sample
      ? "最近上传 " + formatDeviceTime(device.last_seen_at)
      : "今天还没上传";
    left.append(name, meta);

    const actions = document.createElement("div");
    actions.className = "device-actions";

    const tokens = document.createElement("div");
    tokens.className = "device-tokens";
    tokens.textContent = formatTokens(device.today_tokens || 0);

    const revoke = document.createElement("button");
    revoke.type = "button";
    revoke.className = "device-revoke";
    revoke.textContent = "解除";
    revoke.addEventListener("click", async () => {
      const label = device.name || "这台设备";
      if (!window.confirm("解除绑定「" + label + "」？\n解除后这台设备需要重新执行接入命令才能继续上传。")) {
        return;
      }

      revoke.disabled = true;
      revoke.textContent = "解除中…";
      try {
        await jsonFetch(
          "/api/me/installations/" + encodeURIComponent(device.id),
          { method: "DELETE" }
        );
        showToast("已解除「" + label + "」；历史 token 保留", 3800);
        await loadDevices();
      } catch (error) {
        showToast("解除失败：" + error.message, 4200);
        revoke.disabled = false;
        revoke.textContent = "解除";
      }
    });

    actions.append(tokens, revoke);
    row.append(left, actions);
    devicesList.appendChild(row);
  });
}

async function loadDevices() {
  if (previewMode) {
    renderDevices({
      total_tokens: 1032432,
      installations: [
        { name: "Windows Laptop", today_tokens: 72432, has_today_sample: true, last_seen_at: new Date().toISOString() },
        { name: "WSL Ubuntu", today_tokens: 960000, has_today_sample: true, last_seen_at: new Date().toISOString() }
      ]
    });
    return;
  }
  renderDevices(await jsonFetch("/api/me/installations"));
}

devicesButton.addEventListener("click", async () => {
  devicesSummary.textContent = "正在读取设备…";
  devicesList.replaceChildren();
  devicesDialog.showModal();
  try {
    await loadDevices();
  } catch (error) {
    devicesSummary.textContent = "读取失败：" + error.message;
  }
});

uploadPromptButton.addEventListener("click", () => {
  uploadDialog.showModal();
});

copyUploadPromptButton.addEventListener("click", async () => {
  const prompt = uploadPromptText.textContent.trim();
  try {
    await navigator.clipboard.writeText(prompt);
    copyUploadPromptButton.textContent = "已复制 ✓";
    showToast("Prompt 已复制，回 Codex 粘贴发送即可", 2800);
  } catch {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(uploadPromptText);
    selection.removeAllRanges();
    selection.addRange(range);
    showToast("已选中 Prompt，请复制后回 Codex 发送", 3200);
  }
  window.setTimeout(() => {
    copyUploadPromptButton.textContent = "复制 Prompt";
  }, 1800);
});

pairButton.addEventListener("click", () => {
  stopPairingPoll();
  pairingCodeCurrent = null;
  pairingCommandMode = "shell";
  if (autoUploadConsent) autoUploadConsent.checked = false;
  if (autoUploadInterval) {
    autoUploadInterval.value = "3h";
    autoUploadInterval.disabled = true;
  }
  pairingResult.classList.add("hidden");
  pairDialog.showModal();
});

pairDialog.addEventListener("close", stopPairingPoll);

createPairingButton.addEventListener("click", async () => {
  createPairingButton.disabled = true;
  try {
    if (previewMode) {
      pairingCodeCurrent = "DEMO1600";
      pairingResult.classList.remove("hidden");
      pairingCodeEl.textContent = "演示接入内容";
      renderOneStepCommand();
      showToast("预览模式：命令不会真的绑定设备");
      return;
    }

    const result = await jsonFetch("/api/pairing-codes", {
      method: "POST",
      body: JSON.stringify({})
    });
    pairingCodeCurrent = result.code;
    pairingResult.classList.remove("hidden");
    pairingCodeEl.textContent = "命令 5 分钟有效";
    renderOneStepCommand();
    startPairingPoll(result.code);
  } catch (error) {
    showToast("生成失败：" + error.message);
  } finally {
    createPairingButton.disabled = false;
  }
});

useShellCommandButton.addEventListener("click", () => {
  pairingCommandMode = "shell";
  renderOneStepCommand();
});

usePowerShellCommandButton.addEventListener("click", () => {
  pairingCommandMode = "powershell";
  renderOneStepCommand();
});

useAgentPromptButton?.addEventListener("click", () => {
  pairingCommandMode = "agent";
  renderOneStepCommand();
});

autoUploadConsent?.addEventListener("change", () => {
  if (autoUploadInterval) autoUploadInterval.disabled = !autoUploadConsent.checked;
  renderOneStepCommand();
});

autoUploadInterval?.addEventListener("change", () => {
  renderOneStepCommand();
});

copyBindCommandButton.addEventListener("click", async () => {
  const command = bindCommandEl.textContent.trim();
  if (!command) return;
  try {
    await navigator.clipboard.writeText(command);
    copyBindCommandButton.textContent = "已复制 ✓";
    showToast(
      pairingCommandMode === "agent"
        ? "Agent Prompt 已复制，发给当前 Agent 即可"
        : "命令已复制，去 Codex 所在终端执行即可",
      3200
    );
  } catch {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(bindCommandEl);
    selection.removeAllRanges();
    selection.addRange(range);
    showToast(
      pairingCommandMode === "agent"
        ? "Prompt 已选中，请复制给当前 Agent"
        : "命令已选中，请复制到 Codex 所在终端执行",
      3200
    );
  }
  window.setTimeout(() => {
    copyBindCommandButton.textContent =
      pairingCommandMode === "agent" ? "复制 Agent Prompt" : "复制命令";
  }, 1800);
});

resetBegButton?.addEventListener("click", () => { void begForReset(); });

eventComposer?.addEventListener("submit", (event) => {
  event.preventDefault();
  void postEventMessage();
});

document.addEventListener("visibilitychange", () => {
  document.body.classList.toggle("is-background-paused", document.hidden);
  if (document.hidden) {
    stopRaceRuntime();
    return;
  }
  if (!loginOverlay.classList.contains("hidden")) return;

  void (async () => {
    if (!previewMode) {
      try {
        const result = await jsonFetch("/api/me");
        me = result.user;
        renderFreshness();
      } catch {}
    }
    try { await loadRaceData(); } catch {}
    void loadResetNotch();
      void loadEvents();
    startRaceRuntime();
  })();
});

showRecoverButton.addEventListener("click", showRecoverPanel);
showRegisterButton.addEventListener("click", showRegisterPanel);
registerButton.addEventListener("click", registerIdentity);
recoverButton.addEventListener("click", recoverIdentity);
copyRecoveryButton.addEventListener("click", copyRecoveryCode);
enterAfterRecoveryButton.addEventListener("click", async () => {
  loginOverlay.classList.add("hidden");
  await enterRace();
});

bootstrap().catch((error) => {
  statusEl.textContent = "进场失败：" + error.message;
  loginOverlay.classList.remove("hidden");
});

document.addEventListener("click", (event) => {
  if (!pinnedMessageRiderId) return;
  if (event.target.closest?.(".rider-message-button")) return;
  closeRiderMessage(pinnedMessageRiderId, { force: true });
});

window.addEventListener("beforeunload", () => {
  clearTimeout(directorTimer);
  clearInterval(refreshTimer);
  clearInterval(ambientTimer);
  stopPairingPoll();
  riderMessageTimers.forEach((timer) => clearTimeout(timer));
  riderMessageTimers.clear();
});
