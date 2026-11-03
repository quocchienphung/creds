"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EngineClient, EngineError } from "./engine/engine-client";
import type { GridMeta, GridRow, OpenResult, ReviewView, RowContext, SheetWindow } from "./engine/protocol";
import type { FixKind } from "./excel-formation/engine/types";
import type { BulkItem } from "./excel-formation/engine/review";
import { LIMITS } from "./excel-formation/engine/limits";
import type { RestoreError } from "./excel-formation/engine/progress";
import type { JsonPlan } from "./json-formation/engine/json-session";
import type { ReportMeta, ReportOptions } from "./json-formation/engine/report-options";
import type { RepairProgress, RepairReport } from "./excel-formation/engine/auto-repair";

const stateKey = (c: { patched: number; exceptions: number; edited: number; verified: number }) => `${c.patched}:${c.exceptions}:${c.edited}:${c.verified}`;
export type Phase = "idle" | "scanning" | "ready" | "failed";
export interface Progress { phase: "read" | "scan"; fraction: number }
export interface EngineFailure { message: string; code?: string }
export type RestoreOutcome = { ok: true; patches: number; exceptions: number; matches: boolean; rulesChanged: boolean } | { ok: false; error: RestoreError | "too-large"; at?: { row: number; col: number } };
export interface ExportedFile { fileName: string; blob: Blob; changedCells: number; ok: boolean; wrongValues: number; unexpectedChanges: number }

/**
 * The page's handle on the review engine. The workbook is read, scanned and edited in a Web Worker of this tab; only the issue list and the
 * review view come back here, and nothing is stored or sent over the network.
 */
