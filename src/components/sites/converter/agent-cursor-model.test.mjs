import { test } from "node:test";
import assert from "node:assert/strict";
import { applyEdits, arcAt, countEdits, distanceBetween, easeInOut, fillMs, findOccurrence, groupLines, patchRange, piece, pieceText, replaceRange, travelMs } from "./agent-cursor-model.ts";

test("a hop takes 280 ms, a long flight 600 ms, by distance, and playback speed divides it", () => {
  assert.equal(travelMs(0), 280); assert.ok(Math.abs(travelMs(100) - 320) < 1e-9); assert.equal(travelMs(5000), 600); assert.equal(travelMs(100, 2), 160);
  assert.ok(Math.abs(travelMs(171) - 348.4) < 1e-9); // the second flight of the recorded run took about 350 ms
});

test("the ease-in-out of the preview starts and ends slowly and passes the middle at the middle", () => {
  assert.equal(easeInOut(0), 0); assert.equal(easeInOut(1), 1); assert.ok(Math.abs(easeInOut(0.5) - 0.5) < 1e-6);
  assert.ok(easeInOut(0.1) < 0.05); assert.ok(easeInOut(0.9) > 0.95);
  let previous = -1; for (let i = 0; i <= 100; i++) { const value = easeInOut(i / 100); assert.ok(value >= previous); previous = value; }
});

test("the arc starts and ends on its points and bends away from the straight line", () => {
  const a = { x: 0, y: 0 }, b = { x: 200, y: 0 };
  assert.deepEqual(arcAt(a, b, 0), a); const end = arcAt(a, b, 1); assert.ok(Math.abs(end.x - 200) < 1e-9 && Math.abs(end.y) < 1e-9);
  const mid = arcAt(a, b, 0.5); assert.ok(Math.abs(mid.y) > 3 && Math.abs(mid.y) < 20, String(mid.y)); assert.ok(Math.abs(mid.x - 100) < 1e-9);
  assert.equal(distanceBetween(a, b), 200);
});

test("a selection fills at a quarter of a millisecond a pixel", () => { assert.equal(fillMs(400), 100); assert.equal(fillMs(10), 40); assert.equal(fillMs(400, 2), 50); });

test("pieces are cut at the edges of a range and the text never changes", () => {
  const base = [piece("Week one goes to 5% of workpsaces behind the flag.")];
  const start = findOccurrence(pieceText(base), "workpsaces");
  const flagged = patchRange(base, start, start + 10, { kind: "typo" });
  assert.equal(pieceText(flagged), pieceText(base)); assert.deepEqual(flagged.map(item => item.kind), ["plain", "typo", "plain"]); assert.equal(flagged[1].text, "workpsaces");
  const fixed = replaceRange(flagged, start, start + 10, piece("workspaces", "tint", true));
  assert.equal(pieceText(fixed), "Week one goes to 5% of workspaces behind the flag."); assert.deepEqual(fixed.map(item => item.kind), ["plain", "tint", "plain"]); assert.equal(fixed[1].pending, true);
  // a range across two pieces
  const two = [piece("abc"), piece("def", "chunk", true)];
  assert.equal(pieceText(replaceRange(two, 2, 4, piece("X", "tint"))), "abXef");
  assert.equal(pieceText(patchRange(two, 1, 5, { pending: true })), "abcdef");
});

test("the n-th occurrence of a word is found at its own place", () => {
  assert.equal(findOccurrence("a,b,a,b", "a", 1), 4); assert.equal(findOccurrence("a,b", "z"), -1); assert.equal(findOccurrence("a,b,a", "a", 2), -1);
});

test("edits are counted by the blocks they touch, and applied in order", () => {
  const blocks = [{ id: "t", type: "title", text: "T" }, { id: "p", type: "paragraph", text: "one workpsaces two" }];
  const edits = [{ type: "rewrite", block: "p", text: "one workpsaces two" }, { type: "fix", block: "p", find: "workpsaces", replace: "workspaces" }, { type: "insert", after: "p", block: { id: "n", type: "heading", text: "H" } }];
  assert.equal(countEdits(edits), 2);
  assert.deepEqual(applyEdits(blocks, edits).map(block => block.text), ["T", "one workspaces two", "H"]);
});

test("rects of one line become one line, and a wrapped range becomes one rect per line", () => {
  const lines = groupLines([{ left: 10, top: 100, width: 50, height: 20 }, { left: 60, top: 101, width: 40, height: 20 }, { left: 10, top: 124, width: 30, height: 20 }, { left: 0, top: 130, width: 0, height: 20 }]);
  assert.equal(lines.length, 2); assert.deepEqual(lines[0], { left: 10, top: 100, width: 90, height: 20 });
});

test("rects whose fields are getters on a prototype (a DOMRect) are copied out whole", () => {
  class Rect { constructor(l, t, w, h) { this._ = [l, t, w, h]; } get left() { return this._[0]; } get top() { return this._[1]; } get width() { return this._[2]; } get height() { return this._[3]; } }
  const lines = groupLines([new Rect(5, 10, 100, 20), new Rect(105, 10, 30, 20), new Rect(5, 40, 60, 20)]);
  assert.deepEqual(lines, [{ left: 5, top: 10, width: 130, height: 20 }, { left: 5, top: 40, width: 60, height: 20 }]);
});
