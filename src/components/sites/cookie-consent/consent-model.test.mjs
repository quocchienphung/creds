import { test } from "node:test";
import assert from "node:assert/strict";
import { SPRING, SIZE, allowAll, defaultCookieCategories, faceGeometry, initialValue, normalizeValue, readCookieConsent, rejectAll, springFor, stacks, summaryText, writeCookieConsent } from "./consent-model.ts";

const memory = () => { const map = new Map(); return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key), map }; };

test("required categories are always on, others follow their default", () => {
  assert.deepEqual(initialValue(defaultCookieCategories), { necessary: true, preferences: false, analytics: false, marketing: false });
  assert.deepEqual(normalizeValue({ necessary: false, analytics: true, unknown: true }, defaultCookieCategories), { necessary: true, preferences: false, analytics: true, marketing: false });
  assert.deepEqual(rejectAll(defaultCookieCategories), { necessary: true, preferences: false, analytics: false, marketing: false });
  assert.deepEqual(allowAll(defaultCookieCategories), { necessary: true, preferences: true, analytics: true, marketing: true });
});

test("the hidden count Save is described by", () => {
  assert.equal(summaryText({ necessary: true, preferences: true, analytics: false, marketing: true }, defaultCookieCategories), "2 of 3 optional categories allowed");
  assert.equal(summaryText(rejectAll(defaultCookieCategories), defaultCookieCategories), "0 of 3 optional categories allowed");
});

test("a stored choice is read back only for the same version and only when well formed", () => {
  const storage = memory();
  writeCookieConsent("k", { value: { necessary: true, analytics: true }, version: "1", updatedAt: "2026-10-30T10:00:00.000Z" }, storage);
  assert.deepEqual(readCookieConsent("k", "1", storage)?.value, { necessary: true, analytics: true });
  assert.equal(readCookieConsent("k", "2", storage), null, "another version asks again");
  storage.setItem("k", "{not json"); assert.equal(readCookieConsent("k", "1", storage), null);
  storage.setItem("k", JSON.stringify({ version: "1", value: "yes", updatedAt: "x" })); assert.equal(readCookieConsent("k", "1", storage), null);
  storage.setItem("k", JSON.stringify({ version: "1", value: { a: true, b: "no" }, updatedAt: "x" })); assert.deepEqual(readCookieConsent("k", "1", storage)?.value, { a: true });
  writeCookieConsent("k", null, storage); assert.equal(storage.map.has("k"), false);
  assert.equal(readCookieConsent("k", "1", null), null, "safe where there is no storage");
});

test("shapes measured from the preview: bar 635 at a 635 layer, panel 420 centred 107.5px in, 44px chip at the left", () => {
  assert.deepEqual(faceGeometry("bar", 635, "bottom", undefined), { width: 635, side: "center", x: 0, radius: 22 });
  assert.deepEqual(faceGeometry("panel", 635, "bottom", undefined), { width: 420, side: "center", x: 107.5, radius: 26 });
  assert.deepEqual(faceGeometry("chip", 635, "bottom", undefined), { width: 44, side: "left", x: 0, radius: 22 });
});

test("the bar is at most 660px, the panel 420px, both clamped to the layer; corners put them on their side", () => {
  assert.equal(faceGeometry("bar", 1400, "bottom", undefined).width, SIZE.barMax);
  assert.equal(faceGeometry("bar", 1400, "bottom", undefined).x, (1400 - 660) / 2);
  assert.equal(faceGeometry("panel", 300, "bottom", undefined).width, 300);
  assert.equal(faceGeometry("bar", 1000, "bottom-right", undefined).x, 1000 - 660);
  assert.equal(faceGeometry("chip", 1000, "bottom-right", undefined).x, 1000 - 44, "the reopen button follows the bar's side");
  assert.equal(faceGeometry("chip", 1000, "bottom-right", "left").x, 0, "unless told otherwise");
  assert.equal(faceGeometry("chip", 1000, "bottom", "right").side, "right");
});

test("below 560px the message stacks above the actions", () => {
  assert.equal(stacks(559), true); assert.equal(stacks(560), false); assert.equal(stacks(635), false);
});

test("growing springs with a little bounce, shrinking is critically damped (never overshoots when it folds away)", () => {
  const ratio = spring => spring.damping / (2 * Math.sqrt(spring.stiffness * spring.mass));
  assert.equal(springFor({ width: 44, height: 44 }, { width: 420, height: 448 }), SPRING.grow);
  assert.equal(springFor({ width: 420, height: 448 }, { width: 44, height: 44 }), SPRING.shrink);
  assert.ok(ratio(SPRING.grow) < 1 && ratio(SPRING.grow) > 0.9);
  assert.ok(Math.abs(ratio(SPRING.shrink) - 1) < 0.01);
});
