import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { parse } from "csv-parse/sync";
import { buildXlsx } from "../../components/sites/collateral/excel-formation/engine/xlsx-builder.mjs";
import { cellMap } from "../../components/sites/collateral/excel-formation/engine/ooxml-independent.mjs";
import { columnLetters } from "../../components/sites/collateral/excel-formation/engine/text.ts";
import { convertWorkbook, inspectWorkbook, verifyConversion, safeFileName, ConversionError } from "./conversion-engine.ts";
import { csvField, csvRecord } from "./csv-writer.ts";
import { verifyCsv } from "./csv-verifier.ts";
import { normalizeCell, WarningSink } from "./value-normalizer.ts";

const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const input = (sheets, opts) => ({ name: "t.xlsx", bytes: buildXlsx(sheets, opts) });
const run = async (sheets, options = {}) => (await convertWorkbook(input(sheets), options))[0];
const text = file => new TextDecoder().decode(file.bytes.subarray(file.bytes[0] === 0xef ? 3 : 0));
const parseStd = file => parse(text(file), { delimiter: ",", relax_column_count: false });
const rejects = (promise, code) => assert.rejects(promise, error => error instanceof ConversionError && error.code === code, code);

// R18-shaped, 100% SYNTHETIC: five blank rows, header on Excel row 6, ten text fields, ';' inside values, Vietnamese, leading zeros.
const HEADER = ["MAKH", "MACIC", "TENKH", "MASANPHAM", "NGAYSL", "TENTCTD", "A", "B", "C", "D"];
const r18Rows = n => [[], [], [], [], [], HEADER, ...Array.from({ length: n }, (_, i) => [String(i).padStart(8, "0"), String(9131942734 + i), "NGUYỄN CHÍ NGUYỆN " + i, "R18", "20260930", `NH A; NH B, chi nhánh "${i}"`, i % 7 ? "" : "x;y", " pad ", "", "end"])];

test("R18-shaped sheet: standard_csv keeps every stored string, position, and ';' (checked against the independent OOXML oracle)", async () => {
  const xlsx = input([{ name: "S", rows: r18Rows(11971) }]);
  const [file] = await convertWorkbook(xlsx);
  const rows = parseStd(file), oracle = cellMap(xlsx.bytes).S.cells;
  assert.equal(rows.length, 11972);
  assert.ok(rows.every(row => row.length === 10));
  let compared = 0;
  rows.forEach((row, i) => row.forEach((value, j) => { assert.equal(value, oracle.get(columnLetters(j) + (i + 6))?.value ?? "", `${columnLetters(j)}${i + 6}`); compared++; }));
  assert.equal(compared, 119720);
  assert.equal(rows[1][0], "00000000");
  assert.equal(file.bytes[0], 0xef);
  assert.equal(file.report.verificationStatus, "verified");
  assert.deepEqual([file.report.sourceRange, file.report.headerExcelRow, file.report.sourceRows, file.report.exportedRows, file.report.columnsPerRecord, file.report.mismatchedCellCount], ["A6:J11977", 6, 11972, 11972, 10, 0]);
  assert.deepEqual(file.report.warnings.map(w => w.code), ["DATA_REGION_TRIMMED"]);
  assert.match(file.report.warnings[0].detail, /5 empty row/);
});

test("single_column_csv: outer parse = 1 field per record, second parse restores all 10 fields", async () => {
  const sheets = [{ name: "S", rows: r18Rows(300) }];
  const std = await run(sheets), one = await run(sheets, { outputMode: "single_column_csv" });
  const outer = parse(text(one), { delimiter: "," });
  assert.ok(outer.every(r => r.length === 1));
  assert.deepEqual(outer.map(([line]) => parse(line, { delimiter: "," })[0]), parseStd(std));
  assert.equal(outer[0][0], HEADER.join(","));
  assert.equal(one.report.verificationStatus, "verified");
  assert.equal(one.report.columnsPerRecord, 10);
});

