// End-to-end tests of the calibrated-model repair path. Synthetic data only; every output is judged by the independent OOXML parser.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildXlsx } from "./xlsx-builder.mjs";
import { openSession } from "./session.ts";
import { applyEdits, cellKey, emptyReview, newHistory, commit, undo, summarize } from "./review.ts";
import { autoRepair } from "./auto-repair.ts";
import { snapshotProgress, restoreProgress } from "./progress.ts";
import { classifyOutcome, emptyMetrics, metricViolations } from "./repair-metrics.ts";
import { comparePackages, diffCells, cellMap } from "./ooxml-independent.mjs";
import { HEADERS, CLEAN, zeroPatchWorkbook } from "./zero-patch-fixture.mjs";

const row = (n, a, b = a, name = "Synthetic Person") => ["00001", `K${1000 + n}`, `A${n}`, "303", { n: "1234.5599999999999" }, a, b, name];
const corpus = () => CLEAN.map((text, i) => row(i, text));
const run = async (bytes, state = emptyReview()) => { const s = await openSession(bytes, "synthetic.xlsx"); return { s, r: await autoRepair(s, state) }; };

test("the model fills mid-word and word-final ? and leaves every other character alone", async () => {
  const bytes = buildXlsx([{ name: "S", rows: [HEADERS, ...corpus(), row(2000, "may moc tang ba va c? so do so 5"), row(2001, "nha pho duong l?n va gan truong hoc so 3"), row(2002, "x? tang ba?  gan cho")] }]);
  const { r } = await run(bytes);
  const { changed, structural } = diffCells(bytes, r.bytes);
  assert.deepEqual(structural, []);
  const after = Object.fromEntries(changed.map(c => [c.sheet + "!" + c.ref, c.after]));
  assert.equal(after["S!F" + (1602)], "may moc tang ba va co so do so 5");
  assert.equal(after["S!G" + (1602)], "may moc tang ba va co so do so 5", "the twin column is repaired identically");
  assert.equal(after["S!F" + (1603)], "nha pho duong lon va gan truong hoc so 3");
  for (const c of changed) assert.ok([...c.before].every((ch, i) => ch === "?" || ch === c.after[i]) && c.before.length === c.after.length, "only ? characters change");
});

test("text without evidence, real punctuation, names and identifiers are never changed; the status says so", async () => {
  const bytes = buildXlsx([{ name: "S", rows: [HEADERS, ...corpus(), row(2000, "Hello world?"), row(2001, "?? ?? ??"), row(2002, "ma? xq? zz?", "ma? xq? zz?", "Nguy?n Van A")] }]);
  const { r } = await run(bytes);
  const { changed } = diffCells(bytes, r.bytes);
  const refs = changed.map(c => c.ref);
  assert.ok(!refs.some(ref => ["H", "A", "B", "C", "D", "E"].includes(ref.replace(/\d+/g, ""))), "names, codes, ids and numbers untouched");
  assert.ok(!changed.some(c => c.before === "Hello world?" || c.before === "?? ?? ??"), "punctuation and evidence-free cells untouched");
});

test("nothing provable: NO_REPAIR_APPLIED, original bytes, a name that says not repaired, never a success message", async () => {
  const tiny = buildXlsx([{ name: "S", rows: [HEADERS, row(1, "m?y moc"), row(2, "may moc"), row(3, "x? q?")] }]);
  const { r } = await run(tiny);
  assert.equal(r.report.status, "NO_REPAIR_APPLIED");
  assert.equal(r.report.metrics.outputCellsChanged, 0);
  assert.equal(r.report.packageVerdict, "BYTE_IDENTICAL");
  assert.match(r.fileName, /\.not-repaired\.xlsx$/);
  assert.equal(comparePackages(tiny, r.bytes).verdict, "BYTE_IDENTICAL");
  assert.ok(r.report.metrics.cellsContainingQuestionMark > 0 && (r.report.byReasonCode.CALIBRATION_UNAVAILABLE ?? 0) > 0, "the reason histogram explains why");
  assert.equal(Object.keys(r.state.patches).length, 0);
});

