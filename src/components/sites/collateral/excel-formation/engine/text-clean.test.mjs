// Strange characters: what is cleaned, what is left alone, and what the repair does with a cell that has both a ? and a strange character.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildXlsx } from "./xlsx-builder.mjs";
import { openSession } from "./session.ts";
import { applyEdits, acceptException, cellKey, emptyReview } from "./review.ts";
import { autoRepair } from "./auto-repair.ts";
import { findResidual } from "./residual.ts";
import { cellMap } from "./ooxml-independent.mjs";
import { cleanText, decodeMojibakeRuns, dropLoneQuestionMarks, strangeChars } from "./text-clean.ts";
import { HEADERS, CLEAN } from "./zero-patch-fixture.mjs";

const mojibake = text => new TextDecoder("windows-1252").decode(new TextEncoder().encode(text));

test("encoding accidents are undone word by word, next to real Vietnamese letters", () => {
  assert.equal(decodeMojibakeRuns("HÄ\u0090 số 5"), "HĐ số 5");
  assert.equal(cleanText("Công ty " + mojibake("Đồng Nai") + " Tỉnh"), "Công ty Đồng Nai Tỉnh");
  assert.equal(cleanText("Kâ€™Bay"), "K’Bay");
  assert.equal(cleanText(mojibake(mojibake("Hợp đồng"))), "Hợp đồng", "text encoded twice takes two passes");
});

test("what cannot be proven is left alone: a letter that merely looks like a lead byte", () => {
  assert.equal(cleanText("NGUYỄN ÂN"), "NGUYỄN ÂN");
  assert.equal(cleanText("Ä alone"), "Ä alone");
});

test("control, invisible and odd space characters go, decomposed letters are composed, digits are never touched", () => {
  assert.equal(cleanText("a​b\u0001c d\te "), "abc d e");
  assert.equal(cleanText("THÀNH PHỐ"), "THÀNH PHỐ");
  assert.equal(cleanText(" 0012 34 "), "0012 34");
  assert.equal(cleanText("line one\nline two"), "line one\nline two", "a line break inside a cell is the author's");
});

test("repeated spaces are collapsed where the column is a code or a name, not in running text", () => {
  assert.equal(cleanText("Tran  Hoang Hai", { role: "name" }), "Tran Hoang Hai");
  assert.equal(cleanText("mo ta  dai", { role: "freeText" }), "mo ta  dai");
});

test("the strange-character check lists what is left and accepts Vietnamese and usual punctuation", () => {
  assert.deepEqual(strangeChars("Đường số 5 – “Hà Nội” 12m² 5°"), []);
  assert.deepEqual(strangeChars("á"), [{ start: 1, end: 2 }]);
  assert.deepEqual(strangeChars("ngƒn"), [{ start: 2, end: 3 }]);
});

const row = (n, a, b = a, name = "Synthetic Person", id = `K${1000 + n}`) => ["00001", id, `A${n}`, "303", { n: "1234.5599999999999" }, a, b, name];
const bytesWith = extra => buildXlsx([{ name: "S", rows: [HEADERS, ...CLEAN.map((text, i) => row(i, text)), ...extra] }]);
const last = CLEAN.length + 1;

test("one cell with a ? and a strange character gets one patch holding both repairs", async () => {
  const session = await openSession(bytesWith([row(2000, "may moc tang ba va c? so do so 5 ​")]), "s.xlsx");
  const out = await autoRepair(session, emptyReview());
  assert.equal(cellMap(out.bytes).S.cells.get("F" + (last + 1)).value, "may moc tang ba va co so do so 5");
  assert.equal(out.state.patches[cellKey("S", last + 1, 5)].source.startsWith("auto"), true);
  assert.equal(out.report.normalized, 2, "both twin columns were cleaned");
});

