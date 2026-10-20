// Helmet commuter v0.1. Source-matched pixel atlas; the approved concept artwork
// supplies the silhouette, rather than independently redrawn blocky SVG placeholders.
// Slot coordinates and limb anchors use one right-facing 128x100 logical canvas.
const SVG_NS = "http://www.w3.org/2000/svg";
const CATALOG_URL = "/riders/manifest.json";
const VIEWBOX = "0 0 128 100";
const mounted = new Map();
let catalogPromise = null;
let framePending = false;
let lastFrameTime = 0;

async function fetchJson(url) {
  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) throw new Error("Rider asset HTTP " + response.status);
  return response.json();
}

async function preloadArt(urls) {
  if (typeof Image === "undefined") return;
  await Promise.all([...new Set(urls)].map(async (url) => {
    const image = new Image();
    image.src = url;
    if (image.decode) await image.decode();
    else await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
    });
  }));
}

export function loadRiderCatalog() {
  if (!catalogPromise) {
    catalogPromise = (async () => {
      const root = await fetchJson(CATALOG_URL);
      const preset = await fetchJson(root.presets[root.default_preset]);
      await preloadArt([preset.atlas?.src, preset.vehicles?.bike?.src].filter(Boolean));
      return {
        id: root.default_preset,
        preset,
        activeTransports: root.active_transports || ["bike", "walk"]
      };
    })().catch((error) => {
      catalogPromise = null; // A failed load never hides the original CSS rider.
      throw error;
    });
  }
  return catalogPromise;
}

export function frameIndex(state, elapsedMs, states) {
  const animation = states?.[state];
  if (!animation) return 0;
  const frames = Math.max(1, Number(animation.frames) || 1);
  const fps = Math.max(1, Number(animation.fps) || 6);
  return Math.floor(Math.max(0, elapsedMs) * fps / 1000) % frames;
}

export function resolveSpriteState(transport, flags = {}) {
  if (transport === "bike") {
    if (flags.mounting) return "bike_mount";
    if (flags.bonking || flags.tired) return "bike_brake";
    if (flags.coasting) return "bike_glide";
    return "bike_ride";
  }
  if (flags.tired) return "tired";
  if (flags.celebrating || flags.waving) return "happy";
  if (flags.fast) return "focused";
  return flags.idle ? "idle" : "walk";
}

function svg(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, String(value));
  }
  return element;
}

function atlasLayer(name, spec, atlas) {
  // A nested SVG clips the shared atlas to this part. The outer <g> may rotate
  // while the inner viewBox preserves original, approved source-art pixels.
  const group = svg("g", { class: "sprite-part sprite-" + name, "data-part": name });
  const viewport = svg("svg", {
    x: spec.x, y: spec.y, width: spec.width, height: spec.height,
    viewBox: spec.crop.join(" "), preserveAspectRatio: "none", overflow: "hidden"
  });
  const bitmap = svg("image", {
    href: spec.src, x: 0, y: 0, width: atlas.width, height: atlas.height,
    preserveAspectRatio: "none"
  });
  viewport.append(bitmap);
  group.append(viewport);
  return group;
}

