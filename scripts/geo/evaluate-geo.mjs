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
// The engine's status of a word is a function of (official, gazetteer, margin) and the two margins, so every configuration can be scored from the
// recorded rows. A population is scored on exactly the words that status would receive: never on a cumulative superset that contains better words.
const TARGET = 0.99, MIN_WORDS = 100;
const statusOf = (row, cfg) => row.official && row.margin >= cfg.contextMargin ? "verified_official" : row.margin >= cfg.highMargin ? "high_confidence_auto" : row.gazetteer && row.margin >= cfg.contextMargin ? (cfg.contextualAuto ? "contextual_auto" : "forced_guess") : "forced_guess";
const score = (cfg) => {
  const by = {};
  for (const row of rows) { const status = statusOf(row, cfg); const e = by[status] ??= { words: 0, right: 0 }; e.words++; if (row.right) e.right++; }
  const safe = rows.filter(row => statusOf(row, cfg) !== "forced_guess");
  return { byStatus: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, { words: v.words, precision: +(v.right / v.words).toFixed(4) }])), safeAccepted: safe.length, safeCoverage: +(safe.length / rows.length).toFixed(4), safePrecision: +(safe.filter(row => row.right).length / Math.max(1, safe.length)).toFixed(4) };
};
const pop = (rowsIn) => ({ n: rowsIn.length, precision: rowsIn.length ? rowsIn.filter(row => row.right).length / rowsIn.length : 0 });
// 1. official names: smallest context margin whose official population reaches the target.
const officialAt = thr => pop(rows.filter(row => row.official && row.margin >= thr));
const contextMargin = thresholds.find(thr => { const p = officialAt(thr); return p.n >= MIN_WORDS && p.precision >= TARGET; });
// 2. high_confidence_auto: the words that are NOT trusted as official, from `thr` up.
const highAt = thr => pop(rows.filter(row => !(row.official && row.margin >= (contextMargin ?? Infinity)) && row.margin >= thr));
const highMargin = thresholds.find(thr => { const p = highAt(thr); return p.n >= MIN_WORDS && p.precision >= TARGET; });
// 3. contextual_auto: gazetteer-backed words below the high margin, not official-trusted. Enabled only when that population itself reaches the target.
const ctxAt = thr => pop(rows.filter(row => row.gazetteer && !(row.official && row.margin >= (contextMargin ?? Infinity)) && row.margin >= thr && row.margin < (highMargin ?? Infinity)));
const ctxThr = thresholds.find(thr => { const p = ctxAt(thr); return p.n >= MIN_WORDS && p.precision >= TARGET; });
const contextualAuto = ctxThr !== undefined && ctxThr >= (contextMargin ?? Infinity);
const shipped = JSON.parse(readFileSync(join(out, "calibration.json"), "utf8"));
const before = score({ highMargin: shipped.highMargin, contextMargin: shipped.contextMargin, contextualAuto: true });
const chosen = { highMargin: highMargin ?? thresholds.at(-1), contextMargin: contextMargin ?? thresholds.at(-1), contextualAuto };
const after = score(chosen);
const byStatus = Object.fromEntries([...new Set(rows.map(row => row.status))].map(status => [status, { tokens: rows.filter(row => row.status === status).length, precision: rows.filter(row => row.status === status && row.right).length / Math.max(1, rows.filter(row => row.status === status).length) }]));
const high = highMargin === undefined ? undefined : { thr: highMargin, ...highAt(highMargin) }, context = contextMargin === undefined ? undefined : { thr: contextMargin, ...officialAt(contextMargin) };
const report = {
  data: { heldOutWards: heldWard.size, trainStreets: trainStreets.length, heldOutStreets: test.length, addresses: cells, damagedWords: tokens, wordsProcessed: covered },
  corruption: { placeholderShare: PLACEHOLDER, upperCaseShare: 0.25, note: "an accented letter becomes ? or its plain letter; plain letters are never touched" },
  results: {
    exactAddressAscii: +(correctCells / cells).toFixed(4), exactAddressAsciiUnseenStreetName: +(unseenCorrect / Math.max(1, unseenCells)).toFixed(4), unseenStreetNameAddresses: unseenCells,
    wordAccuracy: +(rows.filter(row => row.right).length / rows.length).toFixed(4), wordsCoveredByAddressSegments: +(covered / tokens).toFixed(4),
    remainingQuestionMarks: remaining, byStatus,
  },
  calibration: { ...chosen, populationPrecision: { official: context && { thr: context.thr, words: context.n, precision: +context.precision.toFixed(4) }, highConfidence: high && { thr: high.thr, words: high.n, precision: +high.precision.toFixed(4) }, contextualAuto: ctxThr === undefined ? "no margin reaches the target" : { thr: ctxThr, ...ctxAt(ctxThr) } }, safeBefore: { config: { highMargin: shipped.highMargin, contextMargin: shipped.contextMargin, contextualAuto: true }, ...before }, safeAfter: { config: chosen, ...after } },
  seconds: +seconds.toFixed(1), msPerAddress: +(seconds * 1000 / cells).toFixed(1),
};
console.log(JSON.stringify(report, null, 2));
if (process.argv.includes("--write")) {
  writeFileSync(join(out, "evaluation.json"), JSON.stringify(report, null, 2) + "\n");
  if (high && context) writeFileSync(join(out, "calibration.json"), JSON.stringify({ highMargin: chosen.highMargin, contextMargin: chosen.contextMargin, contextualAuto, heldOut: rows.length, precisionAtHigh: +high.precision.toFixed(4), precisionAtContext: +context.precision.toFixed(4), method: `held-out wards (every 10th), ${cells} damaged addresses, ${rows.length} damaged words (SYNTHETIC corruption); each trust level is the smallest margin at which the words that receive exactly that status reach precision >= ${TARGET} (n >= ${MIN_WORDS}); contextual_auto is enabled only if its own population reaches it` }, null, 2) + "\n");
}
