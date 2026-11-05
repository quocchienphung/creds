import type { Cell, Sheet, StyleKind } from "../collateral/excel-formation/engine/types.ts";

export type Delimiter = "," | ";" | "\t";
export interface CsvStats { rows: number; cols: number; skipped: number; dates: number; formulas: number }
export interface CsvResult extends CsvStats { text: string; sample: string[][] }

const DAY = 86_400;
const pad = (n: number) => String(n).padStart(2, "0");

/** shortcut: assumes the 1900 date system (the reader does not expose date1904), upgrade when a Mac-origin workbook shows dates 4 years off. */
export function excelDate(serial: number): string {
  const seconds = Math.round(serial * DAY);
  const whole = Math.floor(seconds / DAY), rest = seconds - whole * DAY;
  const time = `${pad(Math.floor(rest / 3600))}:${pad(Math.floor(rest / 60) % 60)}:${pad(rest % 60)}`;
  if (whole === 0) return time;
  // Excel counts a 29 February 1900 that never existed: from serial 61 on the epoch is 30 December 1899.
  const d = new Date(Date.UTC(1899, 11, whole >= 61 ? 30 : 31) + whole * DAY * 1000);
  const day = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  return rest ? `${day} ${time}` : day;
}

/** The text a cell contributes to the CSV. `dates` is bumped when a number was turned into a date. */
export function cellText(cell: Cell | undefined, kinds: readonly StyleKind[], onDate?: () => void): string {
  if (!cell) return "";
  if (cell.t === "b") return cell.v === "1" ? "TRUE" : cell.v === "0" ? "FALSE" : cell.v;
  const serial = Number(cell.v);
  if (cell.t === "n" && kinds[cell.s] === "date" && cell.v !== "" && Number.isFinite(serial) && serial >= 0) { onDate?.(); return excelDate(serial); }
  return cell.v;
}

export function csvField(value: string, delimiter: Delimiter): string {
  return value.includes(delimiter) || /["\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}
export const csvLine = (values: readonly string[], delimiter: Delimiter) => values.map(value => csvField(value, delimiter)).join(delimiter);

/** One sheet as CSV text (no BOM; the caller decides). Rows with no value are skipped and counted. `sampleRows` rows are also returned as plain values for the preview. */
export function sheetToCsv(sheet: Sheet, kinds: readonly StyleKind[], delimiter: Delimiter, sampleRows = 0): CsvResult {
  let dates = 0;
  const onDate = () => { dates++; };
  const lines: string[] = [], sample: string[][] = [];
  let width = 0;
  for (const row of sheet.rows) for (let c = row.cells.length - 1; c >= width; c--) if (row.cells[c]?.v) { width = c + 1; break; }
  for (const row of sheet.rows) {
    const values = Array.from({ length: width }, (_, c) => cellText(row.cells[c], kinds, onDate));
    if (!values.some(Boolean)) continue;
    if (sample.length < sampleRows) sample.push(values);
    lines.push(csvLine(values, delimiter));
  }
  const last = sheet.rows.at(-1)?.r ?? 0;
  // A line per row, each ended by CRLF (RFC 4180), so the last row is terminated too.
  return { text: lines.map(line => line + "\r\n").join(""), sample, rows: lines.length, cols: lines.length ? width : 0, skipped: last - lines.length, dates, formulas: sheet.formulaCount };
}

const ILLEGAL = /[\\/:*?"<>|\u0000-\u001f]/;
const clean = (text: string) => text.replace(new RegExp(ILLEGAL, "g"), "-").trim();

/** The file name offered for a sheet: the workbook's name, plus the sheet's when the workbook has more than one. */
export function suggestName(workbook: string, sheet: string, several: boolean): string {
  return `${clean(workbook.replace(/\.xlsx$/i, "")) || "workbook"}${several ? `-${clean(sheet) || "sheet"}` : ""}.csv`;
}
/** The rest of the suggestion that continues what has been typed ("" when it does not). Typing nothing offers the whole name. */
export const ghostOf = (typed: string, suggestion: string) => suggestion.toLowerCase().startsWith(typed.toLowerCase()) ? suggestion.slice(typed.length) : "";
/** The name a download is saved under, or null when the typed name cannot be a file name. `.csv` is added when missing. */
export function fileNameOf(typed: string): string | null {
  const name = typed.trim().replace(/[. ]+$/, "");
  if (!name || name.length > 180 || ILLEGAL.test(name) || /^\.+/.test(name)) return null;
  return /\.csv$/i.test(name) ? name : `${name}.csv`;
}
