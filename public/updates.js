const list = document.getElementById("updateList");
const filters = document.getElementById("updateFilters");
const count = document.getElementById("updateCount");
const toast = document.getElementById("updateToast");

let updates = [];
let activeCategory = "全部";

function showToast(message, ms = 2800) {
  toast.textContent = message;
  toast.classList.remove("hidden");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.add("hidden"), ms);
}

async function jsonFetch(url) {
  const response = await fetch(url, { credentials: "same-origin" });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch {}
  if (!response.ok) throw new Error(payload?.error || text || ("HTTP " + response.status));
  return payload;
}

function formatDate(value) {
  const date = new Date(String(value || "") + "T12:00:00+08:00");
  if (!Number.isFinite(date.getTime())) return value || "";
  return date.toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" });
}

function updateAnchor(id) {
  return "update-" + String(id || "").replace(/[^a-zA-Z0-9_-]/g, "-");
}

function renderFilters() {
  const categories = ["全部", ...new Set(updates.map((item) => item.category).filter(Boolean))];
  filters.replaceChildren();
  categories.forEach((category) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "update-filter-chip" + (category === activeCategory ? " is-active" : "");
    button.textContent = category;
    button.setAttribute("aria-pressed", category === activeCategory ? "true" : "false");
    button.addEventListener("click", () => {
      activeCategory = category;
      renderFilters();
      renderUpdates();
    });
    filters.appendChild(button);
  });
}

function renderUpdates() {
  const visible = activeCategory === "全部"
    ? updates
    : updates.filter((item) => item.category === activeCategory);

  count.textContent = visible.length + " 条";
  list.replaceChildren();

  if (!visible.length) {
    const empty = document.createElement("section");
    empty.className = "profile-panel update-log-empty";
    empty.textContent = "这个分类暂时还没留下车辙。";
    list.appendChild(empty);
    return;
  }

  let lastDate = null;
  visible.forEach((item) => {
    if (item.date !== lastDate) {
      const date = document.createElement("div");
      date.className = "update-log-date";
      date.textContent = formatDate(item.date);
      list.appendChild(date);
      lastDate = item.date;
    }

    const card = document.createElement("article");
    card.className = "profile-panel update-log-card";
    card.id = updateAnchor(item.id);

    const icon = document.createElement("div");
    icon.className = "update-log-icon";
    icon.textContent = item.emoji || "📝";

    const body = document.createElement("div");
    body.className = "update-log-body";

    const top = document.createElement("div");
    top.className = "update-log-card-head";

    const title = document.createElement("h2");
    title.textContent = item.title || "更新";

    const badges = document.createElement("div");
    badges.className = "update-log-badges";

    if (item.category) {
      const category = document.createElement("span");
      category.className = "update-log-category";
      category.textContent = item.category;
      badges.appendChild(category);
    }

    if (item.pr) {
      const pr = document.createElement("a");
      pr.className = "update-log-pr";
      pr.href = "https://github.com/viviennebla/codex-sync-server/pull/" + item.pr;
      pr.target = "_blank";
      pr.rel = "noopener noreferrer";
      pr.textContent = "#" + item.pr;
      badges.appendChild(pr);
    }

    top.append(title, badges);

    const summary = document.createElement("p");
    summary.textContent = item.summary || "";

    body.append(top, summary);

    if (item.href) {
      const action = document.createElement("a");
      action.className = "update-log-action";
      action.href = item.href;
      action.textContent = "看看这个功能 →";
      body.appendChild(action);
    }

    card.append(icon, body);
    list.appendChild(card);
  });

  const hash = location.hash.replace(/^#/, "");
  if (hash) {
    requestAnimationFrame(() => document.getElementById(hash)?.scrollIntoView({ block: "center" }));
  }
}

async function load() {
  try {
    const payload = await jsonFetch("/api/updates");
    updates = Array.isArray(payload?.updates) ? payload.updates : [];
    renderFilters();
    renderUpdates();
  } catch (error) {
    count.textContent = "读取失败";
    showToast("更新日志读取失败：" + error.message, 3800);
  }
}

load();
