import test from "node:test";
import assert from "node:assert/strict";
import { captionFor, clampRating, easeOutQuad, effortFactor, formatPrice, formatSeconds, hasRatings, latencySeconds, moveIndex, placeMenu, rowLabel, spokenCaption, stepEffort } from "./model-picker-logic.ts";

const sonnet = { id: "s", name: "Sonnet", description: "Everyday work", speed: 4, quality: 4, cost: 3, latencyMs: 900, pricePerM: 10 };
const router = { id: "auto", name: "Auto", description: "Picks per message" };

test("thinking multiplies the first-token time by the effort: x1.6, x2.5, x4", () => {
  assert.equal(latencySeconds(sonnet, false, "high"), 0.9);
  assert.deepEqual(["low", "medium", "high"].map(effort => Number(latencySeconds(sonnet, true, effort).toFixed(2))), [1.44, 2.25, 3.6]);
  assert.deepEqual(effortFactor, { low: 1.6, medium: 2.5, high: 4 });
  assert.equal(latencySeconds({ id: "x", name: "X" }, true, "low"), null);
});

test("figures are formatted like the reference: one decimal of seconds, whole dollars or cents", () => {
  assert.equal(formatSeconds(2.14), "2.1s"); assert.equal(formatSeconds(-1), "0.0s");
  assert.equal(formatPrice(25), "$25"); assert.equal(formatPrice(0.5), "$0.50"); assert.equal(formatPrice(7.3, 0), "$7");
});

test("the footer shows figures when a model has them and its description when it does not", () => {
  const stats = captionFor(sonnet, true, "medium");
  assert.deepEqual([stats.key, stats.seconds, stats.price], ["stats:sp", 2.25, 10]);
  assert.equal(captionFor(router, false, "low").text, "Picks per message");
  assert.equal(captionFor(router, false, "low").key, "text:Picks per message");
  assert.equal(captionFor({ id: "p", name: "P", pricePerM: 3 }, false, "low").key, "stats:-p");
  assert.equal(captionFor(undefined, false, "low").text, "");
  assert.equal(spokenCaption(sonnet, stats), "Sonnet: about 2.3s to the first token, $10 per million tokens");
  assert.equal(spokenCaption(router, captionFor(router, false, "low")), "Auto: Picks per message");
});

test("rows say what they are to a screen reader; a model without ratings is a router", () => {
  assert.equal(hasRatings(sonnet), true); assert.equal(hasRatings(router), false);
  assert.equal(rowLabel(sonnet), "Sonnet, Everyday work. Speed 4, quality 4, cost 3 of 5");
  assert.equal(rowLabel(router), "Auto, Picks per message");
  assert.deepEqual([clampRating(9), clampRating(-2), clampRating(2.6), clampRating(undefined)], [5, 0, 3, 0]);
});

test("arrow keys wrap around the list and Home/End jump", () => {
  assert.deepEqual(["ArrowDown", "ArrowUp", "Home", "End", "x"].map(key => moveIndex(key, 0, 4)), [1, 3, 0, 3, 0]);
  assert.equal(moveIndex("ArrowDown", 3, 4), 0); assert.equal(moveIndex("ArrowDown", 0, 0), 0);
  assert.deepEqual([stepEffort("high", 1), stepEffort("low", -1), stepEffort("medium", 1)], ["low", "high", "high"]);
});

test("the rolling figures ease out and stay inside their range", () => {
  assert.equal(easeOutQuad(0), 0); assert.equal(easeOutQuad(1), 1); assert.equal(easeOutQuad(2), 1); assert.equal(easeOutQuad(-1), 0);
  assert.ok(easeOutQuad(0.26) > 0.4 && easeOutQuad(0.26) < 0.5, "about 45% of the way after a quarter of the time, as in the reference");
});

test("the menu opens below when it fits or there is more room there, otherwise above, and never taller than the room", () => {
  const base = { viewportHeight: 900, naturalHeight: 500 };
  assert.deepEqual(placeMenu({ ...base, triggerTop: 300, triggerBottom: 330, side: "auto" }), { side: "bottom", maxHeight: 900 - 330 - 6 - 8 });
  assert.deepEqual(placeMenu({ ...base, triggerTop: 820, triggerBottom: 850, side: "auto" }), { side: "top", maxHeight: 820 - 6 - 8 });
  assert.equal(placeMenu({ ...base, triggerTop: 300, triggerBottom: 330, side: "top" }).side, "top");
  assert.equal(placeMenu({ ...base, triggerTop: 380, triggerBottom: 410, side: "auto" }).side, "bottom", "tight both ways: the larger side wins");
});
