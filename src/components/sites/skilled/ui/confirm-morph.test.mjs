import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DRAIN_OMEGA, GROW_OMEGA, HOLD_MS, OPEN_GUARD_MS, PausableTimer, QUESTION_TIMEOUT_MS, SHRINK_OMEGA, canConfirm, confirmReducer, initialConfirm, partDelay } from "./confirm-morph-model.ts";

const walk = (events, from = initialConfirm) => events.reduce((state, event) => confirmReducer(state, event), from);

test("the happy path: question, pending, result, then Undo restores to rest", () => {
  assert.equal(walk(["open"]).phase, "confirming");
  assert.equal(walk(["open", "confirm"]).phase, "pending");
  assert.equal(walk(["open", "confirm", "resolved"]).phase, "done");
  const undoing = walk(["open", "confirm", "resolved", "undo"]);
  assert.deepEqual(undoing, { phase: "pending", undoing: true });
  assert.equal(confirmReducer(undoing, "resolved").phase, "idle", "a finished Undo goes back to rest, not to the result");
  assert.equal(confirmReducer(undoing, "undoFailed").phase, "done", "a failed Undo leaves the result (and its Undo) in place");
});

test("cancel, timeout and dismiss return to rest; failures offer a retry that reruns", () => {
  assert.equal(walk(["open", "cancel"]).phase, "idle");
  assert.equal(walk(["open", "timeout"]).phase, "idle");
  assert.equal(walk(["open", "confirm", "rejected"]).phase, "error");
  assert.equal(walk(["open", "confirm", "rejected", "retry"]).phase, "pending");
  assert.equal(walk(["open", "confirm", "rejected", "retry", "resolved"]).phase, "done");
  assert.equal(walk(["open", "confirm", "rejected", "dismiss"]).phase, "idle");
  assert.equal(walk(["open", "confirm", "resolved", "dismiss"]).phase, "idle");
});

test("events that make no sense in a state change nothing", () => {
  assert.equal(walk(["confirm"]).phase, "idle");
  assert.equal(walk(["resolved"]).phase, "idle");
  assert.equal(walk(["open", "confirm", "cancel"]).phase, "pending", "nothing cancels a pending action");
  assert.equal(walk(["open", "confirm", "open"]).phase, "pending");
  assert.equal(walk(["open", "confirm", "timeout"]).phase, "pending");
});

test("a press inside the guard window, or an auto-repeated key, never confirms", () => {
  assert.equal(OPEN_GUARD_MS, 280);
  assert.equal(canConfirm(1000 + 100, 1000), false);
  assert.equal(canConfirm(1000 + 279, 1000), false);
  assert.equal(canConfirm(1000 + 280, 1000), true);
  assert.equal(canConfirm(5000, 1000, true), false);
});

test("the measured constants are the ones used (traces in docs/research/uiarc-confirm-morph)", () => {
  assert.equal(HOLD_MS, 1000);
  assert.equal(QUESTION_TIMEOUT_MS, 6000);
  assert.ok(GROW_OMEGA < SHRINK_OMEGA, "grows slower than it shrinks");
  assert.ok(DRAIN_OMEGA > SHRINK_OMEGA);
  assert.deepEqual([0, 1, 2].map(partDelay).map(v => Math.round(v * 1000)), [50, 86, 122], "the parts of a face arrive in reading order, about 36 ms apart");
});

function fakeScheduler() {
  let time = 0, next = 1; const pending = new Map();
  return {
    set: (callback, ms) => { const id = next++; pending.set(id, { at: time + ms, callback }); return id; },
    clear: id => pending.delete(id), now: () => time,
    advance(ms) { time += ms; for (const [id, job] of [...pending]) if (job.at <= time) { pending.delete(id); job.callback(); } },
  };
}

test("the timer fires once, and pausing keeps what was left", () => {
  const scheduler = fakeScheduler(); let fired = 0;
  const timer = new PausableTimer(6000, () => fired++, scheduler);
  timer.start();
  scheduler.advance(2500); assert.equal(timer.remaining, 3500);
  timer.pause(); scheduler.advance(60_000); assert.equal(fired, 0, "paused: nothing fires however long it waits");
  assert.equal(timer.remaining, 3500);
  timer.start(); scheduler.advance(3499); assert.equal(fired, 0);
  scheduler.advance(1); assert.equal(fired, 1);
  scheduler.advance(100_000); assert.equal(fired, 1, "once");
});

test("a cancelled timer never fires and cannot be restarted", () => {
  const scheduler = fakeScheduler(); let fired = 0;
  const timer = new PausableTimer(1000, () => fired++, scheduler);
  timer.start(); timer.cancel(); timer.start(); scheduler.advance(5000);
  assert.equal(fired, 0);
});

test("the measured traces back the hold and spring numbers", () => {
  // fit.txt keeps the printed fits of the recorded traces; the hold fill was linear for the whole second
  const text = readFileSync(new URL("../../../../../docs/research/uiarc-confirm-morph/fit.txt", import.meta.url), "utf8");
  assert.match(text, /fill is linear: 0\.\d+ %\/ms \(full in (99\d|100\d) ms\)/);
  assert.match(text, /critical \{"omega":12\.\d/);
  assert.match(text, /critical \{"omega":1[56]\.\d/);
});
