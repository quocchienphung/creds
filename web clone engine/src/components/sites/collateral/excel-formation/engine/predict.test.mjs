import { test } from "node:test";
import assert from "node:assert/strict";
import { VietnameseModel, applyReviewChoices, applyTargets, plausibleSyllable, stripMarks, wordsOf } from "./predict.ts";
import { simulate, baseline } from "./speculative.ts";

const model = lines => { const m = new VietnameseModel(); for (const line of lines) m.add(line); return m.finish(); };
const CORPUS = [
  ...Array(30).fill("Ke hoach trien khai du an"), ...Array(12).fill("Toan bo hang muc dau tu gan lien voi dat tai khu cong nghiep"),
  ...Array(9).fill("Quyen su dung dat va tai san gan lien voi dat"), ...Array(6).fill("Hop dong the chap so 01 hong"), "Hung Yen", "Hang hoa trong kho", "May moc thiet bi",
];

test("marks are stripped and the file's plain text teaches the model, accented or not", () => {
  assert.equal(stripMarks("Đại Việt Công"), "Dai Viet Cong");
  const m = model(["Công ty Đại Việt", "Cong ty Dai Viet"]);
  assert.equal(m.count("cong"), 2);
  assert.equal(m.count("DAI"), 2, "case is folded");
  assert.deepEqual(wordsOf("(Ke hoach), trien.").map(w => w.text), ["Ke", "hoach", "trien"]);
  assert.deepEqual(wordsOf("a, b").map(w => [w.text, w.start, w.end]), [["a", 0, 1], ["b", 3, 4]]);
});

test("a broken word can only be a vowel or d at the ? and has the same length", () => {
  const m = model(CORPUS);
  assert.deepEqual(m.candidates("ho?ch").sort(), ["hoach"]);
  assert.ok(m.candidates("h?ng").includes("hang") && m.candidates("h?ng").includes("hong") && m.candidates("h?ng").includes("hung"));
  assert.ok(!m.candidates("h?ng").includes("hsng"), "only vowels and d fill a ?");
  assert.deepEqual(m.candidates("hxxxx?"), []);
});

test("context settles what frequency cannot: the same pattern is read differently in different sentences", () => {
  const m = model([...CORPUS, ...Array(40).fill("hang hoa"), ...Array(3).fill("hong the chap"), ...Array(3).fill("the chap hong")]);
  const a = m.predict("Toan bo h?ng muc dau tu").find(p => p.broken);
  assert.equal(a.target, "hang", "'bo h?ng muc' is hang muc");
  const b = m.predict("Hop dong the chap so 01 h?ng").find(p => p.broken);
  assert.equal(b.target, "hong", "'so 01 h?ng' ends a sentence the way hong does in this file");
  assert.ok(a.alternatives.length >= 2 && a.alternatives[0].text === "hang");
});

test("the draft is the most frequent word, the target may differ, and an unseen pattern offers nothing", () => {
  const m = model([...Array(10).fill("hang hoa"), ...Array(4).fill("hong the chap"), ...Array(4).fill("hong the chap")]);
  const [p] = m.predict("h?ng the chap");
  assert.equal(p.draft, "hang", "frequency alone says hang");
  assert.equal(p.target, "hong", "the words around it say hong");
  const none = m.predict("zz?zz").find(w => w.broken);
  assert.equal(none.basis, "none");
  assert.equal(none.target, "");
});

test("case follows the known letters and the text around the word is kept", () => {
  const m = model(CORPUS);
  assert.equal(m.predict("HO?CH").find(w => w.broken).target, "HOACH");
  assert.equal(m.predict("Ho?ch").find(w => w.broken).target, "Hoach");
  const text = "(Ke ho?ch), trien khai";
  assert.equal(applyTargets(text, m.predict(text)), "(Ke hoach), trien khai");
  assert.equal(applyTargets(text, m.predict(text), () => false), text, "nothing is applied that was not asked for");
});

test("m? is m2 or m3 when no word of the file fits", () => {
  const m = model(["dien tich 120 m2", "dien tich 90 m2"]);
  assert.equal(m.predict("dien tich 100 m?").find(w => w.broken).target, "m2");
});

test("a whole damaged phrase is decoded together using the clean words on both sides", () => {
  const m = model([...Array(80).fill("phu cap cho nai"), ...Array(12).fill("Thanh pho Ha Noi"), ...Array(10).fill("Quan Cau Giay")]);
  const text = "(Thanh ph? Ha N?i), Qu?n C?u Gi?y.";
  const p = m.predict(text);
  assert.equal(applyTargets(text, p), "(Thanh pho Ha Noi), Quan Cau Giay.");
  assert.ok(p.filter(word => word.broken).every(word => word.basis === "context"));
  // Both h?ng and h?a are damaged: the second word must be able to change the first guess.
  const chain = model([...Array(40).fill("hong the chap"), ...Array(10).fill("hang hoa trong kho")]);
  assert.equal(applyTargets("h?ng h?a trong kho", chain.predict("h?ng h?a trong kho")), "hang hoa trong kho");
});

