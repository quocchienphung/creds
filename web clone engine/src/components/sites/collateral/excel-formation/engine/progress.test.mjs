import { test } from "node:test";
import assert from "node:assert/strict";
import { buildXlsx } from "./xlsx-builder.mjs";
import { openSession } from "./session.ts";
import { restoreProgress, snapshotProgress } from "./progress.ts";
import { acceptException, applyEdits, emptyReview, summarize } from "./review.ts";

const HEADERS = ["NGAYDULIEU", "MACNTCTD", "TENCNTCTD", "MAKH", "TENKH", "MASOBD", "MALOAIBD", "NGBDAU", "GIATRI", "GIATRIBDKV", "NGDINHGIA", "DSSOHD", "HOTENCSH", "MOTABD", "MOTABDS"];
const row = (o = {}) => { const base = { NGAYDULIEU: "30/09/2026", MACNTCTD: "00000001", TENCNTCTD: "CN TEST", MAKH: "00000123", TENKH: "Cong ty Mau", MASOBD: "D0001", MALOAIBD: "303", NGBDAU: "20200101", GIATRI: { n: "1000" }, GIATRIBDKV: { n: "500" }, NGDINHGIA: "20210101", DSSOHD: "0001/10R", HOTENCSH: "Nguyen Van A", MOTABD: "Ke hoach trien khai", MOTABDS: "Ke hoach trien khai", ...o }; return HEADERS.map(h => base[h]); };
const open = (rows, extra = {}) => openSession(buildXlsx([{ name: "MAU9_TEST", autoFilter: true, hiddenRows: [3], rows: [HEADERS, ...rows], ...extra }]), "synthetic.xlsx");
const col = name => HEADERS.indexOf(name);
const find = (session, field, category, r) => session.scan.issues.find(i => i.field === field && i.category === category && (r === undefined || i.row === r));
const edit = (session, state, field, r, value) => applyEdits(state, session.ctx, [{ sheet: "MAU9_TEST", row: r, col: col(field), value }]);
const fixtureRows = () => [row({ MASOBD: "C1" }), row({ MASOBD: "C2" }), row({ MASOBD: "X1", MOTABD: "Ke ho?ch trien khai", MOTABDS: "Ke ho?ch trien khai" })];

const worked = async () => {
  const s = await open(fixtureRows());
  const issue = find(s, "MOTABDS", "QUESTION_MARK_IN_WORD");
  let state = edit(s, emptyReview(), "MOTABDS", issue.row, "Ke hoach trien khai");
  const other = s.scan.issues.find(i => i.id !== issue.id && i.severity !== "critical") ?? null;
  return { s, issue, state, other };
};

test("saved progress restores to exactly the same state on the same file", async () => {
  const { s, state } = await worked();
  const file = JSON.parse(JSON.stringify(snapshotProgress(state, s.ctx)));
  const again = await open(fixtureRows());
  const result = restoreProgress(file, again.ctx);
  assert.equal(result.ok, true);
  assert.equal(result.matches, true, "the counts after the replay equal the counts that were saved");
  assert.deepEqual(Object.values(result.state.patches).map(p => [p.row, p.col, p.value, p.original]), Object.values(state.patches).map(p => [p.row, p.col, p.value, p.original]));
  assert.deepEqual(summarize(result.state, again.ctx), summarize(state, s.ctx));
});

test("an exception and its reason survive; an exception without a reason in the file is refused", async () => {
  const s = await open(fixtureRows());
  const issue = s.scan.issues[0];
  const done = acceptException(emptyReview(), issue.id, "Checked with the branch");
  assert.equal(done.ok, true);
  const file = JSON.parse(JSON.stringify(snapshotProgress(done.state, s.ctx)));
  const back = restoreProgress(file, (await open(fixtureRows())).ctx);
  assert.equal(back.ok && back.state.states[issue.id].exceptionReason, "Checked with the branch");
  assert.equal(back.ok && back.matches, true);
  file.states[issue.id].exceptionReason = "x";
  assert.deepEqual(restoreProgress(file, (await open(fixtureRows())).ctx), { ok: false, error: "damaged" });
});

test("progress is tied to one workbook: another file, a changed cell or a foreign document is refused, and nothing is applied", async () => {
  const { s, state } = await worked();
  const file = JSON.parse(JSON.stringify(snapshotProgress(state, s.ctx)));
  const other = await open([...fixtureRows(), row({ MASOBD: "Z9" })]);
  assert.deepEqual(restoreProgress(file, other.ctx), { ok: false, error: "other-file" });
  const bent = { ...file, patches: file.patches.map(p => ({ ...p, original: p.original + "!" })) };
  const same = await open(fixtureRows());
  const refused = restoreProgress(bent, same.ctx);
  assert.equal(refused.ok, false); assert.equal(refused.error, "changed-cell"); assert.equal(typeof refused.at.row, "number");
  assert.deepEqual(restoreProgress({ hello: "world" }, same.ctx), { ok: false, error: "not-progress" });
  assert.deepEqual(restoreProgress(null, same.ctx), { ok: false, error: "not-progress" });
  assert.deepEqual(restoreProgress({ ...file, version: 9 }, same.ctx), { ok: false, error: "version" });
  assert.deepEqual(restoreProgress({ ...file, patches: [{ sheet: "MAU9_TEST", row: 4 }] }, same.ctx), { ok: false, error: "damaged" });
  assert.deepEqual(restoreProgress({ ...file, patches: [...file.patches, ...file.patches] }, same.ctx), { ok: false, error: "damaged" }, "the same cell twice is not a file this engine writes");
});

test("a file that was edited by hand to change counts is replayed from its corrections, and flagged when the counts disagree", async () => {
  const { s, state } = await worked();
  const file = JSON.parse(JSON.stringify(snapshotProgress(state, s.ctx)));
  file.counts.verified += 5;
  const result = restoreProgress(file, (await open(fixtureRows())).ctx);
  assert.equal(result.ok, true); assert.equal(result.matches, false);
});
