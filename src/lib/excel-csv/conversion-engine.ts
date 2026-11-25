import { CreditImportError, readWorkbook } from "../../components/sites/collateral/excel-formation/engine/xlsx-reader.ts";
import type { Sheet, StyleKind, Workbook } from "../../components/sites/collateral/excel-formation/engine/types.ts";
import { LIMITS } from "../../components/sites/collateral/excel-formation/engine/limits.ts";
import { columnIndex, columnLetters } from "../../components/sites/collateral/excel-formation/engine/text.ts";
import { csvText, encodeCsv } from "./csv-writer.ts";
import { verifyCsv } from "./csv-verifier.ts";
import { normalizeCell, WarningSink, INFO_CODES } from "./value-normalizer.ts";
import { ConversionError, DEFAULT_OPTIONS, type ConversionOptions, type ConvertedFile, type ExcelInput, type ProgressEvent, type VerificationStatus, type Warning } from "./types.ts";
export * from "./types.ts";

type Box = { r1: number; r2: number; c1: number; c2: number };
type Rec = { r: number; fields: string[] };
const MODES = ["standard_csv", "single_column_csv", "plain_text_comma"];

const sha256 = async (bytes: Uint8Array) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource)), b => b.toString(16).padStart(2, "0")).join("");
const checkAbort = (signal?: AbortSignal) => { if (signal?.aborted) throw new ConversionError("aborted", "The conversion was cancelled."); };

/** Trust boundary: options usually come from a UI as loose JSON. */
function resolveOptions(partial: Partial<ConversionOptions>): ConversionOptions {
  const o = { ...DEFAULT_OPTIONS, ...partial };
  const bad = (why: string) => { throw new ConversionError("invalid_options", why); };
  if (!MODES.includes(o.outputMode)) bad("Unknown outputMode.");
  if (o.delimiter !== ",") bad("Only the ASCII comma delimiter is supported.");
  if (o.recordDelimiter !== "\r\n" && o.recordDelimiter !== "\n") bad("recordDelimiter must be CRLF or LF.");
  if (!["data_region", "entire_selected_range"].includes(o.rangePolicy)) bad("Unknown rangePolicy.");
  if (!["lossless", "excel_view_safe"].includes(o.csvFormulaProtection)) bad("Unknown csvFormulaProtection.");
  if (!["full", "sampled"].includes(o.verification)) bad("Unknown verification mode.");
  if (o.explicitRange !== undefined && o.rangePolicy !== "entire_selected_range") bad("explicitRange needs rangePolicy 'entire_selected_range'.");
  if (o.fidelityPolicy !== "stored_value") throw new ConversionError("unsupported_option", "displayed_value is not supported: the reader does not expose number formats, so displayed text cannot be reproduced reliably. Use stored_value.");
  return o;
}

function open(input: ExcelInput, onProgress?: (e: ProgressEvent) => void): Workbook {
  try { return readWorkbook(input.bytes, { fileName: input.name, fileHash: "", onProgress: p => onProgress?.({ phase: "read", fraction: p.fraction }) }); }
  catch (error) {
    if (error instanceof CreditImportError) throw new ConversionError(error.code, error.message);
    throw new ConversionError("corrupt", "The workbook could not be read.");
  }
}

function dataBox(sheet: Sheet): Box | null {
  const box = { r1: Infinity, r2: 0, c1: Infinity, c2: -1 };
  for (const row of sheet.rows) row.cells.forEach((cell, c) => {
    if (!cell || (cell.v === "" && !cell.f)) return;
    box.r1 = Math.min(box.r1, row.r); box.r2 = Math.max(box.r2, row.r); box.c1 = Math.min(box.c1, c); box.c2 = Math.max(box.c2, c);
  });
  return box.r2 ? box : null;
}

function resolveBox(sheet: Sheet, o: ConversionOptions): Box | null {
  let box: Box | null;
  if (o.explicitRange !== undefined) {
    const m = /^([A-Z]{1,3})([1-9]\d*)(?::([A-Z]{1,3})([1-9]\d*))?$/.exec(o.explicitRange.trim().toUpperCase());
    if (!m) throw new ConversionError("invalid_options", "explicitRange must look like A1:J20.");
    box = { c1: columnIndex(m[1]), r1: Number(m[2]), c2: columnIndex(m[3] ?? m[1]), r2: Number(m[4] ?? m[2]) };
    if (box.c2 < box.c1 || box.r2 < box.r1 || box.c2 > 16383 || box.r2 > 1048576) throw new ConversionError("invalid_options", "explicitRange is reversed or outside the Excel grid.");
  } else {
    box = dataBox(sheet);
    if (box && o.rangePolicy === "entire_selected_range") box = { r1: 1, c1: 0, r2: box.r2, c2: box.c2 };
  }
  if (box && (box.r2 - box.r1 + 1) * (box.c2 - box.c1 + 1) > LIMITS.cells) throw new ConversionError("range_too_large", "The range holds more cells than this engine accepts.");
  return box;
}

