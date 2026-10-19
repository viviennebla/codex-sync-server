// Shared, light-weight seasonal art metadata and small independent effect layers.
// No identity/usage reads, no background polling. All artwork paths are local.
export function resolveSeason(forced, productDay) {
  if (forced === "off") return null;
  if (forced === "halloween" || forced === "christmas") return forced;
  const monthDay = String(productDay || "").slice(5);
  if ((monthDay >= "10-18" && monthDay <= "10-31") || monthDay === "11-01") return "halloween";
  if (monthDay >= "12-15" || monthDay <= "01-03") return "christmas";
  return null;
}

function stableRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function addEffects(root, layer) {
  const random = stableRandom(layer.seed || 2026);
  if (layer.kind === "glows") {
    for (const point of layer.points || []) {
      const node = document.createElement("span");
      node.className = "season-light-glow";
      node.style.left = point.x + "%";
      node.style.top = point.y + "%";
      node.style.width = point.size + "%";
      node.style.animationDelay = "-" + (point.delay || 0) + "s";
      node.style.animationDuration = (layer.periodSeconds || 4.5) + "s";
      root.append(node);
    }
    return;
  }
  if (!["snow", "sparkles"].includes(layer.kind)) return;
  const count = Math.min(50, Math.max(0, layer.count || 0));
  for (let i = 0; i < count; i++) {
    const x = random() * 100;
    const delay = random() * 23;
    const duration = 13 + random() * 18;
    const size = (layer.kind === "snow" ? 2.5 : 1.5) + random() * 4;
    const node = document.createElement("span");
    node.className = layer.kind === "snow" ? "season-snowflake" : "season-sparkle";
    node.style.setProperty("--season-x", x + "%");
    node.style.setProperty("--season-size", size + "px");
    node.style.setProperty("--season-delay", "-" + delay + "s");
    node.style.setProperty("--season-duration", duration + "s");
    node.style.setProperty("--season-sway", (random() * 75 - 37) + "px");
    if (layer.kind === "sparkles") node.style.top = 9 + random() * 40 + "%";
    root.append(node);
  }
}

export async function setupSeasonLayers(theme) {
  if (!["christmas", "halloween"].includes(theme)) return null;
  const response = await fetch("/themes/" + theme + "/manifest.json");
  if (!response.ok) return null;
  const config = await response.json();
  if (config.theme !== theme || !config.artwork?.src?.startsWith("/themes/" + theme + "/")) return null;
  const shell = document.querySelector(".app-shell");
  if (!shell) return null;
  shell.style.setProperty("--season-art", 'url("' + config.artwork.src + '")');
  const existing = shell.querySelector(".season-decor");
  existing?.remove();
  const root = document.createElement("div");
  root.className = "season-decor";
  root.setAttribute("aria-hidden", "true");
  for (const layer of config.layers || []) {
    if (layer.enabled) addEffects(root, layer);
  }
  shell.append(root);
  return config;
}
