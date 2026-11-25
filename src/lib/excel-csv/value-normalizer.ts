import type { Cell, StyleKind } from "../../components/sites/collateral/excel-formation/engine/types.ts";
import { columnLetters } from "../../components/sites/collateral/excel-formation/engine/text.ts";
import type { Warning, WarningCode } from "./types.ts";

/** Codes that mean "the CSV is exactly the stored data, this is only information". Any other warning downgrades `verified`. */
export const INFO_CODES: ReadonlySet<WarningCode> = new Set(["HIDDEN_INCLUDED", "DATA_REGION_TRIMMED", "MERGED_CELLS_TOP_LEFT_ONLY", "WORKBOOK_NOTE", "EMPTY_RANGE"]);

const DETAIL: Partial<Record<WarningCode, string>> = {
  CSV_FORMULA_INJECTION_RISK: "text starts with = + - @ tab CR LF: a spreadsheet may run it as a formula when the CSV is opened; exported unchanged",
  CSV_VALUE_SANITIZED: "text starting with = + - @ tab CR LF was prefixed with ' (excel_view_safe): the CSV no longer equals the stored value",
  NUMERIC_PRECISION_RISK: "numeric cell with more than 15 significant digits: Excel keeps 15, the original digits cannot be recovered",
  DATE_AS_SERIAL: "date-formatted number exported as its stored serial number, not as a date",
  EXCEL_ERROR_CELL: "cell holds an Excel error value, exported as stored",
  FORMULA_NO_CACHED_VALUE: "formula without a cached result: exported empty, nothing is evaluated",
  FORMULA_CACHED_UNVERIFIED: "formula exported as its cached result; the cache cannot be checked for staleness",
};

/** Aggregates per code so a 100k-row sheet yields one warning per kind (count + first coordinate), never a value. */
export class WarningSink {
  private hits = new Map<WarningCode, { count: number; first: string }>();
  private extra: Warning[] = [];
  sheet: string;
  constructor(sheet: string) { this.sheet = sheet; }
  cell(code: WarningCode, r: number, c: number) {
    const hit = this.hits.get(code);
    if (hit) hit.count++; else this.hits.set(code, { count: 1, first: columnLetters(c) + r });
  }
  note(code: WarningCode, detail: string, cell?: string) { this.extra.push({ code, sheet: this.sheet, detail, ...(cell ? { cell } : {}) }); }
  count(code: WarningCode) { return this.hits.get(code)?.count ?? 0; }
  list(): Warning[] {
    const cells = [...this.hits].map(([code, { count, first }]): Warning => ({ code, sheet: this.sheet, cell: first, detail: `${count} cell(s): ${DETAIL[code]}` }));
    return [...cells, ...this.extra];
  }
}

const INJECTION = /^[=+\-@\t\r\n＝＋－＠]/;
const significantDigits = (raw: string) => raw.replace(/[eE].*$/, "").replace(/\D/g, "").replace(/^0+/, "").length;

/**
 * The CSV text of one cell under `stored_value`: exactly what the file stores. Strings are never trimmed or normalized, numbers stay the raw
 * text of the file (no Number()/parseFloat), booleans become TRUE/FALSE (stored 1/0 would be indistinguishable from numbers), nothing is evaluated.
 */
export function normalizeCell(cell: Cell | undefined, kinds: readonly StyleKind[], safe: boolean, sink: WarningSink, r: number, c: number): string {
  if (!cell) return "";
  const v = cell.v;
  if (cell.f) sink.cell(v === "" ? "FORMULA_NO_CACHED_VALUE" : "FORMULA_CACHED_UNVERIFIED", r, c);
  if (cell.t === "b") return v === "1" ? "TRUE" : v === "0" ? "FALSE" : v;
  if (cell.t === "e") { sink.cell("EXCEL_ERROR_CELL", r, c); return v; }
  if (cell.t === "n") {
    if (v !== "" && kinds[cell.s] === "date") sink.cell("DATE_AS_SERIAL", r, c);
    if (significantDigits(v) > 15) sink.cell("NUMERIC_PRECISION_RISK", r, c);
    return v;
  }
  if (cell.t === "d") return v;
  if (!INJECTION.test(v)) return v;
  if (!safe) { sink.cell("CSV_FORMULA_INJECTION_RISK", r, c); return v; }
  sink.cell("CSV_VALUE_SANITIZED", r, c);
  return "'" + v;
}
