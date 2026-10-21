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
        ...Object.values(preset.expressions || {}),
        ...Object.values(preset.vehicles?.bike || {})
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
  // Vehicle and character share a single animated assembly.
  // Changing transport requires just one visual character lift, not new joint anchors.
  const assembly = svg("g", {class: "pixel-rider-assembly"});
  // Compose wheels behind the frame; rotate them independently around axle centers.
  const bike = rig.vehicles.bike;
  const [sourceW, sourceH] = bike.art_canvas;
  const vehicle = svg("g", {
    class: "pixel-vehicle",
    transform: `translate(${bike.x} ${bike.y}) scale(${bike.width / sourceW} ${bike.height / sourceH})`
  });
  for (const role of ["rear", "front"]) {
    const wheel = bike.wheels[role];
    const [cx, cy] = wheel.center;
    const diameter = wheel.size;
    const group = svg("g", {class: "pixel-wheel pixel-wheel-" + role});
    group.append(svg("image", {
      href: preset.vehicles.bike.wheel,
      x: cx - diameter / 2, y: cy - diameter / 2,
      width: diameter, height: diameter, preserveAspectRatio: "none"
    }));
    vehicle.append(group);
  }
  vehicle.append(svg("image", {
    class: "pixel-bike-frame", href: preset.vehicles.bike.frame,
    x: 0, y: 0, width: sourceW, height: sourceH,
    preserveAspectRatio: "none"
  }));
  assembly.append(vehicle);
  const core = svg("g", {class: "pixel-rider-core"});
  const art = { ...preset.slots, ...preset.limbs };
  const geometry = { ...rig.slots, ...rig.limbs };
  for (const name of rig.layer_order) {
    if (name === "arm_back" || name === "arm_front") {
      const side = name === "arm_front" ? "front" : "back";
      const link = svg("g", {class:"pixel-arm-link pixel-arm-link-" + side, display:"none"});
      link.append(svg("path", {class:"pixel-arm-outline",fill:"none",stroke:"#423277",
        "stroke-width":9,"stroke-linecap":"round","stroke-linejoin":"round"}));
      link.append(svg("path", {class:"pixel-arm-fill",fill:"none",stroke:"#d4c6f9",
        "stroke-width":5.5,"stroke-linecap":"round","stroke-linejoin":"round"}));
      core.append(link);
    }
    core.append(partLayer(name, art[name], geometry[name]));
  }
  assembly.append(core);
  const brake = svg("g", {class: "pixel-bike-brake", opacity: 0});
  brake.append(svg("path", {
    d: "M8 89h8m-11 4h9", stroke: "#ffb66c",
    "stroke-width": 2.3, "stroke-linecap": "round"
  }));
  assembly.append(brake);
  root.append(assembly);
  const points = svg("g", {class:"pixel-debug-anchors",display:"none"});
  for (const [key,color] of Object.entries({
    seat:"#ffa957",handle:"#53e5ed",hip:"#ffed99",grip_front:"#7dffa2",
    pedal_front:"#f778bf",pedal_back:"#b7bdff"
  })) {
    const marker = svg("g",{class:"pixel-anchor-"+key});
    marker.append(svg("circle",{r:2.6,fill:color,stroke:"#211939","stroke-width":1}));
    const label=svg("text",{x:4,y:-3,"font-size":6,fill:color,stroke:"#16122d",
      "stroke-width":1.3,"paint-order":"stroke"});
    label.textContent=key;
    marker.append(label);
    points.append(marker);
  }
  root.append(points);
  const bones=svg("g",{class:"pixel-debug-skeleton",display:"none"});
  for (const key of ["shoulder_to_grip","hip_to_pedal_front","hip_to_pedal_back"]) {
    bones.append(svg("line",{class:"pixel-bone-"+key,stroke:"#56dbff",
      "stroke-width":1.4,"stroke-dasharray":"3 2"}));
  }
  root.append(bones);
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

export function resolveEmotion(state, flags = {}) {
  if (flags.tired || state === "tired" || state === "bike_brake") return "tired";
  if (flags.celebrating || flags.waving || state === "happy") return "happy";
  if (flags.fast || state === "focused") return "focused";
  return "neutral";
}

export function resolveBikeContactPose(rig) {
  const bike=rig.vehicles.bike;
  return {
    seat:[...bike.anchors.seat],handle:[...bike.anchors.handle],
    pedal:[...bike.anchors.pedal],
    offset:[bike.anchors.seat[0]-bike.pose.hip_reference[0],
            bike.anchors.seat[1]-bike.pose.hip_reference[1]],
    hipReference:[...bike.pose.hip_reference],
    frontGrip:[...bike.pose.grip_front],backGrip:[...bike.pose.grip_back]
  };
}

