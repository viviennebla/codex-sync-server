const $ = (id) => document.getElementById(id);

const profileAvatar = $("profileAvatar");
const profileAvatarButton = $("profileAvatarButton");
const profileAvatarInput = $("profileAvatarInput");
const profileAvatarReset = $("profileAvatarReset");
const profileAchievementCount = $("profileAchievementCount");
const profileAchievementList = $("profileAchievementList");
const profileName = $("profileName");
const profileMeta = $("profileMeta");
const profileToday = $("profileToday");
const profileModels = $("profileModels");
const profileProjects = $("profileProjects");
const profileTrend = $("profileTrend");
const profileDevices = $("profileDevices");
const profileDevicesSummary = $("profileDevicesSummary");
const profilePairButton = $("profilePairButton");
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

let currentProfileUser = null;

function renderProfileAvatar(user) {
  currentProfileUser = user || currentProfileUser;
  const value = currentProfileUser || {};
  profileAvatar.replaceChildren();
  if (value.avatar_url) {
    const image = document.createElement("img");
    image.src = value.avatar_url;
    image.alt = "";
    profileAvatar.appendChild(image);
    profileAvatarReset.classList.remove("hidden");
  } else {
    profileAvatar.textContent = value.avatar_emoji || "🚴";
    profileAvatarReset.classList.add("hidden");
  }
}

function squareJpegDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file || !String(file.type || "").startsWith("image/")) {
      reject(new Error("请选择图片文件"));
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      reject(new Error("原图太大，请选择 12 MB 以内的图片"));
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      try {
        const width = image.naturalWidth || image.width;
        const height = image.naturalHeight || image.height;
        const size = Math.min(width, height);
        if (!size) throw new Error("无法读取图片");

        const canvas = document.createElement("canvas");
        canvas.width = 256;
        canvas.height = 256;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("浏览器不支持图片处理");
        context.fillStyle = "#fffaf0";
        context.fillRect(0, 0, 256, 256);
        context.drawImage(
          image,
          (width - size) / 2,
          (height - size) / 2,
          size,
          size,
          0,
          0,
          256,
          256
        );
        resolve(canvas.toDataURL("image/jpeg", 0.84));
      } catch (error) {
        reject(error);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("无法读取图片"));
    };
    image.src = objectUrl;
  });
}

async function uploadProfileAvatar(file) {
  profileAvatarButton.disabled = true;
  profileAvatarButton.classList.add("is-uploading");
  try {
    showToast("正在处理头像…", 5000);
    const imageDataUrl = await squareJpegDataUrl(file);
    const result = await jsonFetch("/api/me/avatar", {
      method: "PUT",
      body: JSON.stringify({ image_data_url: imageDataUrl })
    });
    renderProfileAvatar(result.user);
    showToast("头像已更新，赛道也会同步换图", 3200);
  } finally {
    profileAvatarButton.disabled = false;
    profileAvatarButton.classList.remove("is-uploading");
    profileAvatarInput.value = "";
  }
}

async function resetProfileAvatar() {
  profileAvatarReset.disabled = true;
  try {
    const result = await jsonFetch("/api/me/avatar", { method: "DELETE" });
    renderProfileAvatar(result.user);
    showToast("已恢复 Emoji 头像", 2600);
  } finally {
    profileAvatarReset.disabled = false;
  }
}

function formatTokens(value) {
  const n = Number(value || 0);
  if (n >= 10000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000000) return (n / 1000000).toFixed(2) + "M";
  if (n >= 100000) return Math.round(n / 1000) + "K";
  return n.toLocaleString("en-US");
}

function formatAchievementTime(value) {
  if (!value) return "";
  const ms = Date.now() - Date.parse(value);
  if (!Number.isFinite(ms) || ms < 0) return "刚刚";
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return minutes + " 分钟前";
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + " 小时前";
  return Math.floor(hours / 24) + " 天前";
}

function renderProfileAchievements(rows) {
  const values = Array.isArray(rows) ? rows : [];
  const unlocked = values.filter((item) => item.unlocked).length;
  profileAchievementCount.textContent = unlocked + "/" + values.length;
  profileAchievementList.replaceChildren();

  values.forEach((achievement) => {
    const item = document.createElement("div");
    item.className = "profile-achievement-card " + (achievement.unlocked ? "is-unlocked" : "is-locked");

    const emoji = document.createElement("div");
    emoji.className = "profile-achievement-emoji";
    emoji.textContent = achievement.emoji || "🏅";

    const copy = document.createElement("div");
    copy.className = "profile-achievement-copy";
    const name = document.createElement("strong");
    name.textContent = achievement.name || "成就";
    const description = document.createElement("span");
    description.textContent = achievement.description || "";
    const status = document.createElement("small");
    if (achievement.unlocked) {
      const age = formatAchievementTime(achievement.unlocked_at);
      status.textContent = age === "刚刚" ? "刚刚解锁" : (age ? age + "解锁" : "已解锁");
    } else {
      status.textContent = "未解锁";
    }

    copy.append(name, description, status);
    item.append(emoji, copy);
    profileAchievementList.appendChild(item);
  });
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
  profileDevicesSummary.textContent = values.length + " 个 Agent 环境";
  if (!values.length) {
    profileDevices.textContent = "还没有接入 Agent";
    return;
  }
  values.forEach((device) => {
    const card = document.createElement("div");
    card.className = "profile-device-card";
    const name = document.createElement("strong");
    name.textContent = device.name || "Agent 环境";
    const tokens = document.createElement("span");
    tokens.textContent = formatTokens(device.today_tokens || 0);
    const meta = document.createElement("small");
    const harness = device.harness ? String(device.harness) + " · " : "";
    meta.textContent = harness + (device.last_seen_at
      ? "最近上传 " + new Date(device.last_seen_at).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })
      : "今天还没上传");
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
  renderProfileAvatar(user);
  profileName.textContent = user.display_name || "骑手";

  const [detail, achievementPayload] = await Promise.all([
    jsonFetch("/api/riders/" + encodeURIComponent(user.user_id)),
    jsonFetch("/api/achievements"),
  ]);
  renderProfileAchievements(achievementPayload.achievements || []);
  const latestSeen = (detail.installations || [])
    .map((item) => item.last_seen_at)
    .filter(Boolean)
    .sort()
    .at(-1) || null;
  const latestLabel = latestSeen
    ? new Date(latestSeen).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : "还没上传";
  profileMeta.textContent =
    (detail.installations || []).length + " 个 Agent 环境 · 最近上传 " + latestLabel;
  profileToday.textContent = formatTokens(detail.today_tokens || 0);
  renderBreakdown(profileModels, detail.models);
  renderBreakdown(profileProjects, detail.projects);
  renderTrend(detail.trend);
  renderDevices(detail.installations);
}

profileAvatarButton.addEventListener("click", () => {
  if (!profileAvatarButton.disabled) profileAvatarInput.click();
});

profileAvatarInput.addEventListener("change", () => {
  const file = profileAvatarInput.files?.[0];
  if (!file) return;
  uploadProfileAvatar(file).catch((error) => {
    showToast("头像更新失败：" + error.message, 4200);
  });
});

profileAvatarReset.addEventListener("click", () => {
  resetProfileAvatar().catch((error) => {
    showToast("恢复头像失败：" + error.message, 4200);
  });
});

profilePairButton.addEventListener("click", () => {
  location.href = "/?bind=1";
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
