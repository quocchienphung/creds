"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from "react";
import { createPortal } from "react-dom";
import { animate, motion, useMotionValue, useReducedMotion, useTransform, type MotionValue } from "motion/react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { GalleryItem } from "./IssueGallery";
import type { SheetData } from "./SheetViewer";
import { moveSheetHost } from "./sheet-host";
import { fitFrame, stepIndex, type Rect } from "./gallery-model";
import { cellRef } from "../../labels";
import { useViewerText } from "./viewer-labels";

// Normalized geometry sampled from UIArc's public Card to article at both 1440 and 390px.
// No private spring constants are assumed. See docs/research/card-to-article/source/motion-*.json.
const TIMES = [0, 33, 66, 100, 150, 200, 250, 300, 400, 500, 650, 800, 950].map(t => t / 950);
const PROGRESS = [0, .017, .098, .212, .396, .556, .685, .782, .9, .956, .988, .997, 1];
const EASE = [.22, 1, .36, 1] as const;
function travel(value: MotionValue<number>, to: number) {
  const from = value.get();
  return animate(value, PROGRESS.map(p => from + (to - from) * p), { duration: .95, times: TIMES, ease: "linear" });
}
function themeFrom(node: HTMLElement | null): CSSProperties {
  if (!node) return {};
  const styles = getComputedStyle(node), out: Record<string, string> = { fontFamily: styles.fontFamily };
  for (const key of Array.from(styles)) if (key.startsWith("--")) out[key] = styles.getPropertyValue(key);
  return out as CSSProperties;
}
function sourceBox(source: RefObject<HTMLElement | null>, fallback: Rect): Rect {
  return source.current?.getBoundingClientRect() ?? fallback;
}

