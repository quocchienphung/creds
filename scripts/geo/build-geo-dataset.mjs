// Builds the local Vietnam geographic knowledge package (public/data/vn-geo/) from the staged public sources. Run it after fetch-datasets.mjs
// (and osm_extract.py for OpenStreetMap). The app loads the package; it never touches a raw source.
//
//   node scripts/geo/build-geo-dataset.mjs
//
// Nothing here is a list of answers: every name in the package comes from a source row, each source keeps its own file and license, and the manifest
// records where each came from.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const raw = join(root, "data", "vn-geo", "raw"), staging = join(root, "data", "vn-geo", "staging"), out = join(root, "public", "data", "vn-geo");
mkdirSync(out, { recursive: true });
const sources = existsSync(join(raw, "SOURCES.json")) ? JSON.parse(readFileSync(join(raw, "SOURCES.json"), "utf8")) : {};
const nfc = text => text.normalize("NFC").replace(/\s+/g, " ").trim();
// A name is kept when it is written in Latin script (Vietnamese letters and ordinary punctuation); names in another script (Khmer, Chinese, ...) are not used.
const LATIN = /^[\p{Script=Latin}\p{M}\d\s.,\-–\/()'’&:;°"#+*!?_|ºª]+$/u;
const clean = text => { const name = nfc(text); return name && name.length <= 90 && LATIN.test(name) && /\p{L}/u.test(name) ? name : null; };

// --- CSV (quotes, commas and newlines inside fields)
function csv(text) {
  const rows = []; let field = "", row = [], quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; } else field += c; }
    else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(field); field = ""; if (row.length > 1 || row[0]) rows.push(row); row = []; }
    else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// --- Source D: the recorded (pre-merger) hierarchy and the streets under it
const recorded = { provinces: [], districts: [], wards: [] }, streets = [];
const index = { p: new Map(), d: new Map(), w: new Map() };
let rejected = 0;
const [, ...corpus] = csv(readFileSync(join(raw, "vietnam_full_address.csv"), "utf8"));
for (const [, , streetRaw, wardRaw, districtRaw, cityRaw] of corpus) {
  const street = clean(streetRaw.split(/ - (?=[^\p{Script=Latin}\d\s])/u)[0]), ward = clean(wardRaw), district = clean(districtRaw), city = clean(cityRaw);
  if (!street || !ward || !district || !city) { rejected++; continue; }
  const p = index.p.get(city) ?? (recorded.provinces.push(city), index.p.set(city, recorded.provinces.length - 1).get(city));
  const dKey = city + "\u0001" + district, d = index.d.get(dKey) ?? (recorded.districts.push([district, p]), index.d.set(dKey, recorded.districts.length - 1).get(dKey));
  const wKey = dKey + "\u0001" + ward, w = index.w.get(wKey) ?? (recorded.wards.push([ward, d]), index.w.set(wKey, recorded.wards.length - 1).get(wKey));
  streets.push([street, w]);
}

// --- Source B: current administrative units (province and ward level, official codes kept as text)
const current = { provinces: [], wards: [] };
const seedDir = join(raw, "seeds");
const tuples = file => [...readFileSync(file, "utf8").matchAll(/\('([^']*)',\s*'((?:[^']|'')*)'(?:,\s*'([^']*)')?\)/g)].map(m => [m[1], nfc(m[2].replace(/''/g, "'")), m[3]]);
if (existsSync(join(seedDir, "provinces_seed.sql"))) {
  for (const [code, name] of tuples(join(seedDir, "provinces_seed.sql"))) current.provinces.push([code, name]);
  const wardDir = join(seedDir, "wards");
  if (existsSync(wardDir)) for (const file of readdirSync(wardDir).sort()) for (const [code, name, province] of tuples(join(wardDir, file))) current.wards.push([code, name, province]);
}

// --- Source C: OpenStreetMap names (from osm_extract.py)
const kinds = [], kindIndex = new Map(), osm = [];
if (existsSync(join(staging, "osm-names.ndjson"))) {
  const merged = new Map();
  for (const line of readFileSync(join(staging, "osm-names.ndjson"), "utf8").split("\n")) {
    if (!line) continue;
    const { n, k, c } = JSON.parse(line), name = clean(n);
    if (!name) continue;
    const kind = kindIndex.get(k) ?? (kinds.push(k), kindIndex.set(k, kinds.length - 1).get(k)), key = name + "\u0001" + kind;
    merged.set(key, (merged.get(key) ?? 0) + c);
  }
  for (const [key, count] of merged) { const [name, kind] = key.split("\u0001"); osm.push([name, Number(kind), count]); }
}

const files = { "admin.json": { current, recorded }, "streets.json": streets, "osm.json": { kinds, names: osm } };
const manifest = {
  datasetVersion: new Date().toISOString().slice(0, 10), schema: 1,
  counts: { recordedProvinces: recorded.provinces.length, recordedDistricts: recorded.districts.length, recordedWards: recorded.wards.length, streets: streets.length, rejectedRows: rejected, currentProvinces: current.provinces.length, currentWards: current.wards.length, osmNames: osm.length },
  sources: Object.entries(sources).map(([id, source]) => ({ id, ...source })),
  files: {},
  notes: "Names only. 'recorded' is the administrative structure the address corpus was written under (provinces, districts, wards before the mergers); 'current' is the present official structure. Addresses are never rewritten from one to the other.",
};
if (existsSync(join(raw, "vietnam.osm.pbf")) && !sources.osm) manifest.sources.push({ id: "osm", name: "OpenStreetMap Vietnam extract (Geofabrik)", url: "https://download.geofabrik.de/asia/vietnam.html", license: "ODbL 1.0, (c) OpenStreetMap contributors: https://www.openstreetmap.org/copyright", bytes: statSync(join(raw, "vietnam.osm.pbf")).size, note: "names extracted by scripts/geo/osm_extract.py" });
for (const [name, value] of Object.entries(files)) {
  const bytes = JSON.stringify(value);
  writeFileSync(join(out, name), bytes);
  manifest.files[name] = { bytes: Buffer.byteLength(bytes), sha256: createHash("sha256").update(bytes).digest("hex") };
}
writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(JSON.stringify(manifest.counts), Object.fromEntries(Object.entries(manifest.files).map(([k, v]) => [k, v.bytes])));
