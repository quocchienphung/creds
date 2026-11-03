import type { Session } from "./session.ts";
import { applyEdits, cellKey, summarize, type ReviewState } from "./review.ts";
import { EvidenceBuilder, scopeOf } from "./evidence-index.ts";
import { isTextCell, specRoleOf, textRoleOf } from "./sheet-scan.ts";
import { generateCandidates } from "./candidate-generator.ts";
import { rankCandidates } from "./context-ranker.ts";
import { decideRepair, MODEL_VERSION, POLICY_VERSION, type RepairDecision, type RepairStatus } from "./repair-decision.ts";
import { corruptionSpans } from "./corruption-span.ts";
import { patchWorkbookBytes, verifyRoundTrip, verifyPackageIntegrity, verifyPatches, comparePackageParts, type PackageVerdict } from "./xlsx-patcher.ts";
import { calibrate, planModelRepair, CALIBRATION_VERSION, type Calibration } from "./model-repair.ts";
import { addMetrics, classifyOutcome, emptyMetrics, metricViolations, zeroPatchOf, type ReasonCode, type RepairMetrics, type RepairOutcome, type ZeroPatch } from "./repair-metrics.ts";
import { columnLetters } from "./text.ts";
import { wordsOf } from "./predict.ts";
import { IDENTIFIER_FIELD, planPacked, repairPackedLine } from "./packed-csv.ts";
import { patchesOf } from "./session.ts";
import { analyzeValue } from "./detect.ts";
import { otherCellBlockers } from "./workbook-coverage.ts";
import { duplicateSummary, type DuplicateSummary } from "./duplicate-repairs.ts";
export interface RepairProgress { stage: "evidence_index" | "candidate_generation" | "validation" | "patch" | "package_verification" | "download"; processedRows: number; totalRows: number; applied: number; unresolved: number; elapsedMs: number }
export interface RepairReport {
  version: 2; mode: "Source-verified + calibrated model"; status: RepairOutcome; metrics: RepairMetrics; byReasonCode: Partial<Record<ReasonCode, number>>; calibration: Calibration; packageVerdict: PackageVerdict; modelVersion: string; policyVersion: string;
  cellsAccounted: number; rowsAccounted: number; applied: number; modelAccepted: number; unresolved: number; protected: number; unchanged: number; questionMarksAccounted: number;
  reviewBlocking: number; existingReviewPatches: number;
  duplicateGroups: DuplicateSummary;
  hiddenRowsIncluded: number; hiddenRowsExcluded: number; byStatus: Record<RepairStatus, number>;
  byRole: Record<string, { cells: number; applied: number; unresolved: number }>;
  byReason: Record<string, number>;
  /** Per worksheet, in file order. `verifiedChanges` are cells the re-read output measured to differ from the input. */
  sheets: { sheetId: string; /** `failed`: this sheet alone could not be read; it was left untouched. */ status: "scanned" | "failed"; cells: number; flagged: number; metrics: RepairMetrics; verifiedChanges: number }[];
  /** The workbook as the scan saw it. */
  workbook: { sheetsDiscovered: number; sheetsScanned: number; sheetsFailed: number; hiddenSheets: number; cellsVisited: number };
  /** Null when cells changed; otherwise whether and where the count first became zero. */
  zeroPatch: ZeroPatch | null;
  /** Candidates a protection rule refused (identifier, name, formula, rich text, an existing review). */
  rejected: number;
  /** One re-read check per written patch: where it is, how the cell was stored, and whether the exported cell holds exactly the approved value. No values. */
  verification: { sheetId: string; ref: string; part: string; rid: string; storage: string; ok: boolean; changed: boolean }[];
  locations: { sheetId: string; row: number; col: number; role: string; status: RepairStatus; reasonCode: string; reason: ReasonCode | null; evidence: RepairDecision["evidence"] }[];
  timings: Record<string, number>; validation: { roundTrip: boolean; packageIntegrity: boolean; desktopExcel: "not_tested" }; jsonReadiness: "separate_gates_required";
}
export interface AutoRepairOutput { bytes: Uint8Array; report: RepairReport; state: ReviewState; fileName: string }
export class RepairValidationError extends Error { constructor(message: string) { super(message); this.name = "RepairValidationError"; } }
const pause = () => new Promise<void>(resolve => setTimeout(resolve, 0));

