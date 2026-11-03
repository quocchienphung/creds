/** Pixels the pointer must travel before a press becomes an orbit drag (until then it is still a click). */
export const DRAG_THRESHOLD = 6;
const VELOCITY_WINDOW = 150;

export interface DragMove { dx: number; dy: number; began: boolean }
export interface DragEnd { moved: boolean; vx: number; vy: number }

/**
 * Turns pointer events into a drag: small movements stay a click; once the pointer has travelled DRAG_THRESHOLD pixels the drag begins from where it
 * stands, and each further move reports how far it travelled. On release, the velocity over the last 150 ms (px/s) drives the momentum.
 */
export class DragGesture {
  active = false; moved = false;
  private startX = 0; private startY = 0; private lastX = 0; private lastY = 0;
  private samples: { t: number; x: number; y: number }[] = [];

  down(x: number, y: number, t: number) { this.active = true; this.moved = false; this.startX = this.lastX = x; this.startY = this.lastY = y; this.samples = [{ t, x, y }]; }

  move(x: number, y: number, t: number): DragMove | null {
    if (!this.active) return null;
    this.samples.push({ t, x, y });
    while (this.samples.length > 2 && t - this.samples[0].t > VELOCITY_WINDOW * 2) this.samples.shift();
    if (!this.moved) {
      if (Math.hypot(x - this.startX, y - this.startY) <= DRAG_THRESHOLD) return null;
      this.moved = true; this.lastX = x; this.lastY = y;
      return { dx: 0, dy: 0, began: true };
    }
    const move = { dx: x - this.lastX, dy: y - this.lastY, began: false };
    this.lastX = x; this.lastY = y;
    return move;
  }

  up(t: number): DragEnd | null {
    if (!this.active) return null;
    this.active = false;
    const recent = this.samples.filter(sample => sample.t >= t - VELOCITY_WINDOW), first = recent[0], last = recent[recent.length - 1];
    const seconds = first && last && last.t > first.t ? (last.t - first.t) / 1000 : 0;
    return { moved: this.moved, vx: seconds ? (last.x - first.x) / seconds : 0, vy: seconds ? (last.y - first.y) / seconds : 0 };
  }
  cancel() { this.active = false; this.moved = false; this.samples = []; }
}
