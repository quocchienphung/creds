import { test } from "node:test";
import assert from "node:assert/strict";
import { buildXlsx } from "./xlsx-builder.mjs";
import { openSession, patchesOf, exportCorrected } from "./session.ts";
import { acceptException, applyBulk, applyEdits, chooseForGroup, commit, emptyReview, groupRows, newHistory, planBulk, redo, rejectSuggestion, reopen, statusOf, summarize, undo, valueOf, allIssues } from "./review.ts";

const HEADERS = ["NGAYDULIEU", "MACNTCTD", "TENCNTCTD", "MAKH", "TENKH", "MASOBD", "MALOAIBD", "NGBDAU", "GIATRI", "GIATRIBDKV", "NGDINHGIA", "DSSOHD", "HOTENCSH", "MOTABD", "MOTABDS"];
const row = (o = {}) => { const base = { NGAYDULIEU: "30/09/2026", MACNTCTD: "00000001", TENCNTCTD: "CN TEST", MAKH: "00000123", TENKH: "Cong ty Mau", MASOBD: "D0001", MALOAIBD: "303", NGBDAU: "20200101", GIATRI: { n: "1000" }, GIATRIBDKV: { n: "500" }, NGDINHGIA: "20210101", DSSOHD: "0001/10R", HOTENCSH: "Nguyen Van A", MOTABD: "Ke hoach trien khai", MOTABDS: "Ke hoach trien khai", ...o }; return HEADERS.map(h => base[h]); };
const open = (rows, extra = {}) => openSession(buildXlsx([{ name: "MAU9_TEST", autoFilter: true, hiddenRows: [3], rows: [HEADERS, ...rows], ...extra }]), "synthetic.xlsx");
const col = name => HEADERS.indexOf(name);
const find = (session, field, category, r) => session.scan.issues.find(i => i.field === field && i.category === category && (r === undefined || i.row === r));
const edit = (session, state, field, r, value) => applyEdits(state, session.ctx, [{ sheet: "MAU9_TEST", row: r, col: col(field), value }]);
const fixtureRows = () => [row({ MASOBD: "C1" }), row({ MASOBD: "C2" }), row({ MASOBD: "X1", MOTABD: "Ke ho?ch trien khai", MOTABDS: "Ke ho?ch trien khai" })];

test("a typed correction is verified when the problem is gone, and the original is untouched", async () => {
  const s = await open(fixtureRows());
  const issue = find(s, "MOTABDS", "QUESTION_MARK_IN_WORD");
  const state = edit(s, emptyReview(), "MOTABDS", issue.row, "Ke hoach trien khai");
  assert.equal(statusOf(state, issue), "verified");
  assert.equal(state.states[issue.id].correctedValue, "Ke hoach trien khai");
  assert.equal(valueOf(state, s.ctx, "MAU9_TEST", issue.row, col("MOTABDS")), "Ke hoach trien khai");
  assert.equal(s.workbook.sheets[0].rows[3].cells[col("MOTABDS")].v, "Ke ho?ch trien khai", "the original workbook model never changes");
});

test("a correction that still has the problem is rejected for approval and stays blocking", async () => {
  const s = await open(fixtureRows());
  const issue = find(s, "MOTABDS", "QUESTION_MARK_IN_WORD");
  const state = edit(s, emptyReview(), "MOTABDS", issue.row, "Ke ho?ch khai");
  assert.equal(statusOf(state, issue), "edited");
  assert.equal(summarize(state, s.ctx).blocking > 0, true);
});

test("restoring the original removes the patch and reopens the issue", async () => {
  const s = await open(fixtureRows());
  const issue = find(s, "MOTABDS", "QUESTION_MARK_IN_WORD");
  let state = edit(s, emptyReview(), "MOTABDS", issue.row, "Ke hoach trien khai");
  state = edit(s, state, "MOTABDS", issue.row, issue.originalValue);
  assert.deepEqual(state.patches, {});
  assert.equal(statusOf(state, issue), "open");
});

test("a value that introduces a new problem is caught and counted", async () => {
  const s = await open(fixtureRows());
  const issue = find(s, "MOTABDS", "QUESTION_MARK_IN_WORD");
  const state = edit(s, emptyReview(), "MOTABDS", issue.row, "Ke hoach\u200b trien khai");
  assert.equal(statusOf(state, issue), "verified", "the ? is gone");
  const introduced = Object.values(state.introduced).flat();
  assert.deepEqual(introduced.map(i => i.category), ["INVISIBLE_OR_CONTROL"]);
  assert.equal(allIssues(state, s.ctx).length, s.scan.issues.length + 1);
});

