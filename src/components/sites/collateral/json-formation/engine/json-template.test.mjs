import { test } from "node:test";
import assert from "node:assert/strict";
import { buildXlsx } from "../../excel-formation/engine/xlsx-builder.mjs";
import { openSession } from "../../excel-formation/engine/session.ts";
import { MAU9_PROFILE } from "../../excel-formation/engine/mapping-profiles.ts";
import { allIssues, applyEdits, emptyReview, statusOf, summarize } from "../../excel-formation/engine/review.ts";
import { buildReport, encodeAndVerify } from "./json-report.ts";
import { planJson } from "./json-session.ts";
import { ASSET_KEY_ORDER, TEMPLATE, templateLeaves, templateProblems } from "./template-mau09.ts";
import { makeZip, packageName, zipHolds } from "./json-package.ts";

// Mẫu số 09 as a test: the form's attributes, the profile's columns and the output must agree, key by key.
const HEADERS = MAU9_PROFILE.columns.map(spec => spec.header);
const META = { KB001: "20260930", KB002: "Test User", KB003: "0900000000", KB004: "test@example.invalid" };
const OPTIONS = { ownerPolicy: "distinct", order: "code", file: { tctd: "SYNTH", sequence: "001" } };
const base = { NGAYDULIEU: "30/09/2026", MACHINHANH: "009", DINHKY: "2", MACNTCTD: "00000001", TENCNTCTD: "CN MOT", MAKH: "00000123", TENKH: "Cong ty A", MASOBD: "D0001", MALOAIBD: "303", NGBDAU: "20200101", GIATRI: { n: "1000" }, GIATRIBDKV: { n: "500" }, NGDINHGIA: "20210101", DSSOHD: "HD-1", HOTENCSH: "Nguyen Van A", GIAYTOCNCSH: "001234567890", MOTABD: "May moc", MOTABDS: "May moc" };
const row = (o = {}) => HEADERS.map(header => ({ ...base, ...o })[header] ?? null);
const open = rows => openSession(buildXlsx([{ name: "MAU9_TEST", rows: [HEADERS, ...rows] }]), "synthetic.xlsx");
const valueAt = (state = emptyReview()) => (r, col) => state.patches[`MAU9_TEST\u0001${r.r}\u0001${col}`]?.value ?? r.cells[col]?.v ?? "";
const build = (session, state) => buildReport(session.workbook, session.wprofile, session.profile, valueAt(state), META, OPTIONS);
const col = header => HEADERS.indexOf(header);

// One asset on three rows that carries every nested entry of the form.
const rich = () => [
  row({ TSCHUNGMATCTD: "00000002", CHUDA: "Chu Dau Tu A", GIAYTOCHUDA: "012345678", MSTCHUDA: "0900000001", DIACHICHUDA: "1 Pho X", TENDA: "Du an 1", VITRIDA: "Ha Noi", MATINHDTU: "01", GIAYPHEP: "GP1", GIATRIDA: { n: "5000000" }, THOIHANDA: "20271231", MOTADA: "Khu do thi",
    GIAYCN: "GCN-1", DIACHI: "2 Pho Y", MATINH: "01", LOAIPT: "Oto", GIAYDK: "DK1", BIENKS: "30A-12345" }),
  row({ TSCHUNGMATCTD: "00000002", TSCHUNGMAKH: "00000999", CHUDA: "Chu Dau Tu B", TENDA: "Du an 1", VITRIDA: "Ha Noi", MATINHDTU: "01", GIAYPHEP: "GP1", GIATRIDA: { n: "5000000" }, THOIHANDA: "20271231", MOTADA: "Khu do thi", GIAYCN: "GCN-1", DIACHI: "2 Pho Y", MATINH: "01", LOAIPT: "Oto", GIAYDK: "DK1", BIENKS: "30A-12345" }),
  row({ TENDA: "Du an 2", VITRIDA: "Hai Phong", LOAIPT: "May bay", GIAYDK: "DK2" }),
];

