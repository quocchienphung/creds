/// <reference lib="webworker" />
import { openSession, exportCorrected, type Session } from "../excel-formation/engine/session.ts";
import { CreditImportError } from "../excel-formation/engine/xlsx-reader.ts";
import { planJson } from "../json-formation/engine/json-session.ts";
import { makeZip, zipHolds } from "../json-formation/engine/json-package.ts";
import { childrenOf, rootInfo, searchDocument, textOf } from "../json-formation/engine/json-doc.ts";
import type { VietnameseModel } from "../excel-formation/engine/predict.ts";
import { EvidenceBuilder } from "../excel-formation/engine/evidence-index.ts";
import { restoreProgress, snapshotProgress } from "../excel-formation/engine/progress.ts";
import { workbookGridMeta, workbookGridRows } from "../excel-formation/engine/workbook-grid.ts";
import { acceptException, applyBulk, applyEdits, chooseForGroup, commit, groupRows, newHistory, planBulk, redo, rejectSuggestion, reopen, summarize, undo, type History } from "../excel-formation/engine/review.ts";
import type { ReviewView, WorkerMessage, WorkerRequest } from "./protocol.ts";
import { autoRepair } from "../excel-formation/engine/auto-repair.ts";
import { fillPlaceholders, findResidual } from "../excel-formation/engine/residual.ts";
import { loadGeo, type GeoEngine } from "../excel-formation/engine/geo/geo-load.ts";
import { planDuplicateRepair, applyDuplicateRepair } from "../excel-formation/engine/duplicate-repairs.ts";

/**
 * Every byte of the workbook lives only in this worker: it is read, scanned, reviewed and exported here, and nothing is stored or sent
 * over the network. Closing the tab, or `terminate()` from the page, discards it all.
 */
let session: Session | null = null;
let history: History = newHistory();
let repair: { cancelled: boolean } | null = null;
/** The reporting document of the latest plan, served to the viewer page by page. */
let document: { report: unknown; epoch: number } | null = null;
const DOC_ROOT = "report";
/** Learned from the clean text of every worksheet of this file the first time a prediction is asked for (a second or so on a large file), then kept. */
let language: VietnameseModel | null = null;
function languageOf(s: Session): VietnameseModel {
  if (language) return language;
  const learner = new EvidenceBuilder(s);
  for (const sheet of s.workbook.sheets) for (const row of sheet.rows) learner.add(sheet.name, row);
  return language = learner.finish().model;
}
/** The geographic knowledge is built once per worker (a second or two), from same-origin files; a failure is kept so the report can say why it was off. */
let geoLoad: Promise<GeoEngine | { error: string }> | null = null;
const geoEngine = () => geoLoad ??= loadGeo();
/** The sheet a request is about: the one it names, else the profile's data sheet, else the first one. */
const sheetNameOf = (s: Session, name?: string) => { const found = s.workbook.sheets.find(item => item.name === (name ?? s.wprofile.primary ?? s.workbook.sheets[0].name)); if (!found) throw new Error("That worksheet is not in this file."); return found.name; };

