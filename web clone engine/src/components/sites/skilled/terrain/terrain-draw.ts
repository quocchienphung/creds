import {
  CELLS, HALF, HOURS, LABEL_DAY_X, LABEL_FONT, LABEL_FONT_ACTIVE, LABEL_HOUR_Z, PILL_HEIGHT, PILL_PAD, PLATFORM_HALF_D, PLATFORM_HALF_W,
} from "./terrain-constants.ts";
import { parseRgb, rgb, rgbFaded, shadesFor, topColor, type FaceShades, type Tone } from "./terrain-colors.ts";
import { cellX, cellZ, makeView, projectPoint, type Pose, type Size } from "./terrain-math.ts";

/** The slice of CanvasRenderingContext2D the terrain uses, so it can run against a recording stand-in in tests. */
export interface Paint {
  fillStyle: string | CanvasGradient | CanvasPattern; strokeStyle: string | CanvasGradient | CanvasPattern; lineWidth: number; lineJoin: CanvasLineJoin;
  font: string; textAlign: CanvasTextAlign; textBaseline: CanvasTextBaseline; globalAlpha: number;
  beginPath(): void; moveTo(x: number, y: number): void; lineTo(x: number, y: number): void; closePath(): void; fill(): void; stroke(): void;
  clearRect(x: number, y: number, w: number, h: number): void; fillText(text: string, x: number, y: number): void; setLineDash(segments: number[]): void;
  roundRect(x: number, y: number, w: number, h: number, r: number): void; measureText(text: string): { width: number };
}

export interface TerrainTheme {
  dark: boolean;
  /** platform fill and label text, as css colours */
  platform: string; label: string;
  /** the ink of guide lines, bands and the highlighted label pill; `surface` is the text colour on that pill */
  ink: readonly [number, number, number]; surface: string;
  font: string; fontActive: string;
}
export const lightTheme: TerrainTheme = { dark: false, platform: "rgb(249 249 249)", label: "rgb(125 125 125)", ink: [11, 11, 11], surface: "rgb(255 255 255)", font: LABEL_FONT, fontActive: LABEL_FONT_ACTIVE };
export const darkTheme: TerrainTheme = { dark: true, platform: "rgb(33 33 33)", label: "rgb(140 140 140)", ink: [244, 244, 244], surface: "rgb(33 33 33)", font: LABEL_FONT, fontActive: LABEL_FONT_ACTIVE };

export interface DrawParams {
  /** UI labels only; the operation data and chart geometry are unchanged. */
  localize?: (text: string) => string;
  pose: Pose; size: Size; theme: TerrainTheme; tone: Tone;
  /** displayed column heights in world units, and each column's share of the busiest hour (colour) */
  heights: ArrayLike<number>; shares: ArrayLike<number>;
  highlight: number | null;
  /** 0 perspective .. 1 top view, as flown */
  flight: number;
  compact: boolean;
  /** A focused group of hours (the split bar's highlighted part): columns whose `mask` entry is 0 recede `amount` (0..1) of the way to the platform colour. */
  dim?: { mask: ArrayLike<number>; amount: number } | null;
}

/** What the last draw put on screen: used to find the column under the pointer and to place the panel. */
export interface Scene {
  /** column indices, far to near */
  order: number[];
  /** per column, up to three screen quads (top, then the visible sides) of 8 numbers; `quads[k]` counts how many are filled */
  quads: Float32Array; quadCount: Uint8Array; depth: Float32Array;
  highlight: { index: number; x: number; y: number; top: number; bottom: number } | null;
}
export const createScene = (): Scene => ({ order: [], quads: new Float32Array(CELLS * 3 * 8), quadCount: new Uint8Array(CELLS), depth: new Float32Array(CELLS), highlight: null });

const P = { x: 0, y: 0, depth: 0 };

export const timeLabel = (hour: number, compact: boolean) => (compact ? String(hour).padStart(2, "0") : `${String(hour).padStart(2, "0")}:00`);
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Which axis labels there is room for: every third day at rest, every second when zoomed, all of them in the flat view; hours every third. */
export function labelSteps(scale: number, flight: number, compact: boolean) {
  if (compact) return { days: [0, 6], hours: [0, 6, 12, 18] };
  const days = flight > 0.5 || scale >= 30 ? [0, 1, 2, 3, 4, 5, 6] : scale >= 22 ? [0, 2, 4, 6] : [0, 3, 6];
  return { days, hours: [0, 3, 6, 9, 12, 15, 18, 21] };
}

