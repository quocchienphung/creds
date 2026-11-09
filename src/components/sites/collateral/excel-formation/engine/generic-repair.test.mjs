// Profile-independent `?` scan and repair. Synthetic data only. The exported file is read back by an INDEPENDENT reader (Python stdlib) when available.
import { toPlainText } from "./text-clean.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildXlsx } from "./xlsx-builder.mjs";
import { openSession, exportCorrected } from "./session.ts";
import { applyEdits, emptyReview, summarize } from "./review.ts";
import { autoRepair } from "./auto-repair.ts";
import { corruptionSpans } from "./corruption-span.ts";
import { textRoleOf } from "./sheet-scan.ts";
import { PLAIN, MARKED, clean, damage, target, workbookA, workbookB } from "./generic-fixture.mjs";

const verifier = join(dirname(fileURLToPath(import.meta.url)), "independent-xlsx-dump.py");
const python = ["python3", "python"].find(name => spawnSync(name, ["--version"]).status === 0) ?? null; // `python` alone does not exist on macOS
/** Every text cell of an .xlsx as `Sheet!A1 -> text`, read by code that shares nothing with the app. */
function dump(bytes) {
  if (!python) { assert.ok(process.env.ALLOW_NO_PYTHON === "1", "independent verifier unavailable: install python3 or set ALLOW_NO_PYTHON=1 to accept degraded verification"); return null; }
  const dir = mkdtempSync(join(tmpdir(), "xlsx-"));
  try { const file = join(dir, "out.xlsx"); writeFileSync(file, bytes); const r = spawnSync(python, ["-I", verifier, file], { encoding: "utf8", maxBuffer: 1 << 28 }); assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout); }
  finally { rmSync(dir, { recursive: true, force: true }); }
}
const repaired = async (bytes, name = "x.xlsx") => { const s = await openSession(bytes, name); return { s, out: await autoRepair(s, emptyReview()) }; };
const sheetOf = (s, name) => s.sheetScans.find(item => item.name === name);

test("a workbook with no MAU9 header is still scanned: every sheet has a status and the damaged cells are reported", async () => {
  const { bytes } = workbookA(), s = await openSession(bytes, "a.xlsx");
  assert.equal(s.wprofile.primary, null, "precondition: nothing matches the MAU9 profile");
  assert.equal(s.sheetScans.length, 2);
  for (const sheet of s.sheetScans) { assert.equal(sheet.status, "issues"); assert.ok(sheet.textCellsSeen > 100); assert.ok(sheet.questionMarkCells > 0); }
  assert.deepEqual([...new Set(s.scan.issues.map(issue => issue.sheet))].sort(), ["Danh muc", "Phu luc"]);
  assert.equal(s.scan.issues.filter(issue => issue.sheet === "Phu luc").length, 3);
});

test("sheet 1 spotless, sheet 2 damaged: sheet 1 is clean AFTER the scan, sheet 2 never clean", async () => {
  const s = await openSession(workbookB().bytes, "b.xlsx");
  assert.equal(sheetOf(s, "Tong hop").status, "clean");
  assert.equal(sheetOf(s, "Chi tiet").status, "issues");
  assert.equal(sheetOf(s, "Chi tiet").questionMarkCells, 1);
  assert.deepEqual(s.scan.issues.map(issue => issue.sheet), ["Chi tiet"]);
});

test("automatic repair needs no profile: accepted repairs change real cells on EVERY sheet and the independent reader agrees", async () => {
  const { bytes, truth } = workbookA(), before = dump(bytes), { s, out } = await repaired(bytes);
  assert.notEqual(out.report.status, "NO_REPAIR_APPLIED");
  assert.ok(out.report.metrics.outputCellsChanged >= 3, `changed ${out.report.metrics.outputCellsChanged}`);
  assert.equal(out.report.metrics.outputUnexpectedChanges, 0);
  const after = dump(out.bytes);
  if (after) {
    const changed = Object.keys(after).filter(key => after[key] !== before[key]);
    for (const key of changed) assert.ok(key in truth, `only damaged cells may change: ${key}`);
    for (const key of changed) assert.equal(after[key], truth[key], key);
    assert.ok(changed.some(key => key.startsWith("Danh muc!")) && changed.some(key => key.startsWith("Phu luc!")), "both sheets changed");
  }
  assert.equal(s.sheetScans.length, out.report.sheets.length);
});

test("the same damaged phrase on two sheets: both cell addresses are patched, one prediction maps to N patches", async () => {
  const { bytes, truth } = workbookA(), { out } = await repaired(bytes), after = dump(out.bytes);
  if (!after) return;
  assert.equal(after["Danh muc!B3002"], truth["Danh muc!B3002"]);
  assert.equal(after["Phu luc!B604"], truth["Phu luc!B604"]);
});

