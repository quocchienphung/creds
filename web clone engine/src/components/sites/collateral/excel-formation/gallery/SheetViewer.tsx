"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";
import { ChevronDown, LocateFixed, Search, ZoomIn, ZoomOut } from "lucide-react";
import type { GridMeta, GridRow } from "../../engine/protocol";
import { Specimen } from "./Specimen";
import { LENS, LENS_SPRING } from "./gallery-model";
import { columnAt, columnLefts, columnWidths, issueStrip, rowOfStrip, stripOfRow } from "../engine/sheet-geometry";
import { useViewerText } from "./viewer-labels";

export interface SheetTarget { row: number; col: number; value: string; preview?: boolean; marks?: { start: number; end: number; label?: string }[] }
export interface SheetData {
  meta: GridMeta;
  loadRows: (from: number, count: number, sheet?: string) => Promise<GridRow[]>;
  loadSheetMeta?: (sheet?: string) => Promise<GridMeta | null>;
  issueCells: Map<number, Map<number, number>>;
  issueRows: { row: number; level: number }[];
  epoch: number;
}
type Mode = "overview" | "readable";
const ROW = 30, HEAD = 24, GUTTER = 48, CHUNK = 40;
const NO_CELLS = new Map<number, Map<number, number>>();

/** Cache values and request keys together; a revisited region can always be read again.
 * Each edit gets a separate cache so stale responses cannot overwrite approved data. */
function useRows(data: SheetData, top: number, visible: number, selectedRow: number) {
  const cache = useMemo(() => ({ sheet: data.meta.sheet, epoch: data.epoch, loadRows: data.loadRows, chunks: new Map<number, GridRow[]>(), pending: new Map<number, Promise<GridRow[]>>() }), [data.meta.sheet, data.epoch, data.loadRows]);
  const lastRow = data.meta.lastRow;
  const [loaded, setLoaded] = useState<{ cache: typeof cache; rows: Map<number, GridRow>; error: boolean } | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let alive = true;
    const first = Math.floor((Math.max(1, top - 2) - 1) / CHUNK) * CHUNK + 1;
    const last = Math.min(lastRow, top + visible + 2);
    const starts: number[] = [];
    for (let start = first; start <= last; start += CHUNK) starts.push(start);
    const selectedChunk = Math.floor((selectedRow - 1) / CHUNK) * CHUNK + 1;
    if (!starts.includes(selectedChunk)) starts.push(selectedChunk);
    void Promise.all(starts.map(async start => {
      const saved = cache.chunks.get(start);
      if (saved) return saved;
      let pending = cache.pending.get(start);
      if (!pending) {
        pending = cache.loadRows(start, CHUNK, cache.sheet).then(rows => {
          cache.pending.delete(start); cache.chunks.set(start, rows);
          while (cache.chunks.size > 12) cache.chunks.delete(cache.chunks.keys().next().value!);
          return rows;
        }, error => { cache.pending.delete(start); throw error; });
        cache.pending.set(start, pending);
      }
      return pending;
    })).then(parts => {
      if (alive) setLoaded({ cache, rows: new Map(parts.flat().map(row => [row.r, row])), error: false });
    }).catch(() => { if (alive) setLoaded({ cache, rows: new Map(), error: true }); });
    return () => { alive = false; };
  }, [cache, lastRow, top, visible, selectedRow, retry]);
  return { rows: loaded?.cache === cache ? loaded.rows : new Map<number, GridRow>(), error: loaded?.cache === cache && loaded.error, retry: () => setRetry(value => value + 1) };
}