export function useCollateralEngine() {
  const client = useRef<EngineClient | null>(null);
  const opening = useRef(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState<Progress>({ phase: "read", fraction: 0 });
  const [failure, setFailure] = useState<EngineFailure | null>(null);
  const [result, setResult] = useState<OpenResult | null>(null);
  const [view, setView] = useState<ReviewView | null>(null);
  const [busy, setBusy] = useState(false);
  const [repairProgress, setRepairProgress] = useState<RepairProgress | null>(null);
  const repairing = useRef(false);
  const [fileName, setFileName] = useState("");
  const [fileSize, setFileSize] = useState(0);
  const [diacriticPolicy, setDiacriticPolicy] = useState(true);
  const lastFile = useRef<File | null>(null);
  /** What the person last put in a file (progress or corrected workbook), so closing the tab only warns about work that is not in one. */
  const [kept, setKept] = useState("");
  /** How long the file took to open and scan (ms), read off this tab's clock. */
  const [openMs, setOpenMs] = useState(0);

  const engine = () => client.current ?? (client.current = new EngineClient());
  useEffect(() => () => { opening.current++; client.current?.cancel(); client.current = null; }, []);

  const open = useCallback(async (file: File, policy = diacriticPolicy, overrides: Record<string, number> = {}) => {
    const run = ++opening.current;
    client.current?.cancel(); client.current = null;
    lastFile.current = file;
    setFileName(file.name); setFileSize(file.size); setKept(""); setFailure(null); setResult(null); setView(null); setProgress({ phase: "read", fraction: 0 }); setRepairProgress(null); setBusy(false); repairing.current = false;
    if (!/\.xlsx$/i.test(file.name)) { setPhase("failed"); setFailure({ message: "Only .xlsx workbooks can be opened.", code: "not-xlsx" }); return; }
    if (file.size > LIMITS.fileBytes) { setPhase("failed"); setFailure({ message: "The file is larger than this tool accepts.", code: "too-large" }); return; }
    setPhase("scanning");
    const started = performance.now();
    try {
      const bytes = await file.arrayBuffer();
      if (run !== opening.current) return;
      const response = await engine().call({ type: "open", bytes, fileName: file.name, diacriticPolicy: policy, overrides }, { transfer: [bytes], progress: setProgress });
      if (run !== opening.current) return;
      if (response.type !== "opened") throw new Error("Unexpected answer from the review engine.");
      setResult(response.result); setView(response.view); setPhase("ready"); setOpenMs(Math.round(performance.now() - started));
    } catch (error) {
      if (run !== opening.current) return;
      if (error instanceof EngineError && error.code === "cancelled") return;
      setPhase("failed");
      setFailure({ message: error instanceof Error ? error.message : String(error), code: error instanceof EngineError ? error.code : undefined });
    }
  }, [diacriticPolicy]);

  /** Stop a scan, or close the workbook: the worker is terminated, so every byte of the file is dropped. */
  const close = useCallback(() => {
    opening.current++;
    client.current?.cancel(); client.current = null; lastFile.current = null; setKept("");
    setPhase("idle"); setResult(null); setView(null); setFailure(null); setFileName(""); setFileSize(0); setBusy(false); setRepairProgress(null); repairing.current = false;
  }, []);
  const retry = useCallback(() => { if (lastFile.current) void open(lastFile.current); }, [open]);
  /** Scan again with another mapping or policy; reviewer work is discarded because issues are re-derived. */
  const rescan = useCallback((policy: boolean, overrides: Record<string, number> = {}) => { setDiacriticPolicy(policy); if (lastFile.current) { client.current?.cancel(); client.current = null; void open(lastFile.current, policy, overrides); } }, [open]);

  const act = useCallback(async <T,>(run: () => Promise<T>): Promise<T | undefined> => {
    if (repairing.current) return undefined;
    setBusy(true);
    try { return await run(); } catch (error) { setFailure({ message: error instanceof Error ? error.message : String(error) }); return undefined; } finally { setBusy(false); }
  }, []);
  const autoRepair = useCallback(async (): Promise<{ fileName: string; blob: Blob; report: RepairReport } | null> => {
    if (repairing.current || busy) return null;
    repairing.current = true; setBusy(true); setFailure(null);
    const run = opening.current;
    try {
      const response = await engine().call({ type: "autoRepair" }, { repairProgress: p => { if (run === opening.current) setRepairProgress(p); } });
      if (run !== opening.current || response.type !== "repaired") return null;
      setView(response.view);
      return { fileName: response.fileName, blob: new Blob([response.bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), report: response.report };
    } catch (error) {
      if (run === opening.current) setFailure({ message: error instanceof Error ? error.message : "Automatic repair failed." });
      return null;
    } finally { if (run === opening.current) { repairing.current = false; setBusy(false); } }
  }, [busy]);
  const cancelRepair = useCallback(() => { if (repairing.current) void engine().call({ type: "cancelRepair" }).catch(() => {}); }, []);
  const send = useCallback(async (request: Parameters<EngineClient["call"]>[0]) => {
    const response = await engine().call(request);
    if (response.type === "view") setView(response.view);
    return response;
  }, []);

  const edit = useCallback((edits: { sheet?: string; row: number; col: number; value: string; source?: "typed" | "suggestion" | "fix" | "twin" | "group" }[]) => act(() => send({ type: "edit", edits })), [act, send]);
  const reject = useCallback((issueId: string) => act(() => send({ type: "reject", issueId })), [act, send]);
  const reopen = useCallback((issueId: string) => act(() => send({ type: "reopen", issueId })), [act, send]);
  const accept = useCallback(async (issueId: string, reason: string) => { const response = await act(() => send({ type: "exception", issueId, reason })); return response?.type === "view"; }, [act, send]);
  const chooseGroup = useCallback((issueId: string, value: string) => act(() => send({ type: "chooseGroup", issueId, value })), [act, send]);
  const duplicatePlan = useCallback(async (issueId: string, includeTwin: boolean) => {
    const response = await act(() => engine().call({ type: "duplicatePlan", issueId, includeTwin }));
    return response?.type === "duplicatePlan" ? response.plan : null;
  }, [act]);
  const duplicateApply = useCallback(async (issueId: string, value: string, includeTwin: boolean) => {
    const response = await act(() => engine().call({ type: "duplicateApply", issueId, value, includeTwin }));
    if (response?.type !== "duplicateApplied") return null;
    setView(response.view); return { rows: response.rows, changedCells: response.changedCells };
  }, [act]);
  const undo = useCallback(() => act(() => send({ type: "undo" })), [act, send]);
  const redo = useCallback(() => act(() => send({ type: "redo" })), [act, send]);
  const bulkPlan = useCallback(async (kind: FixKind): Promise<BulkItem[]> => { const r = await act(() => send({ type: "bulkPlan", kind })); return r?.type === "bulkPlan" ? r.items : []; }, [act, send]);
  const bulkApply = useCallback((kind: FixKind) => act(() => send({ type: "bulkApply", kind })), [act, send]);
  const rowContext = useCallback(async (row: number, sheet?: string): Promise<RowContext | null> => { const r = await engine().call({ type: "row", row, sheet }); return r.type === "row" ? r.context : null; }, []);
  const sheetWindow = useCallback(async (row: number, col: number): Promise<SheetWindow | null> => { const r = await engine().call({ type: "window", row, col }); return r.type === "window" ? r.window : null; }, []);
  const gridMeta = useCallback(async (sheet?: string): Promise<GridMeta | null> => { const r = await engine().call({ type: "gridMeta", sheet }); return r.type === "gridMeta" ? r.meta : null; }, []);
  const gridRows = useCallback(async (from: number, count: number, sheet?: string): Promise<GridRow[]> => { const r = await engine().call({ type: "grid", from, count, sheet }); return r.type === "grid" ? r.rows : []; }, []);
  const predict = useCallback(async (row: number, col: number, sheet?: string) => { const r = await engine().call({ type: "predict", row, col, sheet }); return r.type === "predict" ? { text: r.text, predictions: r.predictions, modelWords: r.modelWords } : null; }, []);
  const groupRows = useCallback(async (issueId: string): Promise<number[]> => { const r = await engine().call({ type: "groupRows", issueId }); return r.type === "groupRows" ? r.rows : []; }, []);
  const exportXlsx = useCallback(async (): Promise<ExportedFile | null> => {
    const r = await act(() => engine().call({ type: "exportXlsx" }));
    if (!r || r.type !== "exported") return null;
    if (view) setKept(stateKey({ patched: view.summary.patched, exceptions: view.summary.exceptions, edited: view.summary.byStatus.edited, verified: view.summary.byStatus.verified }));
    return { fileName: r.fileName, blob: new Blob([r.bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), changedCells: r.changedCells, ok: r.roundTrip.ok, wrongValues: r.roundTrip.wrongValues, unexpectedChanges: r.roundTrip.unexpectedChanges };
  }, [act, view]);

  /** The corrections so far as a small file the person keeps: nothing is stored by this page. */
  const saveProgress = useCallback(async (): Promise<{ fileName: string; blob: Blob; patches: number } | null> => {
    const r = await act(() => engine().call({ type: "progressSave" }));
    if (!r || r.type !== "progress") return null;
    setKept(stateKey(r.file.counts));
    return { fileName: `${fileName.replace(/\.xlsx$/i, "")}.progress.json`, blob: new Blob([JSON.stringify(r.file, null, 2)], { type: "application/json" }), patches: r.file.patches.length };
  }, [act, fileName]);
  /** Load a progress file onto the open workbook. Refused whole if it belongs to another file or a cell has changed. */
  const loadProgress = useCallback(async (file: File): Promise<RestoreOutcome> => {
    if (file.size > 20 * 1024 * 1024) return { ok: false, error: "too-large" };
    let parsed: unknown;
    try { parsed = JSON.parse(await file.text()); } catch { return { ok: false, error: "not-progress" }; }
    const r = await act(() => engine().call({ type: "progressLoad", file: parsed }));
    if (!r) return { ok: false, error: "damaged" };
    if (r.type === "restoreRefused") return { ok: false, error: r.error, ...(r.at ? { at: r.at } : {}) };
    if (r.type !== "restored") return { ok: false, error: "damaged" };
    setView(r.view);
    return { ok: true, patches: r.patches, exceptions: r.exceptions, matches: r.matches, rulesChanged: r.rulesChanged };
  }, [act]);

  /** Check every gate for the reporting JSON; with `final` and every gate green the bytes come back too. Metadata is sent to the worker only, never stored. */
  const jsonPlan = useCallback(async (meta: ReportMeta, options: ReportOptions, final = false, zip = false): Promise<{ plan: JsonPlan; bytes?: Blob; audit: string; csv: string } | null> => {
    const r = await engine().call({ type: "json", meta, options, final, ...(zip ? { zip } : {}) });
    return r.type === "json" ? { plan: r.plan, audit: r.audit, csv: r.csv, ...(r.bytes ? { bytes: new Blob([r.bytes], { type: zip ? "application/zip" : "application/json" }) } : {}) } : null;
  }, []);

  const unsaved = !!view && (view.summary.patched > 0 || view.summary.exceptions > 0) && stateKey({ patched: view.summary.patched, exceptions: view.summary.exceptions, edited: view.summary.byStatus.edited, verified: view.summary.byStatus.verified }) !== kept;
  /** The browser's own "leave this page?" prompt, only while there are corrections that are not in a file. The page stores nothing itself. */
  useEffect(() => {
    if (!unsaved) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  /** The reporting document of the latest plan, read a page at a time (the viewer's source). */
  const docRoot = useCallback(async () => { const r = await engine().call({ type: "docRoot" }); return r.type === "docRoot" ? r : null; }, []);
  const docChildren = useCallback(async (keys: string[], from: number, to: number) => { const r = await engine().call({ type: "docChildren", keys, from, to }); return r.type === "docChildren" ? r : null; }, []);
  const docSearch = useCallback(async (query: string, max: number) => { const r = await engine().call({ type: "docSearch", query, max }); return r.type === "docSearch" ? r : null; }, []);
  const docText = useCallback(async (keys: string[]) => { const r = await engine().call({ type: "docText", keys }); return r.type === "docText" ? r : null; }, []);

  return { duplicatePlan, duplicateApply, autoRepair, cancelRepair, repairProgress, openMs, docRoot, docChildren, docSearch, docText, unsaved, saveProgress, loadProgress, jsonPlan, phase, progress, failure, result, view, busy, fileName, fileSize, diacriticPolicy, open, close, retry, rescan, edit, reject, reopen, accept, chooseGroup, undo, redo, bulkPlan, bulkApply, rowContext, sheetWindow, gridMeta, gridRows, predict, groupRows, exportXlsx, clearFailure: () => setFailure(null) };
}
export type CollateralEngine = ReturnType<typeof useCollateralEngine>;
