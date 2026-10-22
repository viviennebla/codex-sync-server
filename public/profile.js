const $ = (id) => document.getElementById(id);

const profileAvatar = $("profileAvatar");
const profileAvatarButton = $("profileAvatarButton");
const profileAvatarInput = $("profileAvatarInput");
const profileAchievementsPanel = $("profileAchievementsPanel");
const profileAchievementList = $("profileAchievementList");
const profileTransportList = $("profileTransportList");
const profileAvatarDialog = $("profileAvatarDialog");
const profileEmojiInput = $("profileEmojiInput");
const profileUseEmojiButton = $("profileUseEmojiButton");
const profileChooseImageButton = $("profileChooseImageButton");
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

const TRANSPORT_OPTIONS = Object.freeze([
  { id: "bike", emoji: "🚲", name: "自行车", note: "经典蹬法" },
  { id: "scooter", emoji: "🛴", name: "滑板车", note: "单脚通勤" },
  { id: "skateboard", emoji: "🛹", name: "滑板", note: "滑一会再写" },
  { id: "walk", emoji: "🚶", name: "古法通勤", note: "纯靠双腿" },
  { id: "surf", emoji: "🏄", name: "冲浪", note: "办公室有浪" },
  { id: "skate", emoji: "🛼", name: "轮滑", note: "左右横跳" },
]);

let currentProfileUser = null;
let riderCatalog = null;
const appearanceFields = {
  preset: $("riderPreset"),head_mode:$("riderHeadMode"),head_variant:$("riderHeadVariant"),
  head_emoji:$("riderHeadEmoji"),backpack:$("riderBackpack")
};
function renderRiderPresets(catalog) {
 riderCatalog=catalog;
 const select=appearanceFields.preset;
 if(!select)return;
 select.replaceChildren();
 for(const preset of Object.values(catalog.presets)){
  const option=document.createElement("option");
  option.value=preset.id;
  option.textContent=preset.label;
  select.append(option);
 }
 select.disabled=false;
}
function syncRiderHeadEditor() {
  const mode=appearanceFields.head_mode.value;
  const input=appearanceFields.head_emoji;
  input.disabled=mode!=="emoji";
  const avatar=String(currentProfileUser?.avatar_emoji||"").trim();
  const customAvatar=!currentProfileUser?.avatar_url&&avatar&&avatar!=="🚴";
  const hint=$("riderHeadHint");
  if (!hint) return;
  hint.textContent=mode==="auto"
    ? (customAvatar?"正在自动使用头像 "+avatar+"；更换头像后面罩也会更新。":"没有自定义 Emoji 头像，当前显示原装表情。")
    : mode==="art"?"已选择原装表情；更换头像不会修改面罩。"
    :"手动贴脸优先于头像 Emoji；以后更换头像也不会覆盖。";
}
appearanceFields.head_mode?.addEventListener("change",syncRiderHeadEditor);

function renderAppearance(value={}) {
  const a={preset:riderCatalog?.default_preset||"helmet-commuter",head_mode:"auto",head_variant:"auto",head_emoji:"🙂",backpack:true,...value};
  for(const [key,field] of Object.entries(appearanceFields)) {
    if(!field)continue;
    if(key==="backpack")field.checked=a.backpack!==false;
    else if(key==="preset")field.value=riderCatalog?.presets?.[a.preset]?a.preset:(riderCatalog?.default_preset||"helmet-commuter");
    else field.value=a[key];
  }
  syncRiderHeadEditor();
}
$("riderSaveAppearance")?.addEventListener("click",async()=>{
  const button=$("riderSaveAppearance");
  button.disabled=true;
  try {
    const payload=Object.fromEntries(Object.entries(appearanceFields).map(([key,field])=>[key,key==="backpack"?field.checked:field.value]));
    const result=await jsonFetch("/api/me/rider-appearance",{method:"PUT",body:JSON.stringify(payload)});
    currentProfileUser={...(currentProfileUser||{}),rider_appearance:result.rider_appearance};
    showToast("人物形象已保存，回赛道查看");
  }catch(error){showToast("保存失败："+error.message,3400);}finally{button.disabled=false;}
});


