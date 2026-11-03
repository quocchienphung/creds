import { evidenceKey, phraseLookup, type EvidenceIndex, type SourceRecord } from "./evidence-index.ts";
import { matchesMask } from "./corruption-span.ts";
import { tryDecodeMojibake } from "./detect.ts";
export interface RepairCandidate { value: string; source: SourceRecord; kind: "same_asset_clean_record" | "clean_in_file"; score: number; /** How many clean cells of the same column hold exactly this text. */ support: number }
/** Exact entity retrieval takes precedence; cross-entity matches remain suggestions only. */
export function generateCandidates(index: EvidenceIndex, scope: string, entity: string | null, original: string): { candidates: RepairCandidate[]; conflict: boolean } {
  const own = entity ? index.entities.get(evidenceKey(scope, entity)) ?? [] : [];
  const distinct = new Set(own.map(s => s.value));
  if (distinct.size > 1) return { candidates: [], conflict: true };
  const sources = own.length ? own : index.phrases.get(phraseLookup(scope, original)) ?? [];
  const seen = new Set<string>(), candidates: RepairCandidate[] = [], held = new Map<string, number>();
  for (const source of sources) held.set(source.value, (held.get(source.value) ?? 0) + (source.count ?? 1));
  for (const source of sources.slice(0, 128)) {
    if (seen.has(source.value) || !matchesMask(original, source.value) && tryDecodeMojibake(original) !== source.value) continue;
    seen.add(source.value);
    candidates.push({ value: source.value, source, kind: own.length ? "same_asset_clean_record" : "clean_in_file", score: 0, support: held.get(source.value) ?? 1 });
    if (candidates.length === 8) break;
  }
  return { candidates, conflict: false };
}