test("intact fragments of damaged cells are useful evidence, with no invented pair over the gap", () => {
  const m = model(Array(5).fill("Quan Cau Giay ph? Ha Noi"));
  assert.equal(m.count("quan"), 5);
  assert.equal(m.count("ph?"), 0);
  assert.equal(m.predict("Qu?n Cau Giay")[0].target, "Quan");
  assert.equal(m.predict("ph? Ha Noi")[0].target, "");
});

test("rare and unknown answers require a choice, and copying a reading preserves unresolved words", () => {
  const m = model(["Hung Yen", ...Array(8).fill("Ke hoach trien khai")]);
  const text = "Ke ho?ch H?ng zz?zz";
  const p = m.predict(text);
  const rare = p.find(word => word.text === "H?ng"), unknown = p.find(word => word.text === "zz?zz");
  assert.equal(rare.confident, false, "a single occurrence is not strong evidence even without a runner-up");
  assert.equal(unknown.target, "");
  assert.equal(applyReviewChoices(text, p, {}), "Ke hoach H?ng zz?zz");
  assert.equal(applyReviewChoices(text, p, { [rare.index]: "Hung", [unknown.index]: "custom" }), "Ke hoach Hung custom");
  assert.equal(applyReviewChoices(text, p, { [rare.index]: rare.text }), "Ke hoach H?ng zz?zz", "keep original is an explicit choice");
});

test("a broad pattern stays uncertain when its candidate set had to be bounded", () => {
  const lines = [..."aeiouyd"].flatMap(a => [..."aeiouyd"].map(b => `${a}${b}`));
  const m = model([...lines, ...lines, ...lines, ...Array(30).fill("prefix aa suffix")]);
  const p = m.predict("prefix ?? suffix").find(word => word.broken);
  assert.equal(p.target, "aa");
  assert.equal(p.confident, false);
  assert.equal(applyReviewChoices("prefix ?? suffix", m.predict("prefix ?? suffix"), {}), "prefix ?? suffix");
});

test("Vietnamese syllable shape is soft evidence: real syllables pass, impossible ones do not", () => {
  for (const ok of ["hoach", "nghiep", "khuyen", "thuong", "quyen", "tien", "duong", "ngoai"]) assert.ok(plausibleSyllable(ok), ok);
  for (const bad of ["hxng", "bcd", "ssss", "hq"]) assert.ok(!plausibleSyllable(bad), bad);
});

test("speculative run: accepted guesses, one correction per pass, the rest discarded, and the stats add up", () => {
  const m = model([...CORPUS, ...Array(40).fill("hang hoa"), ...Array(4).fill("hong the chap")]);
  const predictions = m.predict("Toan bo h?ng muc dau tu gan lien voi dat");
  const run = simulate(predictions, 4);
  assert.deepEqual(run.output.map(w => w.index), predictions.map(w => w.index), "every word comes out exactly once, in order");
  assert.equal(run.stats.words, predictions.length);
  assert.equal(run.stats.passes, run.passes.length);
  assert.ok(run.stats.passes < predictions.length, "checking several words per pass takes fewer passes than one word per pass");
  assert.equal(run.stats.speedup, predictions.length / run.stats.passes);
  assert.equal(baseline(predictions).passes, predictions.length);
  for (const pass of run.passes) {
    const states = pass.columns.map(c => c.state);
    const firstBad = states.indexOf("rejected");
    if (firstBad >= 0) assert.ok(states.slice(firstBad + 1).every(s => s === "discarded"), "after the first mistake everything is discarded");
    assert.ok(states.slice(0, firstBad < 0 ? states.length : firstBad).every(s => s === "accepted"));
  }
  assert.equal(run.stats.accepted, run.passes.reduce((n, p) => n + p.accepted, 0));
  assert.ok(run.stats.acceptedPercent >= 0 && run.stats.acceptedPercent <= 100);
});

test("draft length is clamped and a one-word draft is a pass per word", () => {
  const m = model(CORPUS);
  const predictions = m.predict("Ke hoach trien khai du an");
  assert.equal(simulate(predictions, 1).stats.passes, Math.ceil(predictions.length / 2), "one accepted word plus the one the target writes");
  assert.equal(simulate(predictions, 99).passes.length, simulate(predictions, 8).passes.length);
  assert.deepEqual(simulate([], 4).stats, { words: 0, drafted: 0, accepted: 0, passes: 0, wordsPerPass: 0, speedup: 1, acceptedPercent: 0, confident: 0, broken: 0 });
});