const post = (message: WorkerMessage, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(message, transfer);

function view(): ReviewView {
  const s = session!;
  return { states: history.present.states, introduced: Object.values(history.present.introduced).flat(), summary: summarize(history.present, s.ctx), canUndo: history.past.length > 0, canRedo: history.future.length > 0 };
}
const need = () => { if (!session) throw new Error("No workbook is open."); return session; };
const issueOf = (id: string) => need().scan.issues.find(item => item.id === id) ?? Object.values(history.present.introduced).flat().find(item => item.id === id);

async function handle(id: number, request: WorkerRequest["request"]) {
  if (repair && !["cancelRepair", "grid", "gridMeta", "row", "window", "view", "predict", "docRoot", "docChildren", "docSearch", "docText"].includes(request.type)) throw new Error("Wait for automatic repair or cancel it before changing the workbook.");
  switch (request.type) {
    case "duplicatePlan": {
      const issue = issueOf(request.issueId);
      return { type: "duplicatePlan" as const, plan: issue ? planDuplicateRepair(need(), history.present, issue.sheet, issue.row, issue.col, request.includeTwin) : null };
    }
    case "duplicateApply": {
      const issue = issueOf(request.issueId); if (!issue) throw new Error("This issue is no longer available.");
      const result = applyDuplicateRepair(need(), history.present, issue.sheet, issue.row, issue.col, request.value, request.includeTwin);
      history = commit(history, result.state); document = null;
      return { type: "duplicateApplied" as const, view: view(), rows: result.plan.rows.length, changedCells: result.changedCells };
    }
    case "residual": return { type: "residual" as const, report: findResidual(need(), history.present) };
    case "fillRemaining": {
      const s = need();
      history = commit(history, applyEdits(history.present, s.ctx, fillPlaceholders(s, history.present)));
      document = null;
      return { type: "view" as const, view: view() };
    }
    case "cancelRepair": if (repair) repair.cancelled = true; return { type: "repairCancelRequested" as const };
    case "autoRepair": {
      const task = { cancelled: false }; repair = task;
      try {
        const loaded = await geoEngine(), geo = "error" in loaded ? undefined : loaded;
        const out = await autoRepair(need(), history.present, { cancelled: () => task.cancelled, onProgress: progress => post({ id, repairProgress: progress }), collateral: true, ...(geo ? { geo } : {}), ...(request.policy ? { policy: request.policy } : {}) });
        history = commit(history, out.state);
        document = null;
        const bytes = out.bytes.buffer.slice(out.bytes.byteOffset, out.bytes.byteOffset + out.bytes.byteLength) as ArrayBuffer;
        return { type: "repaired" as const, fileName: out.fileName, bytes, report: out.report, geoAudit: out.geoAudit, collateralAudit: out.collateralAudit, view: view(), ...("error" in loaded ? { geoUnavailable: loaded.error } : {}) };
      } finally { repair = null; }
    }
    case "open": {
      history = newHistory();
      language = null;
      document = null;
      session = await openSession(new Uint8Array(request.bytes), request.fileName, { overrides: request.overrides, onProgress: (phase, fraction) => post({ id, progress: { phase, fraction } }) });
      const headers: Record<number, string> = {};
      for (const item of session.wprofile.mapping?.resolved ?? []) headers[item.col] = item.spec.header;
      return { type: "opened" as const, view: view(), result: { fileName: request.fileName, size: session.workbook.size, fileHash: session.workbook.fileHash, profile: session.wprofile, sheetScans: session.sheetScans, issues: session.scan.issues, stats: session.scan.stats, blockers: session.scan.blockers, headers } };
    }
    case "edit": {
      const s = need();
      history = commit(history, applyEdits(history.present, s.ctx, request.edits.map(edit => ({ sheet: sheetNameOf(s, edit.sheet), row: edit.row, col: edit.col, value: edit.value, source: edit.source }))));
      return { type: "view" as const, view: view() };
    }
    case "reject": history = commit(history, rejectSuggestion(history.present, request.issueId)); return { type: "view" as const, view: view() };
    case "exception": {
      const result = acceptException(history.present, request.issueId, request.reason);
      if (!result.ok) return { type: "refused" as const, reason: result.error };
      history = commit(history, result.state);
      return { type: "view" as const, view: view() };
    }
    case "reopen": {
      const issue = issueOf(request.issueId);
      if (issue) history = commit(history, reopen(history.present, need().ctx, issue));
      return { type: "view" as const, view: view() };
    }
    case "chooseGroup": {
      const issue = issueOf(request.issueId);
      if (issue) history = commit(history, chooseForGroup(history.present, need().ctx, issue, request.value));
      return { type: "view" as const, view: view() };
    }
    case "bulkPlan": return { type: "bulkPlan" as const, items: planBulk(history.present, need().ctx, request.kind) };
    case "bulkApply": history = commit(history, applyBulk(history.present, need().ctx, planBulk(history.present, need().ctx, request.kind))); return { type: "view" as const, view: view() };
    case "undo": history = undo(history); return { type: "view" as const, view: view() };
    case "redo": history = redo(history); return { type: "view" as const, view: view() };
    case "view": return { type: "view" as const, view: view() };
    case "groupRows": { const issue = issueOf(request.issueId); return { type: "groupRows" as const, rows: issue ? groupRows(need().ctx, issue) : [] }; }
    case "row": {
      const s = need();
      const sheet = s.workbook.sheets.find(item => item.name === sheetNameOf(s, request.sheet));
      const row = sheet?.rows.find(item => item.r === request.row);
      const headers = new Map((s.wprofile.mapping?.resolved ?? []).map(item => [item.col, item.spec.header]));
      const patches = history.present.patches;
      const cells = (row?.cells ?? []).flatMap((cell, col) => {
        const patched = patches[`${sheet!.name}\u0001${request.row}\u0001${col}`];
        const value = patched?.value ?? cell?.v ?? "";
        return value === "" ? [] : [{ col, letter: "", header: headers.get(col) ?? "", value }];
      });
      return { type: "row" as const, context: { row: request.row, hidden: !!row?.hidden, cells } };
    }
    case "json": {
      const s = need();
      const { bytes, audit, csv, report, ...plan } = planJson(s, history.present, request.meta, request.options, summarize(history.present, s.ctx));
      document = { report, epoch: (document?.epoch ?? 0) + 1 };
      // Only a request marked final, and only when every gate holds, ever carries the bytes of the reporting JSON.
      let offered = request.final && plan.ready && bytes ? bytes : null;
      if (offered && request.zip) {
        const zipped = makeZip(plan.fileName!, offered, request.meta.KB001);
        if (!zipHolds(zipped, plan.fileName!, offered)) throw new Error("The zip could not be verified; no download was produced.");
        offered = zipped;
      }
      const out = offered ? offered.buffer.slice(offered.byteOffset, offered.byteOffset + offered.byteLength) as ArrayBuffer : undefined;
      return { type: "json" as const, plan: { ...plan, epoch: document.epoch }, audit, csv, ...(out ? { bytes: out } : {}) };
    }
    case "docRoot": return { type: "docRoot" as const, epoch: document?.epoch ?? 0, info: document ? rootInfo(document.report, DOC_ROOT) : null };
    case "docChildren": return { type: "docChildren" as const, epoch: document?.epoch ?? 0, items: document ? childrenOf(document.report, DOC_ROOT, request.keys, request.from, request.to) : [] };
    case "docSearch": return { type: "docSearch" as const, epoch: document?.epoch ?? 0, result: document ? searchDocument(document.report, DOC_ROOT, request.query, request.max) : { hits: [], capped: false } };
    case "docText": return { type: "docText" as const, epoch: document?.epoch ?? 0, text: document ? textOf(document.report, request.keys) : null };
    case "gridMeta": {
      const s = need();
      return { type: "gridMeta" as const, meta: workbookGridMeta(s.workbook, s.wprofile, request.sheet ?? s.wprofile.primary ?? s.workbook.sheets[0].name) };
    }
    case "grid": {
      const s = need();
      return { type: "grid" as const, from: request.from, rows: workbookGridRows(s.workbook, s.wprofile, history.present.patches, request.sheet ?? s.wprofile.primary ?? s.workbook.sheets[0].name, request.from, request.count) };
    }
    case "window": {
      const s = need();
      const sheet = s.workbook.sheets.find(item => item.name === s.wprofile.primary)!;
      const sheetProfile = s.wprofile.sheets.find(item => item.name === s.wprofile.primary)!;
      const resolved = s.wprofile.mapping?.resolved ?? [];
      const header = sheet.rows.find(item => item.r === sheetProfile.headerRow);
      const colOf = (name: string) => resolved.find(item => item.spec.header === name)?.col;
      const keyCols = [colOf(s.profile.groupBy.branch), colOf(s.profile.groupBy.customer), colOf(s.profile.groupBy.asset)].filter((col): col is number => col !== undefined && col !== request.col);
      const cols = [...new Set([...keyCols, request.col])].sort((a, b) => a - b);
      const headerText = (col: number) => header?.cells[col]?.v ?? "";
      const letter = (col: number) => { let n = col + 1, out = ""; while (n > 0) { const rem = (n - 1) % 26; out = String.fromCharCode(65 + rem) + out; n = Math.floor((n - 1) / 26); } return out; };
      const at = sheet.rows.findIndex(item => item.r === request.row);
      const picked = new Set<number>();
      if (sheetProfile.headerRow !== null) picked.add(sheetProfile.headerRow);
      for (let i = Math.max(0, at - 2); i <= Math.min(sheet.rows.length - 1, at + 2); i++) if (i >= 0) picked.add(sheet.rows[i].r);
      const shown = sheet.rows.filter(item => picked.has(item.r));
      const patches = history.present.patches;
      const value = (r: number, col: number, original: string | undefined) => patches[`${sheet.name}\u0001${r}\u0001${col}`]?.value ?? original ?? "";
      let previous = 0;
      const rows = shown.map(item => { const out = { r: item.r, hidden: item.hidden, header: item.r === sheetProfile.headerRow, gapBefore: previous !== 0 && item.r - previous > 1, values: cols.map(col => value(item.r, col, item.cells[col]?.v)) }; previous = item.r; return out; });
      return { type: "window" as const, window: {
        fileName: s.workbook.fileName, sheet: sheet.name, target: { row: request.row, col: request.col, letter: letter(request.col), header: headerText(request.col) },
        columns: cols.map((col, index) => ({ col, letter: letter(col), header: headerText(col), gapBefore: index > 0 && col - cols[index - 1] > 1 })),
        rows, totalRows: sheet.rows.at(-1)?.r ?? request.row, totalCols: sheet.maxCol, hiddenRows: sheet.hiddenRows,
      } };
    }
    case "predict": {
      const s = need();
      const model = languageOf(s);
      // The words are read from the cell as it is in the file, not from an edit in progress.
      const text = s.ctx.original(sheetNameOf(s, request.sheet), request.row, request.col);
      return { type: "predict" as const, text, predictions: model.predict(text), modelWords: model.size };
    }
    case "progressSave": return { type: "progress" as const, file: snapshotProgress(history.present, need().ctx) };
    case "progressLoad": {
      // Replayed from the original text of every cell; nothing is applied unless the whole file is sound, and it can be undone in one step.
      const result = restoreProgress(request.file, need().ctx);
      if (!result.ok) return { type: "restoreRefused" as const, error: result.error, ...(result.at ? { at: result.at } : {}) };
      history = commit(history, result.state);
      return { type: "restored" as const, view: view(), patches: result.patches, exceptions: result.exceptions, matches: result.matches, rulesChanged: result.rulesChanged };
    }
    case "exportXlsx": {
      const out = exportCorrected(need(), history.present);
      const bytes = out.bytes.buffer.slice(out.bytes.byteOffset, out.bytes.byteOffset + out.bytes.byteLength) as ArrayBuffer;
      return { type: "exported" as const, fileName: out.fileName, bytes, changedCells: out.changedCells, roundTrip: out.roundTrip };
    }
  }
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id, request } = event.data;
  try {
    const response = await handle(id, request);
    if (!response) throw new Error("The review engine is out of date: reload the page (F5) to update it. Bộ máy rà soát đã cũ: hãy tải lại trang (F5).");
    post({ id, ok: true, response }, response.type === "exported" || response.type === "repaired" ? [response.bytes] : response.type === "json" && response.bytes ? [response.bytes] : []);
  } catch (error) {
    post({ id, ok: false, error: error instanceof Error ? error.message : String(error), ...(error instanceof CreditImportError ? { code: error.code } : {}) });
  }
};
export {};
