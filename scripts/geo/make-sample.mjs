// Builds a real before/after workbook pair and the evidence for it. Run:  node --experimental-strip-types scripts/geo/make-sample.mjs
//
// The workbook is synthetic and has nothing to do with MAU9: three sheets, unrelated headers, shared and inline strings, a formula, a number
// anchor with a ? inside, a real question and a code. The addresses are streets of WARDS HELD OUT of the knowledge the engine is given (same split as
// evaluate-geo.mjs), written as "street, ward, district, province" and damaged the way the legacy export damages text, so the result is a fair sample
// and not the engine reading back what it was taught. The exported file is read back by the independent Python reader.
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildXlsx } from "../../src/components/sites/collateral/excel-formation/engine/xlsx-builder.mjs";
import { openSession } from "../../src/components/sites/collateral/excel-formation/engine/session.ts";
import { emptyReview } from "../../src/components/sites/collateral/excel-formation/engine/review.ts";
import { autoRepair } from "../../src/components/sites/collateral/excel-formation/engine/auto-repair.ts";
import { GeoKnowledge } from "../../src/components/sites/collateral/excel-formation/engine/geo/geo-knowledge.ts";
import { foldKey, toAscii } from "../../src/components/sites/collateral/excel-formation/engine/geo/vn-text.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const data = dir => Object.fromEntries(["manifest", "admin", "streets", "osm"].map(name => [name, JSON.parse(readFileSync(join(dir, name + ".json"), "utf8"))]));
const dir = join(root, "public", "data", "vn-geo"), full = data(dir);
const calibration = JSON.parse(readFileSync(join(dir, "calibration.json"), "utf8"));
const held = new Set(full.admin.recorded.wards.map((_, i) => i).filter(i => i % 10 === 3));
const test = full.streets.map(([name, ward]) => ({ name, ward })).filter(item => held.has(item.ward));
const folds = new Set(test.map(item => foldKey(item.name)));
const knowledge = new GeoKnowledge({ ...full, streets: full.streets.filter(([, ward]) => !held.has(ward)), osm: { ...full.osm, names: full.osm.names.filter(([name]) => !folds.has(foldKey(name))) } });
const geo = { knowledge, calibration, datasetVersion: full.manifest.datasetVersion };

let seed = 424242; const random = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const { provinces, districts, wards } = full.admin.recorded;
const damage = text => [...text.normalize("NFC")].map(ch => toAscii(ch) !== ch ? "?" : ch).join("");
const pick = Array.from({ length: 60 }, () => test[Math.floor(random() * test.length)]);
const addressOf = item => { const ward = wards[item.ward], district = districts[ward[1]], province = provinces[district[1]]; return [item.name, ward[0], district[0], province].join(", "); };
const truth = new Map(); // "Sheet!B2" -> expected text without marks
const sheetRows = (name, column, items, extra) => items.map((item, i) => { const original = addressOf(item); truth.set(`${name}!${column}${i + 2}`, toAscii(original)); return extra(i, damage(original)); });

const rows1 = [["Ma tai san", "Dia chi tai san", "Gia tri (VND)"], ...sheetRows("Tai san", "B", pick.slice(0, 25), (i, text) => ["TS" + (1000 + i), text, { n: String(800000000 + i * 1000000) }])];
rows1.push(["TS-NOTE", "Thua 12?3, to ban do so 4", { n: "0" }], ["TS-Q", "Ban co dong y khong?", { n: "0" }], ["TS-F", "MA?2024", { f: "1+1", v: "2" }]);
const rows2 = [["STT", "Khach hang", "Noi dat tai san the chap"], ...sheetRows("Bat dong san", "C", pick.slice(25, 50), (i, text) => [{ n: String(i + 1) }, "Khach hang " + (i + 1), text])];
const rows3 = [["Ghi chu", "Vi tri"], ...sheetRows("An", "B", pick.slice(50), (i, text) => ["Ghi chu " + i, text])];
const before = buildXlsx([{ name: "Tai san", rows: rows1 }, { name: "Bat dong san", rows: rows2 }, { name: "An", rows: rows3 }], { shared: true });

const session = await openSession(before, "mau-khong-phai-mau9.xlsx");
const out = await autoRepair(session, emptyReview(), { geo, policy: "FORCE_NO_QUESTION_MARK" });

const python = ["python3", "python"].find(name => spawnSync(name, ["--version"]).status === 0) ?? null;
const verifier = join(root, "src", "components", "sites", "collateral", "excel-formation", "engine", "independent-xlsx-dump.py");
function dump(bytes) {
  const tmp = mkdtempSync(join(tmpdir(), "xlsx-"));
  try { const file = join(tmp, "x.xlsx"); writeFileSync(file, bytes); const r = spawnSync(python, ["-I", verifier, file], { encoding: "utf8", maxBuffer: 1 << 28 }); if (r.status !== 0) throw new Error(r.stderr); return JSON.parse(r.stdout); } finally { rmSync(tmp, { recursive: true, force: true }); }
}
if (!python) throw new Error("python is needed for the independent read-back");
const b = dump(before), a = dump(out.bytes);
const cells = [...truth].map(([ref, want]) => ({ ref, before: b[ref], after: a[ref], expected: want, exact: a[ref] === want, exactIgnoringCase: a[ref].toLowerCase() === want.toLowerCase(), questionMarkLeft: a[ref].includes("?") }));
const untouched = ["Tai san!B27", "Tai san!B28", "Tai san!B29"].map(ref => ({ ref, before: b[ref], after: a[ref], unchanged: b[ref] === a[ref] }));
const everyOther = Object.keys(b).filter(ref => !truth.has(ref) && b[ref] !== a[ref]);
const evidence = {
  workbook: "mau-khong-phai-mau9.xlsx (synthetic, 3 sheets with unrelated headers)", policy: "FORCE_NO_QUESTION_MARK", datasetVersion: geo.datasetVersion,
  knowledge: "held-out wards removed: no street or ward of this sample was in the knowledge the engine used",
  independentReader: "python -I independent-xlsx-dump.py (zipfile + ElementTree, no code shared with the app)",
  addressCells: cells.length, exactlyRight: cells.filter(cell => cell.exact).length, exactIgnoringCase: cells.filter(cell => cell.exactIgnoringCase).length, withQuestionMarkLeft: cells.filter(cell => cell.questionMarkLeft).length,
  unchangedByDesign: untouched, changedOutsideAddresses: everyOther,
  report: { status: out.report.status, geo: out.report.geo, sheets: out.report.sheets.map(sheet => ({ sheetId: sheet.sheetId, status: sheet.status, verifiedChanges: sheet.verifiedChanges })), outputCellsChanged: out.report.metrics.outputCellsChanged, outputUnexpectedChanges: out.report.metrics.outputUnexpectedChanges, verificationAllOk: out.report.verification.every(item => item.ok && item.changed) },
  wrong: cells.filter(cell => !cell.exact),
};
const target = join(root, "docs", "workspace-app", "vn-geo", "sample"); mkdirSync(target, { recursive: true });
writeFileSync(join(target, "before.xlsx"), before); writeFileSync(join(target, "after.xlsx"), out.bytes);
writeFileSync(join(target, "evidence.json"), JSON.stringify(evidence, null, 2) + "\n");
writeFileSync(join(target, "address-audit.json"), JSON.stringify(out.geoAudit, null, 2) + "\n");
console.log(JSON.stringify({ ...evidence, wrong: evidence.wrong.length, unchangedByDesign: untouched.every(item => item.unchanged), changedOutsideAddresses: everyOther.length }, null, 2));
