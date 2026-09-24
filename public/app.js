const $ = (id) => document.getElementById(id);

const statusEl = $("status");
const profileEl = $("profile");
const avatarEl = $("avatar");
const userIdEl = $("userId");
const actionsEl = $("actions");
const pairButton = $("pairButton");
const retryButton = $("retryButton");
const pairingEl = $("pairing");
const pairingCodeEl = $("pairingCode");
const bindCommandEl = $("bindCommand");

let config = null;

function showStatus(message) {
  statusEl.textContent = message;
}

function showProfile(user) {
  profileEl.classList.remove("hidden");
  actionsEl.classList.remove("hidden");
  retryButton.classList.add("hidden");
  userIdEl.textContent = user.user_id;
  avatarEl.src = user.avatar_url || "";
  avatarEl.hidden = !user.avatar_url;
  showStatus("飞书身份已绑定，随时可以开始蹬。");
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
    const error = new Error(payload?.error || text || `HTTP ${response.status}`);
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

    const success = (result) => result?.code ? resolve(result.code) : reject(new Error("飞书未返回免登 code"));
    const fail = (error) => reject(new Error(error?.errString || error?.message || "飞书免登失败"));

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
        fail: () => fallback(),
      });
    });

    if (typeof window.h5sdk.error === "function") {
      window.h5sdk.error((error) => fail(error));
    }
  });
}

async function loginWithFeishu() {
  if (!config?.configured || !config.app_id) {
    throw new Error("服务端尚未配置 FEISHU_APP_ID / FEISHU_APP_SECRET");
  }
  showStatus("正在从飞书获取免登身份…");
  const code = await requestAuthCode(config.app_id, config.base_url + "/");
  const result = await jsonFetch("/api/auth/feishu/login", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
  showProfile(result.user);
}

async function bootstrap() {
  config = await jsonFetch("/api/feishu/config");
  try {
    const me = await jsonFetch("/api/me");
    showProfile(me.user);
    return;
  } catch (error) {
    if (error.status !== 401) throw error;
  }

  try {
    await loginWithFeishu();
  } catch (error) {
    showStatus(error.message);
    actionsEl.classList.remove("hidden");
    pairButton.classList.add("hidden");
    retryButton.classList.remove("hidden");
  }
}

pairButton.addEventListener("click", async () => {
  pairButton.disabled = true;
  try {
    const result = await jsonFetch("/api/pairing-codes", {
      method: "POST",
      body: JSON.stringify({}),
    });
    pairingEl.classList.remove("hidden");
    pairingCodeEl.textContent = result.code;
    bindCommandEl.textContent =
      `node src/cli.js denglema bind --server ${config.base_url} --code ${result.code}`;
  } catch (error) {
    showStatus(`生成 pairing code 失败：${error.message}`);
  } finally {
    pairButton.disabled = false;
  }
});

retryButton.addEventListener("click", async () => {
  retryButton.disabled = true;
  try {
    await loginWithFeishu();
    pairButton.classList.remove("hidden");
  } catch (error) {
    showStatus(error.message);
  } finally {
    retryButton.disabled = false;
  }
});

bootstrap().catch((error) => {
  showStatus(`初始化失败：${error.message}`);
  actionsEl.classList.remove("hidden");
  pairButton.classList.add("hidden");
  retryButton.classList.remove("hidden");
});