/** All worksheets remain in the worker. Read only the current sheet's metadata and visible rows. */
export function SheetViewer({ data, target, mode = "readable", lens = LENS.size, onSelectCell, onExpand }: { data: SheetData; target: SheetTarget; mode?: Mode; lens?: number; onSelectCell?: (row: number, col: number) => void; onExpand?: () => void }) {
  const { t } = useViewerText();
  const [other, setOther] = useState<GridMeta | null>(null);
  const [busy, setBusy] = useState(false), [failed, setFailed] = useState(false);
  const [wanted, setWanted] = useState(data.meta.sheet);
  const request = useRef(0);
  const [seen, setSeen] = useState(target);
  if (seen.row !== target.row || seen.col !== target.col) { setSeen(target); setOther(null); }
  useEffect(() => () => { request.current++; }, []);
  useEffect(() => { request.current++; setBusy(false); }, [target.row, target.col]);
  const changeSheet = async (name: string) => {
    const id = ++request.current;
    setFailed(false); setWanted(name);
    if (name === data.meta.sheet) { setOther(null); setBusy(false); return; }
    setBusy(true);
    try {
      const meta = await data.loadSheetMeta?.(name);
      if (id === request.current) { if (meta) setOther(meta); else setFailed(true); }
    } catch { if (id === request.current) setFailed(true); }
    finally { if (id === request.current) setBusy(false); }
  };
  const active = useMemo<SheetData>(() => other ? { ...data, meta: other, issueCells: NO_CELLS, issueRows: [] } : data, [data, other]);
  const picked = other ? { row: 1, col: 0, value: "" } : target;
  const sheetPicker = data.meta.sheets && data.meta.sheets.length > 1 && data.loadSheetMeta
    ? <select className="sv-sheet-select" aria-label={t("Worksheet")} value={active.meta.sheet} disabled={busy} onChange={event => void changeSheet(event.target.value)}>{data.meta.sheets.map(name => <option key={name}>{name}</option>)}</select>
    : <span className="sv-tab">{active.meta.sheet}</span>;
  return <SheetSurface key={active.meta.sheet} data={active} target={picked} mode={mode} lens={lens} sheetPicker={sheetPicker} busy={busy} failed={failed} onRetrySheet={() => void changeSheet(wanted)} onExpand={onExpand} onReturnToIssue={other ? () => void changeSheet(data.meta.sheet) : undefined} onSelectCell={other ? undefined : onSelectCell} />;
}

