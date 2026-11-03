"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, Download, RotateCcw, Undo2, Redo2, ListChecks } from "lucide-react";
import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { Button } from "../../../uiarc/button/Button";
import { FloatingButtonGroup } from "../../../uiarc/floating-button-group/FloatingButtonGroup";
import { motionTokens } from "../../../uiarc/motion-tokens";
import type { CollateralEngine } from "../../useCollateralEngine";
import type { GridMeta, ReviewView } from "../../engine/protocol";
import type { Patch } from "../engine/review";
import { columnLetters } from "../engine/text";
import { wordsOfChange } from "../engine/applied-change";
import { IssueGallery, type GalleryItem } from "../gallery/IssueGallery";
import type { SheetData } from "../gallery/SheetViewer";
import { SpeculativeRun } from "../gallery/SpeculativeRun";
import { previewCells, previewKey, type PreviewCell } from "../preview-model";
import { downloadBlob } from "../../download";
import "../final-preview.css";

export function ExportStep({ engine, notify, onReview, onDirtyChange }: {
  engine: CollateralEngine; notify: (message: string) => void; onReview: () => void; onDirtyChange: (dirty: boolean) => void;
}) {
  const { t } = useWorkspaceI18n(), reduce = useReducedMotion();
  const result = engine.result!, view = engine.view!;
  const [snapshot, setSnapshot] = useState<{ view: ReviewView; patches: Patch[]; error: string | null } | null>(null);
  const [retry, setRetry] = useState(0), [picked, setPicked] = useState("");
  const [extras, setExtras] = useState<Record<string, PreviewCell>>({});
  const [variant, setVariant] = useState<"original" | "edited">("edited");
  const [filter, setFilter] = useState<"all" | "changed" | "review">("all");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [grid, setGrid] = useState<{ sheet: string; meta: GridMeta | null; error: boolean } | null>(null);
  const [approvedView, setApprovedView] = useState<ReviewView | null>(null);
  const [downloadedView, setDownloadedView] = useState<ReviewView | null>(null);
  const [exporting, setExporting] = useState(false), [error, setError] = useState("");
  const selectionRequest = useRef(0), currentView = useRef(view);
  useEffect(() => { currentView.current = view; }, [view]);
  const { previewChanges, gridMeta: loadMeta, gridRows } = engine;
  const current = snapshot?.view === view;
  const ready = current && !snapshot.error;
  const patches = useMemo(() => current ? snapshot.patches : [], [current, snapshot]);
  useEffect(() => {
    let alive = true;
    void previewChanges().then(patches => { if (alive) setSnapshot({ view, patches, error: null }); })
      .catch(error => { if (alive) setSnapshot({ view, patches: [], error: error instanceof Error ? error.message : "Could not load changes." }); });
    const pendingSelection = selectionRequest;
    return () => { alive = false; pendingSelection.current++; };
  }, [previewChanges, view, retry]);
  const all = useMemo(() => {
    const known = previewCells([...result.issues, ...view.introduced], view.states, patches);
    const keys = new Set(known.map(cell => cell.key));
    return [...known, ...Object.values(extras).filter(cell => !keys.has(cell.key))];
  }, [result.issues, view, patches, extras]);
  const cells = useMemo(() => {
    const shown = all.filter(cell => drafts[cell.key] !== undefined || (filter === "changed" ? cell.before !== cell.after : filter === "review" ? cell.needsReview : true));
    const selected = all.find(cell => cell.key === picked);
    return selected && selected.key === picked && !shown.some(cell => cell.key === picked) ? [selected, ...shown] : shown;
  }, [all, filter, picked, drafts]);
  const index = Math.max(0, cells.findIndex(cell => cell.key === picked));
  const selected = cells[index];
  const sheetName = selected?.sheet ?? result.sheetScans[0]?.name;
  const meta = grid?.sheet === sheetName ? grid.meta : null;
  useEffect(() => {
    let alive = true;
    void loadMeta(sheetName).then(meta => { if (alive) setGrid({ sheet: sheetName ?? "", meta, error: !meta }); })
      .catch(() => { if (alive) setGrid({ sheet: sheetName ?? "", meta: null, error: true }); });
    return () => { alive = false; };
  }, [loadMeta, sheetName, retry]);
  const patchByCell = useMemo(() => new Map(patches.map(patch => [previewKey(patch), patch])), [patches]);
  const loadRows = useCallback(async (from: number, count: number, sheet?: string) => {
    const rows = await gridRows(from, count, sheet);
    return variant === "edited" ? rows : rows.map(row => ({ ...row, values: row.values.map((value, col) => patchByCell.get(previewKey({ sheet: sheet ?? meta?.sheet ?? "", row: row.r, col }))?.original ?? value) }));
  }, [gridRows, variant, patchByCell, meta?.sheet]);
  const sheet = useMemo<SheetData | null>(() => {
    if (!meta) return null;
    const bySheet: NonNullable<SheetData["bySheet"]> = {};
    for (const cell of all) {
      const entry = bySheet[cell.sheet] ??= { issueCells: new Map(), issueRows: [], open: 0, changes: new Map() };
      if (cell.before !== cell.after) {
        const cols = entry.changes!.get(cell.row) ?? new Set<number>();
        cols.add(cell.col); entry.changes!.set(cell.row, cols);
      }
      if (!cell.needsReview) continue;
      const cols = entry.issueCells.get(cell.row) ?? new Map<number, number>();
      cols.set(cell.col, 3); entry.issueCells.set(cell.row, cols);
      entry.issueRows.push({ row: cell.row, level: 3 }); entry.open++;
    }
    const own = bySheet[meta.sheet];
    return { meta, loadRows, loadSheetMeta: loadMeta, issueCells: own?.issueCells ?? new Map(), issueRows: own?.issueRows ?? [], changes: own?.changes, bySheet, epoch: 0 };
  }, [meta, all, loadRows, loadMeta]);
  const items = useMemo<GalleryItem[]>(() => cells.map(cell => ({
    issue: { id: cell.key, sheet: cell.sheet, row: cell.row, col: cell.col, column: columnLetters(cell.col), field: cell.field || columnLetters(cell.col), originalValue: cell.before },
    text: variant === "original" ? cell.before : cell.after, tone: cell.needsReview ? "red" : "plain",
  })), [cells, variant]);
  const selectCell = useCallback(async (row: number, col: number, sheet?: string) => {
    const name = sheet ?? meta?.sheet;
    if (!name) return;
    const key = previewKey({ sheet: name, row, col }), request = ++selectionRequest.current;
    if (all.some(cell => cell.key === key)) { setPicked(key); return; }
    try {
      const rows = await gridRows(row, 1, name);
      if (request !== selectionRequest.current) return;
      const value = rows[0]?.values[col] ?? "";
      setExtras(current => ({ ...current, [key]: { key, sheet: name, row, col, before: value, after: value, field: "", needsReview: false } })); setPicked(key);
    } catch { setError(t("Could not load this cell. Try again.")); }
  }, [all, gridRows, meta?.sheet, t]);
  const draft = selected ? drafts[selected.key] ?? selected.after : "";
  const dirty = Object.keys(drafts).length > 0;
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function clearDraft(key: string) { setDrafts(current => { const next = { ...current }; delete next[key]; return next; }); }
  function updateDraft(value: string) {
    if (!selected) return;
    if (value === selected.after) clearDraft(selected.key);
    else setDrafts(current => ({ ...current, [selected.key]: value }));
  }
  async function save() {
    if (!selected || !ready || engine.busy) return;
    const response = await engine.edit([{ sheet: selected.sheet, row: selected.row, col: selected.col, value: draft, source: "typed" }]);
    if (response?.type !== "view") { setError(t("The edit was not saved. Your draft is still here.")); return; }
    clearDraft(selected.key); setError(""); notify(t("Change saved in preview"));
  }
  async function approveExport() {
    if (!ready || dirty || engine.busy || exporting || approvedView !== view) return;
    setExporting(true); setError("");
    const revision = view;
    try {
      const made = await engine.exportXlsx();
      if (currentView.current !== revision) throw new Error(t("The preview changed. Review it again before exporting."));
      if (!made?.ok) throw new Error(t("Export verification failed. No file was downloaded."));
      downloadBlob(made.fileName, made.blob); setDownloadedView(revision);
      notify(t("Downloaded {0}", [made.fileName]));
    } catch (error) { setError(error instanceof Error ? error.message : t("Export failed. Your changes are still here.")); }
    finally { setExporting(false); }
  }
  const pending = all.filter(cell => cell.needsReview).length;
  const predictions = useMemo(() => selected ? wordsOfChange(selected.before, selected.after) : [], [selected]);
  const locked = engine.busy || exporting || !ready;

  return <div className="fp" aria-busy={!current || exporting}>
    <header className="fp-header"><div><span className="fp-eyebrow">{t("Final preview")}</span><h3>{t("Your workbook, before you export")}</h3><p>{t("Compare the original and edited values. Click a cell to review it; only Expand opens fullscreen.")}</p></div><span className="fp-badge">{t(downloadedView === view ? "Downloaded" : "Not exported")}</span></header>
    <dl className="fp-facts"><div><dt>{t("Worksheets")}</dt><dd>{result.sheetScans.length}</dd></div><div><dt>{t("Changed cells")}</dt><dd>{ready ? patches.length.toLocaleString() : "…"}</dd></div><div data-warning={pending > 0 || undefined}><dt>{t("Cells needing review")}</dt><dd>{pending.toLocaleString()}</dd></div></dl>
    {ready && !patches.length && <p className="fp-message" role="status">{t("This preview has no changed cells. Export will contain the original values.")}</p>}
    {(!current || current && snapshot.error) && <div className="fp-message" role={current ? "alert" : "status"}>{current ? snapshot.error : t("Loading the latest workbook changes…")}{current && <Button variant="secondary" size="sm" onClick={() => setRetry(value => value + 1)}>{t("Retry")}</Button>}</div>}
    <div className="fp-options">
      <div className="fp-segment" role="group" aria-label={t("Workbook version")}>{(["original", "edited"] as const).map(value => <button type="button" key={value} aria-pressed={variant === value} onClick={() => setVariant(value)}>{t(value === "original" ? "Original file" : "Edited preview")}</button>)}</div>
      <label className="fp-filter"><span>{t("Show cells")}</span><select value={filter} onChange={event => { setFilter(event.target.value as typeof filter); setPicked(""); }}><option value="all">{t("All changes and issues")}</option><option value="changed">{t("Changed cells")}</option><option value="review">{t("Needs review")}</option></select></label>
      <span className="fp-legend"><i />{t("Changed")}<i data-warning />{t("Needs review")}</span>
    </div>
    {grid?.sheet === sheetName && grid.error && <div className="fp-message" role="alert">{t("Could not load the worksheet.")}<Button variant="secondary" size="sm" onClick={() => setRetry(value => value + 1)}>{t("Retry")}</Button></div>}
    {ready && <IssueGallery items={items} index={index} onIndex={index => { if (cells[index]) setPicked(cells[index].key); }} sheet={sheet} onSelectCell={(row, col, sheet) => { void selectCell(row, col, sheet); }} override={selected && variant === "edited" && drafts[selected.key] !== undefined ? draft : undefined} />}
    {ready && !meta && !grid?.error && <p role="status">{t("Loading worksheet…")}</p>}
    <AnimatePresence mode="wait" initial={false}>{selected && ready && <motion.section key={selected.key} className="fp-editor" initial={reduce ? false : { opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={reduce ? { duration: 0 } : { duration: .16, ease: [...motionTokens.ease.enter] }}>
      <header><h4>{selected.sheet} · {columnLetters(selected.col)}{selected.row}</h4><span className="fp-badge" data-warning={selected.needsReview || undefined}>{t(selected.needsReview ? "Needs review" : selected.before !== selected.after ? "Changed" : "Unchanged")}</span></header>
      <div className="fp-comparison"><div><label htmlFor="fp-original">{t("Original value")}</label><textarea id="fp-original" value={selected.before} readOnly spellCheck={false} /></div><div><label htmlFor="fp-edited">{t("Edited value")}</label><textarea id="fp-edited" value={draft} onChange={event => updateDraft(event.target.value)} disabled={locked} spellCheck={false} maxLength={32767} aria-describedby="fp-draft-hint" /></div></div>
      <div className="fp-edit-actions"><p id="fp-draft-hint">{t("Saving changes only updates this preview. The original workbook is preserved.")}</p><Button variant="ghost" size="sm" disabled={locked || draft === selected.before} onClick={() => updateDraft(selected.before)}><RotateCcw size={14} />{t("Restore original")}</Button><Button variant="secondary" size="sm" disabled={locked || drafts[selected.key] === undefined} onClick={() => clearDraft(selected.key)}>{t("Discard draft")}</Button><Button variant="primary" size="sm" disabled={locked || drafts[selected.key] === undefined} onClick={() => void save()}><Check size={14} />{t("Save cell")}</Button></div>
      <SpeculativeRun key={`${selected.key}:${selected.after}`} predictions={predictions} picks={{}} text={selected.after} variant="preview" title="Before and after" />
    </motion.section>}</AnimatePresence>
    {pending > 0 && <p className="fp-warning" role="status">{t("{0} cells still need review. Export includes their current values; it does not certify that they are correct.", [pending])}</p>}
    {dirty && <p className="fp-warning" role="status">{t("{0} unsaved cell drafts. Save or discard them before leaving or exporting.", [Object.keys(drafts).length])}</p>}
    <label className="fp-approval"><input type="checkbox" checked={approvedView === view} disabled={locked || dirty} onChange={event => setApprovedView(event.target.checked ? view : null)} /><span>{t("I reviewed this version and approve exporting it, including any remaining issues.")}</span></label>
    {error && <p className="fp-warning" role="alert">{error}</p>}
    {downloadedView === view && <p className="fp-success" role="status"><Check size={15} />{t("This version passed export verification and was downloaded.")}</p>}
    <div className="fp-floating"><FloatingButtonGroup label={t("Preview actions")} actions={[
      { id: "undo", label: t("Undo"), icon: <Undo2 size={16} />, disabled: locked || dirty || !view.canUndo, onClick: () => { void engine.undo(); } },
      { id: "redo", label: t("Redo"), icon: <Redo2 size={16} />, disabled: locked || dirty || !view.canRedo, onClick: () => { void engine.redo(); } },
      { id: "review", label: t("Review remaining issues"), icon: <ListChecks size={16} />, disabled: locked || dirty, onClick: onReview },
      { id: "export", label: t(exporting ? "Verifying export…" : "Approve and export"), icon: <Download size={16} />, primary: true, disabled: locked || dirty || approvedView !== view || !meta, onClick: () => { void approveExport(); } },
    ]} /></div>
  </div>;
}
