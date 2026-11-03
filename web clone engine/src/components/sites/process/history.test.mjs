import { test } from "node:test";
import assert from "node:assert/strict";
import { COALESCE_MS, MAX_STEPS, createHistory, historyReducer } from "./history.ts";

const edit = (state, next, key, at) => historyReducer(state, { type: "edit", next, key, at });

test("every edit is a step; undo and redo walk through them", () => {
  let state = createHistory(1);
  state = edit(state, value => value + 1, undefined, 0);
  state = edit(state, value => value + 1, undefined, 10);
  assert.deepEqual([state.present, state.past], [3, [1, 2]]);
  state = historyReducer(state, { type: "undo" });
  assert.deepEqual([state.present, state.future], [2, [3]]);
  state = historyReducer(state, { type: "undo" });
  state = historyReducer(state, { type: "undo" });
  assert.equal(state.present, 1, "nothing left to undo");
  state = historyReducer(state, { type: "redo" });
  assert.equal(state.present, 2);
  state = edit(state, value => value * 10, undefined, 20);
  assert.deepEqual([state.present, state.future], [20, []], "a new edit drops the redo steps");
  assert.equal(historyReducer(createHistory(5), { type: "redo" }).present, 5);
});

test("edits to the same field in quick succession are one step", () => {
  let state = createHistory("");
  for (const [index, letter] of ["h", "e", "y"].entries()) state = edit(state, value => value + letter, "name", 100 * (index + 1) + 1);
  assert.equal(state.present, "hey");
  assert.equal(state.past.length, 1);
  assert.deepEqual(historyReducer(state, { type: "undo" }).present, "");
  state = edit(state, value => value + "!", "name", 300 + COALESCE_MS + 50);
  assert.equal(state.past.length, 2, "a pause starts a new step");
  state = edit(state, value => value + "?", "other", 300 + COALESCE_MS + 60);
  assert.equal(state.past.length, 3, "another field is another step");
});

test("an edit that changes nothing is not a step, and replace clears the history", () => {
  const state = createHistory({ a: 1 });
  assert.equal(edit(state, value => value, "k", 1), state);
  const replaced = historyReducer(edit(state, value => ({ ...value, a: 2 }), "k", 1), { type: "replace", value: { a: 9 } });
  assert.deepEqual([replaced.present, replaced.past, replaced.future], [{ a: 9 }, [], []]);
});

test("the history is capped", () => {
  let state = createHistory(0);
  for (let index = 1; index <= MAX_STEPS + 25; index += 1) state = edit(state, value => value + 1, undefined, index);
  assert.equal(state.past.length, MAX_STEPS);
  assert.equal(state.present, MAX_STEPS + 25);
});
