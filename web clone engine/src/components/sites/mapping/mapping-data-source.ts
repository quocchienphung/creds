import { normalizeData } from "./mapping-store.ts";
import type { MappingCommand, MappingData } from "./mapping-types.ts";

/**
 * The only place the map talks to storage. Pass your own implementation as `dataSource` to back the map
 * with an API; nothing in the component knows where the data lives. The default keeps it in this browser.
 *
 * - `load` resolves the saved snapshot, or null to start from the sample data.
 * - `save` receives the full snapshot plus every command applied since the last successful save (edits are
 *   batched for ~350 ms), so a backend can store the snapshot or replay the commands. Rejecting shows a retry
 *   notice; the edits stay in the map and are sent again with the next save.
 * - `subscribe` is optional: call the listener with a new snapshot to push remote changes into the map.
 *
 * Always pass untrusted responses through `normalizeData` before returning them from `load`/`subscribe`.
 */
export interface MappingDataSource {
  load(signal?: AbortSignal): Promise<MappingData | null>;
  save(data: MappingData, changes: MappingCommand[]): Promise<void>;
  subscribe?(listener: (data: MappingData) => void): () => void;
}

export function createLocalDataSource(key: string): MappingDataSource {
  return {
    async load() {
      try { const saved = localStorage.getItem(key); return saved ? normalizeData(JSON.parse(saved)) : null; } catch { return null; }
    },
    async save(data) { localStorage.setItem(key, JSON.stringify(data)); },
    subscribe(listener) {
      const onStorage = (event: StorageEvent) => {
        if (event.key !== key || event.storageArea !== localStorage) return;
        const data = event.newValue ? (() => { try { return normalizeData(JSON.parse(event.newValue)); } catch { return null; } })() : null;
        if (data) listener(data);
      };
      window.addEventListener("storage", onStorage);
      return () => window.removeEventListener("storage", onStorage);
    },
  };
}