function renderTransportOptions(selected) {
  if (!profileTransportList) return;
  const active = String(selected || "bike");
  profileTransportList.replaceChildren();

  TRANSPORT_OPTIONS.forEach((option) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "profile-transport-card" + (option.id === active ? " is-selected" : "");
    button.dataset.transport = option.id;
    button.setAttribute("aria-pressed", option.id === active ? "true" : "false");

    const emoji = document.createElement("span");
    emoji.className = "profile-transport-emoji";
    emoji.textContent = option.emoji;

    const copy = document.createElement("span");
    copy.className = "profile-transport-copy";
    const name = document.createElement("strong");
    name.textContent = option.name;
    const note = document.createElement("small");
    note.textContent = option.note;
    copy.append(name, note);

    button.append(emoji, copy);
    button.addEventListener("click", () => {
      if (option.id !== (currentProfileUser?.transport || "bike")) {
        void selectTransport(option.id);
      }
    });
    profileTransportList.appendChild(button);
  });
}

async function selectTransport(transport) {
  const option = TRANSPORT_OPTIONS.find((item) => item.id === transport);
  if (!option) return;

  const buttons = [...profileTransportList.querySelectorAll("button")];
  buttons.forEach((button) => { button.disabled = true; });

  try {
    const result = await jsonFetch("/api/me/transport", {
      method: "PUT",
      body: JSON.stringify({ transport })
    });
    currentProfileUser = {
      ...(currentProfileUser || {}),
      transport: result.transport || transport,
    };
    renderTransportOptions(currentProfileUser.transport);
    showToast(option.emoji + " 已切换到" + option.name + "，回赛道就能看到", 2800);
  } catch (error) {
    showToast("出行方式更新失败：" + error.message, 3400);
    renderTransportOptions(currentProfileUser?.transport || "bike");
  }
}

function renderProfileAvatar(user) {
  currentProfileUser = {...(currentProfileUser || {}), ...(user || {})};
  const value = currentProfileUser;
  profileAvatar.replaceChildren();
  if (value.avatar_url) {
    const image = document.createElement("img");
    image.src = value.avatar_url;
    image.alt = "";
    profileAvatar.appendChild(image);
  } else {
    profileAvatar.textContent = value.avatar_emoji || "🚴";
  }
  syncRiderHeadEditor();
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
    if (profileAvatarDialog.open) profileAvatarDialog.close();
    showToast("头像已更新，赛道也会同步换图", 3200);
  } finally {
    profileAvatarButton.disabled = false;
    profileAvatarButton.classList.remove("is-uploading");
    profileAvatarInput.value = "";
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

const ACHIEVEMENT_CATEGORIES = {
  first_ride: "出发纪念", million_day: "趣味燃料", ten_million_day: "趣味燃料",
  model_explorer: "探索足迹", project_hopper: "探索足迹",
  multi_harness: "探索足迹", took_the_crown: "赛道回忆",
  precise_rider: "探索足迹", light_multitasker: "探索足迹",
  all_round_route: "探索足迹", three_day_streak: "持续记录",
  steady_cruise: "工作节奏", heartbeat_rider: "工作节奏",
  early_bird: "趣味时刻", night_ride: "趣味时刻",
  deep_night_rider: "趣味时刻", weekend_rider: "趣味时刻",
};

function renderProfileAchievements(rows, equippedId) {
  const values = Array.isArray(rows) ? rows : [];
  profileAchievementList.replaceChildren();
  if (!values.length) {
    profileAchievementsPanel.classList.add("hidden");
    return;
  }
  profileAchievementsPanel.classList.remove("hidden");

  const none = document.createElement("button");
  none.type = "button";
  none.className = "profile-achievement-card achievement-none " + (!equippedId ? "is-equipped" : "");
  none.setAttribute("aria-pressed", String(!equippedId));
  none.innerHTML = '<div class="profile-achievement-emoji">◌</div><div class="profile-achievement-copy"><strong>不佩戴</strong><span>保持神秘</span></div>';
  none.addEventListener("click", () => { void equipAchievement(null); });
  profileAchievementList.appendChild(none);

  values.forEach((achievement) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "profile-achievement-card is-unlocked " +
      (equippedId === achievement.id ? "is-equipped" : "");
    item.dataset.achievementId = achievement.id;
    item.setAttribute("aria-pressed", String(equippedId === achievement.id));

    const emoji = document.createElement("div");
    emoji.className = "profile-achievement-emoji";
    emoji.textContent = achievement.emoji || "🏅";

    const copy = document.createElement("div");
    copy.className = "profile-achievement-copy";
    const category = document.createElement("small");
    category.className = "achievement-category";
    category.textContent = ACHIEVEMENT_CATEGORIES[achievement.id] || "小小纪念";
    const name = document.createElement("strong");
    name.textContent = achievement.name || "成就";
    const description = document.createElement("span");
    description.textContent = achievement.description || "";
    const status = document.createElement("small");
    status.textContent = equippedId === achievement.id ? "✓ 已选为称号" : "选为我的称号";
    copy.append(category, name, description);
    if (achievement.unlocked_at) {
      const date = document.createElement("small");
      date.className = "achievement-date";
      date.textContent = "解锁于 " + formatAchievementTime(achievement.unlocked_at);
      copy.append(date);
    }
    copy.append(status);
    item.append(emoji, copy);
    item.addEventListener("click", () => { void equipAchievement(achievement.id); });
    profileAchievementList.appendChild(item);
  });
}