/** The expected matrix, coordinates kept: one record per Excel row of the range, empty rows and cells included (never dropped, never shifted). */
function prepare(book: Workbook, sheet: Sheet, o: ConversionOptions) {
  if (sheet.error) throw new ConversionError("sheet_unreadable", `The worksheet could not be read: ${sheet.error}`);
  const sink = new WarningSink(sheet.name), box = resolveBox(sheet, o), recs: Rec[] = [];
  if (!box) sink.note("EMPTY_RANGE", "No cells in the range: the output has no records.");
  else {
    const rows = new Map(sheet.rows.map(row => [row.r, row])), safe = o.csvFormulaProtection === "excel_view_safe";
    for (let r = box.r1; r <= box.r2; r++) {
      if ((r & 1023) === 0) checkAbort(o.signal);
      const row = rows.get(r);
      // shortcut: the reader drops hidden rows that hold no value, so excluding hidden rows leaves such empty rows in; upgrade when the reader keeps them.
      if (row?.hidden && !o.includeHidden) continue;
      const fields: string[] = [];
      for (let c = box.c1; c <= box.c2; c++) fields.push(normalizeCell(row?.cells[c], book.styleKinds as readonly StyleKind[], safe, sink, r, c));
      recs.push({ r, fields });
    }
    const hidden = sheet.rows.filter(row => row.hidden && row.r >= box.r1 && row.r <= box.r2).length;
    if (hidden && o.includeHidden) sink.note("HIDDEN_INCLUDED", `${hidden} hidden row(s) are in the output (includeHidden=true).`);
    if (!o.includeHidden && sheet.hiddenColumns) throw new ConversionError("unsupported_option", "includeHidden=false cannot exclude hidden columns: the reader does not expose which columns are hidden.");
    if (sheet.hiddenColumns && o.includeHidden) sink.note("HIDDEN_INCLUDED", `${sheet.hiddenColumns} hidden column(s) are in the output (includeHidden=true).`);
    if (o.rangePolicy === "data_region" && (box.r1 > 1 || box.c1 > 0)) sink.note("DATA_REGION_TRIMMED", `Excluded ${box.r1 - 1} empty row(s) above and ${box.c1} empty column(s) left of ${columnLetters(box.c1)}${box.r1}; use entire_selected_range to keep them.`);
    if (sheet.mergeCount) sink.note("MERGED_CELLS_TOP_LEFT_ONLY", `${sheet.mergeCount} merged range(s): values are exported where they are stored (top-left), never copied into the other cells.`);
  }
  return { box, recs, sink };
}

const rangeText = (b: Box | null) => b ? `${columnLetters(b.c1)}${b.r1}:${columnLetters(b.c2)}${b.r2}` : "";
const verifyOpts = (o: ConversionOptions, box: Box | null, count: number) => ({ outputMode: o.outputMode, bom: o.bom, recordDelimiter: o.recordDelimiter, firstCol: box?.c1 ?? 0, expectedCount: count, sampled: o.verification === "sampled" });

function status(ok: boolean, sampled: boolean, warnings: Warning[]): VerificationStatus {
  if (!ok) return "failed";
  if (sampled) return "not_verified";
  return warnings.some(w => !INFO_CODES.has(w.code)) ? "verified_with_warnings" : "verified";
}

const RESERVED = /^(?:con|prn|aux|nul|com\d|lpt\d)(?:\..*)?$/i;
/** A file name that is safe on Windows and POSIX, unique (case-insensitively) among `taken`. */
export function safeFileName(base: string, ext: string, taken: Set<string>): string {
  let stem = base.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/^[.\s]+|[.\s]+$/g, "").slice(0, 100) || "sheet";
  if (RESERVED.test(stem)) stem = "_" + stem;
  let name = stem + ext, n = 1;
  while (taken.has(name.toLowerCase())) name = `${stem}-${++n}${ext}`;
  taken.add(name.toLowerCase());
  return name;
}

export interface SheetSummary {
  name: string; state: string; error?: string; usedRange: string; dataRows: number; columns: number; leadingBlankRows: number;
  hiddenRows: number; hiddenColumns: number; mergeCount: number; formulaCount: number;
  /** Per column of the data region, the kinds of cell seen in its first 1000 rows. */
  columnKinds: string[][];
}
/** Metadata only: no cell value leaves this function. `risks` is the same warning list a conversion would report. */
export function inspectWorkbook(input: ExcelInput): { sheets: SheetSummary[]; risks: Warning[]; notes: string[] } {
  const book = open(input), risks: Warning[] = [];
  const sheets = book.sheets.map((sheet): SheetSummary => {
    const base = { name: sheet.name, state: sheet.state ?? "visible", hiddenRows: sheet.hiddenRows, hiddenColumns: sheet.hiddenColumns, mergeCount: sheet.mergeCount, formulaCount: sheet.formulaCount };
    if (sheet.error) return { ...base, error: sheet.error, usedRange: "", dataRows: 0, columns: 0, leadingBlankRows: 0, columnKinds: [] };
    const { box, sink } = prepare(book, sheet, { ...DEFAULT_OPTIONS });
    risks.push(...sink.list());
    const kinds: Set<string>[] = box ? Array.from({ length: box.c2 - box.c1 + 1 }, () => new Set<string>()) : [];
    if (box) for (const row of sheet.rows) if (row.r >= box.r1 && row.r < box.r1 + 1000) row.cells.forEach((cell, c) => {
      if (cell && cell.v !== "") kinds[c - box.c1]?.add(cell.f ? "formula" : cell.t === "s" || cell.t === "inlineStr" || cell.t === "str" ? "text" : cell.t === "n" && book.styleKinds[cell.s] === "date" ? "date" : cell.t === "n" ? "number" : cell.t === "b" ? "boolean" : cell.t === "e" ? "error" : "date");
    });
    return { ...base, usedRange: rangeText(box), dataRows: box ? box.r2 - box.r1 + 1 : 0, columns: box ? box.c2 - box.c1 + 1 : 0, leadingBlankRows: box ? box.r1 - 1 : 0, columnKinds: kinds.map(set => [...set]) };
  });
  return { sheets, risks, notes: book.notes };
}

