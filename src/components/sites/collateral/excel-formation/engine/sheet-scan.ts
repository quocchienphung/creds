import type { Cell, Sheet, Workbook } from "./types.ts";
import { corruptionSpans } from "./corruption-span.ts";

/**
 * The profile-independent scan of one worksheet for corrupted text: counts only, no cell value. It looks at every row (hidden ones too) and
 * every cell of a text type, whatever the sheet is called and whatever its headers say. A sheet is `clean` only after this scan has read it
 * to the end and found nothing; a sheet that could not be read is `error`, never `clean`. (A sheet that has not been scanned yet has no
 * entry here at all: the page shows it as "not scanned".)
 */
export const SCAN_VERSION = "question-mark-scan-1";
export type SheetScanStatus = "clean" | "issues" | "error";
export interface SheetScan {
  name: string;
  /** The worksheet part inside the zip (the relationship target), the stable identity next to the name. */
  part: string;
  status: SheetScanStatus;
  rowsSeen: number;
  hiddenRows: number;
  hiddenColumns: number;
  /** Cells of a text type that a repair may change. */
  textCellsSeen: number;
  /** Cells that hold a formula or rich text: read and counted, never changed. */
  formulaCells: number;
  protectedCells: number;
  /** Text cells that contain `?` or U+FFFD, split into the ones that are certainly damage and the ones that may be real punctuation. */
  questionMarkCells: number;
  confirmedCells: number;
  possibleCells: number;
  /** Mis-decoded text (UTF-8 read as Windows-1252) that holds no `?`. */
  mojibakeCells: number;
  /** `?` found where nothing can be repaired (formula results, rich text): the sheet is not clean, and these are listed as skipped. */
  unrepairableQuestionMarks: number;
  ms: number;
  error?: string;
}

export const isTextCell = (cell: Cell) => cell.t === "s" || cell.t === "inlineStr" || cell.t === "str";
const QUESTION = /[?�]/;

/**
 * What a text value is, when no profile says what its column is for. An identifier-like value (a single token with a digit, a link, an address,
 * something that starts like a formula) or a value without a letter is never repaired, and neither is a proper name (several words that each begin
 * with a capital: nothing in the file can prove how a name is spelled). Any other text is free text.
 */
export function textRoleOf(value: string): "identifier" | "name" | "freeText" {
  const text = value.trim();
  if (!/\p{L}/u.test(text)) return "identifier";
  if (/^(?:https?:|www\.)|@|^[=+@-]/i.test(text)) return "identifier";
  if (!/\s/.test(text) && /\d/.test(text)) return "identifier";
  const words = text.split(/\s+/).filter(word => /\p{L}/u.test(word));
  return words.length > 1 && words.every(word => /^[^\p{L}]*\p{Lu}/u.test(word)) ? "name" : "freeText";
}
/** The role an unmapped text takes in the review rules: free text, or one of the strict roles. */
export const specRoleOf = (value: string): "freeText" | "name" | "code" => { const role = textRoleOf(value); return role === "identifier" ? "code" : role; };

export function scanSheet(sheet: Sheet): SheetScan {
  const started = performance.now();
  const base: SheetScan = { name: sheet.name, part: sheet.part, status: "clean", rowsSeen: sheet.rows.length + sheet.emptyRows, hiddenRows: sheet.hiddenRows, hiddenColumns: sheet.hiddenColumns, textCellsSeen: 0, formulaCells: 0, protectedCells: 0, questionMarkCells: 0, confirmedCells: 0, possibleCells: 0, mojibakeCells: 0, unrepairableQuestionMarks: 0, ms: 0 };
  try {
    // A damaged worksheet NAME cannot be written back by a cell patch: it makes the sheet "issues", never "clean".
    if (QUESTION.test(sheet.name)) base.unrepairableQuestionMarks++;
    for (const row of sheet.rows) for (const cell of row.cells) {
      if (!cell) continue;
      if (cell.f) { base.formulaCells++; if (isTextCell(cell) && QUESTION.test(cell.v)) base.unrepairableQuestionMarks++; continue; }
      if (!isTextCell(cell)) continue;
      if (cell.protectedText) { base.protectedCells++; if (QUESTION.test(cell.v)) base.unrepairableQuestionMarks++; continue; }
      base.textCellsSeen++;
      const spans = corruptionSpans(cell.v);
      if (!spans.length) continue;
      if (!QUESTION.test(cell.v)) { base.mojibakeCells++; continue; }
      base.questionMarkCells++;
      if (spans.some(span => span.kind === "replacement")) base.confirmedCells++; else base.possibleCells++;
    }
    if (base.questionMarkCells + base.mojibakeCells + base.unrepairableQuestionMarks > 0) base.status = "issues";
  } catch (error) {
    base.status = "error"; base.error = error instanceof Error ? error.message : "The sheet could not be scanned.";
  }
  base.ms = Math.round(performance.now() - started);
  return base;
}

export const scanWorkbook = (workbook: Workbook): SheetScan[] => workbook.sheets.map(scanSheet);
