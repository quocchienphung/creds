import { GeoKnowledge, type GeoDataset } from "./geo-knowledge.ts";
import { UNCALIBRATED, type GeoCalibration } from "./address-recovery.ts";

/** The geographic knowledge a repair runs with: built from the packaged data (public/data/vn-geo), same-origin, nothing leaves the machine. */
export interface GeoEngine { knowledge: GeoKnowledge; calibration: GeoCalibration; datasetVersion: string }

/**
 * Fetch and build the knowledge. Resolves to `{ error }` instead of throwing: without the data the generic repair still runs, and the report says
 * the geographic recovery was unavailable and why.
 */
export async function loadGeo(base = "/data/vn-geo/", fetcher: typeof fetch = fetch): Promise<GeoEngine | { error: string }> {
  try {
    const get = async (name: string) => { const response = await fetcher(base + name); if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`); return response.json(); };
    const [manifest, admin, streets, osm] = await Promise.all(["manifest.json", "admin.json", "streets.json", "osm.json"].map(get));
    // The calibration is optional: without it the conservative defaults apply.
    const calibration: GeoCalibration = await get("calibration.json").catch(() => UNCALIBRATED);
    const dataset: GeoDataset = { manifest, admin, streets, osm };
    return { knowledge: new GeoKnowledge(dataset), calibration, datasetVersion: manifest.datasetVersion };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
