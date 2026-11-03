import { test } from "node:test";
import assert from "node:assert/strict";
import { zipSync, strToU8, unzipSync as fflateUnzip } from "fflate";
import { buildXlsx } from "./xlsx-builder.mjs";
import { readWorkbook, CreditImportError, checkSignature } from "./xlsx-reader.ts";
import { readXmlText, writeXmlText, columnLetters, columnIndex } from "./text.ts";

const read = (bytes, name = "synthetic.xlsx") => readWorkbook(bytes, { fileName: name, fileHash: "test" });

test("column letters round-trip across the single/double letter boundary", () => {
  for (const index of [0, 1, 25, 26, 27, 39, 701, 702]) assert.equal(columnIndex(columnLetters(index)), index);
  assert.equal(columnLetters(36), "AK");
  assert.equal(columnLetters(21), "V");
});

test("OOXML text: entities and _xHHHH_ control escapes decode, and writing is the exact inverse", () => {
  assert.equal(readXmlText("a&amp;b &lt;c&gt; &#65;&#x42;"), "a&b <c> AB");
  assert.equal(readXmlText("ho_x0007_ch"), "ho\u0007ch");
  assert.equal(readXmlText("_x005F_x0041_"), "_x0041_", "an escaped underscore decodes once and does not become a second escape");
  for (const sample of ["plain", "tab\tnewline\n", "a&b<c>\"d\"", "ctl\u0001\u0007x", "literal _x0041_ text", "emoji \u{1F600}"]) {
    assert.equal(readXmlText(writeXmlText(sample)), sample, JSON.stringify(sample));
  }
});

test("reads cell types, coordinates, hidden rows and keeps IDs as text", () => {
  const wb = read(buildXlsx([{
    name: "DATA",
    autoFilter: true,
    hiddenRows: [3],
    rows: [["ID", "AMOUNT", "TEXT", "DATE"], ["0012345", { n: "1500000.50" }, { inline: "inline text" }, "20260930"], ["x", { n: "0" }, null, "20260101"], [], ["last"]],
  }]));
  const sheet = wb.sheets[0];
  assert.equal(sheet.name, "DATA");
  assert.equal(sheet.part, "xl/worksheets/sheet1.xml");
  assert.equal(sheet.autoFilter, true);
  assert.equal(sheet.hiddenRows, 1);
  assert.equal(sheet.emptyRows, 1, "the empty row 4 is counted, not stored");
  assert.deepEqual(sheet.rows.map(row => row.r), [1, 2, 3, 5]);
  const row2 = sheet.rows[1];
  assert.deepEqual([row2.cells[0].t, row2.cells[0].v], ["s", "0012345"], "leading zeros survive");
  assert.deepEqual([row2.cells[1].t, row2.cells[1].v], ["n", "1500000.50"], "number kept as its text");
  assert.deepEqual([row2.cells[2].t, row2.cells[2].v], ["inlineStr", "inline text"]);
  assert.equal(sheet.rows[2].hidden, true);
  assert.equal(sheet.rows[2].cells[2], undefined, "an absent cell is a hole");
  assert.equal(sheet.maxCol, 4);
});

test("shared strings: rich text runs are joined and phonetic runs are skipped", () => {
  const bytes = buildXlsx([{ name: "S", rows: [["plain"]] }]);
  // Replace the shared string table with rich text + phonetic data.
  const files = fflateUnzip(bytes);
  files["xl/sharedStrings.xml"] = strToU8(`<?xml version="1.0"?><sst xmlns="x" count="1" uniqueCount="1"><si><r><t>Ke </t></r><r><rPr/><t xml:space="preserve">hoach</t></r><rPh sb="0" eb="1"><t>IGNORED</t></rPh></si></sst>`);
  const wb = read(zipSync(files));
  assert.equal(wb.sheets[0].rows[0].cells[0].v, "Ke hoach");
});

test("control characters stored as _xHHHH_ are decoded so the detector can see them", () => {
  const wb = read(buildXlsx([{ name: "S", rows: [["contract\u0007/1"]] }]));
  assert.equal(wb.sheets[0].rows[0].cells[0].v, "contract\u0007/1");
});

test("styles: date, text and number formats are classified for the profile", () => {
  const wb = read(buildXlsx([{ name: "S", rows: [["a", "b", "c"]], styles: { 0: 1, 1: 2 } }]));
  assert.deepEqual(wb.styleKinds, ["general", "text", "date"]);
  assert.equal(wb.sheets[0].rows[0].cells[0].s, 1);
});

test("formulas are counted and flagged, never evaluated", () => {
  const wb = read(buildXlsx([{ name: "S", rows: [[{ n: "1" }, { f: "A1+1", v: "2" }, { f: "A1+2" }]] }]));
  assert.equal(wb.sheets[0].formulaCount, 2);
  assert.equal(wb.sheets[0].rows[0].cells[1].f, true);
  assert.equal(wb.sheets[0].rows[0].cells[2].f, true, "a formula without a cached value is still present");
  assert.equal(wb.sheets[0].rows[0].cells[2].v, "");
});

test("macro projects are noted and left alone", () => {
  const wb = read(buildXlsx([{ name: "S", rows: [["a"]] }], { macro: true }));
  assert.ok(wb.notes.some(note => /macro/i.test(note)));
});

test("hostile or wrong input fails closed with a clear code", () => {
  const code = fn => { try { fn(); } catch (error) { return error instanceof CreditImportError ? error.code : "other:" + error; } return "no error"; };
  assert.equal(code(() => read(new Uint8Array())), "empty");
  assert.equal(code(() => read(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0, 0, 0, 0]))), "legacy-or-encrypted");
  assert.equal(code(() => read(strToU8("a,b\n1,2"))), "not-xlsx");
  assert.equal(code(() => read(new Uint8Array([0x50, 0x4b, 3, 4, 1, 2, 3, 4, 5, 6]))), "corrupt");
  assert.equal(code(() => read(zipSync({ "hello.txt": strToU8("hi") }))), "no-workbook");
  const bomb = zipSync({ "xl/workbook.xml": strToU8("<workbook/>"), "xl/worksheets/sheet1.xml": new Uint8Array(30_000_000) }, { level: 9 });
  assert.equal(code(() => read(bomb)), "zip-bomb");
  assert.throws(() => checkSignature(new Uint8Array(130 * 1024 * 1024)), /larger/);
});

test("the sheet is found through the workbook relationships, not by file name", () => {
  const files = fflateUnzip(buildXlsx([{ name: "Second", rows: [["x"]] }]));
  files["xl/worksheets/custom-name.xml"] = files["xl/worksheets/sheet1.xml"]; delete files["xl/worksheets/sheet1.xml"];
  files["xl/_rels/workbook.xml.rels"] = strToU8(new TextDecoder().decode(files["xl/_rels/workbook.xml.rels"]).replace("worksheets/sheet1.xml", "worksheets/custom-name.xml"));
  const wb = read(zipSync(files));
  assert.equal(wb.sheets[0].name, "Second");
  assert.equal(wb.sheets[0].part, "xl/worksheets/custom-name.xml");
});
