import type { OutputMode } from "./types.ts";

/** RFC 4180 field. Also quotes edge whitespace (importers that trim would otherwise change the value) and a lone empty field (a blank line is not a record). */
export function csvField(value: string, alone: boolean): string {
  return /[",\r\n]|^[ \t]|[ \t]$/.test(value) || (alone && value === "") ? `"${value.replaceAll('"', '""')}"` : value;
}
/** One record, no terminator. */
export const csvRecord = (fields: readonly string[]) => fields.map(field => csvField(field, fields.length === 1)).join(",");

/**
 * single_column_csv = two layers: the inner line is a normal CSV record, the outer CSV holds that whole line as ONE field.
 * Never a join(','): the outer writer re-quotes whatever the inner one produced.
 */
export function csvText(records: Iterable<readonly string[]>, mode: OutputMode, eol: "\r\n" | "\n"): string {
  const lines: string[] = [];
  for (const fields of records) lines.push((mode === "single_column_csv" ? csvRecord([csvRecord(fields)]) : csvRecord(fields)) + eol);
  return lines.join("");
}

const BOM = [0xef, 0xbb, 0xbf];
export function encodeCsv(text: string, bom: boolean): Uint8Array {
  const body = new TextEncoder().encode(text);
  if (!bom) return body;
  const out = new Uint8Array(body.length + 3);
  out.set(BOM); out.set(body, 3);
  return out;
}
export const hasBom = (bytes: Uint8Array) => BOM.every((b, i) => bytes[i] === b);