test("a different workbook (other headers, other order, other file name) is repaired the same way; nothing leaks from the first file", async () => {
  const a = await repaired(workbookA().bytes, "first.xlsx"), b = workbookB(), second = await repaired(b.bytes, "completely-different.xlsx");
  const after = dump(second.out.bytes);
  if (after) assert.equal(after["Chi tiet!A1802"], b.truth["Chi tiet!A1802"]);
  assert.equal(second.out.report.sheets.length, 2);
  assert.equal(second.out.report.metrics.outputCellsChanged, 1);
  assert.notEqual(a.out.report.metrics.outputCellsChanged, second.out.report.metrics.outputCellsChanged);
  assert.ok(!JSON.stringify(second.out.report).includes("first.xlsx"));
});

test("a workbook that follows the MAU9 profile on sheet 1 still has its other sheets scanned and repaired", async () => {
  const H = ["MACNTCTD", "MAKH", "MASOBD", "MALOAIBD", "GIATRI", "MOTABDS", "MOTABD", "TENKH"], base = clean(PLAIN, 3600), t = target(PLAIN, 5);
  const mau = [H, ...base.map((p, i) => ["00001", "00123", "A" + i, "303", { n: "5" }, p, p, "Person"])];
  const bytes = buildXlsx([{ name: "MAU9", rows: mau }, { name: "Extra", rows: [["Ten", "Ghi chu"], ...base.slice(0, 400).map(p => [p, "x"]), [damage(t, 0, 0), "x"]] }]);
  const { s, out } = await repaired(bytes);
  assert.equal(s.wprofile.primary, "MAU9");
  assert.equal(sheetOf(s, "Extra").status, "issues");
  assert.ok(s.scan.issues.some(issue => issue.sheet === "Extra"));
  const after = dump(out.bytes);
  if (after) assert.equal(after["Extra!A402"], t);
});

test("legitimate punctuation, identifiers, formulas and numbers are never repaired", async () => {
  const base = clean(PLAIN, 1200), bytes = buildXlsx([{ name: "S", rows: [["Noi dung", "Ma"],
    ...base.map(p => [p, "x"]),
    ["Ban co dong y?", "AB12?3"], ["Anh?", "?"], [{ f: "1+1", v: "?" }, "http://a.example/x?y=1"], [{ n: "12" }, "x"]] }]);
  const { out } = await repaired(bytes), before = dump(bytes), after = dump(out.bytes);
  assert.equal(out.report.metrics.outputCellsChanged, 0);
  assert.equal(out.report.status, "NO_REPAIR_APPLIED");
  if (after) assert.deepEqual(after, before);
  assert.equal(corruptionSpans("Ban co dong y?")[0].kind, "suspected_punctuation");
  assert.equal(corruptionSpans("Anh?")[0].kind, "suspected_punctuation");
  assert.equal(corruptionSpans("can h?")[0].kind, "replacement", "word-final ? after a fragment that is no word is damage");
  assert.equal(corruptionSpans("quy?n s? d?ng d?t").length, 4);
  assert.ok(corruptionSpans("quy?n s? d?ng d?t").every(span => span.kind === "replacement"));
});

test("with no evidence the original is retained and counted as unresolved, never invented", async () => {
  const bytes = buildXlsx([{ name: "S", rows: [["Noi dung"], ["Zq? xk? wv?"], ["Zq? xk? wv?"]] }]);
  const { out } = await repaired(bytes);
  assert.equal(out.report.metrics.outputCellsChanged, 0);
  assert.equal(out.report.status, "NO_REPAIR_APPLIED");
  assert.equal(out.report.unresolved, 2);
  assert.ok(out.fileName.endsWith(".not-repaired.xlsx"));
  assert.deepEqual(out.bytes, bytes, "an unchanged file is handed back byte for byte");
});

test("an ambiguous word (two equally attested fits, no context) stays damaged", async () => {
  const symmetrical = clean(PLAIN, 3600).flatMap(p => /\bban\b/.test(p) ? [p, p.replace(/\bban\b/g, "bon")] : [p]);
  const bytes = buildXlsx([{ name: "S", rows: [["Noi dung"], ...symmetrical.map(p => [p]), ["b?n"]] }]);
  const { out } = await repaired(bytes), after = dump(out.bytes);
  assert.equal(out.report.calibration.enabled, true, "the policy was ON, so leaving the word alone is a decision, not a missing model");
  assert.equal(out.report.metrics.outputCellsChanged, 0);
  assert.equal(out.report.unresolved, 1);
  if (after) assert.equal(after[`S!A${symmetrical.length + 2}`], "b?n");
});

