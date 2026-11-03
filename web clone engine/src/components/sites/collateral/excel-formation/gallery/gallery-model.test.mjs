import { test } from "node:test";
import assert from "node:assert/strict";
import { FLIGHT_SPRING, LENS, LENS_SPRING, fitFrame, flight, railWindow, specimenSegments, springProgress, stepIndex } from "./gallery-model.ts";

// Recorded from the public preview (docs/research/product-gallery/source/lens-samples.json): the lens after a pointer jump of
// 342 px (x) → progress of the move at 16 / 60 / 140 / 320 ms.
const RECORDED = [[0.016, 0.17], [0.060, 0.72], [0.140, 0.985], [0.320, 1]];

test("the lens spring reproduces the recorded lens positions", () => {
  for (const [t, progress] of RECORDED) assert.ok(Math.abs(springProgress(t, LENS_SPRING) - progress) < 0.06, `${t}s: ${springProgress(t, LENS_SPRING).toFixed(3)} vs ${progress}`);
  assert.equal(springProgress(0, LENS_SPRING), 0);
  assert.ok(springProgress(1, LENS_SPRING) > 0.9999);
});
test("springs are monotonic when critically or over-damped, and overshoot when under-damped", () => {
  let last = 0;
  for (let t = 0.01; t < 1; t += 0.01) { const p = springProgress(t, LENS_SPRING); assert.ok(p >= last - 1e-9); last = p; }
  assert.ok(Math.max(...Array.from({ length: 100 }, (_, i) => springProgress(i * 0.01, { stiffness: 300, damping: 8, mass: 1 }))) > 1);
  assert.ok(springProgress(0.3, FLIGHT_SPRING) < springProgress(0.3, LENS_SPRING), "the viewer flight is softer than the lens");
});
test("the lens keeps the size and zoom recorded on the preview", () => { assert.equal(LENS.size, 176); assert.equal(LENS.zoom, 2.4); });
test("the viewer flight starts at the stage rectangle and ends at identity", () => {
  const stage = { x: 482.3, y: 0.25, width: 537.3, height: 671.6 };
  const frame = { x: 377.6, y: 64, width: 684.8, height: 856 };
  const f = flight(stage, frame);
  assert.ok(Math.abs(f.scale - 0.7846) < 0.001, "recorded start scale 0.788");
  assert.ok(Math.abs(f.x - (stage.x + stage.width / 2 - (frame.x + frame.width / 2))) < 1e-9);
  assert.deepEqual(flight(frame, frame), { x: 0, y: 0, scale: 1 });
});
test("the viewer frame fits the viewport below the top bar and above the navigation", () => {
  const big = fitFrame({ width: 1440, height: 1000 }, 0.8);
  assert.deepEqual([Math.round(big.x * 10) / 10, big.y, Math.round(big.width * 10) / 10, Math.round(big.height)], [377.6, 64, 684.8, 856], "matches the recorded 684.8 x 856 frame");
  const phone = fitFrame({ width: 390, height: 800 }, 4 / 3);
  assert.equal(phone.x, 12); assert.equal(phone.width, 366);
  assert.ok(phone.y >= 56);
});
test("stepping stops at the ends and the rail follows the selection", () => {
  assert.equal(stepIndex(0, -1, 5), 0); assert.equal(stepIndex(4, 1, 5), 4); assert.equal(stepIndex(2, 1, 5), 3); assert.equal(stepIndex(0, 1, 0), 0);
  assert.deepEqual(railWindow(0, 100), { start: 0, end: 6 });
  assert.deepEqual(railWindow(50, 100), { start: 47, end: 53 });
  assert.deepEqual(railWindow(99, 100), { start: 94, end: 100 });
  assert.deepEqual(railWindow(1, 3), { start: 0, end: 3 });
});
test("specimen: marked characters and invisible characters become labelled runs, and the text is preserved", () => {
  const value = "Ke ho?ch\u200b x\u0007";
  const runs = specimenSegments(value, [{ start: 5, end: 6 }]);
  assert.equal(runs.map(r => r.kind === "glyph" ? "" : r.text).join(""), "Ke ho?ch x", "visible text is unchanged");
  assert.deepEqual(runs.map(r => [r.kind, r.start, r.end]), [["plain", 0, 5], ["mark", 5, 6], ["plain", 6, 8], ["glyph", 8, 9], ["plain", 9, 11], ["glyph", 11, 12]]);
  assert.equal(runs.find(r => r.kind === "glyph").label, "U+200B");
  assert.equal(runs.at(-1).label, "U+0007");
  assert.deepEqual(specimenSegments("", []), []);
  assert.equal(specimenSegments("a\tb")[1].text, "⇥");
  assert.deepEqual(specimenSegments("\u{1F600}x").map(r => [r.text, r.end]), [["\u{1F600}x", 3]], "astral characters are never split");
});
