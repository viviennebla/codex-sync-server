const projectList = document.getElementById("privacyProjects");
const summary = document.getElementById("privacySummary");
const toast = document.getElementById("privacyToast");

function formatTokens(value) {
  const n = Number(value || 0);
  if (n >= 10000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000000) return (n / 1000000).toFixed(2) + "M";
  if (n >= 100000) return Math.round(n / 1000) + "K";
  return n.toLocaleString("en-US");
}

function showToast(message, ms = 2400) {
  toast.textContent = message;
  toast.classList.remove("hidden");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.add("hidden"), ms);
}

async function jsonFetch(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch {}
  if (!response.ok) {
    const error = new Error(payload?.error || text || ("HTTP " + response.status));
    error.status = response.status;
    throw error;
  }
  return payload;
}

function modeLabel(mode) {
  if (mode === "hidden") return "已隐藏";
  if (mode === "alias") return "公开别名";
  return "公开原名";
}

async function saveRule(project, mode, alias) {
  return jsonFetch("/api/me/project-privacy", {
    method: "PUT",
    body: JSON.stringify({ project, mode, alias }),
  });
}

function renderProjects(rows) {
  const values = Array.isArray(rows) ? rows : [];
  projectList.replaceChildren();
  summary.textContent = values.length + " 个 Project";

  if (!values.length) {
    const empty = document.createElement("div");
    empty.className = "breakdown-empty";
    empty.textContent = "还没有 Project 明细。先上传一次 usage 再回来看看。";
    projectList.appendChild(empty);
    return;
  }

  values.forEach((row) => {
    const card = document.createElement("article");
    card.className = "privacy-project-card";

    const head = document.createElement("div");
    head.className = "privacy-project-head";
    const identity = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = row.name;
    const meta = document.createElement("small");
    meta.textContent = formatTokens(row.total_tokens) + " · " + modeLabel(row.mode);
    identity.append(name, meta);
    head.appendChild(identity);

    const controls = document.createElement("div");
    controls.className = "privacy-project-controls";
    const select = document.createElement("select");
    select.setAttribute("aria-label", row.name + " 的公开方式");
    [["visible", "公开原名"], ["hidden", "隐藏"], ["alias", "改名"]]
      .forEach(([value, label]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        option.selected = row.mode === value;
        select.appendChild(option);
      });

    const aliasInput = document.createElement("input");
    aliasInput.type = "text";
    aliasInput.maxLength = 48;
    aliasInput.autocomplete = "off";
    aliasInput.placeholder = "公开别名，例如：秘密项目";
    aliasInput.value = row.alias || "";
    aliasInput.hidden = select.value !== "alias";

    const save = document.createElement("button");
    save.type = "button";
    save.className = "profile-button";
    save.textContent = "保存";

    select.addEventListener("change", () => {
      aliasInput.hidden = select.value !== "alias";
      if (select.value === "alias") aliasInput.focus();
    });

    save.addEventListener("click", async () => {
      save.disabled = true;
      try {
        await saveRule(row.name, select.value, aliasInput.value);
        showToast(row.name + " · 隐私设置已更新");
        await load();
      } catch (error) {
        showToast("保存失败：" + error.message, 3400);
      } finally {
        save.disabled = false;
      }
    });

    controls.append(select, aliasInput, save);
    card.append(head, controls);
    projectList.appendChild(card);
  });
}

async function load() {
  try {
    const payload = await jsonFetch("/api/me/projects");
    renderProjects(payload.projects || []);
  } catch (error) {
    if (error.status === 401) {
      location.href = "/";
      return;
    }
    summary.textContent = "读取失败";
    showToast(error.message, 3600);
  }
}

load();
