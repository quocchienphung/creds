import { test } from "node:test";
import assert from "node:assert/strict";
import { changedWords, wordsOfChange } from "./applied-change.ts";
import { simulate } from "./speculative.ts";

test("a confirmed fix pairs the words of the file with the approved words, one by one", () => {
  const words = wordsOfChange("S? ti?t ki?m", "Sổ tiết kiệm");
  assert.deepEqual(words.map(word => [word.text, word.target, word.broken]), [["S?", "Sổ", true], ["ti?t", "tiết", true], ["ki?m", "kiệm", true]]);
  assert.equal(changedWords("so ti?t kiem", "so tiết kiem"), 1);
  assert.equal(changedWords("tang 5", "tang 5"), 0);
});

test("the replay keeps the words that stayed and strikes the one that changed", () => {
  const run = simulate(wordsOfChange("can h? chung cu", "can ho chung cu"), 8);
  assert.equal(run.passes.length, 2, "one pass up to the first changed word, one more for the rest");
  assert.equal(run.passes[0].columns.find(column => column.state === "rejected")?.draft, "h?");
  assert.deepEqual(run.output.map(entry => entry.text), ["can", "ho", "chung", "cu"]);
  assert.equal(run.stats.accepted, 3);
});

test("texts that cannot be paired word by word are one changed word, and spaces at the edges are not part of it", () => {
  const words = wordsOfChange("  can h?  ", "căn hộ chung cư");
  assert.equal(words.length, 1);
  assert.deepEqual([words[0].text, words[0].target, words[0].start], ["can h?", "căn hộ chung cư", 2]);
});
