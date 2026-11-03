import {
  COMPACT_WIDTH, DIST, DRAG_DEGREES_PER_PX, FLIGHT_DOWN, FLIGHT_UP, FLY_SHIFT_Y, FLY_ZOOM, FRAME_REFERENCE_HEIGHT, INTRO_PITCH, INTRO_SCALE_DELAY, INTRO_YAW,
  INTRO_ANGLE_ZETA, INTRO_ZOOM_START, KEY_ORBIT_PITCH, KEY_ORBIT_YAW, MOMENTUM_DECAY, OMEGA, PITCH_HARD_MAX, PITCH_HARD_MIN, PITCH_MAX, PITCH_MIN, REST_PITCH, REST_YAW,
  REST_YAW_COMPACT, TOP_DIST, ZOOM_MAX, ZOOM_MIN,
} from "./terrain-constants.ts";
import { clamp, frameTop, framePerspective, lerp, Spring, zoomFrame, type Frame, type Pose, type Size } from "./terrain-math.ts";

export type Mode = "perspective" | "top";
/** The point to fly to: a column's foot position (x, z) and the height of the pivot above it. */
export interface FlyTarget { x: number; y: number; z: number }
/** The springs and start values that shape the motion; the defaults are the measured ones. */
export interface Tuning { introZoom: number; introDelay: number; introScaleOmega: number; introAngleOmega: number; introAngleZeta: number; frameOmega: number; flightOmega: number; flyOmega: number; flyOutOmega: number; pitchBackOmega: number; zoomOmega: number }
export const DEFAULT_TUNING: Tuning = {
  introZoom: INTRO_ZOOM_START, introDelay: INTRO_SCALE_DELAY, introScaleOmega: OMEGA.introScale, introAngleOmega: OMEGA.introAngle, introAngleZeta: INTRO_ANGLE_ZETA,
  frameOmega: OMEGA.frame, flightOmega: OMEGA.flight, flyOmega: OMEGA.fly, flyOutOmega: OMEGA.flyOut, pitchBackOmega: OMEGA.pitchBack, zoomOmega: OMEGA.zoom,
};
function arc(table: readonly (readonly [number, number, number, number])[], p: number): readonly [number, number, number] {
  const x = clamp(p, 0, 1);
  let i = 1;
  while (i < table.length - 1 && table[i][0] < x) i++;
  const a = table[i - 1], b = table[i], f = (x - a[0]) / (b[0] - a[0] || 1);
  return [lerp(a[1], b[1], f), lerp(a[2], b[2], f), lerp(a[3], b[3], f)];
}

/** Past a soft limit a drag keeps going but gets heavier, up to the hard limit; letting go springs back to the soft limit. */
function rubber(raw: number) {
  if (raw < PITCH_MIN) return PITCH_MIN - (PITCH_MIN - PITCH_HARD_MIN) * (1 - Math.exp(-(PITCH_MIN - raw) / (PITCH_MIN - PITCH_HARD_MIN)));
  return Math.min(PITCH_HARD_MAX, raw);
}

/**
 * The camera of the terrain: orbit by dragging (with momentum) or keys, zoom, fly to a column, and flatten to a top view. Pure and deterministic: feed it
 * time with `step(dt)`, read `pose`. Springs are critically damped, with the natural frequencies measured from the public preview.
 */
export class TerrainCamera {
  private yaw = new Spring(REST_YAW, OMEGA.flight);
  private pitch = new Spring(REST_PITCH, OMEGA.pitchBack);
  private scale = new Spring(18.9, OMEGA.frame);
  private ox = new Spring(0, OMEGA.frame);
  private oy = new Spring(0, OMEGA.frame);
  private px = new Spring(0, OMEGA.fly);
  private py = new Spring(0, OMEGA.fly);
  private pz = new Spring(0, OMEGA.fly);
  private flight = new Spring(0, OMEGA.flight);
  private intro = new Spring(1, OMEGA.introScale);
  private introWait = 0;
  private introAngles = false;
  private zoomTime = 0;
  private flyTime = 0;
  private heights: ArrayLike<number> = new Array<number>(168).fill(0);
  private heightsVersion = 0;
  private zoom = 1;
  private flyTarget: FlyTarget | null = null;
  private dragging = false;
  private momentum = { yaw: 0, pitch: 0 };
  private rawPitch = REST_PITCH;
  private cache: { pitch: number; key: string; frame: Frame } | null = null;
  mode: Mode = "perspective";
  reduced = false;

  size: Size;
  tuning: Tuning;
  constructor(size: Size, tuning: Partial<Tuning> = {}) { this.size = size; this.tuning = { ...DEFAULT_TUNING, ...tuning }; this.snapToRest(); }

  get restYaw() { return this.size.width < COMPACT_WIDTH ? REST_YAW_COMPACT : REST_YAW; }

  setSize(size: Size) { this.size = size; this.cache = null; }
  /** Heights the framing is fitted to: the settled heights of the shown metric (world units). */
  setHeights(heights: ArrayLike<number>) { this.heights = heights; this.heightsVersion++; this.cache = null; }

