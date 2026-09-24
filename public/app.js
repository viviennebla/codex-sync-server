const $ = (id) => document.getElementById(id);

const loginOverlay = $("loginOverlay");
const statusEl = $("status");
const retryButton = $("retryButton");
const pairButton = $("pairButton");
const pairDialog = $("pairDialog");
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
  const sorted = [...riders].sort((a, b) => b.today_tokens - a.today_tokens);
  const special = new Map();
  if (sorted[0]) special.set(sorted[0].user_id, 1);
  if (sorted[1]) special.set(sorted[1].user_id, 2);
  if (sorted[2]) special.set(sorted[2].user_id, 2);

  return riders.map((rider, index) => ({
    ...rider,
    lane: special.get(rider.user_id) || ((stableHash(rider.user_id) + index) % 4) + 1
  }));
}

function positionPlan(riders) {
  const sorted = [...riders].sort((a, b) => b.today_tokens - a.today_tokens);
  const count = Math.max(sorted.length - 1, 1);
  const xById = new Map();

  sorted.forEach((rider, index) => {
    const rankRatio = 1 - index / count;
    const jitter = ((stableHash(rider.user_id) % 9) - 4) * 0.7;
    const x = 24 + rankRatio * 55 + jitter;
    xById.set(rider.user_id, Math.max(18, Math.min(83, x)));
  });

  return riders.map((rider) => ({ ...rider, x: xById.get(rider.user_id) || 45 }));
}

function riderMarkup(rider) {
  const classes = stateFor(rider).join(" ");
  const burst = rider.mood === "burning" ? "冲啊!!" : "蹬!";
  return (
    '<div class="rider ' + classes + '" data-rider-id="' + rider.user_id + '"' +
      ' style="--x:' + rider.x + '%;--accent:' + (rider.accent || "#4c8ad9") + '">' +
      '<div class="effect-speed"></div>' +
      '<div class="effect-fire"></div>' +
      '<div class="effect-dust"></div>' +
      '<div class="effect-sweat"></div>' +
      '<div class="effect-music">♪</div>' +
      '<div class="effect-burst">' + burst + '</div>' +
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

  visibleRiders = positionPlan(lanePlan(riders));
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
      node.style.setProperty("--scale", String(0.94 + (index % 3) * 0.035));
    });
  });
}

async function loadRaceData() {
  const payload = await jsonFetch("/api/riders");
  const real = (payload.riders || []).map((rider, index) => ({
    ...rider,
    display_name: rider.user_id === (me && me.user_id) ? "我" : ("同事 " + (index + 1)),
    accent: rider.user_id === (me && me.user_id) ? "#4c8ad9" : "#5eaa7d"
  }));

  renderRiders([...real, ...DEMO_RIDERS]);
}

function scheduleDirector() {
  clearTimeout(directorTimer);
  const delay = 4500 + Math.random() * 4500;
  directorTimer = setTimeout(() => {
    const candidates = [...visibleRiders]
      .sort((a, b) => b.today_tokens - a.today_tokens)
      .slice(0, Math.min(2, visibleRiders.length));
    const chosen = candidates[Math.floor(Math.random() * candidates.length)];
    const node = chosen && document.querySelector('[data-rider-id="' + chosen.user_id + '"]');

    if (node) {
      node.classList.add("is-sprinting");
      if (Math.random() > 0.45) node.classList.add("effect-heavy");
      const baseX = Number(chosen.x || 50);
      node.style.left = Math.min(86, baseX + 2.2 + Math.random() * 2.8) + "%";
      const sprintMs = 1500 + Math.random() * 1100;
      setTimeout(() => {
        node.classList.remove("is-sprinting");
        if (chosen.mood !== "burning") node.classList.remove("effect-heavy");
        node.style.left = baseX + "%";
      }, sprintMs);
    }

    scheduleDirector();
  }, delay);
}

function scheduleAmbientDrift() {
  clearInterval(ambientTimer);
  ambientTimer = setInterval(() => {
    visibleRiders.forEach((rider) => {
      const node = document.querySelector('[data-rider-id="' + rider.user_id + '"]');
      if (!node || node.classList.contains("is-sprinting")) return;
      const tiny = (Math.random() - 0.5) * 1.5;
      node.style.left = Math.max(17, Math.min(84, rider.x + tiny)) + "%";
    });
  }, 7000);
}
async function bootstrap() {
  config = await jsonFetch("/api/feishu/config");
  const preview = new URLSearchParams(location.search).get("preview") === "1";

  if (!preview) {
    try {
      const result = await jsonFetch("/api/me");
      me = result.user;
    } catch (error) {
      if (error.status !== 401) throw error;
      await loginWithFeishu();
    }
  }

  loginOverlay.classList.add("hidden");
  await loadRaceData();
  scheduleDirector();
  scheduleAmbientDrift();
  refreshTimer = setInterval(() => loadRaceData().catch(() => {}), 20000);
}

pairButton.addEventListener("click", () => {
  pairingResult.classList.add("hidden");
  pairDialog.showModal();
});

createPairingButton.addEventListener("click", async () => {
  createPairingButton.disabled = true;
  try {
    const result = await jsonFetch("/api/pairing-codes", {
      method: "POST",
      body: JSON.stringify({})
    });
    pairingResult.classList.remove("hidden");
    pairingCodeEl.textContent = result.code;
    bindCommandEl.textContent =
      "node src/cli.js denglema bind --server " + config.base_url + " --code " + result.code;
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
});
