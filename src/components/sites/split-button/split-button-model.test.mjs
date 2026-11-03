import { test } from "node:test";
import assert from "node:assert/strict";
import { MENU, MORPH, matchTyped, menuStart, morphGlyphs, nextEnabled, placeMenu, textOf } from "./split-button-model.ts";

const counter = () => { let id = 100; return () => id++; };
const glyphs = text => Array.from(text).map((char, index) => ({ id: index, char, state: "stay" }));

test("Publish to Published keeps seven letters and brings two in; going back sends them out", () => {
  const next = counter();
  const grown = morphGlyphs(glyphs("Publish"), "Published", next);
  assert.deepEqual(grown.map(g => `${g.char}:${g.state}`), ["P:stay", "u:stay", "b:stay", "l:stay", "i:stay", "s:stay", "h:stay", "e:in", "d:in"]);
  assert.equal(textOf(grown), "Published");
  const back = morphGlyphs(grown.map(g => ({ ...g, state: "stay" })), "Publish", next);
  assert.deepEqual(back.filter(g => g.state === "out").map(g => g.char), ["e", "d"]);
  assert.equal(textOf(back), "Publish");
  assert.equal(back.filter(g => g.state === "stay").length, 7);
});

test("a different label keeps only the shared start; a new label from nothing enters whole", () => {
  const next = counter();
  const swapped = morphGlyphs(glyphs("Copy"), "Copied", next);
  assert.deepEqual(swapped.map(g => `${g.char}:${g.state}`), ["C:stay", "o:stay", "p:stay", "i:in", "e:in", "d:in", "y:out"]);
  assert.equal(textOf(morphGlyphs([], "New", next)), "New");
  assert.ok(morphGlyphs([], "New", next).every(g => g.state === "in"));
  assert.equal(textOf(morphGlyphs(glyphs("A"), "", next)), "");
});

test("an unchanged label changes nothing and glyphs that already left are not revived", () => {
  const next = counter();
  const same = morphGlyphs(glyphs("New"), "New", next);
  assert.deepEqual(same.map(g => g.id), [0, 1, 2]);
  const leaving = morphGlyphs(glyphs("Saved"), "Save", next);
  const again = morphGlyphs(leaving, "Save", next);
  assert.equal(again.filter(g => g.state === "out").length, 1, "the leaving letter is still leaving");
  assert.equal(textOf(again), "Save");
});

test("menu: end-aligned 4px under the chevron, as measured (192px menu, group right edge 784.5)", () => {
  const anchor = { left: 745.5, top: 567.25, right: 784.5, bottom: 611.25, width: 39, height: 44 };
  const place = placeMenu(anchor, { width: 192, height: 120 }, { width: 1440, height: 1000 });
  assert.equal(place.side, "bottom");
  assert.ok(Math.abs(place.x - 592.5) < 0.6 && Math.abs(place.y - 615.25) < 0.01);
});

test("menu: flips above when it does not fit below, and stays 12px inside the viewport", () => {
  const anchor = { left: 300, top: 560, right: 340, bottom: 600, width: 40, height: 40 };
  const flipped = placeMenu(anchor, { width: 192, height: 200 }, { width: 800, height: 640 });
  assert.equal(flipped.side, "top");
  assert.equal(flipped.y, 560 - 4 - 200);
  const edge = placeMenu({ left: 20, top: 10, right: 40, bottom: 30, width: 20, height: 20 }, { width: 192, height: 100 }, { width: 800, height: 640 });
  assert.equal(edge.x, 12, "kept 12px from the left edge");
  const right = placeMenu({ left: 780, top: 10, right: 800, bottom: 30, width: 20, height: 20 }, { width: 192, height: 100 }, { width: 800, height: 640 });
  assert.equal(right.x, 800 - 12 - 192);
  const tall = placeMenu(anchor, { width: 192, height: 900 }, { width: 800, height: 640 });
  assert.ok(tall.maxHeight < 640 && tall.maxHeight > 0, "a menu taller than the room is limited to it");
});

test("menu start: 5px toward the button and scaled .97", () => {
  assert.deepEqual(menuStart("bottom"), { x: 0, y: -5, scale: 0.97 });
  assert.deepEqual(menuStart("top"), { x: 0, y: 5, scale: 0.97 });
});

test("keyboard: arrows loop and skip disabled items; typeahead finds the next match", () => {
  const enabled = [true, false, true, true];
  assert.equal(nextEnabled(enabled, -1, 1), 0);
  assert.equal(nextEnabled(enabled, 0, 1), 2);
  assert.equal(nextEnabled(enabled, 3, 1), 0, "loops at the end");
  assert.equal(nextEnabled(enabled, 0, -1), 3, "loops at the start");
  assert.equal(nextEnabled([false, false], 0, 1), -1);
  const labels = ["Saved processes", "Duplicate", "Export", "Delete"];
  assert.equal(matchTyped(labels, [true, true, true, true], "d", 0), 1);
  assert.equal(matchTyped(labels, [true, true, true, true], "d", 1), 3);
  assert.equal(matchTyped(labels, [true, true, true, false], "d", 1), 1, "a disabled match is skipped, and it wraps");
  assert.equal(matchTyped(labels, [true, true, true, true], "x", 0), -1);
});

test("measured constants: items stagger 35ms up to the fifth, result label stays ~2s", () => {
  assert.equal(MENU.itemStagger, 0.035); assert.equal(MENU.maxStaggered, 4); assert.ok(MORPH.resultMs >= 2000 && MORPH.resultMs <= 2500);
});