test("single_column_csv with newlines, quotes, commas inside values still round-trips (a record may span physical lines)", async () => {
  const nasty = ["a,b", 'q"uote', "line1\nline2", "crlf\r\nx", " lead", "trail ", "\ttab", "emoji 😀 \u{1F1FB}\u{1F1F3}", "é".normalize("NFD"), "é".normalize("NFC")];
  const sheets = [{ name: "S", rows: [HEADER, nasty] }];
  for (const outputMode of ["standard_csv", "single_column_csv"]) {
    const file = await run(sheets, { outputMode });
    assert.equal(file.report.verificationStatus, "verified_with_warnings", "tab-led text is an injection risk");
    assert.equal(file.report.mismatchedCellCount, 0);
    const rows = outputMode === "standard_csv" ? parseStd(file) : parse(text(file), { delimiter: "," }).map(([l]) => parse(l, { delimiter: "," })[0]);
    assert.deepEqual(rows[1], nasty, outputMode);
  }
});

test("plain_text_comma is byte-identical standard CSV saved as .txt", async () => {
  const sheets = [{ name: "S", rows: [["a", "b,c"], ["1", ""]] }];
  const csv = await run(sheets), txt = await run(sheets, { outputMode: "plain_text_comma" });
  assert.deepEqual(txt.bytes, csv.bytes);
  assert.equal(txt.fileName, "t.txt"); assert.equal(csv.fileName, "t.csv");
  assert.match(txt.mime, /^text\/plain/);
});

test("bom, record delimiter, empty cells in place, ragged rows padded to the range width", async () => {
  const sheets = [{ name: "S", rows: [["a", null, "c"], [], ["x"], [null, null, null, "d"]] }];
  const f = await run(sheets, { bom: false, recordDelimiter: "\n" });
  assert.equal(f.bytes[0], "a".charCodeAt(0));
  assert.equal(new TextDecoder().decode(f.bytes), "a,,c,\n,,,\nx,,,\n,,,d\n");
  assert.equal(f.report.verificationStatus, "verified");
});

test("data_region vs entire_selected_range vs explicitRange: leading rows are reported, never silently dropped", async () => {
  const sheets = [{ name: "S", rows: [[], [], [null, "h1", "h2"], [null, "1", "2"]] }];
  const region = await run(sheets), entire = await run(sheets, { rangePolicy: "entire_selected_range" }), explicit = await run(sheets, { rangePolicy: "entire_selected_range", explicitRange: "b3:c3" });
  assert.deepEqual([region.report.sourceRange, region.report.exportedRows], ["B3:C4", 2]);
  assert.equal(region.report.warnings[0].code, "DATA_REGION_TRIMMED");
  assert.deepEqual([entire.report.sourceRange, entire.report.exportedRows, entire.report.headerExcelRow], ["A1:C4", 4, 3]);
  assert.equal(text(entire), ",,\r\n,,\r\n,h1,h2\r\n,1,2\r\n");
  assert.deepEqual([explicit.report.sourceRange, text(explicit)], ["B3:C3", "h1,h2\r\n"]);
  await rejects(run(sheets, { explicitRange: "A1:B2" }), "invalid_options");
  await rejects(run(sheets, { rangePolicy: "entire_selected_range", explicitRange: "A1:XFD1048576" }), "range_too_large");
  await rejects(run(sheets, { rangePolicy: "entire_selected_range", explicitRange: "B2:A1" }), "invalid_options");
});

test("duplicate and blank headers are kept as they are; no row is filtered, sorted or deduplicated", async () => {
  const f = await run([{ name: "S", rows: [["id", "id", null, "id"], ["1", "1", "", "1"], ["1", "1", "", "1"], [], ["1", "1", "", "1"]] }]);
  assert.equal(text(f), "id,id,,id\r\n1,1,,1\r\n1,1,,1\r\n,,,\r\n1,1,,1\r\n");
});

