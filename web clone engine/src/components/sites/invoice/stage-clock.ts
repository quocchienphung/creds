import { CLIP_A, CLIP_B, poseAt } from "./stamp-timeline.ts";
import type { Phase, Pose } from "./stamp-timeline.ts";

/** Undo runs the scene backwards at this speed. */
export const REWIND = 1.7;

export interface ClockHooks {
  /** Draw the scene at this pose. `bob` is true while the stamp hovers, so it breathes a little. */
  paint: (pose: Pose, now: number, bob: boolean) => void;
  /** The scene moved to another phase (React shows the buttons that belong to it). */
  phase: (phase: Phase) => void;
}

/**
 * Plays the stamping scene. It owns the phase and the time, runs the animation frames while something moves, and leaves the drawing to
 * `hooks.paint`. Kept out of React so it is not re-created on every render and so a test can stop it at an exact moment (`seek`).
 *
 * pick → play (clip A, ending at CLIP_A) → hold (the stamp hovers, the toast waits) → exit (clip B) → final.
 * From play or hold, Undo is `rewind`: clip A backwards, back to pick.
 */
export class StageClock {
  phase: Phase = "pick";
  private begun = 0;
  private from = 0;
  private frozen: number | null = null;
  private frame = 0;
  private readonly hooks: ClockHooks;
  constructor(hooks: ClockHooks) { this.hooks = hooks; }

  get isFrozen() { return this.frozen !== null; }
  private set(phase: Phase) { this.phase = phase; this.hooks.phase(phase); }
  private run() { cancelAnimationFrame(this.frame); this.frame = requestAnimationFrame(this.tick); }

  /** Paints the pose of a phase that does not animate (the picker, the finished scene). */
  rest(phase: "pick" | "final" = this.phase === "final" ? "final" : "pick") {
    if (this.frozen !== null) return;
    this.hooks.paint(poseAt(phase, CLIP_B), performance.now(), false);
  }
  play() { this.frozen = null; this.begun = performance.now(); this.set("play"); this.run(); }
  exit() { this.frozen = null; this.begun = performance.now(); this.set("exit"); this.run(); }
  rewind() {
    const now = performance.now();
    this.from = this.phase === "play" ? Math.min(CLIP_A, (now - this.begun) / 1000) : CLIP_A;
    this.frozen = null; this.begun = now; this.set("rewind"); this.run();
  }
  /** Straight to a phase with no movement: reduced motion, and Undo from the finished scene. */
  jump(phase: Phase) { cancelAnimationFrame(this.frame); this.frozen = null; this.set(phase); this.rest(phase === "final" ? "final" : "pick"); }
  /** Finishes the clip that is playing, now. */
  skip() {
    if (this.phase === "play") this.begun = performance.now() - CLIP_A * 1000;
    else if (this.phase === "exit") this.begun = performance.now() - CLIP_B * 1000;
  }
  /** Stops at an exact moment of a phase (`null` lets go again). */
  seek(target: { phase: Phase; time: number } | null) {
    cancelAnimationFrame(this.frame);
    if (!target) { this.frozen = null; if (this.phase !== "pick" && this.phase !== "final") this.run(); else this.rest(); return; }
    this.frozen = target.time; this.set(target.phase);
    this.hooks.paint(poseAt(target.phase, target.time), target.time * 1000, false);
  }
  dispose() { cancelAnimationFrame(this.frame); }

  private tick = (now: number) => {
    if (this.frozen !== null) return;
    let time = 0;
    if (this.phase === "play") { time = (now - this.begun) / 1000; if (time >= CLIP_A) { time = CLIP_A; this.set("hold"); } }
    else if (this.phase === "hold") time = CLIP_A;
    else if (this.phase === "exit") { time = (now - this.begun) / 1000; if (time >= CLIP_B) { time = CLIP_B; this.set("final"); } }
    else if (this.phase === "rewind") { time = this.from - ((now - this.begun) / 1000) * REWIND; if (time <= 0) { time = 0; this.set("pick"); } }
    this.hooks.paint(poseAt(this.phase === "hold" ? "hold" : this.phase, time), now, this.phase === "hold" || this.phase === "play");
    if (this.phase === "pick" || this.phase === "final") return;
    this.frame = requestAnimationFrame(this.tick);
  };
}
