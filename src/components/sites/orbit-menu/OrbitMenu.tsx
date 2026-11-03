"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { fitOrbit, orbitCaption, orbitPoints, orbitTarget, type OrbitBoundary, type OrbitPoint } from "./orbit-geometry";
import "./orbit-menu.css";

export interface OrbitAction {
  id: string;
  label: string;
  icon: ReactNode;
  done?: string;
  tone?: "neutral" | "danger";
  disabled?: boolean;
  description?: string;
  /** Pressed while the menu is open: a single letter or a key name such as `Delete`. */
  hotkey?: string;
}

export interface OrbitMenuProps {
  actions: OrbitAction[];
  onAction: (id: string) => void | Promise<void>;
  label?: string;
  triggerLabel?: string;
  className?: string;
  triggerSize?: number;
  radius?: number;
  spread?: number;
  direction?: number;
  boundary?: OrbitBoundary;
  disabled?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onBeforeOpen?: () => void;
  onError?: (error: unknown) => void;
  reducedMotion?: boolean;
  /**
   * Opens the menu at a point of the viewport (a context menu) instead of from a button in the flow: the trigger is drawn
   * there, as the close button at the middle of the fan, and hidden again once the menu has folded away. Control it with `open`.
   */
  anchor?: OrbitPoint;
  /** With `anchor`: the theme and motion setting of the element that was clicked, since the menu itself lives in the body. */
  theme?: string;
  motionOff?: boolean;
  /** With `anchor`: put the keyboard focus on the middle button when it opens, so arrows, letters and Escape work at once. */
  autoFocus?: boolean;
}

interface Placement { origin: OrbitPoint; direction: number; spread: number; radius: number; theme: string | undefined; motionOff: boolean; font: string }