function buildSprite(preset) {
  const root = svg("svg", {
    class: "pixel-rider-svg",
    viewBox: VIEWBOX,
    "aria-hidden": "true",
    focusable: "false"
  });
  root.append(svg("ellipse", {cx: 66, cy: 94, rx: 42, ry: 3, fill: "#20163d", opacity: ".32"}));
  const bike = preset.vehicles.bike;
  root.append(svg("image", {
    class: "pixel-vehicle", href: bike.src,
    x: bike.x, y: bike.y, width: bike.width, height: bike.height,
    preserveAspectRatio: "none"
  }));
  const core = svg("g", {class: "pixel-rider-core"});
  for (const name of ["leg_back", "backpack", "arm_back", "body", "leg_front", "head", "arm_front"]) {
    core.append(atlasLayer(name, preset.slots[name] || preset.limbs[name], preset.atlas));
  }
  const expression = svg("g", {class: "pixel-expression", display: "none"});
  // This patch sits fully inside the dark visor; the default golden pixel eyes
  // are retained unmodified. Only exceptional expressions draw over them.
  expression.append(svg("rect", {
    x: 80, y: 36, width: 17, height: 17, rx: 7, fill: "#20163d"
  }));
  expression.append(svg("path", {
    class: "pixel-expression-eyes",
    stroke: "#ffe88d", "stroke-width": 2.6, "stroke-linecap": "round",
    fill: "none"
  }));
  core.append(expression);
  root.append(core);
  const brake = svg("g", {class: "pixel-bike-brake", opacity: 0});
  brake.append(svg("path", {
    d: "M8 89h8m-11 4h9", stroke: "#ffb66c",
    "stroke-width": 2.3, "stroke-linecap": "round"
  }));
  root.append(brake);
  return root;
}

function flagsFor(node) {
  return {
    tired: node.classList.contains("is-tired"),
    bonking: node.classList.contains("is-bonking"),
    coasting: node.classList.contains("is-coasting"),
    celebrating: node.classList.contains("is-celebrating"),
    waving: node.classList.contains("is-waving"),
    fast: node.classList.contains("is-fast") || node.classList.contains("is-sprinting"),
    idle: node.classList.contains("is-chill")
  };
}

function transform(part, dx = 0, dy = 0, angle = 0, pivotX = 65, pivotY = 68) {
  part?.setAttribute("transform",
    `translate(${dx.toFixed(2)} ${dy.toFixed(2)}) rotate(${angle.toFixed(2)} ${pivotX} ${pivotY})`);
}

function renderFace(art, state, flags) {
  const expression = art.querySelector(".pixel-expression");
  const eyes = art.querySelector(".pixel-expression-eyes");
  const emotion = flags.tired || state === "bike_brake"
    ? "tired"
    : flags.celebrating || flags.waving || state === "happy"
      ? "happy"
      : flags.fast || state === "focused" ? "focused" : "neutral";
  expression.setAttribute("display", emotion === "neutral" ? "none" : "");
  if (emotion === "happy") eyes.setAttribute("d", "M82 44q2-4 4 0m4 0q2-4 4 0");
  else if (emotion === "tired") eyes.setAttribute("d", "M82 45h4m5 0h4");
  else if (emotion === "focused") eyes.setAttribute("d", "M83 40l3 7m6-7v7");
}

function drawFrame(entry, now) {
  const { node, art, preset } = entry;
  const bike = entry.transport === "bike";
  const flags = flagsFor(node);
  const state = resolveSpriteState(entry.transport, {
    ...flags, mounting: bike && now < entry.mountUntil
  });
  if (entry.state !== state) {
    entry.state = state;
    entry.stateStarted = now;
  }
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const step = reduced ? 0 : frameIndex(state, now - entry.stateStarted, preset.states);
  const frames = Math.max(1, preset.states[state]?.frames || 1);
  const phase = 2 * Math.PI * step / frames;
  const swing = reduced ? 0 : Math.sin(phase);
  const lift = reduced ? 0 : Math.cos(phase);
  const get = (name) => art.querySelector(".sprite-" + name);
  const core = art.querySelector(".pixel-rider-core");
  const bob = reduced ? 0 : (bike ? -0.7 : -1.5) * Math.abs(swing);
  const mounting = state === "bike_mount" && step === 0;
  const sleepy = state === "tired" || state === "bike_brake";
  transform(core, mounting ? -6 : 0, bob + (sleepy ? 1 : 0));
  const vehicle = art.querySelector(".pixel-vehicle");
  vehicle.style.display = bike ? "" : "none";
  art.querySelector(".pixel-bike-brake").setAttribute("opacity",
    state === "bike_brake" && !reduced ? "1" : "0");

  if (bike) {
    const pedaling = state === "bike_ride" && !reduced;
    const dx = pedaling ? 4 * swing : 0;
    const dy = pedaling ? 3 * lift : 0;
    transform(get("leg_front"), -3 + dx, -9 + dy, -8 + 10 * swing, 65, 76);
    transform(get("leg_back"), 5 - dx, -10 - dy, 8 - 10 * swing, 55, 76);
    transform(get("arm_front"), 6, -3, -14, 80, 60);
    transform(get("arm_back"), 7, -4, -9, 55, 60);
  } else {
    const standing = ["idle", "happy", "tired", "focused"].includes(state);
    const stride = standing ? 0 : swing;
    transform(get("leg_front"), 4 * stride, Math.max(0, -2 * lift), -10 * stride, 65, 76);
    transform(get("leg_back"), -4 * stride, Math.max(0, 2 * lift), 10 * stride, 55, 76);
    transform(get("arm_front"), 2 * stride, -2 * stride, state === "happy" ? -36 : -6 * stride, 79, 60);
    transform(get("arm_back"), -2 * stride, 2 * stride, 6 * stride, 57, 60);
  }
  renderFace(art, state, flags);
}

