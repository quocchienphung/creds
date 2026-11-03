/**
 * The stamping scene as a function of time. Nothing here touches the screen: `poseAt` says where everything is at a moment, and the stage
 * writes that to the DOM on every frame. Because it is a pure function of time, the scene can be paused, scrubbed, played backwards (Undo)
 * and checked frame by frame.
 *
 * Units are "design pixels" of a 720 × 480 stage, measured from its centre; the stage scales them to the screen. Times are seconds.
 * The two clips were measured from a recording of the interaction (docs/research/invoice-stamp/README.md):
 *   A — from pressing "Mark as paid" to the stamp hovering over the stamped paper (the recording's 2.07 s → 4.2 s);
 *   B — from "Done" to the flat paper with its stamp (5.13 s → 6.6 s).
 */
import { PERSPECTIVE, PICK_SCALE, TOP_Z } from "./stamp-geometry.ts";

export type Ease = "linear" | "out" | "in" | "inout" | "snap" | "slam" | "smooth";
type Key = readonly [time: number, value: number, ease?: Ease];

/** Cubic-bezier easing, solved the way CSS does it. */
function bezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const x = (s: number) => ((ax * s + bx) * s + cx) * s;
  const y = (s: number) => ((ay * s + by) * s + cy) * s;
  const dx = (s: number) => (3 * ax * s + 2 * bx) * s + cx;
  return (t: number) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let s = t;
    for (let i = 0; i < 8; i += 1) { const e = x(s) - t; if (Math.abs(e) < 1e-6) return y(s); const d = dx(s); if (Math.abs(d) < 1e-6) break; s -= e / d; }
    let low = 0, high = 1; s = t;
    while (high - low > 1e-6) { const e = x(s); if (e < t) low = s; else high = s; s = (low + high) / 2; }
    return y(s);
  };
}
const curves: Record<Exclude<Ease, "smooth">, (t: number) => number> = {
  linear: t => Math.min(1, Math.max(0, t)),
  /** Quick start, long settle: things arriving. */
  out: bezier(0.22, 1, 0.36, 1),
  in: bezier(0.55, 0, 1, 0.45),
  inout: bezier(0.65, 0, 0.35, 1),
  /** A decisive move: nearly all of it in the first moments. */
  snap: bezier(0.12, 0.9, 0.2, 1),
  /** The drop onto the paper: slow to start, then all at once. */
  slam: bezier(0.6, 0, 0.9, 0.5),
};
export const ease = (name: Exclude<Ease, "smooth">, t: number) => curves[name](t);

/**
 * A value that moves between keys; the ease of a key says how the value arrives at it. Before the first key and after the last it holds still.
 * "smooth" keys are samples of a continuous movement (the recording was measured every few hundredths of a second): the value runs through
 * them as one curve, with no stop at each key, which is what a stack of eased segments would give.
 */
export function track(keys: readonly Key[]) {
  const n = keys.length, slope = (i: number) => (keys[i + 1][1] - keys[i][1]) / (keys[i + 1][0] - keys[i][0]);
  const isSmooth = (segment: number) => segment >= 1 && segment < n && keys[segment][2] === "smooth";
  // Monotone cubic tangents (no overshoot), flat where a key meets a segment that is not smooth
  const tangent = keys.map((_, i) => {
    if (i === 0 || i === n - 1 || !isSmooth(i) || !isSmooth(i + 1)) return 0;
    const before = slope(i - 1), after = slope(i);
    if (before * after <= 0) return 0;
    const h0 = keys[i][0] - keys[i - 1][0], h1 = keys[i + 1][0] - keys[i][0], w1 = 2 * h1 + h0, w2 = h1 + 2 * h0;
    return (w1 + w2) / (w1 / before + w2 / after);
  });
  return (time: number): number => {
    if (time <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < n; i += 1) {
      const [end, to, how = "out"] = keys[i], [start, from] = keys[i - 1];
      if (time > end) continue;
      const u = (time - start) / (end - start);
      if (how !== "smooth") return from + (to - from) * ease(how, u);
      const h = end - start, u2 = u * u, u3 = u2 * u;
      return (2 * u3 - 3 * u2 + 1) * from + (u3 - 2 * u2 + u) * h * tangent[i - 1] + (-2 * u3 + 3 * u2) * to + (u3 - u2) * h * tangent[i];
    }
    return keys[n - 1][1];
  };
}

