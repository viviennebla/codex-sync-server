// Lightweight presentation-side motion policies. Layout owns coordinates;
// this module decides only which same-road neighbors can interact and how far
// an unpersisted ambient step may go.
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function adjacentSameRoadPairs(riders) {
  if (!Array.isArray(riders)) return [];
  const ordered = riders
    .filter(rider =>
      rider && Number.isInteger(Number(rider.lane))
      && Number.isFinite(Number(rider.x))
      && rider.user_id)
    .sort((a, b) =>
      Number(a.lane) - Number(b.lane)
      || Number(a.x) - Number(b.x)
      || String(a.user_id).localeCompare(String(b.user_id)));
  const pairs = [];
  for (let index = 1; index < ordered.length; index++) {
    if (Number(ordered[index - 1].lane) === Number(ordered[index].lane)) {
      pairs.push([ordered[index - 1], ordered[index]]);
    }
  }
  // Adjacent in the current road layout, not an old hard-coded 22% radius.
  // Pair candidates are spatially ordered and never cross visible roads.
  return pairs;
}

export function nextAmbientOffset(currentPct, roadWidth, directionRoll, strengthRoll) {
  if (![currentPct, roadWidth, directionRoll, strengthRoll].every(Number.isFinite)
      || roadWidth <= 0) return null;
  // The rider wanders locally (never a race across the scene). A broad road
  // permits 16-32px changes; a narrow road automatically reduces the step.
  const radius = Math.min(48, roadWidth * .045);
  const step = Math.min(32, roadWidth * .04) * (.5 + .5 * clamp(strengthRoll, 0, 1));
  const sign = directionRoll < .5 ? -1 : 1;
  const currentPx = roadWidth * currentPct / 100;
  const nextPx = clamp(currentPx + sign * step, -radius, radius);
  return nextPx * 100 / roadWidth;
}
