import { test } from "node:test";
import assert from "node:assert/strict";
import { unzipSync, zipSync, strToU8, strFromU8 } from "fflate";
import { buildXlsx } from "./xlsx-builder.mjs";
import { readWorkbook } from "./xlsx-reader.ts";
import { patchWorkbookBytes, verifyPackageIntegrity, verifyRoundTrip } from "./xlsx-patcher.ts";
const read = bytes => readWorkbook(bytes, { fileName: "synthetic.xlsx", fileHash: "test" });

test("target-only shared strings, all attributes, styles, precision and ZIP parts are preserved", () => {
  const files = unzipSync(buildXlsx([{ name: "Test", rows: [["dam?ged text", "dam?ged text", "00123", { n: "1234.5599999999999" }, { f: "Other!A1", v: "42" }]], styles: { 0: 1, 2: 1 }, autoFilter: true }, { name: "Other", rows: [[{ n: "42" }]] }]));
  files['xl/worksheets/sheet1.xml'] = strToU8(strFromU8(files['xl/worksheets/sheet1.xml']).replace('r="A1"', 'r="A1" cm="7" vm="2" ph="1"').replace('<sheetView workbookViewId="0"/>', '<sheetView workbookViewId="0"><pane xSplit="1" ySplit="1" topLeftCell="B2" state="frozen"/></sheetView>'));
  files['xl/calcChain.xml'] = strToU8('<calcChain xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><c r="E1" i="1"/></calcChain>');
  const original = zipSync(files), workbook = read(original), patches = [{ sheet: "Test", row: 1, col: 0, value: "damaged text & < > 😀\n  x _x0041_", asNumber: false }];
  const output = patchWorkbookBytes(original, workbook, patches).bytes;
  assert.ok(verifyRoundTrip(workbook, output, patches).ok);
  assert.ok(verifyPackageIntegrity(original, output, workbook, patches));
  const out = unzipSync(output);
  for (const key of Object.keys(files).filter(k => k !== 'xl/worksheets/sheet1.xml')) assert.deepEqual(out[key], files[key], key);
  const xml = strFromU8(out['xl/worksheets/sheet1.xml']);
  assert.match(xml, /r="A1" cm="7" vm="2" ph="1" s="1" t="inlineStr"/);
  assert.equal(read(output).sheets[0].rows[0].cells[1].v, "dam?ged text");
  const tampered = { ...out, 'xl/styles.xml': strToU8(strFromU8(out['xl/styles.xml']).replace('numFmtId="49"', 'numFmtId="0"')) };
  assert.equal(verifyPackageIntegrity(original, zipSync(tampered), workbook, patches), false);
});
test("prefixed single-quoted XML patches only its target and keeps all other bytes", () => {
  const files = unzipSync(buildXlsx([{ name: "Test", rows: [["abc? ghi chu", "00123"]] }]));
  files['xl/worksheets/sheet1.xml'] = strToU8(strFromU8(files['xl/worksheets/sheet1.xml']).replace(/="([^"]*)"/g, "='$1'").replace(/<(\/?)([A-Za-z][\w]*)(?=[\s/>])/g, "<$1x:$2").replace('<x:worksheet ', '<x:worksheet xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '));
  const original = zipSync(files), workbook = read(original), patches = [{ sheet: "Test", row: 1, col: 0, value: "abcd ghi chu", asNumber: false }];
  const output = patchWorkbookBytes(original, workbook, patches).bytes;
  assert.ok(verifyRoundTrip(workbook, output, patches).ok);
  assert.ok(verifyPackageIntegrity(original, output, workbook, patches));
});
test("rich text, merged cells and formula-dependent cells cannot be rewritten", () => {
  for (const kind of ["rich", "merge", "array"]) {
    const files = unzipSync(buildXlsx([{ name: "Test", rows: [["abc?", "cell", { f: "1+1", v: "2" }]] }]));
    if (kind === 'rich') files['xl/sharedStrings.xml'] = strToU8(strFromU8(files['xl/sharedStrings.xml']).replace('<t xml:space="preserve">abc?</t>', '<r><rPr><b/></rPr><t>abc?</t></r>'));
    else files['xl/worksheets/sheet1.xml'] = strToU8(strFromU8(files['xl/worksheets/sheet1.xml']).replace(kind === 'merge' ? '</worksheet>' : '<f>', kind === 'merge' ? '<mergeCells count="1"><mergeCell ref="A1:B1"/></mergeCells></worksheet>' : '<f t="array" ref="A1:C1">'));
    const bytes = zipSync(files), wb = read(bytes);
    assert.equal(wb.sheets[0].rows[0].cells[0].protectedText, true, kind);
    assert.throws(() => patchWorkbookBytes(bytes, wb, [{ sheet: 'Test', row: 1, col: 0, value: 'guess', asNumber: false }]), /cannot be patched/);
  }
});
