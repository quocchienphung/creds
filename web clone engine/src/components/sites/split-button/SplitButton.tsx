"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { animate, useMotionValue } from "motion/react";
import { ChevronDown } from "lucide-react";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import { ConfirmMorph } from "../skilled/ui/ConfirmMorph";
import { MENU, MORPH, matchTyped, menuStart, morphGlyphs, nextEnabled, placeMenu } from "./split-button-model";
import type { Glyph, MenuPlacement } from "./split-button-model";
import "./split-button.css";

export interface SplitButtonAction {
  id?: string;
  label: string;
  onSelect?: () => void;
  disabled?: boolean;
  destructive?: boolean;
  icon?: ReactNode;
  /** Asks inside the menu instead of running at once: the item morphs into a question with Cancel and a confirm answer (UIArc's Confirm morph, see skilled/ui/ConfirmMorph). */
  confirm?: SplitButtonConfirm;
}
export interface SplitButtonConfirm {
  /** the question, short: it shares the row with two answers */
  prompt?: string;
  confirmLabel?: string; pendingLabel?: string; doneLabel?: string; undoLabel?: string;
  onConfirm: () => void | Promise<unknown>;
  /** adds Undo to the result */
  onUndo?: () => void | Promise<unknown>;
  /** ms the result stays before the menu closes */
  resultTimeout?: number;
}
export interface SplitButtonProps {
  /** The main action's label. When it changes the letters morph in place and the width springs. */
  label: string;
  actions: SplitButtonAction[];
  onClick?: () => void;
  /** Leading icon of the main half. A different icon element crossfades in. */
  icon?: ReactNode;
  variant?: "primary" | "secondary";
  /** `md` and `sm` are the source's two heights (44 and 36px); `compact` is a 30px version for toolbars and pills. */
  size?: "md" | "sm" | "compact";
  disabled?: boolean;
  /** Names the chevron button. Defaults to "<label> more actions". */
  menuLabel?: string;
  className?: string;
  /** The menu takes the colours the group declares (--sb-surface, --sb-fg, --sb-border, --sb-muted, --sb-focus, --sb-danger) instead of its own light/dark pair. */
  matchColors?: boolean;
}

/** The letters of the main label: shared letters stay, new ones rise from a blur, old ones fade out of the flow. */
function MorphLabel({ text, motionOff }: { text: string; motionOff: boolean }) {
  const [glyphs, setGlyphs] = useState<Glyph[]>(() => Array.from(text).map((char, index) => ({ id: index, char, state: "stay" as const })));
  const [seen, setSeen] = useState(text);
  if (seen !== text) {
    // derived while rendering: the new letters are known as soon as the label changes
    const base = glyphs.reduce((highest, glyph) => Math.max(highest, glyph.id), -1);
    const counter = { id: base };
    const next = morphGlyphs(glyphs, text, () => { counter.id += 1; return counter.id; });
    setSeen(text); setGlyphs(next);
  }
  useEffect(() => {
    const done = window.setTimeout(() => setGlyphs(current => current.some(glyph => glyph.state !== "stay") ? current.filter(glyph => glyph.state !== "out").map(glyph => glyph.state === "in" ? { ...glyph, state: "stay" as const } : glyph) : current), motionOff ? 0 : Math.max(MORPH.enter.blur, MORPH.leave.duration) * 1000 + 160);
    return () => window.clearTimeout(done);
  }, [seen, motionOff]);
  // each new letter starts a little after the one before it
  const order = glyphs.filter(glyph => glyph.state === "in").map(glyph => glyph.id);
  return <span className="sb-glyphs" aria-hidden="true">
    {glyphs.map(glyph => {
      const style = glyph.state === "in" && !motionOff ? { animationDelay: `${(order.indexOf(glyph.id) * MORPH.enter.stagger).toFixed(3)}s` } as CSSProperties : undefined;
      return <span key={glyph.id} className="sb-glyph" data-state={glyph.state} style={style}>{glyph.char}</span>;
    })}
  </span>;
}

/** An icon that crossfades when the element changes. */
function IconPhase({ icon }: { icon: ReactNode }) {
  const { t: uiText } = useWorkspaceI18n();
  const [phases, setPhases] = useState<{ key: number; node: ReactNode; leaving: boolean }[]>([{ key: 0, node: icon, leaving: false }]);
  const current = useRef(icon), counter = useRef(0);
  useEffect(() => {
    if (current.current === icon) return;
    current.current = icon;
    counter.current += 1;
    const key = counter.current;
    setPhases(list => [...list.map(phase => ({ ...phase, leaving: true })), { key, node: icon, leaving: false }]);
    const done = window.setTimeout(() => setPhases(list => list.filter(phase => !phase.leaving)), 220);
    return () => window.clearTimeout(done);
  }, [icon]);
  return <span className="sb-icon">{phases.map(phase => <span key={phase.key} className="sb-icon-phase" data-leaving={phase.leaving ? "" : undefined}>{uiText(phase.node)}</span>)}</span>;
}

