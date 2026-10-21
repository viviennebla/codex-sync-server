// Scene placement is pixel-space math, independent from the actor art runtime.
// Saved office_position values remain persistent targets; this only chooses
// temporary display X and visual scale within a visible DOM lane.
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const BASE_ACTOR_WIDTH = 166;

function desiredX(rider, width) {
  const n = Number(rider.x);
  return Number.isFinite(n) ? clamp(n, 0, 100) / 100 * width : width / 2;
}

// Scan available room in small pixel increments. Manual anchors have priority;
// every automatic rider keeps its stable preferred coordinate when possible.
function nearestFreeCenter(preferred, lo, hi, half, placed, minGap) {
  if (hi < lo) return lo;
  const desired = clamp(preferred, lo, hi);
  const fits = (x) => placed.every((other) =>
    Math.abs(x - other.center) >= half + other.half + minGap);
  if (fits(desired)) return desired;
  const samples = Math.max(1, Math.ceil((hi - lo) / 3));
  let best = null;
  let bestCost = Infinity;
  for (let i = 0; i <= samples; i++) {
    const x = lo + (hi - lo) * i / samples;
    if (!fits(x)) continue;
    const cost = Math.abs(x - desired);
    if (cost < bestCost) {
      best = x;
      bestCost = cost;
    }
  }
  return best;
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
    const half = baseWidth * scale / 2;
    const lo = Math.max(half, padding + half);
    const hi = Math.min(width - half, width - padding - half);
    const placed = [];
    const order = [...people].sort((a, b) => {
      const manualA = Number.isFinite(Number(a.office_position?.x)) && a.office_position != null;
      const manualB = Number.isFinite(Number(b.office_position?.x)) && b.office_position != null;
      if (manualA !== manualB) return manualA ? -1 : 1;
      const dx = desiredX(a, width) - desiredX(b, width);
      return dx || String(a.user_id).localeCompare(String(b.user_id));
    });
    for (const rider of order) {
      const preferred = desiredX(rider, width);
      const found = nearestFreeCenter(preferred, lo, hi, half, placed, gap);
      const center = found ?? clamp(preferred, lo, Math.max(lo, hi));
      placed.push({center, half});
      result.set(rider.user_id, {
        lane: lane.id,
        x: Math.round(1000 * center / width) / 10,
        scale: Math.round(scale * 1000) / 1000,
        crowded: found === null,
        widthPx: baseWidth * scale,
      });
    }
  }
  return result;
}
