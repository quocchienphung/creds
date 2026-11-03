"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "motion/react";
import { ChevronLeft, ChevronRight, FileSpreadsheet, Maximize2 } from "lucide-react";
import type { Issue } from "../engine/types";
import { Specimen } from "./Specimen";
import { SheetViewer, type SheetData } from "./SheetViewer";
import { moveSheetHost } from "./sheet-host";
import { railWindow, stepIndex, type Rect } from "./gallery-model";
import { cellRef } from "../../labels";
import "./gallery.css";
import "./sheet-viewer.css";
import "./workbook-viewer.css";
import { WorkbookViewer as Viewer } from "./WorkbookViewer";

export interface GalleryItem { issue: Issue; /** The text shown for the chosen variant (original, suggested or edited). */ text: string; tone: "red" | "amber" | "plain" | "plain-soft" }

/**
 * Issue gallery, after UIArc's Product gallery (public preview, docs/research/product-gallery/): a rail of thumbnails that glides, a stage, and a
 * fullscreen viewer that grows out of the stage's own rectangle. What the stage shows is the whole file as a sheet (SheetViewer) with the
 * issue's cell selected: scroll the file or use the strip to jump to any other issue.
 */
export function IssueGallery({ items, index, onIndex, details, override, sheet, onSelectCell, viewerRequest = 0 }: {
  items: GalleryItem[]; index: number; onIndex: (index: number) => void; details?: ReactNode; /** The text of the selected issue for the variant being looked at. */ override?: string;
  /** The worksheet behind the stage. Without it (still loading) the bare text of the cell is shown. */ sheet?: SheetData | null;
  onSelectCell?: (row: number, col: number, sheet?: string) => void; /** Changes when something else (the Orbit menu) asks for the fullscreen viewer. */ viewerRequest?: number;
}) {
  const { t: uiText } = useWorkspaceI18n();
  const reduce = useReducedMotion();
  const stageRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const focusRail = useRef(false);
  useLayoutEffect(() => {
    if (!focusRail.current) return;
    focusRail.current = false;
    const selected = railRef.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]');
    selected?.focus({ preventScroll: true });
    selected?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [index]);
  const returnFocus = useRef(false);
  const [viewer, setViewer] = useState<Rect | null>(null);
  const [sheetMode, setSheetMode] = useState<"overview" | "readable">("readable");
  const sheetSlot = useRef<HTMLDivElement>(null);
  const [sheetHost, setSheetHost] = useState<HTMLDivElement | null>(null);
  const mountSheetSlot = useCallback((node: HTMLDivElement | null) => {
    sheetSlot.current = node;
    if (node) setSheetHost(current => {
      if (current) return current;
      const host = document.createElement("div"); host.className = "cg-sheet-host"; return host;
    });
  }, []);
  useLayoutEffect(() => {
    if (!viewer && sheetHost && sheetSlot.current) moveSheetHost(sheetHost, sheetSlot.current);
  }, [viewer, sheetHost, items.length]);
  useEffect(() => () => { sheetHost?.remove(); }, [sheetHost]);
  // The page is inert while the viewer is open, so focus goes back to the stage only after the viewer has left the tree.
  useEffect(() => { if (!viewer && returnFocus.current) { returnFocus.current = false; stageRef.current?.focus(); } }, [viewer]);
  const closeViewer = useCallback(() => {
    // Return the connected host before React removes the dialog; otherwise the browser
    // discards the detached scroller's position even when its dimensions are identical.
    if (sheetHost && sheetSlot.current) moveSheetHost(sheetHost, sheetSlot.current);
    returnFocus.current = true;
    setViewer(null);
  }, [sheetHost]);
  const base = items[index];
  const item = base && override !== undefined ? { ...base, text: override } : base;
  const step = useCallback((delta: number) => onIndex(stepIndex(index, delta, items.length)), [index, items.length, onIndex]);
  function railKeys(event: KeyboardEvent<HTMLDivElement>) {
    let next = index;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = stepIndex(index, 1, items.length);
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = stepIndex(index, -1, items.length);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    else return;
    event.preventDefault();
    if (next !== index) { focusRail.current = true; onIndex(next); }
  }
  function stageKeys(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    if (event.key === "ArrowRight") { event.preventDefault(); step(1); }
    else if (event.key === "ArrowLeft") { event.preventDefault(); step(-1); }
    else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openViewer(); }
  }
  const openViewer = useCallback(() => { const box = stageRef.current?.getBoundingClientRect(); if (box) setViewer({ x: box.x, y: box.y, width: box.width, height: box.height }); }, []);
  const lastRequest = useRef(viewerRequest);
  useEffect(() => {
    if (viewerRequest === lastRequest.current) return;
    lastRequest.current = viewerRequest;
    // Next frame: the Orbit menu that asked is still folding away, and the stage must be measured after it.
    const frame = requestAnimationFrame(() => openViewer());
    return () => cancelAnimationFrame(frame);
  });

  if (!item) return <div className="cg-root" data-workbook>
    <p className="cg-empty" role="status">{uiText("No issue matches the filters.")}</p>
    {sheet && <div className="cg-layout"><div className="cg-media"><header className="cg-media__top"><span className="cg-media__title"><FileSpreadsheet size={16} />{sheet.meta.fileName}</span><button type="button" className="cg-expand" aria-haspopup="dialog" aria-expanded={!!viewer} onClick={openViewer}>{uiText("Open fullscreen")}</button></header><div ref={stageRef} className="cg-stage" data-open={!!viewer || undefined} role="group" tabIndex={0} onKeyDown={stageKeys}><div ref={mountSheetSlot} className="cg-sheet-slot" /></div></div></div>}
    {sheet && sheetHost && createPortal(<SheetViewer data={sheet} target={{ row: 1, col: 0, value: "" }} mode={sheetMode} onExpand={viewer ? undefined : openViewer} />, sheetHost)}
    {viewer && <Viewer items={[]} index={0} onIndex={onIndex} sheet={sheet} sheetHost={sheetHost} readable={sheetMode === "readable"} onReadable={value => setSheetMode(value ? "readable" : "overview")} source={stageRef} from={viewer} onClose={closeViewer} />}
  </div>;
  const windowed = railWindow(index, items.length, 6);
  const label = uiText("{0} of {1}", [index + 1, items.length]);
  const target = { row: item.issue.row, col: item.issue.col, value: item.text, preview: override !== undefined && override !== base.text, marks: item.text === item.issue.originalValue ? item.issue.marks : undefined };

  return <div className="cg-root" data-workbook>
    <div className="cg-layout">
      <div className="cg-media">
        <header className="cg-media__top">
          <span className="cg-media__title"><span className="cr-step-number" aria-hidden="true">01</span><span><b>{uiText("Locate the issue")}</b><small><FileSpreadsheet size={12} aria-hidden="true" />{sheet?.meta.sheet ?? cellRef(item.issue)} · {cellRef(item.issue)}</small></span></span>
          <button type="button" className="cg-expand" aria-haspopup="dialog" aria-expanded={!!viewer} aria-label={uiText("Open fullscreen")} onClick={openViewer}><Maximize2 size={15} aria-hidden="true" /><span>{uiText("Open fullscreen")}</span></button>
        </header>
        <div ref={railRef} className="cg-rail" role="tablist" aria-orientation="horizontal" aria-label={uiText("Issues")} onKeyDown={railKeys}>
          {items.slice(windowed.start, windowed.end).map((entry, offset) => {
            const at = windowed.start + offset, active = at === index;
            return <button key={entry.issue.id} type="button" role="tab" className="cg-thumb" aria-selected={active} tabIndex={active ? 0 : -1} data-tone={entry.tone} aria-label={`${cellRef(entry.issue)} · ${entry.issue.field}`} onClick={() => onIndex(at)}>
              <span className="cg-thumb__ref" aria-hidden="true">{cellRef(entry.issue)}</span>
              <span className="cg-thumb__text" aria-hidden="true">{entry.issue.field}</span>
              {active && <motion.span layoutId="cg-rail-ring" className="cg-rail__ring" transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 40 }} />}
            </button>;
          })}
        </div>
        <div ref={stageRef} className="cg-stage" data-open={!!viewer || undefined} role="group" tabIndex={0} aria-label={`${uiText("Cell {0}", [cellRef(item.issue)])}, ${label}`} onKeyDown={stageKeys}>
          {sheet ? <div ref={mountSheetSlot} className="cg-sheet-slot" /> : <span className="cg-shell"><span className="cg-slide"><Specimen value={item.text} marks={item.issue.marks} empty={uiText("(empty)")} /></span></span>}
        </div>
        <footer className="cg-media__foot">
          <div className="cg-pagination"><button type="button" className="cg-button" aria-label={uiText("Previous issue")} disabled={index === 0} onClick={() => step(-1)}><ChevronLeft size={16} /></button><p className="cg-hint" aria-live="polite">{label}</p><button type="button" className="cg-button" aria-label={uiText("Next issue")} disabled={index >= items.length - 1} onClick={() => step(1)}><ChevronRight size={16} /></button></div>
        </footer>
      </div>
      {details && <div className="cg-details"><div className="cg-details-content">{details}</div></div>}
    </div>
    {sheet && sheetHost && createPortal(<SheetViewer data={sheet} target={target} mode={sheetMode} onSelectCell={onSelectCell} onExpand={viewer ? undefined : openViewer} />, sheetHost)}
    {viewer && <Viewer items={items} index={index} override={override} sheet={sheet} sheetHost={sheetHost} readable={sheetMode === "readable"} onReadable={value => setSheetMode(value ? "readable" : "overview")} source={stageRef} from={viewer} onIndex={onIndex} onClose={closeViewer} />}
  </div>;
}

