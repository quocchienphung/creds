/**
 * Pure rules of the Confirm morph: its states, the guards against accidental confirms, and a timer that can pause. No DOM, so node tests run them against
 * the numbers measured from the public UIArc preview (docs/research/uiarc-confirm-morph).
 */

export type ConfirmPhase = "idle" | "confirming" | "pending" | "done" | "error";
export interface ConfirmState { phase: ConfirmPhase; /** pending after Undo: "Restoring" instead of "Deleting" */ undoing: boolean }
export type ConfirmEvent =
  | "open" | "cancel" | "confirm" | "resolved" | "rejected" | "retry" | "undo" | "undone" | "undoFailed" | "dismiss" | "timeout";

export const initialConfirm: ConfirmState = { phase: "idle", undoing: false };

/** Press-and-hold fills in a straight line over this long (fill measured linear: full in 996 and 1001 ms, rms 0.1 to 0.3 %). */
export const HOLD_MS = 1000;
/** A press this soon after the question opens is ignored: a double click never confirms. */
export const OPEN_GUARD_MS = 280;
/** An unanswered question goes back to rest after this long (measured 6.03 s); hovering pauses it. */
export const QUESTION_TIMEOUT_MS = 6000;
/** Early release: the fill drains on a critical spring of this omega (rad/s); two recordings gave 18.5 to 21.7. */
export const DRAIN_OMEGA = 20;
/** The pill grows on a slower spring than it shrinks (two recordings each: critical omegas 12.4 / 12.9 growing, 15.6 / 16.6 shrinking, rad/s). */
export const GROW_OMEGA = 12.6;
export const SHRINK_OMEGA = 16;

const stay = (state: ConfirmState) => state;
/** What each event does in each state; anything not listed leaves the state alone. */
export function confirmReducer(state: ConfirmState, event: ConfirmEvent): ConfirmState {
  switch (state.phase) {
    case "idle": return event === "open" ? { phase: "confirming", undoing: false } : stay(state);
    case "confirming":
      if (event === "cancel" || event === "timeout") return initialConfirm;
      if (event === "confirm") return { phase: "pending", undoing: false };
      return stay(state);
    case "pending":
      if (event === "resolved") return state.undoing ? initialConfirm : { phase: "done", undoing: false };
      if (event === "rejected") return { phase: "error", undoing: false };
      if (event === "undoFailed") return { phase: "done", undoing: false };
      return stay(state);
    case "done":
      if (event === "undo") return { phase: "pending", undoing: true };
      if (event === "dismiss" || event === "timeout" || event === "cancel") return initialConfirm;
      return stay(state);
    case "error":
      if (event === "retry") return { phase: "pending", undoing: false };
      if (event === "dismiss" || event === "timeout" || event === "cancel") return initialConfirm;
      return stay(state);
  }
}

/** The first face's `n`-th part starts this long after the state changes (measured 74/108/143 ms after the click, less ~35 ms of input lag). */
export const PART_DELAY = { first: 0.05, step: 0.036 } as const;
export const partDelay = (index: number) => PART_DELAY.first + PART_DELAY.step * index;

/** May a press confirm now? Not within the guard of the question opening, and never an auto-repeated key. */
export const canConfirm = (now: number, openedAt: number, repeat = false) => !repeat && now - openedAt >= OPEN_GUARD_MS;

export interface Scheduler { set(callback: () => void, ms: number): unknown; clear(handle: unknown): void; now(): number }
export const realScheduler: Scheduler = { set: (callback, ms) => setTimeout(callback, ms), clear: handle => clearTimeout(handle as ReturnType<typeof setTimeout>), now: () => Date.now() };

/** A one-shot timer that can be paused (pointer resting on the control, tab hidden) and resumed with what was left. */
export class PausableTimer {
  private handle: unknown = null; private left: number; private startedAt = 0; private done = false;
  private readonly fire: () => void; private readonly scheduler: Scheduler;
  constructor(ms: number, fire: () => void, scheduler: Scheduler = realScheduler) { this.left = ms; this.fire = fire; this.scheduler = scheduler; }
  get remaining() { return this.handle === null ? this.left : Math.max(0, this.left - (this.scheduler.now() - this.startedAt)); }
  get running() { return this.handle !== null; }
  start() {
    if (this.done || this.handle !== null || this.left <= 0) return;
    this.startedAt = this.scheduler.now();
    this.handle = this.scheduler.set(() => { this.handle = null; this.done = true; this.left = 0; this.fire(); }, this.left);
  }
  pause() {
    if (this.handle === null) return;
    this.left = Math.max(0, this.left - (this.scheduler.now() - this.startedAt));
    this.scheduler.clear(this.handle); this.handle = null;
  }
  cancel() { if (this.handle !== null) this.scheduler.clear(this.handle); this.handle = null; this.done = true; }
}
