"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { FocusEvent as ReactFocusEvent, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode, RefObject } from "react";
import { createPortal } from "react-dom";
import { SHEET, SHEET_SPRING, backdropOpacity, followPointer, keyboardDetent, layout, normalizeDetents, releaseVelocity, resolveRelease } from "./sheet-model";
import "./bottom-sheet.css";

export interface BottomSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  /** Resting heights as fractions of the viewport height. */
  detents?: number[];
  /** Index into the sorted detents the sheet opens at. Defaults to the smallest. */
  initialDetent?: number;
  onDetentChange?: (index: number) => void;
  closeLabel?: string;
  className?: string;
  /** Where the focus goes when the sheet is gone. Defaults to what had it when the sheet opened. */
  returnFocus?: RefObject<HTMLElement | null>;
}

const CloseContext = createContext<(() => void) | null>(null);
/** Closes the sheet it is inside: `<button onClick={useBottomSheetClose()}>`. */
export const useBottomSheetClose = () => useContext(CloseContext) ?? (() => {});

interface DragState { id: number; startPointer: number; startY: number; moved: boolean; samples: { t: number; y: number }[]; fromBody: boolean }

function Surface({ open, onOpenChange, onClosed, title, description, children, detents, initialDetent, onDetentChange, closeLabel = "Close", className = "", returnFocus }: BottomSheetProps & { onClosed: () => void }) {
  const { t: uiText } = useWorkspaceI18n();
  const id = useId();
  const reduced = !!useReducedMotion();
  const sorted = useMemo(() => normalizeDetents(detents), [detents]);
  const [vh, setVh] = useState(() => window.innerHeight);
  const lay = useMemo(() => layout(vh, sorted), [vh, sorted]);
  const layRef = useRef(lay); layRef.current = lay;
  const first = Math.min(sorted.length - 1, Math.max(0, initialDetent ?? 0));
  const y = useMotionValue(lay.closedY);
  const fade = useMotionValue(reduced ? 0 : 1);
  const overlayOpacity = useTransform([y, fade], ([value, amount]: number[]) => { const l = layRef.current; return backdropOpacity(value, l.stops, l.closedY) * amount; });
  const surface = useRef<HTMLDivElement>(null), overlay = useRef<HTMLDivElement>(null), head = useRef<HTMLDivElement>(null), body = useRef<HTMLDivElement>(null), grabber = useRef<HTMLButtonElement>(null);
  const detentRef = useRef(first);
  const [expanded, setExpanded] = useState(first === sorted.length - 1);
  const [scrolled, setScrolled] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [announce, setAnnounce] = useState("");
  const drag = useRef<DragState | null>(null);
  const swallowClick = useRef(false);
  const animation = useRef<{ stop(): void } | null>(null);
  const leaving = useRef({ velocity: 0, done: false });
  const closing = useRef(false);
  const callbacks = useRef({ onOpenChange, onDetentChange, onClosed }); callbacks.current = { onOpenChange, onDetentChange, onClosed };
  const last = sorted.length - 1;

  // ----- moving the sheet -----
  const settle = useCallback((index: number, velocity = 0, spring: keyof typeof SHEET_SPRING = "settle") => {
    animation.current?.stop();
    const target = layRef.current.stops[index];
    const previous = detentRef.current;
    detentRef.current = index;
    if (reduced) { y.set(target); setExpanded(index === last); if (index !== previous) { callbacks.current.onDetentChange?.(index); setAnnounce(index > previous ? "Sheet expanded" : "Sheet collapsed"); } return; }
    const controls = animate(y, target, { ...SHEET_SPRING[spring], velocity, onComplete: () => { setExpanded(index === last); } });
    animation.current = controls;
    if (index !== previous) { callbacks.current.onDetentChange?.(index); setAnnounce(index > previous ? "Sheet expanded" : "Sheet collapsed"); }
    if (index !== last) setExpanded(false);
  }, [last, reduced, y]);
  const dismiss = useCallback((velocity = 0) => { leaving.current.velocity = velocity; callbacks.current.onOpenChange(false); }, []);

  // open: from the closed position to the first detent (reduced motion: straight there, faded in)
  useLayoutEffect(() => {
    y.set(layRef.current.closedY);
    if (reduced) { y.set(layRef.current.stops[first]); fade.set(0); animate(fade, 1, { duration: 0.12 }); }
    else animation.current = animate(y, layRef.current.stops[first], SHEET_SPRING.open);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on mount
  }, []);
  // close: back to the closed position with the dismissal spring, carrying the release velocity; then the surface is unmounted
  useEffect(() => {
    if (open || closing.current) return;
    closing.current = true;
    animation.current?.stop();
    const finish = () => { if (!leaving.current.done) { leaving.current.done = true; callbacks.current.onClosed(); } };
    if (reduced) { const controls = animate(fade, 0, { duration: 0.12, onComplete: finish }); return () => controls.stop(); }
    const controls = animate(y, layRef.current.closedY, { ...SHEET_SPRING.dismiss, velocity: leaving.current.velocity, onComplete: finish });
    animation.current = controls;
  }, [open, reduced, y, fade]);

  // opened again before it had finished leaving: back up to the first detent
  useEffect(() => {
    if (!open || !closing.current) return;
    closing.current = false; leaving.current = { velocity: 0, done: false };
    settle(first, 0, "open");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reacts to `open` only
  }, [open]);

  // the viewport changed (rotation, mobile browser chrome): the detents are fitted again
  useEffect(() => {
    const refit = () => setVh(window.innerHeight);
    window.addEventListener("resize", refit); window.visualViewport?.addEventListener("resize", refit);
    return () => { window.removeEventListener("resize", refit); window.visualViewport?.removeEventListener("resize", refit); };
  }, []);
  const fitted = useRef(vh);
  useEffect(() => {
    if (fitted.current === vh) return;
    fitted.current = vh;
    if (closing.current || drag.current) return;
    animation.current?.stop();
    y.set(lay.stops[detentRef.current] ?? lay.stops[0]);
  }, [lay, vh, y]);

  // ----- dragging: the header with any pointer, the content with a finger while the sheet is not fully open -----
  const startDrag = (event: ReactPointerEvent, fromBody: boolean) => {
    if (closing.current || (event.pointerType === "mouse" && event.button !== 0) || drag.current) return;
    animation.current?.stop();
    const state: DragState = { id: event.pointerId, startPointer: event.clientY, startY: y.get(), moved: false, samples: [{ t: performance.now(), y: event.clientY }], fromBody };
    drag.current = state;
    const move = (e: PointerEvent) => {
      if (e.pointerId !== state.id) return;
      const delta = e.clientY - state.startPointer;
      if (!state.moved && Math.abs(delta) < 4) return;
      if (!state.moved) { state.moved = true; setDragging(true); }
      state.samples.push({ t: performance.now(), y: e.clientY }); if (state.samples.length > 12) state.samples.shift();
      y.set(followPointer(state.startY, delta));
    };
    const end = (e: PointerEvent) => {
      if (e.pointerId !== state.id) return;
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", end); window.removeEventListener("pointercancel", end);
      drag.current = null; setDragging(false);
      if (!state.moved) return;
      swallowClick.current = true; window.setTimeout(() => { swallowClick.current = false; }, 0);
      const velocity = releaseVelocity(state.samples, performance.now());
      const target = e.type === "pointercancel" ? { kind: "detent" as const, index: detentRef.current } : resolveRelease(y.get(), velocity, layRef.current.stops, layRef.current.closedY);
      if (target.kind === "dismiss") dismiss(velocity); else settle(target.index, velocity);
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", end); window.addEventListener("pointercancel", end);
  };

  // ----- keyboard, focus, scroll lock -----
  const focusable = () => Array.from(surface.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? []).filter(node => !node.hasAttribute("inert") && node.getClientRects().length > 0);
  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); dismiss(); return; }
    if (event.key === "Tab") {
      const nodes = focusable(); if (!nodes.length) { event.preventDefault(); return; }
      const index = nodes.indexOf(document.activeElement as HTMLElement);
      if (event.shiftKey && (index <= 0)) { event.preventDefault(); nodes[nodes.length - 1].focus(); }
      else if (!event.shiftKey && (index === nodes.length - 1 || index < 0)) { event.preventDefault(); nodes[0].focus(); }
      return;
    }
    const onGrabber = event.target === grabber.current;
    if (onGrabber) {
      const next = keyboardDetent(event.key, detentRef.current, sorted.length);
      if (next !== null && (event.key !== "Enter" && event.key !== " ")) { event.preventDefault(); if (next !== detentRef.current) settle(next); }
      return;
    }
    // on the sheet itself: the first Space / ArrowDown / PageDown opens it fully, then the content scrolls
    if ((event.target === surface.current || event.target === body.current) && ["ArrowDown", "PageDown", " "].includes(event.key) && detentRef.current < last) { event.preventDefault(); settle(last); }
  };
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // The page behind stays still and out of reach while the sheet is open
    const host = surface.current?.closest(".bs-root");
    const focusBack = returnFocus;
    const siblings = Array.from(document.body.children).filter(node => node !== host && node instanceof HTMLElement) as HTMLElement[];
    const saved = siblings.map(node => ({ node, inert: node.inert, hidden: node.getAttribute("aria-hidden") }));
    for (const { node } of saved) { node.inert = true; node.setAttribute("aria-hidden", "true"); }
    const overflow = document.body.style.overflow; document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() => surface.current?.focus({ preventScroll: true }));
    return () => {
      cancelAnimationFrame(frame);
      for (const { node, inert, hidden } of saved) { node.inert = inert; if (hidden === null) node.removeAttribute("aria-hidden"); else node.setAttribute("aria-hidden", hidden); }
      document.body.style.overflow = overflow;
      const target = focusBack?.current ?? previous;
      if (target?.isConnected) target.focus({ preventScroll: true });
    };
    // The page is given back as soon as the sheet starts to leave, not when its spring has finished
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reacts to `open` only
  }, [open]);
  // Tabbing to something below the fold opens the sheet so the focused element can be seen
  const onFocus = (event: ReactFocusEvent) => {
    if (detentRef.current >= last || !body.current?.contains(event.target)) return;
    const rect = (event.target as HTMLElement).getBoundingClientRect();
    if (rect.bottom > window.innerHeight - 8) settle(last);
  };

  const label = expanded ? "Collapse sheet" : "Expand sheet";
  return <CloseContext.Provider value={() => dismiss()}>
    <motion.div ref={overlay} className="bs-overlay" data-state={open ? "open" : "closed"} style={{ opacity: overlayOpacity }} onPointerDown={event => { if (event.target === event.currentTarget) dismiss(); }} />
    <motion.div ref={surface} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={description ? `${id}-description` : undefined} tabIndex={-1} className={`bs-sheet ${className}`}
      data-state={open ? "open" : "closed"} data-dragging={dragging ? "" : undefined} data-expanded={expanded ? "" : undefined} data-scrolled={scrolled ? "" : undefined}
      style={{ "--sheet-max": lay.max, "--sheet-extension": `${SHEET.extension}px`, y, opacity: fade } as never} onKeyDown={onKeyDown} onFocusCapture={onFocus}>
      <div ref={head} className="bs-header" onPointerDown={event => { if ((event.target as Element).closest("[data-no-drag]")) return; startDrag(event, false); }}>
        <button ref={grabber} type="button" className="bs-grabber" data-grabber="" aria-label={uiText(label)} aria-expanded={expanded}
          onClick={() => { if (swallowClick.current) return; const next = keyboardDetent("Enter", detentRef.current, sorted.length); if (next !== null) settle(next); }}>
          <span className="bs-grabber-bar" aria-hidden="true" />
        </button>
        <div className="bs-head-row">
          <div className="bs-head-text"><h2 id={`${id}-title`} className="bs-title">{uiText(title)}</h2>{description && <p id={`${id}-description`} className="bs-description">{uiText(description)}</p>}</div>
          <button type="button" className="bs-close" data-no-drag="" aria-label={uiText(closeLabel)} onClick={() => dismiss()}><X size={15} strokeWidth={1.75} aria-hidden="true" /></button>
        </div>
      </div>
      <div ref={body} className="bs-body" onScroll={event => setScrolled((event.currentTarget as HTMLElement).scrollTop > 0)}
        onPointerDown={event => { if (event.pointerType === "touch" && detentRef.current < last) startDrag(event, true); }}>
        {children}
      </div>
      <span className="bs-sr" role="status" aria-live="polite">{uiText(announce)}</span>
    </motion.div>
  </CloseContext.Provider>;
}

/** A modal sheet that rises from the bottom edge and rests at one or more detents, with drag, flick and keyboard control. */
export function BottomSheet(props: BottomSheetProps) {
  const [mounted, setMounted] = useState(props.open);
  const [theme, setTheme] = useState<string | undefined>();
  if (props.open && !mounted) setMounted(true);
  // The theme of the page that opened the sheet: the sheet lives in the body, outside the page's own variables
  useEffect(() => {
    if (!props.open) return;
    const source = document.activeElement instanceof Element ? document.activeElement : document.body;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read from the DOM when the sheet opens
    setTheme(source.closest("[data-theme]")?.getAttribute("data-theme") ?? document.documentElement.getAttribute("data-theme") ?? undefined);
  }, [props.open]);
  const closed = useCallback(() => setMounted(false), []);
  if (!mounted || typeof document === "undefined") return null;
  return createPortal(<div className="bs-root" data-theme={theme} data-reduced-transparency="">
    <Surface key="surface" {...props} onClosed={closed} />
  </div>, document.body);
}