test("every column the profile maps is an attribute of the form, and every attribute of the form is filled by a column", () => {
  const full = path => path.startsWith("THONGTINBD[]") ? `CNTCTD[].KHACHHANG[].${path}` : path;
  const leaves = new Set(templateLeaves());
  const mapped = MAU9_PROFILE.columns.filter(spec => spec.json);
  for (const spec of mapped) assert.ok(leaves.has(full(spec.json)), `${spec.header} → ${spec.json} is not an attribute of Mẫu 09`);
  const filledByColumn = new Set(mapped.map(spec => full(spec.json)));
  const typedAtExport = ["KB002", "KB003", "KB004"];
  for (const leaf of leaves) if (!typedAtExport.includes(leaf)) assert.ok(filledByColumn.has(leaf), `${leaf} has no column`);
  assert.equal(new Set(mapped.map(spec => spec.json)).size, mapped.length, "no two columns fill the same attribute");
  assert.deepEqual(MAU9_PROFILE.columns.filter(spec => !spec.json).map(spec => spec.header), ["MACHINHANH", "DINHKY"], "only the two constants stay out of the JSON");
});
test("a block's key and members are mapped columns that sit under the entry the block names", () => {
  const byHeader = new Map(MAU9_PROFILE.columns.map(spec => [spec.header, spec]));
  for (const block of MAU9_PROFILE.blocks) {
    for (const header of [block.anchor, ...block.members]) assert.ok(byHeader.get(header)?.json, `${block.id}: ${header} is not mapped`);
    for (const header of [block.anchor, ...block.members.filter(member => !(block.id === "project" && ["CHUDA", "GIAYTOCHUDA", "MSTCHUDA", "DIACHICHUDA"].includes(member)))]) assert.ok(byHeader.get(header).json.startsWith(`${block.json}.`), `${block.id}: ${header} is outside ${block.json}`);
  }
});

test("the form's keys are transcribed in order: asset keys put TS013 before TS009", () => {
  assert.deepEqual([...ASSET_KEY_ORDER], ["TS001", "TS002", "TS003", "TS004", "TS005", "TS006", "TS007", "TS008", "TS013", "TS009", "TS010", "TS011", "TS012", "TS014", "TS015", "TS016"]);
  assert.equal(TEMPLATE.keys.map(([key]) => key).join(), "KB001,KB002,KB003,KB004,CNTCTD");
});
test("the template check finds a missing, extra, reordered or mistyped key at any depth, in any asset", async () => {
  const s = await open(rich());
  const good = JSON.parse(new TextDecoder().decode(encodeAndVerify(build(s).report).bytes));
  assert.deepEqual(templateProblems(good), []);
  const edit = change => { const copy = structuredClone(good); change(copy); return templateProblems(copy); };
  const asset = d => d.CNTCTD[0].KHACHHANG[0].THONGTINBD[0];
  assert.match(edit(d => { delete asset(d).TS016; })[0], /THONGTINBD\[0\]: missing TS016/);
  assert.match(edit(d => { asset(d).TS099 = 1; })[0], /unexpected TS099/);
  assert.match(edit(d => { const { TS009, ...rest } = asset(d); d.CNTCTD[0].KHACHHANG[0].THONGTINBD[0] = { ...rest, TS009 }; })[0], /out of order/);
  assert.match(edit(d => { asset(d).TS005 = "1000"; })[0], /TS005: expected number, found string/);
  assert.match(edit(d => { asset(d).TS014[0].TS0146 = "5"; })[0], /TS014\[0\]\.TS0146: expected number/);
  assert.match(edit(d => { delete asset(d).TS014[0].TS0141[0].TS01414; })[0], /TS0141\[0\]: missing TS01414/);
  assert.match(edit(d => { asset(d).TS010 = "00000002"; })[0], /TS010: expected a list/);
  assert.match(edit(d => { d.KB005 = "x"; })[0], /unexpected KB005/);
  const many = structuredClone(good); many.CNTCTD[0].KHACHHANG[0].THONGTINBD.push(structuredClone(asset(good))); delete many.CNTCTD[0].KHACHHANG[0].THONGTINBD[1].TS011;
  assert.match(templateProblems(many)[0], /THONGTINBD\[1\]: missing TS011/, "an error in a later asset is found, not only in the first");
});

