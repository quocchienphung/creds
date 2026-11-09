import { test } from "node:test";
import assert from "node:assert/strict";
import { baseName, chunkCharacters, chunkWords, delimitedLine, delimitedText, field, formatBytes, formatDuration, glide, gridText, safeName, sparkPath, splitSentences, splitLines, suggestName, trimRow } from "./flip-model.ts";

test("sentences keep decimals whole and break after 。！？ and line breaks", () => {
  assert.deepEqual(splitSentences("Version 4.2 is out. It syncs in 3 s! Ready?"), ["Version 4.2 is out. ", "It syncs in 3 s! ", "Ready?"]);
  assert.deepEqual(splitSentences("こんにちは。元気ですか？はい！"), ["こんにちは。", "元気ですか？", "はい！"]);
  assert.deepEqual(splitSentences("a\nb"), ["a", "b"]); assert.deepEqual(splitLines("a\n\nb"), ["a", "", "b"]);
  assert.equal(splitSentences("One. Two. Three.").join(""), "One. Two. Three.");
});

test("chunks of 3 to 6 words put end to end give the unit back; characters chunks too", () => {
  const unit = "Die ersten Rückmeldungen aus der Beta sind sehr gut: Die Synchronisierung dauert im Schnitt nur noch 3 statt 9 Sekunden. ";
  const chunks = chunkWords(unit);
  assert.equal(chunks.join(""), unit);
  assert.ok(chunks.every(c => { const n = c.trim().split(/\s+/).length; return n >= 1 && n <= 6; }));
  assert.ok(chunks.slice(0, -1).every(c => c.trim().split(/\s+/).length >= 3));
  const row = "00000001,CN TEST,Cong ty Mau,T00010,303,20200101";
  assert.equal(chunkCharacters(row).join(""), row); assert.ok(chunkCharacters(row).length >= 3);
});

test("a field is quoted only when it must be: delimiter, quote or line break; leading zeros are left alone", () => {
  assert.equal(field("00012", ","), "00012"); assert.equal(field("a,b", ","), "\"a,b\""); assert.equal(field("a,b", ";"), "a,b");
  assert.equal(field("say \"hi\"", ","), "\"say \"\"hi\"\"\""); assert.equal(field("two\nlines", ","), "\"two\nlines\""); assert.equal(field("", ","), "");
  assert.equal(delimitedLine(["a", "b;c", ""], ";"), "a;\"b;c\";");
  assert.equal(delimitedText([["x", "y"], ["1", "2"]], "\t"), "x\ty\n1\t2");
  assert.deepEqual(trimRow(["a", "", "b", "", ""]), ["a", "", "b"]);
  assert.equal(gridText([["a", "b"], ["c\nd", "e"]]), "a  │  b\nc d  │  e");
});

test("the name completes from the workbook's own names and then offers the extension", () => {
  const names = ["MAU9_20260930 ok", "Sheet1"];
  assert.equal(suggestName("MAU", names, ".csv"), "9_20260930 ok.csv");
  assert.equal(suggestName("mau9_2026", names, ".csv"), "0930 ok.csv", "case-insensitive");
  assert.equal(suggestName("Sheet1", names, ".csv"), ".csv", "a complete name gets the extension");
  assert.equal(suggestName("Sheet1.csv", names, ".csv"), null);
  assert.equal(suggestName("", names, ".csv"), null); assert.equal(suggestName("zzz", names, ".csv"), null); assert.equal(suggestName("Sheet1 ", names, ".csv"), null);
  assert.equal(baseName("MAU9_20260930 ok.xlsx"), "MAU9_20260930 ok"); assert.equal(safeName("../a/b:c?.csv"), "_a_b_c_.csv");
});

test("numbers: durations, sizes, and a glide that counts up and cuts down", () => {
  assert.equal(formatDuration(412), "412ms"); assert.equal(formatDuration(3600), "3.60s"); assert.equal(formatBytes(10240), "10 KB"); assert.equal(formatBytes(9.4 * 1048576), "9.40 MB");
  assert.equal(glide(0, 100, 0), 0); assert.ok(Math.abs(glide(0, 100, 100) - 63.2) < 0.1); assert.equal(glide(100, 40, 16), 40); assert.equal(glide(99.7, 100, 16), 100);
  const p = sparkPath([10, 20, 15, 30], 60, 16);
  assert.ok(p.d.startsWith("M0.0")); assert.equal(p.end[0], 60); assert.equal(sparkPath([1], 60, 16).d, "");
  assert.ok(sparkPath(Array.from({ length: 200 }, (_, i) => i), 60, 16).d.split("L").length <= 48);
});
