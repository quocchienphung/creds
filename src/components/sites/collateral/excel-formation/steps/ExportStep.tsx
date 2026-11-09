"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "motion/react";
import { AlertTriangle, Check, ChevronDown, ChevronUp, Download, ListChecks, Redo2, RotateCcw, Undo2, X } from "lucide-react";
import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { Button } from "../../../uiarc/button/Button";
import { FloatingButtonGroup } from "../../../uiarc/floating-button-group/FloatingButtonGroup";
import { ExpandingButtonGroup } from "../../../uiarc/expanding-button-group/ExpandingButtonGroup";
import { PlayPauseIcon } from "../../../uiarc/icon-morph/IconMorph";
import SegmentedControl from "../../../uiarc/segmented-control/SegmentedControl";
import { motionTokens } from "../../../uiarc/motion-tokens";
import type { CollateralEngine } from "../../useCollateralEngine";
import type { GridMeta, ReviewView } from "../../engine/protocol";
import type { Patch } from "../engine/review";
import type { ResidualReport } from "../engine/residual";
import { RemainingOutline } from "../RemainingOutline";
import { columnLetters } from "../engine/text";
import { wordsOfChange } from "../engine/applied-change";
import { SheetViewer, type SheetData } from "../gallery/SheetViewer";
import "../gallery/sheet-viewer.css";
import { wordDiff, type DiffPart } from "../word-diff";
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
  // What is still wrong in what would be exported, read again after every change; the last result stays on screen while the next scan runs.
  const [scanned, setScanned] = useState<{ view: ReviewView; report: ResidualReport | null; error: string } | null>(null), [scanTick, setScanTick] = useState(0);
  const { residual: scanResidual } = engine;
  useEffect(() => {
    let alive = true;
    void scanResidual().then(report => { if (alive) setScanned({ view, report, error: report ? "" : "scan" }); })
      .catch(error => { if (alive) setScanned({ view, report: null, error: error instanceof Error ? error.message : "scan" }); });
    return () => { alive = false; };
  }, [scanResidual, view, scanTick]);
  const residualReport = scanned?.report ?? null, scanning = scanned?.view !== view;
  /** Every cell that needs a decision: the ones the review found plus the ones the scan of the current values found. */
  const problems = useMemo(() => {
    const found = new Map<string, { key: string; sheet: string; row: number; col: number }>();
    for (const cell of all) if (cell.needsReview) found.set(cell.key, cell);
    for (const item of residualReport?.items ?? []) { const key = previewKey(item); if (!found.has(key)) found.set(key, { key, sheet: item.sheet, row: item.row, col: item.col }); }
    return [...found.values()].sort((a, b) => a.sheet.localeCompare(b.sheet) || a.row - b.row || a.col - b.col);
  }, [all, residualReport]);
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
    }
    for (const cell of problems) {
      const entry = bySheet[cell.sheet] ??= { issueCells: new Map(), issueRows: [], open: 0, changes: new Map() };
      const cols = entry.issueCells.get(cell.row) ?? new Map<number, number>();
      cols.set(cell.col, 3); entry.issueCells.set(cell.row, cols);
      entry.issueRows.push({ row: cell.row, level: 3 }); entry.open++;
    }
    const own = bySheet[meta.sheet];
    return { meta, loadRows, loadSheetMeta: loadMeta, issueCells: own?.issueCells ?? new Map(), issueRows: own?.issueRows ?? [], changes: own?.changes, bySheet, epoch: 0 };
  }, [meta, all, problems, loadRows, loadMeta]);
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
    if (!selected || !ready || engine.busy) return false;
    const response = await engine.edit([{ sheet: selected.sheet, row: selected.row, col: selected.col, value: draft, source: "typed" }]);
    if (response?.type !== "view") { setError(t("The edit was not saved. Your draft is still here.")); return false; }
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
  const reviewCells = all.filter(cell => cell.needsReview).length;
  // The scan lists at most a fixed number of cells; the rest are counted, not listed.
  const pending = problems.length + (residualReport?.truncated ? residualReport.total - residualReport.items.length : 0);
  const predictions = useMemo(() => selected ? wordsOfChange(selected.before, selected.after) : [], [selected]);
  const locked = engine.busy || exporting || !ready;

  const [narrow, setNarrow] = useState(false);
  useEffect(() => { const query = window.matchMedia("(max-width: 640px)"), sync = () => setNarrow(query.matches); sync(); query.addEventListener("change", sync); return () => query.removeEventListener("change", sync); }, []);
  const [replay, setReplay] = useState(false);
  useEffect(() => { setReplay(false); }, [selected?.key]);
  const changedCount = all.filter(cell => cell.before !== cell.after).length;
  // What the file will hold: every patch, whether the repair or a person wrote it (cleaning and bulk fixes are automatic too).
  const automatic = patches.filter(patch => patch.source.startsWith("auto") || patch.source === "bulk").length;
  const diff = useMemo(() => selected ? wordDiff(selected.before, draft) : null, [selected, draft]);
  // A draft is saved as soon as the person leaves its cell (another cell, another issue, a click elsewhere): what was typed is never left behind unsaved.
  const flush = () => selected && drafts[selected.key] !== undefined ? save() : Promise.resolve(undefined);
  const move = (delta: number) => { void flush().then(() => { const next = cells[(index + delta + cells.length) % cells.length]; if (next) setPicked(next.key); }); };
  const ease = [...motionTokens.ease.enter] as [number, number, number, number];
  const group: Variants = { hidden: {}, show: { transition: { staggerChildren: reduce ? 0 : .07, delayChildren: .04 } } };
  const block: Variants = reduce ? { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: .12 } } }
    : { hidden: { opacity: 0, y: 14, filter: "blur(4px)" }, show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: .52, ease } } };
  const nextProblem = () => {
    const next = problems[(problems.findIndex(cell => cell.key === selected?.key) + 1) % Math.max(1, problems.length)];
    if (next && next.key !== selected?.key) void selectCell(next.row, next.col, next.sheet);
  };
  // "Review remaining issues": scan now, in this step, and open the first cell that needs a decision.
  const reviewHere = () => { setScanTick(value => value + 1); if (!problems.some(cell => cell.key === selected?.key)) nextProblem(); };
  const status = selected ? t(selected.needsReview ? "Needs review" : selected.before !== selected.after ? "Changed" : "Unchanged") : "";

  return <motion.div className="fp" aria-busy={!current || exporting} variants={group} initial="hidden" animate="show">
    <motion.header className="fp-header" variants={block}><div><span className="fp-eyebrow">{t("Final preview")}</span><h3>{t("Your workbook, before you export")}</h3><p>{t("Compare the original and edited values. Click a cell to review it; only Expand opens fullscreen.")}</p></div><span className="fp-badge" data-done={downloadedView === view || undefined}><Count value={t(downloadedView === view ? "Downloaded" : "Not exported")} /></span></motion.header>
    <motion.dl className="fp-facts" variants={block}>
      <div><dt>{t("Worksheets")}</dt><dd><Count value={String(result.sheetScans.length)} /></dd></div>
      <div><dt>{t("Changed cells")}</dt><dd><Count value={ready ? changedCount.toLocaleString() : "…"} /></dd></div>
      <div data-warning={pending > 0 || undefined}><dt>{t("Cells needing review")}</dt><dd><Count value={pending.toLocaleString()} /></dd></div>
    </motion.dl>
    {ready && !patches.length && <p className="fp-message" role="status">{t("This preview has no changed cells. Export will contain the original values.")}</p>}
    {(!current || current && snapshot.error) && <div className="fp-message" role={current ? "alert" : "status"}>{current ? snapshot.error : t("Loading the latest workbook changes…")}{current && <Button variant="secondary" size="sm" onClick={() => setRetry(value => value + 1)}>{t("Retry")}</Button>}</div>}
    <motion.div className="fp-options" variants={block}>
      <SegmentedControl label={t("Workbook version")} value={variant} onValueChange={value => setVariant(value as typeof variant)} options={[{ value: "original", label: t("Original file") }, { value: "edited", label: t("Edited preview") }]} />
      <SegmentedControl label={t("Show cells")} value={filter} onValueChange={value => { setFilter(value as typeof filter); setPicked(""); }} options={[
        { value: "all", label: t("All"), accessory: <span className="fp-pill">{all.length.toLocaleString()}</span> },
        { value: "changed", label: t("Changed"), accessory: <span className="fp-pill">{changedCount.toLocaleString()}</span> },
        { value: "review", label: t("Needs review"), accessory: <span className="fp-pill" data-warning={reviewCells > 0 || undefined}>{reviewCells.toLocaleString()}</span> },
      ]} />
      <span className="fp-legend"><i />{t("Changed")}<i data-warning />{t("Needs review")}</span>
    </motion.div>
    {grid?.sheet === sheetName && grid.error && <div className="fp-message" role="alert">{t("Could not load the worksheet.")}<Button variant="secondary" size="sm" onClick={() => setRetry(value => value + 1)}>{t("Retry")}</Button></div>}
    <div className="fp-work" data-outline>
      <RemainingOutline report={residualReport} scanning={scanning} error={scanned?.error ? (scanned.error === "scan" ? t("Could not scan the workbook.") : scanned.error) : ""} activeKey={selected?.key ?? ""} disabled={exporting}
        onPick={item => { void flush().then(() => selectCell(item.row, item.col, item.sheet)); }} onScan={() => setScanTick(value => value + 1)} onReview={onReview} onFill={() => { void flush().then(() => engine.fillRemaining()); }} />
      <motion.section className="fp-sheet" variants={block} aria-label={t("Worksheet preview")} data-variant={variant}>
        {ready && sheet && meta
          ? <SheetViewer data={sheet} target={{ row: selected?.row ?? 1, col: selected?.col ?? 0, value: selected ? (variant === "edited" ? draft : selected.before) : "", preview: !!selected && variant === "edited" && drafts[selected.key] !== undefined }} mode="readable" onSelectCell={(row, col, name) => { void flush().then(() => selectCell(row, col, name)); }} />
          : <div className="fp-skeleton" role="status" aria-label={t("Loading worksheet…")}><i /><i /><i /><i /></div>}
      </motion.section>
      <motion.aside className="fp-inspector" variants={block} aria-label={t("Cell inspector")}>
        <header className="fp-inspector__top">
          <span className="fp-inspector__label">{t("Cell inspector")}</span>
          <span className="fp-nav" role="group" aria-label={t("Move between cells")}>
            <button type="button" aria-label={t("Previous cell")} disabled={locked || cells.length < 2} onClick={() => move(-1)}><ChevronUp size={15} aria-hidden="true" /></button>
            <span className="fp-nav__count" aria-live="polite"><Count value={cells.length ? `${index + 1} / ${cells.length}` : "0 / 0"} /></span>
            <button type="button" aria-label={t("Next cell")} disabled={locked || cells.length < 2} onClick={() => move(1)}><ChevronDown size={15} aria-hidden="true" /></button>
          </span>
        </header>
        <AnimatePresence mode="popLayout" initial={false}>
          {selected && ready ? <motion.div className="fp-inspector__body" key={selected.key} initial={reduce ? false : { opacity: 0, y: 8, filter: "blur(3px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: reduce ? 0 : -6 }} transition={reduce ? { duration: 0 } : { duration: .3, ease }}>
            <div className="fp-cellname"><h4>{selected.sheet} · {columnLetters(selected.col)}{selected.row}</h4><span className="fp-badge" data-warning={selected.needsReview || undefined} data-changed={(!selected.needsReview && selected.before !== selected.after) || undefined}>{status}</span></div>
            <div className="fp-field"><span className="fp-field__label">{t("Original value")}</span><p className="fp-field__text" data-readonly><Marked parts={diff?.before ?? []} tone="removed" />{!selected.before && <em>{t("(empty)")}</em>}</p></div>
            <div className="fp-field"><label className="fp-field__label" htmlFor="fp-edited">{t("Edited value")}</label>
              <textarea id="fp-edited" value={draft} onChange={event => updateDraft(event.target.value)} onBlur={() => { void flush(); }} disabled={locked} spellCheck={false} maxLength={32767} aria-describedby="fp-draft-hint" />
              {draft !== selected.before && <p className="fp-field__text" data-diff aria-label={t("Words changed")}><Marked parts={diff?.after ?? []} tone="added" /></p>}</div>
            <div className="fp-edit-actions"><ExpandingButtonGroup label={t("Cell actions")} defaultExpanded="save" items={[
              { id: "restore", label: t("Restore original"), icon: <RotateCcw />, disabled: locked || draft === selected.before, onSelect: () => { updateDraft(selected.before); } },
              { id: "discard", label: t("Discard draft"), icon: <X />, disabled: locked || drafts[selected.key] === undefined, onSelect: () => { clearDraft(selected.key); } },
              { id: "save", label: t("Save cell"), doneLabel: t("Saved"), icon: <Check />, disabled: locked || drafts[selected.key] === undefined, onSelect: () => save() },
            ]} /></div>
            <p id="fp-draft-hint" className="fp-hint">{t("Saving changes only updates this preview. The original workbook is preserved.")}</p>
            {predictions.some(word => word.broken) && <button type="button" className="fp-replay-toggle" aria-expanded={replay} onClick={() => setReplay(value => !value)}><PlayPauseIcon state={replay} size={14} />{t(replay ? "Hide replay" : "Replay the change")}</button>}
            <AnimatePresence initial={false}>{replay && <motion.div className="fp-replay" key="replay" initial={reduce ? false : { height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={reduce ? { duration: 0 } : motionTokens.spring.smooth}>
              <SpeculativeRun key={`${selected.key}:${selected.after}`} predictions={predictions} picks={{}} text={selected.after} variant="preview" title="Before and after" />
            </motion.div>}</AnimatePresence>
          </motion.div> : <motion.p className="fp-inspector__empty" key="empty" role="status" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>{t(ready ? "Pick a cell on the sheet to compare it here." : "Loading worksheet…")}</motion.p>}
        </AnimatePresence>
      </motion.aside>
    </div>
    <motion.div className="fp-notes" variants={block}>
      {ready && patches.length > 0 && <p className="fp-hint" role="status">{t("The exported file holds all {0} corrected cells: {1} automatic and {2} typed by you.", [patches.length.toLocaleString(), automatic.toLocaleString(), (patches.length - automatic).toLocaleString()])}</p>}
      {pending > 0 && <p className="fp-warning" role="status">{t("{0} cells still need review. Export includes their current values; it does not certify that they are correct.", [pending])}</p>}
      {dirty && <p className="fp-warning" role="status">{t("{0} unsaved cell drafts. Save or discard them before leaving or exporting.", [Object.keys(drafts).length])}</p>}
      <label className="fp-approval" data-checked={approvedView === view || undefined}><input type="checkbox" checked={approvedView === view} disabled={locked || dirty} onChange={event => setApprovedView(event.target.checked ? view : null)} /><span className="fp-approval__box" aria-hidden="true"><Check size={13} /></span><span>{t("I reviewed this version and approve exporting it, including any remaining issues.")}</span></label>
      {error && <p className="fp-warning" role="alert">{error}</p>}
      {downloadedView === view && <p className="fp-success" role="status"><Check size={15} />{t("This version passed export verification and was downloaded.")}</p>}
    </motion.div>
    <motion.div className="fp-floating" initial={reduce ? false : { opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} transition={reduce ? { duration: 0 } : { ...motionTokens.spring.smooth, delay: .4 }}>
      <FloatingButtonGroup variant="floating" label={t("Preview actions")} items={[
        { id: "undo", label: t("Undo"), icon: <Undo2 />, iconOnly: true, disabled: locked || dirty || !view.canUndo, onSelect: () => { void engine.undo(); } },
        { id: "redo", label: t("Redo"), icon: <Redo2 />, iconOnly: true, disabled: locked || dirty || !view.canRedo, onSelect: () => { void engine.redo(); } },
        { type: "separator" },
        { id: "next", label: t("Next to review"), icon: <AlertTriangle />, iconOnly: true, disabled: locked || !problems.some(cell => cell.key !== selected?.key), onSelect: () => { void flush().then(nextProblem); } },
        { id: "review", label: t("Review remaining issues"), icon: <ListChecks />, iconOnly: narrow, disabled: locked, onSelect: () => { void flush().then(reviewHere); } },
        { id: "export", label: t(exporting ? "Verifying export…" : "Approve and export"), reserveLabels: [t("Approve and export"), t("Verifying export…")], icon: <Download />, iconOnly: false, primary: true, disabled: locked || dirty || approvedView !== view || !meta, onSelect: () => { void approveExport(); } },
      ]} />
    </motion.div>
  </motion.div>;
}

/** A value that crossfades in place with a small rise and blur when it changes; the box keeps its place. */
function Count({ value }: { value: string }) {
  const reduce = useReducedMotion();
  return <span className="fp-swap"><AnimatePresence mode="popLayout" initial={false}><motion.span key={value}
    initial={reduce ? false : { opacity: 0, y: 6, filter: "blur(3px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: reduce ? 0 : -6, filter: reduce ? "blur(0px)" : "blur(3px)" }}
    transition={{ duration: reduce ? .01 : .26, ease: [...motionTokens.ease.enter] as [number, number, number, number] }}>{value}</motion.span></AnimatePresence></span>;
}
function Marked({ parts, tone }: { parts: DiffPart[]; tone: "removed" | "added" }) {
  return <>{parts.map((part, i) => part.changed ? <mark key={i} data-tone={tone}>{part.text}</mark> : <span key={i}>{part.text}</span>)}</>;
}
