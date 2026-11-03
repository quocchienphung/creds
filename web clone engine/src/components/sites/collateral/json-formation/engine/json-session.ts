import type { Session } from "../../excel-formation/engine/session.ts";
import type { ReviewState } from "../../excel-formation/engine/review.ts";
import { allIssues, cellKey, statusOf, summarize } from "../../excel-formation/engine/review.ts";
import { otherCellBlockers } from "../../excel-formation/engine/workbook-coverage.ts";
import { buildReport, defaultReportOptions, encodeAndVerify, reportDateFrom, validYmd, workbookReportDate, type Reconciliation, type ReportMeta, type ReportOptions, type ReportOut, type Verification } from "./json-report.ts";
import { packageName } from "./json-package.ts";
import { columnLetters } from "../../excel-formation/engine/text.ts";
import { RULE_VERSION } from "../../excel-formation/engine/detect.ts";
import type { Row } from "../../excel-formation/engine/types.ts";

export interface ExportCheck { id: string; ok: boolean; detail?: string }
export interface JsonPlan {
  reconciliation: Reconciliation;
  checks: ExportCheck[];
  /** True only when every check holds: only then may the contractual JSON be offered. */
  ready: boolean;
  verification: Verification | null;
  problems: string[];
  /** The report date the workbook itself carries, to pre-fill the form (null when it holds none or several). */
  workbookDate: string | null;
  options: ReportOptions;
  /** The names the form asks for (`D40<TCTD code><date>.<zzz>.json` and `.zip`); null until the parts typed at export are valid. */
  fileName: string | null;
  zipName: string | null;
  /** What each stage of the check took in the worker (ms): the report, the bytes and the replay. */
  timings?: { build: number; verify: number; replay: number };
  /** Which build of the document the viewer is reading (a new one every time the plan is made again). */
  epoch?: number;
}
export interface JsonOutput extends JsonPlan { bytes: Uint8Array | null; audit: string; csv: string; /** The document itself, for the worker to serve to the viewer. Never posted as it is. */ report: ReportOut; /** How long the report took to build, the bytes to verify, and the whole of it again for the replay check (ms). */ timings: { build: number; verify: number; replay: number } }

const valueAtOf = (session: Session, state: ReviewState) => (row: Row, col: number) => state.patches[cellKey(session.workbook.sheets.find(s => s.name === session.wprofile.primary)!.name, row.r, col)]?.value ?? row.cells[col]?.v ?? "";
const valid = (text: string) => text.trim() !== "";

/** Run every gate for the JSON export. Builds the report twice (deterministic replay) and checks the bytes it would offer. */
export function planJson(session: Session, state: ReviewState, meta: ReportMeta, options: ReportOptions = defaultReportOptions, summary: { blocking: number }): JsonOutput {
  const blocking = Math.max(summary.blocking, summarize(state, session.ctx).blocking) + otherCellBlockers(session, state);
  const valueAt = valueAtOf(session, state);
  const patchedKeys = new Set(Object.keys(state.patches));
  const sheet = session.workbook.sheets.find(item => item.name === session.wprofile.primary);
  const headerRow = session.wprofile.sheets.find(item => item.name === session.wprofile.primary)?.headerRow ?? 0;
  const dateCol = session.wprofile.mapping?.resolved.find(item => item.spec.header === "NGAYDULIEU")?.col;
  const workbookDate = workbookReportDate(sheet?.rows.filter(row => row.r > headerRow) ?? [], dateCol, valueAt);
  const clock = [performance.now()];
  const first = buildReport(session.workbook, session.wprofile, session.profile, valueAt, meta, options, patchedKeys);
  clock.push(performance.now());
  const encoded = encodeAndVerify(first.report);
  clock.push(performance.now());
  const second = buildReport(session.workbook, session.wprofile, session.profile, valueAt, meta, options, patchedKeys);
  const replay = encodeAndVerify(second.report);
  clock.push(performance.now());
  const timings = { build: Math.round(clock[1] - clock[0]), verify: Math.round(clock[2] - clock[1]), replay: Math.round(clock[3] - clock[2]) };
  const rec = first.reconciliation;

  // The approved description of every edited representative row must be what the JSON holds (checked on the bytes, not on the objects).
  let td013Checked = 0, td013Wrong = 0;
  if (encoded.verification.parses) {
    const parsed = JSON.parse(new TextDecoder().decode(encoded.bytes)) as ReportOut;
    const byKey = new Map<string, string>();
    for (const b of parsed.CNTCTD) for (const c of b.KHACHHANG) for (const a of c.THONGTINBD) byKey.set([b.TTC01, c.TTC03, a.TS001].join("\u0001"), a.TS013);
    const col = (h: string) => session.wprofile.mapping?.resolved.find(item => item.spec.header === h)?.col;
    const [bc, cc, ac, dc] = [col(session.profile.groupBy.branch), col(session.profile.groupBy.customer), col(session.profile.groupBy.asset), col("MOTABDS")];
    if (bc !== undefined && cc !== undefined && ac !== undefined && dc !== undefined && sheet) {
      const firstRowOf = new Map<string, Row>();
      for (const row of sheet.rows) if (row.r > headerRow) { const k = [valueAt(row, bc), valueAt(row, cc), valueAt(row, ac)].join("\u0001"); if (!firstRowOf.has(k)) firstRowOf.set(k, row); }
      for (const key of patchedKeys) {
        const [, rowText, colText] = key.split("\u0001");
        if (Number(colText) !== dc) continue;
        const row = sheet.rows.find(item => item.r === Number(rowText));
        if (!row) continue;
        const k = [valueAt(row, bc), valueAt(row, cc), valueAt(row, ac)].join("\u0001");
        if (firstRowOf.get(k) !== row) continue;
        td013Checked++;
        if (byKey.get(k) !== state.patches[key].value) td013Wrong++;
      }
    }
  }
  const ymdOk = validYmd(meta.KB001);
  const packaged = packageName(options.file, meta.KB001);
  const checks: ExportCheck[] = [
    { id: "serious-issues", ok: blocking === 0, detail: String(blocking) },
    { id: "mapping", ok: session.scan.blockers.length === 0, detail: session.scan.blockers[0] },
    { id: "metadata", ok: ymdOk && valid(meta.KB002) && valid(meta.KB003) && valid(meta.KB004), detail: !ymdOk ? "KB001" : undefined },
    { id: "grouping", ok: first.problems.length === 0 && rec.assetsWithValueConflicts === 0, detail: first.problems[0] ?? (rec.assetsWithValueConflicts ? "Conflicting asset values require resolution." : undefined) },
    { id: "file-name", ok: packaged.name !== null, detail: packaged.problems[0] },
    { id: "schema", ok: encoded.verification.parses && encoded.verification.schemaErrors.length === 0, detail: encoded.verification.schemaErrors[0] },
    { id: "template", ok: encoded.verification.parses && encoded.verification.keyOrderOk, detail: encoded.verification.templateErrors[0] },
    { id: "utf8", ok: encoded.verification.utf8 && encoded.verification.parses },
    { id: "replay", ok: encoded.bytes.length === replay.bytes.length && encoded.bytes.every((byte, index) => byte === replay.bytes[index]) },
    { id: "counts", ok: rec.rowsGrouped + rec.rowsUnmatched === rec.rowsInSheet && Object.values(rec.rowsPerAsset).reduce((a, b) => a + b, 0) === rec.assets && rec.assets > 0 },
    { id: "ts013", ok: td013Wrong === 0, detail: `${td013Checked}` },
  ];
  const ready = checks.every(check => check.ok);
  return {
    reconciliation: rec, checks, ready, verification: encoded.verification, problems: first.problems, workbookDate: workbookDate.date, options,
    bytes: ready ? encoded.bytes : null, audit: auditJson(session, state, rec, checks, options, meta), csv: auditCsv(session, state), fileName: packaged.name?.json ?? null, zipName: packaged.name?.zip ?? null,
    report: first.report, timings,
  };
}

