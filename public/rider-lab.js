const sloganInput = document.getElementById("sloganInput");
const sloganCount = document.getElementById("sloganCount");
const sloganPreview = document.getElementById("sloganPreview");
const saveButton = document.getElementById("saveSlogans");
const resetButton = document.getElementById("resetSlogans");
const labTitle = document.getElementById("labTitle");
const toast = document.getElementById("labToast");

const MAX_SLOGANS = 8;
const MAX_LENGTH = 28;

function parseSlogans() {
  return sloganInput.value
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function renderEditor() {
  const slogans = parseSlogans();
  sloganCount.textContent = slogans.length + " / " + MAX_SLOGANS;
  sloganCount.dataset.invalid = String(
    slogans.length > MAX_SLOGANS || slogans.some((line) => [...line].length > MAX_LENGTH)
  );
  sloganPreview.replaceChildren();
  slogans.slice(0, MAX_SLOGANS).forEach((line) => {
    const chip = document.createElement("span");
    chip.className = "rider-lab-chip";
    chip.textContent = line;
    sloganPreview.appendChild(chip);
  });
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

function validateSlogans(slogans) {
  if (slogans.length > MAX_SLOGANS) throw new Error("最多只能放 8 句");
  const tooLong = slogans.find((line) => [...line].length > MAX_LENGTH);
  if (tooLong) throw new Error("有一句超过 28 个字符");
}

async function saveSlogans(slogans) {
  validateSlogans(slogans);
  saveButton.disabled = true;
  resetButton.disabled = true;
  try {
    const result = await jsonFetch("/api/me/slogans", {
      method: "PUT",
      body: JSON.stringify({ slogans }),
    });
    sloganInput.value = (result.slogans || []).join("\n");
    renderEditor();
    showToast(result.slogans?.length ? "口号已保存，回赛道会随机冒出来" : "已恢复系统默认台词");
  } finally {
    saveButton.disabled = false;
    resetButton.disabled = false;
  }
}

async function bootstrap() {
  try {
    const result = await jsonFetch("/api/me");
    const user = result.user || {};
    labTitle.textContent = (user.display_name || "骑手") + " 的秘密改装间";
    sloganInput.value = (user.slogans || []).join("\n");
    renderEditor();
  } catch (error) {
    if (error.status === 401) {
      location.href = "/";
      return;
    }
    showToast("读取设置失败：" + error.message, 3600);
  }
}

sloganInput.addEventListener("input", renderEditor);
saveButton.addEventListener("click", () => {
  saveSlogans(parseSlogans()).catch((error) => showToast(error.message, 3200));
});
resetButton.addEventListener("click", () => {
  saveSlogans([]).catch((error) => showToast(error.message, 3200));
});

void bootstrap();