export function pedalTargets(rig, angle) {
  const {center, radius} = rig.vehicles.bike.crank;
  return {
    front: [center[0] + radius[0] * Math.cos(angle), center[1] + radius[1] * Math.sin(angle)],
    back: [center[0] - radius[0] * Math.cos(angle), center[1] - radius[1] * Math.sin(angle)]
  };
}

export function walkPose(rig, frame) {
  const rows = rig.gait.walk;
  return rows[((Math.floor(frame) % rows.length) + rows.length) % rows.length];
}

export function advanceWheel(angleDegrees, speedDegreesPerSecond, elapsedMs) {
  return (angleDegrees + speedDegreesPerSecond * Math.max(0, elapsedMs) / 1000) % 360;
}

function updateHead(entry, state, flags) {
  const expression = resolveEmotion(state, flags);
  if (entry.lastExpression === expression) return;
  const image = entry.art.querySelector(".sprite-head image");
  const source = entry.headOverride
    ? (entry.headOverride[expression] || entry.headOverride.neutral)
    : (entry.preset.expressions?.[expression] || entry.preset.slots.head);
  image?.setAttribute("href", source);
  entry.lastExpression = expression;
}

function poseLeg(part, geometry, worldTarget, coreOffset) {
  const anchor = geometry.foot_anchor;
  const foot=[geometry.x+anchor[0],geometry.y+anchor[1]];
  transform(part,worldTarget[0]-coreOffset[0]-foot[0],
    worldTarget[1]-coreOffset[1]-foot[1],0,...geometry.pivot);
}

function poseBikeArm(art,rig,side,coreOffset) {
  const g=rig.limbs["arm_"+side],p=rig.vehicles.bike.pose;
  const target=side==="front"?p.grip_front:p.grip_back;
  const shoulder=side==="front"?p.shoulder_front:p.shoulder_back;
  const tip=side==="front"?p.hand_front_anchor:p.hand_back_anchor;
  const local=[target[0]-coreOffset[0],target[1]-coreOffset[1]];
  transform(art.querySelector(".sprite-arm_"+side),
    local[0]-g.x-tip[0],local[1]-g.y-tip[1],0,...g.pivot);
  const elbow=[shoulder[0]+(local[0]-shoulder[0])*.53,
    shoulder[1]+(local[1]-shoulder[1])*.2];
  const d=`M${shoulder[0]} ${shoulder[1]} Q${elbow[0].toFixed(1)} ${elbow[1].toFixed(1)} ${local[0].toFixed(1)} ${local[1].toFixed(1)}`;
  const link=art.querySelector(".pixel-arm-link-"+side);
  link.setAttribute("display","");
  link.querySelectorAll("path").forEach(path=>path.setAttribute("d",d));
}

