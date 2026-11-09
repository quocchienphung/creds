// Strange characters: what is cleaned, what is left alone, and what the repair does with a cell that has both a ? and a strange character.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildXlsx } from "./xlsx-builder.mjs";
import { exportCorrected, openSession } from "./session.ts";
import { applyEdits, acceptException, cellKey, emptyReview } from "./review.ts";
import { autoRepair } from "./auto-repair.ts";
import { fillPlaceholders, findResidual } from "./residual.ts";
import { cellMap } from "./ooxml-independent.mjs";
import { cleanText, decodeMojibakeRuns, dropLoneQuestionMarks, strangeChars, toPlainText } from "./text-clean.ts";
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
  assert.deepEqual(strangeChars("Đường số 5 – 12m²").map(item => item.start), [11, 16], "the typographic dash and the superscript are listed, not accepted");
  assert.deepEqual(strangeChars("Đường số 5"), []);
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
  assert.equal(cells.get("F" + (last + 1)).value, "Cong ty Dong Nai", "decoded, then written without marks");
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

test("a text the cleaning cannot settle (another script) is listed as an unusual character; mojibake debris is dropped", async () => {
  const session = await openSession(bytesWith([row(2000, "NGUYЫN"), row(2001, "NGUYẰƒN")]), "s.xlsx");
  const out = await autoRepair(session, emptyReview());
  const report = findResidual(session, out.state);
  assert.ok(report.items.some(item => item.row === last + 1 && item.kind === "strange"));
  assert.ok(!report.items.some(item => item.row === last + 2), "the debris was removed, so the cell is not listed");
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

test("every accented letter becomes its plain letter, capitals stay capitals, and the legacy eth is a D", () => {
  assert.equal(toPlainText("Nguyễn Thị Đào"), "Nguyen Thi Dao");
  assert.equal(toPlainText("ăâêôơư ĂÂÊÔƠƯ đĐ"), "aaeoou AAEOOU dD");
  assert.equal(toPlainText("THÀNH PHỐ HỒ CHÍ MINH"), "THANH PHO HO CHI MINH");
  assert.equal(toPlainText("\u00d0inh \u00f0"), "Dinh d");
  assert.equal(toPlainText("THA\u0300NH"), "THANH", "decomposed marks too");
  assert.equal(toPlainText("Café 12m² 5° 100.000 ₫ – “a” … ± ×"), "Cafe 12m2 5 100.000 - \"a\" ... +/- x", "typographic marks become ASCII, signs with no ASCII form are removed");
  // What mojibake leaves in a word is dropped; letters without a mark-based plain form and compatibility forms get their ASCII reading; other scripts are never guessed.
  assert.equal(toPlainText("TRA\u201a\u20acN CA\u00b4P so\u00b4 HA\u2122NG"), "TRAN CAP so HANG");
  assert.equal(toPlainText("Stra\u00dfe \u0141\u00f3d\u017a \ufb01le \uff21 \u2460 a\u2212b"), "Strasse Lodz file A 1 a-b");
  assert.equal(toPlainText("Привет 中文 😀"), "Привет 中文 😀");
  assert.deepEqual(strangeChars(toPlainText("Doa\u20acn Thi\u00a3 Phi\u2030 \u0192 \u00aa")), []);
});

test("the whole file is written without marks: every sheet, the header row, a hidden sheet, a cell with nothing else wrong", async () => {
  const bytes = buildXlsx([
    { name: "S", rows: [HEADERS, ...CLEAN.map((text, i) => row(i, text)), row(2000, "Nhà ở tại Hà Nội", "Nhà ở tại Hà Nội", "Nguyễn Văn A")] },
    { name: "Tài sản", state: "hidden", rows: [["Mô tả", "Ghi chú"], ["Đất ở đô thị", { f: "1+1", v: "2" }]] },
  ]);
  const session = await openSession(bytes, "s.xlsx"), out = await autoRepair(session, emptyReview());
  const cells = cellMap(out.bytes);
  assert.equal(cells.S.cells.get("F" + (last + 1)).value, "Nha o tai Ha Noi");
  assert.equal(cells.S.cells.get("H" + (last + 1)).value, "Nguyen Van A");
  const hidden = Object.values(cells).find(sheet => sheet.cells.get("A1")?.value === "Mo ta");
  assert.ok(hidden, "the header row of the other sheet is written plain too");
  assert.equal(hidden.cells.get("A2").value, "Dat o do thi");
  assert.equal(out.report.plainText >= 4, true);
  assert.equal(findResidual(session, out.state).items.some(item => item.kind === "accented"), false, "nothing accented is left");
});

test("a value the reviewer typed with marks is exported as typed, and listed as accented text to look at", async () => {
  const session = await openSession(bytesWith([row(2000, "may moc")]), "s.xlsx");
  const typed = applyEdits(emptyReview(), session.ctx, [{ sheet: "S", row: last + 1, col: 5, value: "Máy móc", source: "typed" }]);
  const out = await autoRepair(session, typed);
  assert.equal(cellMap(out.bytes).S.cells.get("F" + (last + 1)).value, "Máy móc");
  assert.ok(findResidual(session, out.state).items.some(item => item.row === last + 1 && item.col === 5 && item.kind === "accented"));
});

test("a rich-text cell cannot be written: the repair leaves it, does not fail because of it, and lists it as locked", async () => {
  const session = await openSession(bytesWith([row(2000, "may moc tang ba va c? so do so 5"), ["00001", "K3000", "A3000", "303", { n: "1" }, { rich: "may moc tang ba va c? so do so 5" }, { rich: "Nhà ở" }, { rich: "Nguy?n Văn A" }]]), "s.xlsx");
  const out = await autoRepair(session, emptyReview(), { collateral: true, policy: "FORCE_NO_QUESTION_MARK" });
  const cells = cellMap(out.bytes).S.cells;
  assert.equal(cells.get("F" + (last + 1)).value, "may moc tang ba va co so do so 5", "the plain cell next to it is repaired");
  assert.equal(cells.get("F" + (last + 2)).value, "may moc tang ba va c? so do so 5");
  assert.equal(cells.get("H" + (last + 2)).value, "Nguy?n Văn A");
  const locked = findResidual(session, out.state).items.filter(item => item.row === last + 2 && item.kind === "locked").map(item => item.col);
  assert.deepEqual(locked, [5, 6, 7], "each one is shown, so nothing is skipped in silence");
});

test("a rich-text cell cannot be edited by hand either: the edit is refused at once, not at export", async () => {
  const session = await openSession(bytesWith([["00001", "K3000", "A3000", "303", { n: "1" }, { rich: "Nhà ở" }, "x", "y"]]), "s.xlsx");
  assert.throws(() => applyEdits(emptyReview(), session.ctx, [{ sheet: "S", row: last + 1, col: 5, value: "Nha o", source: "typed" }]), /cannot be edited/);
});

test("a row whose only content is spaces or invisible characters may become empty: the repair succeeds and the export is verified", async () => {
  const session = await openSession(bytesWith([["\u200b", " ", "  "]]), "s.xlsx");
  const out = await autoRepair(session, emptyReview());
  assert.notEqual(out.report.status, "FAILED_VALIDATION");
  assert.equal(exportCorrected(session, out.state).roundTrip.ok, true);
});

test("a row the reviewer empties by hand exports, and a row that loses a value it was not asked to lose does not", async () => {
  const session = await openSession(buildXlsx([{ name: "S", rows: [["Mo ta", "Ghi chu"], ["xoa", "het"], ["giu", "lai"]] }]), "s.xlsx");
  const cleared = applyEdits(emptyReview(), session.ctx, [{ sheet: "S", row: 2, col: 0, value: "", source: "typed" }, { sheet: "S", row: 2, col: 1, value: "", source: "typed" }]);
  assert.equal(exportCorrected(session, cleared).roundTrip.ok, true);
  const half = applyEdits(emptyReview(), session.ctx, [{ sheet: "S", row: 3, col: 0, value: "", source: "typed" }]);
  assert.equal(exportCorrected(session, half).roundTrip.ok, true, "the other cell of that row is still there");
});

test("the last step turns every remaining lost letter into `a`, code columns included, and leaves a real question, a locked cell and a typed value alone", async () => {
  const session = await openSession(bytesWith([row(2000, "nha pho duong l?n va T?28 d?ng04B", "nha pho", "Nguy?n Van A", "B09?62"), row(2001, "Anh?"), row(2002, "ma? so ? 5")]), "s.xlsx");
  const out = await autoRepair(session, emptyReview());
  const edits = fillPlaceholders(session, out.state);
  const state = applyEdits(out.state, session.ctx, edits);
  const at = (r, c) => state.patches[`S\u0001${r}\u0001${c}`]?.value;
  assert.equal(at(last + 1, 1), "B09a62", "a code column too: this step is the person's decision");
  assert.ok(!findResidual(session, state).items.some(item => item.kind === "question_mark"), "nothing with a lost letter is left");
  assert.equal(at(last + 2, 5), undefined, "a ? that ends a sentence is a real question: untouched");
});
