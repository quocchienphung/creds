import type { FixKind, Issue, IssueCategory, IssueStatus, Severity } from "./types.ts";
import type { ColumnSpec } from "./mapping-profiles.ts";
import { analyzeValue, applyFix, BULK_FIXES, Corpus, isBlocking, RULE_VERSION } from "./detect.ts";
import { columnLetters, fingerprint } from "./text.ts";
import type { Sheet } from "./types.ts";
import { incompleteAt, type ResolvedBlock } from "./blocks.ts";

/**
 * The human review layer. The original workbook is never changed: every correction is a patch on top of it, and the status of every issue is
 * derived from what the patches leave behind. Pure functions over an immutable state, so undo/redo is a stack of states.
 */
export interface Patch { sheet: string; row: number; col: number; value: string; original: string; asNumber: boolean; source: "typed" | "suggestion" | "fix" | "bulk" | "twin" | "group" | "auto_source" | "auto_model"; at: string; modelVersion?: string; policyVersion?: string; evidenceSourceId?: string }
export interface IssueState { status: IssueStatus; correctedValue?: string; exceptionReason?: string; reviewedAt?: string; suggestionRejected?: boolean; stillPresent?: boolean }
export interface ReviewState {
  patches: Record<string, Patch>;
  states: Record<string, IssueState>;
  /** Problems the edits themselves introduced (for example a value typed with a new `?`). */
  introduced: Record<string, Issue[]>;
}
export const emptyReview = (): ReviewState => ({ patches: {}, states: {}, introduced: {} });
export const cellKey = (sheet: string, row: number, col: number) => `${sheet}\u0001${row}\u0001${col}`;

/** Everything the review needs to know about the workbook, supplied by the caller so this module stays pure. */
export interface ReviewContext {
  fileHash: string;
  /** Issues found by the scan, indexed for lookup. */
  issues: Issue[];
  specOfCol: (col: number) => ColumnSpec | undefined;
  specOfCell?: (sheet: string, col: number) => ColumnSpec | undefined;
  corpus: (col: number) => Corpus | undefined;
  /** The text of a cell in the ORIGINAL workbook. */
  original: (sheet: string, row: number, col: number) => string;
  isFormula?: (sheet: string, row: number, col: number) => boolean;
  sheet: Sheet | undefined;
  /** Resolved columns of the primary sheet: used to find the other rows of a group. */
  groupCols: { branch: number; customer: number; asset: number } | null;
  /** Rows of the group a consistency issue is about (cached by the caller). */
  groupRowsOf: (issue: Issue) => number[];
  /** Consistency issues whose group includes this cell, so editing any member settles them. */
  conflictsAt: (row: number, col: number) => Issue[];
  /** Issues found on one cell of the primary sheet (indexed, so a single edit never scans the whole list). */
  issuesAt: (sheet: string, row: number, col: number) => Issue[];
  /** The column that is the twin of another (MOTABDS ↔ MOTABD). */
  twinOf: (col: number) => number | undefined;
  twinOfCell?: (sheet: string, col: number) => number | undefined;
  /** The blocks of columns (project, land title, vehicle) a column belongs to. */
  blocksOf?: (col: number) => ResolvedBlock[];
  diacriticPolicy: boolean;
}

export const validExceptionReason = (reason: string) => reason.trim().length >= 12 && (reason.match(/[\p{L}\p{N}]+/gu)?.length ?? 0) >= 3 && !/^(abc|test|placeholder|n\/?a)\b/i.test(reason.trim());
const now = () => new Date().toISOString();

export const valueOf = (state: ReviewState, ctx: ReviewContext, sheet: string, row: number, col: number) => state.patches[cellKey(sheet, row, col)]?.value ?? ctx.original(sheet, row, col);

const validDate = (text: string) => {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(text);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return y >= 1900 && y <= 2200 && date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
};

