import { test } from "node:test";
import assert from "node:assert/strict";
import { wordDiff } from "./word-diff.ts";

const text = parts => parts.map(part => part.text).join("");
const changed = parts => parts.filter(part => part.changed).map(part => part.text);

test("only the words that differ are marked, and each side still reads as its own text", () => {
  const diff = wordDiff("Phu?ng Kim Long, Hue", "Phuong Kim Long, Hue");
  assert.equal(text(diff.before), "Phu?ng Kim Long, Hue");
  assert.equal(text(diff.after), "Phuong Kim Long, Hue");
  assert.deepEqual(changed(diff.before), ["Phu?ng"]);
  assert.deepEqual(changed(diff.after), ["Phuong"]);
});

test("added and removed words, an empty side and identical texts", () => {
  assert.deepEqual(changed(wordDiff("a b", "a x b").after), ["x"]);
  assert.deepEqual(changed(wordDiff("a x b", "a b").before), ["x"]);
  assert.deepEqual(wordDiff("", "new").before, []);
  assert.equal(changed(wordDiff("same text", "same text").after).length, 0);
});

test("a very long text is shown as wholly changed instead of computing a huge table", () => {
  const long = Array.from({ length: 500 }, (_, i) => "w" + i).join(" ");
  assert.deepEqual(wordDiff(long, long + " x").before, [{ text: long, changed: true }]);
});
