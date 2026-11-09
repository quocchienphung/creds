import type { Workbook } from "./types.ts";
import { readWorkbook } from "./xlsx-reader.ts";
import { columnLetters, fingerprintBytes } from "./text.ts";
import { MAU9_PROFILE, type MappingProfile } from "./mapping-profiles.ts";
import { profileWorkbook, resolveMapping, type WorkbookProfile } from "./profile.ts";
import { detectIssues, groupKey, type ScanResult } from "./detect.ts";
import { detectGenericIssues, genericKey } from "./generic-detect.ts";
import { scanWorkbook, type SheetScan } from "./sheet-scan.ts";
import type { ColumnSpec } from "./mapping-profiles.ts";
import type { Issue } from "./types.ts";
import type { ReviewContext, ReviewState } from "./review.ts";
import { cellKey } from "./review.ts";
import { resolveBlocks } from "./blocks.ts";
import { patchWorkbookBytes, verifyRoundTrip, exportName, type CellPatch, type RoundTripReport } from "./xlsx-patcher.ts";

/** Everything the engine holds about one opened workbook. It lives in memory (a Web Worker) and is never saved or sent anywhere. */
export interface Session {
  bytes: Uint8Array;
  workbook: Workbook;
  wprofile: WorkbookProfile;
  profile: MappingProfile;
  scan: ScanResult;
  /** One entry per worksheet of the file, from the profile-independent scan. */
  sheetScans: SheetScan[];
  ctx: ReviewContext;
  options: OpenOptions;
}
export interface OpenOptions { profile?: MappingProfile; overrides?: Record<string, number>; diacriticPolicy?: boolean; onProgress?: (phase: "read" | "scan", fraction: number) => void }

export function buildContext(workbook: Workbook, wprofile: WorkbookProfile, profile: MappingProfile, scan: ScanResult, diacriticPolicy: boolean): ReviewContext {
  const sheet = workbook.sheets.find(item => item.name === wprofile.primary);
  const resolved = wprofile.mapping?.resolved ?? [];
  const byCol = new Map(resolved.map(item => [item.col, item.spec]));
  const sheetSpecs = new Map(wprofile.sheets.map(s => [s.name, new Map((s.name === wprofile.primary ? resolved : resolveMapping(s.headers, profile).resolved).map(item => [item.col, item.spec]))]));
  const colOf = (header: string) => resolved.find(item => item.spec.header === header)?.col;
  const pair = profile.descriptionPair;
  const primary = pair ? colOf(pair.primary) : undefined, secondary = pair ? colOf(pair.secondary) : undefined;
  const branch = colOf(profile.groupBy.branch), customer = colOf(profile.groupBy.customer), asset = colOf(profile.groupBy.asset);
  const sheetRows = new Map(workbook.sheets.map(s => [s.name, new Map(s.rows.map(row => [row.r, row]))]));
  const byCell = new Map<string, Issue[]>();
  for (const issue of scan.issues) { const key = `${issue.sheet}\u0001${issue.row}\u0001${issue.col}`; const list = byCell.get(key); if (list) list.push(issue); else byCell.set(key, [issue]); }
  const blocks = resolveBlocks(profile, resolved);
  const members = new Map<string, number[]>();
  if (sheet && branch !== undefined && customer !== undefined && asset !== undefined) {
    for (const row of sheet.rows) for (const [level, cols] of [["branch", [branch]], ["customer", [branch, customer]], ["asset", [branch, customer, asset]]] as const) {
      const key = `${level}\u0000${groupKey(row, [...cols])}`;
      const list = members.get(key); if (list) list.push(row.r); else members.set(key, [row.r]);
    }
  }
  const groupRowsOf = (issue: Issue): number[] => {
    if (!issue.group || !sheet || branch === undefined || customer === undefined || asset === undefined) return [issue.row];
    return members.get(`${issue.group.level}\u0000${issue.group.key}`) ?? [];
  };
  let conflictIndex: Map<string, Issue[]> | null = null;
  const conflictsAt = (row: number, col: number): Issue[] => {
    if (!conflictIndex) {
      conflictIndex = new Map();
      for (const issue of scan.issues) if (issue.category === "CONFLICTING_DUPLICATE") for (const member of groupRowsOf(issue)) { const key = `${member}\u0001${issue.col}`; conflictIndex.set(key, [...(conflictIndex.get(key) ?? []), issue]); }
    }
    return conflictIndex.get(`${row}\u0001${col}`) ?? [];
  };
  return {
    groupRowsOf, conflictsAt, issuesAt: (sheetName, row, col) => byCell.get(`${sheetName}\u0001${row}\u0001${col}`) ?? [],
    fileHash: workbook.fileHash, issues: scan.issues, sheet,
    specOfCol: col => byCol.get(col), corpus: (col, sheetName) => sheetName && sheetName !== sheet?.name ? scan.genericCorpora?.get(genericKey(sheetName, col)) : scan.corpora.get(col),
    // A column the profile does not know is free text: the repair of corrupted text never waits for a mapping.
    specOfCell: (sheetName, col): ColumnSpec => sheetSpecs.get(sheetName)?.get(col) ?? { header: `${sheetName}!${columnLetters(col)}`, field: "", role: "freeText" },
    twinOfCell: (sheetName, col) => {
      const specs = sheetSpecs.get(sheetName);
      if (!pair || !specs) return undefined;
      const entries = [...specs];
      const a = entries.find(([, spec]) => spec.header === pair.primary)?.[0], b = entries.find(([, spec]) => spec.header === pair.secondary)?.[0];
      return col === a ? b : col === b ? a : undefined;
    },
    original: (sheetName, row, col) => sheetRows.get(sheetName)?.get(row)?.cells[col]?.v ?? "",
    isLocked: (sheetName, row, col) => { const cell = sheetRows.get(sheetName)?.get(row)?.cells[col]; return !!cell?.f || !!cell?.protectedText; },
    groupCols: branch !== undefined && customer !== undefined && asset !== undefined ? { branch, customer, asset } : null,
    blocksOf: col => blocks.filter(block => block.anchor === col || block.members.includes(col)),
    twinOf: col => primary !== undefined && secondary !== undefined ? (col === primary ? secondary : col === secondary ? primary : undefined) : undefined,
    diacriticPolicy,
  };
}