function renderDebug(art, data) {
  const anchors=art.querySelector(".pixel-debug-anchors");
  if(anchors.getAttribute("display")!=="none"){
    for(const [key,point] of Object.entries(data.points)){
      const marker=art.querySelector(".pixel-anchor-"+key);
      if(marker&&point)marker.setAttribute("transform",`translate(${point[0].toFixed(2)} ${point[1].toFixed(2)})`);
    }
  }
  if(art.querySelector(".pixel-debug-skeleton").getAttribute("display")!=="none"){
    for(const [key,pair] of Object.entries(data.bones)){
      const line=art.querySelector(".pixel-bone-"+key);
      if(!line||!pair||!pair[0]||!pair[1])continue;
      line.setAttribute("x1",pair[0][0]);line.setAttribute("y1",pair[0][1]);
      line.setAttribute("x2",pair[1][0]);line.setAttribute("y2",pair[1][1]);
    }
  }
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
  const get = (name) => art.querySelector(".sprite-" + name);
  const pivot = (name) => rig.limbs[name].pivot;
  const core = art.querySelector(".pixel-rider-core");
  const mounting = state === "bike_mount" && step === 0;
  // A single lift seats the character visually above any vehicle; its moving
  // assembly then carries rider + vehicle together (wheels still spin inside it).
  // No transport-specific seat/handle/foot coordinates are introduced.
  const riderLift = bike ? -12 : 0;
  const bob = bike && !reduced ? -0.65 * Math.abs(Math.sin(phase)) : 0;
  transform(art.querySelector(".pixel-rider-assembly"), 0, bob);
  transform(core, mounting ? -4 : 0, riderLift + (state === "tired" ? 1 : 0));
  const vehicle = art.querySelector(".pixel-vehicle");
  vehicle.style.display = bike ? "" : "none";
  art.querySelector(".pixel-bike-brake").setAttribute("opacity",
    state === "bike_brake" && !reduced ? "1" : "0");

  if (bike) {
    const moving = state === "bike_ride" && !reduced;
    const wheelTarget = reduced ? 0 : state === "bike_ride" ? 560
      : state === "bike_glide" ? 350 : state === "bike_mount" ? 55 : 0;
    const dt = Math.min(120, Math.max(0, now - (entry.lastWheelAt ?? now)));
    entry.lastWheelAt = now;
    entry.wheelSpeed += (wheelTarget - entry.wheelSpeed) * Math.min(1, dt / 220);
    entry.wheelAngle = advanceWheel(entry.wheelAngle, entry.wheelSpeed, dt);
    for (const role of ["rear", "front"]) {
      const [cx, cy] = rig.vehicles.bike.wheels[role].center;
      const wheel = art.querySelector(".pixel-wheel-" + role);
      wheel.setAttribute("transform", `rotate(${entry.wheelAngle.toFixed(1)} ${cx} ${cy})`);
    }

    // Foot endpoints trace the pedal circle 180 degrees apart. The image body
    // stays intact, moving each discrete boot sprite as a whole rather than
    // arbitrarily spinning it about the hip.
    const crankAngle = moving ? phase : state === "bike_glide" ? Math.PI / 2
      : state === "bike_brake" ? Math.PI : 0;
    const feet = pedalTargets(rig, crankAngle);
    poseLeg(get("leg_front"), rig.limbs.leg_front, feet.front, 0);
    poseLeg(get("leg_back"), rig.limbs.leg_back, feet.back, 0);
    // Hand-grips stay anchored at the handlebar for the full pedal loop.
    transform(get("arm_front"), 5, -4, -10, ...pivot("arm_front"));
    transform(get("arm_back"), 7, -4, -8, ...pivot("arm_back"));
  } else {
    entry.lastWheelAt = now; // avoid jumping wheel phase on switching back
    entry.wheelSpeed = 0;
    const pose = state === "walk" && !reduced ? walkPose(rig, step) : rig.gait.stationary;
    for (const [name, key] of [["leg_front", "front"], ["leg_back", "back"]]) {
      const [dx, dy, angle] = pose[key];
      transform(get(name), dx, dy, angle, ...pivot(name));
    }
    const stride = state === "walk" && !reduced ? Math.sin(phase) : 0;
    transform(get("arm_front"), 2 * stride, -2 * stride,
      state === "happy" ? -36 : -6 * stride, ...pivot("arm_front"));
    transform(get("arm_back"), -2 * stride, 2 * stride, 6 * stride,
      ...pivot("arm_back"));
  }
  updateHead(entry, state, flags);
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
    state: null, stateStarted: performance.now(), lastExpression: null,
    wheelAngle: 0, wheelSpeed: 0, lastWheelAt: performance.now(),
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
  const allowed = (path) =>
    /^\/riders\/presets\/[a-z0-9-]+\/[a-z0-9_-]+\.webp$/.test(path || "");
  let changed = false;
  for (const name of ["head", "body", "backpack"]) {
    const override = overrides[name];
    if (!override) continue;
    if (name === "head") {
      // A new head may supply a complete emotional set or just one static head.
      // A single-asset override stays selected through future state transitions.
      const choices = typeof override === "string"
        ? { neutral: override }
        : override.expressions || (override.src ? { neutral: override.src } : override);
      const entries = Object.entries(choices);
      if (!entries.length || !entries.every(([emotion, src]) =>
        ["neutral", "happy", "focused", "tired"].includes(emotion) && allowed(src)
      ) || !allowed(choices.neutral)) continue;
      entry.headOverride = choices;
      entry.lastExpression = null;
      updateHead(entry, entry.state || "idle", flagsFor(entry.node));
      changed = true;
      continue;
    }
    const src = typeof override === "string" ? override : override.src;
    if (!allowed(src)) continue;
    const image = entry.art.querySelector(`[data-part="${name}"] image`);
    if (!image) continue;
    image.setAttribute("href", src);
    changed = true;
  }
  return changed;
}

export function disposeRiderSprite(node) {
  mounted.delete(node);
  node.querySelector(".pixel-rider-art")?.remove();
  node.classList.remove("has-pixel-rider");
}
