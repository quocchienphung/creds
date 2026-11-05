"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ConverterBody, ConverterReply, SheetInfo } from "./convert.worker.ts";
import { MESSAGE } from "../collateral/excel-formation/steps/ImportStep";
import type { CsvStats, Delimiter } from "./convert.ts";

export interface Converted extends CsvStats { sample: string[][]; blob: Blob; bytes: number; ms: number }
export interface ConverterOptions { sheet: string; delimiter: Delimiter; bom: boolean }
type Done<T extends "open" | "convert"> = Extract<ConverterReply, { ok: true; type: T }>;
type Call = { resolve: (reply: Extract<ConverterReply, { ok: true }>) => void; reject: (error: Error) => void; progress?: (fraction: number) => void };

/** One workbook at a time, read and converted in a worker. `open` replaces the previous file; `close` and unmounting end the worker. */
export function useConverter() {
  const worker = useRef<Worker | null>(null), calls = useRef(new Map<number, Call>()), ids = useRef(0), run = useRef(0), latest = useRef(0);
  const [file, setFile] = useState<{ name: string; size: number } | null>(null);
  const [reading, setReading] = useState(0);
  const [sheets, setSheets] = useState<SheetInfo[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [options, setOptions] = useState<ConverterOptions>({ sheet: "", delimiter: ",", bom: true });
  const [result, setResult] = useState<Converted | null>(null);
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const phase = !file ? "idle" : sheets.length ? "ready" : "reading";

  const stop = useCallback((reason: string) => {
    worker.current?.terminate(); worker.current = null;
    for (const call of calls.current.values()) call.reject(new Error(reason));
    calls.current.clear();
  }, []);
  useEffect(() => () => stop("Closed."), [stop]);

  const call = useCallback((request: ConverterBody, progress?: (fraction: number) => void, transfer: Transferable[] = []) => {
    if (!worker.current) {
      const created = new Worker(new URL("./convert.worker.ts", import.meta.url), { type: "module" });
      created.onmessage = ({ data }: MessageEvent<ConverterReply>) => {
        const entry = calls.current.get(data.id);
        if (!entry) return;
        if ("progress" in data) { entry.progress?.(data.progress); return; }
        calls.current.delete(data.id);
        if (data.ok) entry.resolve(data); else entry.reject(Object.assign(new Error(data.code && MESSAGE[data.code] || data.message), { code: data.code }));
      };
      created.onerror = event => { event.preventDefault(); stop(event.message || "The converter stopped unexpectedly."); };
      worker.current = created;
    }
    const id = ++ids.current;
    return new Promise<Extract<ConverterReply, { ok: true }>>((resolve, reject) => { calls.current.set(id, { resolve, reject, progress }); worker.current!.postMessage({ id, ...request }, transfer); });
  }, [stop]);

  const convert = useCallback(async (next: ConverterOptions) => {
    const mine = ++latest.current, mineRun = run.current;
    setConverting(true); setError(null);
    try {
      const reply = await call({ type: "convert", ...next }) as Done<"convert">;
      // A newer request (another option, another file) owns the screen now.
      if (mine === latest.current && mineRun === run.current) setResult(reply);
    } catch (failure) {
      if (mine === latest.current && mineRun === run.current) { setResult(null); setError(failure instanceof Error ? failure.message : "The conversion failed."); }
    } finally { if (mine === latest.current) setConverting(false); }
  }, [call]);

  const close = useCallback(() => {
    run.current++; stop("Closed.");
    setFile(null); setSheets([]); setNotes([]); setResult(null); setError(null); setConverting(false); setReading(0);
  }, [stop]);

  const open = useCallback(async (picked: File) => {
    close();
    const mine = run.current;
    setFile({ name: picked.name, size: picked.size });
    try {
      const bytes = await picked.arrayBuffer();
      const reply = await call({ type: "open", bytes, name: picked.name }, fraction => { if (mine === run.current) setReading(fraction); }, [bytes]) as Done<"open">;
      if (mine !== run.current) return;
      const first = (reply.sheets.find(sheet => !sheet.hidden) ?? reply.sheets[0]).name;
      const next = { sheet: first, delimiter: options.delimiter, bom: options.bom };
      setOptions(next); setSheets(reply.sheets); setNotes(reply.notes);
      void convert(next);
    } catch (failure) {
      if (mine !== run.current) return;
      stop("Closed."); setFile(null); setError(failure instanceof Error ? failure.message : MESSAGE.corrupt);
    }
  }, [call, close, convert, options.bom, options.delimiter, stop]);

  const change = useCallback((patch: Partial<ConverterOptions>) => {
    const next = { ...options, ...patch };
    setOptions(next); void convert(next);
  }, [convert, options]);

  return { phase, file, reading, sheets, notes, options, result, converting, error, open, close, change, dismissError: () => setError(null) } as const;
}
