/**
 * Numbers measured from the public "Activity terrain" preview (https://uiarc.dev/components/blocks/activity-terrain): the polygons its canvas draws
 * in every frame, recorded in a real browser and fitted. Nothing here comes from UIArc's registry, API or Pro source. Evidence and the fits:
 * docs/research/uiarc-terrain/README.md and scripts/forensics/uiarc-terrain-*.mjs.
 */

export const HOURS = 24;
export const DAYS = 7;
export const CELLS = HOURS * DAYS;

/** World units: one grid cell is 1 x 1. Hours run along X, days along Z (Monday at -Z), Y is up. */
export const CELL_SIZE = 0.8;
export const HALF = CELL_SIZE / 2;
/** The platform extends 0.29 of a cell past the grid on every side. */
export const MARGIN = 0.29;
export const PLATFORM_HALF_W = HOURS / 2 + MARGIN;
export const PLATFORM_HALF_D = DAYS / 2 + MARGIN;
/** The busiest hour of a metric is always this tall; every other column is value / max of this height. */
export const MAX_HEIGHT = 5.377;

/** Camera: a pinhole orbiting its pivot at a fixed distance, in grid units. Angles in degrees. */
export const DIST = 41.985;
export const REST_YAW = -32.008;
export const REST_YAW_COMPACT = -50.032;
export const REST_PITCH = 31.0193;
export const INTRO_YAW = -5.992;
export const INTRO_PITCH = 76.7;
/** Pitch the user can reach by dragging or keys; dragging may pass the soft limits and springs back. */
export const PITCH_MIN = 11.1428;
export const PITCH_MAX = 84.6;
export const PITCH_HARD_MIN = 2.4;
export const PITCH_HARD_MAX = 90;
/** Degrees of orbit per pixel of pointer travel. */
export const DRAG_DEGREES_PER_PX = 0.3187;
/** After release the angular velocity decays exponentially at this rate (per second). */
export const MOMENTUM_DECAY = 3.2;
export const KEY_ORBIT_YAW = 15;
export const KEY_ORBIT_PITCH = 7.84;
export const KEY_ZOOM = 1.25;
export const ZOOM_MIN = 0.7;
export const ZOOM_MAX = 2.8;
/** Zoom about the point where the pivot (0, ZOOM_PIVOT, 0) sits on screen, which is why panning shifts only vertically as you zoom. */
export const ZOOM_PIVOT = 0.8705;
/** Top view is a far camera looking straight down. */
export const TOP_DIST = 159.6;
/**
 * Flying to a column: the camera keeps its angles, zooms to 1.5 times the settled scale, and the column's centre line is brought to the point the
 * grid's origin sat at, 7 px lower. The pivot is the column's foot, rising by half of whatever is taller than 1.7 grid units.
 */
export const FLY_ZOOM = 1.5;
export const FLY_SHIFT_Y = 7;
export const FLY_PIVOT_FLOOR = 1.7;
export const flyPivotHeight = (height: number) => Math.max(0, (height - FLY_PIVOT_FLOOR) / 2);

/** Framing: scale and pan are a bounding-box fit of the scene at the current pitch (rest yaw). */
export const SCALE_CAP = 20.6456;
export const PAD_X_BASE = 18.6;
export const PAD_X_PER_WIDTH = 0.0464;
export const FRAME_X_OFFSET = 0.44;
/** pitch -> [sum of vertical paddings, centre offset from the canvas middle] at the measured poses (desktop canvas 623 x 292). */
export const FRAME_VERTICAL: readonly (readonly [number, number, number])[] = [
  [PITCH_MIN, 52.4, -4.8],
  [31.0193, 52.4, -12.05],
  [38.8629, 52.3, -13.1],
  [71.8837, 66.3, -2.33],
  [84.5823, 66.1, -1.2],
  [90, 66, 0],
];
export const FRAME_REFERENCE_HEIGHT = 291.63;

/** Springs are critically damped; value is the natural frequency omega in rad/s (stiffness = omega^2, damping = 2 omega). */
export const OMEGA = {
  /** yaw and pitch while a mode change is in flight (rest <-> top), also the progress of that flight */
  flight: 5.762,
  /** scale and pan following the framing of the current pitch */
  frame: 9,
  zoom: 11,
  /** fly in / out */
  fly: 4.5,
  flyOut: 5.75,
  /** pitch springing back inside its soft limits */
  pitchBack: 9,
  introAngle: 2.44,
  introScale: 3.05,
  /** panel following the highlighted column */
  panel: 12,
  /** column rise on load and on metric change */
  riseIntro: 6.43,
  riseMetric: 12.39,
  /** segmented thumb and other small layout springs */
  thumb: 10.7,
} as const;
/** The intro starts zoomed out and only starts zooming in after this delay (seconds). */
export const INTRO_SCALE_DELAY = 0.19;
export const INTRO_ZOOM_START = 0.8665;
/** The intro's yaw and pitch overshoot a hair: damping ratio 0.93. */
export const INTRO_ANGLE_ZETA = 0.928;
/** Column delay along the diagonal of the grid. */
export const RISE_DELAY_INTRO = 0.0345;
export const RISE_DELAY_METRIC = 0.011;