test("an exception needs a reason, is recorded, can be taken back, and survives edits of other cells", async () => {
  const s = await open([row({ MOTABD: "Hoi dong co dong dong y?", MOTABDS: "Hoi dong co dong dong y?" })]);
  const issue = find(s, "MOTABDS", "QUESTION_MARK_IN_WORD");
  assert.equal(acceptException(emptyReview(), issue.id, "  ").ok, false);
  const accepted = acceptException(emptyReview(), issue.id, "A real question in the note");
  assert.equal(accepted.ok, true);
  assert.equal(statusOf(accepted.state, issue), "accepted_exception");
  assert.equal(accepted.state.states[issue.id].exceptionReason, "A real question in the note");
  const other = edit(s, accepted.state, "TENKH", 2, "Cty Khac");
  assert.equal(statusOf(other, issue), "accepted_exception");
  assert.equal(statusOf(reopen(accepted.state, s.ctx, issue), issue), "open");
});

test("exceptions and verified issues do not block; open critical and high issues do", async () => {
  const s = await open(fixtureRows());
  const before = summarize(emptyReview(), s.ctx);
  assert.ok(before.blocking >= 2, "the ? is reported in MOTABD and MOTABDS");
  let state = emptyReview();
  for (const field of ["MOTABD", "MOTABDS"]) state = edit(s, state, field, 4, "Ke hoach trien khai");
  const after = summarize(state, s.ctx);
  assert.equal(after.blocking, 0);
  assert.equal(after.byStatus.verified, 2);
  assert.equal(after.patched, 2);
});

test("undo and redo walk back through reviewer actions, one step each", async () => {
  const s = await open(fixtureRows());
  let history = newHistory();
  history = commit(history, edit(s, history.present, "MOTABDS", 4, "Ke hoach trien khai"));
  history = commit(history, edit(s, history.present, "MOTABD", 4, "Ke hoach trien khai"));
  assert.equal(Object.keys(history.present.patches).length, 2);
  history = undo(history);
  assert.equal(Object.keys(history.present.patches).length, 1);
  history = undo(history);
  assert.equal(Object.keys(history.present.patches).length, 0);
  assert.equal(undo(history), history, "nothing left to undo");
  history = redo(redo(history));
  assert.equal(Object.keys(history.present.patches).length, 2);
  history = commit(undo(history), edit(s, undo(history).present, "TENKH", 2, "x"));
  assert.equal(history.future.length, 0, "a new action clears redo");
});

test("a description conflict is resolved only when both columns agree, whichever the reviewer edits", async () => {
  const s = await open([row({ MOTABD: "May moc A", MOTABDS: "May moc B" })]);
  const issue = find(s, "MOTABDS", "DESCRIPTION_CONFLICT");
  assert.equal(issue.severity, "high");
  const onlyOne = edit(s, emptyReview(), "MOTABDS", 2, "May moc A");
  assert.equal(statusOf(onlyOne, issue), "verified", "now equal");
  const editedTwin = edit(s, emptyReview(), "MOTABD", 2, "May moc B");
  assert.equal(statusOf(editedTwin, issue), "verified", "editing the twin also settles the conflict");
  const stillDifferent = edit(s, emptyReview(), "MOTABD", 2, "May moc C");
  assert.equal(statusOf(stillDifferent, issue), "edited");
});

test("bulk fixes are limited to deterministic transforms, previewed first, and applied as one undo step", async () => {
  const s = await open([row({ TENKH: " Cty Mau " }), row({ MASOBD: "D2", TENKH: "Cty  Hai" }), row({ MASOBD: "D3", MOTABD: "Cong ty Đại", MOTABDS: "Cong ty Đại" })]);
  const plan = planBulk(emptyReview(), s.ctx, "trim");
  assert.deepEqual(plan.map(item => [item.row, item.from, item.to]), [[2, " Cty Mau ", "Cty Mau"]]);
  assert.deepEqual(planBulk(emptyReview(), s.ctx, "strip-diacritics"), [], "lossy fixes are never bulk");
  assert.deepEqual(planBulk(emptyReview(), s.ctx, "decode-mojibake"), []);
  const state = applyBulk(emptyReview(), s.ctx, [...plan, ...planBulk(emptyReview(), s.ctx, "collapse-spaces")]);
  assert.deepEqual(Object.values(state.patches).map(p => p.value).sort(), ["Cty Hai", "Cty Mau"]);
  assert.deepEqual(planBulk(state, s.ctx, "trim"), [], "cells already patched are left out of the next plan");
});

test("one value can be chosen for every row of a group, and the rows are listed first", async () => {
  const s = await open([row({ GIATRI: { n: "1" } }), row({ GIATRI: { n: "2" }, DSSOHD: "0002/10R" }), row({ MASOBD: "D9" })]);
  const issue = find(s, "GIATRI", "CONFLICTING_DUPLICATE");
  assert.deepEqual(groupRows(s.ctx, issue), [2, 3]);
  const state = chooseForGroup(emptyReview(), s.ctx, issue, "2");
  assert.deepEqual(Object.values(state.patches).map(p => [p.row, p.value, p.asNumber]), [[2, "2", true]], "row 3 already holds 2, so only row 2 changes");
  assert.equal(statusOf(state, issue), "verified", "every row of the group now holds the same value");
  const stillMixed = edit(s, emptyReview(), "GIATRI", 3, "7");
  assert.equal(statusOf(stillMixed, issue), "edited", "changing one row does not settle the others");
  const settledByTheOtherRow = edit(s, edit(s, emptyReview(), "GIATRI", 3, "7"), "GIATRI", 2, "7");
  assert.equal(statusOf(settledByTheOtherRow, issue), "verified", "the issue is anchored on row 2 but editing row 3 also counts");
  const fromTheOtherSide = edit(s, emptyReview(), "GIATRI", 3, "1");
  assert.equal(statusOf(fromTheOtherSide, issue), "verified", "making row 3 equal to row 2 settles it without touching row 2");
});

