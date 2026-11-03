import { test } from "node:test";
import assert from "node:assert/strict";
import { SHEET, backdropOpacity, followPointer, keyboardDetent, layout, nearestDetent, normalizeDetents, rubberBand, releaseVelocity, resolveRelease } from "./sheet-model.ts";

// The preview at a 1000px viewport with detents [0.46, 0.92]: height 1080, rests at 460, closed at 960, tallest at 0
const view = layout(1000, [0.46, 0.92]);

test("layout matches the recorded sheet: 1080px tall, rests at 460, closed at 960; and 0.46 of every viewport height measured", () => {
  assert.equal(view.height, 1080); assert.deepEqual(view.stops, [460, 0]); assert.equal(view.closedY, 960);
  for (const [vh, rest] of [[600, 276], [700, 322], [800, 368], [1200, 552]]) assert.equal(layout(vh, [0.46, 0.92]).stops[0], rest);
});

test("detents are sorted, clamped and de-duplicated; the default is [0.45, 0.92]", () => {
  assert.deepEqual(normalizeDetents([0.92, 0.45, 0.45, 5, -1]), [0.1, 0.45, 0.92, 1]);
  assert.deepEqual(normalizeDetents([]), [0.45, 0.92]); assert.deepEqual(normalizeDetents(undefined), [0.45, 0.92]);
  const single = layout(800, [0.5]); assert.deepEqual(single.stops, [0]); assert.equal(single.height, 0.5 * 800 + 160);
});

test("backdrop: 1 at the tallest, .78 at the smallest, 0 closed, linear between (recorded: 230 -> .88, 710 -> .40)", () => {
  assert.equal(backdropOpacity(0, view.stops, view.closedY), 1);
  assert.ok(Math.abs(backdropOpacity(460, view.stops, view.closedY) - 0.78) < 1e-9);
  assert.equal(backdropOpacity(960, view.stops, view.closedY), 0); assert.equal(backdropOpacity(1200, view.stops, view.closedY), 0); assert.equal(backdropOpacity(-40, view.stops, view.closedY), 1);
  assert.ok(Math.abs(backdropOpacity(230, view.stops, view.closedY) - 0.89) < 0.01);
  assert.ok(Math.abs(backdropOpacity(710, view.stops, view.closedY) - 0.39) < 0.01);
});

test("the sheet follows the pointer 1:1 and rubber-bands above the tallest detent (recorded 100 -> 40, 320 -> 72, 640 -> 89.5)", () => {
  assert.equal(followPointer(460, -100), 360); assert.equal(followPointer(460, 300), 760); assert.equal(followPointer(0, 40), 40);
  for (const [d, x] of [[100, 40.1], [320, 72.1], [640, 89.5]]) assert.ok(Math.abs(rubberBand(d) - x) < 2.5, `${d} -> ${rubberBand(d)}`);
  assert.equal(followPointer(0, -100), -rubberBand(100));
  assert.ok(rubberBand(5000) < SHEET.band.D, "it never goes past D");
  assert.equal(rubberBand(0), 0);
});

test("a release at rest snaps to the nearest stop: thresholds 230 (between the detents) and 710 (between the smallest and closing)", () => {
  const at = y => resolveRelease(y, 0, view.stops, view.closedY);
  assert.deepEqual(at(220), { kind: "detent", index: 1 }); assert.deepEqual(at(240), { kind: "detent", index: 0 });
  assert.deepEqual(at(710 - 5), { kind: "detent", index: 0 }); assert.deepEqual(at(760), { kind: "dismiss" });
  assert.deepEqual(at(-40), { kind: "detent", index: 1 });
});

test("flicks decide by projection, matching the recorded sweeps", () => {
  const at = (y, v) => resolveRelease(y, v, view.stops, view.closedY);
  // from the smallest detent, 30px up: 266px/s stays, 440px/s goes to the tallest
  assert.deepEqual(at(430, -266), { kind: "detent", index: 0 }); assert.deepEqual(at(424, -440), { kind: "detent", index: 1 });
  // 30px down: 265 stays, 364 dismisses
  assert.deepEqual(at(490, 265), { kind: "detent", index: 0 }); assert.deepEqual(at(496, 364), { kind: "dismiss" });
  // from the tallest, 30px down: 264 stays, 442 goes to the smallest, 1015 still only to the smallest (it does not dismiss)
  assert.deepEqual(at(32, 264), { kind: "detent", index: 1 }); assert.deepEqual(at(36, 442), { kind: "detent", index: 0 }); assert.deepEqual(at(80, 1015), { kind: "detent", index: 0 });
  // a hard flick down from the smallest dismisses
  assert.deepEqual(at(540, 1663), { kind: "dismiss" });
  // not dismissible: it settles on the smallest
  assert.deepEqual(resolveRelease(540, 1663, view.stops, view.closedY, false), { kind: "detent", index: 0 });
});

test("velocity comes from the last three samples inside the window", () => {
  const samples = [{ t: 0, y: 500 }, { t: 100, y: 480 }, { t: 118, y: 470 }, { t: 136, y: 460 }];
  assert.ok(Math.abs(releaseVelocity(samples, 140) - (-10 / 18 * 1000)) < 1);
  assert.equal(releaseVelocity(samples, 600), 0, "stale samples do not count");
  assert.equal(releaseVelocity([{ t: 0, y: 1 }], 10), 0);
});

test("keyboard: arrows step one detent, Home/End jump, Enter and Space toggle the ends", () => {
  assert.equal(keyboardDetent("ArrowUp", 0, 2), 1); assert.equal(keyboardDetent("ArrowUp", 1, 2), 1); assert.equal(keyboardDetent("ArrowDown", 1, 2), 0);
  assert.equal(keyboardDetent("Home", 0, 3), 2); assert.equal(keyboardDetent("End", 2, 3), 0);
  assert.equal(keyboardDetent("Enter", 0, 3), 2); assert.equal(keyboardDetent(" ", 2, 3), 0); assert.equal(keyboardDetent("a", 0, 2), null);
  assert.equal(nearestDetent(100, view.stops), 1); assert.equal(nearestDetent(400, view.stops), 0);
});
