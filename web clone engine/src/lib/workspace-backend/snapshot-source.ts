import { BackendError } from "./types.ts";
import type { ResourceRef, WorkspaceBackend } from "./types.ts";

/**
 * The shape the map and the invoice use for their own data source: load one snapshot, save it (with the edit
 * commands that produced it), and optionally hear about changes made elsewhere.
 */
export interface SnapshotSource<T> {
  load(signal?: AbortSignal): Promise<T | null>;
  save(value: T, commands?: unknown[]): Promise<void>;
  subscribe?(listener: (value: T) => void): () => void;
}

/**
 * Backs a screen that manages its own saving (batching, retry notices) with a resource of the shared backend,
 * so it uses the same transport, authentication and error handling as the rest of the workspace.
 *
 * The revision the backend reported is sent back as `baseVersion`. When the backend answers that the stored
 * copy moved on (a conflict), the newest revision is fetched and the error is rethrown: the screen shows its
 * retry notice, and the retry the person asks for is based on what is stored now.
 *
 * `normalize` must turn untrusted data into a safe value (or throw); it is applied to everything that comes in.
 */
export function createSnapshotSource<T>(backend: WorkspaceBackend, ref: ResourceRef, normalize: (raw: unknown) => T): SnapshotSource<T> {
  let version: string | undefined;
  const subscribe = backend.subscribe;
  return {
    async load(signal) {
      const loaded = await backend.load<unknown>(ref, signal);
      version = loaded?.version;
      return loaded ? normalize(loaded.value) : null;
    },
    async save(value, commands) {
      try {
        const result = await backend.save(ref, value, { ...(commands?.length ? { commands } : {}), ...(version ? { baseVersion: version } : {}) });
        if (result?.version) version = result.version;
      } catch (error) {
        if (error instanceof BackendError && error.code === "conflict") {
          try { version = (await backend.load<unknown>(ref))?.version; } catch { /* keep the old revision; the retry will report the problem */ }
        }
        throw error;
      }
    },
    subscribe: subscribe ? listener => subscribe.call(backend, ref, (loaded: { value: unknown; version?: string }) => {
      try { const next = normalize(loaded.value); version = loaded.version ?? version; listener(next); } catch { /* ignore a copy that is not valid */ }
    }) : undefined,
  };
}
