import type { ColumnState, Run } from "./speculative.ts";

/**
 * The clock of the Guess-and-check replay. Every number here was measured on the public preview of UIArc's Speculative decoding (a
 * MutationObserver and the Web Animations API on the rendered card, one recorded run per draft length: `docs/research/speculative-decoding/`):
 *
 *   - after Restart the card sits idle for ~46 ms, then a pass is: draft (columns appear 66.7 ms apart, `(columns - 1) * 66.7 + 50` ms), verify
 *     (a sweep that always takes 266.7 ms, whatever the number of columns, then 200 ms of hold), settle (183.3 ms: the accepted words and the
 *     one the target writes fly into the answer, 20 ms apart), then the next pass;
 *   - a column gets its verdict when the sweep is halfway across it;
 *   - Pause freezes the clock, Play continues with what was left.
 *
 * Pure: a snapshot is a function of the elapsed playing time, so pausing, restarting and jumping to the end (reduced motion) cost nothing, and the
 * numbers can be tested against the recording.
 */
export const TIMING = {
  idle: 46, step: 200 / 3, tail: 50, sweep: 800 / 3, hold: 200, settle: 550 / 3, fly: 20, shimmerDelay: 130, shimmerRate: 0.11, settleTau: 55,
} as const;
export const VERIFY_MS = TIMING.sweep + TIMING.hold;
export const draftMs = (columns: number) => (Math.max(1, columns) - 1) * TIMING.step + TIMING.tail;

export interface PassClock {
  /** 0-based */ index: number; columns: number;
  start: number; verifyAt: number; settleAt: number; end: number;
  /** When each column appears, and when it gets its verdict, in ms from the start of the replay. */
  appearAt: number[]; verdictAt: number[];
  /** Words that land in the answer at settleAt (accepted guesses, then the word the target wrote): their count and the first one's index in `Run.output`. */
  lands: number; firstOutput: number;
}
export interface Timeline { passes: PassClock[]; doneAt: number }

export function timelineOf(run: Run): Timeline {
  const passes: PassClock[] = [];
  let start: number = TIMING.idle, firstOutput = 0;
  for (const [index, pass] of run.passes.entries()) {
    const columns = pass.columns.length;
    const verifyAt = start + draftMs(columns), settleAt = verifyAt + VERIFY_MS, end = settleAt + TIMING.settle;
    const lands = pass.accepted + (pass.written ? 1 : 0);
    passes.push({
      index, columns, start, verifyAt, settleAt, end, lands, firstOutput,
      appearAt: pass.columns.map((_, j) => start + j * TIMING.step),
      verdictAt: pass.columns.map((_, j) => verifyAt + (j + 0.5) / columns * TIMING.sweep),
    });
    firstOutput += lands; start = end;
  }
  return { passes, doneAt: passes.length ? start : TIMING.idle };
}

export type Phase = "idle" | "draft" | "verify" | "settle" | "done";
export type StatusKind = "idle" | "draft" | "verify" | "rejected" | "accepted" | "done";
export interface Snapshot {
  phase: Phase; pass: number;
  /** Columns on screen (0 when idle or done). */
  visible: number;
  /** How far the target's sweep has gone, in columns (0 to `columns`). */
  sweep: number;
  /** Verdict per column once it is in; null while it is still being checked. */
  states: (ColumnState | null)[];
  leaving: boolean;
  /** Words of the answer that have landed so far. */
  landed: number;
  passesDone: number;
  status: StatusKind;
  /** Changes whenever something other than the sweep changes: the screen re-renders only on a new key. */
  key: string;
}

export function snapshotAt(run: Run, timeline: Timeline, t: number): Snapshot {
  const done = t >= timeline.doneAt && run.passes.length > 0;
  let landed = 0, passesDone = 0;
  for (const clock of timeline.passes) if (t >= clock.settleAt) { landed += clock.lands; passesDone++; }
  if (done || !run.passes.length) return finish({ phase: "done", pass: Math.max(0, run.passes.length - 1), visible: 0, sweep: 0, states: [], leaving: false, landed, passesDone, status: "done" });
  if (t < TIMING.idle) return finish({ phase: "idle", pass: 0, visible: 0, sweep: 0, states: [], leaving: false, landed, passesDone, status: "idle" });
  const clock = timeline.passes.find(item => t < item.end) ?? timeline.passes[timeline.passes.length - 1];
  const pass = run.passes[clock.index];
  const visible = clock.appearAt.filter(at => t >= at).length;
  const phase: Phase = t < clock.verifyAt ? "draft" : t < clock.settleAt ? "verify" : "settle";
  const states = pass.columns.map((column, j) => t >= clock.verdictAt[j] ? column.state : null);
  const sweep = phase === "draft" ? 0 : Math.min(clock.columns, Math.max(0, (t - clock.verifyAt) / TIMING.sweep * clock.columns));
  const rejected = pass.columns.some(column => column.state === "rejected");
  return finish({ phase, pass: clock.index, visible, sweep, states, leaving: phase === "settle", landed, passesDone, status: phase === "draft" ? "draft" : phase === "verify" ? "verify" : rejected ? "rejected" : "accepted" });
}
function finish(partial: Omit<Snapshot, "key">): Snapshot {
  return { ...partial, key: [partial.phase, partial.pass, partial.visible, partial.states.map(state => state?.[0] ?? "-").join(""), partial.landed, partial.passesDone].join("|") };
}

/**
 * The shimmer on a chip's text (the "being checked" cue of the preview): a bright band crosses the muted text after 130 ms at 0.11% per ms,
 * and when the verdict arrives it finishes in an instant and the text takes its full colour. Returns 0..100.
 */
export function shimmerAt(appearedAt: number, verdictAt: number | null, t: number): number {
  const active = Math.min(100, Math.max(0, (Math.min(t, verdictAt ?? t) - appearedAt - TIMING.shimmerDelay) * TIMING.shimmerRate));
  if (verdictAt === null || t < verdictAt) return active;
  const base = Math.min(100, Math.max(0, (verdictAt - appearedAt - TIMING.shimmerDelay) * TIMING.shimmerRate));
  return 100 - (100 - base) * Math.exp(-(t - verdictAt) / TIMING.settleTau);
}

/** The spring every flying word of the preview follows (fitted to its recorded positions: root-mean-square error 0.03 to 0.3 px). */
export const FLIGHT_SPRING = { type: "spring", stiffness: 300, damping: 36 } as const;