/** Is the problem of `issue` still present in `value`? Each category has its own check; nothing here guesses. */
export function stillPresent(issue: Pick<Issue, "category" | "row" | "col" | "sheet" | "block">, value: string, ctx: ReviewContext, state: ReviewState): boolean {
  const spec = ctx.specOfCell ? ctx.specOfCell(issue.sheet, issue.col) : ctx.specOfCol(issue.col);
  const text = value.trim();
  switch (issue.category) {
    case "MISSING_REQUIRED": return text === "";
    case "INVALID_CODE_OR_DATE": return spec?.role === "dateDMY" ? !/^(\d{2})\/(\d{2})\/(\d{4})$/.test(text) : !validDate(text);
    case "TYPE_MISMATCH": return spec?.role === "amount" ? !(text !== "" && Number.isFinite(Number(text))) : spec?.role === "date" ? !validDate(text) : false;
    case "ARRAY_PARSE_AMBIGUOUS": return /[\s,;|+]/.test(text);
    case "DESCRIPTION_CONFLICT": {
      const twin = ctx.twinOfCell ? ctx.twinOfCell(issue.sheet, issue.col) : ctx.twinOf(issue.col);
      return twin === undefined ? false : valueOf(state, ctx, issue.sheet, issue.row, twin) !== value;
    }
    case "CONFLICTING_DUPLICATE": {
      // Resolved when every row of the group now holds the same value (or by an accepted exception).
      const values = new Set(ctx.groupRowsOf(issue as Issue).map(row => valueOf(state, ctx, issue.sheet, row, issue.col)));
      return values.size > 1;
    }
    case "INCOMPLETE_GROUP": {
      // Judged on the whole entry as it is now: it is settled by filling the key column or by emptying the other cells.
      const block = ctx.blocksOf?.(issue.col).find(item => item.id === issue.block?.id);
      return block ? incompleteAt(block, col => valueOf(state, ctx, issue.sheet, issue.row, col)) !== null : false;
    }
    case "UNKNOWN_COLUMN": case "DUPLICATE_HEADER": case "FORMULA_UNRESOLVED": return true;
    default: {
      if (!spec) return false;
      return analyzeValue(value, spec, { corpus: ctx.corpus(issue.col), diacriticPolicy: ctx.diacriticPolicy }).some(finding => finding.category === issue.category);
    }
  }
}

/** Recompute the status of every issue on a cell and the problems the new value introduces. Exceptions and reviewer decisions are kept. */
function settleCell(state: ReviewState, ctx: ReviewContext, sheet: string, row: number, col: number, copy = true): ReviewState {
  const key = cellKey(sheet, row, col);
  const patch = state.patches[key];
  const value = patch?.value ?? ctx.original(sheet, row, col);
  // `copy` is false while a batch of edits is settled: the batch already owns private copies of the records.
  const states = copy ? { ...state.states } : state.states;
  const existing = ctx.issuesAt(sheet, row, col);
  for (const issue of existing) {
    const before = states[issue.id];
    if (before?.status === "accepted_exception") continue;
    // A description conflict is anchored on one cell but also changes when its twin is edited.
    const twin = issue.category === "DESCRIPTION_CONFLICT" ? ctx.twinOf(col) : undefined;
    const twinPatched = (twin !== undefined && !!state.patches[cellKey(sheet, row, twin)])
      || (issue.category === "CONFLICTING_DUPLICATE" && ctx.groupRowsOf(issue).some(member => !!state.patches[cellKey(sheet, member, col)]));
    const blockPatched = issue.category === "INCOMPLETE_GROUP" && (ctx.blocksOf?.(col) ?? []).some(block => block.id === issue.block?.id && [block.anchor, ...block.members].some(member => !!state.patches[cellKey(sheet, row, member)]));
    if (!patch && !twinPatched && !blockPatched) { states[issue.id] = { ...(before?.suggestionRejected ? { suggestionRejected: true } : {}), status: "open" }; continue; }
    const present = stillPresent(issue, value, ctx, state);
    // A prediction of the local model is applied but never counts as verified: the issue stays `edited` until a person confirms it.
    states[issue.id] = { ...before, status: present || patch?.source === "auto_model" ? "edited" : "verified", correctedValue: value, stillPresent: present, reviewedAt: now() };
  }
  const introduced = copy ? { ...state.introduced } : state.introduced;
  delete introduced[key];
  const spec = ctx.specOfCell ? ctx.specOfCell(sheet, col) : ctx.specOfCol(col);
  if (patch && spec) {
    const known = new Set<IssueCategory>(existing.map(issue => issue.category));
    const fresh = analyzeValue(patch.value, spec, { corpus: ctx.corpus(col), diacriticPolicy: ctx.diacriticPolicy }).filter(finding => !known.has(finding.category));
    // An edit can leave an entry without its key column (a value typed into a project column of a row that names no project).
    for (const block of ctx.blocksOf?.(col) ?? []) {
      if (col === block.anchor || incompleteAt(block, member => valueOf(state, ctx, sheet, row, member)) === null) continue;
      if ([block.anchor, ...block.members].some(member => ctx.issuesAt(sheet, row, member).some(issue => issue.category === "INCOMPLETE_GROUP" && issue.block?.id === block.id))) continue;
      fresh.push({ category: "INCOMPLETE_GROUP", severity: "high", reason: "The key column of the entry is empty", block: { id: block.id, anchor: block.anchorHeader } });
    }
    if (fresh.length) introduced[key] = fresh.map(finding => ({
      id: fingerprint(`${sheet}\u0001${row}\u0001${col}\u0001${finding.category}\u0001introduced`, ctx.fileHash), fileHash: ctx.fileHash, sheet, row, column: columnLetters(col), col, field: spec.header,
      category: finding.category, severity: finding.severity, originalValueFingerprint: fingerprint(patch.value, ctx.fileHash), originalValue: patch.value, reason: finding.reason,
      ...(finding.marks ? { marks: finding.marks } : {}), ...(finding.fix ? { fix: finding.fix } : {}), ...(finding.proposedValue !== undefined ? { proposedValue: finding.proposedValue } : {}), ...(finding.block ? { block: finding.block } : {}),
      status: "open", ruleVersion: RULE_VERSION,
    }));
  }
  return copy ? { ...state, states, introduced } : state;
}

