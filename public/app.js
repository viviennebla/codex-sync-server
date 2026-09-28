const $ = (id) => document.getElementById(id);

const loginOverlay = $("loginOverlay");
const statusEl = $("status");
const retryButton = $("retryButton");
const pairButton = $("pairButton");
const pairDialog = $("pairDialog");
const devicesButton = $("devicesButton");
const devicesDialog = $("devicesDialog");
const devicesSummary = $("devicesSummary");
const devicesList = $("devicesList");
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

let config = null;
let me = null;
let visibleRiders = [];
let directorTimer = null;
let refreshTimer = null;
let ambientTimer = null;
let pairingPollTimer = null;
let previewMode = false;
const activeMotion = new Map();

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

function requestAuthCode(appId, redirectUri) {
  return new Promise((resolve, reject) => {
    if (!window.h5sdk || !window.tt) {
      reject(new Error("请从飞书客户端的工作台打开「蹬了吗」"));
      return;
    }

    const success = (result) => result && result.code
      ? resolve(result.code)
      : reject(new Error("飞书未返回免登 code"));
    const fail = (error) => reject(new Error((error && (error.errString || error.message)) || "飞书免登失败"));

    window.h5sdk.ready(() => {
      const fallback = () => {
        if (typeof window.tt.requestAuthCode !== "function") {
          fail(new Error("当前飞书客户端不支持免登接口"));
          return;
        }
        window.tt.requestAuthCode({ appId, success, fail });
      };

      if (typeof window.tt.requestAccess !== "function") {
        fallback();
        return;
      }

      window.tt.requestAccess({
        appID: appId,
        scopeList: [],
        redirect_uri: redirectUri,
        success,
        fail: fallback
      });
    });

    if (typeof window.h5sdk.error === "function") {
      window.h5sdk.error((error) => fail(error));
    }
  });
}

async function loginWithFeishu() {
  if (!config || !config.configured || !config.app_id) {
    throw new Error("服务端尚未配置飞书应用");
  }
  statusEl.textContent = "正在从飞书进入赛场…";
  const code = await requestAuthCode(config.app_id, config.base_url + "/");
  const result = await jsonFetch("/api/auth/feishu/login", {
    method: "POST",
    body: JSON.stringify({ code })
  });
  me = result.user;
  loginOverlay.classList.add("hidden");
}

function formatTokens(value) {
  const n = Number(value || 0);
  if (n >= 10000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000000) return (n / 1000000).toFixed(2) + "M";
  if (n >= 100000) return Math.round(n / 1000) + "K";
  return n.toLocaleString("en-US");
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
          '<div class="avatar-ring"><img src="' + (rider.avatar_url || DEMO_RIDERS[0].avatar_url) + '" alt=""></div>' +
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
        '<span>' + (rider.display_name || "同事") + '</span>' +
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
  visibleRiders.forEach((rider) => {
    const lane = $("lane" + rider.lane);
    lane.insertAdjacentHTML("beforeend", riderMarkup(rider));
  });

  const total = visibleRiders
    .filter((rider) => !rider.demo)
    .reduce((sum, rider) => sum + Number(rider.today_tokens || 0), 0);
  todayTotalEl.textContent = formatTokens(total);

  requestAnimationFrame(() => {
    document.querySelectorAll(".rider").forEach((node, index) => {
      const riderId = node.dataset.riderId || String(index);
      const sizeJitter = (stableHash(riderId + ":size") % 5) * 0.035;
      node.style.setProperty("--scale", String(1.16 + sizeJitter));
    });
  });
}

async function loadRaceData() {
  if (previewMode) {
    renderRiders([...PREVIEW_RIDERS, ...DEMO_RIDERS]);
    return;
  }
  const payload = await jsonFetch("/api/riders");
  const real = (payload.riders || []).map((rider, index) => ({
    ...rider,
    display_name: rider.user_id === (me && me.user_id) ? "我" : ("同事 " + (index + 1)),
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
async function bootstrap() {
  previewMode = new URLSearchParams(location.search).get("preview") === "1";

  if (previewMode) {
    config = {
      configured: false,
      app_id: null,
      base_url: "http://localhost:1600",
      timezone: "Asia/Shanghai"
    };
    me = { user_id: "preview_me" };
    loginOverlay.classList.add("hidden");
    await loadRaceData();
    scheduleDirector();
    scheduleAmbientDrift();
    return;
  }

  config = await jsonFetch("/api/feishu/config");
  try {
    const result = await jsonFetch("/api/me");
    me = result.user;
  } catch (error) {
    if (error.status !== 401) throw error;
    await loginWithFeishu();
  }

  loginOverlay.classList.add("hidden");
  await loadRaceData();
  if (me?.has_today_sample === false) {
    showToast("今天还没有上传快照；已绑定设备可回 Codex 说「上传蹬了吗」", 5200);
  }
  scheduleDirector();
  scheduleAmbientDrift();
  refreshTimer = setInterval(() => loadRaceData().catch(() => {}), 20000);

  if (new URLSearchParams(location.search).get("bind") === "1") {
    pairingResult.classList.add("hidden");
    if (!pairDialog.open) pairDialog.showModal();
  }
}

function stopPairingPoll() {
  if (pairingPollTimer !== null) clearInterval(pairingPollTimer);
  pairingPollTimer = null;
}

function clearBindIntentFromUrl() {
  const next = new URL(location.href);
  next.searchParams.delete("bind");
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

    const tokens = document.createElement("div");
    tokens.className = "device-tokens";
    tokens.textContent = formatTokens(device.today_tokens || 0);

    row.append(left, tokens);
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

retryButton.addEventListener("click", async () => {
  retryButton.disabled = true;
  statusEl.textContent = "重新进入赛场…";
  try {
    await loginWithFeishu();
    await loadRaceData();
    scheduleDirector();
    scheduleAmbientDrift();
  } catch (error) {
    statusEl.textContent = error.message;
    retryButton.classList.remove("hidden");
  } finally {
    retryButton.disabled = false;
  }
});

bootstrap().catch((error) => {
  statusEl.textContent = "进场失败：" + error.message;
  retryButton.classList.remove("hidden");
});

window.addEventListener("beforeunload", () => {
  clearTimeout(directorTimer);
  clearInterval(refreshTimer);
  clearInterval(ambientTimer);
  stopPairingPoll();
});