test("every entry of the form is filled from the rows of an asset, in the order of the form", async () => {
  const s = await open(rich());
  const { report, reconciliation: r, problems } = build(s);
  assert.deepEqual(problems, []);
  const a = report.CNTCTD[0].KHACHHANG[0].THONGTINBD[0];
  assert.deepEqual(Object.keys(a), [...ASSET_KEY_ORDER]);
  assert.deepEqual(a.TS010, ["00000002"], "the same shared branch on two rows is listed once");
  assert.deepEqual(a.TS011, ["00000999"]);
  assert.equal(a.TS014.length, 2, "one entry per distinct set of project columns");
  assert.deepEqual(Object.keys(a.TS014[0]), ["TS0141", "TS0142", "TS0143", "TS0144", "TS0145", "TS0146", "TS0147", "TS0148"]);
  assert.deepEqual(a.TS014[0].TS0141, [
    { TS01411: "Chu Dau Tu A", TS01412: "012345678", TS01413: "0900000001", TS01414: "1 Pho X" },
    { TS01411: "Chu Dau Tu B", TS01412: "", TS01413: "", TS01414: "" },
  ], "both investors of the project are kept, an unknown document is an empty string");
  assert.deepEqual([a.TS014[0].TS0142, a.TS014[0].TS0143, a.TS014[0].TS0144, a.TS014[0].TS0145, a.TS014[0].TS0146.$num, a.TS014[0].TS0147, a.TS014[0].TS0148], ["Du an 1", "Ha Noi", "01", "GP1", "5000000", "20271231", "Khu do thi"]);
  assert.deepEqual([a.TS014[1].TS0141, a.TS014[1].TS0142, a.TS014[1].TS0146.$num], [[], "Du an 2", "0"], "a project without investors has an empty list; an empty total is 0");
  assert.deepEqual(a.TS015, [{ TS0151: "GCN-1", TS0152: "2 Pho Y", TS0153: "01", TS0154: "May moc" }], "two rows with the same land title are one entry; TS0154 is the description");
  assert.deepEqual(a.TS016, [{ TS0161: "Oto", TS0162: "DK1", TS0163: "30A-12345" }, { TS0161: "May bay", TS0162: "DK2", TS0163: "" }]);
  assert.deepEqual([r.assetsWithShared, r.assetsWithProject, r.assetsWithLand, r.assetsWithVehicle], [1, 1, 1, 1]);
  assert.equal(encodeAndVerify(report).verification.ok, true);
});
test("an asset with nothing in the project, land title, vehicle and shared columns keeps empty lists", async () => {
  const s = await open([row()]);
  const a = build(s).report.CNTCTD[0].KHACHHANG[0].THONGTINBD[0];
  assert.deepEqual([a.TS010, a.TS011, a.TS014, a.TS015, a.TS016], [[], [], [], [], []], "TS0154 never makes a land title by itself, though every row has a description");
  const r = build(s).reconciliation;
  assert.deepEqual([r.assetsWithShared, r.assetsWithProject, r.assetsWithLand, r.assetsWithVehicle], [0, 0, 0, 0]);
});
test("no value is lost: every distinct non-empty value of a list-like column of an asset is in its JSON", async () => {
  const rows = rich();
  const s = await open(rows);
  const text = new TextDecoder().decode(encodeAndVerify(build(s).report).bytes);
  const data = s.workbook.sheets[0].rows.filter(r => r.r > 1);
  for (const header of ["TSCHUNGMATCTD", "TSCHUNGMAKH", "CHUDA", "GIAYTOCHUDA", "MSTCHUDA", "DIACHICHUDA", "TENDA", "VITRIDA", "MATINHDTU", "GIAYPHEP", "THOIHANDA", "MOTADA", "GIAYCN", "DIACHI", "MATINH", "LOAIPT", "GIAYDK", "BIENKS"]) {
    for (const r of data) { const v = r.cells[col(header)]?.v ?? ""; if (v !== "") assert.ok(text.includes(JSON.stringify(v)), `${header}=${v} is missing from the JSON`); }
  }
  assert.ok(text.includes("\"TS0146\": 5000000,"));
});
test("rows are matched to entries by the columns' values, not by their position: reordering the rows changes nothing in the entries", async () => {
  const a = build(await open(rich())).report.CNTCTD[0].KHACHHANG[0].THONGTINBD[0];
  const [r1, r2, r3] = rich();
  const b = build(await open([r1, r2, r3])).report.CNTCTD[0].KHACHHANG[0].THONGTINBD[0];
  assert.deepEqual(a, b);
  const c = build(await open([r3, r1, r2])).report.CNTCTD[0].KHACHHANG[0].THONGTINBD[0];
  assert.deepEqual([...c.TS014.map(p => p.TS0142)].sort(), ["Du an 1", "Du an 2"]);
  assert.deepEqual(c.TS015, a.TS015);
});
test("a project total that is not a number is reported, not turned into 0 silently", async () => {
  const s = await open([row({ TENDA: "Du an", GIATRIDA: "nhieu" })]);
  assert.match(build(s).problems.join(" "), /GIATRIDA is not a number/);
});

