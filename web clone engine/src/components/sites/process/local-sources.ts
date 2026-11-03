import { BackendError } from "@/lib/workspace-backend";
import type { SnapshotSource } from "@/lib/workspace-backend";
import { normalizeLibrary } from "./process-model";
import type { ProcessLibrary } from "./process-model";
import { normalizeRunStore } from "./run-model";
import type { RunStore } from "./run-model";

/* Browser-storage sources for when a page is used without the workspace backend (and for tests). */
export function createLocalProcessSource(key: string): SnapshotSource<ProcessLibrary> {
  return {
    async load() { const saved = localStorage.getItem(key); if (!saved) return null; const value = normalizeLibrary(JSON.parse(saved)); if (!value) throw new BackendError("invalid", "The saved processes are invalid. Your stored copy has been kept."); return value; },
    async save(library) { localStorage.setItem(key, JSON.stringify(library)); },
  };
}
export function createLocalRunSource(key: string): SnapshotSource<RunStore> {
  return {
    async load() { const saved = localStorage.getItem(key); return saved ? normalizeRunStore(JSON.parse(saved)) : null; },
    async save(store) { localStorage.setItem(key, JSON.stringify(store)); },
  };
}
