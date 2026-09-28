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
const todayTotalEl = $("todayTotal");
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
let previewMode = false;
let raceFrameId = null;
let raceLastFrameAt = null;
const activeMotion = new Map();
const raceMotionState = new Map();

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

const DEMO_RIDERS = [
  {
    user_id: "demo_cruise",
    display_name: "Demo A",
    avatar_url: avatarSvg("#ffd46a", "#493829", "smile"),
    today_tokens: 1800000,
    recent_rate_tpm: 4200,
    demo: true,
    mood: "chill",
    accent: "#47a875"
  },
  {
    user_id: "demo_burning",
    display_name: "Demo B",
    avatar_url: avatarSvg("#ff8b69", "#312b2b", "rage"),
    today_tokens: 4200000,
    recent_rate_tpm: 48000,
    demo: true,
    mood: "burning",
    accent: "#f0793e"
  }
];

const PREVIEW_RIDERS = [
  {
    user_id: "preview_me",
    display_name: "我",
    avatar_url: avatarSvg("#a7c7f4", "#26354b", "smile"),
    today_tokens: 72432,
    recent_rate_tpm: 0,
    accent: "#4c8ad9"
  },
  {
    user_id: "preview_alice",
    display_name: "Alice",
    avatar_url: avatarSvg("#f7b7c4", "#49323a", "smile"),
    today_tokens: 960000,
    recent_rate_tpm: 15000,
    accent: "#dd718e"
  },
  {
    user_id: "preview_bob",
    display_name: "Bob",
    avatar_url: avatarSvg("#b7dfc7", "#29443a", "smile"),
    today_tokens: 640000,
    recent_rate_tpm: 7000,
    accent: "#4ca87c"
  },
  {
    user_id: "preview_tired",
    display_name: "摸鱼中",
    avatar_url: avatarSvg("#d6d5ea", "#3b3a4b", "smile"),
    today_tokens: 220000,
    recent_rate_tpm: 0,
    mood: "tired",
    accent: "#7b79ac"
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
    item.textContent = (device.name || "Codex 设备") + " · " + formatTokens(device.today_tokens || 0);
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
        installations: [{ name: "Preview device", today_tokens: rider.today_tokens || 0 }],
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
      " · " + (payload.installations || []).length + " 台设备";
    renderBreakdown(riderModels, payload.models);
    renderBreakdown(riderProjects, payload.projects);
    renderRiderTrend(payload.trend);
    renderRiderDevices(payload.installations);
  } catch (error) {
    riderDetailSummary.textContent = "读取失败：" + error.message;
  }
}

function stateFor(rider) {
  if (rider.mood === "burning") return ["is-fast", "is-burning", "effect-heavy"];
  if (rider.mood === "chill") return ["is-chill"];
  if (rider.mood === "tired") return ["is-tired"];
  const rate = Number(rider.recent_rate_tpm || 0);
  if (rate >= 30000) return ["is-fast", "is-burning", "effect-heavy"];
  if (rate >= 10000) return ["is-fast"];
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
  const ranked = [...riders].sort((a, b) => b.today_tokens - a.today_tokens);
  const count = Math.max(ranked.length - 1, 1);
  const targetById = new Map();

  ranked.forEach((rider, index) => {
    const rankRatio = 1 - index / count;
    const jitter = ((stableHash(rider.user_id + ":x") % 17) - 8) * 0.65;
    const x = 21 + rankRatio * 61 + jitter;
    targetById.set(rider.user_id, Math.max(14, Math.min(88, x)));
  });

  // Resolve near-overlaps inside each lane while keeping ranking visible.
  for (let lane = 1; lane <= 4; lane += 1) {
    const laneRiders = riders
      .filter((rider) => rider.lane === lane)
      .sort((a, b) => (targetById.get(a.user_id) || 50) - (targetById.get(b.user_id) || 50));

    let previous = 5;
    laneRiders.forEach((rider, index) => {
      const raw = targetById.get(rider.user_id) || 50;
      const stagger = ((stableHash(rider.user_id + ":stagger") % 5) - 2) * 1.2;
      let x = Math.max(raw + stagger, previous + (index ? 17 : 0));
      x = Math.min(90, x);
      targetById.set(rider.user_id, x);
      previous = x;
    });
  }

  return riders.map((rider) => ({
    ...rider,
    x: targetById.get(rider.user_id) || 45
  }));
}

