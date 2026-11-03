import { test } from "node:test";
import assert from "node:assert/strict";
import { buildXlsx } from "../../excel-formation/engine/xlsx-builder.mjs";
import { openSession } from "../../excel-formation/engine/session.ts";
import { applyEdits, emptyReview, summarize, acceptException } from "../../excel-formation/engine/review.ts";
import { buildReport, encodeAndVerify, numberLiteral, reportDateFrom, reportSchema, stringifyReport, sumDecimals, ASSET_KEYS } from "./json-report.ts";
import { planJson as planJsonRaw, auditJson } from "./json-session.ts";

const HEADERS = ["NGAYDULIEU", "MACNTCTD", "TENCNTCTD", "MAKH", "TENKH", "MASOBD", "MALOAIBD", "NGBDAU", "NGKT", "GIATRI", "GIATRIBDKV", "NGDINHGIA", "GTKHAUTRU", "DSSOHD", "HOTENCSH", "GIAYTOCNCSH", "MSTCSH", "MOTABD", "MOTABDS"];
const row = (o = {}) => { const base = { NGAYDULIEU: "30/09/2026", MACNTCTD: "00000001", TENCNTCTD: "CN MOT", MAKH: "00000123", TENKH: "Cong ty A", MASOBD: "D0001", MALOAIBD: "303", NGBDAU: "20200101", NGKT: null, GIATRI: { n: "1000" }, GIATRIBDKV: { n: "500.10" }, NGDINHGIA: "20210101", GTKHAUTRU: null, DSSOHD: "00901H6568/10R", HOTENCSH: "Nguyen Van A", GIAYTOCNCSH: "001234567890", MSTCSH: null, MOTABD: "May moc", MOTABDS: "May moc", ...o }; return HEADERS.map(h => base[h]); };
const open = rows => openSession(buildXlsx([{ name: "MAU9_TEST", rows: [HEADERS, ...rows] }]), "synthetic.xlsx");
const META = { KB001: "20260930", KB002: "Test User", KB003: "0900000000", KB004: "test@example.invalid" };
const EXPORT_OPTIONS = { ownerPolicy: "distinct", order: "code", file: { tctd: "SYNTH", sequence: "001" } };
// Synthetic valid naming data for tests whose subject is a different gate. The real default is tested separately below.
const planJson = (session, state, meta, options = EXPORT_OPTIONS, summary) => planJsonRaw(session, state, meta, options, summary);
const valueAt = (session, state = emptyReview()) => (r, col) => state.patches[`MAU9_TEST\u0001${r.r}\u0001${col}`]?.value ?? r.cells[col]?.v ?? "";
const build = (session, options, state) => buildReport(session.workbook, session.wprofile, session.profile, valueAt(session, state), META, options);
const rowsOf = () => [
  row(), row({ DSSOHD: "0002/10R", GIATRIBDKV: { n: "0.20" } }), row({ DSSOHD: "00901H6568/10R" }),   // one asset on 3 rows, one repeated contract
  row({ MASOBD: "D0002", HOTENCSH: "Tran B", GIAYTOCNCSH: null, MSTCSH: "0900219073", DSSOHD: "A/B/C 1" }),
  row({ MASOBD: "D0003", HOTENCSH: null, GIAYTOCNCSH: null }),                                       // asset without owner
  row({ MAKH: "00000124", TENKH: "Cong ty B", MASOBD: "D0001" }),                                    // same asset id under another customer: a different asset
  row({ MACNTCTD: "00000002", TENCNTCTD: "CN HAI", MASOBD: "D0001" }),
];

test("exact number handling: literals keep their digits and sums are exact decimals", () => {
  assert.equal(numberLiteral("1500000.50"), "1500000.5");
  assert.equal(numberLiteral("0007"), "7");
  assert.equal(numberLiteral("-0"), "0");
  assert.equal(numberLiteral("abc"), null);
  assert.equal(numberLiteral(""), null);
  assert.equal(sumDecimals(["0.1", "0.2"]), "0.3", "no floating point error");
  assert.equal(sumDecimals(["500.10", "0.20", "500.10"]), "1000.4");
  assert.equal(sumDecimals(["9007199254740993", "1"]), "9007199254740994", "beyond 2^53 is still exact");
  assert.equal(sumDecimals(["5", "-5"]), "0");
  assert.equal(sumDecimals(["1", "x"]), null);
  assert.equal(sumDecimals([]), "0");
});
test("report dates are validated, not parsed leniently", () => {
  assert.equal(reportDateFrom("30/09/2026"), "20260930");
  assert.equal(reportDateFrom("31/02/2026"), null);
  assert.equal(reportDateFrom("20260930"), "20260930");
  assert.equal(reportDateFrom("2026-09-30"), null);
});

