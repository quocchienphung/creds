import {
  DAYS, FRAME_REFERENCE_HEIGHT, FRAME_VERTICAL, FRAME_X_OFFSET, HALF, HOURS, PAD_X_BASE, PAD_X_PER_WIDTH, PLATFORM_HALF_D, PLATFORM_HALF_W,
  SCALE_CAP, ZOOM_PIVOT, COMPACT_WIDTH,
} from "./terrain-constants.ts";

export interface Size { width: number; height: number }
/**
 * Where the camera is. The camera looks at the pivot (tx, ty, tz) from `dist` grid units away; `scale` is pixels per grid unit at the pivot
 * (focal length = scale * dist) and (ox, oy) is where the pivot lands on the canvas, measured from its middle. Angles are degrees.
 */
export interface Pose { yaw: number; pitch: number; dist: number; scale: number; ox: number; oy: number; tx: number; ty: number; tz: number }
export interface Frame { scale: number; ox: number; oy: number }
export interface Bounds { x0: number; y0: number; x1: number; y1: number }

const RAD = Math.PI / 180;
export const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** A pose prepared for projecting many points. */
export interface View {
  cx: number; cy: number; focal: number;
  eye: readonly [number, number, number];
  right: readonly [number, number, number]; up: readonly [number, number, number]; forward: readonly [number, number, number];
}

export function makeView(pose: Pose, size: Size): View {
  const yaw = pose.yaw * RAD, pitch = pose.pitch * RAD;
  const cp = Math.cos(pitch), sp = Math.sin(pitch), cy = Math.cos(yaw), sy = Math.sin(yaw);
  return {
    cx: size.width / 2 + pose.ox, cy: size.height / 2 + pose.oy, focal: pose.scale * pose.dist,
    eye: [pose.tx + pose.dist * cp * sy, pose.ty + pose.dist * sp, pose.tz + pose.dist * cp * cy],
    forward: [-cp * sy, -sp, -cp * cy],
    right: [cy, 0, -sy],
    up: [-sp * sy, cp, -sp * cy],
  };
}

/** Screen position of a world point; `depth` is its distance along the view direction. */
export function projectPoint(view: View, x: number, y: number, z: number, out: { x: number; y: number; depth: number }) {
  const qx = x - view.eye[0], qy = y - view.eye[1], qz = z - view.eye[2];
  const depth = qx * view.forward[0] + qy * view.forward[1] + qz * view.forward[2];
  const k = view.focal / depth;
  out.x = view.cx + k * (qx * view.right[0] + qy * view.right[1] + qz * view.right[2]);
  out.y = view.cy - k * (qx * view.up[0] + qy * view.up[1] + qz * view.up[2]);
  out.depth = depth;
  return out;
}

/** The grid cell centre of hour `i` (0..23) and day `j` (0..6), in world X and Z. */
export const cellX = (i: number) => i + 0.5 - HOURS / 2;
export const cellZ = (j: number) => j + 0.5 - DAYS / 2;

/** Bounding box, at one pixel per grid unit and no pan, of the platform and the top of every column. */
export function sceneBounds(yaw: number, pitch: number, dist: number, heights: ArrayLike<number>): Bounds {
  const view = makeView({ yaw, pitch, dist, scale: 1, ox: 0, oy: 0, tx: 0, ty: 0, tz: 0 }, { width: 0, height: 0 });
  const p = { x: 0, y: 0, depth: 0 };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x: number, y: number, z: number) => { projectPoint(view, x, y, z, p); x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); };
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) add(sx * PLATFORM_HALF_W, 0, sz * PLATFORM_HALF_D);
  for (let j = 0; j < DAYS; j++) for (let i = 0; i < HOURS; i++) {
    const h = heights[j * HOURS + i] ?? 0;
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) add(cellX(i) + sx * HALF, h, cellZ(j) + sz * HALF);
  }
  return { x0, y0, x1, y1 };
}