export function drawTerrain(ctx: Paint, params: DrawParams, scene: Scene) {
  const { pose, size, theme, heights, shares, highlight, flight, compact } = params;
  const view = makeView(pose, size), shades: FaceShades = shadesFor(theme.dark);
  ctx.clearRect(0, 0, size.width, size.height);
  ctx.lineJoin = "round"; ctx.globalAlpha = 1;
  const ink = (alpha: number) => `rgb(${theme.ink[0]} ${theme.ink[1]} ${theme.ink[2]} / ${alpha})`;
  const poly = (points: ArrayLike<number>, n = 4) => { ctx.beginPath(); ctx.moveTo(points[0], points[1]); for (let i = 1; i < n; i++) ctx.lineTo(points[2 * i], points[2 * i + 1]); ctx.closePath(); };

  // platform
  const ground: number[] = [];
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) { projectPoint(view, sx * PLATFORM_HALF_W, 0, sz * PLATFORM_HALF_D, P); ground.push(P.x, P.y); }
  ctx.fillStyle = theme.platform; poly(ground); ctx.fill();

  const cell = highlight !== null && highlight >= 0 && highlight < CELLS ? { i: highlight % HOURS, j: Math.floor(highlight / HOURS) } : null;
  const guideX = -(PLATFORM_HALF_W + 0.249), guideZ = PLATFORM_HALF_D + 0.27;
  const strip = (x0: number, z0: number, x1: number, z1: number) => {
    const q: number[] = [];
    for (const [x, z] of [[x0, z0], [x1, z0], [x1, z1], [x0, z1]] as const) { projectPoint(view, x, 0, z, P); q.push(P.x, P.y); }
    ctx.fillStyle = ink(0.05); poly(q); ctx.fill();
  };
  if (cell) {
    const x = cellX(cell.i), z = cellZ(cell.j);
    strip(guideX, z - 0.5, x, z + 0.5);
    strip(x - 0.5, z, x + 0.5, guideZ);
  }

  // columns, far to near
  const order = scene.order; order.length = 0;
  const depth = scene.depth;
  for (let k = 0; k < CELLS; k++) { projectPoint(view, cellX(k % HOURS), 0, cellZ(Math.floor(k / HOURS)), P); depth[k] = P.depth; order.push(k); }
  order.sort((a, b) => depth[b] - depth[a]);
  const [ex, ey, ez] = view.eye;
  ctx.lineWidth = 0.6;
  const bx = new Float64Array(4), by = new Float64Array(4), tx = new Float64Array(4), ty = new Float64Array(4);
  const sideShade = [0, 0, 0];
  const dim = params.dim && params.dim.amount > 0.002 ? params.dim : null, floor = dim ? parseRgb(theme.platform) : null;
  const fillQuad = (q: ArrayLike<number>, at: number, color: string) => {
    ctx.fillStyle = color; ctx.strokeStyle = color;
    ctx.beginPath(); ctx.moveTo(q[at], q[at + 1]); ctx.lineTo(q[at + 2], q[at + 3]); ctx.lineTo(q[at + 4], q[at + 5]); ctx.lineTo(q[at + 6], q[at + 7]); ctx.closePath();
    ctx.fill(); ctx.stroke();
  };
  for (const k of order) {
    const i = k % HOURS, j = Math.floor(k / HOURS), h = Math.max(0, heights[k] ?? 0), x = cellX(i), z = cellZ(j);
    const x0 = x - HALF, x1 = x + HALF, z0 = z - HALF, z1 = z + HALF;
    // corners 0..3: (x0,z0) (x1,z0) (x1,z1) (x0,z1)
    for (let n = 0; n < 4; n++) {
      const px = n === 0 || n === 3 ? x0 : x1, pz = n < 2 ? z0 : z1;
      projectPoint(view, px, 0, pz, P); bx[n] = P.x; by[n] = P.y;
      projectPoint(view, px, h, pz, P); tx[n] = P.x; ty[n] = P.y;
    }
    const base = topColor(shares[k] ?? 0, params.tone, theme.dark);
    const out = scene.quads, o = k * 24;
    let count = 0;
    const topVisible = ey > h;
    if (topVisible) { for (let n = 0; n < 4; n++) { out[o + 2 * n] = tx[n]; out[o + 2 * n + 1] = ty[n]; } count = 1; }
    const side = (a: number, b: number, shade: number) => {
      const at = o + count * 8;
      out[at] = bx[a]; out[at + 1] = by[a]; out[at + 2] = bx[b]; out[at + 3] = by[b]; out[at + 4] = tx[b]; out[at + 5] = ty[b]; out[at + 6] = tx[a]; out[at + 7] = ty[a];
      sideShade[count] = shade; count++;
    };
    if (ex < x0) side(3, 0, shades.west); else if (ex > x1) side(1, 2, shades.east);
    if (ez > z1) side(2, 3, shades.south); else if (ez < z0) side(0, 1, shades.north);
    // the sides, then the top over them
    const faded = dim && floor && !dim.mask[k] ? dim.amount : 0;
    const paint = (shade: number) => (faded && floor ? rgbFaded(base, shade, floor, faded) : rgb(base, shade));
    for (let q = topVisible ? 1 : 0; q < count; q++) fillQuad(out, o + q * 8, paint(sideShade[q]));
    if (topVisible) fillQuad(out, o, paint(shades.top));
    scene.quadCount[k] = count;
  }

  scene.highlight = null;
  if (cell) {
    const index = highlight as number, x = cellX(cell.i), z = cellZ(cell.j), h = Math.max(0, heights[index] ?? 0);
    projectPoint(view, x, 0, z, P); const gx = P.x, gy = P.y;
    ctx.setLineDash([]); ctx.lineWidth = 1; ctx.strokeStyle = ink(0.55);
    for (const [ax, az] of [[guideX, z], [x, guideZ]] as const) { projectPoint(view, ax, 0, az, P); ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(P.x, P.y); ctx.stroke(); }
    // outline of the column's top
    const top: number[] = []; let minY = Infinity, sx = 0, sy = 0;
    for (const [px, pz] of [[x - HALF, z - HALF], [x + HALF, z - HALF], [x + HALF, z + HALF], [x - HALF, z + HALF]] as const) { projectPoint(view, px, h, pz, P); top.push(P.x, P.y); minY = Math.min(minY, P.y); sx += P.x / 4; sy += P.y / 4; }
    ctx.lineWidth = 1.25; ctx.strokeStyle = ink(0.9); poly(top); ctx.stroke();
    ctx.setLineDash([3, 3]); ctx.strokeStyle = ink(0.5); poly(top); ctx.stroke(); ctx.setLineDash([]);
    scene.highlight = { index, x: sx, y: sy, top: minY, bottom: gy };
  }

  // axis labels, with a pill behind the highlighted day and hour
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const steps = labelSteps(pose.scale, flight, compact);
  const pills: { x: number; y: number; w: number; text: string }[] = [];
  ctx.font = theme.fontActive;
  const place = (text: string, wx: number, wz: number) => { projectPoint(view, wx, 0, wz, P); return { x: P.x, y: P.y, w: ctx.measureText(text).width + 2 * PILL_PAD, text }; };
  if (cell) {
    pills.push(place(params.localize?.(DAY_NAMES[cell.j]) ?? DAY_NAMES[cell.j], LABEL_DAY_X, cellZ(cell.j)));
    pills.push(place(timeLabel(cell.i, compact), cellX(cell.i), LABEL_HOUR_Z));
  }
  ctx.font = theme.font; ctx.fillStyle = theme.label;
  const overlaps = (x: number, y: number, w: number) => pills.some(p => Math.abs(p.x - x) < (p.w + w) / 2 + 2 && Math.abs(p.y - y) < PILL_HEIGHT + 2);
  const text = (label: string, wx: number, wz: number) => {
    projectPoint(view, wx, 0, wz, P);
    if (overlaps(P.x, P.y, ctx.measureText(label).width + 2 * PILL_PAD)) return;
    ctx.fillText(label, P.x, P.y);
  };
  for (const j of steps.days) if (!(cell && cell.j === j)) text(params.localize?.(DAY_NAMES[j]) ?? DAY_NAMES[j], LABEL_DAY_X, cellZ(j));
  for (const i of steps.hours) if (!(cell && cell.i === i)) text(timeLabel(i, compact), cellX(i), LABEL_HOUR_Z);
  if (pills.length) {
    ctx.fillStyle = rgb(theme.ink);
    for (const p of pills) { ctx.beginPath(); ctx.roundRect(p.x - p.w / 2, p.y - PILL_HEIGHT / 2 - 0.5, p.w, PILL_HEIGHT, PILL_HEIGHT / 2); ctx.fill(); }
    ctx.font = theme.fontActive; ctx.fillStyle = theme.surface;
    for (const p of pills) ctx.fillText(p.text, p.x, p.y);
  }
}

function inside(q: ArrayLike<number>, o: number, x: number, y: number) {
  let hit = false;
  for (let a = 0, b = 3; a < 4; b = a++) {
    const xa = q[o + 2 * a], ya = q[o + 2 * a + 1], xb = q[o + 2 * b], yb = q[o + 2 * b + 1];
    if ((ya > y) !== (yb > y) && x < (xb - xa) * (y - ya) / (yb - ya) + xa) hit = !hit;
  }
  return hit;
}
/** The column under a point of the canvas (nearest first), or null. */
export function pick(scene: Scene, x: number, y: number): number | null {
  for (let n = scene.order.length - 1; n >= 0; n--) {
    const k = scene.order[n], count = scene.quadCount[k];
    for (let q = 0; q < count; q++) if (inside(scene.quads, k * 24 + q * 8, x, y)) return k;
  }
  return null;
}
