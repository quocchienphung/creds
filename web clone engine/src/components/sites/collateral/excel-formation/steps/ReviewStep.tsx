"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Copy, Download, Maximize2, Redo2, RotateCcw, Undo2, Upload, Wand2 } from "lucide-react";
import { OrbitMenu } from "../../../orbit-menu/OrbitMenu";
import type { OrbitBoundary, OrbitPoint } from "../../../orbit-menu/orbit-geometry";
import { Combobox, type ComboboxOption } from "../../../affectui-combobox/Combobox";
import { WorkspaceDialog } from "../../../affectui-crm/WorkspaceDialog";
import type { Issue, IssueCategory, IssueStatus, FixKind, Severity } from "../engine/types";
import type { BulkItem } from "../engine/review";
import { MAU9_PROFILE } from "../engine/mapping-profiles";
import { IssueGallery, type GalleryItem } from "../gallery/IssueGallery";
import type { GridMeta } from "../../engine/protocol";
import type { SheetData } from "../gallery/SheetViewer";
import { IssueDetails, type Twin, type Variant } from "../IssueDetails";
import { IssueTable, type SortKey, type SortState, type TableRow } from "../IssueTable";
import { CATEGORIES, CATEGORY_LABEL, SEVERITIES, SEVERITY_LABEL, severityTone } from "../../labels";
import type { CollateralEngine } from "../../useCollateralEngine";
import type { ReviewFilters } from "../review-filters";
import { downloadBlob } from "../../download";

const BULK: { kind: FixKind; label: string; hint: string }[] = [
  { kind: "trim", label: "Trim spaces at the edges", hint: "Removes spaces before and after the text." },
  { kind: "collapse-spaces", label: "Collapse repeated spaces", hint: "Turns several spaces in a row into one (names and codes only)." },
  { kind: "normalize-space-chars", label: "Replace unusual spaces", hint: "Non-breaking and other special spaces become a normal space." },
  { kind: "strip-invisible", label: "Remove zero-width characters", hint: "Deletes invisible characters that carry no letter." },
];
const doneStatus = (status: IssueStatus) => status === "verified" || status === "accepted_exception";

