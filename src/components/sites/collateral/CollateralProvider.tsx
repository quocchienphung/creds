"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useCollateralEngine, type CollateralEngine } from "./useCollateralEngine";
import { useJsonPlan, type JsonPlanState } from "./json-formation/useJsonPlan";
import { defaultFilters, type ReviewFilters } from "./excel-formation/review-filters";
import { useUploadArchive, queueChanged } from "./queue/useUploadArchive";
import { queueRequest, readQueueFile } from "./queue/queue-client";
import type { QueueDeleteReceipt, QueueEntry } from "./queue/queue-model";

/**
 * One workbook, two sections. The file is read and reviewed in a worker of this tab; this provider keeps it alive while the person moves
 * between Excel formation, JSON formation and Queue. Archiving requires an explicit action;
 * cell analysis and unsaved corrections stay in this tab's worker.
 */
export interface CollateralValue {
  engine: CollateralEngine;
  json: JsonPlanState;
  /** The JSON section tells the provider when it is on screen, so the grouped result is built only while someone looks at it. */
  setJsonActive: (active: boolean) => void;
  filters: ReviewFilters;
  setFilters: (filters: ReviewFilters) => void;
  archive: ReturnType<typeof useUploadArchive>["archive"];
  retryArchive: () => void;
  saveToQueue: () => void;
  openSaved: (entry: QueueEntry) => Promise<void>;
  deleteSaved: (entry: QueueEntry) => Promise<QueueDeleteReceipt>;
  restoreSaved: (entry: QueueEntry, receipt: QueueDeleteReceipt) => Promise<QueueEntry>;
}
const Context = createContext<CollateralValue | null>(null);

export function CollateralProvider({ children, workspaceId }: { children: ReactNode; workspaceId: string }) {
  const rawEngine = useCollateralEngine();
  const { open: openInWorker, close: closeWorker } = rawEngine;
  const { archive, save, openSaved: selectSaved, forget, retry } = useUploadArchive(workspaceId, rawEngine);
  const [localFile, setLocalFile] = useState<File | null>(null);
  const open = useCallback(async (...args: Parameters<CollateralEngine["open"]>) => {
    forget();
    setLocalFile(args[0]);
    await openInWorker(...args);
  }, [forget, openInWorker]);
  const saveToQueue = useCallback(() => { if (localFile && rawEngine.phase === "ready") void save(localFile); }, [localFile, rawEngine.phase, save]);
  const close = useCallback(() => { closeWorker(); forget(); setLocalFile(null); }, [closeWorker, forget]);
  const engine = useMemo(() => ({ ...rawEngine, open, close }), [rawEngine, open, close]);
  const openSaved = useCallback(async (entry: QueueEntry) => {
    const file = await readQueueFile(workspaceId, entry);
    setLocalFile(file);
    selectSaved(file, entry);
    await openInWorker(file);
  }, [workspaceId, selectSaved, openInWorker]);
  const deleteSaved = useCallback(async (entry: QueueEntry) => {
    const response = await queueRequest(workspaceId, `/${entry.id}`, { method: "DELETE" });
    const receipt = (await response.json() as { data: QueueDeleteReceipt }).data;
    // The in-memory review can continue; deleting the archived original must not discard corrections.
    if (archive?.entry?.id === entry.id) forget();
    queueChanged();
    return receipt;
  }, [workspaceId, archive?.entry?.id, forget]);
  const restoreSaved = useCallback(async (entry: QueueEntry, receipt: QueueDeleteReceipt) => {
    const response = await queueRequest(workspaceId, `/${entry.id}/restore`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ undoToken: receipt.undoToken }) });
    const restored = (await response.json() as { data: QueueEntry }).data;
    queueChanged();
    return restored;
  }, [workspaceId]);
  const [jsonActive, setJsonActive] = useState(false);
  const json = useJsonPlan(engine, jsonActive);
  // Filters belong to the open file: another file starts from the defaults.
  const fileKey = engine.result?.fileHash ?? "";
  const [box, setBox] = useState<{ key: string; value: ReviewFilters }>({ key: "", value: defaultFilters });
  const filters = box.key === fileKey ? box.value : defaultFilters;
  const value = useMemo<CollateralValue>(() => ({ engine, json, setJsonActive, filters, setFilters: next => setBox({ key: fileKey, value: next }), archive, retryArchive: retry, saveToQueue, openSaved, deleteSaved, restoreSaved }), [engine, json, filters, fileKey, archive, retry, saveToQueue, openSaved, deleteSaved, restoreSaved]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useCollateral(): CollateralValue {
  const value = useContext(Context);
  if (!value) throw new Error("useCollateral must be used inside CollateralProvider.");
  return value;
}
/** Numbers for the sidebar: how many serious issues are open, and whether the JSON is ready. */
export function useCollateralBadges(): { open: number; ready: boolean } {
  const value = useContext(Context);
  if (!value || value.engine.phase !== "ready" || !value.engine.view) return { open: 0, ready: false };
  return { open: value.engine.view.summary.blocking, ready: value.json.plan?.ready === true };
}