export interface Edit { sheet: string; row: number; col: number; value: string; source?: Patch["source"] }

/** Apply human edits as patches. Restoring the original value removes the patch. Returns the new state. */
export function applyEdits(state: ReviewState, ctx: ReviewContext, edits: Edit[]): ReviewState {
  const next: ReviewState = { patches: { ...state.patches }, states: { ...state.states }, introduced: { ...state.introduced } };
  for (const edit of edits) {
    if (ctx.isFormula?.(edit.sheet, edit.row, edit.col)) throw new Error("Formula cells cannot be edited.");
    const key = cellKey(edit.sheet, edit.row, edit.col);
    const original = ctx.original(edit.sheet, edit.row, edit.col);
    if (edit.value === original) delete next.patches[key];
    else next.patches[key] = { sheet: edit.sheet, row: edit.row, col: edit.col, value: edit.value, original, asNumber: (ctx.specOfCell ? ctx.specOfCell(edit.sheet, edit.col) : ctx.specOfCol(edit.col))?.role === "amount" && edit.value.trim() !== "" && Number.isFinite(Number(edit.value)), source: edit.source ?? "typed", at: now() };
  }
  for (const edit of edits) {
    settleCell(next, ctx, edit.sheet, edit.row, edit.col, false);
    // A description conflict lives on one cell of the pair but depends on both.
    const twin = ctx.twinOfCell ? ctx.twinOfCell(edit.sheet, edit.col) : ctx.twinOf(edit.col);
    if (twin !== undefined) settleCell(next, ctx, edit.sheet, edit.row, twin, false);
    // An entry of the JSON depends on all of its columns: the issue sits on one cell but is settled by an edit of any other.
    for (const block of ctx.blocksOf?.(edit.col) ?? []) for (const member of [block.anchor, ...block.members]) if (member !== edit.col) settleCell(next, ctx, edit.sheet, edit.row, member, false);
    if (edit.sheet === ctx.sheet?.name) for (const conflict of ctx.conflictsAt(edit.row, edit.col)) if (conflict.row !== edit.row) settleCell(next, ctx, conflict.sheet, conflict.row, conflict.col, false);
  }
  return next;
}

/** Record that a suggestion was looked at and turned down. The original value stays. */
export function rejectSuggestion(state: ReviewState, issueId: string): ReviewState {
  return { ...state, states: { ...state.states, [issueId]: { ...state.states[issueId], status: state.states[issueId]?.status ?? "open", suggestionRejected: true } } };
}
export type ExceptionResult = { ok: true; state: ReviewState } | { ok: false; error: "reason-required" };
/** Accept a value as legitimate. The reason is mandatory and is kept in the audit report. */
export function acceptException(state: ReviewState, issueId: string, reason: string): ExceptionResult {
  if (!validExceptionReason(reason)) return { ok: false, error: "reason-required" };
  return { ok: true, state: { ...state, states: { ...state.states, [issueId]: { ...state.states[issueId], status: "accepted_exception", exceptionReason: reason.trim(), reviewedAt: now() } } } };
}
/** Take an exception back; the issue is judged again against the cell's current value. */
export function reopen(state: ReviewState, ctx: ReviewContext, issue: Issue): ReviewState {
  const { [issue.id]: removed, ...rest } = state.states;
  void removed;
  return settleCell({ ...state, states: rest }, ctx, issue.sheet, issue.row, issue.col);
}