const iso = () => new Date().toISOString();
/** Redacted audit: ordinal IDs and coordinates only, without value hashes or freeform reasons. */
export function auditJson(session: Session, state: ReviewState, reconciliation: Reconciliation, checks: ExportCheck[], options: ReportOptions, meta: ReportMeta): string {
  void meta;
  const sheets = new Map(session.workbook.sheets.map((sheet, index) => [sheet.name, `sheet-${index + 1}`]));
  const issues = allIssues(state, session.ctx).map((issue, index) => {
    const decided = state.states[issue.id];
    return {
      id: `issue-${index + 1}`, sheet: sheets.get(issue.sheet), row: issue.row, column: issue.column, category: issue.category, severity: issue.severity, status: statusOf(state, issue),
      exceptionRecorded: !!decided?.exceptionReason, ...(decided?.reviewedAt ? { reviewedAt: decided.reviewedAt } : {}), ruleVersion: issue.ruleVersion,
    };
  });
  const patches = Object.values(state.patches).map(patch => ({ sheet: sheets.get(patch.sheet), row: patch.row, column: columnLetters(patch.col), source: patch.source, at: patch.at }));
  return JSON.stringify({
    tool: "collateral-pipeline", generatedAt: iso(), ruleVersion: RULE_VERSION, mappingProfile: { id: session.profile.id, version: session.profile.version },
    file: { size: session.workbook.size, sheets: session.workbook.sheets.length },
    decisions: { ownerPolicy: options.ownerPolicy, contractOrder: "first-seen", valueRules: { TS005: "first row", TS006: "exact decimal sum; no rounding policy", TS013: "MOTABDS of the first row", "TS010/TS011": "distinct values of every row", "TS014/TS015/TS016": "one entry per distinct set of columns, every row" } },
    reconciliation, checks: checks.map(({ id, ok }) => ({ id, ok })), issueCount: issues.length, patchCount: patches.length, issues, patches,
    privacy: { cellValuesIncluded: false, note: "No values, value hashes, file names, sheet names, metadata or freeform reasons are exported." },
  }, null, 2) + "\n";
}
export function auditCsv(session: Session, state: ReviewState): string {
  const esc = (v: string | number) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replaceAll("\"", "\"\"")}"` : s; };
  const sheets = new Map(session.workbook.sheets.map((sheet, index) => [sheet.name, `sheet-${index + 1}`]));
  const lines = [["sheet", "row", "column", "category", "severity", "status", "exception_recorded"].join(",")];
  for (const issue of allIssues(state, session.ctx)) {
    const decided = state.states[issue.id];
    lines.push([sheets.get(issue.sheet) ?? "unknown", issue.row, issue.column, issue.category, issue.severity, statusOf(state, issue), decided?.exceptionReason ? "yes" : "no"].map(esc).join(","));
  }
  return lines.join("\n") + "\n";
}
export { reportDateFrom };