export function ReviewStep({ engine, filters, onFilters, notify }: { engine: CollateralEngine; filters: ReviewFilters; onFilters: (filters: ReviewFilters) => void; notify: (message: string) => void }) {
  const { t: uiText } = useWorkspaceI18n();
  const result = engine.result!, view = engine.view!;
  const all = useMemo(() => [...result.issues, ...view.introduced], [result.issues, view.introduced]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [variant, setVariant] = useState<Variant>("original");
  const [sort, setSort] = useState<SortState>({ key: "row", dir: "asc" });
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkKind, setBulkKind] = useState<FixKind | null>(null);
  const [bulkItems, setBulkItems] = useState<BulkItem[]>([]);
  const [bulkCounts, setBulkCounts] = useState<Partial<Record<FixKind, number>>>({});
  const lastIndex = useRef(0);
  const [gridMeta, setGridMeta] = useState<GridMeta | null>(null);
  // The values behind the sheet change with every edit, undo or redo: a new review view means the rows are read again.
  const [seenView, setSeenView] = useState(view);
  const [epoch, setEpoch] = useState(0);
  if (seenView !== view) { setSeenView(view); setEpoch(current => current + 1); }
  const [viewerRequest, setViewerRequest] = useState(0);
  const [orbit, setOrbit] = useState<{ at: OrbitPoint; boundary: OrbitBoundary; theme?: string; motionOff: boolean; open: boolean } | null>(null);
  const detailsRef = useRef<HTMLDivElement>(null);

  const stateOf = useCallback((issue: Issue) => view.states[issue.id], [view.states]);
  const rows: TableRow[] = useMemo(() => {
    const query = filters.query.trim().toLowerCase();
    const out: TableRow[] = [];
    for (const issue of all) {
      const state = view.states[issue.id];
      const status: IssueStatus = state?.status ?? "open";
      if (!filters.severities.includes(issue.severity)) continue;
      if (filters.status === "todo" ? doneStatus(status) : filters.status === "done" ? !doneStatus(status) : false) continue;
      if (filters.category && issue.category !== filters.category) continue;
      if (filters.field && issue.field !== filters.field) continue;
      if (query && !(`${issue.column}${issue.row}`.toLowerCase() === query || String(issue.row) === query || issue.originalValue.toLowerCase().includes(query))) continue;
      const current = state?.correctedValue ?? issue.originalValue;
      out.push({ issue, status, current, edited: current !== issue.originalValue });
    }
    // Row order is the sheet order the issues arrive in; any other key is a stable sort on top of it.
    const RANK = { critical: 0, high: 1, medium: 2, low: 3 } as const, STATE = { open: 0, edited: 1, verified: 2, accepted_exception: 3 } as const;
    const keyOf = (row: TableRow) => sort.key === "severity" ? RANK[row.issue.severity] : sort.key === "status" ? STATE[row.status] : sort.key === "field" ? row.issue.field : sort.key === "problem" ? row.issue.category : row.issue.row;
    if (sort.key !== "row" || sort.dir === "desc") out.sort((a, b) => { const x = keyOf(a), y = keyOf(b); const c = x < y ? -1 : x > y ? 1 : 0; return sort.dir === "asc" ? c : -c; });
    return out;
  }, [all, view.states, filters, sort]);

  // Keep a valid selection: stay on the same issue, or fall to the neighbour when it leaves the list (for example once approved).
  const found = rows.findIndex(row => row.issue.id === selectedId);
  const index = found >= 0 ? found : Math.min(lastIndex.current, rows.length - 1);
  useEffect(() => { if (found >= 0) lastIndex.current = found; else if (rows[index]) setSelectedId(rows[index].issue.id); }, [found, index, rows]);
  const selected = rows[index];
  const { gridMeta: loadGridMeta, gridRows } = engine;
  useEffect(() => {
    let alive = true;
    void loadGridMeta().then(meta => { if (alive && meta) setGridMeta(meta); }).catch(() => {});
    return () => { alive = false; };
  }, [loadGridMeta, result.fileHash]);
  const select = useCallback((at: number) => { const row = rows[at]; if (row) { setSelectedId(row.issue.id); setVariant("original"); } }, [rows]);

  // Every issue still open, by cell, for the tint of the sheet and the map along its edge.
  const sheet = useMemo<SheetData | null>(() => {
    if (!gridMeta) return null;
    const issueCells = new Map<number, Map<number, number>>(), issueRows: { row: number; level: number }[] = [];
    const level = { critical: 4, high: 3, medium: 2, low: 1 } as const;
    for (const issue of all) {
      const status = view.states[issue.id]?.status ?? "open";
      if (doneStatus(status)) continue;
      let cols = issueCells.get(issue.row);
      if (!cols) issueCells.set(issue.row, cols = new Map());
      cols.set(issue.col, Math.max(cols.get(issue.col) ?? 0, level[issue.severity]));
      issueRows.push({ row: issue.row, level: level[issue.severity] });
    }
    return { meta: gridMeta, loadRows: gridRows, loadSheetMeta: loadGridMeta, issueCells, issueRows, epoch };
  }, [gridMeta, gridRows, loadGridMeta, all, view.states, epoch]);
  const selectCell = useCallback((row: number, col: number) => { const at = rows.findIndex(item => item.issue.row === row && item.issue.col === col); if (at >= 0) select(at); }, [rows, select]);
  const items: GalleryItem[] = useMemo(() => rows.map(row => ({ issue: row.issue, text: row.current, tone: severityTone(row.issue.severity) as GalleryItem["tone"] })), [rows]);
  const suggestionOf = (issue: Issue) => issue.suggestions?.[0]?.value ?? issue.proposedValue;
  const draft = selected ? drafts[selected.issue.id] ?? selected.current : "";
  const shown = selected ? (variant === "original" ? selected.issue.originalValue : variant === "suggested" ? suggestionOf(selected.issue) ?? selected.issue.originalValue : draft) : "";

  const twin: Twin | undefined = useMemo(() => {
    if (!selected) return undefined;
    const pair = MAU9_PROFILE.descriptionPair;
    if (!pair || (selected.issue.field !== pair.primary && selected.issue.field !== pair.secondary)) return undefined;
    const other = selected.issue.field === pair.primary ? pair.secondary : pair.primary;
    const match = all.find(issue => issue.row === selected.issue.row && issue.field === other && issue.category === selected.issue.category);
    return match ? { issue: match, sameText: match.originalValue === selected.issue.originalValue } : undefined;
  }, [selected, all]);

  const categoryOptions: ComboboxOption[] = useMemo(() => [{ value: "", label: uiText("All problems") }, ...CATEGORIES.filter(category => all.some(issue => issue.category === category)).map(category => ({ value: category, label: uiText(CATEGORY_LABEL[category]) }))], [all, uiText]);
  const fieldOptions: ComboboxOption[] = useMemo(() => [{ value: "", label: uiText("All columns"), localize: true }, ...[...new Set(all.map(issue => issue.field))].sort().map(field => ({ value: field, label: field, localize: false }))], [all, uiText]);
  const toggleSeverity = (severity: Severity) => onFilters({ ...filters, severities: filters.severities.includes(severity) ? filters.severities.filter(item => item !== severity) : [...filters.severities, severity] });

  // Shortcuts that do not fight with typing.
  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      const typing = event.target instanceof HTMLElement && (event.target.tagName === "TEXTAREA" || event.target.tagName === "INPUT" || event.target.isContentEditable);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z" && !typing) { event.preventDefault(); void (event.shiftKey ? engine.redo() : engine.undo()); }
    };
    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
  }, [engine]);

  const resumeInput = useRef<HTMLInputElement>(null);
  async function saveProgress() {
    if (!window.confirm("This progress file includes original and corrected cell text and exception reasons. It may contain sensitive data. Export this local file?")) return;
    const saved = await engine.saveProgress();
    if (!saved) return;
    downloadBlob(saved.fileName, saved.blob);
    notify(uiText("Progress saved: {0} corrections. Keep the file next to your workbook.", [saved.patches]));
  }
  async function resumeProgress(file: File) {
    const outcome = await engine.loadProgress(file);
    if (outcome.ok) {
      notify(outcome.matches ? uiText("Resumed {0} corrections and {1} exceptions. Undo goes back.", [outcome.patches, outcome.exceptions]) : uiText("Resumed {0} corrections, but the counts differ from the saved file: check the review.", [outcome.patches]));
      return;
    }
    notify(outcome.error === "other-file" ? uiText("This progress belongs to another workbook. Nothing was changed.")
      : outcome.error === "changed-cell" ? uiText("A cell of this workbook is not what the progress started from (row {0}). Nothing was changed.", [outcome.at?.row ?? 0])
      : outcome.error === "version" ? uiText("This progress file is from another version. Nothing was changed.")
      : outcome.error === "too-large" ? uiText("This file is too large to be a progress file.")
      : outcome.error === "not-progress" ? uiText("This is not a progress file.") : uiText("This progress file is damaged. Nothing was changed."));
  }
  async function openBulk() {
    setBulkOpen(true); setBulkKind(null); setBulkItems([]);
    const counts: Partial<Record<FixKind, number>> = {};
    for (const entry of BULK) counts[entry.kind] = (await engine.bulkPlan(entry.kind)).length;
    setBulkCounts(counts);
  }
  async function previewBulk(kind: FixKind) { setBulkKind(kind); setBulkItems(await engine.bulkPlan(kind)); }
  async function applyBulk() {
    if (!bulkKind) return;
    const count = bulkItems.length;
    await engine.bulkApply(bulkKind);
    notify(uiText("{0} cells changed in one step. Undo restores them.", [count]));
    setBulkOpen(false);
  }

  const blocking = view.summary.blocking;
  return <div className="cr-review">
    <div className="cr-toolbar" role="toolbar" aria-label={uiText("Filters")}>
      <div className="cr-chips" role="group" aria-label={uiText("Severity")}>{SEVERITIES.map(severity => <button type="button" key={severity} className="cd-chip" aria-pressed={filters.severities.includes(severity)} onClick={() => toggleSeverity(severity)}>{uiText(SEVERITY_LABEL[severity])}<small>{all.filter(issue => issue.severity === severity).length}</small></button>)}</div>
      <div className="ui-seg" data-size="sm"><div className="ui-seg__scroller"><div className="ui-seg__track" role="radiogroup" aria-label={uiText("Show")}>{(["todo", "done", "all"] as const).map(value => <button type="button" key={value} className="ui-seg__opt" role="radio" aria-checked={filters.status === value} data-active={filters.status === value || undefined} tabIndex={filters.status === value ? 0 : -1} onClick={() => onFilters({ ...filters, status: value })}><span className="ui-seg__content"><span className="ui-seg__label"><span className="ui-seg__text">{uiText(value === "todo" ? "To review" : value === "done" ? "Done" : "All")}</span><span className="ui-seg__text ui-seg__text-bold" aria-hidden="true">{uiText(value === "todo" ? "To review" : value === "done" ? "Done" : "All")}</span></span></span></button>)}</div></div></div>
      <div className="cr-filter"><Combobox size="sm" aria-label={uiText("Problem")} options={categoryOptions} value={filters.category} onChange={value => onFilters({ ...filters, category: value as IssueCategory | "" })} searchable={false} /></div>
      <div className="cr-filter"><Combobox size="sm" aria-label={uiText("Column")} options={fieldOptions} value={filters.field} onChange={value => onFilters({ ...filters, field: value })} /></div>
      <input className="ui-sb-input cr-search" type="search" aria-label={uiText("Search by row, cell or text")} placeholder={uiText("Row, cell (AK45) or text")} value={filters.query} onChange={event => onFilters({ ...filters, query: event.target.value })} />
      <div className="cr-tools">
        <button type="button" className="ui-button" data-variant="ghost" data-size="sm" disabled={!view.canUndo || engine.busy} onClick={() => void engine.undo()} aria-label={uiText("Undo")} title={uiText("Undo (Ctrl+Z)")}><Undo2 size={15} /></button>
        <button type="button" className="ui-button" data-variant="ghost" data-size="sm" disabled={!view.canRedo || engine.busy} onClick={() => void engine.redo()} aria-label={uiText("Redo")} title={uiText("Redo (Ctrl+Shift+Z)")}><Redo2 size={15} /></button>
        <button type="button" className="ui-button" data-variant="ghost" data-size="sm" disabled={engine.busy || !(view.summary.patched > 0 || view.summary.exceptions > 0)} onClick={() => void saveProgress()} aria-label={uiText("Save progress")} title={uiText("Save progress as a small file; the workbook is not in it")}><Download size={15} /></button>
        <button type="button" className="ui-button" data-variant="ghost" data-size="sm" disabled={engine.busy} onClick={() => resumeInput.current?.click()} aria-label={uiText("Resume progress")} title={uiText("Resume progress from a saved file")}><Upload size={15} /></button>
        <input ref={resumeInput} type="file" accept=".json,application/json" hidden aria-label={uiText("Progress file")} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void resumeProgress(file); }} />
        <button type="button" className="ui-button" data-variant="secondary" data-size="sm" onClick={() => void openBulk()}><span className="ui-button__icon"><Wand2 size={15} /></span><span className="ui-button__label">{uiText("Bulk fixes")}</span></button>
      </div>
    </div>
    <p className="cr-status" role="status">{blocking > 0 ? uiText("{0} serious open", [blocking]) : uiText("No serious issue open")}</p>

    {selected ? <div ref={detailsRef}><IssueGallery items={items} index={index} onIndex={select} override={shown} sheet={sheet} onSelectCell={selectCell} viewerRequest={viewerRequest}
      details={<IssueDetails key={selected.issue.id} issue={selected.issue} status={selected.status} state={stateOf(selected.issue)} current={selected.current} variant={variant} onVariant={setVariant}
        onSkip={rows.length > 1 ? () => select((index + 1) % rows.length) : undefined} draft={draft} onDraft={value => setDrafts(current => ({ ...current, [selected.issue.id]: value }))} twin={twin} engine={engine} notify={notify}
        onApproved={() => { setVariant("original"); setDrafts(current => { const { [selected.issue.id]: removed, ...rest } = current; void removed; return rest; }); }} />} /></div>
      : <IssueGallery items={[]} index={0} onIndex={() => {}} sheet={sheet} />}

    <IssueTable onMenu={(at, point, element) => { select(at); setOrbit({ at: point, boundary: { left: 8, top: 8, right: window.innerWidth - 8, bottom: window.innerHeight - 8 }, theme: element.closest("[data-theme]")?.getAttribute("data-theme") ?? undefined, motionOff: element.closest('[data-ui-motion="off"]') !== null, open: false });
      // The fan is mounted closed and opened a frame later: a menu that mounts already open can miss its first opening.
      requestAnimationFrame(() => requestAnimationFrame(() => setOrbit(current => current ? { ...current, open: true } : current))); }} rows={rows} selected={rows.length ? index : -1} sort={sort} onSort={(key: SortKey) => setSort(current => ({ key, dir: current.key === key && current.dir === "asc" ? "desc" : "asc" }))} onSelect={select} onActivate={() => detailsRef.current?.querySelector<HTMLTextAreaElement>("textarea")?.focus()} />

    {orbit && selected && <OrbitMenu key="issue-menu" anchor={orbit.at} boundary={orbit.boundary} theme={orbit.theme} motionOff={orbit.motionOff} open={orbit.open} label={uiText("Actions for {0}", [`${selected.issue.column}${selected.issue.row}`])} triggerLabel={uiText("Close actions")} triggerSize={48}
      onOpenChange={open => setOrbit(current => current ? { ...current, open } : current)}
      actions={[
        { id: "suggest", label: uiText("Use suggestion"), icon: <Wand2 size={21} strokeWidth={1.8} />, hotkey: "S", disabled: !suggestionOf(selected.issue) },
        { id: "view", label: uiText("Open fullscreen"), icon: <Maximize2 size={21} strokeWidth={1.8} />, hotkey: "F" },
        { id: "copy", label: uiText("Copy cell"), icon: <Copy size={21} strokeWidth={1.8} />, hotkey: "C", done: uiText("Copied") },
        { id: "restore", label: uiText("Restore original"), icon: <RotateCcw size={21} strokeWidth={1.8} />, hotkey: "R", disabled: !selected.edited },
      ]}
      onAction={async id => {
        if (id === "suggest") { const value = suggestionOf(selected.issue); if (value !== undefined) { setDrafts(current => ({ ...current, [selected.issue.id]: value })); setVariant("suggested"); } }
        else if (id === "view") setViewerRequest(count => count + 1);
        else if (id === "copy") await navigator.clipboard.writeText(`${selected.issue.column}${selected.issue.row}`);
        else if (id === "restore") { setDrafts(current => { const { [selected.issue.id]: removed, ...rest } = current; void removed; return rest; }); setVariant("original"); await engine.edit([{ row: selected.issue.row, col: selected.issue.col, value: selected.issue.originalValue }]); }
      }} />}
    <WorkspaceDialog open={bulkOpen} title={uiText("Bulk fixes")} onClose={() => setBulkOpen(false)} wide>
      <div className="settings-dialog-form cr-bulk">
        <p className="ui-sb-muted">{uiText("Exact text changes only. One Undo restores them all.")}</p>
        <ul className="cr-bulk__list">{BULK.map(entry => <li key={entry.kind}><button type="button" className="cr-bulk__item" aria-pressed={bulkKind === entry.kind} disabled={(bulkCounts[entry.kind] ?? 0) === 0} onClick={() => void previewBulk(entry.kind)}><span><b>{uiText(entry.label)}</b><small>{uiText(entry.hint)}</small></span><span className="ui-sb-pill">{bulkCounts[entry.kind] ?? "…"}</span></button></li>)}</ul>
        {bulkKind && <div className="cr-bulk__preview" aria-label={uiText("Preview")}>
          <table className="ui-sb-table"><thead><tr><th scope="col">{uiText("Cell")}</th><th scope="col">{uiText("Before")}</th><th scope="col">{uiText("After")}</th></tr></thead>
            <tbody>{bulkItems.slice(0, 8).map(item => <tr key={item.issueId}><td className="ui-sb-mono">{item.row}</td><td><code>{JSON.stringify(item.from)}</code></td><td><code>{JSON.stringify(item.to)}</code></td></tr>)}</tbody></table>
          <p className="ui-sb-muted">{bulkItems.length > 8 ? uiText("Showing 8 of {0} changes.", [bulkItems.length]) : uiText("{0} changes.", [bulkItems.length])}</p>
        </div>}
        <div className="ui-sb-actions"><button type="button" className="ui-button" data-variant="secondary" data-size="sm" onClick={() => setBulkOpen(false)}><span className="ui-button__label">{uiText("Cancel")}</span></button><button type="button" className="ui-button" data-variant="primary" data-size="sm" disabled={!bulkKind || bulkItems.length === 0 || engine.busy} onClick={() => void applyBulk()}><span className="ui-button__label">{uiText("Apply to {0} cells", [bulkItems.length])}</span></button></div>
      </div>
    </WorkspaceDialog>
  </div>;
}
