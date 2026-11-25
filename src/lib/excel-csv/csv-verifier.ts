import { parse } from "csv-parse/sync";
import { columnLetters } from "../../components/sites/collateral/excel-formation/engine/text.ts";
import { hasBom } from "./csv-writer.ts";
import type { OutputMode } from "./types.ts";

export interface VerifyOptions { outputMode: OutputMode; bom: boolean; recordDelimiter: "\r\n" | "\n"; firstCol: number; expectedCount: number; sampled: boolean }
export interface VerifyResult { ok: boolean; records: number; mismatchedCellCount: number; mismatches: string[]; error?: string }

// csv-parse is the independent half: the writer in csv-writer.ts shares no code with it. It throws on ragged records (relax_column_count is off).
const parseCsv = (text: string, eol: string): string[][] => parse(text, { delimiter: ",", quote: '"', escape: '"', record_delimiter: eol, trim: false, skip_empty_lines: false, relax_column_count: false, bom: false });

/**
 * Parses the output back (twice for single_column_csv) and compares it with the expected cells, one by one.
 * `sampled` compares cell text on about 1000 rows only (shape is always checked): the caller must not report that as fully verified.
 */
export function verifyCsv(expected: Iterable<{ r: number; fields: string[] }>, output: Uint8Array, o: VerifyOptions): VerifyResult {
  const fail = (error: string): VerifyResult => ({ ok: false, records: 0, mismatchedCellCount: 0, mismatches: [], error });
  if (hasBom(output) !== o.bom) return fail("BOM_MISMATCH");
  let rows: string[][];
  try {
    const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(o.bom ? output.subarray(3) : output);
    rows = parseCsv(text, o.recordDelimiter);
    if (o.outputMode === "single_column_csv") rows = rows.map(outer => {
      if (outer.length !== 1) throw Object.assign(new Error(), { code: "OUTER_NOT_SINGLE_FIELD" });
      const inner = outer[0] === "" ? [[""]] : parseCsv(outer[0], o.recordDelimiter);
      if (inner.length !== 1) throw Object.assign(new Error(), { code: "INNER_NOT_ONE_RECORD" });
      return inner[0];
    });
  } catch (error) { return fail(typeof (error as { code?: unknown }).code === "string" ? (error as { code: string }).code : "CSV_PARSE_ERROR"); }

  const step = o.sampled ? Math.max(1, Math.ceil(o.expectedCount / 1000)) : 1;
  const mismatches: string[] = [];
  let bad = 0, i = 0;
  for (const { r, fields } of expected) {
    const got = rows[i] ?? [], deep = i % step === 0 || i === o.expectedCount - 1;
    i++;
    for (let j = 0; j < Math.max(fields.length, got.length); j++) {
      if (fields[j] === got[j] || (!deep && fields.length === got.length)) continue;
      bad++;
      if (mismatches.length < 20) mismatches.push(columnLetters(o.firstCol + j) + r);
    }
  }
  for (; i < rows.length; i++) { bad += rows[i].length; if (mismatches.length < 20) mismatches.push(`extra record #${i + 1}`); }
  return { ok: bad === 0, records: rows.length, mismatchedCellCount: bad, mismatches };
}