export interface Pose {
  /** The picker's own controls (tabs, date line, inks, button): 1 in the picker, 0 once the stamping starts. */
  chrome: number; chromeBlur: number;
  /** 0 is the flat backdrop of the picker, 1 the grey table the paper lies on. */
  table: number;
  paper: { x: number; y: number; s: number; rx: number; opacity: number; blur: number };
  /**
   * The stamp is a solid standing in the same camera as the paper. `cx, cy, cs` place and scale it on the screen (the picker's card and the
   * paper's own zoom are free of each other at first, and the same from the moment the camera tilts); `rx` is the paper's tilt, so the stamp's
   * top face lies parallel to the paper; `lx, ly` are where the die is on the paper (from the paper's centre), `lz` its height above it, `yaw`
   * a turn about the vertical, `press` how far the handle sinks into the neck when the die is pushed on the paper.
   */
  stamp: { cx: number; cy: number; cs: number; rx: number; lx: number; ly: number; lz: number; yaw: number; press: number; visible: boolean };
  /** The impression: opacity, wet-ink blur (px), the halo of wet ink (0..1) and the little swell when the rubber presses (scale). */
  ink: { opacity: number; blur: number; halo: number; swell: number };
  toast: number;
  final: number;
}

/** Seconds from pressing the button until the stamp hovers over the paper and the toast is up. */
export const CLIP_A = 2.15;
/** Seconds from "Done" until the paper lies flat and the buttons are up. */
export const CLIP_B = 1.55;
/** The instants that matter in clip A, for tests and for the stage (sounds, haptics, the page's own state). */
export const BEAT = { contact: 1.28, lift: 1.4, inked: 1.41, settled: 1.75, toast: 1.93 } as const;

/** Where the paper sits when the stamp lands, and the stamp over it. Paper-plane coordinates, in the paper's own pixels. */
export const PAPER = { w: 560, h: 790 } as const;
/** The place of the impression on the paper (its centre) and its size. */
export const MARK = { x: 0.69 * PAPER.w, y: 0.84 * PAPER.h, w: 213, h: 75.3 } as const;
/** The impression's centre, from the paper's centre. */
const M = { x: MARK.x - PAPER.w / 2, y: MARK.y - PAPER.h / 2 };
/** Where the stamp hovers over the paper, from the paper's centre, and how high. */
const HOVER = { x: M.x + 20, y: M.y - 300, z: 150 };

