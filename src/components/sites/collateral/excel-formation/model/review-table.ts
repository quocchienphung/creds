import type { Issue, IssueStatus } from "../engine/types.ts";
import type { IssueState } from "../engine/review.ts";
import type { ReviewFilters } from "./review-filters.ts";

export interface TableRow { issue: Issue; status: IssueStatus; /** What the cell holds now (original or approved value). */ current: string; edited: boolean }
export type SortKey = "row" | "field" | "severity" | "problem" | "status";
export interface SortState { key: SortKey; dir: "asc" | "desc" }
export const doneStatus = (status: IssueStatus) => status === "verified" || status === "accepted_exception";

/** The rows of the issue table: the issues that pass the filters, with the cell's current value, in the chosen order. */
export function reviewRows(all: readonly Issue[], states: Record<string, IssueState>, filters: ReviewFilters, sort: SortState): TableRow[] {
  const query = filters.query.trim().toLowerCase();
  const out: TableRow[] = [];
  for (const issue of all) {
    const state = states[issue.id];
    const status: IssueStatus = state?.status ?? "open";
    if (!filters.severities.includes(issue.severity)) continue;
    if (filters.status === "todo" ? doneStatus(status) : filters.status === "done" ? !doneStatus(status) : false) continue;
    if (filters.category && issue.category !== filters.category) continue;
    if (filters.field && issue.field !== filters.field) continue;
    if (query && !(`${issue.column}${issue.row}`.toLowerCase() === query || String(issue.row) === query || issue.originalValue.toLowerCase().includes(query))) continue;
    const current = state?.correctedValue ?? issue.originalValue;
    out.push({ issue, status, current, edited: current !== issue.originalValue });
  }
  // Row order is the sheet order the issues arrive in; any other key is a stable sort on top of it.
  const RANK = { critical: 0, high: 1, medium: 2, low: 3 } as const, STATE = { open: 0, edited: 1, verified: 2, accepted_exception: 3 } as const;
  const keyOf = (row: TableRow) => sort.key === "severity" ? RANK[row.issue.severity] : sort.key === "status" ? STATE[row.status] : sort.key === "field" ? row.issue.field : sort.key === "problem" ? row.issue.category : row.issue.row;
  if (sort.key !== "row" || sort.dir === "desc") out.sort((a, b) => { const x = keyOf(a), y = keyOf(b); const c = x < y ? -1 : x > y ? 1 : 0; return sort.dir === "asc" ? c : -c; });
  return out;
}
