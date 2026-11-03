import { test } from "node:test";
import assert from "node:assert/strict";
import { groupByBlock, isUnseen, placePopover, placeSpark, sparkTone, EDGE, POPOVER_GAP, SPARK } from "./notice-spark-model.ts";

const notice = (id, tone, blockId) => ({ id, badge: "x", title: id, tone, blockId });

test("notices are grouped under their block; the run's own notice goes to the first block", () => {
  const groups = groupByBlock([notice("a", "success", "b1"), notice("run", "success", undefined), notice("c", "error", "b1"), notice("d", "success", "gone")], "root", id => id !== "gone");
  assert.deepEqual(groups.map(group => [group.blockId, group.notices.map(item => item.id)]), [["b1", ["a", "c"]], ["root", ["run", "d"]]]);
});

test("a star is as loud as the loudest notice behind it", () => {
  assert.equal(sparkTone([notice("a", "success"), notice("b", "error"), notice("c", "success")]), "error");
  assert.equal(sparkTone([notice("a", "success"), notice("b", "attention")]), "attention");
  assert.equal(sparkTone([notice("a", "success")]), "success");
  assert.equal(sparkTone([notice("a", undefined)]), "neutral");
  assert.equal(sparkTone([]), "neutral");
});

test("a star blinks until everything behind it has been opened", () => {
  const items = [notice("a", "success"), notice("b", "success")];
  assert.equal(isUnseen(items, new Set()), true);
  assert.equal(isUnseen(items, new Set(["a"])), true);
  assert.equal(isUnseen(items, new Set(["a", "b"])), false);
});

test("the star sits at its block's top right corner, and is pinned to the edge when the block is out of view", () => {
  const view = { w: 1000, h: 700 };
  const seen = placeSpark({ x: 300, y: 300, w: 232, h: 130 }, view);
  assert.deepEqual([seen.x, seen.y, seen.pinned], [538, 294, false]);
  const left = placeSpark({ x: -600, y: 300, w: 232, h: 130 }, view, { left: 0 });
  assert.equal(left.pinned, true);
  assert.equal(left.x, SPARK / 2 + EDGE);
  const under = placeSpark({ x: 300, y: -400, w: 232, h: 130 }, view, { top: 72 });
  assert.equal(under.pinned, true);
  assert.equal(under.y, 72 + SPARK / 2 + EDGE, "below the page's own pills");
  const behindPanel = placeSpark({ x: 1500, y: 300, w: 232, h: 130 }, view, { right: 372 });
  assert.equal(behindPanel.x, 1000 - 372 - SPARK / 2 - EDGE, "not under the settings panel");
});

test("the card opens beside the block, on the right when there is room, on the left otherwise", () => {
  const view = { w: 1400, h: 800 };
  const right = placePopover({ x: 300, y: 200, w: 232, h: 130 }, view);
  assert.equal(right.side, "right");
  assert.equal(right.left, 300 + 232 + POPOVER_GAP);
  assert.equal(right.top, 192, "level with the block's top");
  const left = placePopover({ x: 1000, y: 200, w: 232, h: 130 }, view);
  assert.equal(left.side, "left");
  assert.equal(left.left, 1000 - POPOVER_GAP - left.width);
  // the settings panel on the right takes room too
  assert.equal(placePopover({ x: 700, y: 200, w: 232, h: 130 }, view, { right: 372 }).side, "left");
});

test("a card near the bottom hangs from the bottom so it stays on the screen", () => {
  const place = placePopover({ x: 300, y: 700, w: 232, h: 130 }, { w: 1400, h: 800 });
  assert.equal(place.top, undefined);
  assert.ok(place.bottom !== undefined && place.bottom >= EDGE);
});

test("on a narrow map the card goes under the block, or above it when there is no room below, and never past the edges", () => {
  const phone = { w: 390, h: 760 };
  const under = placePopover({ x: 60, y: 200, w: 232, h: 130 }, phone, { top: 120 });
  assert.equal(under.side, "below");
  assert.equal(under.top, 342);
  assert.ok(under.left >= EDGE && under.left + under.width <= 390 - EDGE);
  const above = placePopover({ x: 60, y: 600, w: 232, h: 130 }, phone, { top: 120 });
  assert.equal(above.side, "above");
  assert.equal(above.bottom, 760 - 588);
  assert.ok(placePopover({ x: 400, y: 200, w: 232, h: 130 }, phone).left + 344 > 0);
});