function baseRaceSpeed(rider, index, riders) {
  const real = riders.filter((item) => !item.demo);
  const ranked = [...real].sort(
    (a, b) => Number(b.today_tokens || 0) - Number(a.today_tokens || 0),
  );
  const rank = ranked.findIndex((item) => item.user_id === rider.user_id);
  const rankBoost = rank >= 0 && ranked.length > 1
    ? (ranked.length - 1 - rank) / (ranked.length - 1)
    : 0.5;
  const rate = Math.max(0, Number(rider.recent_rate_tpm || 0));
  const rateBoost = Math.min(1, Math.log10(rate + 1) / 5);

  let speed = 0.024 + rankBoost * 0.005 + rateBoost * 0.004;
  if (rider.mood === "burning") speed += 0.004;
  if (rider.mood === "chill") speed -= 0.002;
  if (rider.mood === "tired") speed -= 0.0015;

  const jitter = ((stableHash(rider.user_id + ":race-speed") % 9) - 4) * 0.00035;
  return Math.max(0.019, Math.min(0.038, speed + jitter + index * 0.00005));
}

function syncRaceMotionState(riders) {
  const liveIds = new Set(riders.map((rider) => rider.user_id));

  riders.forEach((rider, index) => {
    const current = raceMotionState.get(rider.user_id);
    const speed = baseRaceSpeed(rider, index, riders);
    if (current) {
      current.speed = speed;
      current.rider = rider;
      return;
    }

    const initial = Math.max(-0.12, Math.min(1.12, Number(rider.x || 50) / 100));
    raceMotionState.set(rider.user_id, {
      progress: initial,
      speed,
      rider,
    });
  });

  for (const id of raceMotionState.keys()) {
    if (!liveIds.has(id)) raceMotionState.delete(id);
  }
}

function raceSpeedMultiplier(riderId) {
  const motion = activeMotion.get(riderId);
  if (motion === MOTION_ACTIONS.sprint.className) return 1.55;
  if (motion === MOTION_ACTIONS.bonk.className) return 0.52;
  if (motion === MOTION_ACTIONS.wheelie.className) return 1.12;
  if (motion === MOTION_ACTIONS.celebrate.className) return 0.92;
  return 1;
}

function applyRacePositions() {
  raceMotionState.forEach((state, riderId) => {
    const node = document.querySelector('[data-rider-id="' + riderId + '"]');
    if (!node) return;
    node.style.left = (state.progress * 100) + "%";
  });
}

function startRaceLoop() {
  if (raceFrameId !== null) cancelAnimationFrame(raceFrameId);
  raceLastFrameAt = null;

  const frame = (now) => {
    if (raceLastFrameAt === null) raceLastFrameAt = now;
    const dt = Math.min(64, Math.max(0, now - raceLastFrameAt)) / 1000;
    raceLastFrameAt = now;

    raceMotionState.forEach((state, riderId) => {
      state.progress += state.speed * raceSpeedMultiplier(riderId) * dt;
      if (state.progress > 1.12) {
        state.progress = -0.12 + (state.progress - 1.12);
      }
    });

    applyRacePositions();
    raceFrameId = requestAnimationFrame(frame);
  };

  raceFrameId = requestAnimationFrame(frame);
}

function riderMarkup(rider) {
  const classes = stateFor(rider).join(" ");
  const phase = -((stableHash(rider.user_id) % 90) / 100).toFixed(2);
  const cadence = rider.mood === "chill" ? 1.14 : rider.mood === "burning" ? 0.48 : 0.72;
  const burst = rider.mood === "burning" ? "冲啊!!" : "蹬!";
  return (
    '<div class="rider ' + classes + '" data-rider-id="' + rider.user_id + '"' +
      ' style="--x:' + rider.x + '%;--accent:' + (rider.accent || "#4c8ad9") +
      ';--phase:' + phase + 's;--cadence:' + cadence + 's">' +
      '<div class="effect-speed"></div>' +
      '<div class="effect-fire"></div>' +
      '<div class="effect-dust"></div>' +
      '<div class="effect-sweat"></div>' +
      '<div class="effect-music">♪</div>' +
      '<div class="effect-burst">' + burst + '</div>' +
      (rider.is_leader ? '<div class="leader-crown" aria-label="第一名">👑</div>' : '') +
      '<div class="rider-motion">' +
        '<div class="rider-inner">' +
          '<div class="avatar-ring">' +
            (rider.avatar_url
              ? '<img src="' + escapeHtml(rider.avatar_url) + '" alt="">'
              : '<span class="emoji-avatar">' + escapeHtml(rider.avatar_emoji || "🚴") + '</span>') +
          '</div>' +
          '<div class="body"></div>' +
          '<div class="arm"></div>' +
          '<div class="leg leg-a"></div>' +
          '<div class="leg leg-b"></div>' +
          '<div class="bike">' +
            '<div class="wheel back"></div>' +
            '<div class="wheel front"></div>' +
            '<div class="frame"></div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="name-chip">' +
        '<span>' + escapeHtml(rider.display_name || "同事") + '</span>' +
        '<span class="tokens">' + formatTokens(rider.today_tokens) + '</span>' +
      '</div>' +
    '</div>'
  );
}

