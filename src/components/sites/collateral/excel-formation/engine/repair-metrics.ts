/**
 * Stage-by-stage counters of one repair job (per worksheet and in total) and the outcome they allow. Counts only: no cell value, name or
 * identifier ever enters this record, so it can go to the UI and into the report unredacted.
 */
export interface RepairMetrics {
  sheetsScanned: number;
  rowsScanned: number;
  textCellsScanned: number;
  cellsContainingQuestionMark: number;
  suspectedCorruptions: number;
  legitimatePunctuation: number;
  protectedCells: number;
  candidatesGenerated: number;
  candidatesRanked: number;
  sourceVerified: number;
  modelAutoAccepted: number;
  unresolved: number;
  patchProposals: number;
  patchTargetsUnique: number;
  patchesCommitted: number;
  outputCellsChanged: number;
  outputUnexpectedChanges: number;
}
export const emptyMetrics = (): RepairMetrics => ({
  sheetsScanned: 0, rowsScanned: 0, textCellsScanned: 0, cellsContainingQuestionMark: 0, suspectedCorruptions: 0, legitimatePunctuation: 0, protectedCells: 0,
  candidatesGenerated: 0, candidatesRanked: 0, sourceVerified: 0, modelAutoAccepted: 0, unresolved: 0, patchProposals: 0, patchTargetsUnique: 0,
  patchesCommitted: 0, outputCellsChanged: 0, outputUnexpectedChanges: 0,
});
export function addMetrics(into: RepairMetrics, from: Partial<RepairMetrics>) { for (const key of Object.keys(from) as (keyof RepairMetrics)[]) into[key] += from[key] ?? 0; return into; }

/** Why a damaged cell was not repaired. */
export type ReasonCode =
  | "NO_CANDIDATE" | "LOW_CONFIDENCE" | "AMBIGUOUS" | "PROTECTED_ROLE" | "FORMULA" | "CONFLICT" | "PUNCTUATION" | "UNSUPPORTED_STRUCTURE"
  | "EXISTING_REVIEW" | "CALIBRATION_UNAVAILABLE" | "PATCH_NOT_APPLIED" | "OUTPUT_UNCHANGED" | "PARSER_ERROR" | "PARTIAL_WORDS";

export type RepairOutcome = "REPAIRED_VERIFIED" | "REPAIRED_PARTIALLY" | "NO_REPAIR_APPLIED" | "FAILED_VALIDATION" | "CANCELLED";

/**
 * `NO_REPAIR_APPLIED` is mandatory whenever no cell of the output differs from the input, whatever the ZIP bytes say; a damaged workbook
 * is never reported as repaired unless a cell really changed and nothing else did.
 */
export function classifyOutcome(m: RepairMetrics): RepairOutcome {
  if (m.outputUnexpectedChanges > 0) return "FAILED_VALIDATION";
  if (m.outputCellsChanged === 0) return "NO_REPAIR_APPLIED";
  return m.unresolved > 0 ? "REPAIRED_PARTIALLY" : "REPAIRED_VERIFIED";
}

/** Contract between the stages. A violation means a stage lost or invented patches; the job must fail instead of reporting success. */
export function metricViolations(m: RepairMetrics, hadBlockers = false): string[] {
  const bad: string[] = [];
  if (!(m.outputCellsChanged <= m.patchesCommitted)) bad.push("outputCellsChanged > patchesCommitted");
  if (!(m.patchesCommitted <= m.patchTargetsUnique)) bad.push("patchesCommitted > patchTargetsUnique");
  if (!(m.patchTargetsUnique <= m.patchProposals)) bad.push("patchTargetsUnique > patchProposals");
  if (m.sourceVerified + m.modelAutoAccepted > 0 && m.patchesCommitted === 0 && !hadBlockers) bad.push("accepted decisions produced no patch");
  if (m.patchesCommitted > 0 && m.outputCellsChanged < m.patchesCommitted) bad.push("a committed patch did not change its output cell (PATCH_NOT_APPLIED)");
  if (m.outputUnexpectedChanges !== 0) bad.push("outputUnexpectedChanges != 0");
  if (m.cellsContainingQuestionMark > 0 && m.outputCellsChanged === 0 && classifyOutcome(m) !== "NO_REPAIR_APPLIED") bad.push("zero changes reported as repaired");
  return bad;
}
