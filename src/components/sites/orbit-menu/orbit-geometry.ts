export interface OrbitPoint { x: number; y: number }
export interface OrbitBoundary { left: number; top: number; right: number; bottom: number }

/** Place the caption outside the fan, with clearance from both the close button and every action. */
export function orbitCaption(origin: OrbitPoint, points: readonly OrbitPoint[], boundary: OrbitBoundary, size: { width: number; height: number }, triggerSize: number, direction: number): OrbitPoint {
  const halfWidth = size.width / 2, halfHeight = size.height / 2, gap = 8;
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
  const clearance = (at: OrbitPoint, circle: OrbitPoint, radius: number) => Math.hypot(Math.max(0, Math.abs(circle.x - at.x) - halfWidth), Math.max(0, Math.abs(circle.y - at.y) - halfHeight)) - radius - gap;
  let best = { x: 0, y: 0, score: Infinity };
  for (let turn = 0; turn < 24; turn++) {
    const angle = (direction + 180 + (turn % 2 ? -1 : 1) * Math.ceil(turn / 2) * 15) * Math.PI / 180;
    const base = triggerSize / 2 + gap + Math.abs(Math.cos(angle)) * halfWidth + Math.abs(Math.sin(angle)) * halfHeight;
    for (let extra = 0; extra <= 144; extra += 24) {
      const wanted = { x: Math.cos(angle) * (base + extra), y: Math.sin(angle) * (base + extra) };
      const at = {
        x: clamp(origin.x + wanted.x, boundary.left + halfWidth, boundary.right - halfWidth) - origin.x,
        y: clamp(origin.y + wanted.y, boundary.top + halfHeight, boundary.bottom - halfHeight) - origin.y,
      };
      const overlap = [clearance(at, { x: 0, y: 0 }, triggerSize / 2), ...points.map(point => clearance(at, point, 23))].reduce((sum, value) => sum + Math.max(0, -value), 0);
      const score = (overlap > 0.01 ? 1_000_000 + overlap * 1000 : 0) + Math.ceil(turn / 2) * 15 + extra + Math.hypot(at.x - wanted.x, at.y - wanted.y);
      if (score < best.score) best = { ...at, score };
    }
  }
  return { x: best.x, y: best.y };
}

export function orbitPoints(count: number, radius = 104, spread = 150, direction = -90): OrbitPoint[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = (direction - spread / 2 + (count === 1 ? spread / 2 : index * spread / (count - 1))) * Math.PI / 180;
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  });
}

const angularDistance = (a: number, b: number) => ((a - b + 540) % 360) - 180;

/** Pie targeting follows the observed public demo: a dead zone, then angular sectors. */
export function orbitTarget(point: OrbitPoint, count: number, spread = 150, direction = -90, deadZone = 34): number {
  if (count === 0 || Math.hypot(point.x, point.y) < deadZone) return -1;
  const delta = angularDistance(Math.atan2(point.y, point.x) * 180 / Math.PI, direction);
  if (Math.abs(delta) > spread / 2 + 12) return -1;
  return count === 1 ? 0 : Math.max(0, Math.min(count - 1, Math.round((delta + spread / 2) * (count - 1) / spread)));
}

/** Keep the trigger anchored; rotate the fan, then narrow it only at a tight corner. */
export function fitOrbit(origin: OrbitPoint, count: number, boundary: OrbitBoundary, radius = 104, spread = 150, direction = -90) {
  let best = { direction, spread, radius, score: Infinity };
  for (const fan of [spread, Math.min(spread, 120), Math.min(spread, 90)]) {
    // A narrowed six-action fan needs a larger radius to keep 46px targets separate.
    const fittedRadius = count > 1 ? Math.max(radius, 50 / (2 * Math.sin(fan / (count - 1) * Math.PI / 360))) : radius;
    for (let turn = 0; turn < 24; turn++) {
      const candidateDirection = direction + (turn % 2 ? -1 : 1) * Math.ceil(turn / 2) * 15;
      const points = orbitPoints(count, fittedRadius, fan, candidateDirection);
      const overflow = points.reduce((sum, point) => sum + Math.max(0, boundary.left + 28 - origin.x - point.x) + Math.max(0, origin.x + point.x + 28 - boundary.right) + Math.max(0, boundary.top + 28 - origin.y - point.y) + Math.max(0, origin.y + point.y + 28 - boundary.bottom), 0);
      const score = overflow * 100 + (spread - fan) * 2 + Math.abs(angularDistance(candidateDirection, direction)) * 0.05;
      if (score < best.score) best = { direction: candidateDirection, spread: fan, radius: fittedRadius, score };
    }
    if (best.score < 100) break;
  }
  return { direction: best.direction, spread: best.spread, radius: best.radius };
}