async function equipAchievement(achievementId) {
  try {
    const result = await jsonFetch("/api/me/achievement", {
      method: "PUT",
      body: JSON.stringify({ achievement_id: achievementId })
    });
    const payload = await jsonFetch("/api/achievements");
    renderProfileAchievements(payload.achievements || [], result.equipped_achievement?.id || null);
    showToast(result.equipped_achievement
      ? "已佩戴 " + result.equipped_achievement.emoji + " " + result.equipped_achievement.name
      : "已取消佩戴", 2400);
  } catch (error) {
    showToast("成就更新失败：" + error.message, 3200);
  }
}

async function useProfileEmoji() {
  const emoji = profileEmojiInput.value.trim();
  if (!emoji) {
    showToast("先输入一个 Emoji", 2200);
    return;
  }
  profileUseEmojiButton.disabled = true;
  try {
    const result = await jsonFetch("/api/me/avatar/emoji", {
      method: "PUT",
      body: JSON.stringify({ avatar_emoji: emoji })
    });
    renderProfileAvatar(result.user);
    profileAvatarDialog.close();
    showToast("Emoji 头像已更新", 2200);
  } catch (error) {
    showToast("Emoji 更新失败：" + error.message, 3200);
  } finally {
    profileUseEmojiButton.disabled = false;
  }
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
  renderTransportOptions(user.transport || "bike");
  try {
    const catalog=await jsonFetch("/api/rider-catalog");
    renderRiderPresets(catalog);
    renderAppearance(user.rider_appearance || {});
  } catch(error) {
    $("riderSaveAppearance").disabled=true;
    showToast("人物素材目录加载失败："+error.message,3500);
  }
  profileName.textContent = user.display_name || "骑手";

  const [detail, achievementPayload] = await Promise.all([
    jsonFetch("/api/riders/" + encodeURIComponent(user.user_id)),
    jsonFetch("/api/achievements"),
  ]);
  renderProfileAchievements(
    achievementPayload.achievements || [],
    achievementPayload.equipped_achievement_id || null
  );
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
  if (profileAvatarButton.disabled) return;
  profileEmojiInput.value = currentProfileUser?.avatar_emoji || "🚴";
  profileAvatarDialog.showModal();
});

profileChooseImageButton.addEventListener("click", () => {
  profileAvatarInput.click();
});

profileUseEmojiButton.addEventListener("click", () => {
  void useProfileEmoji();
});

profileAvatarInput.addEventListener("change", () => {
  const file = profileAvatarInput.files?.[0];
  if (!file) return;
  uploadProfileAvatar(file).catch((error) => {
    showToast("头像更新失败：" + error.message, 4200);
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