/** The profile-bound scan judged the mapped cells of one sheet; every other cell of every sheet is judged here, without a profile. */
function withGenericIssues(workbook: Workbook, wprofile: WorkbookProfile, scan: ScanResult): ScanResult {
  const mappedCols = new Set((wprofile.mapping?.resolved ?? []).map(item => item.col));
  const header = wprofile.sheets.find(item => item.name === wprofile.primary)?.headerRow ?? null;
  const generic = detectGenericIssues(workbook, wprofile, (sheet, row, col) => sheet === wprofile.primary && header !== null && row > header && mappedCols.has(col));
  const stats = { ...scan.stats, bySeverity: { ...scan.stats.bySeverity }, byCategory: { ...scan.stats.byCategory } };
  stats.rowsScanned += generic.rows; stats.cellsScanned += generic.cells; stats.affectedRows += generic.affectedRows;
  stats.corpusWords += [...generic.corpora.values()].reduce((n, corpus) => n + corpus.size, 0);
  for (const issue of generic.issues) { stats.issues++; stats.bySeverity[issue.severity]++; stats.byCategory[issue.category] = (stats.byCategory[issue.category] ?? 0) + 1; }
  return { ...scan, issues: [...scan.issues, ...generic.issues], stats, genericCorpora: generic.corpora };
}

export async function openSession(bytes: Uint8Array, fileName: string, options: OpenOptions = {}): Promise<Session> {
  const profile = options.profile ?? MAU9_PROFILE;
  const diacriticPolicy = options.diacriticPolicy !== false;
  const fileHash = await fingerprintBytes(bytes);
  const workbook = readWorkbook(bytes, { fileName, fileHash, onProgress: progress => options.onProgress?.("read", progress.phase === "sheet" ? 0.2 + progress.fraction * 0.8 : 0.1) });
  const wprofile = profileWorkbook(workbook, profile, options.overrides);
  const scan = withGenericIssues(workbook, wprofile, detectIssues(workbook, wprofile, profile, { diacriticPolicy, onProgress: fraction => options.onProgress?.("scan", fraction) }));
  return { bytes, workbook, wprofile, profile, scan, sheetScans: scanWorkbook(workbook), ctx: buildContext(workbook, wprofile, profile, scan, diacriticPolicy), options };
}

/** The approved patches as cell writes for the exporter. */
export function patchesOf(state: ReviewState): CellPatch[] {
  return Object.values(state.patches).map(patch => ({ sheet: patch.sheet, row: patch.row, col: patch.col, value: patch.value, asNumber: patch.asNumber }));
}
export interface ExportedWorkbook { fileName: string; bytes: Uint8Array; changedCells: number; roundTrip: RoundTripReport }
/** Build the corrected copy and prove it: the file is read back and compared with the original before it is offered. */
export function exportCorrected(session: Session, state: ReviewState): ExportedWorkbook {
  const patches = patchesOf(state);
  const report = patchWorkbookBytes(session.bytes, session.workbook, patches);
  const roundTrip = verifyRoundTrip(session.workbook, report.bytes, patches);
  if (!roundTrip.ok) throw new Error("Workbook validation failed; no download was produced.");
  return { fileName: exportName(session.workbook.fileName), bytes: report.bytes, changedCells: report.changedCells, roundTrip };
}
export { cellKey };
