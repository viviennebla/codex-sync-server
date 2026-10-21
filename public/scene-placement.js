// Scene placement is pixel-space math, independent from the actor art runtime.
// Saved office_position values remain persistent targets; this only chooses
// temporary display X and visual scale within a visible DOM lane.
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const BASE_ACTOR_WIDTH = 166;

function desiredX(rider, width) {
  const n = Number(rider.x);
  return Number.isFinite(n) ? clamp(n, 0, 100) / 100 * width : width / 2;
}

// Distribute a whole lane as one unit. Greedy nearest-slot placement can
// strand the last rider even if all riders fit, so use constrained forward
// packing followed by one common translation.
function centersForLane(people, width, scale, baseWidth, padding, gap) {
  const half = baseWidth * scale / 2;
  const lo = Math.max(half, padding + half);
  const hi = Math.max(lo, Math.min(width - half, width - padding - half));
  const requiredStep = baseWidth * scale + gap;
  const availableStep = people.length > 1 ? (hi - lo) / (people.length - 1) : requiredStep;
  const step = Math.min(requiredStep, availableStep);
  const crowded = step + 0.001 < requiredStep;
  const order = [...people].sort((a,b) =>
    desiredX(a,width) - desiredX(b,width) || String(a.user_id).localeCompare(String(b.user_id)));
  const centers = order.map(p=>clamp(desiredX(p,width),lo,hi));
  for(let i=1;i<centers.length;i++) centers[i]=Math.max(centers[i],centers[i-1]+step);
  // A single shift preserves order and spacing. Prefer the user's saved
  // anchor where possible; do not persist our temporary adjustment.
  const shiftLow = lo-centers[0];
  const shiftHigh = hi-centers[centers.length-1];
  const manualIndex = order.findIndex(p=>p.office_position && Number.isFinite(Number(p.office_position.x)));
  const requestedShift = manualIndex >= 0
    ? desiredX(order[manualIndex],width)-centers[manualIndex]
    : order.reduce((sum,p,i)=>sum+desiredX(p,width)-centers[i],0)/order.length;
  const shift = clamp(requestedShift,shiftLow,shiftHigh);
  return order.map((p,i)=>({rider:p,center:centers[i]+shift,crowded}));
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
