import { corruptionSpans, matchesMask } from "./corruption-span.ts";
import type { RepairCandidate } from "./candidate-generator.ts";
import type { Cell } from "./types.ts";
import { tryDecodeMojibake } from "./detect.ts";
import type { ModelPlan } from "./model-repair.ts";
import { CALIBRATION_VERSION } from "./model-repair.ts";
import type { ReasonCode } from "./repair-metrics.ts";
export const MIN_FILE_SUPPORT = 2;
export const MODEL_VERSION = "local-retrieval-4", POLICY_VERSION = "source-verified+calibrated-model-1";
/** `source_verified`: a clean record of the same asset proves the text. `model_auto_accepted`: a calibrated local prediction, applied but NEVER verified. */
export type RepairStatus = "source_verified" | "model_auto_accepted" | "needs_review" | "blocked" | "unchanged";
export type EvidenceKind = RepairCandidate["kind"] | "calibrated_model" | "geo_recovery" | "collateral_recovery";
export interface RepairDecision {
  sheetId: string; row: number; col: number; role: string; original: string; proposed?: string; status: RepairStatus;
  evidence: { kind: EvidenceKind; sourceId: string }[]; reasonCode: string; reason: ReasonCode | null; modelVersion: string; policyVersion: string;
  /** Damaged words restored / left alone, for a model decision. */
  words?: { resolved: number; unresolved: number };
}
export interface ModelContext { plan: () => ModelPlan | null; calibrationEnabled: boolean }
export function decideRepair(at: { sheetId: string; row: number; col: number; role: string }, cell: Cell, candidates: RepairCandidate[], conflict: boolean, model?: ModelContext): RepairDecision {
  const base = { ...at, original: cell.v, evidence: [], modelVersion: MODEL_VERSION, policyVersion: POLICY_VERSION };
  const spans = corruptionSpans(cell.v);
  if (!spans.length) return { ...base, status: "unchanged", reasonCode: "no_corruption", reason: null };
  if (cell.f || cell.protectedText || at.role !== "freeText" || !["s", "str", "inlineStr"].includes(cell.t))
    return { ...base, status: "blocked", reasonCode: cell.f ? "protected_formula" : cell.protectedText ? "unsupported_text_structure" : "protected_or_unmapped_role", reason: cell.f ? "FORMULA" : cell.protectedText ? "UNSUPPORTED_STRUCTURE" : "PROTECTED_ROLE" };
  if (conflict) return { ...base, status: "blocked", reasonCode: "conflicting_clean_sources", reason: "CONFLICT" };
  const doubtful = spans.some(s => s.kind === "suspected_punctuation" || s.kind === "unknown");
  const decoded = spans.some(s => s.kind === "mojibake") ? tryDecodeMojibake(cell.v) : null;
  const safe = doubtful ? [] : candidates.filter(c => (matchesMask(cell.v, c.value) || decoded === c.value) && (cell.v.match(/\d+/g) ?? []).join("|") === (c.value.match(/\d+/g) ?? []).join("|") && !/^\s*[=+@-]/.test(c.value));
  const best = safe[0];
  if (safe.length === 1 && best.kind === "same_asset_clean_record") return { ...base, proposed: best.value, status: "source_verified", evidence: [{ kind: best.kind, sourceId: best.source.sourceId }], reasonCode: decoded === best.value ? "reversible_encoding_with_same_entity_source" : "unique_same_entity_source", reason: null };
  // No same-asset record, but this exact clean text stands in several cells of the very same column and nothing else fits the visible letters:
  // applied as a model-class repair (never verified), with the witness count as its only claim.
  if (!doubtful && !decoded && safe.length === 1 && best.kind === "clean_in_file" && best.support >= MIN_FILE_SUPPORT)
    return { ...base, proposed: best.value, status: "model_auto_accepted", evidence: [{ kind: best.kind, sourceId: best.source.sourceId }], reasonCode: "unique_clean_text_in_same_column", reason: null };
  // No proof from a clean record of the same asset: the calibrated local model may still restore the confidently predicted words.
  if (model && !decoded && spans.some(s => s.kind === "replacement")) {
    const plan = model.plan();
    if (plan) {
      const partial = plan.unresolvedWords > 0 || doubtful;
      return { ...base, proposed: plan.value, status: "model_auto_accepted", evidence: [{ kind: "calibrated_model", sourceId: `calibration:${CALIBRATION_VERSION}` }],
        reasonCode: partial ? "calibrated_model_partial" : "calibrated_model_margin", reason: partial ? "PARTIAL_WORDS" : null, words: { resolved: plan.resolvedWords, unresolved: plan.unresolvedWords } };
    }
  }
  const reason: ReasonCode = !model?.calibrationEnabled && model ? "CALIBRATION_UNAVAILABLE" : doubtful && !candidates.length ? "PUNCTUATION" : safe.length > 1 ? "AMBIGUOUS" : best ? "LOW_CONFIDENCE" : "NO_CANDIDATE";
  return { ...base, ...(best ? { proposed: best.value, evidence: [{ kind: best.kind, sourceId: best.source.sourceId }] } : {}), status: "needs_review",
    reasonCode: doubtful ? "punctuation_or_unknown" : safe.length > 1 ? "ambiguous_candidates" : best ? "uncalibrated_suggestion" : "no_trusted_source", reason };
}
