import type { Cell, Issue, Workbook } from "./types.ts";
import type { WorkbookProfile } from "./profile.ts";
import { analyzeValue, Corpus, RULE_VERSION, type Finding } from "./detect.ts";
import { columnLetters, fingerprint } from "./text.ts";
import { isTextCell, specRoleOf } from "./sheet-scan.ts";

/**
 * Corrupted-text issues for every cell that the profile-bound scan of `detect.ts` does not cover: every cell of every other worksheet, and the
 * cells of the profile's own sheet that sit outside its mapped columns (or in its header row). Nothing here looks at a header, a sheet name or
 * a mapping, so a workbook that matches no profile at all is scanned exactly like one that does.
 */
const CATEGORIES = new Set<Issue["category"]>(["QUESTION_MARK_IN_WORD", "UNICODE_REPLACEMENT", "ENCODING_MOJIBAKE"]);
const SUSPECT = /[?�ÃÄÆáâ]/;
export const genericKey = (sheet: string, col: number) => `${sheet}\u0001${col}`;
export interface GenericScan { issues: Issue[]; corpora: Map<string, Corpus>; rows: number; affectedRows: number; cells: number }

/** A `?` is damage until someone says otherwise: even the ones that may be a real question mark are at least `high`, and a person has to look at them. */
/** `mapped(sheet, row, col)` is true for the cells the profile-bound scan already judged. */
export function detectGenericIssues(workbook: Workbook, wprofile: WorkbookProfile, mapped: (sheet: string, row: number, col: number) => boolean): GenericScan {
  const issues: Issue[] = [], corpora = new Map<string, Corpus>(), affected = new Set<string>();
  const seen = new Set<string>();
  let rows = 0, cells = 0;
  for (const sheet of workbook.sheets) {
    rows += sheet.name === wprofile.primary ? 0 : sheet.rows.length + sheet.emptyRows;
    const damagedCols = new Set<number>();
    for (const row of sheet.rows) for (let col = 0; col < row.cells.length; col++) {
      const cell = row.cells[col];
      if (!cell || cell.f || cell.protectedText || !isTextCell(cell) || mapped(sheet.name, row.r, col)) continue;
      cells++;
      if (SUSPECT.test(cell.v)) damagedCols.add(col);
    }
    // Clean words of the damaged columns: the evidence the review step suggests spellings from.
    for (const col of damagedCols) {
      const corpus = new Corpus();
      for (const row of sheet.rows) { const cell = row.cells[col]; if (cell && !cell.f && isTextCell(cell) && !mapped(sheet.name, row.r, col)) corpus.add(cell.v); }
      corpora.set(genericKey(sheet.name, col), corpus);
    }
    for (const row of sheet.rows) for (let col = 0; col < row.cells.length; col++) {
      const cell: Cell | undefined = row.cells[col];
      if (!cell || cell.f || cell.protectedText || !isTextCell(cell) || !SUSPECT.test(cell.v) || mapped(sheet.name, row.r, col)) continue;
      const role = specRoleOf(cell.v);
      const findings: Finding[] = analyzeValue(cell.v, { role, noDiacritics: false }, { corpus: corpora.get(genericKey(sheet.name, col)), diacriticPolicy: false }).filter(finding => CATEGORIES.has(finding.category));
      for (const finding of findings) {
        const base = `${sheet.name}\u0001${row.r}\u0001${col}\u0001${finding.category}`;
        let id = fingerprint(base, workbook.fileHash);
        for (let n = 1; seen.has(id); n++) id = fingerprint(base + "\u0001" + n, workbook.fileHash);
        seen.add(id);
        affected.add(`${sheet.name}\u0001${row.r}`);
        issues.push({
          id, fileHash: workbook.fileHash, sheet: sheet.name, row: row.r, column: columnLetters(col), col, field: `${sheet.name}!${columnLetters(col)}`, category: finding.category, severity: finding.category === "QUESTION_MARK_IN_WORD" && (finding.severity === "low" || finding.severity === "medium") ? "high" : finding.severity,
          originalValueFingerprint: fingerprint(cell.v, workbook.fileHash), originalValue: cell.v, reason: finding.reason, status: "open", ruleVersion: RULE_VERSION, generic: true,
          ...(finding.marks ? { marks: finding.marks } : {}), ...(finding.fix ? { fix: finding.fix } : {}), ...(finding.proposedValue !== undefined ? { proposedValue: finding.proposedValue } : {}),
          ...(finding.suggestions ? { suggestions: finding.suggestions } : {}), ...(finding.tokens ? { tokens: finding.tokens } : {}),
        });
      }
    }
  }
  const order = new Map(workbook.sheets.map((sheet, i) => [sheet.name, i]));
  issues.sort((a, b) => (order.get(a.sheet)! - order.get(b.sheet)!) || a.row - b.row || a.col - b.col || (a.category < b.category ? -1 : 1));
  return { issues, corpora, rows, affectedRows: affected.size, cells };
}