/** Rows that share the group an issue is about (all rows of the same asset, branch or customer). */
export const groupRows = (ctx: ReviewContext, issue: Issue): number[] => ctx.groupRowsOf(issue);
/** Use one value for the whole group (an explicit reviewer action; the preview lists the rows first). */
export function chooseForGroup(state: ReviewState, ctx: ReviewContext, issue: Issue, value: string): ReviewState {
  return applyEdits(state, ctx, groupRows(ctx, issue).map(row => ({ sheet: issue.sheet, row, col: issue.col, value, source: "group" as const })));
}

// ── bulk, deterministic only ─────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface BulkItem { issueId: string; sheet: string; row: number; col: number; field: string; from: string; to: string }
export const isBulkKind = (kind: FixKind) => (BULK_FIXES as readonly FixKind[]).includes(kind);
/** What a bulk fix would change, for the preview. Nothing is applied; cells already edited or excepted are left out. */
export function planBulk(state: ReviewState, ctx: ReviewContext, kind: FixKind): BulkItem[] {
  if (!isBulkKind(kind)) return [];
  const out: BulkItem[] = [];
  const seen = new Set<string>();
  for (const issue of ctx.issues) {
    if (issue.fix?.kind !== kind) continue;
    const key = cellKey(issue.sheet, issue.row, issue.col);
    if (seen.has(key) || state.patches[key] || state.states[issue.id]?.status === "accepted_exception") continue;
    const to = applyFix(kind, issue.originalValue);
    if (to === issue.originalValue) continue;
    seen.add(key);
    out.push({ issueId: issue.id, sheet: issue.sheet, row: issue.row, col: issue.col, field: issue.field, from: issue.originalValue, to });
  }
  return out;
}
export function applyBulk(state: ReviewState, ctx: ReviewContext, plan: BulkItem[]): ReviewState {
  return applyEdits(state, ctx, plan.map(item => ({ sheet: item.sheet, row: item.row, col: item.col, value: item.to, source: "bulk" as const })));
}

// ── history ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface History { past: ReviewState[]; present: ReviewState; future: ReviewState[] }
export const LIMIT = 100;
export const newHistory = (): History => ({ past: [], present: emptyReview(), future: [] });
export const commit = (history: History, next: ReviewState): History => next === history.present ? history : { past: [...history.past, history.present].slice(-LIMIT), present: next, future: [] };
export const undo = (history: History): History => history.past.length ? { past: history.past.slice(0, -1), present: history.past.at(-1)!, future: [history.present, ...history.future] } : history;
export const redo = (history: History): History => history.future.length ? { past: [...history.past, history.present], present: history.future[0], future: history.future.slice(1) } : history;

// ── summary and gating ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
export const allIssues = (state: ReviewState, ctx: ReviewContext): Issue[] => [...ctx.issues, ...Object.values(state.introduced).flat()];
export const statusOf = (state: ReviewState, issue: Issue): IssueStatus => state.states[issue.id]?.status ?? "open";
export interface ReviewSummary {
  total: number;
  byStatus: Record<IssueStatus, number>;
  /** Critical or high issues that are neither verified nor accepted as an exception. They block the JSON export. */
  blocking: number;
  blockingBySeverity: Partial<Record<Severity, number>>;
  exceptions: number;
  patched: number;
}
export function summarize(state: ReviewState, ctx: ReviewContext): ReviewSummary {
  const out: ReviewSummary = { total: 0, byStatus: { open: 0, edited: 0, verified: 0, accepted_exception: 0 }, blocking: 0, blockingBySeverity: {}, exceptions: 0, patched: Object.keys(state.patches).length };
  for (const issue of allIssues(state, ctx)) {
    const status = statusOf(state, issue);
    out.total++; out.byStatus[status]++;
    if (status === "accepted_exception") out.exceptions++;
    if (isBlocking(issue.severity) && (status === "open" || status === "edited")) { out.blocking++; out.blockingBySeverity[issue.severity] = (out.blockingBySeverity[issue.severity] ?? 0) + 1; }
  }
  return out;
}
