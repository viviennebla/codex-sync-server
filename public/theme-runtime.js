// Native browser modules: reusable static art variants and non-interactive theme layers.
// All rendering lives behind riders and reuses the same CSS background transform.
export function pickArtwork(variants, viewportWidth, pixelRatio = 1) {
  const sorted = [...(variants || [])].sort((a,b) => a.width - b.width);
  if (!sorted.length) return null;
  const target = Math.max(1, viewportWidth) * Math.max(1,pixelRatio);
  return (sorted.find(item => item.width >= target) || sorted.at(-1)).src;
}

export function validThemeAsset(src, theme) {
  return typeof src === "string" && /^\/themes\/[a-z][a-z0-9-]*\/[a-zA-Z0-9/_-]+\.(?:webp|avif|png|svg)$/.test(src)
    && src.startsWith("/themes/" + theme + "/") && !src.includes("..");
}

export async function loadThemeManifest(theme, fetchImpl = fetch) {
  if (!["halloween"].includes(theme)) return null;
  const response = await fetchImpl("/themes/" + theme + "/manifest.json");
  if (!response.ok) throw Error("Theme manifest not available");
  const config = await response.json();
  if (config.theme !== theme || !Array.isArray(config.base?.variants)
    || !config.base.variants.every(v => validThemeAsset(v.src,theme))
    || !config.layers?.every(l => !l.src || validThemeAsset(l.src,theme))
    || !config.flyovers?.every(v => validThemeAsset(v.src,theme))) {
    throw Error("Theme manifest rejected");
  }
  return config;
}

export async function mountThemeLayers(theme, root = document.querySelector(".app-shell")) {
  if (!root) return null;
  const cfg=await loadThemeManifest(theme);
  const scene=pickArtwork(cfg.base.variants,window.innerWidth,window.devicePixelRatio || 1);
  if (scene && validThemeAsset(scene,theme)) root.style.setProperty("--season-base",'url("' + scene + '")');
  const old=root.querySelector(".season-layer-host"); if(old)old.remove();
  const host=document.createElement("div");
  host.className="season-layer-host";
  host.setAttribute("aria-hidden","true");
  host.style.pointerEvents="none";
  for (const layer of cfg.layers) {
    if (!layer.src || !validThemeAsset(layer.src,theme)) continue;
    const node=document.createElement("div");
    node.className="season-layer "+layer.className;
    node.style.backgroundImage='url("' + layer.src + '")';
    if (layer.durationSeconds) node.style.animationDuration=layer.durationSeconds+"s";
    host.append(node);
  }
  for(const bat of cfg.flyovers || []){
    if(!validThemeAsset(bat.src,theme)) continue;
    const element=document.createElement("img");
    element.src=bat.src;
    element.className="season-bat-flyover";
    element.alt="";
    element.decoding="async";
    element.style.setProperty("--bat-top",bat.topPercent+"%");
    element.style.setProperty("--bat-size",bat.size+"px");
    element.style.setProperty("--bat-delay",bat.delaySeconds+"s");
    element.style.setProperty("--bat-duration",bat.durationSeconds+"s");
    host.append(element);
  }
  root.append(host);
  return cfg;
}
