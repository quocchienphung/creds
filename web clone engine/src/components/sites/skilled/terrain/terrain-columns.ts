import { CELLS, HOURS, MAX_HEIGHT, OMEGA, RISE_DELAY_INTRO, RISE_DELAY_METRIC } from "./terrain-constants.ts";
import { Spring } from "./terrain-math.ts";

export type Rise = "intro" | "metric" | "flatten" | "unflatten";

/** Column heights: each is a critically damped spring with a start delay along the grid's diagonal, so a change travels across the terrain as a wave. */
export class Columns {
  readonly springs: Spring[] = Array.from({ length: CELLS }, () => new Spring(0, OMEGA.riseMetric));
  private wait = new Float64Array(CELLS);
  private omega: number = OMEGA.riseMetric;
  /** world heights the columns are heading for */
  readonly targets = new Float64Array(CELLS);
  /** each column's share of the busiest hour (colour) */
  readonly shares = new Float64Array(CELLS);
  readonly shown = new Float64Array(CELLS);
  private flat = false;

  get isFlat() { return this.flat; }

  /** New numbers (or the same numbers again). `rise` says how the change travels. */
  setValues(values: readonly number[], rise: Rise, flat = this.flat, instant = false) {
    const max = Math.max(...values, 0);
    this.flat = flat;
    for (let k = 0; k < CELLS; k++) {
      this.shares[k] = max > 0 ? values[k] / max : 0;
      this.targets[k] = max > 0 ? values[k] / max * MAX_HEIGHT : 0;
    }
    this.retarget(rise, instant);
  }
  /** Fold the columns flat into a heatmap, or raise them again. */
  setFlat(flat: boolean, instant = false) {
    if (flat === this.flat) return;
    this.flat = flat;
    this.retarget(flat ? "flatten" : "unflatten", instant);
  }
  private retarget(rise: Rise, instant: boolean) {
    const omega = rise === "intro" ? OMEGA.riseIntro : rise === "flatten" ? 11 : rise === "unflatten" ? 10.6 : OMEGA.riseMetric;
    this.omega = omega;
    for (let k = 0; k < CELLS; k++) {
      const i = k % HOURS, j = Math.floor(k / HOURS), spring = this.springs[k];
      spring.target = this.flat ? 0 : this.targets[k];
      spring.omega = omega;
      this.wait[k] = rise === "intro" ? RISE_DELAY_INTRO * (i + j) - 0.03 : rise === "flatten" ? 0.1 + 0.0036 * i : rise === "unflatten" ? 0.1 + 0.007 * (i + j) : RISE_DELAY_METRIC * (i + j);
      if (instant) { spring.snap(spring.target); this.wait[k] = 0; }
    }
    this.copy();
  }
  step(dt: number) {
    for (let k = 0; k < CELLS; k++) {
      let remaining = dt;
      if (this.wait[k] > 0) { const used = Math.min(this.wait[k], dt); this.wait[k] -= used; remaining = dt - used; }
      else if (this.wait[k] < 0) { remaining += -this.wait[k]; this.wait[k] = 0; }
      if (remaining > 0) this.springs[k].step(remaining, this.omega);
    }
    this.copy();
  }
  private copy() { for (let k = 0; k < CELLS; k++) this.shown[k] = this.springs[k].value; }
  get settled() { return this.springs.every((s, k) => this.wait[k] <= 0 && s.rests(0.0015)); }
  snap() { this.springs.forEach((s, k) => { s.snap(s.target); this.wait[k] = 0; }); this.copy(); }
}
