import type { Issue, IssueStatus } from "./types.ts";
import type { SheetScan } from "./sheet-scan.ts";

/**
 * What the page may say about one worksheet. `clean` (green) is the ONLY state that claims anything good, and it needs all of: the scan read the
 * sheet, it did not fail, no `?` sits where nothing can be repaired, and every issue found on it is verified or accepted as an exception. A sheet
 * the scan has not covered is `unscanned` (grey) and a sheet it could not read is `error`: neither is ever green.
 */
export type SheetState = "unscanned" | "clean" | "issues" | "error";
export interface SheetStatus { name: string; state: SheetState; /** Issues not yet verified or accepted. */ open: number; total: number; scan?: SheetScan }
const settled = (status: IssueStatus) => status === "verified" || status === "accepted_exception";

export function sheetStatuses(sheets: readonly string[], scans: readonly SheetScan[] | undefined, issues: readonly Issue[], statusOf: (issue: Issue) => IssueStatus): SheetStatus[] {
  const open = new Map<string, number>(), total = new Map<string, number>();
  for (const issue of issues) { total.set(issue.sheet, (total.get(issue.sheet) ?? 0) + 1); if (!settled(statusOf(issue))) open.set(issue.sheet, (open.get(issue.sheet) ?? 0) + 1); }
  return sheets.map(name => {
    const scan = scans?.find(item => item.name === name), unresolved = open.get(name) ?? 0;
    const state: SheetState = !scan ? "unscanned" : scan.status === "error" ? "error" : unresolved > 0 || scan.unrepairableQuestionMarks > 0 ? "issues" : "clean";
    return { name, state, open: unresolved, total: total.get(name) ?? 0, ...(scan ? { scan } : {}) };
  });
}
