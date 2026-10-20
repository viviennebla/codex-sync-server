// Layout adapter for the two existing Denglema views.
// Read the actual lane DOM rectangles: do not invent a third road or duplicate
// the background's center/cover geometry in JavaScript.
export const LAYOUT_MODE = Object.freeze({
  OFFICE: "office-four-lane",
  HALLOWEEN: "halloween-two-road",
});

const VISIBLE_IDS = Object.freeze({
  [LAYOUT_MODE.OFFICE]: Object.freeze([1, 2, 3, 4]),
  [LAYOUT_MODE.HALLOWEEN]: Object.freeze([1, 3]),
});

const clamp = (number, min, max) => Math.min(max, Math.max(min, number));

export function visibleLaneIds(mode) {
  const ids = VISIBLE_IDS[mode];
  if (!ids) throw new RangeError("Unknown rider layout: " + mode);
  return [...ids];
}

// Persisted positions are always 1..4. The Halloween scene only projects
// these onto two visible DOM lanes; it does not rewrite the saved position.
export function resolveVisualLane(mode, logicalLane) {
  visibleLaneIds(mode);
  const lane = Number(logicalLane);
  if (!Number.isInteger(lane) || lane < 1 || lane > 4) return null;
  return mode === LAYOUT_MODE.HALLOWEEN ? (lane <= 2 ? 1 : 3) : lane;
}

function rectOf(element) {
  if (!element?.getBoundingClientRect) return null;
  const r = element.getBoundingClientRect();
  if (![r.left, r.top, r.width, r.height].every(Number.isFinite)
    || r.width <= 0 || r.height <= 0) return null;
  return { left: r.left, top: r.top, right: r.left + r.width,
    bottom: r.top + r.height, width: r.width, height: r.height };
}

// A snapshot is valid for one layout/viewport. Re-read on resize and after
// DOM reflow; do not cache pixel rectangles across viewport changes.
export function readLaneLayout(stage, mode) {
  const ids = visibleLaneIds(mode);
  const stageRect = rectOf(stage);
  if (!stageRect) return null;
  const lanes = ids.map((id) => ({
    id,
    rect: rectOf(stage.querySelector?.("#lane" + id)),
  }));
  // No partial layout: falling back is safer than placing a rider into a
  // hidden/missing road.
  if (lanes.some((lane) => !lane.rect)) return null;
  return { mode, stageRect, lanes };
}

export function nearestVisibleLane(snapshot, clientY) {
  if (!snapshot || !Number.isFinite(clientY)) return null;
  let best = null;
  let distance = Infinity;
  for (const lane of snapshot.lanes) {
    const r = lane.rect;
    // On a road: distance = 0. Between roads: choose nearest road edge.
    const next = Math.max(r.top - clientY, 0, clientY - r.bottom);
    if (next < distance) {
      best = lane;
      distance = next;
    }
  }
  return best;
}

export function getFootBaseline(snapshot, visualLane, fraction = 0.8) {
  const lane = snapshot?.lanes.find((item) => item.id === visualLane);
  if (!lane || !Number.isFinite(fraction)) return null;
  // 0.8 is a default *within the DOM lane*, not a claim about source-art pixels.
  return lane.rect.top + lane.rect.height * clamp(fraction, 0, 1);
}

export function projectSavedPosition(snapshot, position, options = {}) {
  if (!snapshot || !position) return null;
  const visualLane = resolveVisualLane(snapshot.mode, position.lane);
  const percent = Number(position.x);
  if (visualLane === null || !Number.isFinite(percent)) return null;
  const y = getFootBaseline(snapshot, visualLane, options.footFraction ?? 0.8);
  if (y === null) return null;
  return {
    lane: visualLane,
    x: clamp(percent, 0, 100),
    clientX: snapshot.stageRect.left + snapshot.stageRect.width * clamp(percent, 0, 100) / 100,
    clientY: y,
  };
}

export function pointerToLayoutPosition(snapshot, pointer, options = {}) {
  if (!snapshot || !pointer) return null;
  const { clientX, clientY } = pointer;
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
  const nearest = nearestVisibleLane(snapshot, clientY);
  if (!nearest) return null;
  const minX = options.minX ?? 22;
  const maxX = options.maxX ?? 78;
  if (![minX, maxX].every(Number.isFinite) || minX < 0 || maxX > 100 || minX > maxX) {
    throw new RangeError("Invalid X limits");
  }
  const x = Math.round(clamp(
    (clientX - snapshot.stageRect.left) / snapshot.stageRect.width * 100,
    minX,
    maxX,
  ) * 10) / 10;

  // Default matches the existing PUT payload behavior: save visible lane 1/3.
  // A later explicit feature may choose to preserve logical 2/4 on same-road
  // edits; that is NOT silently enabled during this phase.
  const prior = Number(options.priorLogicalLane);
  const preserve = options.preserveLogicalLane === true
    && resolveVisualLane(snapshot.mode, prior) === nearest.id;
  return { lane: preserve ? prior : nearest.id, x };
}
