import type { Issue } from "./engine/types.ts";
import type { IssueState, Patch } from "./engine/review.ts";

export interface PreviewCell {
  key: string; sheet: string; row: number; col: number;
  before: string; after: string; field: string; needsReview: boolean;
}
export const previewKey = (cell: { sheet: string; row: number; col: number }) => JSON.stringify([cell.sheet, cell.row, cell.col]);

/** Keep each original value even when several issues share a cell or only a patch names it. */
export function previewCells(issues: readonly Issue[], states: Record<string, IssueState>, patches: readonly Patch[]): PreviewCell[] {
  const cells = new Map<string, PreviewCell>();
  for (const issue of issues) {
    const key = previewKey(issue), state = states[issue.id];
    // An edit that left no ? is a change to look at, not a problem: only an open issue, or an edit that still holds a ?, needs a decision.
    const needsReview = !state || state.status === "open" || state.status === "edited" && (state.correctedValue ?? issue.originalValue).includes("?");
    const previous = cells.get(key);
    if (previous) previous.needsReview ||= needsReview;
    else cells.set(key, { key, sheet: issue.sheet, row: issue.row, col: issue.col, before: issue.originalValue, after: state?.correctedValue ?? issue.originalValue, field: issue.field, needsReview });
  }
  for (const patch of patches) {
    const key = previewKey(patch), previous = cells.get(key);
    cells.set(key, { key, sheet: patch.sheet, row: patch.row, col: patch.col, before: patch.original, after: patch.value, field: previous?.field ?? "", needsReview: previous?.needsReview ?? false });
  }
  return [...cells.values()].sort((a, b) => a.sheet.localeCompare(b.sheet) || a.row - b.row || a.col - b.col);
}
