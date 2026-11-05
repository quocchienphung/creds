// Names are predicted from the names of the file itself, calibrated by hold-out, and a name that cannot be settled is left alone.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildXlsx } from "./xlsx-builder.mjs";
import { openSession } from "./session.ts";
import { applyEdits, emptyReview } from "./review.ts";
import { autoRepair } from "./auto-repair.ts";
import { cellMap } from "./ooxml-independent.mjs";
import { VietnameseModel } from "./predict.ts";
import { calibrate } from "./model-repair.ts";
import { nameColumnsOf, planNameRepair } from "./name-repair.ts";
import { HEADERS, CLEAN } from "./zero-patch-fixture.mjs";

const FAMILY = ["Nguyen", "Tran", "Le", "Pham", "Hoang", "Huynh", "Phan", "Vu", "Dang", "Bui", "Do", "Ho", "Ngo", "Duong", "Ly"];
const MIDDLE = ["Van", "Thi", "Minh", "Huu", "Quoc", "Anh", "Duc", "Ngoc", "Kim", "Bao", "Gia", "Thu"]; // enough distinct names for the hold-out to mean something
const GIVEN = ["Tuan", "Hung", "Linh", "Thanh", "Nam", "Hai", "Long", "Phuong", "Trang", "Lan", "Huong", "Mai", "Dung", "Cuong", "Khanh", "Quynh", "Binh", "Duc", "Hieu", "Hoa", "Kien", "Loan", "Nga", "Oanh", "Phat", "Quang", "Son", "Tam", "Thao", "Trung", "Tu", "Vinh", "Xuan", "Yen", "Giang", "Han", "Khoa", "Lam", "My", "Ngoc"];
const names = FAMILY.flatMap(f => MIDDLE.flatMap(m => GIVEN.map(g => `${f} ${m} ${g}`)));
const row = (n, a, name) => ["00001", `K${1000 + n}`, `A${n}`, "303", { n: "1234.5599999999999" }, a, a, name];
const bytesWith = extra => buildXlsx([{ name: "S", rows: [HEADERS, ...names.map((name, i) => row(i, CLEAN[i % CLEAN.length], name)), ...extra] }]);
const last = names.length + 1;
const run = async (extra, state = emptyReview()) => { const s = await openSession(bytesWith(extra), "n.xlsx"); return { s, out: await autoRepair(s, state) }; };

test("a damaged name is restored from the names of the file, in the case it was written in", async () => {
  const { out } = await run([row(2000, "may moc", "Nguy?n Van Linh"), row(2001, "may moc", "D? Van Nam"), row(2002, "may moc", "TR?N QU?C LAN"), row(2003, "may moc", "Le Th? Lan")]);
  const cells = cellMap(out.bytes).S.cells;
  assert.equal(cells.get("H" + (last + 1)).value, "Nguyen Van Linh");
  assert.equal(cells.get("H" + (last + 2)).value, "Do Van Nam", "one known capital does not make the word capitals");
  assert.equal(cells.get("H" + (last + 3)).value, "TRAN QUOC LAN");
  assert.equal(cells.get("H" + (last + 4)).value, "Le Th? Lan", "Thi and Thu both fit and nothing tells them apart: left for a person");
  assert.ok(out.report.names.calibration.enabled && out.report.names.calibration.precision >= 0.995, "only after a hold-out of the file's own names reached the target");
  assert.equal(out.report.names.fields, 3);
});

test("a name that no name of the file can settle keeps its ?, and a typed name is never touched", async () => {
  const state = (await openSession(bytesWith([row(2000, "may moc", "Nguy?n Van Linh")]), "n.xlsx"));
  const typed = applyEdits(emptyReview(), state.ctx, [{ sheet: "S", row: last + 1, col: 7, value: "Nguyen V? Linh", source: "typed" }]);
  const { out } = await run([row(2000, "may moc", "Nguy?n Van Linh"), row(2001, "may moc", "Zzq? Van Linh")], typed);
  const cells = cellMap(out.bytes).S.cells;
  assert.equal(cells.get("H" + (last + 1)).value, "Nguyen V? Linh", "what the reviewer typed is exported as typed");
  assert.equal(cells.get("H" + (last + 2)).value, "Zzq? Van Linh", "no name of the file fits Zzq?");
});

test("a name is never handed to the recovery of collateral wording: a Th? in a name is not a word of a land title", async () => {
  const { out } = await run([row(2000, "may moc", "Dao Th? Phuong Hoa")]);
  assert.equal(cellMap(out.bytes).S.cells.get("H" + (last + 1)).value, "Dao Th? Phuong Hoa");
});

test("a column is a name column by its values when no profile says so", () => {
  const rows = names.slice(0, 60).map(name => [{ t: "s", v: name }, { t: "s", v: "may moc tang ba va co so" }]);
  const sheet = { rows: rows.map((cells, i) => ({ r: i + 1, cells: cells.map(c => ({ ...c })) })) };
  assert.deepEqual([...nameColumnsOf(sheet, new Set())], [0]);
  assert.deepEqual([...nameColumnsOf(sheet, new Set([0]))], [], "a column the profile already knows is not judged again");
});

test("the name model is calibrated on names alone: it does not borrow words from descriptions", () => {
  const model = new VietnameseModel(); for (const name of names) model.add(name); model.finish();
  const calibration = calibrate(names, 0.4);
  assert.equal(calibration.enabled, true);
  assert.equal(planNameRepair(model, "Nguy?n Van Linh", calibration).value, "Nguyen Van Linh");
  assert.equal(planNameRepair(model, "may moc tang ba va c? so", calibration), null, "words of a description are not in the names of the file");
});