test("numbers keep their stored text; precision risk, date serials and formulas are reported, never changed", async () => {
  const f = await run([{ name: "S", styles: { 3: 2 }, rows: [["n", "p", "f", "d", "g"], [{ n: "0.1" }, { n: "1234567890123456789" }, { f: "A2+1", v: "1.1" }, { n: "45000" }, { f: "A2", v: "" }], [{ n: "-3E-05" }, { n: "0" }, { f: "SUM(A:A)" }, null, { n: "1500000.50" }]] }]);
  assert.equal(text(f), "n,p,f,d,g\r\n0.1,1234567890123456789,1.1,45000,\r\n-3E-05,0,,,1500000.50\r\n");
  const codes = Object.fromEntries(f.report.warnings.map(w => [w.code, w]));
  assert.equal(codes.NUMERIC_PRECISION_RISK.cell, "B2");
  assert.equal(codes.DATE_AS_SERIAL.cell, "D2");
  assert.match(codes.FORMULA_NO_CACHED_VALUE.detail, /^2 cell/);
  assert.equal(codes.FORMULA_CACHED_UNVERIFIED.cell, "C2");
  assert.equal(f.report.verificationStatus, "verified_with_warnings");
  for (const w of f.report.warnings) assert.ok(!/1234567890123456789|45000/.test(w.detail), "warnings carry no values");
});

test("normalizeCell: booleans, errors, ISO dates and text types", () => {
  const sink = new WarningSink("S"), n = cell => normalizeCell(cell, [], false, sink, 1, 0);
  assert.deepEqual([n({ t: "b", s: 0, v: "1" }), n({ t: "b", s: 0, v: "0" }), n({ t: "e", s: 0, v: "#N/A" }), n({ t: "d", s: 0, v: "2026-01-02T00:00:00Z" }), n({ t: "str", s: 0, v: "  x " }), n(undefined)], ["TRUE", "FALSE", "#N/A", "2026-01-02T00:00:00Z", "  x ", ""]);
  assert.equal(sink.count("EXCEL_ERROR_CELL"), 1);
});

test("CSV injection: lossless by default (warned), excel_view_safe is opt-in and reported as a modification", async () => {
  const rows = [["h", "h2"], ["=1+1", "+cmd"], ["@SUM(A1)", "-2+3"], ["ＳＵＭ", "＝x"], ["safe", "a=b"]];
  const lossless = await run([{ name: "S", rows }]);
  assert.deepEqual(parseStd(lossless).slice(1), rows.slice(1));
  const w = lossless.report.warnings.find(x => x.code === "CSV_FORMULA_INJECTION_RISK");
  assert.match(w.detail, /^5 cell/); assert.equal(w.cell, "A2");
  assert.equal(lossless.report.verificationStatus, "verified_with_warnings");
  const safe = await run([{ name: "S", rows }], { csvFormulaProtection: "excel_view_safe" });
  assert.deepEqual(parseStd(safe).slice(1), [["'=1+1", "'+cmd"], ["'@SUM(A1)", "'-2+3"], ["ＳＵＭ", "'＝x"], ["safe", "a=b"]]);
  assert.match(safe.report.warnings.find(x => x.code === "CSV_VALUE_SANITIZED").detail, /^5 cell/);
  assert.equal(safe.report.warnings.some(x => x.code === "CSV_FORMULA_INJECTION_RISK"), false);
  assert.equal(safe.report.verificationStatus, "verified_with_warnings");
});

test("hidden rows: kept and reported by default, excluded on request", async () => {
  const sheets = [{ name: "S", hiddenRows: [2], rows: [["a"], ["b"], ["c"]] }];
  const kept = await run(sheets), dropped = await run(sheets, { includeHidden: false });
  assert.equal(text(kept), "a\r\nb\r\nc\r\n");
  assert.ok(kept.report.warnings.some(w => w.code === "HIDDEN_INCLUDED"));
  assert.equal(text(dropped), "a\r\nc\r\n");
  assert.deepEqual([dropped.report.sourceRows, dropped.report.exportedRows], [3, 2]);
});