/**
 * Flights between perspective and top view. Yaw, pitch and the camera distance are a straight blend of the two poses by the flight progress p (a
 * critically damped spring); scale and pan deviate from the blend along an arc that differs by direction: flattening pulls back (scale down to 0.55 of the
 * blend), turning the terrain back up swoops in (scale up to 1.54). Knots are [p, scale ratio, pan x in px, pan y in px at the 292 px reference height].
 */
export const FLIGHT_DOWN: readonly (readonly [number, number, number, number])[] = [
  [0, 1, 0, 0],
  [0.01, 0.972, 0.16, -0.73],
  [0.02, 0.945, 0.31, -1.43],
  [0.03, 0.92, 0.46, -2.13],
  [0.04, 0.897, 0.59, -2.74],
  [0.05, 0.875, 0.72, -3.32],
  [0.06, 0.854, 0.85, -3.88],
  [0.08, 0.816, 1.07, -4.93],
  [0.1, 0.782, 1.27, -5.91],
  [0.125, 0.745, 1.48, -7.03],
  [0.15, 0.713, 1.65, -8.08],
  [0.2, 0.661, 1.87, -9.97],
  [0.25, 0.622, 1.94, -11.56],
  [0.3, 0.593, 1.89, -12.81],
  [0.35, 0.572, 1.71, -13.72],
  [0.4, 0.557, 1.43, -14.3],
  [0.45, 0.548, 1.07, -14.54],
  [0.5, 0.545, 0.65, -14.47],
  [0.55, 0.547, 0.19, -14.09],
  [0.6, 0.554, -0.3, -13.41],
  [0.65, 0.568, -0.78, -12.45],
  [0.7, 0.59, -1.24, -11.21],
  [0.75, 0.62, -1.65, -9.72],
  [0.8, 0.664, -1.95, -8],
  [0.85, 0.72, -2.11, -6.07],
  [0.9, 0.789, -2.01, -3.96],
  [0.93, 0.839, -1.76, -2.66],
  [0.95, 0.857, -1.63, -2.2],
  [0.97, 0.914, -0.978, -1.32],
  [0.98, 0.943, -0.652, -0.88],
  [0.99, 0.971, -0.326, -0.44],
  [1, 1, 0, 0],
];
export const FLIGHT_UP: readonly (readonly [number, number, number, number])[] = [
  [0, 1, 0, 0],
  [0.01, 1.097, -3.04, 1],
  [0.02, 1.168, -5, 1.8],
  [0.03, 1.225, -6.48, 2.58],
  [0.04, 1.273, -7.66, 3.35],
  [0.05, 1.313, -8.62, 4.13],
  [0.06, 1.348, -9.41, 4.91],
  [0.08, 1.402, -10.63, 6.46],
  [0.1, 1.442, -11.48, 7.99],
  [0.125, 1.478, -12.2, 9.74],
  [0.15, 1.503, -12.63, 11.22],
  [0.2, 1.533, -12.9, 13.05],
  [0.25, 1.544, -12.69, 13.7],
  [0.3, 1.542, -12.19, 13.59],
  [0.35, 1.53, -11.52, 12.99],
  [0.4, 1.509, -10.74, 12.07],
  [0.45, 1.481, -9.89, 10.96],
  [0.5, 1.448, -9.01, 9.73],
  [0.55, 1.41, -8.09, 8.46],
  [0.6, 1.368, -7.17, 7.2],
  [0.65, 1.324, -6.24, 5.97],
  [0.7, 1.277, -5.32, 4.82],
  [0.75, 1.229, -4.41, 3.74],
  [0.8, 1.182, -3.52, 2.75],
  [0.85, 1.135, -2.65, 1.86],
  [0.9, 1.089, -1.8, 1.06],
  [0.93, 1.074, -1.53, 0.83],
  [0.95, 1.074, -1.53, 0.83],
  [0.97, 1.074, -1.53, 0.83],
  [0.98, 1.074, -1.53, 0.83],
  [0.99, 1.074, -1.53, 0.83],
  [1, 1, 0, 0],
];

/** Light: brightness of each face relative to the top face (fixed light from the left-front, above). */
export const FACE_SHADE = { top: 1, south: 0.85, west: 0.87, east: 0.67, north: 0.67 } as const;

/** Where the axis labels sit, in world units. */
export const LABEL_DAY_X = -13.24;
export const LABEL_HOUR_Z = 4.58;
export const LABEL_FONT = '400 11px Inter, "Inter Fallback", sans-serif';
export const LABEL_FONT_ACTIVE = '500 11px Inter, "Inter Fallback", sans-serif';
export const PILL_HEIGHT = 20;
export const PILL_PAD = 7;

/** Hover panel. */
export const PANEL_WIDTH = 208;
export const PANEL_HEIGHT = 158.8;
export const PANEL_GAP = 22;
export const PANEL_EDGE = 8;
export const PANEL_LIFT = 71.3;
/** A column low in the plot leaves no room below its panel: it goes above the column's top instead, this far over it. */
export const PANEL_BOTTOM_ROOM = 20;
export const PANEL_ABOVE_GAP = 8.2;

export const COMPACT_WIDTH = 560;
