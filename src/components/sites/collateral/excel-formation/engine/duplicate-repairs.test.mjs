import { test } from "node:test";
import assert from "node:assert/strict";
import { buildXlsx } from "./xlsx-builder.mjs";
import { openSession, exportCorrected } from "./session.ts";
import { emptyReview, applyEdits, newHistory, commit, undo, redo, acceptException } from "./review.ts";
import { duplicateSummary, planDuplicateRepair, applyDuplicateRepair } from "./duplicate-repairs.ts";
import { readWorkbook } from "./xlsx-reader.ts";
const headers = ["MACNTCTD", "MAKH", "MASOBD", "MALOAIBD", "GIATRI", "MOTABDS", "MOTABD"];
const row = (asset, text = "May moc thi?t bi 3") => ['001', '002', asset, '303', { n: '1234.5599999999999' }, text, text];
const open = () => openSession(buildXlsx([{ name: 'Test', rows: [headers, row('A'), row('A'), row('A'), row('B'), row('C', 'May moc kh?c 3')] , hiddenRows: [3] }]), 'synthetic.xlsx');

test('identical damaged descriptions group even though no duplicate-conflict issue exists', async () => {
  const s = await open(), summary = duplicateSummary(s);
  assert.equal(s.scan.issues.filter(i => i.category === 'CONFLICTING_DUPLICATE').length, 0);
  assert.equal(summary.withinAsset.groups, 1);
  assert.equal(summary.withinAsset.cells, 6);
  assert.equal(summary.withinAsset.rowOccurrences, 3);
  assert.equal(summary.exactText.groupsAcrossAssets, 1);
  const plan = planDuplicateRepair(s, emptyReview(), 'Test', 2, 5);
  assert.deepEqual(plan.rows, [2, 3, 4]);
  assert.equal(plan.cells, 6);
});
test('one approved repair changes the same-asset group and twins, hidden rows included, as one undo step', async () => {
  const s = await open(), result = applyDuplicateRepair(s, emptyReview(), 'Test', 2, 5, 'May moc thiet bi 3', true);
  assert.equal(result.changedCells, 6);
  assert.equal(Object.keys(undo(commit(newHistory(), result.state)).present.patches).length, 0);
  assert.equal(Object.keys(redo(undo(commit(newHistory(), result.state))).present.patches).length, 6);
  const out = exportCorrected(s, result.state);
  assert.ok(out.roundTrip.ok);
  const wb = readWorkbook(out.bytes, { fileName: 'synthetic.xlsx', fileHash: 'test' });
  for (const r of [2, 3, 4]) for (const col of [5, 6]) assert.equal(wb.sheets[0].rows.find(row => row.r === r).cells[col].v, 'May moc thiet bi 3');
  assert.equal(wb.sheets[0].rows.find(row => row.r === 5).cells[5].v, 'May moc thi?t bi 3');
});
test('includeTwin=false stays in the selected column and never crosses assets', async () => {
  const s = await open(), result = applyDuplicateRepair(s, emptyReview(), 'Test', 2, 5, 'May moc thiet bi 3', false);
  assert.equal(result.plan.distinctAssets, 1);
  assert.equal(result.changedCells, 3);
  assert.ok(Object.values(result.state.patches).every(p => p.col === 5));
});
test('the same asset code under another customer or branch is a different group', async () => {
  const first = row('A'), otherCustomer = [...row('A')], otherBranch = [...row('A')];
  otherCustomer[1] = 'DIFFERENT'; otherBranch[0] = 'DIFFERENT';
  const s = await openSession(buildXlsx([{ name: 'Test', rows: [headers, first, first, otherCustomer, otherBranch] }]), 'synthetic.xlsx');
  const applied = applyDuplicateRepair(s, emptyReview(), 'Test', 2, 5, 'May moc thiet bi 3', true);
  assert.deepEqual(applied.plan.rows, [2, 3]);
  assert.equal(applied.changedCells, 4);
});
test('edited/excepted cells are excluded and known letters/digits cannot be rewritten by a grouped repair', async () => {
  const s = await open();
  let state = applyEdits(emptyReview(), s.ctx, [{ sheet: 'Test', row: 3, col: 5, value: 'May moc thiet bi 3' }]);
  const issue = s.scan.issues.find(i => i.row === 4 && i.col === 5 && i.category === 'QUESTION_MARK_IN_WORD');
  state = acceptException(state, issue.id, 'Checked against the source document').state;
  const plan = planDuplicateRepair(s, state, 'Test', 2, 5);
  assert.equal(plan.skippedEdited, 1); assert.equal(plan.skippedExceptions, 1);
  for (const invalid of ['May moc thiet bi 4', 'New sentence 3', '=EVIL()']) assert.throws(() => applyDuplicateRepair(s, state, 'Test', 2, 5, invalid, true), /missing-character/);
  const applied = applyDuplicateRepair(s, state, 'Test', 2, 5, 'May moc thiet bi 3', true);
  assert.equal(applied.changedCells, 4);
  assert.equal(applied.state.states[issue.id].status, 'accepted_exception');
});

test('identity edits invalidate original membership, including an edited anchor', async () => {
  const s = await open();
  for (const identityCol of [0, 1, 2]) {
    const state = applyEdits(emptyReview(), s.ctx, [{ sheet: 'Test', row: 3, col: identityCol, value: 'DIFFERENT' }]);
    const plan = planDuplicateRepair(s, state, 'Test', 2, 5);
    assert.deepEqual(plan.rows, [2, 4]);
    assert.equal(plan.skippedEdited, 2);
    const applied = applyDuplicateRepair(s, state, 'Test', 2, 5, 'May moc thiet bi 3', true);
    assert.equal(applied.changedCells, 4);
    assert.equal(planDuplicateRepair(s, state, 'Test', 3, 5).canPropagate, false);
    assert.throws(() => applyDuplicateRepair(s, state, 'Test', 3, 5, 'May moc thiet bi 3', true), /no eligible/);
  }
});
