/**
 * Shape of the Gradient Floor: a blurred colour gradient that glows up from the bottom edge. Its top contour has
 * five moving heights that rise and fall as sine waves with one period (`speed` seconds), each with its own centre,
 * amplitude and phase. All numbers were measured on the public preview (docs/research/gradient-floor/README.md): the
 * path data was sampled for 9 s and fitted (rms error 1-1.5 units on a 1500-unit drawing, 0.1 against the first frame).
 */

export type FloorColors = readonly [string, string, string];

/** Gradient from the crest down. */
export const defaultColors: FloorColors = ["#FF7700", "#FF0055", "#0073FF"];
export const defaultSpeed = 3;

/** Drawing units: 2200 units span the width of the container, so the floor scales with it. */
export const unitsAcrossContainer = 2200;

type Wave = { center: number; amplitude: number; phase: number };
const waves = {
  /** Plateau at the left of the contour (also its first and last point). */
  rim: { center: 565.7, amplitude: 80, phase: 0.532 },
  /** Left edge (where the contour climbs from the plateau). */
  left: { center: 297.3, amplitude: 110, phase: -1.289 },
  /** Right edge. */
  right: { center: 361.2, amplitude: 110, phase: -0.289 },
  /** Low plateau near the right. */
  shelf: { center: 565.9, amplitude: 80, phase: -2.109 },
  /** Middle plateau. */
  mid: { center: 428.9, amplitude: 110, phase: 2.353 },
} as const satisfies Record<string, Wave>;

/** The preview's first frame is this far into the cycle (seconds of a 3 s loop), so time 0 reproduces it. */
const startOffset = 1.5895;

/**
 * With reduced motion, or speed 0, the preview holds one still pose: this many seconds into the loop counted from the
 * server-rendered first frame (the heights 643.3 / 297.3 / 453.9 / 507.3 / 376.1 measured on the preview).
 */
export const stillSeconds = 1.276;

export type FloorHeights = { [K in keyof typeof waves]: number };

/** Heights of the contour `seconds` after the floor started, in a loop of `speed` seconds. speed 0 keeps the first frame. */
export function floorHeights(seconds: number, speed: number = defaultSpeed): FloorHeights {
  const turns = speed > 0 ? ((seconds / speed) * 2 * Math.PI) : 0;
  const base = (startOffset / defaultSpeed) * 2 * Math.PI;
  const at = ({ center, amplitude, phase }: Wave) => center + amplitude * Math.cos(turns + base + phase);
  return { rim: at(waves.rim), left: at(waves.left), right: at(waves.right), shelf: at(waves.shelf), mid: at(waves.mid) };
}

/** The colour layer is drawn on a 3447.1 x 1514.1 canvas, the light layer is the same shape at this scale. */
export const colorCanvas = { width: 3447.1, height: 1514.1 } as const;
export const lightCanvas = { width: 2904.96, height: 1275.97 } as const;
export const lightScale = lightCanvas.width / colorCanvas.width;

const f = (n: number) => (Math.round(n * 10) / 10).toString();

/** Closed path of the floor's top contour; `scale` shrinks it for the light layer. */
export function floorPath(h: FloorHeights, scale = 1): string {
  const p = (n: number) => f(n * scale);
  return `M${p(926.8)} ${p(h.rim)}C${p(926.8)} ${p(h.rim)} ${p(302.1)} ${p(h.left)} ${p(291.3)} ${p(h.left - 6)}`
    + `V${p(1222.8)}H${p(3155.8)}V${p(h.right)}L${p(2493.8)} ${p(h.shelf)}H${p(2189.3)}V${p(h.shelf)}`
    + `L${p(1898.8)} ${p(h.mid)}H${p(1510.8)}V${p(h.mid)}L${p(1230.8)} ${p(h.rim)}H${p(926.8)}V${p(h.rim)}Z`;
}

/** Vertical gradient of the colour layer, in drawing units, with the stop positions measured on the preview. */
export const gradientLine = { x: 1723.8, y1: 423.3, y2: 894.3 } as const;
export const gradientStops = [0, 0.302885, 0.673077] as const;