test("hidden rows and inline strings are scanned like any other cell, and patching one cell leaves the others alone", async () => {
  const base = clean(PLAIN, 3600), t = target(PLAIN, 7), u = target(PLAIN, 8);
  const rows = [["Noi dung"], ...base.map(p => [p]), [{ inline: damage(t, 1, 0) }], [damage(u, 0, 0)]];
  const bytes = buildXlsx([{ name: "S", rows, hiddenRows: [rows.length] }]);
  const { s, out } = await repaired(bytes), before = dump(bytes), after = dump(out.bytes);
  assert.equal(sheetOf(s, "S").questionMarkCells, 2);
  assert.equal(sheetOf(s, "S").hiddenRows, 1);
  assert.equal(out.report.metrics.outputCellsChanged, 2);
  if (after) {
    for (const key of Object.keys(before)) if (after[key] !== before[key]) assert.ok([`S!A${rows.length - 1}`, `S!A${rows.length}`].includes(key), key);
    assert.equal(after[`S!A${rows.length - 1}`], t, "the inline-string cell");
    assert.equal(after[`S!A${rows.length}`], u, "the cell of the hidden row");
  }
  assert.equal(out.report.metrics.outputUnexpectedChanges, 0);
});

test("text that carries marks is restored by its marked spelling, then written without marks like the rest of the file", async () => {
  const base = clean(MARKED, 3600), t = target(MARKED, 3);
  const bytes = buildXlsx([{ name: "S", rows: [["Noi dung"], ...base.map(p => [p]), [damage(t, 1, 0)]] }]);
  const { out } = await repaired(bytes), after = dump(out.bytes);
  if (after) assert.equal(after[`S!A${base.length + 2}`], toPlainText(t), "the damaged word is restored, not dropped");
  if (after) assert.ok(base.every((text, i) => after[`S!A${i + 2}`] === toPlainText(text)), "every other text is the same text without marks");
});

test("per sheet counters are reported: text cells, ? cells, candidates, applied, changed", async () => {
  const { out } = await repaired(workbookA().bytes);
  for (const sheet of out.report.sheets) {
    const m = sheet.metrics;
    assert.equal(m.sheetsScanned, 1);
    assert.ok(m.textCellsScanned > 100);
    assert.ok(m.cellsContainingQuestionMark >= 1);
    assert.ok(Number.isInteger(m.patchesCommitted) && Number.isInteger(sheet.verifiedChanges));
  }
  assert.equal(out.report.sheets.reduce((n, sheet) => n + sheet.verifiedChanges, 0), out.report.metrics.outputCellsChanged);
});

test("the independent reader (Python stdlib) is available, so the exported cells above were checked by code that shares nothing with the app", { skip: python ? false : "python is not installed: the cell checks above fell back to the app's own reader" }, () => {
  const sample = dump(workbookB().bytes);
  assert.ok(Object.keys(sample).length > 1000);
});

test("a proper name is never guessed, even when the model is calibrated and every word of it is known", async () => {
  const base = clean(PLAIN, 3600), bytes = buildXlsx([{ name: "S", rows: [["Ho ten", "Mo ta"], ...base.map(p => ["Nguyen Van An", p]), ["Qu?en S? D?ng", "Nguy?n V?n An"]] }]);
  const { out } = await repaired(bytes);
  assert.equal(out.report.calibration.enabled, true);
  assert.equal(out.report.metrics.outputCellsChanged, 0);
  assert.equal(out.report.unresolved, 2);
  assert.equal(textRoleOf("Nguy?n V?n An"), "name");
  assert.equal(textRoleOf("quy?n s? d?ng"), "freeText");
  assert.equal(textRoleOf("AB12?3"), "identifier");
});