function renderRiders(riders) {
  for (let lane = 1; lane <= 4; lane += 1) {
    document.querySelectorAll("#lane" + lane + " .rider").forEach((node) => node.remove());
  }

  const realLeader = [...riders]
    .filter((rider) => !rider.demo)
    .sort((a, b) => Number(b.today_tokens || 0) - Number(a.today_tokens || 0))[0];
  const leaderId = realLeader?.user_id || null;

  visibleRiders = positionPlan(lanePlan(riders)).map((rider) => ({
    ...rider,
    is_leader: rider.user_id === leaderId,
  }));
  syncRaceMotionState(visibleRiders);
  visibleRiders.forEach((rider) => {
    const lane = $("lane" + rider.lane);
    lane.insertAdjacentHTML("beforeend", riderMarkup(rider));
  });
  applyRacePositions();

  const total = visibleRiders
    .filter((rider) => !rider.demo)
    .reduce((sum, rider) => sum + Number(rider.today_tokens || 0), 0);
  todayTotalEl.textContent = formatTokens(total);

  requestAnimationFrame(() => {
    document.querySelectorAll(".rider").forEach((node, index) => {
      const riderId = node.dataset.riderId || String(index);
      const sizeJitter = (stableHash(riderId + ":size") % 5) * 0.035;
      node.style.setProperty("--scale", String(1.16 + sizeJitter));
      const rider = visibleRiders.find((item) => item.user_id === riderId);
      if (rider && !rider.demo) {
        node.classList.add("is-clickable");
        node.addEventListener("click", () => { void openRiderDetail(rider); });
      }
    });
  });
}

