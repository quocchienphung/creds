import type { Issue, IssueCategory, IssueStatus, Severity } from "./excel-formation/engine/types";

/** English source strings; the page runs every one of them through `uiText`, so the Vietnamese catalog (i18n/vi-credit.ts) covers them. */
export const CATEGORY_LABEL: Record<IssueCategory, string> = {
  QUESTION_MARK_IN_WORD: "Question mark in a word",
  UNICODE_REPLACEMENT: "Replacement character",
  ENCODING_MOJIBAKE: "Broken encoding",
  INVISIBLE_OR_CONTROL: "Invisible or control character",
  DIACRITIC_POLICY: "Diacritics (policy)",
  WHITESPACE_ANOMALY: "Spaces",
  DESCRIPTION_CONFLICT: "Descriptions differ",
  INVALID_CODE_OR_DATE: "Invalid code or date",
  MISSING_REQUIRED: "Required value missing",
  CONFLICTING_DUPLICATE: "Conflicting values",
  ARRAY_PARSE_AMBIGUOUS: "List cannot be split safely",
  UNKNOWN_COLUMN: "Unknown column",
  TYPE_MISMATCH: "Wrong cell type",
  FORMULA_UNRESOLVED: "Formula without result",
  DUPLICATE_HEADER: "Duplicate header",
  INCOMPLETE_GROUP: "Entry without its key column",
};
export const SEVERITY_LABEL: Record<Severity, string> = { critical: "Critical", high: "High", medium: "Medium", low: "Low" };
export const STATUS_LABEL: Record<IssueStatus, string> = { open: "Open", edited: "Edited", verified: "Verified", accepted_exception: "Exception" };
export const SEVERITIES: readonly Severity[] = ["critical", "high", "medium", "low"];
export const CATEGORIES = Object.keys(CATEGORY_LABEL) as IssueCategory[];

/** Pill tone for a severity (the Usage page has green and amber; red is added in credit.css). */
export const severityTone = (severity: Severity) => severity === "critical" ? "red" : severity === "high" ? "amber" : severity === "medium" ? "plain" : "plain-soft";
export const statusTone = (status: IssueStatus) => status === "verified" ? "green" : status === "accepted_exception" ? "plain" : status === "edited" ? "amber" : "plain-soft";

type T = (message: string, values?: readonly unknown[]) => string;
/** The reason shown to the reviewer. Static reasons come from the engine; those that name columns are built here so they can be translated. */
export function issueReason(issue: Issue, t: T): string {
  if (issue.category === "DESCRIPTION_CONFLICT") {
    const other = issue.related?.[0];
    return other?.value === "" || issue.originalValue === ""
      ? t("Only one description column is filled")
      : t("The two description columns differ");
  }
  if (issue.category === "CONFLICTING_DUPLICATE") return t("{0} differs between rows of the same group", [issue.field]);
  if (issue.category === "INCOMPLETE_GROUP") return t("{0} is empty, but this entry has values in other columns", [issue.block?.anchor ?? ""]);
  if (issue.category === "UNKNOWN_COLUMN") return t("Column is not in the mapping profile");
  return t(issue.reason);
}

export const cellRef = (issue: Pick<Issue, "column" | "row">) => `${issue.column}${issue.row}`;