test("a shared string used by two cells is patched cell by cell, never in the shared string table", async () => {
  const shared = "may moc tang ba va c? so do so 5";
  const bytes = buildXlsx([{ name: "S", rows: [HEADERS, ...corpus(), row(2000, shared)] }, { name: "Notes", rows: [[shared, shared, { f: "1+1", v: "2" }]] }]);
  const before = cellMap(bytes);
  assert.equal(before.Notes.cells.get("A1").value, shared);
  const { r } = await run(bytes);
  const after = cellMap(r.bytes);
  assert.equal(after.S.cells.get("F" + (1602)).value, "may moc tang ba va co so do so 5");
  // The other sheet is scanned too: each of its two cells that share the string is judged and written on its own.
  assert.equal(after.Notes.cells.get("A1").value, "may moc tang ba va co so do so 5");
  assert.equal(after.Notes.cells.get("B1").value, "may moc tang ba va co so do so 5");
  assert.equal(after.Notes.cells.get("C1").formula, before.Notes.cells.get("C1").formula);
  assert.equal(comparePackages(bytes, r.bytes).differing.includes("xl/sharedStrings.xml"), false, "sharedStrings.xml is not patched globally");
});

test("leading zeros, exact decimals, formulas, hidden rows and untouched sheets survive", async () => {
  const bytes = buildXlsx([{ name: "S", rows: [HEADERS, ...corpus(), row(2000, "may moc tang ba va c? so do so 5")], hiddenRows: [5, 1602] }, { name: "Other", rows: [["00123", { n: "1234.5599999999999" }, { f: "1+1", v: "2" }, "literal?"]] }]);
  const { r } = await run(bytes);
  const d = diffCells(bytes, r.bytes);
  assert.deepEqual(d.structural, []);
  assert.ok(d.changed.every(c => c.sheet === "S"));
  const out = cellMap(r.bytes);
  assert.equal(out.S.cells.get("A2").value, "00001");
  assert.equal(out.S.cells.get("E2").value, "1234.5599999999999");
  assert.equal(out.Other.cells.get("D1").value, "literal?");
});

test("a CSV-packed sheet is scanned like any other column and its line keeps quotes and separators", async () => {
  const line = parts => parts.join("\",\"");
  const packed = [["\"", line(HEADERS), "\""], ...CLEAN.slice(0, 40).map((t, i) => ["\"", line(["00001", `K${i}`, `A${i}`, "303", "12", t, t, "Nguy?n Van A"]), "\""]),
    ["\"", line(["00001", "K99", "A99", "303", "12", "may moc tang ba va c? so do so 5", "may moc tang ba va c? so do so 5", "Nguy?n Van A"]), "\""]];
  const bytes = buildXlsx([{ name: "S", rows: [HEADERS, ...corpus()] }, { name: "Sheet1", rows: packed }]);
  const { r } = await run(bytes);
  const out = cellMap(r.bytes).Sheet1.cells.get("B" + packed.length).value;
  assert.equal(out, line(["00001", "K99", "A99", "303", "12", "may moc tang ba va co so do so 5", "may moc tang ba va co so do so 5", "Nguy?n Van A"]).slice(0), "free-text fields restored, the name field and all separators kept");
  assert.equal(cellMap(r.bytes).Sheet1.cells.get("A" + packed.length).value, "\"");
  assert.ok(r.report.sheets.length === 2 && r.report.sheets[1].metrics.modelAutoAccepted === 1);
});

test("a line the reviewer already edited by hand is kept as typed even when it still holds a ?, and the repair does not fail", async () => {
  const line = parts => parts.join("\",\"");
  const broken = line(["00001", "K99", "A99", "303", "12", "may moc tang ba va c? so do so ?", "may moc tang ba va c? so do so ?", "Nguy?n Van A"]);
  const packed = [["\"", line(HEADERS), "\""], ...CLEAN.slice(0, 40).map((t, i) => ["\"", line(["00001", `K${i}`, `A${i}`, "303", "12", t, t, "Nguy?n Van A"]), "\""]), ["\"", broken, "\""]];
  const bytes = buildXlsx([{ name: "S", rows: [HEADERS, ...corpus()] }, { name: "Sheet1", rows: packed }]);
  const s = await openSession(bytes, "synthetic.xlsx"), r = packed.length;
  const typed = broken.replace("c?", "co");
  const state = applyEdits(emptyReview(), s.ctx, [{ sheet: "Sheet1", row: r, col: 1, value: typed, source: "typed" }]);
  const out = await autoRepair(s, state);
  assert.equal(cellMap(out.bytes).Sheet1.cells.get("B" + r).value, typed, "the typed line is exported exactly as typed");
  assert.equal(out.state.patches[cellKey("Sheet1", r, 1)].source, "typed");
});

