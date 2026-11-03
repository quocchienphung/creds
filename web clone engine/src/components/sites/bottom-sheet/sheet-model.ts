/**
 * Bottom sheet, the parts that are not React: detents, where the sheet rests, the backdrop, the rubber band and which detent a release ends on.
 * Numbers are measured from the public preview of UIArc's Bottom sheet (docs/research/bottom-sheet/README.md). Pure, so node can test it.
 *
 * Coordinates: `y` is the sheet's translateY in px. 0 is the tallest detent; a bigger y is lower. The sheet is `max * vh + 160px` tall and
 * anchored 160px below the viewport, so dragging it up past the tallest detent never shows a gap.
 */
export const SHEET = {
  extension: 160,
  /** The closed position is this far below the sheet's own height when it is hidden: `max * vh + 40`. */
  closedGap: 40,
  defaultDetents: [0.45, 0.92],
  radius: 34,
  /** Backdrop opacity at the smallest detent; 1 at the tallest, 0 when closed, linear in between (the kink is at the smallest detent). */
  backdropAtSmallest: 0.78,
  /** iOS-style rubber band, fitted to a 640px overshoot sweep: x = D * (1 - 1 / (c * d / D + 1)). */
  band: { c: 0.6, D: 116 },
  /** A release is projected this many seconds ahead along its velocity, then snapped to the nearest stop. */
  projection: 0.6,
  /** Pointer samples older than this are ignored when the release velocity is taken. */
  velocityWindowMs: 100,
};

/** Springs (mass 1) fitted to recorded releases, the opening motion and the dismissal. */
export const SHEET_SPRING = {
  settle: { type: "spring" as const, stiffness: 160, damping: 25, mass: 1 },
  /** The recorded opening has a 100ms stall in the middle of it (the page was busy), so it is not used for fitting: the opening uses the clean settle spring. */
  open: { type: "spring" as const, stiffness: 160, damping: 25, mass: 1 },
  dismiss: { type: "spring" as const, stiffness: 290, damping: 33.4, mass: 1 },
};

/** Sorted ascending, clamped to (0.1, 1], without repeats. An empty list falls back to the defaults. */
export function normalizeDetents(detents?: readonly number[]): number[] {
  const clean = [...new Set((detents ?? []).filter(value => Number.isFinite(value)).map(value => Math.min(1, Math.max(0.1, value))))].sort((a, b) => a - b);
  return clean.length ? clean : [...SHEET.defaultDetents];
}

export interface SheetLayout {
  /** The tallest detent, as a fraction of the viewport height. */
  max: number;
  /** `--sheet-max`: the CSS height is `max * 100dvh + extension`. */
  height: number;
  /** The rest position of each detent, in the order of the sorted detents (smallest first, so the biggest y first). */
  stops: number[];
  closedY: number;
}
export function layout(viewportHeight: number, detents: readonly number[]): SheetLayout {
  const sorted = normalizeDetents(detents), max = sorted[sorted.length - 1];
  return { max, height: max * viewportHeight + SHEET.extension, stops: sorted.map(detent => Math.round((max - detent) * viewportHeight * 100) / 100), closedY: max * viewportHeight + SHEET.closedGap };
}

/** The backdrop's opacity as a function of the sheet's position. */
export function backdropOpacity(y: number, stops: readonly number[], closedY: number): number {
  const smallest = stops.length ? Math.max(...stops) : 0;
  if (y <= 0) return 1;
  if (y >= closedY) return 0;
  if (smallest <= 0) return SHEET.backdropAtSmallest * (1 - y / closedY) + 0; // a single detent at the top
  if (y <= smallest) return 1 - (1 - SHEET.backdropAtSmallest) * (y / smallest);
  return SHEET.backdropAtSmallest * (1 - (y - smallest) / (closedY - smallest));
}

export function rubberBand(overshoot: number): number {
  if (overshoot <= 0) return 0;
  const { c, D } = SHEET.band;
  return D * (1 - 1 / (c * overshoot / D + 1));
}
/** Where the sheet is when the pointer has moved it `raw` px from `start`: 1:1, with a rubber band above the tallest detent. */
export function followPointer(start: number, delta: number): number {
  const raw = start + delta;
  return raw < 0 ? -rubberBand(-raw) : raw;
}

export type ReleaseTarget = { kind: "detent"; index: number } | { kind: "dismiss" };
/** The stop a release ends on: the position projected 0.6s along the velocity (px/s), then the nearest of the detents and the closed position. */
export function resolveRelease(y: number, velocity: number, stops: readonly number[], closedY: number, dismissible = true): ReleaseTarget {
  const projected = y + velocity * SHEET.projection;
  let best: ReleaseTarget = { kind: "detent", index: 0 }, distance = Infinity;
  stops.forEach((stop, index) => { const d = Math.abs(projected - stop); if (d < distance) { distance = d; best = { kind: "detent", index }; } });
  if (dismissible && Math.abs(projected - closedY) < distance) best = { kind: "dismiss" };
  return best;
}
/** The detent nearest to a position (for the keyboard and the live region). */
export function nearestDetent(y: number, stops: readonly number[]): number {
  let best = 0, distance = Infinity;
  stops.forEach((stop, index) => { const d = Math.abs(y - stop); if (d < distance) { distance = d; best = index; } });
  return best;
}
/** Velocity in px/s from the recent pointer samples (the last three inside the window). */
export function releaseVelocity(samples: readonly { t: number; y: number }[], now: number): number {
  const recent = samples.filter(sample => now - sample.t <= SHEET.velocityWindowMs).slice(-3);
  if (recent.length < 2) return 0;
  const first = recent[0], last = recent[recent.length - 1];
  return last.t === first.t ? 0 : (last.y - first.y) / ((last.t - first.t) / 1000);
}

/** The detent after an arrow key: one step toward the tallest (ArrowUp) or the smallest (ArrowDown); Home and End jump; Enter and Space toggle between the ends. */
export function keyboardDetent(key: string, current: number, count: number): number | null {
  const last = count - 1;
  switch (key) {
    case "ArrowUp": return Math.min(last, current + 1);
    case "ArrowDown": return Math.max(0, current - 1);
    case "Home": return last;
    case "End": return 0;
    case "Enter": case " ": return current >= last ? 0 : last;
    default: return null;
  }
}