const padX = (width: number) => PAD_X_BASE + PAD_X_PER_WIDTH * width;
function vertical(pitch: number, height: number): readonly [number, number] {
  // the measured paddings are for the 292 px reference canvas; the bottom one grows by 0.0764 px per extra px of height, the top one stays put
  const extra = height - FRAME_REFERENCE_HEIGHT, table = FRAME_VERTICAL;
  const at = (sum: number, centre: number): readonly [number, number] => [sum + 0.0764 * extra, centre - 0.0382 * extra];
  if (pitch <= table[0][0]) return at(table[0][1], table[0][2]);
  for (let n = 1; n < table.length; n++) {
    if (pitch <= table[n][0]) {
      const a = table[n - 1], b = table[n], t = (pitch - a[0]) / (b[0] - a[0]);
      return at(lerp(a[1], b[1], t), lerp(a[2], b[2], t));
    }
  }
  const last = table[table.length - 1];
  return at(last[1], last[2]);
}
export const restYaw = (width: number, rest: number, compact: number) => (width < COMPACT_WIDTH ? compact : rest);

/**
 * Scale and pan of the settled view: the bounding box of the scene at this pitch (seen from the rest yaw) is fitted into the canvas and centred, with
 * a cap on how large it grows. The vertical padding and the centring depend on the pitch (measured), so tilting never makes the scene jump out.
 */
export function framePerspective(pitch: number, yaw: number, dist: number, heights: ArrayLike<number>, size: Size): Frame {
  const bounds = sceneBounds(yaw, pitch, dist, heights);
  const bw = bounds.x1 - bounds.x0, bh = bounds.y1 - bounds.y0;
  const [padSum, centre] = vertical(pitch, size.height);
  const scale = Math.min(SCALE_CAP * size.height / FRAME_REFERENCE_HEIGHT, (size.width - 2 * padX(size.width)) / bw, (size.height - padSum) / bh);
  const xOffset = FRAME_X_OFFSET + Math.max(0, COMPACT_WIDTH - size.width) * 0.0078;
  // on a phone the width, not the height, limits the scene, and the measured placement sits 4 px lower than the rule above
  const lowered = size.width < COMPACT_WIDTH ? 4.15 : 0;
  return { scale, ox: xOffset - (bounds.x0 + bounds.x1) / 2 * scale, oy: centre + lowered - (bounds.y0 + bounds.y1) / 2 * scale };
}

/** The flat heatmap: the platform seen from above fills the width. */
export function frameTop(size: Size): Frame {
  const scale = (size.width - 2 * padX(size.width)) / (2 * PLATFORM_HALF_W);
  return { scale, ox: -0.095, oy: -0.185 };
}

/** Zoom by `factor` about the screen point where the pivot (0, ZOOM_PIVOT, 0) lies; the view stays put at that point. */
export function zoomFrame(frame: Frame, pitch: number, factor: number): Frame {
  const lift = ZOOM_PIVOT * Math.cos(pitch * RAD) * frame.scale;
  return { scale: frame.scale * factor, ox: frame.ox, oy: frame.oy + (factor - 1) * lift };
}

/** The point of the canvas, from its middle, that stays fixed while zooming (and where a flown-to column is centred). */
export function zoomAnchor(frame: Frame, pitch: number) {
  return { x: frame.ox, y: frame.oy - ZOOM_PIVOT * Math.cos(pitch * RAD) * frame.scale };
}

/** Damped spring (critically damped unless `zeta` says otherwise), advanced exactly for any step. */
export class Spring {
  value: number; velocity = 0; target: number; omega: number; zeta = 1;
  constructor(value: number, omega: number, zeta = 1) { this.value = value; this.target = value; this.omega = omega; this.zeta = zeta; }
  step(dt: number, omega = this.omega, zeta = this.zeta) {
    const dx = this.value - this.target;
    if (zeta >= 0.9999) {
      const e = Math.exp(-omega * dt), j = this.velocity + omega * dx;
      this.value = this.target + (dx + j * dt) * e;
      this.velocity = (this.velocity - j * omega * dt) * e;
      return;
    }
    const wd = omega * Math.sqrt(1 - zeta * zeta), e = Math.exp(-zeta * omega * dt), c = Math.cos(wd * dt), s = Math.sin(wd * dt);
    const b = (this.velocity + zeta * omega * dx) / wd;
    this.value = this.target + e * (dx * c + b * s);
    this.velocity = e * (this.velocity * c - (dx * omega * omega + zeta * omega * this.velocity) / wd * s);
  }
  /** At rest to within `eps` (in the spring's own unit) and no longer moving. */
  rests(eps = 0.01) { return Math.abs(this.value - this.target) < eps && Math.abs(this.velocity) < eps * 4; }
  get settled() { return this.rests(); }
  snap(value = this.target) { this.value = value; this.target = value; this.velocity = 0; }
}
