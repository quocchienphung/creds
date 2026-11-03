"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronDown } from "lucide-react";
import type { Option } from "./settings-model";

/** 42 × 24 track with an 18px thumb that springs across (measured on the public preview: travel 18px). */
export function Switch({ id, checked, onChange, labelledBy, describedBy }: { id: string; checked: boolean; onChange: (checked: boolean) => void; labelledBy: string; describedBy: string }) {
  return <button type="button" role="switch" id={id} className="sc-switch" aria-checked={checked} data-state={checked ? "checked" : "unchecked"} aria-labelledby={labelledBy} aria-describedby={describedBy} onClick={() => onChange(!checked)}>
    <span className="sc-switch__track"><motion.span className="sc-switch__thumb" initial={false} animate={{ x: checked ? 18 : 0 }} transition={{ type: "spring", stiffness: 520, damping: 34 }} /></span>
  </button>;
}

/** A group of exclusive buttons; the selected tab glides to the choice (spring 114.5 / 21.4, the one UIArc's segmented control uses). */
export function Segmented({ label, value, options, onChange }: { label: string; value: string; options: readonly Option[]; onChange: (value: string) => void }) {
  const { t: uiText } = useWorkspaceI18n();
  const id = useId();
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = options.length - 1;
    const next = event.key === "ArrowRight" || event.key === "ArrowDown" ? (index + 1) % options.length : event.key === "ArrowLeft" || event.key === "ArrowUp" ? (index + last) % options.length : event.key === "Home" ? 0 : event.key === "End" ? last : null;
    if (next === null) return;
    event.preventDefault();
    onChange(options[next].value);
    (event.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus();
  }
  return <div className="sc-seg" role="group" aria-label={uiText(label)}><div className="sc-seg__track">
    {options.map((option, index) => {
      const pressed = option.value === value;
      return <button key={option.value} type="button" className="sc-seg__button" data-value={option.value} aria-pressed={pressed} tabIndex={pressed ? 0 : -1} onClick={() => onChange(option.value)} onKeyDown={event => onKeyDown(event, index)}>
        {pressed && <motion.span layoutId={`${id}-selection`} className="sc-seg__selection" aria-hidden="true" transition={{ type: "spring", stiffness: 114.5, damping: 21.4 }} />}
        <span className="sc-seg__label">{uiText(option.label)}</span>
      </button>;
    })}
  </div></div>;
}

export function TextField({ id, value, onChange, labelledBy, describedBy, prefix, placeholder, invalid, errorId }: { id: string; value: string; onChange: (value: string) => void; labelledBy: string; describedBy: string; prefix?: string; placeholder?: string; invalid: boolean; errorId?: string }) {
  const { t: uiText } = useWorkspaceI18n();
  return <span className="sc-text" data-invalid={invalid ? "" : undefined}>
    {prefix && <span className="sc-text__prefix" aria-hidden="true">{prefix}</span>}
    <input id={id} value={value} placeholder={uiText(placeholder)} spellCheck={false} autoComplete="off" aria-labelledby={labelledBy} aria-describedby={invalid && errorId ? `${describedBy} ${errorId}` : describedBy} aria-invalid={invalid || undefined} onChange={event => onChange(event.target.value)} />
  </span>;
}

interface Placement { left: number; top: number; width: number; side: "top" | "bottom"; maxHeight: number }

/**
 * A select: a button that opens a listbox in a layer over the page (so the scrolling area never clips it). Arrow keys, Home/End and
 * typing a letter move the highlight, Enter or Space chooses, Escape closes and returns focus to the button.
 */