// ── entries without their key column ─────────────────────────────────────────────────────────────────────────────
test("values in a project, land title or vehicle block whose key column is empty are an issue (and still reach the JSON)", async () => {
  const s = await open([row({ CHUDA: "Giay chung nhan so AO 332714", MATINH: "QSDD theo -" })]);
  const found = s.scan.issues.filter(issue => issue.category === "INCOMPLETE_GROUP");
  assert.deepEqual(found.map(issue => [issue.field, issue.block.id, issue.block.anchor, issue.severity]), [["MATINH", "land", "GIAYCN", "high"], ["CHUDA", "project", "TENDA", "high"]].sort((x, y) => col(x[0]) - col(y[0])));
  const a = build(s).report.CNTCTD[0].KHACHHANG[0].THONGTINBD[0];
  assert.equal(a.TS014[0].TS0141[0].TS01411, "Giay chung nhan so AO 332714", "nothing is dropped");
  assert.equal(a.TS015[0].TS0153, "QSDD theo -");
  const st = emptyReview();
  assert.equal(planJson(s, st, META, OPTIONS, summarize(st, s.ctx)).ready, false, "the export waits for the review");
});
test("filling the key column, or emptying the other cells, settles the issue; typing into a block without a key raises one", async () => {
  const s = await open([row({ CHUDA: "Chu A", MATINH: "01" }), row({ MASOBD: "D0002" })]);
  const issueOf = id => s.scan.issues.find(issue => issue.category === "INCOMPLETE_GROUP" && issue.block.id === id);
  const project = issueOf("project"), land = issueOf("land");
  assert.ok(project && land);
  let st = applyEdits(emptyReview(), s.ctx, [{ sheet: "MAU9_TEST", row: 2, col: col("TENDA"), value: "Du an A" }]);
  assert.equal(statusOf(st, project), "verified", "the key column was filled, in another cell than the one the issue sits on");
  assert.notEqual(statusOf(st, land), "verified", "the land title block is a different entry");
  st = applyEdits(st, s.ctx, [{ sheet: "MAU9_TEST", row: 2, col: col("MATINH"), value: "" }]);
  assert.equal(statusOf(st, land), "verified", "emptying the cell settles it too");
  const typed = applyEdits(emptyReview(), s.ctx, [{ sheet: "MAU9_TEST", row: 3, col: col("BIENKS"), value: "30A-1" }]);
  assert.ok(allIssues(typed, s.ctx).some(issue => issue.category === "INCOMPLETE_GROUP" && issue.block.id === "vehicle" && issue.row === 3), "a value typed into a vehicle block without LOAIPT is a problem");
  const fixed = applyEdits(typed, s.ctx, [{ sheet: "MAU9_TEST", row: 3, col: col("LOAIPT"), value: "Oto" }]);
  assert.ok(!allIssues(fixed, s.ctx).some(issue => issue.category === "INCOMPLETE_GROUP" && issue.row === 3), "and filling the type removes it");
});
test("a row whose blocks are whole raises nothing", async () => {
  const s = await open(rich());
  assert.deepEqual(s.scan.issues.filter(issue => issue.category === "INCOMPLETE_GROUP"), [], "every row that has project, land title or vehicle values also has the key column");
});