function SheetSurface({ data, target, mode, lens, sheetPicker, busy, failed, onRetrySheet, onSelectCell, onExpand, onReturnToIssue }: {
  data: SheetData; target: SheetTarget; mode: Mode; lens: number; sheetPicker: ReactNode; busy: boolean; failed: boolean;
  onSelectCell?: (row: number, col: number) => void; onExpand?: () => void; onReturnToIssue?: () => void; onRetrySheet: () => void;
}) {
  const { t, locale } = useViewerText();
  const reduce = useReducedMotion(), { meta } = data;
  const body = useRef<HTMLDivElement>(null), scroller = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 640, h: 180 });
  const [scroll, setScroll] = useState({ x: 0, y: 0 });
  const [selection, setSelection] = useState({ row: target.row, col: target.col });
  const [seenTarget, setSeenTarget] = useState({ row: target.row, col: target.col });
  if (seenTarget.row !== target.row || seenTarget.col !== target.col) {
    setSeenTarget({ row: target.row, col: target.col }); setSelection({ row: target.row, col: target.col });
  }
  const [expanded, setExpanded] = useState(false), [address, setAddress] = useState("");
  const [badAddress, setBadAddress] = useState(false), [zoom, setZoom] = useState(2);
  const [focusOffset, setFocusOffset] = useState(0);
  const [hover, setHover] = useState<{ row: number; col: number; x: number; y: number } | null>(null);
  const [lensOn, setLensOn] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visible = Math.max(1, Math.ceil((size.h - HEAD) / ROW));
  const top = Math.max(meta.firstRow, Math.min(meta.lastRow, meta.firstRow + Math.floor(scroll.y / ROW)));
  const widths = useMemo(() => mode === "overview" ? columnWidths(meta.columns, Math.max(80, size.w - GUTTER - 16)) : meta.columns.map(col => col.weight > 1 ? 340 : 124), [meta.columns, mode, size.w]);
  const lefts = useMemo(() => columnLefts(widths), [widths]);
  const totalW = widths.reduce((a, b) => a + b, 0);
  const { rows, error, retry } = useRows(data, top, visible, selection.row);
  const n = (value: number) => new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US").format(value);
  useLayoutEffect(() => {
    const node = body.current;
    if (!node) return;
    const measure = () => setSize({ w: node.clientWidth, h: node.clientHeight });
    measure(); const observer = new ResizeObserver(measure); observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const reveal = useCallback((row: number, col: number) => {
    const node = scroller.current;
    if (!node) return;
    node.scrollTop = Math.max(0, (row - meta.firstRow) * ROW - Math.max(0, size.h - HEAD - ROW) / 2);
    node.scrollLeft = Math.max(0, (lefts[col] ?? 0) - Math.max(0, size.w - GUTTER - (widths[col] ?? 0)) / 2);
  }, [lefts, widths, size.h, size.w, meta.firstRow]);
  useLayoutEffect(() => { reveal(selection.row, selection.col); }, [selection.row, selection.col, reveal]);
  const selectedRow = rows.get(selection.row);
  const previewing = !!target.preview && selection.row === target.row && selection.col === target.col;
  const actual = previewing ? target.value : selectedRow ? selectedRow.values[selection.col] ?? "" : undefined;
  const marks = selection.row === target.row && selection.col === target.col && actual === target.value ? target.marks : undefined;
  const selectedRef = `${meta.columns[selection.col]?.letter ?? "A"}${selection.row}`;
  // Long descriptions can have their first damaged character beyond the clipped column. Measure the
  // actual rendered mark and pan only its text, keeping the cell geometry and source value intact.
  const hasMarks = !!target.marks?.length;
  useLayoutEffect(() => {
    const cell = body.current?.querySelector<HTMLElement>(`.sv-cell[data-row="${target.row}"][data-col="${target.col}"]`);
    const mark = cell?.querySelector<HTMLElement>(".cg-mark, .cg-glyph");
    const bounds = body.current?.getBoundingClientRect(), rect = cell?.getBoundingClientRect();
    const middle = bounds && rect ? (Math.max(rect.left, bounds.left + GUTTER) + Math.min(rect.right, bounds.right - 12)) / 2 - rect.left : 0;
    const next = hasMarks && cell && mark && rect ? Math.max(0, mark.getBoundingClientRect().left - rect.left + focusOffset - middle) : 0;
    if (Math.abs(next - focusOffset) < 1) return;
    const frame = requestAnimationFrame(() => setFocusOffset(next));
    return () => cancelAnimationFrame(frame);
  }, [target.row, target.col, target.value, hasMarks, rows, widths, focusOffset, scroll.x]);
  const px = useMotionValue(0), py = useMotionValue(0);
  const sx = useSpring(px, LENS_SPRING), sy = useSpring(py, LENS_SPRING);
  const diameter = Math.min(lens, Math.max(76, size.w - 18), Math.max(76, size.h - 38));
  const lx = useTransform(sx, x => Math.max(diameter / 2 + 4, Math.min(size.w - 16 - diameter / 2, x)));
  const ly = useTransform(sy, y => Math.max(diameter / 2 + 2, Math.min(size.h - diameter / 2 - 25, y)));
  const point = useCallback((row: number, col: number, x: number, y: number) => {
    if (!lensOn || reduce) { sx.jump(x); sy.jump(y); }
    px.set(x); py.set(y); setHover({ row, col, x, y }); setLensOn(true);
  }, [px, py, sx, sy, lensOn, reduce]);
  const spotlight = useRef("");
  useEffect(() => {
    const id = `${target.row}:${target.col}:${data.epoch}:${mode}:${focusOffset}`;
    if (spotlight.current === id || !rows.has(target.row) || !body.current || !matchMedia("(hover: hover)").matches) return;
    const mark = body.current.querySelector<HTMLElement>(`.sv-cell[data-row="${target.row}"][data-col="${target.col}"] .cg-mark, .sv-cell[data-row="${target.row}"][data-col="${target.col}"] .cg-glyph`);
    const markX = mark ? mark.getBoundingClientRect().left - body.current.getBoundingClientRect().left + mark.clientWidth / 2 : GUTTER + lefts[target.col] - scroll.x + 12;
    const x = Math.max(GUTTER + 10, Math.min(size.w - 24, markX));
    const y = HEAD + (target.row - meta.firstRow) * ROW - scroll.y + ROW / 2;
    if (y < HEAD || y > size.h - 12) return;
    const frame = requestAnimationFrame(() => {
      spotlight.current = id; point(target.row, target.col, x, y);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setLensOn(false), 1600);
    });
    return () => cancelAnimationFrame(frame);
  }, [target, data.epoch, mode, rows, size, lefts, widths, scroll, meta.firstRow, point, focusOffset]);
  function locate(event: PointerEvent<HTMLDivElement> | MouseEvent<HTMLDivElement>) {
    const rect = body.current?.getBoundingClientRect();
    if (!rect) return null;
    const x = event.clientX - rect.left, y = event.clientY - rect.top;
    if (x < GUTTER || x > size.w - 12 || y < HEAD || y >= size.h) return null;
    const col = columnAt(lefts, widths, x - GUTTER + scroll.x);
    const row = meta.firstRow + Math.floor((y - HEAD + scroll.y) / ROW);
    return row <= meta.lastRow ? { row, col, x, y } : null;
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse") return;
    if (timer.current) clearTimeout(timer.current);
    const hit = locate(event);
    if (hit) point(hit.row, hit.col, hit.x, hit.y); else setLensOn(false);
  }
  function select(row: number, col: number) {
    setSelection({ row, col });
    if (data.issueCells.get(row)?.has(col)) onSelectCell?.(row, col);
  }
  function go() {
    const match = address.trim().match(/^\$?([A-Z]{1,3})\$?([1-9]\d*)$/i);
    let col = 0;
    for (const c of match?.[1]?.toUpperCase() ?? "") col = col * 26 + c.charCodeAt(0) - 64;
    const row = Number(match?.[2]);
    if (!match || row > meta.lastRow || col > meta.columns.length) { setBadAddress(true); return; }
    setBadAddress(false); setAddress(""); select(row, col - 1); reveal(row, col - 1);
  }
  function keys(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    let { row, col } = selection;
    if (event.key === "ArrowDown") row++; else if (event.key === "ArrowUp") row--;
    else if (event.key === "ArrowRight") col++; else if (event.key === "ArrowLeft") col--;
    else if (event.key === "PageDown") row += visible; else if (event.key === "PageUp") row -= visible;
    else if (event.key === "Home") { col = 0; if (event.ctrlKey || event.metaKey) row = 1; }
    else if (event.key === "End") { col = meta.columns.length - 1; if (event.ctrlKey || event.metaKey) row = meta.lastRow; }
    else if (event.key === "Enter") { setExpanded(value => !value); event.preventDefault(); event.stopPropagation(); return; }
    else return;
    event.preventDefault(); event.stopPropagation();
    row = Math.max(1, Math.min(meta.lastRow, row)); col = Math.max(0, Math.min(meta.columns.length - 1, col));
    select(row, col); reveal(row, col);
  }
  useEffect(() => {
    const node = body.current;
    if (!node) return;
    const wheel = (event: WheelEvent) => {
      if (!event.altKey) return;
      event.preventDefault(); setZoom(value => Math.max(2, Math.min(5, value + (event.deltaY > 0 ? -0.5 : 0.5))));
    };
    node.addEventListener("wheel", wheel, { passive: false });
    return () => node.removeEventListener("wheel", wheel);
  }, []);
  const startCol = mode === "overview" ? 0 : Math.max(0, columnAt(lefts, widths, scroll.x) - 1);
  const endCol = mode === "overview" ? widths.length - 1 : Math.min(widths.length - 1, columnAt(lefts, widths, scroll.x + size.w) + 1);
  const columns = meta.columns.slice(startCol, endCol + 1);
  const shownRows = Array.from({ length: Math.max(0, Math.min(visible + 3, meta.lastRow - top + 1)) }, (_, i) => top + i);
  const strip = useMemo(() => issueStrip(data.issueRows, meta.lastRow, 120), [data.issueRows, meta.lastRow]);
  const stripTo = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect(), row = rowOfStrip(event.clientY - rect.top, rect.height, meta.lastRow);
    if (scroller.current) scroller.current.scrollTop = Math.max(0, (row - 1) * ROW - size.h / 2);
  };
  const gx = hover ? hover.x - GUTTER + scroll.x : 0, gy = hover ? hover.y - HEAD + scroll.y : 0;
  const lensCol0 = columnAt(lefts, widths, gx - diameter / 2 / zoom), lensCol1 = columnAt(lefts, widths, gx + diameter / 2 / zoom);
  const lensRow0 = Math.max(1, Math.floor((gy - diameter / 2 / zoom) / ROW) + 1), lensRow1 = Math.min(meta.lastRow, Math.floor((gy + diameter / 2 / zoom) / ROW) + 1);
  const lensRows = Array.from({ length: Math.max(0, lensRow1 - lensRow0 + 1) }, (_, i) => lensRow0 + i);
  const lensCols = meta.columns.slice(lensCol0, lensCol1 + 1);
  return <div className="sv" data-mode={mode} data-sheet={meta.sheet}>
    <div className="sv-toolbar">
      <form className="sv-address" onSubmit={event => { event.preventDefault(); go(); }}><Search size={12} aria-hidden="true" /><input aria-label={t("Go to cell")} placeholder={selectedRef} value={address} aria-invalid={badAddress || undefined} onChange={event => { setAddress(event.target.value); setBadAddress(false); }} /><button type="submit" aria-label={t("Go to cell")}>↵</button></form>
      <button type="button" className="sv-locate" onClick={() => { if (onReturnToIssue) onReturnToIssue(); else { select(target.row, target.col); reveal(target.row, target.col); } }}><LocateFixed size={13} aria-hidden="true" /><span>{t("Back to issue")}</span></button>
      <div className="sv-zoom"><button type="button" aria-label={t("Zoom out magnifier")} disabled={zoom <= 2} onClick={() => setZoom(value => Math.max(2, value - 0.5))}><ZoomOut size={13} /></button><span>×{zoom}</span><button type="button" aria-label={t("Zoom in magnifier")} disabled={zoom >= 5} onClick={() => setZoom(value => Math.min(5, value + 0.5))}><ZoomIn size={13} /></button></div>
      {onExpand && <button type="button" className="sv-open" onClick={onExpand}>{t("Expand file")}</button>}
    </div>
    <div className="sv-formula" data-expanded={expanded || undefined}><span className="sv-namebox">{selectedRef}</span><span className="sv-fx" aria-hidden="true">fx</span>
      {previewing && <span className="sv-preview-label">{t("Preview · not applied")}</span>}
      <div className="sv-formula__text" tabIndex={expanded ? 0 : -1} aria-label={t("Full cell value")}>{marks ? <Specimen value={actual ?? ""} marks={marks} empty="" /> : actual ?? "…"}</div>
      <button type="button" className="sv-value-toggle" aria-label={t("Show full cell value")} aria-expanded={expanded} onClick={() => setExpanded(value => !value)}><ChevronDown size={14} /></button>
    </div>
    <div className="sv-body" ref={body} onPointerMove={move} onPointerLeave={() => setLensOn(false)}>
      <div className="sv-scroll" ref={scroller} role="grid" tabIndex={0} aria-label={`${meta.fileName} · ${meta.sheet}`} aria-rowcount={meta.lastRow} aria-colcount={meta.columns.length} onKeyDown={keys}
        onScroll={event => { const node = event.currentTarget; setScroll({ x: node.scrollLeft, y: node.scrollTop }); setLensOn(false); }}
        onClick={event => { const hit = locate(event); if (hit) { select(hit.row, hit.col); event.currentTarget.focus({ preventScroll: true }); onExpand?.(); } }}>
        <div className="sv-grid" style={{ width: GUTTER + totalW, height: HEAD + (meta.lastRow - meta.firstRow + 1) * ROW }}>
          <div className="sv-head" role="row" style={{ width: GUTTER + totalW, height: HEAD }}><span className="sv-corner" style={{ width: GUTTER }} />{columns.map(col => <span key={col.col} role="columnheader" className="sv-letter" data-target={col.col === selection.col || undefined} style={{ left: GUTTER + lefts[col.col], width: widths[col.col] }} title={col.header || col.letter}>{col.letter}<small>{col.header}</small></span>)}</div>
          {shownRows.map(r => { const row = rows.get(r); return <div key={r} role="row" aria-rowindex={r} className="sv-row" data-loaded={!!row || undefined} data-target={r === selection.row || undefined} data-hidden={row?.hidden || undefined} data-header={row?.header || undefined} style={{ top: HEAD + (r - meta.firstRow) * ROW, height: ROW, width: GUTTER + totalW }}>
            <span className="sv-rn" role="rowheader" data-hidden={row?.hidden || undefined} style={{ width: GUTTER }}>{r}</span>
            {columns.map(col => { const value = target.preview && r === target.row && col.col === target.col ? target.value : row?.values[col.col] ?? "", selected = r === selection.row && col.col === selection.col, level = data.issueCells.get(r)?.get(col.col); return <span key={col.col} role="gridcell" aria-colindex={col.col + 1} aria-selected={selected} className="sv-cell" data-row={r} data-col={col.col} data-level={level || undefined} data-target={selected || undefined} data-empty={!value || undefined} style={{ left: GUTTER + lefts[col.col], width: widths[col.col] }}>
              {r === target.row && col.col === target.col && value === target.value ? <span className="sv-target-text" style={{ translate: `${-focusOffset}px 0` }}><Specimen value={value} marks={target.marks} empty="" /></span> : value}
            </span>; })}
          </div>; })}
        </div>
      </div>
      <div className="sv-strip" role="slider" aria-label={t("Position in the file")} aria-valuemin={1} aria-valuemax={meta.lastRow} aria-valuenow={top} tabIndex={0}
        onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); stripTo(event); }} onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) stripTo(event); }}
        onKeyDown={event => { if (["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End"].includes(event.key)) { event.preventDefault(); const row = event.key === "End" ? meta.lastRow : event.key === "Home" ? 1 : top + (event.key.includes("Down") ? 1 : -1) * (event.key.startsWith("Page") ? visible : 1); if (scroller.current) scroller.current.scrollTop = (row - 1) * ROW; } }}>
        {Array.from(strip, (level, i) => level ? <i key={i} data-level={level} style={{ top: `${i / strip.length * 100}%`, height: `${100 / strip.length}%` }} /> : null)}
        <b className="sv-window" style={{ top: stripOfRow(top, size.h, meta.lastRow), height: Math.max(6, visible / meta.lastRow * size.h) }} /><b className="sv-here" style={{ top: stripOfRow(target.row, size.h, meta.lastRow) }} />
      </div>
      {(error || failed) && <div className="sv-error" role="alert">{t("Could not load this part of the file.")} <button type="button" onClick={failed ? onRetrySheet : retry}>{t("Retry")}</button></div>}
      {busy && <span className="sv-pending" role="status">{t("Loading worksheet…")}</span>}
      {lensOn && hover && <motion.div className="sv-lens" aria-hidden="true" style={{ x: lx, y: ly, width: diameter, height: diameter, marginLeft: -diameter / 2, marginTop: -diameter / 2 }}>
        <div className="sv-lens__disc"><div className="sv-lens__inner" style={{ left: diameter / 2 - (gx - lefts[lensCol0]) * zoom, top: diameter / 2 - (gy - (lensRow0 - 1) * ROW) * zoom }}>
          {lensRows.flatMap(r => lensCols.map(col => { const value = target.preview && r === target.row && col.col === target.col ? target.value : rows.get(r)?.values[col.col] ?? "", isIssue = r === target.row && col.col === target.col && value === target.value; return <span key={`${r}:${col.col}`} className="sv-lcell" data-level={data.issueCells.get(r)?.get(col.col) || undefined} data-target={r === selection.row && col.col === selection.col || undefined} style={{ left: (lefts[col.col] - lefts[lensCol0]) * zoom, top: (r - lensRow0) * ROW * zoom, width: widths[col.col] * zoom, height: ROW * zoom, fontSize: 12 * zoom }}><span className="sv-target-text" style={{ translate: `${isIssue ? -focusOffset * zoom : 0}px 0` }}><Specimen value={value} marks={isIssue ? target.marks : undefined} lens empty="" /></span></span>; }))}
        </div></div>
        <span className="sv-lens__label">{meta.columns[hover.col]?.letter}{hover.row} · ×{zoom}</span>
      </motion.div>}
    </div>
    <div className="sv-tabs">{sheetPicker}<span className="sv-where"><span>{t("Row {0} of {1}", [n(selection.row), n(meta.lastRow)])}</span><span>{t("Column {0} of {1}", [meta.columns[selection.col]?.letter, n(meta.columns.length)])}</span>{meta.hiddenRows > 0 && <span>{t("{0} hidden rows", [n(meta.hiddenRows)])}</span>}</span></div>
  </div>;
}
