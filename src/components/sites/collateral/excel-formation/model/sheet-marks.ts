import type { Issue } from "../engine/types.ts";
import type { IssueState } from "../engine/review.ts";
import { doneStatus } from "./review-table.ts";
import { previewKey, type PreviewCell } from "./preview-model.ts";

/** What a sheet shows for one worksheet: tinted cells, the map along its edge, and (final preview only) the cells that changed. */
export interface SheetMarks { issueCells: Map<number, Map<number, number>>; issueRows: { row: number; level: number }[]; open: number; changes?: Map<number, Set<number>> }
export type MarkedCell = { key: string; sheet: string; row: number; col: number };

/** Every issue still open, by worksheet and cell, for the tint of the sheet and the map along its edge. */
export function openIssueMarks(all: readonly Issue[], states: Record<string, IssueState>): Record<string, SheetMarks> {
  const bySheet: Record<string, SheetMarks> = {};
  const level = { critical: 4, high: 3, medium: 2, low: 1 } as const;
  for (const issue of all) {
    const status = states[issue.id]?.status ?? "open";
    if (doneStatus(status)) continue;
    const marks = bySheet[issue.sheet] ??= { issueCells: new Map(), issueRows: [], open: 0 };
    let cols = marks.issueCells.get(issue.row);
    if (!cols) marks.issueCells.set(issue.row, cols = new Map());
    cols.set(issue.col, Math.max(cols.get(issue.col) ?? 0, level[issue.severity]));
    marks.issueRows.push({ row: issue.row, level: level[issue.severity] });
    marks.open++;
  }
  return bySheet;
}

/** Every cell that needs a decision: the ones the review found plus the ones the scan of the current values found. */
export function problemCells(all: readonly PreviewCell[], residual: readonly { sheet: string; row: number; col: number }[]): MarkedCell[] {
  const found = new Map<string, MarkedCell>();
  for (const cell of all) if (cell.needsReview) found.set(cell.key, cell);
  for (const item of residual) { const key = previewKey(item); if (!found.has(key)) found.set(key, { key, sheet: item.sheet, row: item.row, col: item.col }); }
  return [...found.values()].sort((a, b) => a.sheet.localeCompare(b.sheet) || a.row - b.row || a.col - b.col);
}

/** Final-preview marks: cells whose value changed, plus the cells that still need a decision. */
export function previewMarks(all: readonly PreviewCell[], problems: readonly MarkedCell[]): Record<string, SheetMarks> {
  const bySheet: Record<string, SheetMarks> = {};
  for (const cell of all) {
    const entry = bySheet[cell.sheet] ??= { issueCells: new Map(), issueRows: [], open: 0, changes: new Map() };
    if (cell.before !== cell.after) {
      const cols = entry.changes!.get(cell.row) ?? new Set<number>();
      cols.add(cell.col); entry.changes!.set(cell.row, cols);
    }
  }
  for (const cell of problems) {
    const entry = bySheet[cell.sheet] ??= { issueCells: new Map(), issueRows: [], open: 0, changes: new Map() };
    const cols = entry.issueCells.get(cell.row) ?? new Map<number, number>();
    cols.set(cell.col, 3); entry.issueCells.set(cell.row, cols);
    entry.issueRows.push({ row: cell.row, level: 3 }); entry.open++;
  }
  return bySheet;
}