/** One atomic transaction. Exceptions/cancellation/failed validation never commit partial state or offer a download. */
export async function autoRepair(session: Session, state: ReviewState, options: { cancelled?: () => boolean; onProgress?: (p: RepairProgress) => void } = {}): Promise<AutoRepairOutput> {
  // No profile, no header and no mapping is needed: the repair reads every sheet and every text cell of whatever workbook it is given.
  const start = performance.now(), totalRows = session.workbook.sheets.reduce((n, s) => n + s.rows.length + s.emptyRows, 0);
  let processed = 0, applied = 0, unresolved = 0;
  const check = () => { if (options.cancelled?.()) throw new Error("Repair cancelled; original workbook and review history are unchanged."); };
  const progress = async (stage: RepairProgress["stage"]) => { options.onProgress?.({ stage, processedRows: processed, totalRows, applied, unresolved, elapsedMs: Math.round(performance.now() - start) }); await pause(); check(); };
  const timings: Record<string, number> = {}, builder = new EvidenceBuilder(session, new Set(Object.keys(state.patches)));
  await progress("evidence_index");
  for (const sheet of session.workbook.sheets) {
    for (const row of sheet.rows) { builder.add(sheet.name, row); if (++processed % 500 === 0) await progress("evidence_index"); }
    processed += sheet.emptyRows;
  }
  const index = builder.finish(); timings.evidenceIndex = performance.now() - start;
  // Confidence calibration on a hold-out of the clean text of this very file, at the damage rate observed in it.
  const calibrationStart = performance.now();
  let words = 0, brokenWords = 0;
  for (const sheet of session.workbook.sheets) {
    const info = index.sheets.get(sheet.name)!, specs = new Map(info.columns.map(item => [item.col, item.spec]));
    for (const row of sheet.rows) if (row.r > info.headerRow) row.cells.forEach((cell, col) => {
      if (!cell || cell.f || !isTextCell(cell) || !cell.v.includes("?")) return;
      const spec = specs.get(col);
      if (spec ? spec.role !== "freeText" : textRoleOf(cell.v) !== "freeText") return;
      for (const word of wordsOf(cell.v)) { words++; if (word.text.includes("?")) brokenWords++; }
    });
  }
  const calibration = calibrate([...builder.cleanTexts], words ? brokenWords / words : 0);
  timings.calibration = performance.now() - calibrationStart;
  await progress("candidate_generation");
  const decisions: { sheet: string; decision: RepairDecision }[] = [];
  const sheetCounts = new Map<string, { sheetId: string; status: "scanned" | "failed"; cells: number; flagged: number; metrics: RepairMetrics; verifiedChanges: number }>();
  let cells = 0, questionMarks = 0, unchanged = 0;
  const byRole: RepairReport["byRole"] = {}, byReason: Record<string, number> = {}, byReasonCode: Partial<Record<ReasonCode, number>> = {};
  const total = emptyMetrics();
  processed = 0; const scanStart = performance.now();
  const record = (sheetName: string, decision: RepairDecision, role: string, metrics: RepairMetrics) => {
    decisions.push({ sheet: sheetName, decision });
    byReason[decision.reasonCode] = (byReason[decision.reasonCode] ?? 0) + 1;
    if (decision.reason) byReasonCode[decision.reason] = (byReasonCode[decision.reason] ?? 0) + 1;
    const fixed = decision.status === "source_verified" || decision.status === "model_auto_accepted";
    const whole = decision.status === "source_verified" || (decision.status === "model_auto_accepted" && decision.reason === null);
    if (fixed) byRole[role].applied++;
    if (!whole) { byRole[role].unresolved++; metrics.unresolved++; unresolved++; }
    if (decision.status === "source_verified") metrics.sourceVerified++; else if (decision.status === "model_auto_accepted") metrics.modelAutoAccepted++;
    if (decision.status === "blocked") metrics.protectedCells++;
    if (fixed) applied++;
    if (decisions.length > 250000) throw new Error("Repair report budget exceeded.");
  };
  for (const sheet of session.workbook.sheets) {
    const blankCells = sheet.emptyCells ?? 0;
    const info = index.sheets.get(sheet.name)!, metrics = emptyMetrics(), count = { sheetId: info.sheetId, status: sheet.error ? "failed" as const : "scanned" as const, cells: blankCells, flagged: 0, metrics, verifiedChanges: 0 };
    metrics.sheetsScanned = sheet.error ? 0 : 1; metrics.rowsScanned = sheet.rows.length + sheet.emptyRows;
    cells += blankCells; unchanged += blankCells;
    if (blankCells) { byRole.unmapped ??= { cells: 0, applied: 0, unresolved: 0 }; byRole.unmapped.cells += blankCells; }
    sheetCounts.set(sheet.name, count);
    if (sheet.error) continue;
    const byCol = new Map(info.columns.map(c => [c.col, c.spec]));
    const packed = session.wprofile.sheets.find(p => p.name === sheet.name)?.role === "csv-packed" ? planPacked(sheet, session.profile) : null;
    for (const row of sheet.rows) {
      const entity = info.entityOf(row);
      for (let col = 0; col < row.cells.length; col++) {
        const cell = row.cells[col]; if (!cell) continue;
        cells++; count.cells++;
        if (["s", "str", "inlineStr"].includes(cell.t) && !cell.f) metrics.textCellsScanned++;
        const current = state.patches[cellKey(sheet.name, row.r, col)];
        const value = current?.value ?? cell.v;
        questionMarks += value.match(/\?/g)?.length ?? 0;
        if (value.includes("?")) metrics.cellsContainingQuestionMark++;
        const spec = row.r > info.headerRow ? byCol.get(col) : undefined;
        // A legacy profile may label an identifier as freeText (e.g. a vehicle plate). Semantic protection still wins.
        // A column the profile does not know is judged by its value: free text, unless it looks like an identifier, a link or a code.
        const role = !spec ? textRoleOf(value) : IDENTIFIER_FIELD.test(spec.field) ? "identifier" : spec.role;
        byRole[role] ??= { cells: 0, applied: 0, unresolved: 0 }; byRole[role].cells++;
        if (packed && col === packed.packedCol && row.r > packed.headerRow && value.includes("?")) {
          const line = repairPackedLine(value, packed, index.model, calibration);
          if (line.value === null && line.shape) { /* a line whose field count differs from the header is never guessed */ }
          const fixed = line.value !== null, whole = fixed && line.damagedFields === line.fixedFields && line.unresolvedFields === 0 && line.protectedFields === 0;
          const reason: ReasonCode | null = whole ? null : fixed ? "PARTIAL_WORDS" : line.shape ? "UNSUPPORTED_STRUCTURE" : line.protectedFields === line.damagedFields ? "PROTECTED_ROLE" : calibration.enabled ? "LOW_CONFIDENCE" : "CALIBRATION_UNAVAILABLE";
          const decision: RepairDecision = { sheetId: info.sheetId, row: row.r, col, role: "packedCsv", original: value, status: fixed ? "model_auto_accepted" : reason === "PROTECTED_ROLE" || reason === "UNSUPPORTED_STRUCTURE" ? "blocked" : "needs_review",
            ...(fixed ? { proposed: line.value! } : {}), evidence: fixed ? [{ kind: "calibrated_model", sourceId: `calibration:${CALIBRATION_VERSION}` }] : [], reasonCode: fixed ? (whole ? "calibrated_model_margin" : "calibrated_model_partial") : "packed_line_unresolved", reason, modelVersion: MODEL_VERSION, policyVersion: POLICY_VERSION };
          metrics.suspectedCorruptions++; count.flagged++;
          byRole.packedCsv ??= { cells: 0, applied: 0, unresolved: 0 }; byRole.packedCsv.cells++; byRole[role].cells--;
          record(sheet.name, decision, "packedCsv", metrics);
          continue;
        }
        const spans = corruptionSpans(value);
        const findings = analyzeValue(value, spec ?? { role: specRoleOf(value) }, { diacriticPolicy: false });
        if (!spans.length && !findings.length) { unchanged++; continue; }
        if (spans.length && spans.every(s => s.kind === "suspected_punctuation")) metrics.legitimatePunctuation++; else if (spans.length) metrics.suspectedCorruptions++;
        count.flagged++;
        const scope = scopeOf(info, col, spec, role);
        const generated = generateCandidates(index, scope, entity, value);
        metrics.candidatesGenerated += generated.candidates.length;
        const ranked = rankCandidates(generated.candidates, index.model); metrics.candidatesRanked += ranked.length;
        const decision = decideRepair({ sheetId: info.sheetId, row: row.r, col, role }, { ...cell, v: value }, ranked, generated.conflict, { calibrationEnabled: calibration.enabled, plan: () => planModelRepair(index.model, value, calibration) });
        if (decision.status === "unchanged" && findings.length) { decision.status = "needs_review"; decision.reasonCode = findings[0].category.toLowerCase(); decision.reason = "LOW_CONFIDENCE"; }
        if (current) { decision.status = "blocked"; decision.reasonCode = "existing_review_patch"; decision.reason = "EXISTING_REVIEW"; delete decision.proposed; delete decision.words; }
        if (session.ctx.issuesAt(sheet.name, row.r, col).some(issue => state.states[issue.id]?.status === "accepted_exception")) { decision.status = "blocked"; decision.reasonCode = "reviewed_exception_preserved"; decision.reason = "EXISTING_REVIEW"; delete decision.proposed; delete decision.words; }
        record(sheet.name, decision, role, metrics);
      }
      if (++processed % 500 === 0) await progress("candidate_generation");
    }
    processed += sheet.emptyRows;
  }
  timings.candidates = performance.now() - scanStart;
  await progress("validation");
  const approved = decisions.filter(d => d.decision.status === "source_verified" || d.decision.status === "model_auto_accepted");
  // All roles and digits were checked per cell. A model prediction is applied as `auto_model` and never promoted to verified.
  const next = applyEdits(state, session.ctx, approved.map(({ sheet, decision: d }) => ({ sheet, row: d.row, col: d.col, value: d.proposed!, source: d.status === "source_verified" ? "auto_source" as const : "auto_model" as const })));
  for (const { sheet, decision: d } of approved) Object.assign(next.patches[cellKey(sheet, d.row, d.col)], { modelVersion: MODEL_VERSION, policyVersion: POLICY_VERSION, evidenceSourceId: d.evidence[0].sourceId });
  const patches = patchesOf(next), patchStart = performance.now();
  await progress("patch");
  const patched = patchWorkbookBytes(session.bytes, session.workbook, patches);
  timings.patch = performance.now() - patchStart;
  await progress("package_verification");
  const verifyStart = performance.now(), roundTrip = verifyRoundTrip(session.workbook, patched.bytes, patches);
  const packageIntegrity = verifyPackageIntegrity(session.bytes, patched.bytes, session.workbook, patches);
  if (!roundTrip.ok || !packageIntegrity) throw new RepairValidationError("Repaired workbook failed validation; nothing was committed or downloaded.");
  const checks = verifyPatches(session.workbook, patched.bytes, patches);
  if (checks.some(check => !check.ok || !check.changed)) throw new RepairValidationError("A repaired cell does not hold its approved value in the exported file; nothing was committed or downloaded.");
  const parts = comparePackageParts(session.bytes, patched.bytes);
  timings.verify = performance.now() - verifyStart;
  // Metrics of the whole job. Earlier human edits travel with the output, so they count as proposals/targets/commits too.
  const carried = Object.keys(state.patches).length;
  for (const { sheet, decision: d } of approved) addMetrics(sheetCounts.get(sheet)!.metrics, { patchProposals: 1, patchTargetsUnique: 1, patchesCommitted: next.patches[cellKey(sheet, d.row, d.col)] ? 1 : 0 });
  for (const item of sheetCounts.values()) addMetrics(total, item.metrics);
  total.patchProposals += carried; total.patchTargetsUnique += carried; total.patchesCommitted += carried;
  for (const [name, count] of sheetCounts) { count.verifiedChanges = roundTrip.bySheet[name] ?? 0; count.metrics.outputCellsChanged = count.verifiedChanges; }
  total.outputCellsChanged = roundTrip.cellsChanged; total.outputUnexpectedChanges = roundTrip.unexpectedChanges;
  const bad = metricViolations(total);
  if (bad.length) throw new RepairValidationError("Repair pipeline contract violated: " + bad.join("; "));
  const outcome = classifyOutcome(total), noChange = outcome === "NO_REPAIR_APPLIED";
  await progress("download");
  const byStatus: Record<RepairStatus, number> = { source_verified: 0, model_auto_accepted: 0, needs_review: 0, blocked: 0, unchanged };
  for (const { decision: d } of decisions) byStatus[d.status]++;
  byStatus.unchanged += unchanged;
  const reviewBlocking = summarize(next, session.ctx).blocking + otherCellBlockers(session, next);
  timings.total = performance.now() - start;
  const base = session.workbook.fileName.replace(/\.xlsx$/i, "");
  const report: RepairReport = {
    version: 2, mode: "Source-verified + calibrated model", status: outcome, metrics: total, byReasonCode, calibration, packageVerdict: parts.verdict, modelVersion: MODEL_VERSION, policyVersion: POLICY_VERSION,
    reviewBlocking, existingReviewPatches: carried,
    duplicateGroups: duplicateSummary(session),
    cellsAccounted: cells, rowsAccounted: totalRows, applied: byStatus.source_verified, modelAccepted: byStatus.model_auto_accepted, unresolved, protected: byStatus.blocked, unchanged, questionMarksAccounted: questionMarks,
    hiddenRowsIncluded: session.workbook.sheets.reduce((n, s) => n + s.hiddenRows, 0), hiddenRowsExcluded: 0, byStatus, byRole, byReason, sheets: [...sheetCounts.values()],
    locations: decisions.map(({ decision: d }) => ({ sheetId: d.sheetId, row: d.row, col: d.col, role: d.role, status: d.status, reasonCode: d.reasonCode, reason: d.reason, evidence: d.evidence })),
    workbook: { sheetsDiscovered: session.workbook.sheets.length, sheetsScanned: session.workbook.sheets.filter(sheet => !sheet.error).length, sheetsFailed: session.workbook.sheets.filter(sheet => sheet.error).length, hiddenSheets: session.workbook.sheets.filter(sheet => sheet.state && sheet.state !== "visible").length, cellsVisited: session.workbook.sheets.reduce((n, sheet) => n + (sheet.cellsVisited ?? 0), 0) },
    zeroPatch: zeroPatchOf(total, byReasonCode), rejected: byStatus.blocked,
    verification: checks.map(check => { const sheet = session.workbook.sheets.find(item => item.name === check.sheet)!, cell = sheet.rows.find(row => row.r === check.row)?.cells[check.col]; return { sheetId: sheetCounts.get(check.sheet)!.sheetId, ref: columnLetters(check.col) + check.row, part: sheet.part, rid: sheet.rid ?? "", storage: cell?.t ?? "none", ok: check.ok, changed: check.changed }; }),
    timings, validation: { roundTrip: true, packageIntegrity: true, desktopExcel: "not_tested" }, jsonReadiness: "separate_gates_required",
  };
  // Nothing changed: hand back the untouched input under a name that says so, never a re-compressed copy dressed as a repair.
  return noChange
    ? { bytes: session.bytes.slice(), report, state, fileName: base + ".not-repaired.xlsx" }
    : { bytes: patched.bytes, report, state: next, fileName: base + ".repaired.xlsx" };
}