test("multi-sheet: no silent choice, one file per sheet, safe unique names", async () => {
  const xlsx = input([{ name: "Q1/Q2", rows: [["a"]] }, { name: "q1:q2", rows: [["b"]] }, { name: "CON", rows: [["c"]] }, { name: "Dữ liệu", rows: [["d"]] }]);
  await rejects(convertWorkbook(xlsx), "sheet_selection_required");
  await rejects(convertWorkbook(xlsx, { sheetNames: ["nope"] }), "sheet_not_found");
  await rejects(convertWorkbook(xlsx, { sheetNames: ["CON", "CON"] }), "invalid_options");
  const files = await convertWorkbook(xlsx, { sheetNames: ["Q1/Q2", "q1:q2", "CON", "Dữ liệu"] });
  assert.deepEqual(files.map(f => f.fileName), ["Q1_Q2.csv", "q1_q2-2.csv", "_CON.csv", "Dữ liệu.csv"]);
  assert.deepEqual(files.map(f => text(f)), ["a\r\n", "b\r\n", "c\r\n", "d\r\n"]);
  assert.equal(safeFileName("..", ".csv", new Set()), "sheet.csv");
  const one = await convertWorkbook(xlsx, { sheetNames: ["Dữ liệu"] });
  assert.equal(one[0].fileName, "t.csv");
});

test("empty sheet: valid empty output and an EMPTY_RANGE note, not a fake header", async () => {
  const f = await run([{ name: "E", rows: [[], []] }]);
  assert.deepEqual([f.report.sourceRange, f.report.exportedRows, f.report.headerExcelRow, f.report.verificationStatus], ["", 0, null, "verified"]);
  assert.equal(f.report.warnings[0].code, "EMPTY_RANGE");
  const one = await run([{ name: "E", rows: [[], []] }], { outputMode: "single_column_csv" });
  assert.equal(one.report.verificationStatus, "verified");
});

test("a lone empty field is quoted so it is a record, not a blank line", async () => {
  assert.equal(csvRecord([""]), '""'); assert.equal(csvRecord(["", ""]), ",");
  for (const outputMode of ["standard_csv", "single_column_csv"]) {
    const f = await run([{ name: "S", rows: [["x"], [null], ["y"]] }], { outputMode });
    assert.equal(f.report.verificationStatus, "verified", outputMode);
    assert.equal(f.report.exportedRows, 3);
  }
});

test("report hashes are real SHA-256 and the input bytes are never touched", async () => {
  const xlsx = input([{ name: "S", rows: [["a", "b"]] }]), before = sha(xlsx.bytes);
  const [f] = await convertWorkbook(xlsx);
  assert.equal(sha(xlsx.bytes), before);
  assert.equal(f.report.inputSha256, before);
  assert.equal(f.report.outputSha256, sha(f.bytes));
  assert.equal(f.report.outputBytes, f.bytes.length);
});

test("verifier is not a rubber stamp: tampered, truncated, extra-column and wrong-BOM outputs all fail with coordinates", async () => {
  const xlsx = input([{ name: "S", rows: r18Rows(20) }]), [good] = await convertWorkbook(xlsx);
  const check = (bytes, o = {}) => verifyConversion(xlsx, bytes, o);
  assert.equal(check(good.bytes).verificationStatus, "verified");
  const enc = s => new TextEncoder().encode("﻿" + s);
  const lines = text(good).split("\r\n");
  const edited = lines.slice(); edited[3] = edited[3].replace("NGUYỄN", "NGUYEN");
  let r = check(enc(edited.join("\r\n")));
  assert.deepEqual([r.verificationStatus, r.mismatchedCellCount, r.mismatches], ["failed", 1, ["C9"]]);
  r = check(enc(lines.slice(0, 10).join("\r\n") + "\r\n"));
  assert.equal(r.verificationStatus, "failed"); assert.ok(r.mismatchedCellCount > 0);
  r = check(enc(lines.map(l => l + (l ? ",x" : "")).join("\r\n")));
  assert.equal(r.verificationStatus, "failed");
  r = check(good.bytes.subarray(3));
  assert.deepEqual([r.verificationStatus, r.error], ["failed", "BOM_MISMATCH"]);
  r = check(new Uint8Array([0xef, 0xbb, 0xbf, 0xff, 0xfe]));
  assert.equal(r.verificationStatus, "failed");
  r = check(enc('a,"b\r\n'));
  assert.equal(r.verificationStatus, "failed");
  r = check(good.bytes, { outputMode: "single_column_csv" });
  assert.equal(r.verificationStatus, "failed", "a standard CSV is not a single-column CSV");
});

