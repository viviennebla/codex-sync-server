// Helmet commuter v0.1: one fixed right-facing sprite rig shared by walk and bike.
// Other transports keep the established DOM art until their own adapters are ready.
// Slot assets are loaded from a trusted same-origin static catalog, never user-supplied markup.
const SVG_NS = "http://www.w3.org/2000/svg";
const ASSET_CATALOG = "/riders/manifest.json";
const VIEWPORT = "0 0 128 100";
const mounted = new Map();
let catalogPromise = null;
let animationPending = false;
let previousTick = 0;

async function readCatalog(url) {
  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) throw new Error("rider artwork HTTP " + response.status);
  return response.json();
}

export function loadRiderCatalog() {
  if (!catalogPromise) {
    catalogPromise = (async () => {
      const root = await readCatalog(ASSET_CATALOG);
      const id = root.default_preset;
      const preset = await readCatalog(root.presets[id]);
      return { id, preset, activeTransports: root.active_transports || ["bike", "walk"] };
    })().catch((error) => {
      catalogPromise = null; // A later refresh can recover after a temporary failure.
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
  const bike = transport === "bike";
  if (bike && flags.mounting) return "bike_mount";
  if (bike && (flags.bonking || flags.tired)) return "bike_brake";
  if (bike && flags.coasting) return "bike_glide";
  if (bike) return "bike_ride";
  if (flags.tired) return "tired";
  if (flags.celebrating || flags.waving) return "happy";
  if (flags.fast) return "focused";
  return flags.idle ? "idle" : "walk";
}

function imageLayer(slot, props) {
  return `<image data-part="${slot}" href="${props.src}" x="${props.x}" y="${props.y}" width="${props.width}" height="${props.height}" preserveAspectRatio="none"/>`;
}

function svgMarkup(preset) {
  const slots = preset.slots;
  const bike = preset.vehicles.bike;
  return `<svg class="pixel-rider-svg" viewBox="${VIEWPORT}" xmlns="${SVG_NS}" aria-hidden="true" focusable="false" shape-rendering="crispEdges">
    <ellipse cx="67" cy="93" rx="46" ry="3" fill="#2e2453" opacity=".35"/>
    <image class="pixel-vehicle" href="${bike.src}" x="${bike.x}" y="${bike.y}" width="${bike.width}" height="${bike.height}" preserveAspectRatio="none"/>
    <g class="pixel-rider-core">
      ${imageLayer("backpack", slots.backpack)}
      ${imageLayer("body", slots.body)}
      ${imageLayer("head", slots.head)}
      <g class="pixel-face">
        <rect x="77" y="21" width="15" height="14" fill="#171430"/>
        <path class="pixel-eyes" d="M79 22v9m8-9v9" stroke="#ffe987" stroke-width="3" stroke-linecap="square"/>
      </g>
    </g>
    <path class="pixel-leg-back" d="" fill="none" stroke="#7566ba" stroke-width="6" stroke-linecap="square" stroke-linejoin="bevel"/>
    <path class="pixel-leg-front" d="" fill="none" stroke="#d0c6ff" stroke-width="7" stroke-linecap="square" stroke-linejoin="bevel"/>
    <path class="pixel-arm-back" d="" fill="none" stroke="#b3a4ed" stroke-width="7" stroke-linecap="square" stroke-linejoin="bevel"/>
    <path class="pixel-arm-front" d="" fill="none" stroke="#fff5fa" stroke-width="7" stroke-linecap="square" stroke-linejoin="bevel"/>
    <path class="pixel-bike-brake" d="M5 91h8m-5 4h7" stroke="#ffad67" stroke-width="3" stroke-linecap="square" opacity="0"/>
  </svg>`;
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

function segment(hipX, hipY, kneeX, kneeY, footX, footY) {
  return `M${hipX} ${hipY}L${kneeX} ${kneeY}L${footX} ${footY}`;
}

function drawFrame(entry, now) {
  const { node, art, preset } = entry;
  const bike = entry.transport === "bike";
  const state = resolveSpriteState(entry.transport, {
    ...flagsFor(node),
    mounting: bike && now < entry.mountUntil
  });
  const frames = preset.states;
  const elapsed = now - entry.stateStarted;
  if (entry.state !== state) {
    entry.state = state;
    entry.stateStarted = now;
  }
  const frame = frameIndex(state, now - entry.stateStarted, frames);
  const phase = (frame / Math.max(1, frames[state]?.frames || 1)) * Math.PI * 2;
  const x = Math.sin(phase);
  const y = Math.cos(phase);
  const core = art.querySelector(".pixel-rider-core");
  const vehicle = art.querySelector(".pixel-vehicle");
  const face = art.querySelector(".pixel-eyes");
  const backLeg = art.querySelector(".pixel-leg-back");
  const frontLeg = art.querySelector(".pixel-leg-front");
  const backArm = art.querySelector(".pixel-arm-back");
  const frontArm = art.querySelector(".pixel-arm-front");
  const brake = art.querySelector(".pixel-bike-brake");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const motion = reduced ? 0 : 1;
  const bodyBob = (bike ? Math.abs(x) * -1.1 : Math.abs(x) * -2.4) * motion;
  const mountOffset = state === "bike_mount" && frame === 0 ? -3 : 0;
  core.setAttribute("transform", `translate(0 ${Math.round(bodyBob + mountOffset)})`);
  vehicle.style.display = bike ? "" : "none";
  brake.setAttribute("opacity", state === "bike_brake" && !reduced ? "1" : "0");
  let front;
  let back;
  if (bike) {
    const pedalX = 67 + (reduced ? 0 : Math.round(Math.cos(phase) * 10));
    const pedalY = 75 + (reduced ? 0 : Math.round(Math.sin(phase) * 7));
    front = segment(66, 66, 72, 70, pedalX, pedalY);
    back = segment(62, 67, 60, 72, 67 - (pedalX - 67), 75 - (pedalY - 75));
    if (state === "bike_glide") {
      front = segment(66, 66, 69, 72, 68, 79);
      back = segment(62, 66, 57, 72, 58, 80);
    }
    if (state === "bike_brake") {
      front = segment(66, 67, 73, 72, 76, 79);
      back = segment(62, 67, 59, 72, 56, 77);
    }
    frontArm.setAttribute("d", segment(79, 50, 83, 54, 91, 48));
    backArm.setAttribute("d", segment(75, 52, 81, 56, 89, 48));
  } else {
    front = segment(67, 69, 68 + 7*x*motion, 80, 72 + 10*x*motion, 89);
    back = segment(59, 68, 59 - 7*x*motion, 79, 56 - 10*x*motion, 89);
    if (state === "idle" || state === "happy" || state === "tired") {
      front = segment(67, 69, 67, 80, 67, 90);
      back = segment(59, 69, 59, 80, 59, 90);
    }
    frontArm.setAttribute("d", state === "happy"
      ? segment(79, 51, 84, 42, 88, 36)
      : segment(78, 51, 78 - 4*x*motion, 61, 79 - 7*x*motion, 67));
    backArm.setAttribute("d", segment(55, 51, 51 + 4*x*motion, 59, 53 + 7*x*motion, 67));
  }
  frontLeg.setAttribute("d", front);
  backLeg.setAttribute("d", back);
  if (state === "happy") face.setAttribute("d", "M78 25l3 2 3-2m3 0 3 2 2-2");
  else if (state === "tired" || state === "bike_brake") face.setAttribute("d", "M79 28h4m4 0h4");
  else if (state === "focused") face.setAttribute("d", "M79 25v5m8-5v5");
  else face.setAttribute("d", "M79 22v9m8-9v9");
}

function animate(now) {
  animationPending = false;
  if (document.hidden) {
    // Resume on visibilitychange rather than polling an invisible tab.
    return;
  }
  if (now - previousTick >= 85) {
    previousTick = now;
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
  if (animationPending || !mounted.size || document.hidden) return;
  animationPending = true;
  window.requestAnimationFrame(animate);
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) startTicker();
  });
}

export function mountRiderSprite(node, transport, catalog) {
  const supported = catalog.activeTransports.includes(transport);
  if (!supported) {
    if (mounted.has(node)) mounted.delete(node);
    node.querySelector(".pixel-rider-art")?.remove();
    node.classList.remove("has-pixel-rider");
    return;
  }
  const previous = mounted.get(node);
  if (previous) {
    if (previous.transport !== transport) {
      previous.transport = transport;
      previous.mountUntil = transport === "bike" ? performance.now() + 650 : 0;
      previous.state = null;
    }
    startTicker();
    return;
  }
  const parent = node.querySelector(".rider-motion");
  if (!parent) return;
  const art = document.createElement("div");
  art.className = "pixel-rider-art";
  art.setAttribute("aria-hidden", "true");
  art.innerHTML = svgMarkup(catalog.preset);
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

// Future preset selection can replace any of these independently, while preserving anchor geometry.
export function setRiderSlots(node, overrides = {}) {
  const entry = mounted.get(node);
  if (!entry) return false;
  for (const slot of ["head", "body", "backpack"]) {
    if (!overrides[slot]) continue;
    const image = entry.art.querySelector(`[data-part="${slot}"]`);
    if (image) image.setAttribute("href", overrides[slot]);
  }
  return true;
}

export function disposeRiderSprite(node) {
  mounted.delete(node);
  node.querySelector(".pixel-rider-art")?.remove();
  node.classList.remove("has-pixel-rider");
}