test("model-accepted patches are never verified, undo removes them, progress replay keeps provenance", async () => {
  const { s, r } = await run(zeroPatchWorkbook());
  assert.ok(Object.values(r.state.patches).every(p => p.source === "auto_model" && p.modelVersion && p.policyVersion));
  const after = summarize(r.state, s.ctx), before = summarize(emptyReview(), s.ctx);
  assert.equal(after.byStatus.verified, before.byStatus.verified, "no issue became verified by a prediction");
  const history = commit(newHistory(), r.state);
  assert.equal(Object.keys(undo(history).present.patches).length, 0);
  const restored = restoreProgress(snapshotProgress(r.state, s.ctx), s.ctx);
  assert.equal(restored.ok, true);
  assert.equal(restored.patches, Object.keys(r.state.patches).length);
});

test("the repair is local: no network call, and the report holds no cell text", async () => {
  const calls = [];
  const saved = { fetch: globalThis.fetch, xhr: globalThis.XMLHttpRequest, ws: globalThis.WebSocket, beacon: globalThis.navigator?.sendBeacon };
  globalThis.fetch = (...a) => { calls.push(a); throw new Error("network"); };
  globalThis.XMLHttpRequest = class { constructor() { calls.push("xhr"); throw new Error("network"); } };
  globalThis.WebSocket = class { constructor() { calls.push("ws"); throw new Error("network"); } };
  try {
    const { r } = await run(zeroPatchWorkbook());
    assert.equal(calls.length, 0);
    const text = JSON.stringify(r.report);
    for (const secret of ["Synthetic Person", "Nguy", "K1000", "may moc tang ba", "synthetic.xlsx"]) assert.ok(!text.includes(secret), secret);
  } finally { globalThis.fetch = saved.fetch; globalThis.XMLHttpRequest = saved.xhr; globalThis.WebSocket = saved.ws; }
});

test("metric contract: lost patches, unexpected changes and zero-change success are violations", () => {
  const ok = { ...emptyMetrics(), cellsContainingQuestionMark: 5, modelAutoAccepted: 2, patchProposals: 2, patchTargetsUnique: 2, patchesCommitted: 2, outputCellsChanged: 2, unresolved: 1 };
  assert.deepEqual(metricViolations(ok), []);
  assert.equal(classifyOutcome(ok), "REPAIRED_PARTIALLY");
  assert.equal(classifyOutcome({ ...ok, unresolved: 0 }), "REPAIRED_VERIFIED");
  assert.equal(classifyOutcome({ ...ok, outputCellsChanged: 0 }), "NO_REPAIR_APPLIED");
  assert.equal(classifyOutcome({ ...ok, outputUnexpectedChanges: 1 }), "FAILED_VALIDATION");
  assert.ok(metricViolations({ ...ok, outputCellsChanged: 1 }).some(v => /PATCH_NOT_APPLIED/.test(v)));
  assert.ok(metricViolations({ ...ok, patchesCommitted: 0, outputCellsChanged: 0 }).some(v => /no patch/.test(v)));
  assert.ok(metricViolations({ ...ok, patchTargetsUnique: 3 }).length > 0);
});

test("repair is deterministic and cancellable", async () => {
  const a = await run(zeroPatchWorkbook()), b = await run(zeroPatchWorkbook());
  assert.deepEqual(a.r.bytes, b.r.bytes);
  const s = await openSession(zeroPatchWorkbook(), "synthetic.xlsx");
  let stop = false;
  await assert.rejects(autoRepair(s, emptyReview(), { cancelled: () => stop, onProgress: p => { if (p.stage === "validation") stop = true; } }), /cancelled/);
});
