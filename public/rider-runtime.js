// Modular helmet commuter: independent transparent source parts and shared side-view rig.
// Art manifests list files; rig coordinates determine placement and motion. No hand-authored atlas crops.
const SVG_NS = "http://www.w3.org/2000/svg";
const CATALOG_URL = "/riders/manifest.json";
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
      const rig = await fetchJson(preset.rig);
      await preloadArt([
        ...Object.values(preset.slots),
        ...Object.values(preset.limbs),
        preset.vehicles?.bike?.src
      ].filter(Boolean));
      return {
        id: root.default_preset,
        preset,
        rig,
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

function partLayer(name, src, geometry) {
  // Independent transparent source file, positioned by the shared skeleton.
  // No source-atlas viewBox, manual crop or texture-pack-specific coordinates.
  const group = svg("g", { class: "sprite-part sprite-" + name, "data-part": name });
  group.append(svg("image", {
    href: src,
    x: geometry.x, y: geometry.y, width: geometry.width, height: geometry.height,
    preserveAspectRatio: "none"
  }));
  return group;
}

function buildSprite(preset, rig) {
  const root = svg("svg", {
    class: "pixel-rider-svg",
    viewBox: `0 0 ${rig.canvas.width} ${rig.canvas.height}`,
    "aria-hidden": "true",
    focusable: "false"
  });
  root.append(svg("ellipse", {cx: 66, cy: 94, rx: 42, ry: 3, fill: "#20163d", opacity: ".32"}));
  const bike = rig.vehicles.bike;
  root.append(svg("image", {
    class: "pixel-vehicle", href: preset.vehicles.bike.src,
    x: bike.x, y: bike.y, width: bike.width, height: bike.height,
    preserveAspectRatio: "none"
  }));
  const core = svg("g", {class: "pixel-rider-core"});
  const art = { ...preset.slots, ...preset.limbs };
  const geometry = { ...rig.slots, ...rig.limbs };
  for (const name of rig.layer_order) {
    core.append(partLayer(name, art[name], geometry[name]));
  }
  const expression = svg("g", {class: "pixel-expression", display: "none"});
  // This patch sits fully inside the dark visor; the default golden pixel eyes
  // are retained unmodified. Only exceptional expressions draw over them.
  expression.append(svg("rect", {
    x: rig.expression.x, y: rig.expression.y,
    width: rig.expression.width, height: rig.expression.height,
    rx: 7, fill: "#20163d"
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
  const { node, art, preset, rig } = entry;
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
  const pivot = (name) => rig.limbs[name].pivot;
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
    transform(get("leg_front"), -3 + dx, -9 + dy, -8 + 10 * swing, ...pivot("leg_front"));
    transform(get("leg_back"), 5 - dx, -10 - dy, 8 - 10 * swing, ...pivot("leg_back"));
    transform(get("arm_front"), 6, -3, -14, ...pivot("arm_front"));
    transform(get("arm_back"), 7, -4, -9, ...pivot("arm_back"));
  } else {
    const standing = ["idle", "happy", "tired", "focused"].includes(state);
    const stride = standing ? 0 : swing;
    transform(get("leg_front"), 4 * stride, Math.max(0, -2 * lift), -10 * stride, ...pivot("leg_front"));
    transform(get("leg_back"), -4 * stride, Math.max(0, 2 * lift), 10 * stride, ...pivot("leg_back"));
    transform(get("arm_front"), 2 * stride, -2 * stride, state === "happy" ? -36 : -6 * stride, ...pivot("arm_front"));
    transform(get("arm_back"), -2 * stride, 2 * stride, 6 * stride, ...pivot("arm_back"));
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
  art.append(buildSprite(catalog.preset, catalog.rig));
  parent.appendChild(art);
  node.classList.add("has-pixel-rider");
  const entry = {
    node, art, preset: catalog.preset, rig: catalog.rig, transport,
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
    const src = typeof override === "string" ? override : override.src;
    if (!/^\\/riders\\/presets\\/[a-z0-9-]+\\/[a-z0-9_-]+\\.webp$/.test(src || "")) continue;
    const bitmap = entry.art.querySelector(`[data-part="${name}"] image`);
    if (!bitmap) continue;
    bitmap.setAttribute("href", src);
    changed = true;
  }
  return changed;
}

export function disposeRiderSprite(node) {
  mounted.delete(node);
  node.querySelector(".pixel-rider-art")?.remove();
  node.classList.remove("has-pixel-rider");
}
