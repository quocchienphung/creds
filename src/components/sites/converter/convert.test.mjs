import { test } from "node:test";
import assert from "node:assert/strict";
import { buildXlsx } from "../collateral/excel-formation/engine/xlsx-builder.mjs";
import { readWorkbook } from "../collateral/excel-formation/engine/xlsx-reader.ts";
import { excelDate, csvField, sheetToCsv, suggestName, ghostOf, fileNameOf } from "./convert.ts";

const open = sheets => readWorkbook(buildXlsx(sheets), { fileName: "t.xlsx", fileHash: "test" });

test("Excel serials: known dates, the 1900 leap-year gap, time of day", () => {
  assert.equal(excelDate(1), "1900-01-01");
  assert.equal(excelDate(61), "1900-03-01");
  assert.equal(excelDate(45000), "2023-03-15");
  assert.equal(excelDate(45000.5), "2023-03-15 12:00:00");
  assert.equal(excelDate(0.75), "18:00:00");
  assert.equal(excelDate(45000.99999999), "2023-03-16", "float noise rounds to the second, it does not become 23:59:59");
});

test("fields are quoted only when the delimiter, a quote or a line break needs it", () => {
  assert.equal(csvField("plain", ","), "plain");
  assert.equal(csvField("a,b", ","), '"a,b"');
  assert.equal(csvField("a,b", ";"), "a,b");
  assert.equal(csvField('say "hi"', ","), '"say ""hi"""');
  assert.equal(csvField("two\nlines", ","), '"two\nlines"');
  assert.equal(csvField("a\tb", "\t"), '"a\tb"');
});

test("a sheet converts with exact numbers, text IDs, dates, empty rows skipped and ragged rows padded", () => {
  const book = open([{ name: "S", styles: { 3: 2 }, rows: [
    ["ID", "Amount", "Note", "Date"],
    ["0012345", { n: "1500000.50" }, "Số 1, Hà Nội", { n: "45000" }],
    [],
    ["x", { n: "0.1" }, 'He said "ok"'],
    [null, null, null, null],
    ["last", { f: "A5", v: "7" }],
  ] }]);
  const sheet = book.sheets[0], result = sheetToCsv(sheet, book.styleKinds, ",", 2);
  assert.equal(result.text, 'ID,Amount,Note,Date\r\n0012345,1500000.50,"Số 1, Hà Nội",2023-03-15\r\nx,0.1,"He said ""ok""",\r\nlast,7,,\r\n');
  assert.deepEqual([result.rows, result.cols, result.skipped, result.dates, result.formulas], [4, 4, 2, 1, 1]);
  assert.equal(result.sample.length, 2);
  assert.equal(sheetToCsv(sheet, book.styleKinds, ";").text.split("\r\n")[1], '0012345;1500000.50;Số 1, Hà Nội;2023-03-15');
});

test("an empty sheet gives an empty file, not a blank line", () => {
  const book = open([{ name: "E", rows: [[], []] }]);
  const result = sheetToCsv(book.sheets[0], book.styleKinds, ",");
  assert.deepEqual([result.text, result.rows, result.cols], ["", 0, 0]);
});

test("file names: suggested from workbook and sheet, completed by ghost text, checked before download", () => {
  assert.equal(suggestName("Orders 2026.xlsx", "Q1/Q2", false), "Orders 2026.csv");
  assert.equal(suggestName("Orders.XLSX", "Q1/Q2", true), "Orders-Q1-Q2.csv");
  assert.equal(suggestName(".xlsx", "", true), "workbook-sheet.csv");
  assert.equal(ghostOf("", "Orders.csv"), "Orders.csv");
  assert.equal(ghostOf("ord", "Orders.csv"), "ers.csv");
  assert.equal(ghostOf("Orders.csv", "Orders.csv"), "");
  assert.equal(ghostOf("x", "Orders.csv"), "");
  assert.equal(fileNameOf("report"), "report.csv");
  assert.equal(fileNameOf(" report.CSV "), "report.CSV");
  for (const bad of ["", "   ", "a/b", "a:b", "..", ".hidden", "x".repeat(200)]) assert.equal(fileNameOf(bad), null, JSON.stringify(bad));
});