export function SelectField({ id, label, value, options, onChange, size = "row" }: { id: string; label: string; value: string; options: readonly Option[]; onChange: (value: string) => void; size?: "row" | "popup" }) {
  const { t: uiText } = useWorkspaceI18n();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [placement, setPlacement] = useState<Placement | null>(null);
  // Where the list is drawn (inside a modal dialog when there is one, which makes everything outside it inert) and the theme it inherits.
  const [host, setHost] = useState<{ root: Element; theme?: string } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement | null>(null);
  // The list takes focus the moment it is drawn, so the arrow keys, Enter and Escape act on it.
  const mountList = useCallback((node: HTMLDivElement | null) => { list.current = node; node?.focus({ preventScroll: true }); }, []);
  const listId = useId();
  const typed = useRef({ text: "", at: 0 });
  const selected = Math.max(0, options.findIndex(option => option.value === value));

  const place = useCallback(() => {
    const button = trigger.current;
    if (!button) return;
    const box = button.getBoundingClientRect();
    const height = Math.min(320, options.length * 36 + 16);
    const below = window.innerHeight - box.bottom - 12, above = box.top - 12;
    const side = below >= height || below >= above ? "bottom" : "top";
    setPlacement({ left: Math.max(10, Math.min(box.left, window.innerWidth - box.width - 10)), top: side === "bottom" ? box.bottom + 6 : box.top - 6, width: box.width, side, maxHeight: Math.max(120, Math.min(320, side === "bottom" ? below : above)) });
  }, [options.length]);

  useLayoutEffect(() => { if (open) place(); }, [open, place]);
  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => { if (!(event.target instanceof Node) || !list.current?.contains(event.target)) setOpen(false); };
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !list.current?.contains(event.target) && !trigger.current?.contains(event.target)) setOpen(false); };
    window.addEventListener("resize", place); window.addEventListener("scroll", close, true); document.addEventListener("pointerdown", outside);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", close, true); document.removeEventListener("pointerdown", outside); };
  }, [open, place]);
  useEffect(() => { list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" }); }, [active, open]);

  function show() {
    const button = trigger.current;
    setHost({ root: button?.closest("dialog") ?? document.body, theme: button?.closest("[data-theme]")?.getAttribute("data-theme") ?? undefined });
    setActive(selected); setOpen(true);
  }
  function choose(index: number) { onChange(options[index].value); setOpen(false); trigger.current?.focus(); }
  function onTriggerKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) { event.preventDefault(); show(); }
  }
  function onListKey(event: KeyboardEvent<HTMLDivElement>) {
    const last = options.length - 1;
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus(); }
    else if (event.key === "ArrowDown") { event.preventDefault(); setActive(current => Math.min(last, current + 1)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive(current => Math.max(0, current - 1)); }
    else if (event.key === "Home") { event.preventDefault(); setActive(0); }
    else if (event.key === "End") { event.preventDefault(); setActive(last); }
    else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); choose(active); }
    else if (event.key === "Tab") { setOpen(false); }
    else if (event.key.length === 1 && !event.metaKey && !event.ctrlKey) {
      const now = event.timeStamp;
      typed.current = { text: (now - typed.current.at > 700 ? "" : typed.current.text) + event.key.toLowerCase(), at: now };
      const found = options.findIndex(option => option.label.toLowerCase().startsWith(typed.current.text));
      if (found >= 0) setActive(found);
    }
  }
  const current = options[selected];
  return <div className="sc-select" data-size={size}>
    <label htmlFor={id} className="sc-sr-only">{uiText(label)}</label>
    <button ref={trigger} type="button" id={id} role="combobox" className="sc-select__trigger" aria-expanded={open} aria-haspopup="listbox" aria-controls={open ? listId : undefined} data-state={open ? "open" : "closed"} onClick={() => (open ? setOpen(false) : show())} onKeyDown={onTriggerKey}>
      <span className="sc-select__value"><AnimatePresence initial={false} mode="popLayout"><motion.span key={current?.value} initial={{ opacity: 0, filter: "blur(2px)" }} animate={{ opacity: 1, filter: "blur(0px)" }} exit={{ opacity: 0, filter: "blur(2px)" }} transition={{ duration: 0.14 }}>{uiText(current?.label)}</motion.span></AnimatePresence></span>
      <span className="sc-select__chevron" aria-hidden="true"><ChevronDown size={15} /></span>
    </button>
    {open && placement && host && createPortal(
      <div ref={mountList} id={listId} role="listbox" tabIndex={-1} aria-label={uiText(label)} aria-activedescendant={`${listId}-${active}`} className="sc-tokens sc-select__content" data-theme={host.theme} data-side={placement.side} onKeyDown={onListKey}
        style={{ left: placement.left, width: placement.width, maxHeight: placement.maxHeight, ...(placement.side === "bottom" ? { top: placement.top } : { bottom: window.innerHeight - placement.top }) }}>
        <div className="sc-select__viewport">
          {options.map((option, index) => <div key={option.value} id={`${listId}-${index}`} role="option" data-index={index} aria-selected={option.value === value} data-highlighted={index === active ? "" : undefined} className="sc-select__item" onPointerMove={() => setActive(index)} onClick={() => choose(index)}>
            {uiText(option.label)}{option.value === value && <span className="sc-select__check" aria-hidden="true"><Check size={14} /></span>}
          </div>)}
        </div>
      </div>, host.root)}
  </div>;
}

/** A label, its hint and the control, in the row grid of the page (also the unit the search jumps to). */
export function Row({ id, order, label, hint, kind, wide, dirty, error, pulse, children, rowRef }: { id: string; order: number; label: string; hint: string; kind: string; wide?: boolean; dirty: boolean; error?: string; pulse?: "a" | "b"; children: ReactNode; rowRef?: (node: HTMLDivElement | null) => void }) {
  const { t: uiText } = useWorkspaceI18n();
  return <div ref={rowRef} style={{ "--i": 12 + order } as CSSProperties} className={`sc-row${wide ? " sc-row--wide" : ""}${pulse ? ` sc-row--pulse-${pulse}` : ""}`} data-setting={id} data-kind={kind} data-dirty={dirty ? "" : undefined}>
    <div className="sc-row__text">
      <span className="sc-row__label"><label id={`${id}-label`} htmlFor={kind === "select" ? id : kind === "segmented" ? undefined : id}>{uiText(label)}</label>{dirty && <><span className="sc-row__dirty" aria-hidden="true" /><span className="sc-sr-only">{uiText("Edited")}</span></>}</span>
      <p id={`${id}-hint`}>{uiText(hint)}</p>
      {error && <p className="sc-row__error" id={`${id}-error`} role="alert">{uiText(error)}</p>}
    </div>
    <div className="sc-row__control">{children}</div>
  </div>;
}