test("a cell that is only strangely encoded is cleaned and counted, and the output differs only there", async () => {
  const session = await openSession(bytesWith([row(2000, "Cong ty " + mojibake("Đồng Nai")), row(2001, "bien so​ 51A")]), "s.xlsx");
  const out = await autoRepair(session, emptyReview());
  const cells = cellMap(out.bytes).S.cells;
  assert.equal(cells.get("F" + (last + 1)).value, "Cong ty Đồng Nai");
  assert.equal(cells.get("F" + (last + 2)).value, "bien so 51A");
  assert.equal(out.state.patches[cellKey("S", last + 1, 5)].source, "bulk");
  assert.equal(out.report.status === "FAILED_VALIDATION", false);
  assert.equal(out.report.metrics.outputUnexpectedChanges, 0);
  assert.equal(findResidual(session, out.state).items.some(item => item.row === last + 1), false, "nothing is left to review in a cleaned cell");
});

test("a typed value or an accepted exception is never cleaned over", async () => {
  const session = await openSession(bytesWith([row(2000, "a b", "x"), row(2001, "c d", "y")]), "s.xlsx");
  let state = applyEdits(emptyReview(), session.ctx, [{ sheet: "S", row: last + 1, col: 5, value: "typed value", source: "typed" }]);
  const issue = session.scan.issues.find(item => item.row === last + 2 && item.col === 5);
  if (issue) state = acceptException(state, issue.id, "Gia tri dung nhu vay, da doi chieu ho so").state;
  const out = await autoRepair(session, state);
  assert.equal(cellMap(out.bytes).S.cells.get("F" + (last + 1)).value, "typed value");
  if (issue) assert.equal(cellMap(out.bytes).S.cells.get("F" + (last + 2)).value, "c d");
});

test("a text the cleaning cannot settle is listed as an unusual character", async () => {
  const session = await openSession(bytesWith([row(2000, "NGUYẰƒN")]), "s.xlsx");
  const out = await autoRepair(session, emptyReview());
  const report = findResidual(session, out.state);
  assert.ok(report.items.some(item => item.row === last + 1 && item.kind === "strange"));
});

test("a ? that stands alone is dropped only as the last resort, a ? that belongs to a word or ends a sentence is not, and a cell is never emptied", () => {
  const drop = dropLoneQuestionMarks;
  assert.equal(drop("ban do ? so 5"), "ban do so 5");
  assert.equal(drop("? Nguyen Van A"), "Nguyen Van A");
  assert.equal(drop("hop dong so 5 ??"), "hop dong so 5");
  assert.equal(drop("c? so"), "c? so", "the ? of a word is a lost letter, not an orphan");
  assert.equal(drop("Anh?"), "Anh?");
  assert.equal(drop("?"), "?");
  assert.equal(drop("?? ?? ??"), "?? ?? ??", "a text made only of them is left to be looked at");
  assert.equal(cleanText("ban do ? so 5"), "ban do ? so 5", "the cleaning itself leaves it: the recovery may know the lost word");
});

test("a number with a stray ? at an edge is a number: the export loses letters that carry marks, never digits", () => {
  assert.equal(cleanText("?303"), "303");
  assert.equal(cleanText("30/09/2026?"), "30/09/2026");
  assert.equal(cleanText("1.234,5?"), "1.234,5");
  assert.equal(cleanText("A?B"), "A?B", "a ? between letters is not touched");
  assert.equal(cleanText("12?5"), "12?5", "nor one inside a number");
});

test("a replacement character inside a word is treated as the lost letter it is", () => {
  assert.equal(cleanText("Nguy\ufffdn Van"), "Nguy?n Van");
  assert.equal(cleanText("\ufffd"), "\ufffd");
});

test("an orphan ? is restored where the recovery knows the word, and dropped last where it does not (safe mode never guesses)", async () => {
  const session = await openSession(bytesWith([row(2000, "ban do ? so 5 tai xa"), row(2001, "Nha ? h?nh thanh trong tuong lai")]), "s.xlsx");
  const safe = cellMap((await autoRepair(session, emptyReview(), { collateral: true, policy: "SAFE_AUTO" })).bytes).S.cells;
  assert.equal(safe.get("F" + (last + 1)).value, "ban do so 5 tai xa", "nothing could settle it: dropped");
  const forced = cellMap((await autoRepair(session, emptyReview(), { collateral: true, policy: "FORCE_NO_QUESTION_MARK" })).bytes).S.cells;
  assert.equal(forced.get("F" + (last + 2)).value.includes("?"), false);
});
