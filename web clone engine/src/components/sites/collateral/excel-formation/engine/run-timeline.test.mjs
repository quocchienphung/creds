import { test } from "node:test";
import assert from "node:assert/strict";
import { simulate } from "./speculative.ts";
import { FLIGHT_SPRING, TIMING, VERIFY_MS, draftMs, shimmerAt, snapshotAt, timelineOf } from "./run-timeline.ts";

// Words of a synthetic cell: `good` ones where the draft and the target agree, the rest where they differ.
const words = (flags) => flags.map((same, index) => ({ index, text: `w${index}`, start: index * 3, end: index * 3 + 2, broken: !same, draft: same ? `w${index}` : "xa", target: `w${index}`, alternatives: [], confident: true, basis: "context" }));
const near = (actual, expected, tolerance, label) => assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} is not within ${tolerance} of ${expected}`);

// Numbers read off the public preview (docs/research/speculative-decoding/source/timeline-*.json).
test("a pass of four words keeps the cadence recorded on the preview: columns 66.7 ms apart, draft 250 ms, verify 466.7 ms, settle 183 ms, 900 ms in all", () => {
  const timeline = timelineOf(simulate(words([true, true, true, true, true, true, true, true]), 4));
  const [first] = timeline.passes;
  assert.deepEqual(first.appearAt.map(at => Math.round((at - first.start) * 10) / 10), [0, 66.7, 133.3, 200]);
  near(first.verifyAt - first.start, 250, 1, "draft to verify");       // recorded 217 to 268, mean 247
  near(first.settleAt - first.verifyAt, 466.7, 1, "verify to settle");  // recorded 450 to 473
  near(first.end - first.settleAt, 183.3, 1, "settle to next draft");   // recorded 167 to 188
  near(first.end - first.start, 900, 1, "pass");                        // recorded 870 to 901
  near(timeline.passes[1].start, first.end, 0.001, "the next pass starts when this one ends");
});

test("a column gets its verdict when the sweep is halfway across it, and the sweep takes the same 266.7 ms for every draft length", () => {
  for (const [k, recorded] of [[2, [66, 199]], [4, [33, 99, 166, 233]], [8, [16.5, 50, 82.5, 116, 149, 182, 215, 248]]]) {
    const [clock] = timelineOf(simulate(words(Array(16).fill(true)), k)).passes;
    assert.equal(clock.columns, k);
    clock.verdictAt.forEach((at, j) => near(at - clock.verifyAt, recorded[j], 3, `k=${k}, column ${j}`));
  }
});

test("draft length changes only the draft phase: 2 words 117 ms, 4 words 250 ms, 8 words 517 ms (recorded 114 to 118, 217 to 268, 498 to 513)", () => {
  near(draftMs(2), 116.7, 0.1, "k=2"); near(draftMs(4), 250, 0.1, "k=4"); near(draftMs(8), 516.7, 0.1, "k=8");
  assert.equal(VERIFY_MS, TIMING.sweep + TIMING.hold);
});

test("the snapshot follows the clock: idle, columns appear one by one, verdicts arrive in order, words land at settle, then done", () => {
  const run = simulate(words([true, true, false, true, true, true]), 4);
  const timeline = timelineOf(run);
  const [first, second] = timeline.passes;
  assert.equal(snapshotAt(run, timeline, 10).phase, "idle");
  assert.equal(snapshotAt(run, timeline, first.start + 1).visible, 1);
  assert.equal(snapshotAt(run, timeline, first.start + 70).visible, 2);
  assert.equal(snapshotAt(run, timeline, first.start + 200 + 1).visible, 4);
  const early = snapshotAt(run, timeline, first.verifyAt + 10);
  assert.equal(early.phase, "verify"); assert.deepEqual(early.states, [null, null, null, null]);
  assert.ok(early.sweep > 0 && early.sweep < 1);
  const midway = snapshotAt(run, timeline, first.verifyAt + 170);
  assert.deepEqual(midway.states, ["accepted", "accepted", "rejected", null]);
  const settled = snapshotAt(run, timeline, first.settleAt + 1);
  assert.equal(settled.phase, "settle"); assert.equal(settled.leaving, true);
  assert.deepEqual(settled.states, ["accepted", "accepted", "rejected", "discarded"]);
  assert.equal(settled.landed, 3, "two accepted guesses and the word the target wrote");
  assert.equal(settled.status, "rejected"); assert.equal(settled.passesDone, 1);
  assert.equal(snapshotAt(run, timeline, second.start + 1).phase, "draft");
  const end = snapshotAt(run, timeline, timeline.doneAt + 1);
  assert.equal(end.phase, "done"); assert.equal(end.landed, run.output.length); assert.equal(end.passesDone, run.passes.length);
});

test("the same time gives the same snapshot and the key only changes when something visible does", () => {
  const run = simulate(words(Array(9).fill(true)), 4);
  const timeline = timelineOf(run);
  const at = timeline.passes[1].verifyAt + 120;
  assert.deepEqual(snapshotAt(run, timeline, at), snapshotAt(run, timeline, at));
  assert.equal(snapshotAt(run, timeline, at).key, snapshotAt(run, timeline, at + 2).key, "a few ms later nothing visible moved");
  assert.notEqual(snapshotAt(run, timeline, at).key, snapshotAt(run, timeline, at + 120).key);
});

test("an empty cell has nothing to replay", () => {
  const run = simulate([], 4);
  const timeline = timelineOf(run);
  assert.equal(timeline.passes.length, 0);
  assert.equal(snapshotAt(run, timeline, 0).phase, "done");
});

test("the shimmer waits 130 ms, crosses at 0.11% per ms, and finishes in an instant when the verdict arrives (recorded 0 to 12% in the first 290 ms, 98.5% 170 ms after)", () => {
  assert.equal(shimmerAt(0, null, 100), 0);
  near(shimmerAt(0, null, 130 + 100), 11, 0.1, "after 100 ms of shimmer");
  near(shimmerAt(0, null, 290), 17.6, 0.1, "before the verdict");
  const atVerdict = shimmerAt(0, 300, 300), later = shimmerAt(0, 300, 470);
  assert.ok(later > atVerdict && later > 95, `${atVerdict} then ${later}`);
  assert.ok(shimmerAt(0, 300, 1000) > 99.99);
});

test("the flight spring is the one fitted to the preview (stiffness 300, damping 36); words fly 20 ms apart", () => {
  assert.deepEqual(FLIGHT_SPRING, { type: "spring", stiffness: 300, damping: 36 });
  assert.equal(TIMING.fly, 20);
});
