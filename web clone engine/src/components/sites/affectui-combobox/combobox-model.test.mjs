import test from "node:test";
import assert from "node:assert/strict";
import { buildSections, filterOptions, firstEnabled, fold, hasExactMatch, initials, lastEnabled, matchRanges, moveActive, typeahead } from "./combobox-model.ts";

const people = [
  { value: "1", label: "Maya Chen", hint: "Product Designer", group: "Design" },
  { value: "2", label: "Jonas Weber", hint: "Design Lead", group: "Design" },
  { value: "3", label: "Nguyễn Văn Đạt", hint: "Backend", group: "Engineering", keywords: ["dat"] },
  { value: "4", label: "Leo Martins", hint: "Frontend", group: "Engineering", disabled: true },
  { value: "5", label: "Elif Yilmaz", hint: "Head of Product" },
];

test("search ignores case and accents and matches label, hint, group and keywords", () => {
  assert.equal(fold("Nguyễn Đạt").text, "nguyen dat");
  assert.deepEqual(filterOptions(people, "nguyen").map(o => o.value), ["3"]);
  assert.deepEqual(filterOptions(people, "DAT").map(o => o.value), ["3"]);
  assert.deepEqual(filterOptions(people, "ma").map(o => o.value), ["1", "4", "5"], "Maya, Martins, Yilmaz");
  assert.deepEqual(filterOptions(people, "product designer").map(o => o.value), ["1"], "every word must match");
  assert.deepEqual(filterOptions(people, "engineering").map(o => o.value), ["3", "4"]);
  assert.equal(filterOptions(people, "  ").length, people.length);
  assert.deepEqual(filterOptions(people, "zzz"), []);
});

test("match ranges point into the original text, merged and accent-aware", () => {
  assert.deepEqual(matchRanges("Maya Chen", "ma"), [[0, 2]]);
  assert.deepEqual(matchRanges("Priya Raman", "ma"), [[8, 10]]);
  assert.deepEqual(matchRanges("Nguyễn Văn Đạt", "nguyen"), [[0, 6]]);
  assert.deepEqual(matchRanges("Nguyễn Văn Đạt", "dat"), [[11, 14]]);
  assert.deepEqual(matchRanges("aaa", "aa"), [[0, 2]]);
  assert.deepEqual(matchRanges("Product Manager", "ma pro"), [[0, 3], [8, 10]]);
  assert.deepEqual(matchRanges("anything", ""), []);
});

test("sections keep the keyboard order, group by title and add a create row last", () => {
  const { rows, sections } = buildSections(people, "New person");
  assert.deepEqual(sections.map(s => s.title), ["Design", "Engineering", null, null]);
  assert.deepEqual(sections.flatMap(s => s.rows.map(r => r.index)), [0, 1, 2, 3, 4, 5]);
  assert.equal(rows.at(-1).kind, "create");
  assert.equal(rows.at(-1).text, "New person");
  assert.deepEqual(buildSections([]).sections, []);
});

test("movement skips disabled rows and clamps at the ends", () => {
  const { rows } = buildSections(people);
  assert.equal(firstEnabled(rows), 0);
  assert.equal(lastEnabled(rows), 4);
  assert.equal(moveActive(rows, 2, 1), 4, "Leo Martins is disabled");
  assert.equal(moveActive(rows, 4, 1), 4);
  assert.equal(moveActive(rows, 0, -1), 0);
  assert.equal(firstEnabled([]), -1);
});

test("type-ahead finds the next label that starts with the typed letters, cycling on repeats", () => {
  const { rows } = buildSections([{ value: "a", label: "Alpha" }, { value: "b", label: "Beta" }, { value: "c", label: "Apricot" }, { value: "d", label: "Bravo" }]);
  assert.equal(typeahead(rows, "a", -1), 0);
  assert.equal(typeahead(rows, "a", 0), 2, "same letter again moves on");
  assert.equal(typeahead(rows, "aa", 2), 0, "repeated letter cycles through the matches");
  assert.equal(typeahead(rows, "br", 0), 3);
  assert.equal(typeahead(rows, "x", 0), -1);
});

test("exact matches suppress the create row and initials fall back safely", () => {
  assert.equal(hasExactMatch(people, " maya chen "), true);
  assert.equal(hasExactMatch(people, "Maya"), false);
  assert.equal(initials("Maya Chen"), "MC");
  assert.equal(initials("Leo"), "LE");
  assert.equal(initials("Nguyễn Văn Đạt"), "NĐ");
  assert.equal(initials("  "), "?");
});
