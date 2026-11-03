// Test and script helper (Node only): loads the built geographic package from public/data/vn-geo/ the way the app's loader does in the browser.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { GeoKnowledge } from "./geo-knowledge.ts";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..", "..", "..", "public", "data", "vn-geo");
const read = name => JSON.parse(readFileSync(join(dir, name), "utf8"));
export const loadDataset = () => ({ manifest: read("manifest.json"), admin: read("admin.json"), streets: read("streets.json"), osm: read("osm.json") });
let shared;
/** The full knowledge, built once per process. */
export const knowledge = () => shared ??= new GeoKnowledge(loadDataset());
