// Scene placement is pixel-space math, independent from the actor art runtime.
// Saved office_position values remain persistent targets; this only chooses
// temporary display X and visual scale within a visible DOM lane.
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const BASE_ACTOR_WIDTH = 166;

function desiredX(rider, width) {
  const n = Number(rider.x);
  return Number.isFinite(n) ? clamp(n, 0, 100) / 100 * width : width / 2;
}

// Positions are full-road coordinates, not the old 22%-78% office band.
// Give manual anchors first claim on space. Fill remaining legal gaps with
// automatic riders, including both road edges.
function centersForLane(people, width, scale, baseWidth, padding, gap) {
  const half = baseWidth * scale / 2;
  const lo = padding + half;
  const hi = width - padding - half;
  const order = [...people].sort((a, b) =>
    desiredX(a, width) - desiredX(b, width) || String(a.user_id).localeCompare(String(b.user_id)));
  const occupied = [];
  const result = [];
  const requiredDistance = baseWidth * scale + gap;
  const isManual = (r) => r.office_position != null && Number.isFinite(Number(r.office_position.x));
  if (!order.some(isManual)) {
    // Exact full-span distribution also avoids sample-grid rounding at 375px.
    const step = order.length > 1 ? Math.max(0, hi - lo) / (order.length - 1) : 0;
    return order.map((rider, index) => ({
      rider,
      center: order.length === 1 ? clamp(desiredX(rider, width), lo, Math.max(lo, hi)) : lo + step * index,
      crowded: order.length > 1 && step + 0.02 < requiredDistance,
    }));
  }

  for (const rider of order.filter(isManual)) {
    // Display is clamped for this viewport; the persisted anchor stays intact.
    const center = clamp(Number(rider.office_position.x) / 100 * width, lo, Math.max(lo, hi));
    const crowded = occupied.some(other => Math.abs(other.center - center) < requiredDistance);
    occupied.push({center});
    result.push({rider, center, crowded});
  }

  const automatic = order.filter(rider => !isManual(rider));
  for (const rider of automatic) {
    // Spread the cohort across the actual road. For a lone auto rider keep
    // the original preference instead of making them jump to the left edge.
    const rank = order.indexOf(rider);
    const target = order.length === 1
      ? clamp(desiredX(rider, width), lo, Math.max(lo, hi))
      : lo + (Math.max(0, hi - lo) * rank) / (order.length - 1);
    let chosen = null;
    let best = Infinity;
    // Scan full range in pixel space: gap-aware, deterministic, few riders.
    const steps = Math.max(1, Math.ceil(Math.max(0, hi - lo) / 2));
    for (let i = 0; i <= steps; i++) {
      const x = lo + (Math.max(0, hi - lo) * i) / steps;
      if (occupied.some(other => Math.abs(other.center - x) + 1e-6 < requiredDistance)) continue;
      const cost = Math.abs(x - target);
      if (cost < best) { best = cost; chosen = x; }
    }
    const center = chosen ?? clamp(target, lo, Math.max(lo, hi));
    occupied.push({center});
    result.push({rider, center, crowded: chosen === null});
  }
  return result;
}

export function planRiderPlacement(riders, layout, opts = {}) {
  if (!layout?.lanes || !Array.isArray(riders)) return null;
  const baseWidth = Number.isFinite(opts.baseActorWidth) ? opts.baseActorWidth : BASE_ACTOR_WIDTH;
  const baseScale = Number.isFinite(opts.baseScale) ? opts.baseScale : 0.90;
  const minScale = Number.isFinite(opts.minScale) ? opts.minScale : 0.54;
  const padding = Number.isFinite(opts.padding) ? opts.padding : 10;
  const gap = Number.isFinite(opts.gap) ? opts.gap : 8;
  if (baseWidth <= 0 || baseScale <= 0 || minScale <= 0) return null;
  const result = new Map();
  for (const lane of layout.lanes) {
    const width = lane.rect.width;
    if (!Number.isFinite(width) || width <= 0) return null;
    const people = riders.filter((r) => r.lane === lane.id);
    if (!people.length) continue;
    const capacity = (width - padding * 2 - gap * (people.length - 1)) / (baseWidth * people.length);
    const scale = Math.max(minScale, Math.min(baseScale, capacity));
    for (const {rider, center, crowded} of centersForLane(people,width,scale,baseWidth,padding,gap)) {
      result.set(rider.user_id, {
        lane: lane.id,
        x: Math.round(1000 * center / width) / 10,
        scale: Math.round(scale * 1000) / 1000,
        crowded,
        widthPx: baseWidth * scale,
      });
    }
  }
  return result;
}

// Check the *moving* actor rectangle against road edges and occupied rects.
// This operates in viewport pixels, not the old 7.5% lane-distance proxy.
export function canShiftRider(current, lane, shiftPx, others = [], margin = 4) {
  if (!current || !lane || !Number.isFinite(shiftPx)) return false;
  const l = current.left + shiftPx, right = current.right + shiftPx;
  if (![l,right,lane.left,lane.right].every(Number.isFinite) ||
      l < lane.left + margin || right > lane.right - margin) return false;
  return others.every(other =>
    !other || right + margin <= other.left || l >= other.right + margin);
}
