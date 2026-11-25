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

test("every field is quoted once, empty ones included, and a quote already in the text is kept as it is, never doubled", () => {
  assert.equal(csvField("plain"), '"plain"');
  assert.equal(csvField(""), '""');
  assert.equal(csvField("a,b"), '"a,b"');
  assert.equal(csvField('say "hi"'), '"say "hi""');
  assert.equal(csvField('trinh "An cu nhu y"'), '"trinh "An cu nhu y""');
  assert.equal(csvField("two\nlines"), '"two\nlines"');
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
  assert.equal(result.text, '"ID","Amount","Note","Date"\r\n"0012345","1500000.50","Số 1, Hà Nội","2023-03-15"\r\n"x","0.1","He said "ok"",""\r\n"last","7","",""\r\n');
  assert.deepEqual([result.rows, result.cols, result.skipped, result.dates, result.formulas], [4, 4, 2, 1, 1]);
  assert.equal(result.sample.length, 2);
  assert.equal(sheetToCsv(sheet, book.styleKinds, ";").text.split("\r\n")[1], '"0012345";"1500000.50";"Số 1, Hà Nội";"2023-03-15"');
});

test("hidden rows and columns are left out of the CSV, the rest keeps its order", () => {
  const book = open([{ name: "H", hiddenRows: [2], hiddenCols: [1], rows: [["a", "secret", "c"], ["hidden", "x", "y"], ["d", "e", "f"]] }]);
  const result = sheetToCsv(book.sheets[0], book.styleKinds, ",");
  assert.equal(result.text, '"a","c"\r\n"d","f"\r\n');
  assert.deepEqual([result.rows, result.cols, result.skipped, result.hidden], [2, 2, 0, 1]);
});

test("whatever the cell text, a field is the text between exactly one pair of quotes: nothing is added or doubled inside", () => {
  const values = ['"', '""', 'a"b', '"An cu nhu y - Uu dai het y"', 'He said "ok"', "line\nbreak", "", "end"];
  const book = open([{ name: "Q", rows: [values, values] }]);
  for (const delimiter of [",", ";", "\t"]) {
    const { text } = sheetToCsv(book.sheets[0], book.styleKinds, delimiter), line = values.map(v => `"${v}"`).join(delimiter) + "\r\n";
    assert.equal(text, line + line, delimiter);
  }
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
