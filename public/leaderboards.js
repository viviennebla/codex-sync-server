const modelBoard = document.getElementById("modelBoard");
const projectBoard = document.getElementById("projectBoard");
const legacyModelBoard = document.getElementById("legacyModelBoard");
const legacyProjectBoard = document.getElementById("legacyProjectBoard");
const observationsEl = document.getElementById("routeObservations");
const coverageEl = document.getElementById("burnCoverage");
const footnoteEl = document.getElementById("burnFootnote");

function formatTokens(value) {
  const n = Number(value || 0);
  if (n >= 10000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000000) return (n / 1000000).toFixed(2) + "M";
  if (n >= 100000) return Math.round(n / 1000) + "K";
  return n.toLocaleString("en-US");
}

async function jsonFetch(url) {
  const response = await fetch(url, { credentials: "same-origin" });
  const text = await response.text();
  if (!response.ok) throw new Error(text || ("HTTP " + response.status));
  return text ? JSON.parse(text) : null;
}

function stableHash(text) {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

function stableShuffle(rows, seed) {
  return [...(Array.isArray(rows) ? rows : [])].sort((a, b) => (
    stableHash(seed + ":" + String(a.name || ""))
    - stableHash(seed + ":" + String(b.name || ""))
    || String(a.name || "").localeCompare(String(b.name || ""))
  ));
}

function shuffledContributors(rows, seed) {
  return [...(Array.isArray(rows) ? rows : [])].sort((a, b) => (
    stableHash(seed + ":" + String(a.user_id || a.display_name || ""))
    - stableHash(seed + ":" + String(b.user_id || b.display_name || ""))
  ));
}

function routeMood(row, kind) {
  const riders = Array.isArray(row.contributors) ? row.contributors.length : 0;
  if (riders >= 4) return kind === "model" ? "👥 今天挺热闹" : "🚌 集体路过";
  if (riders >= 2) return kind === "model" ? "🚲 多人出没" : "🧭 有人结伴";
  return kind === "model" ? "🌱 偶遇一只" : "🌿 独行路线";
}

function contributorText(row, seed) {
  const values = shuffledContributors(row.contributors, seed).slice(0, 4);
  if (!values.length) return "还没有骑手明细";
  const names = values
    .map((entry) => (entry.avatar_emoji || "🚴") + " " + (entry.display_name || "骑手"));
  const extra = Math.max(0, (row.contributors?.length || 0) - values.length);
  return names.join(" · ") + (extra ? " · +" + extra + " 人" : "");
}

function renderRouteBoard(container, rows, kind, date) {
  container.replaceChildren();
  const values = stableShuffle(rows, date + ":" + kind).slice(0, 10);
  if (!values.length) {
    const empty = document.createElement("div");
    empty.className = "burn-empty";
    empty.textContent = kind === "model"
      ? "今天还没遇到模型明细"
      : "今天还没留下项目路线";
    container.appendChild(empty);
    return;
  }

  values.forEach((row) => {
    const item = document.createElement("article");
    item.className = "route-card";

    const head = document.createElement("div");
    head.className = "route-card-head";
    const name = document.createElement("strong");
    name.className = "route-name";
    name.textContent = row.name || "unknown";
    const mood = document.createElement("span");
    mood.className = "route-mood";
    mood.textContent = routeMood(row, kind);
    head.append(name, mood);

    const contributors = document.createElement("div");
    contributors.className = "route-contributors";
    contributors.textContent = contributorText(row, date + ":" + kind + ":" + row.name);

    const meta = document.createElement("div");
    meta.className = "route-meta";
    const people = document.createElement("span");
    people.textContent = (row.contributors?.length || 0) + " 位骑手路过";
    const fuel = document.createElement("span");
    fuel.className = "route-fuel";
    fuel.textContent = "今日燃料 " + formatTokens(row.total_tokens || 0);
    meta.append(people, fuel);

    item.append(head, contributors, meta);
    container.appendChild(item);
  });
}

function observation(icon, title, copy) {
  return { icon, title, copy };
}

function deriveObservations(payload) {
  const models = Array.isArray(payload.models) ? payload.models : [];
  const projects = Array.isArray(payload.projects) ? payload.projects : [];
  const rows = [];

  if (models.length >= 4) {
    rows.push(observation(
      "🤖",
      "模型动物园",
      "今天出现了 " + models.length + " 种模型。选择很多，确定性另说。"
    ));
  } else if (models.length > 0) {
    rows.push(observation(
      "🧠",
      "今天比较专一",
      "今天主要在 " + models.length + " 种模型之间活动，没有把模型列表当自助餐。"
    ));
  }

  if (projects.length >= 6) {
    rows.push(observation(
      "🌀",
      "到处乱蹬",
      "今天路过了 " + projects.length + " 个项目。工作区边界已经开始失去尊严。"
    ));
  } else if (projects.length > 0) {
    rows.push(observation(
      "🗺️",
      "路线可辨认",
      "今天留下了 " + projects.length + " 条项目路线，暂时还能画在一张地图上。"
    ));
  }

  const shared = [...projects]
    .sort((a, b) => (
      (b.contributors?.length || 0) - (a.contributors?.length || 0)
      || String(a.name || "").localeCompare(String(b.name || ""))
    ))[0];
  if ((shared?.contributors?.length || 0) >= 3) {
    rows.push(observation(
      "🚌",
      "集体出游",
      shared.contributors.length + " 位骑手都路过 " + shared.name + "。不是团建，至少页面上看起来很像。"
    ));
  } else {
    const solo = projects.find((row) => (row.contributors?.length || 0) === 1);
    if (solo) {
      rows.push(observation(
        "🌱",
        "冷门路线",
        solo.name + " 今天只有一个人留下脚印。项目很安静，Git 可能不是。"
      ));
    }
  }

  if (!rows.length) {
    rows.push(observation("🛋️", "办公室很安静", "今天还没留下多少路线，先别急着给空气排名。"));
  }
  return rows.slice(0, 3);
}

function renderObservations(payload) {
  observationsEl.replaceChildren();
  deriveObservations(payload).forEach((row) => {
    const item = document.createElement("article");
    item.className = "route-observation";
    const icon = document.createElement("span");
    icon.className = "route-observation-icon";
    icon.textContent = row.icon;
    const copy = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = row.title;
    const text = document.createElement("span");
    text.textContent = row.copy;
    copy.append(title, text);
    item.append(icon, copy);
    observationsEl.appendChild(item);
  });
}

function medal(index) {
  return ["🥇", "🥈", "🥉"][index] || String(index + 1);
}

function legacyContributorText(rows) {
  const values = Array.isArray(rows) ? rows.slice(0, 3) : [];
  if (!values.length) return "还没有骑手明细";
  return values
    .map((row) => (row.avatar_emoji || "🚴") + " " + row.display_name)
    .join(" · ");
}

function renderLegacyBoard(container, rows) {
  container.replaceChildren();
  const values = Array.isArray(rows) ? rows.slice(0, 8) : [];
  if (!values.length) {
    const empty = document.createElement("div");
    empty.className = "burn-empty";
    empty.textContent = "今天还没烧起来";
    container.appendChild(empty);
    return;
  }

  const max = Math.max(...values.map((row) => Number(row.total_tokens || 0)), 1);
  values.forEach((row, index) => {
    const item = document.createElement("article");
    item.className = "burn-row";

    const head = document.createElement("div");
    head.className = "burn-row-head";
    const rank = document.createElement("span");
    rank.className = "burn-rank";
    rank.textContent = medal(index);
    const name = document.createElement("strong");
    name.className = "burn-name";
    name.textContent = row.name || "unknown";
    const total = document.createElement("span");
    total.className = "burn-total";
    total.textContent = formatTokens(row.total_tokens);
    head.append(rank, name, total);

    const track = document.createElement("div");
    track.className = "burn-track";
    const fill = document.createElement("span");
    fill.className = "burn-fill";
    fill.style.width = Math.max(4, Number(row.total_tokens || 0) / max * 100) + "%";
    track.appendChild(fill);

    const contributors = document.createElement("div");
    contributors.className = "burn-contributors";
    contributors.textContent = legacyContributorText(row.contributors);
    item.append(head, track, contributors);
    container.appendChild(item);
  });
}

async function load() {
  const payload = await jsonFetch("/api/leaderboards/dimensions");
  renderObservations(payload);
  renderRouteBoard(modelBoard, payload.models, "model", payload.date || "today");
  renderRouteBoard(projectBoard, payload.projects, "project", payload.date || "today");
  renderLegacyBoard(legacyModelBoard, payload.models);
  renderLegacyBoard(legacyProjectBoard, payload.projects);

  const percent = Math.round(Number(payload.coverage_ratio || 0) * 100);
  coverageEl.textContent =
    (payload.v2_installations || 0) + "/" + (payload.installations || 0) +
    " 台设备留下了路线明细 · 覆盖 " + percent + "% 今日 token";

  const privacyNote = payload.projects_have_private_entries
    ? " 有部分 Project 已按用户隐私设置隐藏。"
    : "";
  footnoteEl.textContent = percent < 100
    ? "有些设备只上传总量，所以这里只画看得见的路线，不替缺失数据脑补剧情。" + privacyNote
    : "今天有数据的设备都进入了路线统计；token 只是燃料，不代表谁更勤快。" + privacyNote;
}

load().catch((error) => {
  coverageEl.textContent = "今日蹬况读取失败";
  footnoteEl.textContent = error.message;
  renderRouteBoard(modelBoard, [], "model", "error");
  renderRouteBoard(projectBoard, [], "project", "error");
  renderLegacyBoard(legacyModelBoard, []);
  renderLegacyBoard(legacyProjectBoard, []);
});
