import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildXlsx } from './xlsx-builder.mjs';
import { readWorkbook } from './xlsx-reader.ts';
import { profileWorkbook } from './profile.ts';
import { MAU9_PROFILE } from './mapping-profiles.ts';
import { workbookGridMeta, workbookGridRows } from './workbook-grid.ts';

const long = 'Nội dung thật có dấu và xuống dòng\n'.repeat(90) + 'END-OF-CELL';
const workbook = readWorkbook(buildXlsx([
  { name: 'First', rows: [['CODE', 'DESCRIPTION'], ['00000123', long], [], []], hiddenRows: [2] },
  { name: 'Second', rows: [['OTHER'], ['exact second sheet']] },
  { name: 'Empty', rows: [[], [], []] },
]), { fileName: 'synthetic.xlsx', fileHash: 'test' });
const profile = profileWorkbook(workbook, MAU9_PROFILE);
test('all sheets, trailing empty rows and empty sheet remain reachable', () => {
  const first = workbookGridMeta(workbook, profile, 'First');
  assert.deepEqual(first.sheets, ['First', 'Second', 'Empty']);
  assert.equal(first.lastRow, 4); assert.equal(first.columns.length, 2);
  assert.equal(workbookGridMeta(workbook, profile, 'Empty').lastRow, 3);
  assert.equal(workbookGridMeta(workbook, profile, 'Empty').columns.length, 1);
  assert.equal(workbookGridRows(workbook, profile, {}, 'Second', 2, 1)[0].values[0], 'exact second sheet');
});
test('whole text, whitespace, leading zeros and hidden source rows are preserved', () => {
  const [row] = workbookGridRows(workbook, profile, {}, 'First', 2, 1);
  assert.equal(row.values[0], '00000123'); assert.equal(row.values[1], long); assert.equal(row.hidden, true);
});
test('approved patches overlay the right sheet and blank corrections survive', () => {
  const patches = { 'First\u00012\u00011': { value: '' }, 'Second\u00012\u00010': { value: 'approved' } };
  assert.equal(workbookGridRows(workbook, profile, patches, 'First', 2, 1)[0].values[1], '');
  assert.equal(workbookGridRows(workbook, profile, patches, 'Second', 2, 1)[0].values[0], 'approved');
  assert.equal(workbookGridRows(workbook, profile, {}, 'Second', 2, 1)[0].values[0], 'exact second sheet');
});
test('window limits are bounded and an unknown worksheet is refused', () => {
  assert.equal(workbookGridRows(workbook, profile, {}, 'First', -20, 9999).length, 200);
  assert.equal(workbookGridRows(workbook, profile, {}, 'First', 1_048_576, 200).length, 1);
  assert.throws(() => workbookGridMeta(workbook, profile, 'missing'));
});
