/// <reference lib="webworker" />
import { CreditImportError, readWorkbook } from "../collateral/excel-formation/engine/xlsx-reader.ts";
import type { Workbook } from "../collateral/excel-formation/engine/types.ts";
import { sheetToCsv, type CsvStats, type Delimiter } from "./convert.ts";

/** The workbook lives only in this worker; `terminate()` from the page discards it. Nothing is stored or sent anywhere. */
export type ConverterBody = { type: "open"; bytes: ArrayBuffer; name: string } | { type: "convert"; sheet: string; delimiter: Delimiter; bom: boolean };
export type ConverterRequest = { id: number } & ConverterBody;
export interface SheetInfo { name: string; hidden: boolean }
export type ConverterReply = { id: number } & (
  | { progress: number }
  | { ok: true; type: "open"; sheets: SheetInfo[]; notes: string[] }
  | ({ ok: true; type: "convert"; sample: string[][]; blob: Blob; bytes: number; ms: number } & CsvStats)
  | { ok: false; code?: string; message: string });

const SAMPLE_ROWS = 8;
let book: Workbook | null = null;
const reply = (message: ConverterReply) => (self as DedicatedWorkerGlobalScope).postMessage(message);

self.onmessage = ({ data }: MessageEvent<ConverterRequest>) => {
  const { id } = data;
  try {
    if (data.type === "open") {
      const phases = { unzip: 0.05, strings: 0.1, styles: 0.15, sheet: 0.2 };
      book = readWorkbook(new Uint8Array(data.bytes), { fileName: data.name, fileHash: "", onProgress: p => reply({ id, progress: p.phase === "sheet" ? phases.sheet + p.fraction * 0.8 : phases[p.phase] }) });
      reply({ id, ok: true, type: "open", sheets: book.sheets.map(sheet => ({ name: sheet.name, hidden: sheet.state !== "visible" })), notes: book.notes });
      return;
    }
    const sheet = book?.sheets.find(item => item.name === data.sheet);
    if (!book || !sheet) throw new Error("That worksheet is not available.");
    if (sheet.error) throw new Error(`The worksheet could not be read: ${sheet.error}`);
    const started = performance.now(), { text, sample, ...stats } = sheetToCsv(sheet, book.styleKinds, data.delimiter, SAMPLE_ROWS);
    // The BOM lets Excel read the file as UTF-8, so accented text is not shown as mojibake.
    const blob = new Blob([...(data.bom ? ["﻿"] : []), text], { type: "text/csv;charset=utf-8" });
    reply({ id, ok: true, type: "convert", sample, blob, bytes: blob.size, ms: performance.now() - started, ...stats });
  } catch (error) {
    reply({ id, ok: false, code: error instanceof CreditImportError ? error.code : undefined, message: error instanceof Error ? error.message : "The conversion failed." });
  }
};
