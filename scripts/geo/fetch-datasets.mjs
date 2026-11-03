// One-time dataset SETUP (never part of the app's normal run): downloads the public sources into data/vn-geo/raw/ unchanged and records where
// they came from. Normal import, scan, repair and export need no internet.
//
//   node scripts/geo/fetch-datasets.mjs              admin seeds + address corpus
//   node scripts/geo/fetch-datasets.mjs --osm        also the OpenStreetMap Vietnam extract (~330 MB)
//   node scripts/geo/fetch-datasets.mjs --nso file   copy a manually downloaded NSO administrative-unit Excel export into the staging directory
//
// A source that cannot be downloaded is reported, never replaced by a paid service: put the file into data/vn-geo/raw/ by hand and re-run the build.
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const raw = join(root, "data", "vn-geo", "raw");
mkdirSync(join(raw, "seeds", "wards"), { recursive: true });
const sourcesFile = join(raw, "SOURCES.json");
const sources = existsSync(sourcesFile) ? JSON.parse(readFileSync(sourcesFile, "utf8")) : {};
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const flag = name => process.argv.includes(name);

async function get(url) {
  const response = await fetch(url, { headers: { "user-agent": "vn-geo-setup" } });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}
function keep(id, file, bytes, meta) {
  writeFileSync(file, bytes);
  sources[id] = { ...sources[id], ...meta, retrieved: new Date().toISOString().slice(0, 10), sha256: sha256(bytes), bytes: bytes.length };
  console.log("kept", id, bytes.length, "bytes");
}

if (flag("--nso")) {
  const from = process.argv[process.argv.indexOf("--nso") + 1];
  const bytes = readFileSync(from);
  copyFileSync(from, join(raw, "nso-don-vi-hanh-chinh.xlsx"));
  sources.nso = { name: "NSO administrative-unit catalogue (manual Excel export)", url: "https://www.nso.gov.vn/phuong-phap-luan-thong-ke/danh-muc/don-vi-hanh-chinh/", license: "official statistical catalogue of Viet Nam (cite the source)", retrieved: new Date().toISOString().slice(0, 10), sha256: sha256(bytes), bytes: bytes.length };
} else {
  // Source B: the administrative seed files of thanglequoc/vietnamese-provinces-database (MIT).
  const repo = "https://api.github.com/repos/thanglequoc/vietnamese-provinces-database";
  const tree = JSON.parse(new TextDecoder().decode(await get(`${repo}/git/trees/master?recursive=1`))).tree;
  const seeds = tree.filter(item => item.type === "blob" && /^dataset-generation-scripts\/resources\/manual_seeds\/(provinces_seed\.sql|wards\/.+\.sql)$/.test(item.path));
  const base = "https://raw.githubusercontent.com/thanglequoc/vietnamese-provinces-database/master/";
  const chunks = [];
  for (const item of seeds) { const bytes = await get(base + item.path); writeFileSync(join(raw, "seeds", item.path.endsWith("provinces_seed.sql") ? "provinces_seed.sql" : `wards/${item.path.split("/").pop()}`), bytes); chunks.push(sha256(bytes)); }
  const license = await get(base + "LICENSE");
  writeFileSync(join(raw, "seeds", "LICENSE"), license);
  sources.provinces = { name: "vietnamese-provinces-database (administrative seeds)", url: "https://github.com/thanglequoc/vietnamese-provinces-database", license: "MIT (see seeds/LICENSE)", retrieved: new Date().toISOString().slice(0, 10), files: seeds.length, sha256: sha256(new TextEncoder().encode(chunks.join(""))), version: "master at retrieval" };
  // Source D: the address corpus (Apache-2.0).
  keep("addresses", join(raw, "vietnam_full_address.csv"), await get("https://huggingface.co/datasets/trucmtnguyen/vietnam-address-collection/resolve/main/vietnam_full_address.csv"), { name: "trucmtnguyen/vietnam-address-collection", url: "https://huggingface.co/datasets/trucmtnguyen/vietnam-address-collection", license: "Apache-2.0" });
  if (flag("--osm")) keep("osm", join(raw, "vietnam.osm.pbf"), await get("https://download.geofabrik.de/asia/vietnam-latest.osm.pbf"), { name: "OpenStreetMap Vietnam extract (Geofabrik)", url: "https://download.geofabrik.de/asia/vietnam.html", license: "ODbL 1.0, (c) OpenStreetMap contributors: https://www.openstreetmap.org/copyright" });
}
writeFileSync(sourcesFile, JSON.stringify(sources, null, 2) + "\n");
