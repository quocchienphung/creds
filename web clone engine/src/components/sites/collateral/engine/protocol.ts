import type { Issue } from "../excel-formation/engine/types.ts";
import type { WorkbookProfile } from "../excel-formation/engine/profile.ts";
import type { ScanStats } from "../excel-formation/engine/detect.ts";
import type { IssueState, ReviewSummary, BulkItem, Patch } from "../excel-formation/engine/review.ts";
import type { FixKind } from "../excel-formation/engine/types.ts";
import type { WordPrediction } from "../excel-formation/engine/predict.ts";
import type { RoundTripReport } from "../excel-formation/engine/xlsx-patcher.ts";
import type { ProgressFile, RestoreError } from "../excel-formation/engine/progress.ts";
import type { JsonPlan } from "../json-formation/engine/json-session.ts";
import type { ReportMeta, ReportOptions } from "../json-formation/engine/json-report.ts";
import type { JsonNodeInfo, SearchResult } from "../../json-viewer/json-model.ts";
import type { RepairProgress, RepairReport } from "../excel-formation/engine/auto-repair.ts";
import type { DuplicatePlan } from "../excel-formation/engine/duplicate-repairs.ts";

/** What the page needs after a workbook is opened. Nothing here is sent anywhere: it crosses only the worker boundary of this browser tab. */
export interface OpenResult {
  fileName: string;
  size: number;
  fileHash: string;
  profile: WorkbookProfile;
  issues: Issue[];
  stats: ScanStats;
  blockers: string[];
  /** Header of every resolved column keyed by column index, for display. */
  headers: Record<number, string>;
}
/** The review state as the page shows it. `states` holds only issues a reviewer has touched. */
export interface ReviewView {
  states: Record<string, IssueState>;
  introduced: Issue[];
  summary: ReviewSummary;
  canUndo: boolean;
  canRedo: boolean;
}
export interface RowCell { col: number; letter: string; header: string; value: string }
export interface RowContext { row: number; hidden: boolean; cells: RowCell[] }

/** A window onto the worksheet around one cell: the file's own face, with real column letters, row numbers and the neighbouring rows. */
export interface SheetWindow {
  fileName: string;
  sheet: string;
  target: { row: number; col: number; letter: string; header: string };
  /** Columns shown, in sheet order. `gapBefore` marks a jump over columns that are not shown. */
  columns: { col: number; letter: string; header: string; gapBefore: boolean }[];
  rows: { r: number; hidden: boolean; header: boolean; gapBefore: boolean; values: string[] }[];
  totalRows: number;
  totalCols: number;
  hiddenRows: number;
}

/** Full cell values, served in bounded row windows. Other sheets can be read without changing the correction engine's primary sheet. */
export interface GridMeta { fileName: string; sheet: string; sheets?: string[]; columns: { col: number; letter: string; header: string; weight: number }[]; firstRow: number; lastRow: number; headerRow: number; hiddenRows: number }
export interface GridRow { r: number; hidden: boolean; header: boolean; values: string[] }

export type Request =
  | { type: "duplicatePlan"; issueId: string; includeTwin: boolean }
  | { type: "duplicateApply"; issueId: string; value: string; includeTwin: boolean }
  | { type: "autoRepair" }
  | { type: "cancelRepair" }
  | { type: "window"; row: number; col: number }
  | { type: "gridMeta"; sheet?: string }
  | { type: "grid"; from: number; count: number; sheet?: string }
  | { type: "predict"; row: number; col: number }
  | { type: "open"; bytes: ArrayBuffer; fileName: string; diacriticPolicy: boolean; overrides: Record<string, number> }
  | { type: "edit"; edits: { row: number; col: number; value: string; source?: Patch["source"] }[] }
  | { type: "reject"; issueId: string }
  | { type: "exception"; issueId: string; reason: string }
  | { type: "reopen"; issueId: string }
  | { type: "chooseGroup"; issueId: string; value: string }
  | { type: "bulkPlan"; kind: FixKind }
  | { type: "bulkApply"; kind: FixKind }
  | { type: "undo" } | { type: "redo" } | { type: "view" }
  | { type: "row"; row: number }
  | { type: "groupRows"; issueId: string }
  | { type: "exportXlsx" }
  | { type: "docRoot" }
  | { type: "docChildren"; keys: string[]; from: number; to: number }
  | { type: "docSearch"; query: string; max: number }
  | { type: "docText"; keys: string[] }
  | { type: "progressSave" }
  | { type: "progressLoad"; file: unknown }
  | { type: "json"; meta: ReportMeta; options: ReportOptions; final: boolean; /** With `final`: the bytes come back as the zip of the JSON (`…<zzz>.zip`), read back and compared before they are offered. */ zip?: boolean };

export type Response =
  | { type: "duplicatePlan"; plan: DuplicatePlan | null }
  | { type: "duplicateApplied"; view: ReviewView; rows: number; changedCells: number }
  | { type: "repaired"; fileName: string; bytes: ArrayBuffer; report: RepairReport; view: ReviewView }
  | { type: "repairCancelRequested" }
  | { type: "opened"; result: OpenResult; view: ReviewView }
  | { type: "view"; view: ReviewView }
  | { type: "bulkPlan"; items: BulkItem[] }
  | { type: "row"; context: RowContext }
  | { type: "window"; window: SheetWindow }
  | { type: "gridMeta"; meta: GridMeta }
  | { type: "grid"; from: number; rows: GridRow[] }
  | { type: "predict"; text: string; predictions: WordPrediction[]; modelWords: number }
  | { type: "groupRows"; rows: number[] }
  | { type: "exported"; fileName: string; bytes: ArrayBuffer; changedCells: number; roundTrip: RoundTripReport }
  | { type: "json"; plan: JsonPlan; bytes?: ArrayBuffer; audit: string; csv: string }
  | { type: "docRoot"; epoch: number; info: JsonNodeInfo | null }
  | { type: "docChildren"; epoch: number; items: JsonNodeInfo[] }
  | { type: "docSearch"; epoch: number; result: SearchResult }
  | { type: "docText"; epoch: number; text: string | null }
  | { type: "progress"; file: ProgressFile }
  | { type: "restored"; view: ReviewView; patches: number; exceptions: number; matches: boolean; rulesChanged: boolean }
  | { type: "restoreRefused"; error: RestoreError; at?: { row: number; col: number } }
  | { type: "refused"; reason: "reason-required" };

export type WorkerMessage =
  | { id: number; repairProgress: RepairProgress }
  | { id: number; ok: true; response: Response }
  | { id: number; ok: false; error: string; code?: string }
  | { id: number; progress: { phase: "read" | "scan"; fraction: number } };
export type WorkerRequest = { id: number; request: Request };