  /** The settled framing at a pitch. */
  frame(pitch: number): Frame {
    const key = `${this.size.width}x${this.size.height}:${this.heightsVersion}`;
    if (this.cache && this.cache.key === key && Math.abs(this.cache.pitch - pitch) < 1e-4) return this.cache.frame;
    const frame = framePerspective(pitch, this.restYaw, DIST, this.heights, this.size);
    this.cache = { pitch, key, frame };
    return frame;
  }

  /** Targets of scale and pan for the current pitch, zoom and fly state. */
  private targets(): Frame {
    const pitch = this.pitch.value, base = this.frame(pitch);
    let frame = zoomFrame(base, pitch, this.zoom);
    if (this.flyTarget) frame = { scale: base.scale * FLY_ZOOM * this.zoom, ox: base.ox, oy: base.oy + FLY_SHIFT_Y * this.size.height / FRAME_REFERENCE_HEIGHT };
    return { scale: frame.scale * this.intro.value, ox: frame.ox, oy: frame.oy };
  }

  snapToRest() {
    this.yaw.snap(this.restYaw); this.pitch.snap(REST_PITCH); this.rawPitch = REST_PITCH; this.intro.snap(1); this.introWait = 0;
    const t = this.targets();
    this.scale.snap(t.scale); this.ox.snap(t.ox); this.oy.snap(t.oy);
    for (const s of [this.px, this.py, this.pz]) s.snap(0);
    this.flight.snap(this.mode === "top" ? 1 : 0);
  }

  /** The first moments of the page: steep and far, then settling onto the rest pose. */
  startIntro() {
    this.yaw.snap(INTRO_YAW); this.yaw.target = this.restYaw;
    this.pitch.snap(INTRO_PITCH); this.pitch.target = REST_PITCH; this.rawPitch = INTRO_PITCH;
    this.introAngles = true;
    this.intro.snap(this.tuning.introZoom); this.intro.target = 1; this.introWait = this.tuning.introDelay;
    const t = this.targets();
    this.scale.snap(t.scale); this.ox.snap(t.ox); this.oy.snap(t.oy);
  }

  // ---- input ---------------------------------------------------------------------------------------------------------------------------

  setMode(mode: Mode) {
    if (mode === this.mode) return;
    this.mode = mode; this.flight.target = mode === "top" ? 1 : 0;
    if (mode === "top") this.flyTo(null);
  }
  flyTo(target: FlyTarget | null) {
    if (this.mode === "top" && target) return;
    this.flyTarget = target; this.flyTime = 3;
    this.px.target = target?.x ?? 0; this.py.target = target?.y ?? 0; this.pz.target = target?.z ?? 0;
  }
  get flying() { return this.flyTarget !== null; }

  dragStart() {
    if (this.mode === "top") return;
    this.dragging = true; this.momentum = { yaw: 0, pitch: 0 }; this.introAngles = false;
    this.yaw.velocity = 0; this.pitch.velocity = 0; this.rawPitch = this.pitch.value;
  }
  /** Pointer travel in CSS pixels since the previous event. Touch drags only orbit sideways. */
  dragMove(dx: number, dy: number, vertical = true) {
    if (!this.dragging) return;
    this.yaw.value -= dx * DRAG_DEGREES_PER_PX; this.yaw.target = this.yaw.value;
    if (vertical) {
      this.rawPitch = clamp(this.rawPitch + dy * DRAG_DEGREES_PER_PX, -60, PITCH_HARD_MAX + 60);
      this.pitch.value = rubber(this.rawPitch); this.pitch.target = this.pitch.value;
    }
  }
  /** Release with the pointer velocity in px/s. */
  dragEnd(vx: number, vy: number, vertical = true) {
    if (!this.dragging) return;
    this.dragging = false;
    this.momentum = { yaw: -vx * DRAG_DEGREES_PER_PX, pitch: vertical ? vy * DRAG_DEGREES_PER_PX : 0 };
    this.rawPitch = this.pitch.value;
  }
  get isDragging() { return this.dragging; }

  /** Shift + arrow keys: whole steps of yaw and pitch. */
  keyOrbit(yawSteps: number, pitchSteps: number) {
    if (this.mode === "top") return;
    this.introAngles = false;
    this.yaw.target += yawSteps * KEY_ORBIT_YAW;
    this.pitch.target = clamp(this.pitch.target + pitchSteps * KEY_ORBIT_PITCH, PITCH_MIN, PITCH_MAX);
  }
  zoomBy(factor: number) { this.zoom = clamp(this.zoom * factor, ZOOM_MIN, ZOOM_MAX); this.zoomTime = 1.5; }
  get zoomLevel() { return this.zoom; }
  resetZoom() { this.zoom = 1; }

  // ---- time ----------------------------------------------------------------------------------------------------------------------------