test("rows are grouped branch > customer > asset; the asset key includes branch and customer, and repeated rows are not counted as assets", async () => {
  const s = await open(rowsOf());
  const { report, reconciliation: r, problems } = build(s);
  assert.deepEqual(problems, []);
  assert.deepEqual(report.CNTCTD.map(b => b.TTC01), ["00000001", "00000002"], "leading zeros are kept as text");
  assert.deepEqual(report.CNTCTD[0].KHACHHANG.map(c => [c.TTC03, c.THONGTINBD.map(a => a.TS001)]), [["00000123", ["D0001", "D0002", "D0003"]], ["00000124", ["D0001"]]]);
  assert.deepEqual([r.rowsInSheet, r.rowsGrouped, r.rowsUnmatched, r.branches, r.customers, r.assets], [7, 7, 0, 2, 3, 5]);
  assert.deepEqual(r.rowsPerAsset, { 3: 1, 1: 4 }, "why 7 rows are 5 assets");
});
test("order: ascending by code at every level (as the reference), or as first seen in the workbook", async () => {
  const s = await open([row({ MACNTCTD: "00000009", MAKH: "00000200", MASOBD: "B" }), row({ MACNTCTD: "00000009", MAKH: "00000200", MASOBD: "A" }), row({ MACNTCTD: "00000009", MAKH: "00000100", MASOBD: "Z" }), row({ MACNTCTD: "00000003", MAKH: "00000300", MASOBD: "Q" })]);
  const ids = report => report.CNTCTD.map(b => [b.TTC01, b.KHACHHANG.map(c => [c.TTC03, c.THONGTINBD.map(a => a.TS001)])]);
  assert.deepEqual(ids(build(s, { ownerPolicy: "distinct", order: "code" }).report), [["00000003", [["00000300", ["Q"]]]], ["00000009", [["00000100", ["Z"]], ["00000200", ["A", "B"]]]]]);
  assert.deepEqual(ids(build(s, { ownerPolicy: "distinct", order: "source" }).report), [["00000009", [["00000200", ["B", "A"]], ["00000100", ["Z"]]]], ["00000003", [["00000300", ["Q"]]]]]);
  assert.equal(build(s).report.CNTCTD[0].TTC01, "00000003", "code order is the default");
});
test("per-asset rules: first row for the value, exact sum for the allocated value, unique contracts in order, no splitting on /", async () => {
  const s = await open(rowsOf());
  const asset = build(s).report.CNTCTD[0].KHACHHANG[0].THONGTINBD[0];
  assert.equal(asset.TS005.$num, "1000");
  assert.equal(asset.TS006.$num, "1000.4", "500.10 + 0.20 + 500.10");
  assert.deepEqual(asset.TS009, ["00901H6568/10R", "0002/10R"], "the repeated contract is listed once, order of first appearance");
  assert.deepEqual(build(s).report.CNTCTD[0].KHACHHANG[0].THONGTINBD[1].TS009, ["A/B/C 1"], "a slash inside an ID never splits it");
  assert.equal(asset.TS004, "", "an empty end date stays an empty string");
  assert.equal(asset.TS008.$num, "0", "an empty deduction is 0");
  assert.deepEqual([asset.TS010, asset.TS011, asset.TS014, asset.TS015, asset.TS016], [[], [], [], [], []]);
  assert.deepEqual(Object.keys(asset), [...ASSET_KEYS], "keys in the contractual order");
});
test("owners: distinct people are kept, a missing owner is an empty list, nothing is invented", async () => {
  const s = await open([row(), row({ HOTENCSH: "Le C", GIAYTOCNCSH: "999", MSTCSH: null }), row({ MASOBD: "D2", HOTENCSH: null, GIAYTOCNCSH: null })]);
  const distinct = build(s, { ownerPolicy: "distinct", order: "code" });
  const [a, b] = distinct.report.CNTCTD[0].KHACHHANG[0].THONGTINBD;
  assert.deepEqual(a.TS012.map(o => o.TS0121), ["Nguyen Van A", "Le C"]);
  assert.deepEqual(a.TS012[0], { TS0121: "Nguyen Van A", TS0122: "001234567890", TS0123: "" }, "an unknown tax code is an empty string, not a guess");
  assert.deepEqual(b.TS012, []);
  assert.deepEqual([distinct.reconciliation.owners, distinct.reconciliation.assetsWithSeveralOwners, distinct.reconciliation.assetsWithoutOwner], [2, 1, 1]);
  assert.equal(build(s, { ownerPolicy: "first", order: "code" }).report.CNTCTD[0].KHACHHANG[0].THONGTINBD[0].TS012.length, 1);
});
test("rows without a key are counted as unmatched and reported, never dropped quietly", async () => {
  const s = await open([row(), row({ MASOBD: null }), row({ MAKH: "" })]);
  const { reconciliation: r, problems } = build(s);
  assert.deepEqual([r.rowsInSheet, r.rowsGrouped, r.rowsUnmatched], [3, 1, 2]);
  assert.match(problems[0], /2 rows/);
});
test("TS013 is the approved text of the reviewed cell, not the stale source", async () => {
  const s = await open([row({ MOTABD: "Ke ho?ch", MOTABDS: "Ke ho?ch" })]);
  const col = HEADERS.indexOf("MOTABDS");
  const state = applyEdits(emptyReview(), s.ctx, [{ sheet: "MAU9_TEST", row: 2, col, value: "Ke hoach" }]);
  assert.equal(build(s).report.CNTCTD[0].KHACHHANG[0].THONGTINBD[0].TS013, "Ke ho?ch");
  assert.equal(build(s, undefined, state).report.CNTCTD[0].KHACHHANG[0].THONGTINBD[0].TS013, "Ke hoach");
});