export function OrbitMenu({ actions, onAction, label = "Actions", triggerLabel = label, className = "", triggerSize = 56, radius = 104, spread = 150, direction = -90, boundary, disabled = false, open: controlledOpen, onOpenChange, onBeforeOpen, onError, reducedMotion = false, anchor, theme: themeOverride, motionOff: motionOverride, autoFocus = true }: OrbitMenuProps) {
  const { t: uiText } = useWorkspaceI18n();
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const caption = useRef<HTMLSpanElement>(null);
  const [captionSize, setCaptionSize] = useState({ width: 180, height: 32 });
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const [localOpen, setLocalOpen] = useState(false);
  const open = controlledOpen ?? localOpen;
  const [placement, setPlacement] = useState<Placement>();
  const [active, setActive] = useState(-1);
  const [focused, setFocused] = useState(0);
  const [result, setResult] = useState<string>();
  const [pending, setPending] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [pointer, setPointer] = useState<OrbitPoint>();
  const gesture = useRef<{ id: number; start: number; x: number; y: number; moved: boolean; wasOpen: boolean } | null>(null);
  const ignoreClick = useRef(false);
  const targetRef = useRef(-1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A fan worked out for another point is not used: the menu is placed again where it was just asked for.
  const placed = placement && (!anchor || (Math.abs(placement.origin.x - anchor.x) < 0.5 && Math.abs(placement.origin.y - anchor.y) < 0.5)) ? placement : undefined;
  const prefersReducedMotion = useReducedMotion();
  const reduce = prefersReducedMotion || reducedMotion || placed?.motionOff;
  const mounted = useRef(true);

  const updatePlacement = useCallback(() => {
    const element = trigger.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const origin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const bounds = boundary ?? { left: 8, top: 8, right: window.innerWidth - 8, bottom: window.innerHeight - 8 };
    const theme = themeOverride ?? element.closest("[data-theme]")?.getAttribute("data-theme") ?? document.documentElement.getAttribute("data-theme") ?? undefined;
    const motionOff = motionOverride ?? element.closest('[data-ui-motion="off"]') !== null;
    setPlacement({ origin, ...fitOrbit(origin, actions.length, bounds, radius, spread, direction), theme, motionOff, font: getComputedStyle(element).fontFamily });
  }, [actions.length, boundary, radius, spread, direction, themeOverride, motionOverride]);

  const changeOpen = useCallback((next: boolean, restoreFocus = false) => {
    if (next && (disabled || pending || !actions.length)) return;
    if (next) { onBeforeOpen?.(); updatePlacement(); setResult(undefined); }
    setLocalOpen(next);
    onOpenChange?.(next);
    setActive(-1); targetRef.current = -1; setPointer(undefined);
    if (!next) { setDragging(false); if (restoreFocus) trigger.current?.focus({ preventScroll: true }); }
  }, [actions.length, disabled, pending, onBeforeOpen, onOpenChange, updatePlacement]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; if (timer.current) clearTimeout(timer.current); };
  }, []);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!trigger.current?.contains(target) && !layer.current?.contains(target)) changeOpen(false);
    };
    const cancelOnViewportChange = () => changeOpen(false);
    document.addEventListener("pointerdown", dismiss, true);
    window.addEventListener("resize", cancelOnViewportChange);
    // Scroll can move the map underneath a portaled menu; close rather than leave an orphan.
    window.addEventListener("scroll", cancelOnViewportChange, true);
    return () => {
      document.removeEventListener("pointerdown", dismiss, true);
      window.removeEventListener("resize", cancelOnViewportChange);
      window.removeEventListener("scroll", cancelOnViewportChange, true);
    };
  }, [open, changeOpen]);

  useEffect(() => {
    if (!open || !disabled) return;
    const frame = requestAnimationFrame(() => changeOpen(false));
    return () => cancelAnimationFrame(frame);
  }, [disabled, open, changeOpen]);

  useEffect(() => {
    if (!open || placed) return;
    const frame = requestAnimationFrame(updatePlacement);
    return () => cancelAnimationFrame(frame);
  }, [open, placed, updatePlacement]);

  useEffect(() => {
    if (!anchor || !open || !placed || !autoFocus) return;
    trigger.current?.focus({ preventScroll: true });
  }, [anchor, open, placed, autoFocus]);

  // A menu opened from outside (a context menu) starts clean: nothing lit, no earlier result.
  useEffect(() => {
    if (!anchor || !open) return;
    const frame = requestAnimationFrame(() => { setActive(-1); setFocused(0); setResult(undefined); setPointer(undefined); targetRef.current = -1; });
    return () => cancelAnimationFrame(frame);
  }, [anchor, open]);

  const fire = async (index: number) => {
    const action = actions[index];
    if (!action || action.disabled || pending) return;
    setPending(true);
    try {
      await onAction(action.id);
      if (!mounted.current) return;
      setResult(action.done ?? action.label);
      changeOpen(false, true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => { if (mounted.current) setResult(undefined); }, 1400);
    } catch (error) {
      if (mounted.current) { setResult("Action failed"); changeOpen(false, true); }
      onError?.(error);
    } finally { if (mounted.current) setPending(false); }
  };

  const focusItem = (index: number) => {
    if (!actions.length) return;
    const next = (index + actions.length) % actions.length;
    setFocused(next); setActive(next); targetRef.current = next;
    requestAnimationFrame(() => items.current[next]?.focus({ preventScroll: true }));
  };

  const onKeyDown = (event: KeyboardEvent, fromTrigger = false) => {
    event.stopPropagation();
    if (event.key === "Escape") { event.preventDefault(); changeOpen(false, true); return; }
    if (event.key === "Tab") { changeOpen(false); trigger.current?.focus({ preventScroll: true }); return; }
    if (open && !event.ctrlKey && !event.metaKey && !event.altKey && !event.repeat) {
      const key = event.key.toLowerCase();
      const index = actions.findIndex(action => action.hotkey?.toLowerCase() === key);
      if (index >= 0) {
        event.preventDefault();
        // An unavailable action is not run: it lights up so the pill says why.
        if (actions[index].disabled) { setActive(index); setFocused(index); targetRef.current = index; } else void fire(index);
        return;
      }
    }
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      if (!open) changeOpen(true);
      const index = event.key === "Home" ? 0 : event.key === "End" ? actions.length - 1 : fromTrigger ? event.key === "ArrowUp" ? actions.length - 1 : 0 : focused + (["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 1);
      focusItem(index);
    } else if (fromTrigger && ["Enter", " "].includes(event.key)) {
      event.preventDefault();
      if (open) changeOpen(false); else { changeOpen(true); focusItem(0); }
    }
  };

  const points = placed ? orbitPoints(actions.length, placed.radius, placed.spread, placed.direction) : [];
  const currentAction = active >= 0 ? actions[active] : undefined;
  const hint = !pending && !result && currentAction && !currentAction.disabled ? currentAction.hotkey : undefined;
  const pill = pending ? "Working…" : result ?? (currentAction?.disabled ? currentAction.description ?? `${currentAction.label} unavailable` : currentAction?.label) ?? (dragging && pointer && Math.hypot(pointer.x, pointer.y) > 34 ? "Release to cancel" : label);
  const spring = reduce ? { duration: 0.1 } : { type: "spring" as const, stiffness: 410, damping: 25, mass: 0.65 };
  const originStyle = placed ? { left: placed.origin.x, top: placed.origin.y, fontFamily: placed.font, "--orbit-trigger-size": `${triggerSize}px` } as CSSProperties : undefined;
  const rootStyle = { "--orbit-trigger-size": `${triggerSize}px`, ...(anchor ? { left: anchor.x - triggerSize / 2, top: anchor.y - triggerSize / 2 } : {}) } as CSSProperties;
  const portalTheme = placed?.theme ?? themeOverride;
  const captionBounds = boundary ?? { left: 8, top: 8, right: typeof window === "undefined" ? 1024 : window.innerWidth - 8, bottom: typeof window === "undefined" ? 768 : window.innerHeight - 8 };
  const captionAt = placed ? orbitCaption(placed.origin, points, captionBounds, captionSize, triggerSize, placed.direction) : { x: 0, y: 0 };
  useLayoutEffect(() => {
    const element = caption.current;
    if (!element) return;
    const measure = () => {
      const width = element.offsetWidth, height = element.offsetHeight;
      setCaptionSize(current => current.width === width && current.height === height ? current : { width, height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [placed, open, result]);

  const root = <span className={`orbit-menu ${className}`} style={rootStyle} data-open={open || undefined} data-pending={pending || undefined} data-anchored={anchor ? "" : undefined} data-result={result ? "" : undefined} data-theme={anchor ? themeOverride : undefined}>
    <button ref={trigger} type="button" className="orbit-menu-trigger" data-orbit-trigger="" aria-label={uiText(triggerLabel)} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} disabled={disabled || pending || !actions.length}
      onKeyDown={event => onKeyDown(event, true)} onContextMenu={event => event.preventDefault()}
      onClick={event => {
        event.stopPropagation();
        if (ignoreClick.current) { ignoreClick.current = false; return; }
        // Lifting the finger that long-pressed lands a click on the button that just appeared under it. A press on the button
        // is handled by its pointer events, so a context menu only takes clicks that come from the keyboard (detail 0).
        if (anchor && event.detail !== 0) return;
        changeOpen(!open);
      }}
      onPointerDown={event => {
        if (event.button !== 0 || disabled || pending) return;
        event.stopPropagation(); event.preventDefault();
        gesture.current = { id: event.pointerId, start: performance.now(), x: event.clientX, y: event.clientY, moved: false, wasOpen: open };
        event.currentTarget.setPointerCapture(event.pointerId);
        if (!open) changeOpen(true);
      }}
      onPointerMove={event => {
        const press = gesture.current;
        if (!press || press.id !== event.pointerId || !placed) return;
        event.stopPropagation();
        if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > 7) press.moved = true;
        if (!press.moved) return;
        setDragging(true);
        const relative = { x: event.clientX - placed.origin.x, y: event.clientY - placed.origin.y };
        setPointer(relative);
        const target = orbitTarget(relative, actions.length, placed.spread, placed.direction);
        const next = target >= 0 && !actions[target]?.disabled ? target : -1;
        targetRef.current = next; setActive(next);
      }}
      onPointerUp={event => {
        const press = gesture.current;
        if (!press || press.id !== event.pointerId) return;
        event.stopPropagation(); event.preventDefault();
        gesture.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        ignoreClick.current = true;
        if (press.moved && targetRef.current >= 0) void fire(targetRef.current);
        else if (press.moved || performance.now() - press.start > 400 || press.wasOpen) changeOpen(false, true);
        else trigger.current?.focus({ preventScroll: true });
        setDragging(false);
      }}
      onPointerCancel={() => { gesture.current = null; ignoreClick.current = true; changeOpen(false); }}
      onLostPointerCapture={() => { if (gesture.current) { gesture.current = null; changeOpen(false); } }}>
      <svg viewBox="0 0 24 24" className="orbit-menu-glyph" aria-hidden="true">
        <motion.path d={result ? "M5 12 10 17 19 7" : open ? "M7 7 17 17 M17 7 7 17" : "M5 12h.01 M12 12h.01 M19 12h.01"} animate={{ rotate: open ? 90 : 0 }} transition={spring} fill="none" stroke="currentColor" strokeWidth={open || result ? 2 : 3.5} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
    <span className="orbit-menu-sr" role="status" aria-live="polite">{uiText(result)}</span>
    {placed && createPortal(<div className="orbit-menu-portal" inert={!open} data-theme={portalTheme} data-ui-motion={placed.motionOff ? "off" : undefined} data-reduced-motion={reduce || undefined} style={originStyle} ref={layer} onPointerDown={event => event.stopPropagation()} onContextMenu={event => event.preventDefault()} onKeyDown={event => onKeyDown(event)}>
      <AnimatePresence>
        {(open || result) && <motion.div key="pill" className="orbit-menu-pill-anchor" style={{ left: captionAt.x, top: captionAt.y }} initial={{ opacity: 0, scale: 0.75, filter: reduce ? "none" : "blur(4px)" }} animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }} exit={{ opacity: 0, scale: reduce ? 1 : 0.8 }} transition={spring}>
          <motion.span ref={caption} className="orbit-menu-pill" style={{ maxWidth: Math.min(260, Math.max(0, captionBounds.right - captionBounds.left - 16)) }} layout={reduce ? false : "size"} transition={spring}><AnimatePresence mode="popLayout" initial={false}><motion.span key={pill} initial={{ opacity: 0, y: reduce ? 0 : 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduce ? 0 : -5 }} transition={{ duration: 0.12 }}>{result && <span className="orbit-menu-done" aria-hidden="true">✓ </span>}{uiText(pill)}{hint && <kbd className="orbit-menu-key" aria-hidden="true">{uiText(hint)}</kbd>}</motion.span></AnimatePresence></motion.span>
        </motion.div>}
        {open && <motion.div key="menu" id={id} role="menu" aria-label={uiText(label)} aria-orientation="horizontal" className="orbit-menu-actions" initial="closed" animate="open" exit="closed">
          <svg className="orbit-menu-track" width="1" height="1" aria-hidden="true">{[-1, 1].map(side => {
            const center = orbitPoints(1, placed.radius, 0, placed.direction)[0];
            const end = orbitPoints(1, placed.radius, 0, placed.direction + side * placed.spread / 2)[0];
            return <motion.path key={side} d={`M${center.x} ${center.y} A${placed.radius} ${placed.radius} 0 0 ${side > 0 ? 1 : 0} ${end.x} ${end.y}`} variants={{ open: { pathLength: 1, opacity: 1 }, closed: { pathLength: 0, opacity: 0 } }} transition={{ duration: reduce ? 0.1 : 0.25 }} />;
          })}</svg>
          <AnimatePresence>{active >= 0 && points[active] && <motion.span key="lens" aria-hidden="true" className="orbit-menu-lens" data-danger={currentAction?.tone === "danger" || undefined} initial={{ opacity: 0, scale: 0.5, x: points[active].x, y: points[active].y }} animate={{ opacity: 1, scale: 1.08, x: points[active].x, y: points[active].y }} exit={{ opacity: 0, scale: 0.5 }} transition={spring} />}</AnimatePresence>
          {actions.map((action, index) => {
            const point = points[index];
            const magnet = !reduce && pointer && !dragging && Math.hypot(pointer.x - point.x, pointer.y - point.y) < 80 ? { x: (pointer.x - point.x) * 0.08, y: (pointer.y - point.y) * 0.08 } : { x: 0, y: 0 };
            const folded = orbitPoints(1, placed.radius * 0.2, 0, placed.direction + (index - actions.length / 2) * 9)[0];
            return <motion.button ref={element => { items.current[index] = element; }} key={action.id} type="button" role="menuitem" aria-label={uiText(action.label)} aria-describedby={action.description ? `${id}-description-${index}` : undefined} aria-disabled={action.disabled || pending || undefined} title={uiText(action.disabled ? action.description : undefined)} tabIndex={focused === index ? 0 : -1} className="orbit-menu-item" data-active={active === index || undefined} data-danger={action.tone === "danger" || undefined}
              variants={{ open: { x: point.x + magnet.x, y: point.y + magnet.y, opacity: 1, scale: 1, filter: "blur(0px)", transition: { ...spring, delay: reduce ? 0 : index * 0.025 } }, closed: { x: reduce ? point.x : folded.x, y: reduce ? point.y : folded.y, opacity: 0, scale: reduce ? 1 : 0.45, filter: reduce ? "none" : "blur(3px)", transition: { duration: reduce ? 0.1 : 0.18, delay: reduce ? 0 : (actions.length - index - 1) * 0.018 } } }}
              onFocus={() => { setFocused(index); setActive(index); }} onBlur={() => { if (!dragging) setActive(-1); }}
              onPointerEnter={event => { if (event.pointerType !== "touch") { setActive(index); targetRef.current = index; } }}
              onPointerMove={event => { if (event.pointerType !== "touch") setPointer({ x: event.clientX - placed.origin.x, y: event.clientY - placed.origin.y }); }}
              onPointerLeave={() => { if (!dragging) { setActive(-1); setPointer(undefined); } }}
              onClick={event => { event.stopPropagation(); void fire(index); }}><span>{uiText(action.icon)}</span>{action.description && <span className="orbit-menu-sr" id={`${id}-description-${index}`}>{uiText(action.description)}</span>}</motion.button>;
          })}
        </motion.div>}
      </AnimatePresence>
    </div>, document.body)}
  </span>;
  return anchor ? createPortal(root, document.body) : root;
}