const smooth = (t: number) => { const u = clamp(t, 0, 1); return u * u * (3 - 2 * u); };
const A = {
  chrome: track([[0, 1], [0.11, 0, "out"]]),
  chromeBlur: track([[0, 0], [0.11, 9, "out"]]),
  table: track([[0, 0], [0.1, 0], [0.5, 1, "inout"]]),
  paperOpacity: track([[0, 0], [0.05, 0], [0.13, 0.14, "smooth"], [0.2, 0.5, "smooth"], [0.26, 0.78, "smooth"], [0.34, 1, "smooth"]]),
  paperS: track([[0.05, 3.2], [0.2, 2, "smooth"], [0.26, 1.55, "smooth"], [0.33, 1.2, "smooth"], [0.4, 1.02, "smooth"], [0.46, 0.89, "smooth"], [0.53, 0.84, "smooth"], [0.6, 0.8, "smooth"], [0.66, 0.68, "smooth"], [0.73, 0.62, "smooth"], [0.8, 0.59, "smooth"], [1, 0.6, "smooth"], [1.26, 0.6, "smooth"]]),
  paperX: track([[0.05, -350], [0.2, -181, "smooth"], [0.26, -118.5, "smooth"], [0.33, -73.4, "smooth"], [0.4, -53.8, "smooth"], [0.46, -40.6, "smooth"], [0.53, -40.5, "smooth"], [0.6, -41.9, "smooth"], [0.66, -30.1, "smooth"], [0.73, -29.6, "smooth"], [0.8, -30, "smooth"], [1.26, -30, "smooth"]]),
  paperY: track([[0.05, 22], [0.2, -39.3, "smooth"], [0.26, -62, "smooth"], [0.33, -66.9, "smooth"], [0.4, -61.7, "smooth"], [0.46, -55.7, "smooth"], [0.53, -42.6, "smooth"], [0.6, -28.9, "smooth"], [0.66, -16.6, "smooth"], [0.73, -7.2, "smooth"], [0.8, -6, "smooth"], [1.26, -6, "smooth"]]),
  paperRx: track([[0, 0], [0.5, 0, "linear"], [0.53, 1, "smooth"], [0.6, 7, "smooth"], [0.66, 27, "smooth"], [0.73, 41, "smooth"], [0.8, 46, "smooth"], [1, 44.5, "smooth"], [1.26, 44, "smooth"]]),
  paperBlur: track([[0.05, 8], [0.13, 6, "smooth"], [0.2, 3.5, "smooth"], [0.26, 1.8, "smooth"], [0.34, 0.6, "smooth"], [0.4, 0, "smooth"]]),
  // Until the camera tilts the card is a picker with a life of its own on the screen, whose size and place follow the recording...
  sx: track([[0, 0], [0.2, 4, "smooth"], [0.26, 14, "smooth"], [0.33, 21, "smooth"], [0.46, 30, "smooth"], [0.66, 46, "smooth"], [0.8, 41, "smooth"], [1.4, 41, "linear"]]),
  sy: track([[0, -21], [0.13, -24, "smooth"], [0.2, -34, "smooth"], [0.26, -37, "smooth"], [0.33, -54, "smooth"], [0.46, -65, "smooth"], [0.66, -50, "smooth"], [0.8, -88, "smooth"], [1.4, -95, "linear"]]),
  ss: track([[0, 1], [0.13, 1, "smooth"], [0.2, 0.965, "smooth"], [0.26, 0.9, "smooth"], [0.33, 0.85, "smooth"], [0.46, 0.73, "smooth"], [0.66, 0.61, "smooth"], [0.8, 0.6, "smooth"], [1.4, 0.6, "linear"]]),
  // ...and from then on it is a solid in the paper's own camera, placed in the paper's units: hovering, dropping, pressing, lifting
  lx: track([[0, HOVER.x], [1.2, HOVER.x, "linear"], [1.28, M.x, "slam"], [1.4, M.x, "linear"], [1.66, HOVER.x, "out"]]),
  ly: track([[0, HOVER.y], [1.2, HOVER.y, "linear"], [1.28, M.y, "slam"], [1.4, M.y, "linear"], [1.66, HOVER.y, "out"]]),
  lz: track([[0, HOVER.z], [1.2, HOVER.z, "linear"], [1.28, 0, "slam"], [1.4, 0, "linear"], [1.66, HOVER.z, "out"]]),
  yaw: track([[0, 0], [0.8, -1.5, "smooth"], [1.2, -1.5, "linear"], [1.28, 0, "slam"], [1.4, 0, "linear"], [1.66, -1.5, "out"]]),
  press: track([[1.26, 0], [1.3, 1, "out"], [1.4, 1, "linear"], [1.46, 0, "snap"]]),
  inkOpacity: track([[1.39, 0], [1.41, 1, "linear"]]),
  inkBlur: track([[1.41, 3], [1.7, 0.3, "out"], [1.95, 0, "out"]]),
  halo: track([[1.41, 0.7], [1.9, 0, "linear"]]),
  swell: track([[1.41, 1.05], [1.55, 1, "out"]]),
  toast: track([[BEAT.toast, 0], [2.06, 1, "out"]]),
};