interface MenuState { placement: MenuPlacement | null; theme: string | undefined; closing: boolean; by: "keyboard" | "pointer"; tokens?: CSSProperties }
const COLOR_TOKENS = ["--sb-surface", "--sb-fg", "--sb-border", "--sb-muted", "--sb-focus", "--sb-danger"] as const;

export function SplitButton({ label, actions, onClick, icon, variant = "primary", size = "md", disabled = false, menuLabel, className = "", matchColors = false }: SplitButtonProps) {
  const { t: uiText } = useWorkspaceI18n();
  const id = useId();
  const group = useRef<HTMLDivElement>(null);
  const primary = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLSpanElement>(null);
  const slot = useRef<HTMLSpanElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const items = useRef<(HTMLDivElement | null)[]>([]);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [highlighted, setHighlighted] = useState(-1);
  /** the item that is asking (or showing its result): it keeps the focus and the pointer leaves it alone */
  const [busy, setBusy] = useState<number | null>(null);
  const busyPhase = useRef("idle");
  const [motionOff, setMotionOff] = useState(false);
  const typed = useRef({ text: "", timer: 0 });
  const width = useMotionValue(0);
  const measured = useRef(false);
  const open = menu !== null && !menu.closing;
  const enabled = useMemo(() => actions.map(action => !action.disabled), [actions]);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const read = () => setMotionOff(query.matches || group.current?.closest('[data-ui-motion="off"]') !== null);
    read(); query.addEventListener("change", read);
    return () => query.removeEventListener("change", read);
  }, []);

  // The main label's width follows its content: measured once, then sprung whenever the content's width changes.
  useLayoutEffect(() => {
    const element = content.current, outer = slot.current;
    if (!element || !outer) return;
    let controls: { stop(): void } | undefined, clear = 0;
    const apply = (target: number, first: boolean) => {
      controls?.stop(); window.clearTimeout(clear);
      const from = width.get();
      if (first || motionOff || Math.abs(from - target) < 0.5) { width.set(target); outer.style.width = `${target}px`; return; }
      outer.setAttribute("data-morphing", "");
      controls = animate(width, target, { ...MORPH.width, delay: target > from ? MORPH.growDelay : 0, onUpdate: value => { outer.style.width = `${value}px`; }, onComplete: () => outer.removeAttribute("data-morphing") });
      clear = window.setTimeout(() => outer.removeAttribute("data-morphing"), 1500);
    };
    const observer = new ResizeObserver(entries => {
      const size = entries[0]?.borderBoxSize?.[0]?.inlineSize ?? element.offsetWidth;
      const first = !measured.current; measured.current = true;
      apply(size, first);
    });
    observer.observe(element);
    return () => { observer.disconnect(); controls?.stop(); window.clearTimeout(clear); };
  }, [motionOff, width]);

  // ----- the menu -----
  const closeMenu = useCallback((returnFocus = true) => {
    setMenu(current => current && !current.closing ? { ...current, closing: true } : current);
    if (returnFocus) trigger.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    if (!menu?.closing) return;
    const done = window.setTimeout(() => { setMenu(null); setHighlighted(-1); }, motionOff ? 0 : MENU.closeMs);
    return () => window.clearTimeout(done);
  }, [menu?.closing, motionOff]);

  function openMenu(by: "keyboard" | "pointer", first: "first" | "last" | "none" = by === "keyboard" ? "first" : "none") {
    if (disabled || !actions.length) return;
    const element = group.current;
    let tokens: CSSProperties | undefined;
    if (matchColors && element) {
      const computed = getComputedStyle(element);
      tokens = {};
      for (const name of COLOR_TOKENS) { const value = computed.getPropertyValue(name).trim(); if (value) (tokens as Record<string, string>)[name] = value; }
    }
    setBusy(null); busyPhase.current = "idle";
    setMenu({ tokens, placement: null, theme: element?.closest("[data-theme]")?.getAttribute("data-theme") ?? document.documentElement.getAttribute("data-theme") ?? undefined, closing: false, by });
    setHighlighted(first === "first" ? nextEnabled(enabled, -1, 1) : first === "last" ? nextEnabled(enabled, 0, -1) : -1);
  }
  const place = useCallback(() => {
    const element = menuRef.current, anchor = group.current?.getBoundingClientRect(), button = trigger.current?.getBoundingClientRect();
    if (!element || !anchor || !button) return;
    // Make the browser compute the style of the not-yet-placed menu, or the transition to the open state would never start
    void getComputedStyle(element).opacity;
    const placement = placeMenu({ left: anchor.left, right: anchor.right, top: button.top, bottom: button.bottom, width: anchor.width, height: button.height }, { width: element.offsetWidth, height: element.scrollHeight + 2 }, { width: window.innerWidth, height: window.innerHeight });
    setMenu(current => current && (current.placement?.x !== placement.x || current.placement?.y !== placement.y || current.placement?.side !== placement.side || current.placement?.maxHeight !== placement.maxHeight) ? { ...current, placement } : current);
  }, []);
  const menuOpen = menu !== null && !menu.closing;
  useLayoutEffect(() => { if (menuOpen) place(); }, [menuOpen, place]);
  useEffect(() => {
    if (!menu || menu.closing) return;
    const reposition = () => place();
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || group.current?.contains(target)) return;
      closeMenu(false);
    };
    window.addEventListener("resize", reposition); window.addEventListener("scroll", reposition, true);
    document.addEventListener("pointerdown", outside, true);
    return () => { window.removeEventListener("resize", reposition); window.removeEventListener("scroll", reposition, true); document.removeEventListener("pointerdown", outside, true); };
  }, [menu, place, closeMenu]);
  const menuPlaced = !!menu?.placement && !menu.closing;
  // The menu takes the focus once it is placed: the highlighted item for the keyboard, the menu itself for a pointer.
  useEffect(() => {
    if (!menuPlaced) return;
    const frame = requestAnimationFrame(() => { (highlighted >= 0 ? items.current[highlighted] : menuRef.current)?.focus({ preventScroll: true }); });
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when it has just been placed
  }, [menuPlaced]);

  const highlight = (index: number) => { setHighlighted(index); items.current[index]?.focus({ preventScroll: true }); };
  function select(index: number) {
    const action = actions[index];
    if (!action || action.disabled) return;
    if (action.confirm) { items.current[index]?.querySelector<HTMLButtonElement>(".cm__trigger")?.click(); return; }
    closeMenu(true);
    // After the menu has handed the focus back: an action that opens a sheet or a dialog then takes it from the chevron.
    window.setTimeout(() => action.onSelect?.(), 0);
  }
  function onMenuKey(event: ReactKeyboardEvent) {
    const key = event.key;
    // while an item asks (or shows its result) its own buttons take the keys; Escape is answered by the morph
    if (key !== "Escape" && busyPhase.current !== "idle" && (event.target as HTMLElement).closest?.(".cm")) return;
    if (key === "Escape") { event.preventDefault(); event.stopPropagation(); closeMenu(true); }
    else if (key === "Tab") { closeMenu(false); }
    else if (key === "ArrowDown" || key === "ArrowUp") { event.preventDefault(); const next = nextEnabled(enabled, highlighted < 0 ? (key === "ArrowDown" ? -1 : 0) : highlighted, key === "ArrowDown" ? 1 : -1); if (next >= 0) highlight(next); }
    else if (key === "Home" || key === "End") { event.preventDefault(); const next = key === "Home" ? nextEnabled(enabled, -1, 1) : nextEnabled(enabled, 0, -1); if (next >= 0) highlight(next); }
    else if ((key === "Enter" || key === " ") && highlighted >= 0) { event.preventDefault(); select(highlighted); }
    else if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey && key !== " ") {
      window.clearTimeout(typed.current.timer);
      typed.current.text += key; typed.current.timer = window.setTimeout(() => { typed.current.text = ""; }, 600);
      const match = matchTyped(actions.map(action => action.label), enabled, typed.current.text, highlighted);
      if (match >= 0) highlight(match);
    }
  }

  const start = menu?.placement ? menuStart(menu.placement.side) : menuStart("bottom");
  const style = { ...menu?.tokens, "--sb-menu-x": `${start.x}px`, "--sb-menu-y": `${start.y}px`, left: menu?.placement?.x ?? 0, top: menu?.placement?.y ?? 0, maxHeight: menu?.placement?.maxHeight, transformOrigin: menu?.placement?.side === "top" ? "right bottom" : "right top", visibility: menu?.placement ? "visible" : "hidden" } as CSSProperties;
  const state = !menu ? undefined : menu.closing ? "closed" : menu.placement ? "open" : "pending";
  return <>
    <div ref={group} className={`sb-group ${className}`} data-variant={variant} data-size={size} data-open={open ? "" : undefined} data-disabled={disabled ? "" : undefined}>
      <button ref={primary} type="button" className="sb-primary" disabled={disabled} onClick={onClick}>
        <span ref={slot} className="sb-slot">
          <span ref={content} className="sb-content">
            {icon !== undefined && icon !== null && <IconPhase icon={icon} />}
            <MorphLabel text={label} motionOff={motionOff} />
          </span>
        </span>
        <span className="sb-sr">{uiText(label)}</span>
      </button>
      <button ref={trigger} type="button" className="sb-trigger" disabled={disabled} aria-label={uiText(menuLabel ?? uiText("{0} more actions", [label]))} aria-haspopup="menu" aria-expanded={open} aria-controls={menu ? `${id}-menu` : undefined} data-state={open ? "open" : "closed"}
        onPointerDown={event => { if (event.button !== 0 || event.pointerType === "touch") return; event.preventDefault(); if (open) closeMenu(false); else openMenu("pointer"); trigger.current?.focus({ preventScroll: true }); }}
        onClick={event => { if (event.detail === 0 || (event.nativeEvent as PointerEvent).pointerType === "touch") { if (open) closeMenu(false); else openMenu(event.detail === 0 ? "keyboard" : "pointer"); } }}
        onKeyDown={event => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); if (!open) openMenu("keyboard", event.key === "ArrowUp" ? "last" : "first"); } }}>
        <ChevronDown className="sb-chevron" size={16} aria-hidden="true" />
      </button>
      <span className="sb-sr" role="status" aria-live="polite">{uiText(label)}</span>
    </div>
    {menu && createPortal(<div ref={menuRef} id={`${id}-menu`} role="menu" aria-label={uiText(menuLabel ?? uiText("{0} actions", [label]))} aria-orientation="vertical" tabIndex={-1} className="sb-menu" data-state={state} data-confirmable={actions.some(action => action.confirm) ? "" : undefined} data-side={menu.placement?.side ?? "bottom"} data-theme={menu.theme} style={style} onKeyDown={onMenuKey}>
      {actions.map((action, index) => {
        const confirm = action.confirm, asking = busy === index;
        return <div key={action.id ?? action.label} ref={element => { items.current[index] = element; }} role="menuitem" tabIndex={-1} className="sb-item" data-destructive={action.destructive ? "" : undefined} data-highlighted={highlighted === index ? "" : undefined} data-disabled={action.disabled && !asking ? "" : undefined} data-confirm={confirm ? "" : undefined} data-asking={asking ? "" : undefined} aria-disabled={(action.disabled && !asking) || undefined}
          style={{ "--i": Math.min(index, MENU.maxStaggered) } as CSSProperties}
          onPointerMove={() => { if (!action.disabled && highlighted !== index) { if (asking) setHighlighted(index); else highlight(index); } }} onPointerLeave={() => { if (asking) return; if (highlighted === index) { setHighlighted(-1); menuRef.current?.focus({ preventScroll: true }); } }}
          onClick={event => { if (asking || (confirm && (event.target as HTMLElement).closest(".cm button"))) return; select(index); }}>
          {confirm
            ? <ConfirmMorph size="sm" className="sb-confirm" label={uiText(action.label)} icon={action.icon} ariaLabel={action.label} prompt={confirm.prompt ?? "Sure?"} confirmLabel={uiText(confirm.confirmLabel ?? "Delete")} pendingLabel={confirm.pendingLabel} doneLabel={confirm.doneLabel} undoLabel={confirm.undoLabel}
                disabled={action.disabled} resultTimeout={confirm.resultTimeout ?? 4000} onConfirm={confirm.onConfirm} onUndo={confirm.onUndo}
                onStateChange={phase => {
                  const before = busyPhase.current; busyPhase.current = phase;
                  setBusy(phase === "idle" ? current => (current === index ? null : current) : index);
                  setHighlighted(index);
                  // the result has stayed its time: the menu goes with it
                  if (phase === "idle" && (before === "done" || before === "error")) closeMenu(true);
                }} />
            : <>{action.icon && <span className="sb-item-icon">{uiText(action.icon)}</span>}<span>{uiText(action.label)}</span></>}
        </div>;
      })}
    </div>, document.body)}
  </>;
}