test("output is deterministic, tab-indented UTF-8 that parses and passes the schema", async () => {
  const s = await open(rowsOf());
  const a = encodeAndVerify(build(s).report), b = encodeAndVerify(build(s).report);
  assert.deepEqual(a.bytes, b.bytes);
  assert.equal(a.verification.ok, true, JSON.stringify(a.verification));
  const text = new TextDecoder("utf-8", { fatal: true }).decode(a.bytes);
  assert.ok(text.startsWith("{\n\t\"KB001\": \"20260930\""));
  assert.ok(!text.includes("\r"));
  assert.ok(text.includes("\"TS005\": 1000,"), "numbers are numbers, not strings");
  assert.ok(text.includes("\"TS010\": []"));
  assert.equal(JSON.parse(text).CNTCTD.length, 2);
});
test("the schema is strict: extra keys, wrong types and bad dates are refused, so review metadata cannot leak into the contract", () => {
  const good = { KB001: "20260930", KB002: "a", KB003: "b", KB004: "c", CNTCTD: [] };
  assert.equal(reportSchema.safeParse(good).success, true);
  assert.equal(reportSchema.safeParse({ ...good, review: { status: "ok" } }).success, false);
  assert.equal(reportSchema.safeParse({ ...good, KB001: "20261301" }).success, false);
  assert.equal(reportSchema.safeParse({ ...good, KB002: "" }).success, false);
  const asset = { TS001: "A", TS002: "303", TS003: "20200101", TS004: "", TS005: 1, TS006: 2, TS007: "20210101", TS008: 0, TS013: "x", TS009: ["c"], TS010: [], TS011: [], TS012: [], TS014: [], TS015: [], TS016: [] };
  const tree = a => ({ ...good, CNTCTD: [{ TTC01: "1", TTC02: "n", KHACHHANG: [{ TTC03: "2", TTC04: "m", THONGTINBD: [a] }] }] });
  assert.equal(reportSchema.safeParse(tree(asset)).success, true);
  assert.equal(reportSchema.safeParse(tree({ ...asset, TS005: "1" })).success, false, "an amount must be a number");
  assert.equal(reportSchema.safeParse(tree({ ...asset, TS010: ["x"] })).success, true, "shared-branch entries are now mapped strings");
  assert.equal(reportSchema.safeParse(tree({ ...asset, TS010: [1] })).success, false, "shared-branch entries must be strings");
  assert.equal(reportSchema.safeParse(tree({ ...asset, extra: 1 })).success, false);
  assert.equal(reportSchema.safeParse(tree({ ...asset, TS003: "2020-01-01" })).success, false);
});
test("an unpaired surrogate cannot slip into a valid UTF-8 file", () => {
  const asset = { TS001: "A", TS002: "303", TS003: "", TS004: "", TS005: { $num: "1" }, TS006: { $num: "1" }, TS007: "", TS008: { $num: "0" }, TS013: "x", TS009: [], TS010: [], TS011: [], TS012: [], TS014: [], TS015: [], TS016: [] };
  const tree = name => ({ ...META, CNTCTD: [{ TTC01: "1", TTC02: name, KHACHHANG: [{ TTC03: "2", TTC04: "x", THONGTINBD: [asset] }] }] });
  assert.equal(encodeAndVerify(tree("fine")).verification.ok, true);
  const bad = encodeAndVerify(tree("bad\ud800"));
  assert.equal(bad.verification.utf8, false, "the lone surrogate is caught before it is encoded");
  assert.equal(bad.verification.ok, false);
  assert.equal(encodeAndVerify(tree("pair \ud83d\ude00")).verification.ok, true, "a valid surrogate pair is fine");
});
test("stringify keeps the given key order and writes empty containers compactly", () => {
  assert.equal(stringifyReport({ b: 1, a: [], c: {} }), "{\n\t\"b\": 1,\n\t\"a\": [],\n\t\"c\": {}\n}");
  assert.equal(stringifyReport({ n: { $num: "0.30" } }), "{\n\t\"n\": 0.30\n}");
});

