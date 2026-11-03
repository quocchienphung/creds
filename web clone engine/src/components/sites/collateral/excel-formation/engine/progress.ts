import type { IssueStatus } from "./types.ts";
import { RULE_VERSION } from "./detect.ts";
import { allIssues, applyEdits, emptyReview, summarize, validExceptionReason, type IssueState, type Patch, type ReviewContext, type ReviewState, type ReviewSummary } from "./review.ts";

/**
 * Review progress as a small file the person keeps. The workbook itself is never written into it: only the corrections (cell, original text, new
 * text), the exceptions with their reasons, and the counts to check a restore against. It is tied to one workbook by its fingerprint, so it can
 * be loaded onto that exact file and nothing else, and a restore replays every correction from the original text, so the result is the one a
 * person would have had by typing the same corrections again.
 */
export const PROGRESS_KIND = "logio-collateral-progress";
export const PROGRESS_VERSION = 1;

export interface ProgressCounts { total: number; open: number; edited: number; verified: number; exceptions: number; patched: number }
export interface ProgressFile {
  kind: typeof PROGRESS_KIND;
  version: typeof PROGRESS_VERSION;
  fileHash: string;
  rules: string;
  savedAt: string;
  patches: Patch[];
  /** Only what cannot be derived from the corrections: exceptions with their reason, and suggestions turned down. */
  states: Record<string, Pick<IssueState, "status" | "exceptionReason" | "reviewedAt" | "suggestionRejected">>;
  counts: ProgressCounts;
}

const countsOf = (summary: ReviewSummary): ProgressCounts => ({ total: summary.total, open: summary.byStatus.open, edited: summary.byStatus.edited, verified: summary.byStatus.verified, exceptions: summary.exceptions, patched: summary.patched });

export function snapshotProgress(state: ReviewState, ctx: ReviewContext, now: () => string = () => new Date().toISOString()): ProgressFile {
  const states: ProgressFile["states"] = {};
  for (const [id, item] of Object.entries(state.states)) {
    if (item.status === "accepted_exception" || item.suggestionRejected) states[id] = { status: item.status, ...(item.exceptionReason ? { exceptionReason: item.exceptionReason } : {}), ...(item.reviewedAt ? { reviewedAt: item.reviewedAt } : {}), ...(item.suggestionRejected ? { suggestionRejected: true } : {}) };
  }
  return { kind: PROGRESS_KIND, version: PROGRESS_VERSION, fileHash: ctx.fileHash, rules: RULE_VERSION, savedAt: now(), patches: Object.values(state.patches).sort((a, b) => a.row - b.row || a.col - b.col), states, counts: countsOf(summarize(state, ctx)) };
}

export type RestoreError = "not-progress" | "version" | "other-file" | "damaged" | "changed-cell";
export type RestoreResult =
  | { ok: true; state: ReviewState; patches: number; exceptions: number; /** The counts after the replay equal the counts saved with the file. */ matches: boolean; rulesChanged: boolean }
  | { ok: false; error: RestoreError; at?: { row: number; col: number } };

const SOURCES = new Set<Patch["source"]>(["typed", "suggestion", "fix", "bulk", "twin", "group", "auto_source", "auto_model"]);
const STATUSES = new Set<IssueStatus>(["open", "edited", "verified", "accepted_exception"]);
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** Replay a progress file onto the opened workbook. Nothing is applied unless the whole file is sound. */
export function restoreProgress(raw: unknown, ctx: ReviewContext): RestoreResult {
  if (!isRecord(raw) || raw.kind !== PROGRESS_KIND) return { ok: false, error: "not-progress" };
  if (raw.version !== PROGRESS_VERSION) return { ok: false, error: "version" };
  if (raw.fileHash !== ctx.fileHash) return { ok: false, error: "other-file" };
  if (!Array.isArray(raw.patches) || !isRecord(raw.states) || !isRecord(raw.counts)) return { ok: false, error: "damaged" };
  const edits: { sheet: string; row: number; col: number; value: string; source: Patch["source"] }[] = [];
  const provenance = new Map<string, Pick<Patch, "modelVersion" | "policyVersion" | "evidenceSourceId">>();
  const seen = new Set<string>();
  for (const item of raw.patches) {
    if (!isRecord(item) || typeof item.sheet !== "string" || !Number.isInteger(item.row) || !Number.isInteger(item.col) || typeof item.value !== "string" || typeof item.original !== "string" || !SOURCES.has(item.source as Patch["source"])) return { ok: false, error: "damaged" };
    const row = item.row as number, col = item.col as number, id = `${item.sheet}\u0001${row}\u0001${col}`;
    if (seen.has(id) || row < 1 || col < 0) return { ok: false, error: "damaged" };
    seen.add(id);
    // The correction was made on this cell of this file: if its text is not what the correction started from, the file is not the one it was made on.
    if (ctx.original(item.sheet, row, col) !== item.original) return { ok: false, error: "changed-cell", at: { row, col } };
    edits.push({ sheet: item.sheet, row, col, value: item.value, source: item.source as Patch["source"] });
    if (item.source === "auto_source" || item.source === "auto_model") {
      if (typeof item.modelVersion !== "string" || typeof item.policyVersion !== "string" || typeof item.evidenceSourceId !== "string") return { ok: false, error: "damaged" };
      provenance.set(id, { modelVersion: item.modelVersion, policyVersion: item.policyVersion, evidenceSourceId: item.evidenceSourceId });
    }
  }
  let state = applyEdits(emptyReview(), ctx, edits);
  for (const [key, metadata] of provenance) if (state.patches[key]) Object.assign(state.patches[key], metadata);
  const known = new Set(allIssues(state, ctx).map(issue => issue.id));
  const states = { ...state.states };
  let exceptions = 0;
  for (const [id, item] of Object.entries(raw.states)) {
    if (!isRecord(item) || !STATUSES.has(item.status as IssueStatus)) return { ok: false, error: "damaged" };
    if (!known.has(id)) continue;
    const before = states[id];
    if (item.status === "accepted_exception") {
      if (typeof item.exceptionReason !== "string" || !validExceptionReason(item.exceptionReason)) return { ok: false, error: "damaged" };
      states[id] = { ...before, status: "accepted_exception", exceptionReason: item.exceptionReason, ...(typeof item.reviewedAt === "string" ? { reviewedAt: item.reviewedAt } : {}) };
      exceptions++;
    }
    if (item.suggestionRejected === true) states[id] = { ...(states[id] ?? { status: before?.status ?? "open" }), suggestionRejected: true };
  }
  state = { ...state, states };
  const now = countsOf(summarize(state, ctx)), saved = raw.counts;
  const matches = (Object.keys(now) as (keyof ProgressCounts)[]).every(key => saved[key] === now[key]);
  return { ok: true, state, patches: edits.length, exceptions, matches, rulesChanged: raw.rules !== RULE_VERSION };
}