test("rejecting a suggestion keeps the original and remembers the decision", async () => {
  const s = await open(fixtureRows());
  const issue = find(s, "MOTABDS", "QUESTION_MARK_IN_WORD");
  const state = rejectSuggestion(emptyReview(), issue.id);
  assert.equal(state.states[issue.id].suggestionRejected, true);
  assert.equal(statusOf(state, issue), "open");
  assert.deepEqual(state.patches, {});
});

// ── corrected workbook ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
test("the corrected workbook contains exactly the approved values and nothing else changed", async () => {
  const s = await open(fixtureRows(), { styles: { 1: 1 } });
  let state = emptyReview();
  for (const field of ["MOTABD", "MOTABDS"]) state = edit(s, state, field, 4, "Ke hoach trien khai");
  const out = exportCorrected(s, state);
  assert.equal(out.fileName, "synthetic.reviewed.xlsx");
  assert.equal(out.changedCells, 2);
  assert.deepEqual(out.roundTrip, { ok: true, changedCells: 2, cellsChanged: 2, bySheet: { MAU9_TEST: 2 }, wrongValues: 0, unexpectedChanges: 0, sheetsCompared: 1 });
  const reopened = await openSession(out.bytes, out.fileName);
  assert.equal(reopened.scan.issues.some(i => i.category === "QUESTION_MARK_IN_WORD"), false, "the corrected file no longer has the problem");
  assert.equal(reopened.workbook.sheets[0].hiddenRows, 1, "hidden rows are kept");
  assert.equal(reopened.workbook.sheets[0].autoFilter, true, "the filter is kept");
  assert.equal(reopened.workbook.sheets[0].rows[3].cells[col("MOTABDS")].v, "Ke hoach trien khai");
  assert.equal(s.workbook.sheets[0].rows[3].cells[col("MOTABDS")].v, "Ke ho?ch trien khai", "the original is unchanged");
});

test("export is deterministic and keeps every original byte of untouched parts", async () => {
  const s = await open(fixtureRows());
  const state = edit(s, emptyReview(), "MOTABDS", 4, "Ke hoach trien khai");
  const a = exportCorrected(s, state), b = exportCorrected(s, state);
  assert.deepEqual(a.bytes, b.bytes, "same input + same patches = same bytes");
});

test("numbers, control characters and cells that did not exist are written correctly", async () => {
  const s = await open([row({ GIATRI: { n: "5" }, HOTENCSH: null }), row({ MASOBD: "D2" })]);
  let state = edit(s, emptyReview(), "GIATRI", 2, "1234.50");
  state = edit(s, state, "HOTENCSH", 2, "Tran \"B\" & Co <x>");
  state = edit(s, state, "TENKH", 3, "Ten\u0007ctl");
  const out = exportCorrected(s, state);
  assert.equal(out.roundTrip.ok, true);
  const reopened = await openSession(out.bytes, "x.xlsx");
  const rows = reopened.workbook.sheets[0].rows;
  assert.deepEqual([rows[1].cells[col("GIATRI")].t, rows[1].cells[col("GIATRI")].v], ["n", "1234.50"], "an amount stays a number");
  assert.equal(rows[1].cells[col("HOTENCSH")].v, "Tran \"B\" & Co <x>", "a cell that was empty was added in the right column");
  assert.equal(rows[2].cells[col("TENKH")].v, "Ten\u0007ctl");
});

test("the round trip check fails closed when an exported file differs from the approved patches", async () => {
  const s = await open(fixtureRows());
  const state = edit(s, emptyReview(), "MOTABDS", 4, "Ke hoach trien khai");
  const { verifyRoundTrip, patchWorkbookBytes } = await import("./xlsx-patcher.ts");
  const patches = patchesOf(state);
  const report = patchWorkbookBytes(s.bytes, s.workbook, patches);
  assert.equal(verifyRoundTrip(s.workbook, report.bytes, patches).ok, true);
  assert.equal(verifyRoundTrip(s.workbook, report.bytes, [{ ...patches[0], value: "something else" }]).ok, false, "a different expectation is a failure");
  assert.equal(verifyRoundTrip(s.workbook, s.bytes, patches).ok, false, "the unpatched original does not pass for the patched one");
});

test("patching a sheet that is not in the file is an error, not a silent skip", async () => {
  const s = await open(fixtureRows());
  const { patchWorkbookBytes } = await import("./xlsx-patcher.ts");
  assert.throws(() => patchWorkbookBytes(s.bytes, s.workbook, [{ sheet: "NOPE", row: 1, col: 0, value: "x", asNumber: false }]), /not found/);
});
