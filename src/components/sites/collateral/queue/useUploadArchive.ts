"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { patchQueueEntry, uploadQueueFile } from "./queue-client";
import type { QueueEntry } from "./queue-model";
import type { CollateralEngine } from "../useCollateralEngine";

type Archive = { file: File; entry?: QueueEntry; state: "saving" | "saved" | "error"; message?: string };
export const queueChanged = () => window.dispatchEvent(new Event("collateral-queue-changed"));

/** Originals are saved separately from the browser worker; a failed save never masquerades as a saved upload. */
export function useUploadArchive(workspaceId: string, engine: CollateralEngine) {
  const [archive, setArchive] = useState<Archive | null>(null);
  const current = useRef<Archive | null>(null);
  const generation = useRef(0);
  const alive = useRef(true);
  const patching = useRef("");
  const publish = useCallback((next: Archive | null) => { current.current = next; if (alive.current) setArchive(next); }, []);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const save = useCallback(async (file: File) => {
    const run = ++generation.current;
    publish({ file, state: "saving" });
    try {
      const entry = await uploadQueueFile(workspaceId, file);
      queueChanged();
      if (run === generation.current) publish({ file, entry, state: "saved" });
    } catch (error) {
      if (run === generation.current) publish({ file, state: "error", message: error instanceof Error ? error.message : "The original could not be saved." });
    }
  }, [workspaceId, publish]);

  const entry = archive?.entry;
  const desired = engine.phase === "ready" && engine.result ? {
    status: "ready" as const, sheets: engine.result.profile.sheets.length, rows: engine.result.profile.sheets.reduce((sum, sheet) => sum + sheet.dataRows, 0),
  } : engine.phase === "failed" && engine.failure ? { status: "failed" as const, error: engine.failure.message } : null;
  const patch = desired ? JSON.stringify(desired) : "";
  useEffect(() => {
    if (!entry || !patch || archive?.state !== "saved") return;
    const update = JSON.parse(patch) as Parameters<typeof patchQueueEntry>[2];
    if (entry.status === update.status && entry.error === update.error && entry.sheets === update.sheets && entry.rows === update.rows) return;
    const key = `${entry.id}:${patch}`;
    if (patching.current === key) return;
    patching.current = key;
    const run = generation.current;
    void patchQueueEntry(workspaceId, entry.id, update).then(saved => {
      queueChanged();
      if (run === generation.current && current.current) publish({ ...current.current, entry: saved, state: "saved", message: undefined });
    }).catch(error => {
      if (run === generation.current && current.current) publish({ ...current.current, state: "error", message: error instanceof Error ? error.message : "Processing status could not be saved." });
    }).finally(() => { if (patching.current === key) patching.current = ""; });
  }, [entry, archive?.state, patch, workspaceId, publish]);

  const openSaved = useCallback((file: File, entry: QueueEntry) => { generation.current++; publish({ file, entry, state: "saved" }); }, [publish]);
  const forget = useCallback(() => { generation.current++; publish(null); }, [publish]);
  const retry = useCallback(() => {
    const previous = current.current;
    if (!previous) return;
    if (previous.entry) { patching.current = ""; publish({ ...previous, state: "saved", message: undefined }); }
    else void save(previous.file);
  }, [save, publish]);
  return { archive, save, openSaved, forget, retry };
}
