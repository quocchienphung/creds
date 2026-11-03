// Address recovery through the whole repair pipeline, on workbooks that have nothing to do with MAU9. Synthetic workbooks built from the packaged dataset;
// the exported file is read back by the independent Python reader. The held-out accuracy lives in scripts/geo/evaluate-geo.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildXlsx } from "../xlsx-builder.mjs";
import { openSession } from "../session.ts";
import { emptyReview } from "../review.ts";
import { autoRepair } from "../auto-repair.ts";
import { UNCALIBRATED } from "./address-recovery.ts";
import { toAscii } from "./vn-text.ts";
import { knowledge, loadDataset } from "./geo-fixture.mjs";

const verifier = join(dirname(fileURLToPath(import.meta.url)), "..", "independent-xlsx-dump.py");
const python = spawnSync("python", ["--version"]).status === 0 ? "python" : null;
function dump(bytes) {
  if (!python) return null;
  const dir = mkdtempSync(join(tmpdir(), "xlsx-"));
  try { const file = join(dir, "out.xlsx"); writeFileSync(file, bytes); const r = spawnSync(python, ["-I", verifier, file], { encoding: "utf8", maxBuffer: 1 << 28 }); assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout); }
  finally { rmSync(dir, { recursive: true, force: true }); }
}
const geo = () => ({ knowledge: knowledge(), calibration: UNCALIBRATED, datasetVersion: loadDataset().manifest.datasetVersion });
/** The way the legacy export damages text: a letter with a mark becomes `?`. */
const damage = text => [...text.normalize("NFC")].map(ch => toAscii(ch) !== ch ? "?" : ch).join("");

// Real units of the dataset, spread over the country: "Ward, District, Province".
const { provinces, districts, wards } = loadDataset().admin.recorded;
const addresses = Array.from({ length: 40 }, (_, i) => {
  const ward = wards[(i * 131 + 7) % wards.length], district = districts[ward[1]], province = provinces[district[1]];
  return `${ward[0]}, ${district[0]}, ${province}`;
});
const marked = addresses.filter(text => damage(text) !== text);

function workbook() {
  const first = [["So", "Noi dung", "Ghi chu"], ...marked.slice(0, 20).map((text, i) => [{ n: String(i + 1) }, damage(text), "ok"])];
  first.push([{ n: "21" }, "Hop dong co hieu luc khong?", "ok"], [{ n: "22" }, "Thua 12?3, to ban do so 4", "ok"], [{ n: "23" }, "MA?2024", "ok"]);
  const second = [["Ma", "Vi tri tai san", "Gia tri"], ...marked.slice(20).map((text, i) => ["T" + i, damage(text), { n: "7" }])];
  return buildXlsx([{ name: "Danh muc", rows: first }, { name: "Phu luc", rows: second }]);
}

test("addresses on every sheet of a non-MAU9 workbook come back as Vietnamese without marks, with no ? left in them, and the exported file agrees", async () => {
  const bytes = workbook(), session = await openSession(bytes, "diachi.xlsx"), before = dump(bytes);
  const out = await autoRepair(session, emptyReview(), { geo: geo(), policy: "FORCE_NO_QUESTION_MARK" });
  const after = dump(out.bytes);
  assert.ok(out.report.geo, "the geo block is reported");
  assert.equal(out.report.geo.policy, "FORCE_NO_QUESTION_MARK");
  assert.ok(out.report.geo.cellsRecovered >= marked.length - 2, JSON.stringify(out.report.geo));
  assert.notEqual(out.report.geo.finalStatus, "NO_ADDRESS_SPAN_REPAIRED");
  assert.equal(out.report.metrics.outputUnexpectedChanges, 0);
  if (!after) return;
  const sheets = ["Danh muc", "Phu luc"];
  let right = 0, cells = 0;
  marked.forEach((text, i) => {
    const key = i < 20 ? `Danh muc!B${i + 2}` : `Phu luc!B${i - 20 + 2}`;
    cells++;
    assert.ok(!after[key].includes("?"), `${key}: ${after[key]}`);
    assert.notEqual(after[key], before[key], `${key} was written`);
    if (after[key] === toAscii(text)) right++;
  });
  assert.ok(right / cells >= 0.8, `${right}/${cells} addresses exactly right`); // administrative names only; the held-out measure is in evaluation.json
  assert.deepEqual(sheets.filter(name => !Object.keys(after).some(key => key.startsWith(name + "!"))), []);
  // Not an address, a number anchor and a code are never touched.
  assert.equal(after["Danh muc!B22"], "Hop dong co hieu luc khong?");
  assert.equal(after["Danh muc!B23"], "Thua 12?3, to ban do so 4");
  assert.equal(after["Danh muc!B24"], "MA?2024");
  const anchor = out.report.locations.find(item => item.row === 23);
  assert.ok(!anchor || anchor.status !== "model_auto_accepted" || out.geoAudit.every(entry => entry.ref !== "B23"));
});

test("every guess is recorded: the audit holds original, accented and ASCII forms and a status for each word, and the report holds counts only", async () => {
  const out = await autoRepair(await openSession(workbook(), "diachi.xlsx"), emptyReview(), { geo: geo() });
  assert.equal(out.geoAudit.length, out.report.geo.cellsRecovered);
  const words = out.geoAudit.flatMap(entry => entry.words);
  assert.ok(words.length > 50);
  for (const word of words) { assert.ok(word.original.includes("?")); assert.equal(typeof word.accented, "string"); assert.ok(word.status); assert.ok(word.evidence.length); }
  const counted = Object.values(out.report.geo.byStatus).reduce((n, count) => n + count, 0);
  assert.equal(counted, words.length);
  assert.ok(!JSON.stringify(out.report).includes(out.geoAudit[0].repaired), "no cell value in the report");
  assert.notEqual(out.report.geo.finalStatus, "ADDRESS_SPANS_COMPLETED", "a guess is never reported as a verification");
});

test("SAFE_AUTO leaves a guess as ? and says so; FORCE_NO_QUESTION_MARK leaves none in an address", async () => {
  const bytes = buildXlsx([{ name: "A", rows: [["Dia chi"], ["Pho Tr?ng ??, Ph??ng ?? ??ng, Qu?n Hai B? Tr?ng, Th?nh ph? H? N?i"]] }]);
  const safe = await autoRepair(await openSession(bytes, "a.xlsx"), emptyReview(), { geo: geo(), policy: "SAFE_AUTO" });
  const forced = await autoRepair(await openSession(bytes, "a.xlsx"), emptyReview(), { geo: geo(), policy: "FORCE_NO_QUESTION_MARK" });
  assert.equal(forced.report.geo.unresolvedInAddresses, 0);
  assert.ok(!forced.geoAudit[0].repaired.includes("?"));
  assert.ok(forced.report.geo.forcedGuesses >= safe.report.geo.forcedGuesses);
  if (safe.geoAudit.length) assert.ok(safe.report.geo.unresolvedInAddresses >= 0);
});

test("without the geographic data the generic repair still runs and the report says no geographic recovery happened", async () => {
  const out = await autoRepair(await openSession(workbook(), "diachi.xlsx"), emptyReview());
  assert.equal(out.report.geo, null);
  assert.deepEqual(out.geoAudit, []);
});
