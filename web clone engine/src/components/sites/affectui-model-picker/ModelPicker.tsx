"use client";
import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { interactionMotion } from "@/components/interaction/motion-tokens";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { Swap } from "./Swap";
import { useTween } from "./useTween";
import {
  BAR_SEGMENTS, captionFor, clampRating, effortLabels, efforts, formatPrice, formatSeconds, hasRatings, moveIndex, placeMenu, priceDecimals, rowLabel, spokenCaption, stepEffort,
} from "./model-picker-logic";
import type { Effort, PickerModel } from "./model-picker-logic";
import "./model-picker.css";

export type { Effort, PickerModel } from "./model-picker-logic";

export interface ModelPickerProps {
  /** The models to choose from. `icon` is a React node. */
  models: (Omit<PickerModel, "icon"> & { icon?: ReactNode })[];
  value?: string; defaultValue?: string; onChange?: (id: string) => void;
  thinking?: boolean; defaultThinking?: boolean; onThinkingChange?: (on: boolean) => void;
  webSearch?: boolean; defaultWebSearch?: boolean; onWebSearchChange?: (on: boolean) => void;
  effort?: Effort; defaultEffort?: Effort; onEffortChange?: (effort: Effort) => void;
  open?: boolean; defaultOpen?: boolean; onOpenChange?: (open: boolean) => void;
  /** Which edge of the trigger the menu lines up with. */
  align?: "start" | "end";
  /** Where the menu opens. "auto" opens below and flips above when there is not enough room. */
  side?: "auto" | "bottom" | "top";
  /** Hide the thinking or web search rows when the product does not offer them. Both are on by default. */
  features?: { thinking?: boolean; webSearch?: boolean };
  disabled?: boolean;
  className?: string;
}

function useControllable<T>(value: T | undefined, defaultValue: T, onChange?: (next: T) => void): [T, (next: T) => void] {
  const [inner, setInner] = useState(defaultValue);
  const controlled = value !== undefined;
  const set = useCallback((next: T) => { if (!controlled) setInner(next); onChange?.(next); }, [controlled, onChange]);
  return [controlled ? value : inner, set];
}

const webSearchHints = { off: "Answers from what it already knows", on: "Looks things up on the web when it helps" };
const GAP = 6;

