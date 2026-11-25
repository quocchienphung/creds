export type OutputMode = "standard_csv" | "single_column_csv" | "plain_text_comma";
export type FidelityPolicy = "stored_value" | "displayed_value";
export type VerificationStatus = "verified" | "verified_with_warnings" | "failed" | "not_verified";

export interface ConversionOptions {
  outputMode: OutputMode;
  /** Required when the workbook has more than one sheet: one file per name, never merged. */
  sheetNames?: string[];
  rangePolicy: "data_region" | "entire_selected_range";
  /** A1-style, e.g. "A1:J20". Only valid with `entire_selected_range`. */
  explicitRange?: string;
  includeHidden: boolean;
  /** `displayed_value` is rejected: the reader does not expose number formats. */
  fidelityPolicy: FidelityPolicy;
  delimiter: ",";
  bom: boolean;
  recordDelimiter: "\r\n" | "\n";
  csvFormulaProtection: "lossless" | "excel_view_safe";
  verification: "full" | "sampled";
  signal?: AbortSignal;
}

export const DEFAULT_OPTIONS: ConversionOptions = {
  outputMode: "standard_csv", rangePolicy: "data_region", includeHidden: true, fidelityPolicy: "stored_value", delimiter: ",",
  bom: true, recordDelimiter: "\r\n", csvFormulaProtection: "lossless", verification: "full",
};

export interface ExcelInput { name: string; bytes: Uint8Array }

export type WarningCode =
  | "CSV_FORMULA_INJECTION_RISK" | "CSV_VALUE_SANITIZED" | "NUMERIC_PRECISION_RISK" | "DATE_AS_SERIAL" | "EXCEL_ERROR_CELL"
  | "FORMULA_NO_CACHED_VALUE" | "FORMULA_CACHED_UNVERIFIED" | "HIDDEN_INCLUDED" | "DATA_REGION_TRIMMED" | "MERGED_CELLS_TOP_LEFT_ONLY"
  | "WORKBOOK_NOTE" | "EMPTY_RANGE" | "VERIFICATION_SAMPLED";
/** Never carries a cell value: only a code, a count and the first coordinate. */
export interface Warning { code: WarningCode; sheet: string; cell?: string; detail: string }

export interface ConversionReport {
  inputName: string;
  inputSha256: string;
  outputSha256: string;
  sheetName: string;
  /** Absolute A1 range exported, "" when the sheet has no data. */
  sourceRange: string;
  /** First Excel row of the range that holds a value (assumed header), null when none. */
  headerExcelRow: number | null;
  sourceRows: number;
  exportedRows: number;
  columnsPerRecord: number;
  mismatchedCellCount: number;
  /** First coordinates that differ (at most 20), no values. */
  mismatches: string[];
  warnings: Warning[];
  verificationStatus: VerificationStatus;
  verification: "full" | "sampled";
  outputMode: OutputMode;
  outputBytes: number;
  durationMs: number;
}

export interface ConvertedFile { fileName: string; mime: string; bytes: Uint8Array; report: ConversionReport }

export type ProgressEvent = { phase: "read"; fraction: number } | { phase: "convert" | "verify"; sheet: string; done: number; total: number };

export type ErrorCode =
  | "empty" | "legacy-or-encrypted" | "not-xlsx" | "too-large" | "zip-bomb" | "corrupt" | "no-workbook" | "no-sheets"
  | "invalid_options" | "sheet_selection_required" | "sheet_not_found" | "sheet_unreadable" | "unsupported_option" | "range_too_large" | "aborted";
export class ConversionError extends Error {
  code: ErrorCode;
  constructor(code: ErrorCode, message: string) { super(message); this.name = "ConversionError"; this.code = code; }
}
