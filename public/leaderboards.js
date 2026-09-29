const modelBoard = document.getElementById("modelBoard");
const projectBoard = document.getElementById("projectBoard");
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

function medal(index) {
  return ["🥇", "🥈", "🥉"][index] || String(index + 1);
}
function contributorText(rows) {
  const values = Array.isArray(rows) ? rows.slice(0, 3) : [];
  if (!values.length) return "还没有骑手明细";
  return values
    .map((row) => (row.avatar_emoji || "🚴") + " " + row.display_name)
    .join(" · ");
}

function renderBoard(container, rows) {
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
    contributors.textContent = contributorText(row.contributors);

    item.append(head, track, contributors);
    container.appendChild(item);
  });
}
async function load() {
  const payload = await jsonFetch("/api/leaderboards/dimensions");
  renderBoard(modelBoard, payload.models);
  renderBoard(projectBoard, payload.projects);

  const percent = Math.round(Number(payload.coverage_ratio || 0) * 100);
  coverageEl.textContent =
    (payload.v2_installations || 0) + "/" + (payload.installations || 0) +
    " 台设备已上传明细 · 覆盖 " + percent + "% 今日 token";

  if (percent < 100) {
    footnoteEl.textContent =
      "还有设备只上传了总量，所以燃烧榜是当前可见明细，不会假装成完整统计。";
  } else {
    footnoteEl.textContent = "今天所有有数据的设备都已进入明细统计。";
  }
}

load().catch((error) => {
  coverageEl.textContent = "燃烧榜读取失败";
  footnoteEl.textContent = error.message;
  renderBoard(modelBoard, []);
  renderBoard(projectBoard, []);
});
