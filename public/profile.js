const $ = (id) => document.getElementById(id);

const profileAvatar = $("profileAvatar");
const profileName = $("profileName");
const profileMeta = $("profileMeta");
const profileToday = $("profileToday");
const profileModels = $("profileModels");
const profileProjects = $("profileProjects");
const profileTrend = $("profileTrend");
const profileDevices = $("profileDevices");
const profileDevicesSummary = $("profileDevicesSummary");
const profilePairButton = $("profilePairButton");
const profilePairDialog = $("profilePairDialog");
const profileCreatePairingButton = $("profileCreatePairingButton");
const profilePairingResult = $("profilePairingResult");
const profilePairingCode = $("profilePairingCode");
const profileBindCommand = $("profileBindCommand");
const profileUploadButton = $("profileUploadButton");
const profileUploadDialog = $("profileUploadDialog");
const profileCopyUploadButton = $("profileCopyUploadButton");
const profileToast = $("profileToast");

function showToast(message, ms = 2200) {
  profileToast.textContent = message;
  profileToast.classList.remove("hidden");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => profileToast.classList.add("hidden"), ms);
}

async function jsonFetch(url, options = {}) {
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

function formatTokens(value) {
  const n = Number(value || 0);
  if (n >= 10000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000000) return (n / 1000000).toFixed(2) + "M";
  if (n >= 100000) return Math.round(n / 1000) + "K";
  return n.toLocaleString("en-US");
}

function renderBreakdown(container, rows) {
  container.replaceChildren();
  const values = Array.isArray(rows) ? rows.slice(0, 8) : [];
  if (!values.length) {
    const empty = document.createElement("div");
    empty.className = "breakdown-empty";
    empty.textContent = "今天还没有明细";
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

function renderTrend(rows) {
  profileTrend.replaceChildren();
  const values = Array.isArray(rows) ? rows : [];
  const max = Math.max(...values.map((row) => Number(row.total_tokens || 0)), 1);
  values.forEach((row) => {
    const item = document.createElement("div");
    item.className = "profile-trend-item";
    const value = document.createElement("div");
    value.className = "profile-trend-value";
    value.style.height = Math.max(8, Number(row.total_tokens || 0) / max * 105) + "px";
    value.title = row.date + " · " + formatTokens(row.total_tokens || 0);
    const label = document.createElement("span");
    label.textContent = String(row.date || "").slice(5).replace("-", "/");
    item.append(value, label);
    profileTrend.appendChild(item);
  });
}

function renderDevices(devices) {
  profileDevices.replaceChildren();
  const values = Array.isArray(devices) ? devices : [];
  profileDevicesSummary.textContent = values.length + " 台设备";
  if (!values.length) {
    profileDevices.textContent = "还没有绑定设备";
    return;
  }
  values.forEach((device) => {
    const card = document.createElement("div");
    card.className = "profile-device-card";
    const name = document.createElement("strong");
    name.textContent = device.name || "Codex 设备";
    const tokens = document.createElement("span");
    tokens.textContent = formatTokens(device.today_tokens || 0);
    const meta = document.createElement("small");
    meta.textContent = device.last_seen_at
      ? "最近上传 " + new Date(device.last_seen_at).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })
      : "今天还没上传";
    card.append(name, tokens, meta);
    profileDevices.appendChild(card);
  });
}

async function loadProfile() {
  let me;
  try {
    me = await jsonFetch("/api/me");
  } catch (error) {
    if (error.status === 401) {
      location.href = "/";
      return;
    }
    throw error;
  }

  const user = me.user;
  profileAvatar.textContent = user.avatar_emoji || "🚴";
  profileName.textContent = user.display_name || "骑手";
  profileMeta.textContent = "赛道 ID " + user.user_id.slice(0, 8) + "… · 这个网页身份就是你的骑手身份";

  const detail = await jsonFetch("/api/riders/" + encodeURIComponent(user.user_id));
  profileToday.textContent = formatTokens(detail.today_tokens || 0);
  renderBreakdown(profileModels, detail.models);
  renderBreakdown(profileProjects, detail.projects);
  renderTrend(detail.trend);
  renderDevices(detail.installations);
}

profilePairButton.addEventListener("click", () => {
  location.href = "/?bind=1";
});

profileCreatePairingButton.addEventListener("click", async () => {
  profileCreatePairingButton.disabled = true;
  profileCreatePairingButton.textContent = "生成中…";
  try {
    const result = await jsonFetch("/api/pairing-codes", { method: "POST", body: "{}" });
    profilePairingCode.textContent = result.code;
    profileBindCommand.textContent = "绑定蹬了吗 " + result.code;
    profilePairingResult.classList.remove("hidden");
  } catch (error) {
    showToast("生成失败：" + error.message, 4200);
  } finally {
    profileCreatePairingButton.disabled = false;
    profileCreatePairingButton.textContent = "生成 pairing code";
  }
});

profileUploadButton.addEventListener("click", () => profileUploadDialog.showModal());
profileCopyUploadButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText("上传蹬了吗");
    profileCopyUploadButton.textContent = "已复制 ✓";
    setTimeout(() => { profileCopyUploadButton.textContent = "复制 Prompt"; }, 1600);
  } catch {
    showToast("复制失败，请手动复制「上传蹬了吗」");
  }
});

loadProfile().catch((error) => {
  profileName.textContent = "主页加载失败";
  profileMeta.textContent = error.message;
});