function Bulb() { return <svg width="16" height="16" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M5.3 10.6h3.4M5.8 12.3h2.4M7 1.7a3.9 3.9 0 0 0-2.3 7c.4.3.6.7.6 1.1v.1h3.4v-.1c0-.4.2-.8.6-1.1A3.9 3.9 0 0 0 7 1.7Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function Globe() { return <svg width="16" height="16" viewBox="0 0 14 14" fill="none" aria-hidden="true"><circle cx="7" cy="7" r="5.3" stroke="currentColor" strokeWidth="1.2" /><path d="M1.9 7h10.2M7 1.7c1.4 1.5 2 3.3 2 5.3s-.6 3.8-2 5.3c-1.4-1.5-2-3.3-2-5.3s.6-3.8 2-5.3Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function Check() { return <svg className="mp__check" width="16" height="16" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="m3.4 7.3 2.4 2.4 4.8-5.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function Chevron() { return <svg className="mp__chevron" width="14" height="14" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="m3 4.5 3 3 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
const Glyph = ({ model }: { model: ModelPickerProps["models"][number] }) => <span className="mp__glyph" aria-hidden="true">{model.icon ?? model.name.charAt(0).toUpperCase()}</span>;

/**
 * The model menu of an AI chat: point at a model and its speed, quality and cost bars fill, switch on extended
 * thinking and its effort unfolds, while the footer rolls the first-token time and price. The menu is a native
 * popover (top layer), so no parent's overflow can cut it, and it flips above the trigger when it runs out of room.
 */
export function ModelPicker({
  models, value, defaultValue, onChange, thinking, defaultThinking = false, onThinkingChange, webSearch, defaultWebSearch = false, onWebSearchChange,
  effort, defaultEffort = "medium", onEffortChange, open, defaultOpen = false, onOpenChange, align = "start", side = "auto", features, disabled = false, className,
}: ModelPickerProps) {
  const { t: uiText } = useWorkspaceI18n();
  const uid = useId();
  const showThinking = features?.thinking !== false, showWebSearch = features?.webSearch !== false;
  const [modelId, setModelId] = useControllable(value, defaultValue ?? models[0]?.id ?? "", onChange);
  const [thinkingOn, setThinking] = useControllable(thinking, defaultThinking, onThinkingChange);
  const [webOn, setWeb] = useControllable(webSearch, defaultWebSearch, onWebSearchChange);
  const [level, setLevel] = useControllable(effort, defaultEffort, onEffortChange);
  const [isOpen, setOpen] = useControllable(open, defaultOpen, onOpenChange);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pointing, setPointing] = useState(false);
  const [webHover, setWebHover] = useState(false), [webFocus, setWebFocus] = useState(false);
  const [placedSide, setPlacedSide] = useState<"top" | "bottom">("bottom");

  // "auto" decides above/below once when the menu opens, so unfolding the effort row cannot flip it mid-use.
  const lockedSide = useRef<"top" | "bottom" | null>(null);
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), pop = useRef<HTMLDivElement>(null), card = useRef<HTMLDivElement>(null), list = useRef<HTMLDivElement>(null), group = useRef<HTMLDivElement>(null);
  const selected = models.find(model => model.id === modelId) ?? models[0];
  const activeModel = models.find(model => model.id === activeId) ?? selected;
  const litModel = pointing ? activeModel : selected;
  const anyRatings = models.some(hasRatings);
  const webHint = showWebSearch && (webHover || webFocus) ? (webOn ? webSearchHints.on : webSearchHints.off) : null;
  const caption = webHint ? { seconds: null, price: null, text: webHint, key: "text:" + webHint } : captionFor(litModel, thinkingOn, level);
  const stats = caption.key.startsWith("stats:");
  const seconds = useTween(caption.seconds ?? 0), price = useTween(caption.price ?? 0);

  const close = useCallback((restoreFocus: boolean) => {
    if (restoreFocus && pop.current?.contains(document.activeElement)) trigger.current?.focus();
    setOpen(false); setActiveId(null); setPointing(false); setWebHover(false); setWebFocus(false);
  }, [setOpen]);
  function openMenu() { if (!disabled) setOpen(true); }
  const pick = (id: string) => { setModelId(id); close(true); };

  // Place the menu next to the trigger: fixed coordinates in the top layer, anchored to the edge nearest the
  // trigger so it grows away from it when the effort row unfolds.
  const place = useCallback(() => {
    const panel = pop.current, button = trigger.current, body = card.current, rows = list.current;
    if (!panel || !button || !body || !rows) return;
    const rect = button.getBoundingClientRect(), width = Math.min(320, innerWidth - 32);
    const natural = body.offsetHeight - rows.clientHeight + rows.scrollHeight + (panel.querySelector<HTMLElement>(".mp__foot")?.offsetHeight ?? 36);
    const spot = placeMenu({ triggerTop: rect.top, triggerBottom: rect.bottom, viewportHeight: innerHeight, naturalHeight: natural, side: lockedSide.current ?? side, gap: GAP });
    if (!lockedSide.current) lockedSide.current = spot.side;
    const left = Math.max(8, Math.min(align === "end" ? rect.right - width : rect.left, innerWidth - width - 8));
    const style = panel.style;
    style.left = `${left}px`; style.maxHeight = `${spot.maxHeight}px`;
    if (spot.side === "bottom") { style.top = `${rect.bottom + GAP}px`; style.bottom = "auto"; } else { style.bottom = `${innerHeight - rect.top + GAP}px`; style.top = "auto"; }
    setPlacedSide(current => current === spot.side ? current : spot.side);
    // A long list scrolls inside the menu; the edges fade where there is more to see.
    rows.toggleAttribute("data-more-below", rows.scrollTop + rows.clientHeight < rows.scrollHeight - 1);
    rows.toggleAttribute("data-more-above", rows.scrollTop > 1);
  }, [align, side]);

  const measureThumb = useCallback(() => {
    const track = group.current; const current = track?.querySelector<HTMLButtonElement>('[aria-checked="true"]');
    if (!track || !current) return;
    track.style.setProperty("--x", `${current.offsetLeft}px`); track.style.setProperty("--w", `${current.offsetWidth}px`);
  }, []);

  // Open and close: the popover is shown first (so it can animate from its closed look), then marked open on the next frame.
  useEffect(() => {
    const host = root.current, panel = pop.current;
    if (!host || !panel) return;
    let frame = 0, timer = 0;
    lockedSide.current = null;
    if (isOpen) {
      if (!panel.matches(":popover-open")) panel.showPopover();
      place(); measureThumb();
      frame = requestAnimationFrame(() => { host.setAttribute("data-open", ""); panel.inert = false; list.current?.focus({ preventScroll: true }); });
    } else {
      host.removeAttribute("data-open"); panel.inert = true;
      timer = window.setTimeout(() => { if (panel.matches(":popover-open")) panel.hidePopover(); }, interactionMotion.exit);
    }
    return () => { cancelAnimationFrame(frame); window.clearTimeout(timer); };
  }, [isOpen, place, measureThumb]);
  useLayoutEffect(() => { if (isOpen) measureThumb(); }, [isOpen, level, thinkingOn, measureThumb]);

  // While open: follow the trigger (the chat layout can move under it), and close on an outside press.
  useEffect(() => {
    if (!isOpen) return;
    let frame = 0;
    const follow = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(place); };
    const observer = new ResizeObserver(follow);
    for (const element of [trigger.current, card.current, list.current, root.current?.parentElement]) if (element) observer.observe(element);
    window.addEventListener("resize", follow);
    document.addEventListener("scroll", follow, { capture: true, passive: true });
    window.visualViewport?.addEventListener("resize", follow);
    follow();
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target)) close(false); };
    document.addEventListener("pointerdown", outside, true);
    void document.fonts?.ready.then(measureThumb);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener("resize", follow); document.removeEventListener("scroll", follow, true); window.visualViewport?.removeEventListener("resize", follow); document.removeEventListener("pointerdown", outside, true); };
  }, [isOpen, place, close, measureThumb]);
  useEffect(() => { if (!isOpen) return; const row = list.current?.querySelector(`[data-id="${CSS.escape(activeId ?? selected?.id ?? "")}"]`); row?.scrollIntoView({ block: "nearest" }); }, [isOpen, activeId, selected?.id]);

  const optionId = (id: string) => `${uid}-opt-${id}`;
  const spoken = isOpen ? (webHint ?? spokenCaption(litModel, caption)) : "";

  function listKey(event: ReactKeyboardEvent) {
    const index = Math.max(0, models.findIndex(model => model.id === (activeId ?? selected?.id)));
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault(); setPointing(true); setActiveId(models[moveIndex(event.key, index, models.length)]?.id ?? null);
    } else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); if (models[index]) pick(models[index].id); }
  }
  function effortKey(event: ReactKeyboardEvent) {
    const direction = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!direction) return;
    event.preventDefault();
    const next = stepEffort(level, direction); setLevel(next);
    requestAnimationFrame(() => group.current?.querySelector<HTMLButtonElement>(`[data-effort="${next}"]`)?.focus());
  }
  if (!selected) return null;

  return <div ref={root} className={["mp", className].filter(Boolean).join(" ")} data-align={align} data-side={placedSide} data-disabled={disabled ? "" : undefined}
    onKeyDown={event => { if (event.key === "Escape" && isOpen) { event.preventDefault(); event.stopPropagation(); close(true); } }}
    onBlur={event => { if (isOpen && event.relatedTarget instanceof Node && !root.current?.contains(event.relatedTarget)) close(false); }}>
    <button ref={trigger} type="button" className="mp__trigger" disabled={disabled} aria-haspopup="dialog" aria-expanded={isOpen} aria-controls={`${uid}-menu`}
      aria-label={uiText("Model: {0}{1}", [selected.name, thinkingOn && showThinking ? ", extended thinking" : ""])}
      onClick={() => (isOpen ? close(true) : openMenu())}
      onKeyDown={event => { if (event.key === "ArrowDown") { event.preventDefault(); if (isOpen) list.current?.focus(); else openMenu(); } }}>
      <Glyph model={selected} />
      <span className="mp__name"><Swap id={selected.id}>{selected.name === "Auto" ? uiText("Auto") : selected.name}</Swap></span>
      {showThinking && <span className="mp__flag" data-on={thinkingOn ? "" : undefined} aria-hidden="true"><span><Bulb /></span></span>}
      <Chevron />
    </button>
    <div ref={pop} id={`${uid}-menu`} className="mp__pop" role="dialog" aria-label={uiText("Model settings")} popover="manual">
      <div ref={card} className="mp__card">
        <div className="mp__head" aria-hidden="true"><span>{uiText("Model")}</span>{anyRatings && <span className="mp__cols"><span>{uiText("Speed")}</span><span>{uiText("Quality")}</span><span>{uiText("Cost")}</span></span>}</div>
        <div ref={list} className="mp__list" role="listbox" aria-label={uiText("Model")} tabIndex={0} aria-activedescendant={isOpen ? optionId(activeModel.id) : undefined} data-pointing={pointing ? "" : undefined}
          onKeyDown={listKey} onPointerLeave={() => setPointing(false)}>
          {models.map(model => {
            const rated = hasRatings(model), lit = litModel.id === model.id;
            return <div key={model.id} id={optionId(model.id)} data-id={model.id} role="option" aria-selected={model.id === selected.id} aria-label={uiText(rowLabel(model))} className="mp__option"
              data-active={model.id === activeModel.id ? "" : undefined} data-lit={lit ? "" : undefined}
              onPointerMove={event => { if (event.pointerType === "mouse" && (!pointing || activeId !== model.id)) { setPointing(true); setActiveId(model.id); } }}
              onClick={() => pick(model.id)}>
              <Glyph model={model} />
              <span className="mp__text">
                <span className="mp__title"><span className="mp__title-name">{uiText(model.name)}</span>{model.id === selected.id && <Check />}</span>
                {model.description && <span className="mp__desc">{uiText(model.description)}</span>}
              </span>
              {rated ? <span className="mp__bars" aria-hidden="true">{[model.speed, model.quality, model.cost].map((rating, meter) => <span className="mp__meter" style={{ "--c": meter } as CSSProperties} key={meter}>
                {Array.from({ length: BAR_SEGMENTS }, (_, segment) => <span className="mp__seg" data-on={segment < clampRating(rating) ? "" : undefined} style={{ "--s": segment } as CSSProperties} key={segment} />)}</span>)}</span>
                : anyRatings && <span className="mp__varies" aria-hidden="true">{uiText("Varies")}</span>}
            </div>;
          })}
        </div>
        {(showThinking || showWebSearch) && <div className="mp__settings">
          {showThinking && <>
            <button type="button" role="switch" aria-checked={thinkingOn} className="mp__toggle" onClick={() => setThinking(!thinkingOn)}>
              <span className="mp__toggle-icon"><Bulb /></span><span className="mp__toggle-label">{uiText("Extended thinking")}</span><span className="mp__switch" aria-hidden="true" />
            </button>
            <div className="mp__fold" data-open={thinkingOn ? "" : undefined} inert={!thinkingOn}><div className="mp__clip"><div className="mp__effort">
              <span className="mp__effort-label" id={`${uid}-effort`}>{uiText("Effort")}</span>
              <div ref={group} className="mp__segmented" role="radiogroup" aria-labelledby={`${uid}-effort`} onKeyDown={effortKey}>
                <span className="mp__thumb" aria-hidden="true" />
                {efforts.map(item => <button type="button" role="radio" aria-checked={level === item} tabIndex={level === item ? 0 : -1} data-effort={item} className="mp__seg-btn" key={item} onClick={() => setLevel(item)}>{uiText(effortLabels[item])}</button>)}
              </div>
            </div></div></div>
          </>}
          {showWebSearch && <button type="button" role="switch" aria-checked={webOn} className="mp__toggle" onClick={() => setWeb(!webOn)}
            onPointerEnter={event => { if (event.pointerType === "mouse") setWebHover(true); }} onPointerLeave={() => setWebHover(false)} onFocus={event => { if (event.currentTarget.matches(":focus-visible")) setWebFocus(true); }} onBlur={() => setWebFocus(false)}>
            <span className="mp__toggle-icon"><Globe /></span><span className="mp__toggle-label">{uiText("Web search")}</span><span className="mp__switch" aria-hidden="true" />
          </button>}
        </div>}
      </div>
      <div className="mp__foot">
        <span className="mp__caption" aria-hidden="true"><Swap id={caption.key}>{stats
          ? <>{caption.seconds !== null && <span>~<b>{uiText(formatSeconds(seconds))}</b> {uiText(" first token")}</span>}{caption.seconds !== null && caption.price !== null && <span className="mp__dot"> · </span>}{caption.price !== null && <span><b>{uiText(formatPrice(price, priceDecimals(caption.price)))}</b> {uiText(" / M tokens")}</span>}</>
          : caption.text}</Swap></span>
        <span className="mp__keys" aria-hidden="true"><kbd>↑↓</kbd><kbd>↵</kbd></span>
        <span className="mp__sr" aria-live="polite">{uiText(spoken)}</span>
      </div>
    </div>
  </div>;
}
