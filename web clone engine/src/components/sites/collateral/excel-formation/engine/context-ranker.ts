import type { RepairCandidate } from "./candidate-generator.ts";
import type { VietnameseModel } from "./predict.ts";
/** Scores rank suggestions, never claim a probability or authorize a patch. Stable ordinal tie-break. */
export function rankCandidates(candidates: RepairCandidate[], model: VietnameseModel): RepairCandidate[] {
  return candidates.map(candidate => ({ ...candidate, score: (candidate.kind === "same_asset_clean_record" ? 1000 : 0) + candidate.value.split(/\s+/).reduce((n, word) => n + Math.log1p(model.count(word)), 0) })).sort((a, b) => b.score - a.score || (a.value < b.value ? -1 : a.value > b.value ? 1 : 0));
}