test("a reviewer's edit on a sheet the profile does not know settles its issue and the export carries it", async () => {
  const b = workbookB(), s = await openSession(b.bytes, "b.xlsx"), found = s.scan.issues.find(issue => issue.sheet === "Chi tiet");
  assert.ok(found && found.generic === true);
  const still = applyEdits(emptyReview(), s.ctx, [{ sheet: "Chi tiet", row: found.row, col: found.col, value: found.originalValue.replace("?", "?!") }]);
  assert.notEqual(still.states[found.id].status, "verified", "text that still holds a ? settles nothing");
  const state = applyEdits(emptyReview(), s.ctx, [{ sheet: "Chi tiet", row: found.row, col: found.col, value: b.truth["Chi tiet!A1802"] }]);
  assert.equal(state.states[found.id].status, "verified");
  const exported = exportCorrected(s, state), after = dump(exported.bytes);
  assert.equal(exported.changedCells, 1);
  assert.equal(exported.roundTrip.ok, true);
  assert.deepEqual(exported.roundTrip.bySheet, { "Chi tiet": 1 });
  if (after) assert.equal(after["Chi tiet!A1802"], b.truth["Chi tiet!A1802"]);
  assert.equal(summarize(emptyReview(), s.ctx).blocking, 0, "generic issues never gate the JSON conversion");
  assert.ok(summarize(emptyReview(), s.ctx).total >= 1, "but they are counted and reviewable");
});

test("any number of sheets: each one is read to the end, with its own truthful status", async () => {
  const base = clean(PLAIN, 3600), t = target(PLAIN, 11), u = target(PLAIN, 12), v = target(PLAIN, 13);
  const bytes = buildXlsx([
    { name: "Sach", rows: [["Noi dung"], ...base.slice(0, 900).map(p => [p])] },
    { name: "Hong", rows: [["Noi dung"], ...base.slice(900, 1800).map(p => [p]), [damage(t, 0, 0)]] },
    { name: "So lieu", rows: [["A", "B"], [{ n: "1" }, { n: "2" }], [{ n: "3" }, { n: "4" }]] },
    { name: "Trong", rows: [[]] },
    { name: "Ten hong?", rows: [["Noi dung"], ...base.slice(1800, 2700).map(p => [p]), [damage(u, 1, 0)]] },
    { name: "Cuoi", rows: [["Ma", "Mo ta"], ...base.slice(2700).map((p, i) => ["C" + i, p]), ["C9999", damage(v, 0, 0)]] },
  ]);
  const { s, out } = await repaired(bytes), by = Object.fromEntries(s.sheetScans.map(item => [item.name, item]));
  assert.deepEqual(s.sheetScans.map(item => item.name), ["Sach", "Hong", "So lieu", "Trong", "Ten hong?", "Cuoi"]);
  assert.deepEqual(s.sheetScans.map(item => item.status), ["clean", "issues", "clean", "clean", "issues", "issues"]);
  assert.equal(by["Ten hong?"].unrepairableQuestionMarks, 1, "a damaged sheet NAME is reported, not repaired by a cell patch");
  assert.equal(by["So lieu"].textCellsSeen, 2, "only its two header texts are text; the numbers are not");
  assert.deepEqual([...new Set(s.scan.issues.map(issue => issue.sheet))], ["Hong", "Ten hong?", "Cuoi"]);
  assert.equal(out.report.sheets.length, 6);
  assert.equal(out.report.sheets.reduce((n, sheet) => n + sheet.verifiedChanges, 0), out.report.metrics.outputCellsChanged);
  const after = dump(out.bytes);
  if (after) { assert.equal(after[`Hong!A${900 + 2}`], t); assert.equal(after[`Cuoi!B${base.length - 2700 + 2}`], v); }
});

test("every ? is treated as damage by default: even a lone ? or a likely question is flagged at least high", async () => {
  const bytes = buildXlsx([{ name: "S", rows: [["Noi dung"], ["Ban co dong y?"], ["?"], ["Anh?"], ["con h? ba?"]] }]);
  const s = await openSession(bytes, "q.xlsx");
  assert.equal(s.scan.issues.length, 4);
  assert.ok(s.scan.issues.every(issue => issue.severity === "critical" || issue.severity === "high"), s.scan.issues.map(issue => issue.severity).join());
  assert.equal(sheetOf(s, "S").questionMarkCells, 4);
  assert.equal(sheetOf(s, "S").status, "issues");
});

test("a file too small to calibrate still repairs a cell whose exact clean text stands in several cells of the same column", async () => {
  const bytes = buildXlsx([{ name: "S", rows: [["Noi dung"], ["So tiet kiem"], ["So tiet kiem"], ["So tiet kiem"], ["Can ho chung cu"], ["S? ti?t ki?m"], ["Can h? chung c?"]] }]);
  const { out } = await repaired(bytes), after = dump(out.bytes);
  assert.equal(out.report.calibration.enabled, false);
  assert.equal(out.report.metrics.outputCellsChanged, 1, "one exact, repeated clean text fits; the cell with one witness only is left for review");
  assert.equal(out.report.unresolved, 1);
  if (after) { assert.equal(after["S!A6"], "So tiet kiem"); assert.equal(after["S!A7"], "Can h? chung c?"); }
});
