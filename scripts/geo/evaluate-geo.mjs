// Measures the address recovery on HELD-OUT data and calibrates the trust margins. Run:
//   node --experimental-strip-types scripts/geo/evaluate-geo.mjs [--n 2000] [--write]
//
// Split: whole wards are held out (every record under them), so no test address, and no street name that exists only there, is in the knowledge the
// engine is given; the OpenStreetMap names equal to a test street are removed too. Test addresses are the held-out records written as
// "street, ward, district, province", a quarter of them in capitals, then damaged the way the legacy export damages text: a letter that carries a
// mark becomes `?` (70%) or its plain letter (30%). The truth is the original text without marks.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { GeoKnowledge } from "../../src/components/sites/collateral/excel-formation/engine/geo/geo-knowledge.ts";
import { recoverAddressText, UNCALIBRATED } from "../../src/components/sites/collateral/excel-formation/engine/geo/address-recovery.ts";
import { foldKey, toAscii } from "../../src/components/sites/collateral/excel-formation/engine/geo/vn-text.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const out = join(root, "public", "data", "vn-geo");
const arg = (name, fallback) => { const at = process.argv.indexOf(name); return at < 0 ? fallback : Number(process.argv[at + 1]); };
const N = arg("--n", 2000), PLACEHOLDER = 0.7;
const read = name => JSON.parse(readFileSync(join(out, name), "utf8"));
const data = { manifest: read("manifest.json"), admin: read("admin.json"), streets: read("streets.json"), osm: read("osm.json") };

function rng(seed) { return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const random = rng(20261103);

// --- split by ward
const heldWard = new Set(data.admin.recorded.wards.map((_, i) => i).filter(i => i % 10 === 3));
const test = data.streets.map(([name, ward]) => ({ name, ward })).filter(item => heldWard.has(item.ward));
const trainStreets = data.streets.filter(([, ward]) => !heldWard.has(ward));
const trainNames = new Set(trainStreets.map(([name]) => foldKey(name)));
const testFolds = new Set(test.map(item => foldKey(item.name)));
const train = { ...data, streets: trainStreets, osm: { ...data.osm, names: data.osm.names.filter(([name]) => !testFolds.has(foldKey(name))) } };
console.log(`train streets ${trainStreets.length}, held-out streets ${test.length}, held-out wards ${heldWard.size}`);
const knowledge = new GeoKnowledge(train);

// --- test addresses
const { provinces, districts, wards } = data.admin.recorded;
const pool = test.filter(() => true);
const sample = [];
for (let i = 0; i < N && pool.length; i++) { const at = Math.floor(random() * pool.length); sample.push(pool.splice(at, 1)[0]); }
const address = item => { const ward = wards[item.ward], district = districts[ward[1]], province = provinces[district[1]]; return [item.name, ward[0], district[0], province].join(", "); };
function damage(text) {
  let changed = 0, result = "";
  for (const ch of text.normalize("NFC")) { const plain = toAscii(ch); if (plain !== ch) { if (random() < PLACEHOLDER) { result += "?"; changed++; } else result += plain; } else result += ch; }
  return { text: result, changed };
}

const rows = [];
let cells = 0, tokens = 0, covered = 0, correctCells = 0, remaining = 0, unseenCells = 0, unseenCorrect = 0;
const t0 = performance.now();
for (const item of sample) {
  const original = address(item), upper = random() < 0.25, source = upper ? original.toUpperCase() : original;
  const { text, changed } = damage(source);
  if (!changed) continue;
  const truth = toAscii(source.normalize("NFC"));
  const result = recoverAddressText(text, knowledge, { policy: "FORCE_NO_QUESTION_MARK", calibration: UNCALIBRATED });
  cells++;
  const unseen = !trainNames.has(foldKey(item.name));
  const questionWords = (text.match(/[\p{L}\p{M}\d?]*\?[\p{L}\p{M}\d?]*/gu) ?? []).length;
  tokens += questionWords;
  let allRight = true;
  for (const segment of result.segments) for (const token of segment.tokens) {
    covered++;
    const right = token.applied && token.ascii === truth.slice(token.start, token.end);
    if (!right) allRight = false;
    rows.push({ margin: Number.isFinite(token.margin) ? token.margin : 99, right, status: token.status, official: token.evidence.some(line => line.includes("official")), gazetteer: token.evidence.some(line => line.includes("geographic data")) });
  }
  if (result.value !== truth) allRight = false;
  if (allRight) correctCells++;
  if (unseen) { unseenCells++; if (allRight) unseenCorrect++; }
  remaining += (result.value.match(/\?/g) ?? []).length;
}
const seconds = (performance.now() - t0) / 1000;
const thresholds = [0, 0.5, 1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32];
const at = (predicate, thr) => { const kept = rows.filter(row => row.margin >= thr && predicate(row)); return { thr, tokens: kept.length, precision: kept.length ? kept.filter(row => row.right).length / kept.length : 0 }; };
const high = thresholds.map(thr => at(() => true, thr)).find(row => row.tokens >= 100 && row.precision >= 0.99);
const context = thresholds.map(thr => at(row => row.gazetteer, thr)).find(row => row.tokens >= 100 && row.precision >= 0.95);
const byStatus = Object.fromEntries([...new Set(rows.map(row => row.status))].map(status => [status, { tokens: rows.filter(row => row.status === status).length, precision: rows.filter(row => row.status === status && row.right).length / Math.max(1, rows.filter(row => row.status === status).length) }]));
const report = {
  data: { heldOutWards: heldWard.size, trainStreets: trainStreets.length, heldOutStreets: test.length, addresses: cells, damagedWords: tokens, wordsProcessed: covered },
  corruption: { placeholderShare: PLACEHOLDER, upperCaseShare: 0.25, note: "an accented letter becomes ? or its plain letter; plain letters are never touched" },
  results: {
    exactAddressAscii: +(correctCells / cells).toFixed(4), exactAddressAsciiUnseenStreetName: +(unseenCorrect / Math.max(1, unseenCells)).toFixed(4), unseenStreetNameAddresses: unseenCells,
    wordAccuracy: +(rows.filter(row => row.right).length / rows.length).toFixed(4), wordsCoveredByAddressSegments: +(covered / tokens).toFixed(4),
    remainingQuestionMarks: remaining, byStatus,
  },
  calibration: { highMargin: high?.thr ?? null, precisionAtHigh: high?.precision ?? null, tokensAtHigh: high?.tokens ?? 0, contextMargin: context?.thr ?? null, precisionAtContext: context?.precision ?? null, tokensAtContext: context?.tokens ?? 0 },
  seconds: +seconds.toFixed(1), msPerAddress: +(seconds * 1000 / cells).toFixed(1),
};
console.log(JSON.stringify(report, null, 2));
if (process.argv.includes("--write")) {
  writeFileSync(join(out, "evaluation.json"), JSON.stringify(report, null, 2) + "\n");
  if (high && context) writeFileSync(join(out, "calibration.json"), JSON.stringify({ highMargin: high.thr, contextMargin: context.thr, heldOut: rows.length, precisionAtHigh: +high.precision.toFixed(4), precisionAtContext: +context.precision.toFixed(4), method: `held-out wards (every 10th), ${cells} damaged addresses, ${rows.length} damaged words; smallest margin with precision >= 0.99 (high) and >= 0.95 among words backed by a name in the data (context)` }, null, 2) + "\n");
}