export function WorkbookViewer({ items, index, from, onIndex, onClose, sheet, source, sheetHost, readable, onReadable }: {
  items: GalleryItem[]; index: number; from: Rect; onIndex: (index: number) => void; onClose: () => void;
  override?: string; sheet?: SheetData | null; source: RefObject<HTMLElement | null>;
  sheetHost: HTMLDivElement | null; readable: boolean; onReadable: (value: boolean) => void;
}) {
  const { t } = useViewerText(), reduce = useReducedMotion();
  const [theme] = useState(() => themeFrom(source.current));
  const [viewport, setViewport] = useState(() => ({ width: innerWidth, height: innerHeight }));
  const [phase, setPhase] = useState<"opening" | "open" | "closing">("opening");
  const frame = useMemo(() => {
    const area = viewport;
    const fitted = fitFrame(area, area.width / Math.max(1, area.height - 176));
    return viewport.width < 640 ? { ...fitted, y: 112, height: Math.max(80, viewport.height - 192) } : fitted;
  }, [viewport]);
  const dialog = useRef<HTMLDivElement>(null), closeButton = useRef<HTMLButtonElement>(null);
  const closing = useRef(false), mounted = useRef(true);
  const controls = useRef<{ stop: () => void }[]>([]);
  // A single clock drives both the box and its live layout, in both directions.
  const progress = useMotionValue(0);
  const originX = useMotionValue(from.x), originY = useMotionValue(from.y);
  const originWidth = useMotionValue(from.width), originHeight = useMotionValue(from.height);
  const originRadius = useMotionValue(source.current ? parseFloat(getComputedStyle(source.current).borderTopLeftRadius) || 8 : 8);
  const x = useTransform(() => originX.get() + (frame.x - originX.get()) * progress.get());
  const y = useTransform(() => originY.get() + (frame.y - originY.get()) * progress.get());
  const width = useTransform(() => originWidth.get() + (frame.width - originWidth.get()) * progress.get());
  const height = useTransform(() => originHeight.get() + (frame.height - originHeight.get()) * progress.get());
  const radius = useTransform(() => originRadius.get() + (18 - originRadius.get()) * progress.get());
  const handleHeight = useTransform(progress, [0, 1], [0, 26]);
  const backdrop = useMotionValue(0), chrome = useMotionValue(0);
  const pull = useMotionValue(0), renderedY = useTransform(() => y.get() + pull.get());
  const scale = useTransform(pull, value => Math.max(.88, 1 - value / Math.max(1, viewport.height) * .28));
  const gesture = useRef<{ y: number; previous: number; time: number; velocity: number } | null>(null);
  const shown = items[index];

  useLayoutEffect(() => {
    mounted.current = true;
    const resize = () => setViewport({ width: innerWidth, height: innerHeight });
    addEventListener("resize", resize);
    const page = source.current?.closest<HTMLElement>(".crm-page"), wasInert = page?.inert ?? false;
    if (page) page.inert = true;
    const overflow = document.body.style.overflow, padding = document.body.style.paddingRight;
    const scrollbar = innerWidth - document.documentElement.clientWidth;
    if (scrollbar) document.body.style.paddingRight = `${parseFloat(getComputedStyle(document.body).paddingRight) + scrollbar}px`;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus({ preventScroll: true });
    return () => {
      mounted.current = false; controls.current.forEach(c => c.stop());
      removeEventListener("resize", resize); document.body.style.overflow = overflow; document.body.style.paddingRight = padding;
      if (page) page.inert = wasInert;
    };
  }, [source]);
  useLayoutEffect(() => {
    if (closing.current) return;
    controls.current.forEach(c => c.stop());
    if (reduce) {
      progress.set(1); backdrop.set(1); chrome.set(1);
      return;
    }
    const morph = travel(progress, 1);
    controls.current = [morph, animate(backdrop, 1, { duration: .32, ease: EASE }), animate(chrome, 1, { duration: .55, delay: .18, ease: EASE })];
    void morph.then(() => { if (mounted.current && !closing.current) setPhase("open"); });
    return () => controls.current.forEach(c => c.stop());
  }, [frame, reduce, progress, backdrop, chrome]);
  const mountSheet = useCallback((node: HTMLDivElement | null) => { if (node && sheetHost) moveSheetHost(sheetHost, node); }, [sheetHost]);
  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true; setPhase("closing"); controls.current.forEach(c => c.stop());
    if (reduce) { onClose(); return; }
    // Always remeasure the slot: scroll, responsive layout or another correction may have moved it.
    const slot = sourceBox(source, from);
    originX.set(slot.x); originY.set(slot.y); originWidth.set(slot.width); originHeight.set(slot.height);
    originRadius.set(source.current ? parseFloat(getComputedStyle(source.current).borderTopLeftRadius) || 8 : 8);
    const finish = travel(progress, 0);
    controls.current = [finish, animate(pull, 0, { duration: .3, ease: EASE }),
      animate(backdrop, 0, { duration: .26, ease: EASE }), animate(chrome, 0, { duration: .1 })];
    // Paint the exact inline geometry before handing the same host back to its slot.
    void finish.then(() => {
      if (!mounted.current) return;
      const paint = requestAnimationFrame(() => { if (mounted.current) onClose(); });
      controls.current.push({ stop: () => cancelAnimationFrame(paint) });
    });
  }, [reduce, onClose, source, from, originX, originY, originWidth, originHeight, originRadius, progress, pull, backdrop, chrome]);
  useEffect(() => {
    const keys = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
      else if (event.key === "Tab") {
        const nodes = [...(dialog.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex='0']") ?? [])].filter(node => node.getClientRects().length && node.tabIndex >= 0);
        if (!nodes.length) return;
        event.preventDefault(); event.stopPropagation();
        const at = nodes.indexOf(document.activeElement as HTMLElement);
        nodes[at < 0 ? (event.shiftKey ? nodes.length - 1 : 0) : (at + (event.shiftKey ? -1 : 1) + nodes.length) % nodes.length].focus();
      } else if ((event.target as HTMLElement)?.closest("input, textarea, select, button, .sv, [contenteditable='true']")) return;
      else if (event.key === "ArrowRight") onIndex(stepIndex(index, 1, items.length));
      else if (event.key === "ArrowLeft") onIndex(stepIndex(index, -1, items.length));
    };
    document.addEventListener("keydown", keys, true);
    return () => document.removeEventListener("keydown", keys, true);
  }, [close, index, items.length, onIndex]);
  const label = shown ? t("{0} of {1}", [index + 1, items.length]) : sheet?.meta.fileName ?? "";
  return createPortal(<div ref={dialog} className="cg-viewer cg-workbook-viewer" data-theme={source.current?.closest("[data-theme]")?.getAttribute("data-theme")} role="dialog" aria-modal="true" aria-label={shown ? `${t("Cell {0}", [cellRef(shown.issue)])}, ${label}` : label} style={theme}>
    <motion.div className="cg-backdrop" style={{ opacity: backdrop }} onClick={close} aria-hidden="true" />
    <motion.div className="cg-frame" data-moving={!reduce && phase !== "open" || undefined} data-closing={phase === "closing" || undefined} style={{ left: x, top: renderedY, width, height, borderRadius: radius, scale, opacity: reduce ? 1 : undefined }}>
      <div className="cg-morph-content">
        <motion.div className="cg-pull" style={{ height: handleHeight, opacity: progress }} role="button" tabIndex={0} aria-label={t("Drag down to close")} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); close(); } }}
          onPointerDown={event => { if (event.button !== 0 || closing.current) return; event.currentTarget.setPointerCapture(event.pointerId); gesture.current = { y: event.clientY, previous: event.clientY, time: performance.now(), velocity: 0 }; }}
          onPointerMove={event => { const g = gesture.current; if (!g) return; const now = performance.now(); g.velocity = (event.clientY - g.previous) / Math.max(1, now - g.time); g.previous = event.clientY; g.time = now; pull.set(Math.max(0, event.clientY - g.y)); }}
          onPointerUp={() => { const g = gesture.current; gesture.current = null; if (!g) return; if (pull.get() > 120 || pull.get() > 24 && g.velocity > .65) close(); else controls.current.push(animate(pull, 0, { type: "spring", stiffness: 300, damping: 35 })); }}
          onPointerCancel={() => { gesture.current = null; controls.current.push(animate(pull, 0, { duration: .2 })); }}><span /></motion.div>
        <motion.div className="cg-workbook-sheet" style={{ top: handleHeight }} ref={mountSheet} />
      </div>
    </motion.div>
    <motion.div className="cg-viewer__top" style={{ opacity: chrome }}><span className="cg-counter" aria-live="polite">{label}</span>
      <div className="cg-modes" role="radiogroup" aria-label={t("View")}>{(["overview", "readable"] as const).map(value => <button type="button" key={value} role="radio" aria-checked={(value === "readable") === readable} data-active={(value === "readable") === readable || undefined} onClick={() => onReadable(value === "readable")}>{t(value === "overview" ? "Whole file" : "Readable")}</button>)}</div>
      <button ref={closeButton} type="button" className="cg-button" aria-label={t("Close")} onClick={close}><X size={18} /></button>
    </motion.div>
    {shown && <motion.div className="cg-viewer__nav" style={{ opacity: chrome }}><button type="button" className="cg-button" aria-label={t("Previous issue")} disabled={index === 0} onClick={() => onIndex(stepIndex(index, -1, items.length))}><ChevronLeft size={18} /></button><span className="cg-viewer__ref">{cellRef(shown.issue)} · {shown.issue.field}</span><button type="button" className="cg-button" aria-label={t("Next issue")} disabled={index >= items.length - 1} onClick={() => onIndex(stepIndex(index, 1, items.length))}><ChevronRight size={18} /></button></motion.div>}
  </div>, document.body);
}
