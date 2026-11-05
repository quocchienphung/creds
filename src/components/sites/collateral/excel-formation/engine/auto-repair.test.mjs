import { test } from "node:test";
import assert from "node:assert/strict";
import { buildXlsx } from "./xlsx-builder.mjs";
import { openSession } from "./session.ts";
import { emptyReview, newHistory, commit, undo, redo } from "./review.ts";
import { autoRepair } from "./auto-repair.ts";
import { corruptionSpans, matchesMask } from "./corruption-span.ts";
import { readWorkbook } from "./xlsx-reader.ts";
import { snapshotProgress, restoreProgress } from "./progress.ts";
import { repairFixture } from "./auto-repair-fixture.mjs";
const headers = ["MACNTCTD", "MAKH", "MASOBD", "MALOAIBD", "GIATRI", "MOTABDS", "MOTABD", "TENKH"];
const row = (id, text, twin = text) => ["00001", "00123", id, "303", { n: "1234.5599999999999" }, text, twin, "Synthetic Person"];

test("mask NFA preserves all unmasked characters, Unicode, digits, and allows variable length", () => {
  for (const [broken, source] of [["?ổ", "Sổ"], ["ti?t", "tiết"], ["ki?m", "kiệm"], ["Quy?n", "Quyền"], ["s?", "sử"], ["d?ng", "dụng"], ["?ất", "đất"], ["?abc", "xyzabc"], ["a??z", "abcdz"], ["😀 a? 3", "😀 abc 3"], ["Ca?e\u0301", "Cafe\u0301"], ["a�b", "aếb"]]) assert.equal(matchesMask(broken, source), true, broken);
  for (const [a, b] of [["d?t", "đất"], ["ab? 3", "abcd 4"], ["ab?", "ab3"], ["?abc", "abc"], ["abc?", "abXde"], ["a?", "a="], ["a?", "a?"]]) assert.equal(matchesMask(a, b), false);
  assert.equal(corruptionSpans("Anh?")[0].kind, "suspected_punctuation");
  assert.equal(corruptionSpans("can ho ba? tang 3")[0].kind, "replacement");
  assert.equal(corruptionSpans("Việt 😀").length, 0);
});

test("one-click repair covers every sheet, source retrieval only, redacted report and immutable input", async () => {
  const input = repairFixture(), original = input.slice(), s = await openSession(input, "synthetic.xlsx");
  const progress = [], result = await autoRepair(s, emptyReview(), { onProgress: p => progress.push(p.stage) });
  assert.deepEqual(input, original);
  assert.equal(result.report.applied, 2);
  assert.equal(result.report.status, "REPAIRED_PARTIALLY");
  assert.ok(result.report.unresolved >= 5);
  assert.equal(result.report.hiddenRowsIncluded, 1);
  const out = readWorkbook(result.bytes, { fileName: "synthetic.xlsx", fileHash: "test" });
  for (const r of [2, 4]) assert.equal(out.sheets[0].rows.find(row => row.r === r).cells[5].v, s.workbook.sheets[0].rows.find(row => row.r === r).cells[6].v);
  assert.equal(out.sheets[0].rows.find(r => r.r === 3).cells[5].v, "Quy?n s? d?ng d?t", "unmasked d cannot be silently changed to đ");
  assert.equal(out.sheets[0].rows.find(r => r.r === 5).cells[5].v, "Anh?");
  // Nothing of the other sheet changes except the decomposed letter, which is written composed.
  assert.equal(out.sheets[1].rows[1].cells[1].v, "Caf\u00e9");
  assert.deepEqual(out.sheets[1].rows[0], s.workbook.sheets[1].rows[0]);
  assert.equal(out.sheets[1].rows[1].cells[0].v, s.workbook.sheets[1].rows[1].cells[0].v);
  assert.equal(out.sheets[0].rows[1].cells[4].v, "1234.5599999999999");
  const strings = value => typeof value === "string" ? [value] : value && typeof value === "object" ? Object.entries(value).flatMap(([key, item]) => [key, ...strings(item)]) : [];
  const reportStrings = strings(result.report);
  for (const sensitive of ["Sổ tiết kiệm", "00001", "00123", "Synthetic Person", "1234.5599999999999", s.workbook.fileHash, "synthetic.xlsx", "original", "proposed"]) assert.ok(reportStrings.every(str => !str.includes(sensitive)), sensitive);
  assert.equal(result.report.cellsAccounted, s.workbook.sheets.reduce((n, sheet) => n + sheet.rows.reduce((n, row) => n + row.cells.filter(Boolean).length, 0), 0));
  assert.deepEqual([...new Set(progress)], ["evidence_index", "candidate_generation", "validation", "patch", "package_verification", "download"]);
  assert.equal(result.report.byStatus.model_auto_accepted, 0);
});

test("same input gives same decisions/output, history Undo/Redo and replay retain corrections", async () => {
  const s = await openSession(repairFixture(), "synthetic.xlsx"), st = emptyReview();
  const a = await autoRepair(s, st), b = await autoRepair(s, st);
  assert.deepEqual(a.report.locations, b.report.locations);
  assert.deepEqual(a.bytes, b.bytes);
  const history = commit(newHistory(), a.state);
  assert.equal(Object.keys(undo(history).present.patches).length, 0);
  assert.equal(Object.keys(redo(undo(history)).present.patches).length, 3, "two repairs and one cleaned letter");
  const restored = restoreProgress(snapshotProgress(a.state, s.ctx), s.ctx);
  assert.equal(restored.ok, true);
  assert.equal(restored.patches, 3);
});

test("cancellation yields before committing any edits", async () => {
  const s = await openSession(repairFixture(), "synthetic.xlsx"), st = emptyReview();
  let cancel = false;
  await assert.rejects(autoRepair(s, st, { cancelled: () => cancel, onProgress: p => { if (p.stage === "validation") cancel = true; } }), /cancelled/);
  assert.deepEqual(st, emptyReview());
});

test("no evidence, unrelated entity, conflicting sources and protected names never auto-apply", async () => {
  const s = await openSession(buildXlsx([{ name: "Test", rows: [headers, row("A", "a?c ghi chu"), row("B", "abc ghi chu"), row("C", "ab? ghi chu", "abc ghi chu"), row("C", "abd ghi chu"), [...row("D", "Clean"), "?name"]] }]), "synthetic.xlsx");
  const result = await autoRepair(s, emptyReview());
  assert.equal(result.report.applied, 0);
  assert.ok(result.report.locations.some(d => d.reasonCode === "conflicting_clean_sources"));
});
