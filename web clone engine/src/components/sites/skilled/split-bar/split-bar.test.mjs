import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { hitTest, labelMode, layoutSpans, leaderPath, placeOutside, shareText, sharesOf, stepHighlight } from "./split-bar-model.ts";

// The public preview's "Traffic by source" shares, as the clip-paths it painted at rest gave them (docs/research/uiarc-split-bar).
const segments = [["organic", 41571], ["direct", 24804], ["paid", 19073], ["social", 9940], ["referral", 3142], ["other", 1470]].map(([id, value]) => ({ id, label: id, value }));
const none = new Set();
const widthsOf = spans => spans.map(span => span.right - span.left);
const near = (actual, expected, tolerance, message) => assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} vs ${expected}`);

test("shares are over the visible total; zero, negative and non-finite values are left out", () => {
  const { shares, total } = sharesOf([{ id: "a", label: "a", value: 30 }, { id: "b", label: "b", value: 0 }, { id: "c", label: "c", value: -4 }, { id: "d", label: "d", value: NaN }, { id: "e", label: "e", value: 70 }], none);
  assert.deepEqual(shares.map(item => item.id), ["a", "e"]);
  assert.equal(total, 100);
  near(shares[0].share, 0.3, 1e-9, "a");
  const hidden = sharesOf([{ id: "a", label: "a", value: 30 }, { id: "e", label: "e", value: 70 }], new Set(["a"]));
  assert.equal(hidden.shares[0].share, 0, "a hidden part keeps its place with no share");
  near(hidden.shares[1].share, 1, 1e-9, "the rest fill the bar");
});

test("hovering a part widens it by 4.5 % and the others give way as recorded (Direct: 24.8 -> 29.3, Organic 41.6 -> 39.1)", () => {
  const { shares } = sharesOf(segments, none);
  const rest = widthsOf(layoutSpans(shares, null, () => 0, 668.8)), hover = widthsOf(layoutSpans(shares, "direct", () => 0, 668.8));
  const recorded = [39.083, 29.304, 17.932, 9.345, 2.954, 1.382].map(value => value / 100);
  hover.forEach((width, i) => near(width, recorded[i], 0.0006, `segment ${i}`));
  near(rest.reduce((a, b) => a + b, 0), 1, 1e-9, "rest sums to the bar");
  near(hover.reduce((a, b) => a + b, 0), 1, 1e-9, "hover sums to the bar");
});

test("a small part widens enough for its own label (Social at 668.8 px: 14.68 % recorded)", () => {
  const { shares } = sharesOf(segments, none);
  const need = id => (id === "social" ? 33.34 + 30.06 + 35 : 0);
  const widths = widthsOf(layoutSpans(shares, "social", need, 668.8));
  near(widths[3], 0.14684, 0.0006, "social");
  near(widths[0], 0.3938, 0.0006, "organic");
});

test("spans are contiguous and a hidden part collapses in place", () => {
  const { shares } = sharesOf(segments, new Set(["direct"]));
  const spans = layoutSpans(shares, null, () => 0, 600);
  spans.forEach((span, i) => { if (i > 0) near(span.left, spans[i - 1].right, 1e-12, "contiguous"); });
  assert.equal(spans[1].left, spans[1].right);
  near(spans[1].left, spans[0].right, 1e-12, "collapsed at the seam");
  near(spans[5].right, 1, 1e-9, "the others fill the bar");
});

test("a single visible part fills the bar and is not widened", () => {
  const { shares } = sharesOf(segments, new Set(["direct", "paid", "social", "referral", "other"]));
  const spans = layoutSpans(shares, "organic", () => 500, 400);
  near(spans[0].right - spans[0].left, 1, 1e-9, "full");
});

test("the label rule reproduces the modes recorded at eight widths of the preview", () => {
  const rows = JSON.parse(readFileSync(new URL("../../../../../docs/research/uiarc-split-bar/labels-fit.json", import.meta.url), "utf8"));
  let checked = 0;
  for (const row of rows) {
    if (row.viewport === 340) continue; // the preview's own layout breaks at 340 px (its outside labels lose their markup): not a reference
    for (const seg of row.segs) {
      const recorded = seg.nameShown ? "name" : seg.insideOpacity === "0" ? "outside" : "share";
      assert.equal(labelMode(seg.segPx, seg.nameW, seg.pctW), recorded, `${row.viewport}px ${seg.name} (${seg.segPx}px)`);
      checked++;
    }
  }
  assert.ok(checked >= 40);
});

test("outside labels never overlap and stay in the bar; recorded: Referral at 506.9, Other at 600.0 on a 668.8 px bar", () => {
  const placed = placeOutside([{ id: "referral", anchor: 648.7, width: 77.28 }, { id: "other", anchor: 664.1, width: 64.8 }], 668.8);
  near(placed[0].left, 506.9, 1.5, "referral");
  near(placed[1].left, 600, 1.5, "other");
  const crowded = placeOutside([1, 2, 3, 4].map(n => ({ id: `n${n}`, anchor: 20 + n * 5, width: 70 })), 400);
  crowded.forEach((item, i) => {
    assert.ok(item.left >= 0 && item.left + item.width <= 400, "inside the bar");
    if (i > 0) assert.ok(item.left >= crowded[i - 1].left + crowded[i - 1].width + 15.99, "apart");
  });
  const lone = placeOutside([{ id: "x", anchor: 5, width: 60 }], 300);
  assert.equal(lone[0].left, 0, "kept off the left edge");
});

test("leader path has the recorded S shape", () => {
  assert.equal(leaderPath(648.7, 547.4), "M648.7 0 C648.7 10 547.4 6 547.4 15");
});

test("shares read with one decimal", () => {
  assert.equal(shareText(0.41571), "41.6%");
  assert.equal(shareText(1), "100.0%");
  assert.equal(shareText(0.0314), "3.1%");
});

test("arrow keys walk the visible parts and stop at the ends", () => {
  const visible = ["a", "b", "c"];
  assert.equal(stepHighlight(visible, null, "next"), "a");
  assert.equal(stepHighlight(visible, "a", "next"), "b");
  assert.equal(stepHighlight(visible, "c", "next"), "c");
  assert.equal(stepHighlight(visible, null, "previous"), "c");
  assert.equal(stepHighlight(visible, "a", "previous"), "a");
  assert.equal(stepHighlight(visible, "b", "first"), "a");
  assert.equal(stepHighlight(visible, "b", "last"), "c");
  assert.equal(stepHighlight([], "b", "next"), null);
});

test("the pointer keeps the highlighted part inside its widened extent, and plain layout decides elsewhere", () => {
  const base = [{ id: "a", left: 0, right: 0.5 }, { id: "b", left: 0.5, right: 1 }];
  const widened = [{ id: "a", left: 0, right: 0.55 }, { id: "b", left: 0.55, right: 1 }];
  assert.equal(hitTest(0.52, base, widened, null), "b");
  assert.equal(hitTest(0.52, base, widened, "a"), "a");
  assert.equal(hitTest(0.6, base, widened, "a"), "b");
  assert.equal(hitTest(1.2, base, widened, "a"), null);
});