/** Reads the workbook, converts each selected sheet to its own file and verifies each output by parsing it back. Input bytes are never modified. */
export async function convertWorkbook(input: ExcelInput, partial: Partial<ConversionOptions> = {}, onProgress?: (e: ProgressEvent) => void): Promise<ConvertedFile[]> {
  const o = resolveOptions(partial);
  checkAbort(o.signal);
  const book = open(input, onProgress), inputSha256 = await sha256(input.bytes);
  const names = o.sheetNames ?? (book.sheets.length === 1 ? [book.sheets[0].name] : null);
  if (!names?.length) throw new ConversionError("sheet_selection_required", "This workbook has several sheets: choose which to export; sheets are never merged.");
  if (new Set(names).size !== names.length) throw new ConversionError("invalid_options", "sheetNames contains a duplicate.");
  const sheets = names.map(name => book.sheets.find(s => s.name === name) ?? (() => { throw new ConversionError("sheet_not_found", `No worksheet is named "${name}".`); })());

  const ext = o.outputMode === "plain_text_comma" ? ".txt" : ".csv", taken = new Set<string>(), out: ConvertedFile[] = [];
  const stem = input.name.replace(/\.[^.]*$/, "");
  for (const sheet of sheets) {
    checkAbort(o.signal);
    const started = performance.now(), { box, recs, sink } = prepare(book, sheet, o);
    onProgress?.({ phase: "convert", sheet: sheet.name, done: recs.length, total: recs.length });
    const bytes = encodeCsv(csvText(recs.map(rec => rec.fields), o.outputMode, o.recordDelimiter), o.bom);
    checkAbort(o.signal);
    const verdict = verifyCsv(recs, bytes, verifyOpts(o, box, recs.length));
    onProgress?.({ phase: "verify", sheet: sheet.name, done: recs.length, total: recs.length });
    if (o.verification === "sampled") sink.note("VERIFICATION_SAMPLED", "Cell text was compared on a sample of rows only: not fully verified.");
    const warnings = sink.list();
    out.push({
      fileName: safeFileName(names.length === 1 ? stem : sheet.name, ext, taken),
      mime: o.outputMode === "plain_text_comma" ? "text/plain;charset=utf-8" : "text/csv;charset=utf-8", bytes,
      report: {
        inputName: input.name, inputSha256, outputSha256: await sha256(bytes), sheetName: sheet.name, sourceRange: rangeText(box),
        headerExcelRow: recs.find(rec => rec.fields.some(Boolean))?.r ?? null,
        sourceRows: box ? box.r2 - box.r1 + 1 : 0, exportedRows: recs.length, columnsPerRecord: box ? box.c2 - box.c1 + 1 : 0,
        mismatchedCellCount: verdict.mismatchedCellCount, mismatches: verdict.error ? [`parse error ${verdict.error}`] : verdict.mismatches, warnings,
        verificationStatus: status(verdict.ok, o.verification === "sampled", warnings), verification: o.verification, outputMode: o.outputMode,
        outputBytes: bytes.length, durationMs: Math.round(performance.now() - started),
      },
    });
  }
  return out;
}

/** Checks an existing CSV/TXT against the workbook it claims to come from, re-reading the source. Single sheet. */
export function verifyConversion(input: ExcelInput, output: Uint8Array, partial: Partial<ConversionOptions> & { sheetName?: string } = {}) {
  const o = resolveOptions(partial), book = open(input);
  const sheet = partial.sheetName === undefined && book.sheets.length === 1 ? book.sheets[0] : book.sheets.find(s => s.name === partial.sheetName);
  if (!sheet) throw new ConversionError(partial.sheetName === undefined ? "sheet_selection_required" : "sheet_not_found", "Name the worksheet the output was made from.");
  const { box, recs, sink } = prepare(book, sheet, o), verdict = verifyCsv(recs, output, verifyOpts(o, box, recs.length)), warnings = sink.list();
  return { verificationStatus: status(verdict.ok, o.verification === "sampled", warnings), records: verdict.records, mismatchedCellCount: verdict.mismatchedCellCount, mismatches: verdict.mismatches, error: verdict.error, warnings };
}