test("verifier catches a lone surrogate that a UTF-8 encoder would silently replace", () => {
  const bytes = new TextEncoder().encode("a\uD800b\r\n");
  const r = verifyCsv([{ r: 1, fields: ["a\uD800b"] }], bytes, { outputMode: "standard_csv", bom: false, recordDelimiter: "\r\n", firstCol: 0, expectedCount: 1, sampled: false });
  assert.deepEqual([r.ok, r.mismatches], [false, ["A1"]]);
});

test("sampled verification is never reported as verified", async () => {
  const f = await run([{ name: "S", rows: r18Rows(50) }], { verification: "sampled" });
  assert.equal(f.report.verificationStatus, "not_verified");
  assert.equal(f.report.verification, "sampled");
  assert.ok(f.report.warnings.some(w => w.code === "VERIFICATION_SAMPLED"));
});

test("invalid inputs fail with structured codes", async () => {
  await rejects(convertWorkbook({ name: "x.xlsx", bytes: new Uint8Array(0) }), "empty");
  await rejects(convertWorkbook({ name: "x.xlsx", bytes: new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0]) }), "legacy-or-encrypted");
  await rejects(convertWorkbook({ name: "x.xlsx", bytes: new TextEncoder().encode("a,b\n1,2\n") }), "not-xlsx");
  const good = buildXlsx([{ name: "S", rows: [["a"]] }]);
  await rejects(convertWorkbook({ name: "x.xlsx", bytes: good.subarray(0, 120) }), "corrupt");
  await rejects(convertWorkbook({ name: "x.xlsx", bytes: new Uint8Array([0x50, 0x4b, 3, 4, 1, 2, 3, 4, 5, 6, 7, 8]) }), "corrupt");
  await rejects(convertWorkbook(input([{ name: "S", rows: [["a"]] }]), { fidelityPolicy: "displayed_value" }), "unsupported_option");
  await rejects(convertWorkbook(input([{ name: "S", rows: [["a"]] }]), { outputMode: "tsv" }), "invalid_options");
  await rejects(convertWorkbook(input([{ name: "S", rows: [["a"]] }]), { delimiter: ";" }), "invalid_options");
  await rejects(convertWorkbook(input([{ name: "S", rows: [["a"]] }]), { recordDelimiter: "\r" }), "invalid_options");
});

test("cancellation: an aborted signal stops before and during the conversion", async () => {
  const xlsx = input([{ name: "S", rows: r18Rows(3000) }]);
  const before = new AbortController(); before.abort();
  await rejects(convertWorkbook(xlsx, { signal: before.signal }), "aborted");
  const during = new AbortController();
  await rejects(convertWorkbook(xlsx, { signal: during.signal }, e => { if (e.phase === "read" && e.fraction > 0) during.abort(); }), "aborted");
});

test("progress: read fractions and exact row totals, no invented percentages", async () => {
  const events = [];
  await convertWorkbook(input([{ name: "S", rows: [["a"], ["b"]] }]), {}, e => events.push(e));
  assert.ok(events.some(e => e.phase === "read"));
  assert.deepEqual(events.filter(e => e.phase !== "read").map(e => [e.phase, e.done, e.total]), [["convert", 2, 2], ["verify", 2, 2]]);
});

test("inspectWorkbook: metadata and risks without any cell value", () => {
  const xlsx = input([{ name: "S", hiddenRows: [7], styles: { 3: 2 }, rows: [[], [], [], [], [], ["ID", "=SECRET", "n", "d"], ["001", "x", { n: "12345678901234567" }, { n: "45000" }], ["002", "y", { n: "1" }, null]] }]);
  const info = inspectWorkbook(xlsx), s = info.sheets[0];
  assert.deepEqual([s.usedRange, s.dataRows, s.columns, s.leadingBlankRows, s.hiddenRows], ["A6:D8", 3, 4, 5, 1]);
  assert.deepEqual(s.columnKinds, [["text"], ["text"], ["text", "number"], ["text", "date"]]);
  const codes = info.risks.map(r => r.code);
  for (const code of ["CSV_FORMULA_INJECTION_RISK", "NUMERIC_PRECISION_RISK", "DATE_AS_SERIAL", "DATA_REGION_TRIMMED", "HIDDEN_INCLUDED"]) assert.ok(codes.includes(code), code);
  assert.ok(!JSON.stringify(info).includes("SECRET"));
});