// ── file name and zip ────────────────────────────────────────────────────────────────────────────────────────────
test("the file is named D40 + TCTD code + report date + . + sequence, and the zip has the same name", () => {
  assert.deepEqual(packageName({ tctd: "SYNTH", sequence: "001" }, "20260930"), { name: { json: "D40SYNTH20260930.001.json", zip: "D40SYNTH20260930.001.zip" }, problems: [] });
  assert.deepEqual(packageName(undefined, "20260930").problems, ["tctd", "sequence"]);
  assert.deepEqual(packageName({ tctd: "A B", sequence: "1" }, "2026-09-30").problems, ["tctd", "sequence", "date"]);
  for (const bad of ["", "12", "1234", "a.b", "a/b"]) assert.equal(packageName({ tctd: "X", sequence: bad }, "20260930").name, null, `sequence ${JSON.stringify(bad)}`);
  for (const bad of ["", "a/b", "..", "a b", "x".repeat(21)]) assert.equal(packageName({ tctd: bad, sequence: "001" }, "20260930").name, null, `code ${JSON.stringify(bad)}`);
});
test("the zip holds exactly the one JSON, reads back identical, and is the same every time", () => {
  const json = new TextEncoder().encode("{\n\t\"KB001\": \"20260930\"\n}\n");
  const zip = makeZip("D40SYNTH20260930.001.json", json, "20260930");
  assert.equal(zipHolds(zip, "D40SYNTH20260930.001.json", json), true);
  assert.deepEqual(makeZip("D40SYNTH20260930.001.json", json, "20260930"), zip);
  assert.equal(zipHolds(zip, "other.json", json), false, "wrong name");
  assert.equal(zipHolds(zip, "D40SYNTH20260930.001.json", new TextEncoder().encode("{}")), false, "other bytes");
  assert.equal(zipHolds(new Uint8Array([1, 2, 3]), "x", json), false, "not a zip");
});
test("the export is offered only with the file name filled in, under the name the form asks for", async () => {
  const s = await open(rich()), st = emptyReview();
  const named = planJson(s, st, META, OPTIONS, summarize(st, s.ctx));
  assert.equal(named.ready, true, JSON.stringify(named.checks.filter(c => !c.ok)));
  assert.equal(named.fileName, "D40SYNTH20260930.001.json");
  assert.equal(named.zipName, "D40SYNTH20260930.001.zip");
  assert.ok(named.checks.find(c => c.id === "template").ok);
  const unnamed = planJson(s, st, META, { ownerPolicy: "distinct", order: "code" }, summarize(st, s.ctx));
  assert.deepEqual([unnamed.ready, unnamed.bytes, unnamed.fileName, unnamed.zipName], [false, null, null, null]);
  assert.equal(unnamed.checks.find(c => c.id === "file-name").ok, false);
  assert.ok(!named.audit.includes("SYNTH"), "the file name is not in the audit report");
});