const B = {
  toast: track([[0, 1], [0.27, 0, "out"]]),
  lx: track([[0, HOVER.x], [0.5, HOVER.x + 30, "in"]]),
  ly: track([[0, HOVER.y], [0.5, HOVER.y - 40, "in"]]),
  lz: track([[0, HOVER.z], [0.27, HOVER.z + 5, "out"], [0.36, 270, "in"], [0.5, 640, "in"]]),
  paperRx: track([[0, 44], [0.34, 44, "linear"], [0.62, 0, "inout"]]),
  paperS: track([[0, 0.6], [0.34, 0.6, "linear"], [0.62, 0.54, "inout"], [0.78, 0.54, "linear"], [1.15, 0.5, "inout"]]),
  paperY: track([[0, -6], [0.34, -6, "linear"], [0.62, -8, "inout"], [1.15, -24, "inout"]]),
  paperX: track([[0, -30], [0.34, -30, "linear"], [0.62, 0, "inout"], [1.15, 0, "linear"]]),
  table: track([[0, 1], [0.62, 1, "linear"], [1.15, 0, "inout"]]),
  final: track([[1.1, 0], [1.45, 1, "out"]]),
};

function clamp(value: number, low: number, high: number) { return Math.min(high, Math.max(low, value)); }

/** The scene `a` seconds into clip A. */
export function poseA(time: number): Pose {
  const a = clamp(time, 0, CLIP_A);
  const paper = { x: A.paperX(a), y: A.paperY(a), s: A.paperS(a), rx: A.paperRx(a), opacity: A.paperOpacity(a), blur: A.paperBlur(a) };
  // from the picker (free on the screen) to a solid in the paper's camera, as the camera starts to tilt
  const w = smooth((a - 0.5) / 0.35), freeScale = A.ss(a) * PICK_SCALE, near = PERSPECTIVE / (PERSPECTIVE - freeScale * TOP_Z);
  return {
    chrome: A.chrome(a), chromeBlur: A.chromeBlur(a), table: A.table(a), paper,
    stamp: {
      cx: A.sx(a) / near * (1 - w) + paper.x * w, cy: A.sy(a) / near * (1 - w) + paper.y * w, cs: freeScale * (1 - w) + paper.s * w, rx: paper.rx,
      lx: A.lx(a) * w, ly: A.ly(a) * w, lz: A.lz(a) * w, yaw: A.yaw(a) * w, press: A.press(a), visible: true,
    },
    ink: { opacity: A.inkOpacity(a), blur: A.inkBlur(a), halo: A.halo(a), swell: A.swell(a) },
    toast: A.toast(a), final: 0,
  };
}

/** The scene `b` seconds into clip B, which starts from the end of clip A. */
export function poseB(time: number): Pose {
  const b = clamp(time, 0, CLIP_B);
  const paper = { x: B.paperX(b), y: B.paperY(b), s: B.paperS(b), rx: B.paperRx(b), opacity: 1, blur: 0 };
  return {
    chrome: 0, chromeBlur: 9, table: B.table(b), paper,
    stamp: { cx: paper.x, cy: paper.y, cs: paper.s, rx: paper.rx, lx: B.lx(b), ly: B.ly(b), lz: B.lz(b), yaw: -1.5, press: 0, visible: b < 0.5 },
    ink: { opacity: 1, blur: 0, halo: 0, swell: 1 }, toast: B.toast(b), final: B.final(b),
  };
}

export type Phase = "pick" | "play" | "hold" | "exit" | "final" | "rewind";
/** The scene in a phase, `time` seconds into that phase's clip. */
export function poseAt(phase: Phase, time: number): Pose {
  if (phase === "pick") return poseA(0);
  if (phase === "exit" || phase === "final") return poseB(time);
  return poseA(time);
}
/** The paper's CSS transform (the perspective is on its parent). The stamp uses the same chain with its own place and scale. */
export const paperTransform = (paper: Pose["paper"]) => `translate(${paper.x.toFixed(2)}px, ${paper.y.toFixed(2)}px) scale(${paper.s.toFixed(4)}) rotateX(${paper.rx.toFixed(3)}deg)`;
export const stampTransform = (stamp: Pose["stamp"]) => `translate(${stamp.cx.toFixed(2)}px, ${stamp.cy.toFixed(2)}px) scale(${stamp.cs.toFixed(4)}) rotateX(${stamp.rx.toFixed(3)}deg) translate3d(${stamp.lx.toFixed(2)}px, ${stamp.ly.toFixed(2)}px, ${stamp.lz.toFixed(2)}px) rotateZ(${stamp.yaw.toFixed(2)}deg)`;