  step(dt: number) {
    if (!this.dragging) {
      const k = Math.exp(-MOMENTUM_DECAY * dt), m = this.momentum;
      if (Math.abs(m.yaw) > 0.05) { this.yaw.value += m.yaw * dt; this.yaw.target = this.yaw.value; this.yaw.velocity = 0; m.yaw *= k; } else m.yaw = 0;
      if (Math.abs(m.pitch) > 0.05) {
        this.pitch.value = clamp(this.pitch.value + m.pitch * dt, PITCH_HARD_MIN, PITCH_HARD_MAX); m.pitch *= k; this.pitch.velocity = 0;
        if (this.pitch.value <= PITCH_HARD_MIN || this.pitch.value >= PITCH_HARD_MAX) m.pitch = 0;
        this.pitch.target = this.pitch.value < PITCH_MIN || this.pitch.value > PITCH_MAX ? clamp(this.pitch.value, PITCH_MIN, PITCH_MAX) : this.pitch.value;
      } else { m.pitch = 0; this.pitch.target = clamp(this.pitch.target, PITCH_MIN, PITCH_MAX); }
      const intro = this.introAngles, tune = this.tuning;
      this.yaw.step(dt, intro ? tune.introAngleOmega : tune.flightOmega, intro ? tune.introAngleZeta : 1);
      this.pitch.step(dt, intro ? tune.introAngleOmega : tune.pitchBackOmega, intro ? tune.introAngleZeta : 1);
    }
    this.flight.step(dt, this.tuning.flightOmega);
    if (this.introWait > 0) this.introWait = Math.max(0, this.introWait - dt); else this.intro.step(dt, this.tuning.introScaleOmega);
    const flyOmega = this.flyTarget ? this.tuning.flyOmega : this.tuning.flyOutOmega;
    const t = this.targets(), frameOmega = this.flyTime > 0 ? flyOmega : this.zoomTime > 0 ? this.tuning.zoomOmega : this.tuning.frameOmega;
    this.zoomTime = Math.max(0, this.zoomTime - dt); this.flyTime = Math.max(0, this.flyTime - dt);
    this.scale.target = t.scale; this.ox.target = t.ox; this.oy.target = t.oy;
    this.scale.step(dt, frameOmega); this.ox.step(dt, frameOmega); this.oy.step(dt, frameOmega);
    for (const s of [this.px, this.py, this.pz]) s.step(dt, flyOmega);
    if (this.reduced) this.snap();
  }

  /** Put the camera at an exact pose (used by tests and by restoring a saved view). */
  setView(view: { yaw?: number; pitch?: number; zoom?: number }) {
    if (view.yaw !== undefined) { this.yaw.value = view.yaw; this.yaw.target = view.yaw; this.yaw.velocity = 0; }
    if (view.pitch !== undefined) { this.pitch.value = view.pitch; this.pitch.target = view.pitch; this.pitch.velocity = 0; this.rawPitch = view.pitch; }
    if (view.zoom !== undefined) this.zoom = clamp(view.zoom, ZOOM_MIN, ZOOM_MAX);
    this.introAngles = false;
    const t = this.targets();
    this.scale.snap(t.scale); this.ox.snap(t.ox); this.oy.snap(t.oy);
  }

  /** Jump to the targets (reduced motion, or a resize). */
  snap() {
    this.yaw.snap(this.yaw.target); this.pitch.snap(this.pitch.target); this.flight.snap(this.flight.target); this.intro.snap(this.intro.target);
    this.introWait = 0; this.introAngles = false; this.momentum = { yaw: 0, pitch: 0 };
    const t = this.targets();
    this.scale.snap(t.scale); this.ox.snap(t.ox); this.oy.snap(t.oy);
    for (const s of [this.px, this.py, this.pz]) s.snap(s.target);
  }

  get settled() {
    return !this.dragging && this.momentum.yaw === 0 && this.momentum.pitch === 0 && this.introWait === 0 &&
      [this.yaw, this.pitch].every(s => s.rests(0.004)) && [this.scale, this.ox, this.oy].every(s => s.rests(0.005)) && [this.px, this.py, this.pz, this.flight, this.intro].every(s => s.rests(0.0004));
  }
  /** Flight progress: 0 perspective, 1 top view. */
  get progress() { return this.flight.value; }

  get pose(): Pose {
    const p = clamp(this.flight.value, 0, 1);
    const base: Pose = { yaw: this.yaw.value, pitch: this.pitch.value, dist: DIST, scale: this.scale.value, ox: this.ox.value, oy: this.oy.value, tx: this.px.value, ty: this.py.value, tz: this.pz.value };
    if (p < 1e-6) return base;
    const top = frameTop(this.size), k = this.size.height / FRAME_REFERENCE_HEIGHT;
    const [ratio, dx, dy] = arc(this.flight.target >= 0.5 ? FLIGHT_DOWN : FLIGHT_UP, p);
    return {
      yaw: lerp(base.yaw, 0, p), pitch: lerp(base.pitch, 90, p), dist: lerp(DIST, TOP_DIST, p),
      scale: Math.exp(lerp(Math.log(base.scale), Math.log(top.scale * this.zoom), p)) * ratio,
      ox: lerp(base.ox, top.ox, p) + dx,
      oy: lerp(base.oy, top.oy, p) + dy * k,
      tx: base.tx * (1 - p), ty: base.ty * (1 - p), tz: base.tz * (1 - p),
    };
  }
}