test("csvField quoting rules", () => {
  assert.deepEqual(["plain", "a,b", 'q"q', "a\rb", " x", "x\t", "a;b"].map(v => csvField(v, false)), ["plain", '"a,b"', '"q""q"', '"a\rb"', '" x"', '"x\t"', "a;b"]);
});

test("throughput on an R18-sized synthetic sheet (numbers are informational)", async t => {
  const xlsx = input([{ name: "S", rows: r18Rows(11971) }]);
  const started = performance.now(), [f] = await convertWorkbook(xlsx);
  t.diagnostic(`${f.report.exportedRows} rows x ${f.report.columnsPerRecord} cols: ${f.report.durationMs} ms convert+verify, ${Math.round(performance.now() - started)} ms with read+hash, ${f.bytes.length} bytes output`);
  assert.equal(f.report.verificationStatus, "verified");
});

// Real acceptance fixture: never searched for or downloaded. Point EXCEL_CSV_REAL_FIXTURE at a local file to run it.
test("REAL R18 fixture", { skip: process.env.EXCEL_CSV_REAL_FIXTURE ? false : "REAL_FIXTURE_NOT_AVAILABLE (set EXCEL_CSV_REAL_FIXTURE=/path/R18.20260930.xlsx)" }, async () => {
  const bytes = new Uint8Array(readFileSync(process.env.EXCEL_CSV_REAL_FIXTURE)), xlsx = { name: "R18.xlsx", bytes }, before = sha(bytes);
  const [std] = await convertWorkbook(xlsx), [one] = await convertWorkbook(xlsx, { outputMode: "single_column_csv" });
  const rows = parseStd(std), oracle = Object.values(cellMap(bytes))[0].cells;
  const expected = Number(process.env.EXCEL_CSV_EXPECT_RECORDS ?? 11972);
  assert.equal(rows.length, expected); assert.ok(rows.every(r => r.length === 10));
  rows.forEach((row, i) => row.forEach((v, j) => assert.equal(v, oracle.get(columnLetters(j) + (i + std.report.headerExcelRow))?.value ?? "")));
  assert.equal(std.report.verificationStatus, "verified"); assert.equal(one.report.verificationStatus, "verified");
  assert.deepEqual(parse(text(one), { delimiter: "," }).map(([l]) => parse(l, { delimiter: "," })[0]), rows);
  assert.equal(sha(bytes), before);
  console.log(JSON.stringify({ ...std.report, warnings: std.report.warnings.map(w => w.code) }));
});

// Regression: a real workbook (1,500 shared formulas on 90,000 rows) was refused as "too large" by a ranges x rows scan.
test("many formula ranges over many rows are accepted, and only the covered cells are protected", async () => {
  const { unzipSync, zipSync, strToU8, strFromU8 } = await import("fflate");
  const { readWorkbook } = await import("../../components/sites/collateral/excel-formation/engine/xlsx-reader.ts");
  const n = 3000, rows = Array.from({ length: n }, (_, i) => [{ f: "B" + (i + 1), v: String(i) }, "x" + i]);
  const files = unzipSync(buildXlsx([{ name: "S", rows }]));
  const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]).replaceAll("<f>", `<f ref="A1:A${n}">`);
  files["xl/worksheets/sheet1.xml"] = strToU8(sheet.replace('<f ref="A1:A3000">B3000', '<f ref="A2999:A3000">B3000'));
  const bytes = zipSync(files);
  const book = readWorkbook(bytes, { fileName: "t.xlsx", fileHash: "" });
  const grid = book.sheets[0].rows;
  assert.ok(grid.every(row => row.cells[0].protectedText), "column A is covered");
  assert.ok(grid.every(row => !row.cells[1].protectedText), "column B is outside every range");
  const [file] = await convertWorkbook({ name: "t.xlsx", bytes });
  assert.equal(file.report.exportedRows, n);
});
