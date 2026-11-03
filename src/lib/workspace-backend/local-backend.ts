import { localKey } from "./resource.ts";
import type { Loaded, ResourceRef, WorkspaceBackend } from "./types.ts";

interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void }

/**
 * Keeps every resource in this browser's localStorage under the keys earlier versions used, and shares edits
 * between tabs. This is the default: nothing leaves the browser.
 */
export function createLocalBackend(storage: StorageLike | null = typeof localStorage === "undefined" ? null : localStorage): WorkspaceBackend {
  const peek = <T,>(ref: ResourceRef): Loaded<T> | null | undefined => {
    if (!storage) return undefined;
    try {
      const saved = storage.getItem(localKey(ref));
      return saved ? { value: JSON.parse(saved) as T } : null;
    } catch { return null; }
  };
  return {
    kind: "local",
    remote: false,
    debounceMs: 0,
    peek,
    async load<T>(ref: ResourceRef): Promise<Loaded<T> | null> { return peek<T>(ref) ?? null; },
    async save<T>(ref: ResourceRef, value: T) {
      // A full disk or disabled storage must not break editing; the screen keeps the value in memory.
      try { storage?.setItem(localKey(ref), JSON.stringify(value)); } catch { /* keep working in memory */ }
    },
    subscribe<T>(ref: ResourceRef, listener: (loaded: Loaded<T>) => void) {
      if (typeof window === "undefined") return () => {};
      const key = localKey(ref);
      const onStorage = (event: StorageEvent) => {
        if (event.key !== key || !event.newValue || (event.storageArea && event.storageArea !== storage)) return;
        try { listener({ value: JSON.parse(event.newValue) as T }); } catch { /* ignore a value that is not JSON */ }
      };
      window.addEventListener("storage", onStorage);
      return () => window.removeEventListener("storage", onStorage);
    },
  };
}