// ── gate ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
test("the JSON stays locked while a serious issue is open, and opens when it is resolved", async () => {
  const s = await open([row({ MOTABD: "Ke ho?ch", MOTABDS: "Ke ho?ch" }), row({ MASOBD: "D2" })]);
  const st = emptyReview();
  const locked = planJson(s, st, META, undefined, summarize(st, s.ctx));
  assert.equal(locked.ready, false);
  assert.equal(locked.bytes, null, "no bytes are offered while locked");
  assert.equal(locked.checks.find(c => c.id === "serious-issues").ok, false);
  const col = n => HEADERS.indexOf(n);
  const fixed = applyEdits(st, s.ctx, [{ sheet: "MAU9_TEST", row: 2, col: col("MOTABDS"), value: "Ke hoach" }, { sheet: "MAU9_TEST", row: 2, col: col("MOTABD"), value: "Ke hoach" }]);
  const ready = planJson(s, fixed, META, undefined, summarize(fixed, s.ctx));
  assert.equal(ready.ready, true, JSON.stringify(ready.checks.filter(c => !c.ok)));
  assert.ok(ready.bytes.length > 100);
  assert.equal(JSON.parse(new TextDecoder().decode(ready.bytes)).CNTCTD[0].KHACHHANG[0].THONGTINBD[0].TS013, "Ke hoach");
  assert.deepEqual(ready.checks.map(c => c.id), ["serious-issues", "mapping", "metadata", "grouping", "file-name", "schema", "template", "utf8", "replay", "counts", "ts013"]);
});
test("an accepted exception unlocks the export and stays visible in the audit report", async () => {
  const s = await open([row({ MOTABD: "Hop dong co dung?", MOTABDS: "Hop dong co dung?" })]);
  let st = emptyReview();
  for (const issue of s.scan.issues.filter(i => i.severity === "critical" || i.severity === "high")) { const r = acceptException(st, issue.id, "A real question"); st = r.state; }
  const plan = planJson(s, st, META, undefined, summarize(st, s.ctx));
  assert.equal(plan.ready, true);
  const audit = JSON.parse(plan.audit);
  assert.ok(audit.issues.some(i => i.status === "accepted_exception" && i.exceptionRecorded));
  assert.ok(!plan.audit.includes("A real question"));
});
test("metadata is required and is never taken from anywhere else", async () => {
  const s = await open([row()]);
  const st = emptyReview();
  for (const bad of [{ ...META, KB002: "" }, { ...META, KB001: "20260231" }, { ...META, KB004: "  " }]) assert.equal(planJson(s, st, bad, undefined, summarize(st, s.ctx)).checks.find(c => c.id === "metadata").ok, false);
  assert.equal(planJson(s, st, META, undefined, summarize(st, s.ctx)).workbookDate, "20260930", "the date the workbook carries is offered to pre-fill the form");
});
test("the real default export remains blocked until explicit file-naming metadata is supplied", async () => {
  const s = await open([row()]), state = emptyReview();
  const plan = planJsonRaw(s, state, META, undefined, summarize(state, s.ctx));
  assert.equal(plan.ready, false);
  assert.equal(plan.bytes, null);
  assert.equal(plan.checks.find(c => c.id === "file-name").ok, false);
});
test("the audit report has coordinates and opaque IDs, without cell fingerprints or text", async () => {
  const s = await open([row({ TENKH: "Cong ty Bi Mat", MOTABD: "Ke ho?ch bi mat", MOTABDS: "Ke ho?ch bi mat" })]);
  const st = applyEdits(emptyReview(), s.ctx, [{ sheet: "MAU9_TEST", row: 2, col: HEADERS.indexOf("MOTABDS"), value: "Ke hoach bi mat" }]);
  const plan = planJson(s, st, META, undefined, summarize(st, s.ctx));
  for (const text of [plan.audit, plan.csv]) { assert.ok(!text.includes("bi mat"), "no cell text"); assert.ok(!text.includes("Cong ty")); assert.ok(!text.includes(META.KB002), "no contact details"); }
  const audit = JSON.parse(plan.audit);
  assert.equal(audit.privacy.cellValuesIncluded, false);
  assert.equal(audit.patchCount, 1);
  assert.equal(audit.patches[0].newFingerprint, undefined);
  assert.equal(audit.file.hash, undefined);
  assert.ok(!plan.audit.includes(s.workbook.fileHash));
  assert.ok(plan.csv.startsWith("sheet,row,column,category"));
  assert.ok(typeof auditJson === "function");
});