async function loadRaceData() {
  if (previewMode) {
    renderRiders([...PREVIEW_RIDERS, ...DEMO_RIDERS]);
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

  renderRiders([...real, ...DEMO_RIDERS]);
}

const MOTION_ACTIONS = {
  sprint: {
    className: "is-sprinting",
    duration: 2200,
    bursts: ["冲啊!!", "腿冒烟了!", "加班腿!"]
  },
  wheelie: {
    className: "is-wheelie",
    duration: 1900,
    bursts: ["芜湖!", "起飞!", "别翻!"]
  },
  bonk: {
    className: "is-bonking",
    duration: 2300,
    bursts: ["腿呢…", "没电了", "CPU 过热"]
  },
  celebrate: {
    className: "is-celebrating",
    duration: 2000,
    bursts: ["领先!", "今天猛!", "嘿嘿!"]
  }
};

function chooseMotion(rider) {
  const roll = Math.random();
  if (rider.mood === "burning") {
    if (roll < 0.68) return MOTION_ACTIONS.sprint;
    if (roll < 0.84) return MOTION_ACTIONS.wheelie;
    return MOTION_ACTIONS.celebrate;
  }
  if (rider.mood === "tired") {
    if (roll < 0.62) return MOTION_ACTIONS.bonk;
    if (roll < 0.78) return MOTION_ACTIONS.sprint;
    return MOTION_ACTIONS.wheelie;
  }
  if (rider.mood === "chill") {
    if (roll < 0.42) return MOTION_ACTIONS.wheelie;
    if (roll < 0.7) return MOTION_ACTIONS.celebrate;
    return MOTION_ACTIONS.sprint;
  }
  if (roll < 0.48) return MOTION_ACTIONS.sprint;
  if (roll < 0.67) return MOTION_ACTIONS.wheelie;
  if (roll < 0.84) return MOTION_ACTIONS.bonk;
  return MOTION_ACTIONS.celebrate;
}

function triggerMotion(rider, node, action) {
  if (!node || activeMotion.has(rider.user_id)) return;
  const burst = node.querySelector(".effect-burst");
  const text = action.bursts[Math.floor(Math.random() * action.bursts.length)];
  if (burst) burst.textContent = text;

  activeMotion.set(rider.user_id, action.className);
  node.classList.add(action.className);
  if (action === MOTION_ACTIONS.sprint && Math.random() > 0.38) {
    node.classList.add("effect-heavy");
  }

  window.setTimeout(() => {
    node.classList.remove(action.className);
    if (rider.mood !== "burning") node.classList.remove("effect-heavy");
    activeMotion.delete(rider.user_id);
  }, action.duration);
}

function scheduleDirector() {
  clearTimeout(directorTimer);
  const delay = 3000 + Math.random() * 3600;
  directorTimer = setTimeout(() => {
    if (!visibleRiders.length) {
      scheduleDirector();
      return;
    }

    const ranked = [...visibleRiders].sort((a, b) => b.today_tokens - a.today_tokens);
    const pool = ranked.slice(0, Math.min(4, ranked.length));
    if (ranked.length > 4 && Math.random() > 0.55) {
      pool.push(ranked[4 + Math.floor(Math.random() * (ranked.length - 4))]);
    }
    const available = pool.filter((rider) => !activeMotion.has(rider.user_id));
    const chosen = available[Math.floor(Math.random() * available.length)];
    const node = chosen && document.querySelector('[data-rider-id="' + chosen.user_id + '"]');

    if (node) triggerMotion(chosen, node, chooseMotion(chosen));
    scheduleDirector();
  }, delay);
}

async function enterRace() {
  loginOverlay.classList.add("hidden");
  await loadRaceData();
  if (me?.has_today_sample === false) {
    showToast("今天还没有上传快照；已绑定设备可说「上传蹬了吗」", 5200);
  }
  scheduleDirector();
  startRaceLoop();
  clearInterval(refreshTimer);
  refreshTimer = setInterval(() => loadRaceData().catch(() => {}), 20000);

  if ((new URLSearchParams(location.search).get("bind") === "1" || new URLSearchParams(location.search).get("action") === "bind")) {
    pairingResult.classList.add("hidden");
    if (!pairDialog.open) pairDialog.showModal();
  }
}

async function bootstrap() {
  previewMode = new URLSearchParams(location.search).get("preview") === "1";

  if (previewMode) {
    me = { user_id: "preview_me", display_name: "我", avatar_emoji: "🚴" };
    loginOverlay.classList.add("hidden");
    await loadRaceData();
    scheduleDirector();
    startRaceLoop();
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
        pairingCodeEl.textContent = "绑定成功 ✓";
        bindCommandEl.textContent = "正在自动上传 latest snapshot…";
        clearBindIntentFromUrl();

        const uploaded = await waitForTodaySample();
        if (pairDialog.open) pairDialog.close();

        try { await loadRaceData(); } catch {}

        if (uploaded) {
          showToast("设备绑定成功，latest snapshot 已自动上传并刷新赛道", 4800);
        } else {
          showToast("设备已绑定，但自动上传还没完成。可点「手动上传」复制 Prompt", 6500);
        }
        return;
      }

      if (result.status === "expired") {
        stopPairingPoll();
        pairingCodeEl.textContent = "已过期";
        bindCommandEl.textContent = "请重新生成 pairing code";
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
    "今日合计 " + formatTokens(payload.total_tokens || 0) + " · " + devices.length + " 台设备";
  devicesList.replaceChildren();

  if (!devices.length) {
    const empty = document.createElement("div");
    empty.className = "device-row";
    empty.textContent = "还没有绑定设备";
    devicesList.appendChild(empty);
    return;
  }

  devices.forEach((device) => {
    const row = document.createElement("div");
    row.className = "device-row";

    const left = document.createElement("div");
    const name = document.createElement("div");
    name.className = "device-name";
    name.textContent = device.name || "Codex 设备";
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
      if (!window.confirm("解除绑定「" + label + "」？\n解除后这台设备需要重新 pairing 才能继续上传。")) {
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
  pairingResult.classList.add("hidden");
  pairDialog.showModal();
});

pairDialog.addEventListener("close", stopPairingPoll);

createPairingButton.addEventListener("click", async () => {
  createPairingButton.disabled = true;
  try {
    if (previewMode) {
      pairingResult.classList.remove("hidden");
      pairingCodeEl.textContent = "DEMO1600";
      bindCommandEl.textContent =
        "在当前 Codex 中说：绑定蹬了吗 DEMO1600";
      showToast("预览模式：这是演示 pairing code");
      return;
    }

    const result = await jsonFetch("/api/pairing-codes", {
      method: "POST",
      body: JSON.stringify({})
    });
    pairingResult.classList.remove("hidden");
    pairingCodeEl.textContent = result.code;
    bindCommandEl.textContent =
      "在当前 Codex 中说：绑定蹬了吗 " + result.code;
    startPairingPoll(result.code);
  } catch (error) {
    showToast("生成失败：" + error.message);
  } finally {
    createPairingButton.disabled = false;
  }
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

window.addEventListener("beforeunload", () => {
  clearTimeout(directorTimer);
  clearInterval(refreshTimer);
  clearInterval(ambientTimer);
  stopPairingPoll();
});
