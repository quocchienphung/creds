import { test } from "node:test";
import assert from "node:assert/strict";
import { unzipSync, zipSync, strToU8, strFromU8 } from "fflate";
import { buildXlsx } from "./xlsx-builder.mjs";
import { readWorkbook } from "./xlsx-reader.ts";
import { numberLiteral } from "../../json-formation/engine/json-report.ts";
import { scanXml } from "./xml-scan.ts";
import { openSession } from "./session.ts";
import { autoRepair } from "./auto-repair.ts";
import { emptyReview } from "./review.ts";
const read = bytes => readWorkbook(bytes, { fileName: "synthetic.xlsx", fileHash: "test" });
const alter = fn => { const files = unzipSync(buildXlsx([{ name: "Synthetic", rows: [["😀 tiếng Việt", "00123", { n: "1234.5599999999999" }]], hiddenRows: [1] }])); fn(files); return zipSync(files); };

test("single quotes, namespaces, multiline Unicode and hidden rows retain semantics", () => {
  const bytes = alter(files => {
    for (const key of Object.keys(files).filter(k => /\.xml(?:\.rels)?$/.test(k))) {
      let xml = strFromU8(files[key]).replace(/="([^"]*)"/g, "='$1'");
      if (key.endsWith("sheet1.xml")) xml = xml.replace(/<(\/?)([A-Za-z][\w]*)(?=[\s/>])/g, "<$1x:$2").replace("<x:worksheet ", "<x:worksheet xmlns:x='http://schemas.openxmlformats.org/spreadsheetml/2006/main' ");
      files[key] = strToU8(xml);
    }
  });
  const wb = read(bytes), row = wb.sheets[0].rows[0];
  assert.equal(row.hidden, true);
  assert.deepEqual(row.cells.map(c => c.v), ["😀 tiếng Việt", "00123", "1234.5599999999999"]);
});
test("invalid shared strings, duplicate cells, malformed XML and DTD fail closed", () => {
  for (const change of [
    xml => xml.replace('<v>0</v>', '<v>99999</v>'),
    xml => xml.replace('r="B1"', 'r="A1"'),
    xml => xml.replace('</row>', '</wrong>'),
    xml => xml.replace('<sheetData>', '<!DOCTYPE x [<!ENTITY evil SYSTEM "https://invalid/">]><sheetData>'),
  ]) assert.throws(() => read(alter(files => { files['xl/worksheets/sheet1.xml'] = strToU8(change(strFromU8(files['xl/worksheets/sheet1.xml']))); })), /range|reference|XML/);
});
test("exact exponents do not go through floating point or implicit currency rounding", () => {
  assert.equal(numberLiteral("1.2345599999999999e3"), "1234.5599999999999");
  assert.equal(numberLiteral("900719925474099312345e-2"), "9007199254740993123.45");
  assert.equal(numberLiteral("1e1000000"), null);
  assert.throws(() => [...scanXml('<x a="1" a="2"/>')], /XML/);
});
test("formatting-only empty rows stay out of data validation but their cells are accounted and preserved", async () => {
  const files = unzipSync(buildXlsx([{ name: 'Test', rows: [['MACNTCTD', 'MAKH', 'MASOBD', 'MALOAIBD', 'GIATRI'], ['001', '002', '003', '303', { n: '1' }]] }]));
  files['xl/worksheets/sheet1.xml'] = strToU8(strFromU8(files['xl/worksheets/sheet1.xml']).replace('</sheetData>', '<row r="3" hidden="1"><c r="A3" s="1"/><c r="B3" s="1"/></row></sheetData>'));
  const input = zipSync(files), s = await openSession(input, 'synthetic.xlsx');
  assert.equal(s.workbook.sheets[0].rows.length, 2);
  assert.equal(s.workbook.sheets[0].emptyRows, 1);
  assert.equal(s.workbook.sheets[0].emptyCells, 2);
  assert.ok(!s.scan.issues.some(i => i.row === 3));
  const result = await autoRepair(s, emptyReview());
  assert.equal(result.report.cellsAccounted, 12);
  assert.equal(result.report.rowsAccounted, 3);
  assert.equal(result.report.hiddenRowsIncluded, 1);
  assert.deepEqual(unzipSync(result.bytes)['xl/worksheets/sheet1.xml'], files['xl/worksheets/sheet1.xml']);
});
