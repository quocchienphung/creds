import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GeoKnowledge } from "../../src/components/sites/collateral/excel-formation/engine/geo/geo-knowledge.ts";
import { recoverAddressText, UNCALIBRATED } from "../../src/components/sites/collateral/excel-formation/engine/geo/address-recovery.ts";
import { classifySegments } from "../../src/components/sites/collateral/excel-formation/engine/geo/address-classifier.ts";
import { foldKey, toAscii } from "../../src/components/sites/collateral/excel-formation/engine/geo/vn-text.ts";
const out = "public/data/vn-geo";
const read = n => JSON.parse(readFileSync(join(out, n), "utf8"));
const data = { manifest: read("manifest.json"), admin: read("admin.json"), streets: read("streets.json"), osm: read("osm.json") };
function rng(seed) { return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const random = rng(7);
const held = new Set(data.admin.recorded.wards.map((_, i) => i).filter(i => i % 10 === 3));
const test = data.streets.filter(([, w]) => held.has(w)), folds = new Set(test.map(([n]) => foldKey(n)));
const k = new GeoKnowledge({ ...data, streets: data.streets.filter(([, w]) => !held.has(w)), osm: { ...data.osm, names: data.osm.names.filter(([n]) => !folds.has(foldKey(n))) } });
const { provinces, districts, wards } = data.admin.recorded;
const damage = t => [...t.normalize("NFC")].map(c => { const p = toAscii(c); return p !== c ? (random() < 0.7 ? "?" : p) : c; }).join("");
const mode = process.argv[2] ?? "wrong";
let shown = 0, uncovered = 0, total = 0;
for (let i = 0; i < 400 && shown < 40; i++) {
  const [name, w] = test[Math.floor(random() * test.length)], ward = wards[w], district = districts[ward[1]], province = provinces[district[1]];
  const original = [name, ward[0], district[0], province].join(", "), text = damage(original), truth = toAscii(original);
  if (!text.includes("?")) continue;
  const segs = classifySegments(text, k);
  if (mode === "uncovered") { for (const s of segs) if (s.text.includes("?") && !["ADMINISTRATIVE_ADDRESS","STREET_OR_LOCALITY","PROPERTY_LOCATION_DESCRIPTION","PROJECT_OR_BUILDING_NAME"].includes(s.class)) { console.log("UNCOV", s.class, s.score.toFixed(1), JSON.stringify(s.text), "|", s.evidence.join("; ")); shown++; } continue; }
  const r = recoverAddressText(text, k, { policy: "FORCE_NO_QUESTION_MARK", calibration: UNCALIBRATED });
  for (const sg of r.segments) for (const t of sg.tokens) { const want = truth.slice(t.start, t.end); if (t.ascii !== want) { console.log("WRONG", JSON.stringify(text), "\n    token", t.original, "want", want, "got", t.ascii, `[${t.accented}] margin ${t.margin.toFixed(1)} runnerUp ${t.runnerUp ?? "-"} ${t.status} ::`, t.evidence.join("; ")); shown++; } }
}
