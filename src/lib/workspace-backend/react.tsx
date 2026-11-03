"use client";

import { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { createConfiguredBackend } from "./config.ts";
import { createLocalBackend } from "./local-backend.ts";
import type { ResourceDefinition } from "./resource.ts";
import { ResourceStore } from "./store.ts";
import type { SyncSummary } from "./store.ts";
import type { BackendError, QueryName, WorkspaceBackend } from "./types.ts";

const StoreContext = createContext<ResourceStore | null>(null);
// Outside a provider (a screen mounted on its own) the resources live in this browser.
let standalone: ResourceStore | null = null;
const idle: SyncSummary = { loading: 0, saving: 0, errors: 0, message: null };

/** Gives every screen below it the same backend and the same cache of loaded resources. */
export function WorkspaceBackendProvider({ backend, children }: { backend?: WorkspaceBackend; children: ReactNode }) {
  const store = useMemo(() => new ResourceStore(backend ?? createConfiguredBackend(), createLocalBackend()), [backend]);
  useEffect(() => {
    const leave = () => store.flushAll(true);
    const wake = () => { if (document.visibilityState === "visible") store.revalidateAll(); else store.flushAll(true); };
    window.addEventListener("pagehide", leave);
    window.addEventListener("focus", () => store.revalidateAll());
    document.addEventListener("visibilitychange", wake);
    return () => { leave(); window.removeEventListener("pagehide", leave); document.removeEventListener("visibilitychange", wake); };
  }, [store]);
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useResourceStore(): ResourceStore {
  const store = useContext(StoreContext);
  if (store) return store;
  standalone ??= new ResourceStore(createLocalBackend(), createLocalBackend());
  return standalone;
}
export function useWorkspaceBackend(): WorkspaceBackend { return useResourceStore().backend; }

export interface SyncInfo<T = unknown> {
  /** "loading" until the first load finishes. */
  phase: "loading" | "ready";
  save: "idle" | "saving" | "error";
  error: BackendError | null;
  retry: () => void;
  /** Drop unsaved edits and fetch the stored value again. */
  reload: () => void;
  /** Replace the value with one the backend pushed. It is not saved back. */
  apply: (value: T) => void;
  /** Save pending edits now and resolve when the save has finished. */
  flush: () => Promise<void>;
}

/**
 * State that lives in the backend: the same shape as useState, plus the sync status. Edits show immediately
 * and are saved after a short pause. `workspaceId` is ignored for account-level resources.
 */
export function useResource<T>(definition: ResourceDefinition<T>, workspaceId: string | undefined, seed: T, options?: { persist?: boolean }): [T, Dispatch<SetStateAction<T>>, SyncInfo<T>] {
  const entry = useResourceStore().entry(definition, workspaceId, seed, options);
  const view = useSyncExternalStore(entry.subscribe, entry.getSnapshot, entry.getServerSnapshot);
  return [view.value, entry.set as Dispatch<SetStateAction<T>>, { phase: view.phase, save: view.save, error: view.error, retry: entry.retry, reload: entry.reload, apply: entry.apply, flush: () => entry.flush() }];
}

/** Read-only data computed by the backend, with a built-in sample until (or instead of) the backend's answer. */
export function useQuery<T>(name: QueryName, workspaceId: string, params: Record<string, string | number>, fallback: T, parse?: (raw: unknown) => T | undefined) {
  const entry = useResourceStore().query(name, workspaceId, params, fallback, parse);
  const view = useSyncExternalStore(entry.subscribe, entry.getSnapshot, entry.getSnapshot);
  return { data: view.data, phase: view.phase, error: view.error, retry: entry.retry };
}

export function useSyncSummary() {
  const store = useResourceStore();
  return { summary: useSyncExternalStore(store.subscribeSummary, store.getSummary, () => idle), retryAll: () => store.retryAll() };
}