function animate(now) {
  framePending = false;
  if (document.hidden) return;
  if (now - lastFrameTime >= 85) {
    lastFrameTime = now;
    for (const [node, entry] of mounted) {
      if (!node.isConnected || !node.classList.contains("has-pixel-rider")) {
        mounted.delete(node);
        continue;
      }
      drawFrame(entry, now);
    }
  }
  if (mounted.size) startTicker();
}

function startTicker() {
  if (framePending || !mounted.size || document.hidden) return;
  framePending = true;
  window.requestAnimationFrame(animate);
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) startTicker();
  });
}

export function mountRiderSprite(node, transport, catalog) {
  if (!catalog.activeTransports.includes(transport)) {
    disposeRiderSprite(node);
    return;
  }
  const existing = mounted.get(node);
  if (existing) {
    if (existing.transport !== transport) {
      existing.transport = transport;
      existing.mountUntil = transport === "bike" ? performance.now() + 650 : 0;
      existing.state = null;
    }
    startTicker();
    return;
  }
  const parent = node.querySelector(".rider-motion");
  if (!parent) return;
  const art = document.createElement("div");
  art.className = "pixel-rider-art";
  art.setAttribute("aria-hidden", "true");
  art.append(buildSprite(catalog.preset));
  parent.appendChild(art);
  node.classList.add("has-pixel-rider");
  const entry = {
    node, art, preset: catalog.preset, transport,
    state: null, stateStarted: performance.now(),
    mountUntil: transport === "bike" ? performance.now() + 650 : 0
  };
  mounted.set(node, entry);
  drawFrame(entry, performance.now());
  startTicker();
}

// Replacements must be trusted, same-origin character artwork with the same slot
// coordinate contract. Other preset/body-specific limbs can be added later.
export function setRiderSlots(node, overrides = {}) {
  const entry = mounted.get(node);
  if (!entry) return false;
  let changed = false;
  for (const name of ["head", "body", "backpack"]) {
    const override = overrides[name];
    if (!override) continue;
    const spec = typeof override === "string" ? { src: override } : override;
    if (!spec?.src?.startsWith("/riders/")) continue;
    const part = entry.art.querySelector(`[data-part="${name}"]`);
    const bitmap = part?.querySelector("image");
    if (!bitmap) continue;
    bitmap.setAttribute("href", spec.src);
    if (Array.isArray(spec.crop) && spec.crop.length === 4) {
      part.querySelector("svg").setAttribute("viewBox", spec.crop.join(" "));
    }
    changed = true;
  }
  return changed;
}

export function disposeRiderSprite(node) {
  mounted.delete(node);
  node.querySelector(".pixel-rider-art")?.remove();
  node.classList.remove("has-pixel-rider");
}
