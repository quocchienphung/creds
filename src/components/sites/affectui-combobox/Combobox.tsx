"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { buildSections, filterOptions, firstEnabled, hasExactMatch, initials, lastEnabled, matchRanges, moveActive, typeahead } from "./combobox-model";
import type { ComboboxOption, Row } from "./combobox-model";
import "./combobox.css";
import { interactionMotion } from "@/components/interaction/motion-tokens";

export type { ComboboxOption } from "./combobox-model";

interface CommonProps {
  options: ComboboxOption[];
  /** Visible label above the field. It also names the list. */
  label?: string;
  /** Accessible name when there is no visible label. */
  "aria-label"?: string;
  placeholder?: string;
  /** Submitted with the surrounding form (one hidden input per value). */
  name?: string;
  id?: string;
  disabled?: boolean;
  required?: boolean;
  /** Shown when nothing matches. */
  emptyText?: string;
  /** Offer a create row when the typed text matches no option exactly. */
  creatable?: boolean;
  onCreate?: (text: string) => ComboboxOption | void;
  createLabel?: (text: string) => string;
  /** Show a search field. Defaults to lists of more than seven options. */
  searchable?: boolean;
  /** The count and key hints row. Defaults to on for multiple choice. */
  footer?: boolean;
  size?: "default" | "sm";
  className?: string;
  defaultOpen?: boolean;
  maxMenuHeight?: number;
}
export interface SingleComboboxProps extends CommonProps { multiple?: false; value?: string; defaultValue?: string; onChange?: (value: string, option: ComboboxOption) => void }
export interface MultiComboboxProps extends CommonProps { multiple: true; value?: string[]; defaultValue?: string[]; maxVisibleTags?: number; onChange?: (value: string[], options: ComboboxOption[]) => void }
export type ComboboxProps = SingleComboboxProps | MultiComboboxProps;

const ROW = 32, TITLE = 24, PAD = 8, FOOT = 32, GAP = 6, EDGE = 12;
const supportsPopover = () => typeof HTMLElement !== "undefined" && typeof HTMLElement.prototype.showPopover === "function";

function Glyph({ d, className }: { d: string; className?: string }) { return <svg viewBox="0 0 24 24" className={`cbx__glyph${className ? ` ${className}` : ""}`} aria-hidden="true"><path d={d} /></svg>; }

/** A number that rolls up or down when it changes. */
function Roll({ value }: { value: number }) {
  const { t: uiText } = useWorkspaceI18n();
  const [state, setState] = useState({ value, dir: 1 });
  if (state.value !== value) setState({ value, dir: value >= state.value ? 1 : -1 });
  return <span className="cbx__roll"><span key={value} data-dir={state.dir}>{uiText(value)}</span></span>;
}

function Highlight({ text, query }: { text: string; query: string }) {
  const ranges = matchRanges(text, query);
  if (!ranges.length) return <>{text}</>;
  const parts: ReactNode[] = [];
  let at = 0;
  ranges.forEach(([from, to], index) => { if (from > at) parts.push(text.slice(at, from)); parts.push(<mark key={index}>{text.slice(from, to)}</mark>); at = to; });
  if (at < text.length) parts.push(text.slice(at));
  return <>{parts}</>;
}

function Avatar({ option }: { option: ComboboxOption }) {
  if (!option.avatar) return null;
  return <span className="cbx__avatar" aria-hidden="true">{typeof option.avatar === "string"
    ? <img src={option.avatar} alt="" referrerPolicy="no-referrer" loading="lazy" />
    : initials(option.label)}</span>;
}

export function Combobox(props: ComboboxProps) {
  const { t: uiText } = useWorkspaceI18n();
  const { options, label, placeholder, name, disabled, required, emptyText = "No results", creatable, onCreate, createLabel = text => `Create “${text}”`, size = "default", className, maxMenuHeight = 300 } = props;
  const multiple = props.multiple === true;
  const reduce = useReducedMotion();
  const uid = useId(), inputId = props.id ?? `${uid}-input`, listId = `${uid}-list`, labelId = `${uid}-label`;
  const [created, setCreated] = useState<ComboboxOption[]>([]);
  const all = useMemo(() => [...options, ...created.filter(item => !options.some(option => option.value === item.value))], [options, created]);
  const displayAll = useMemo(() => all.map(option => option.localize === false ? option : ({ ...option, label: uiText(option.label), hint: uiText(option.hint), group: uiText(option.group), keywords: [...(option.keywords ?? []), option.label, option.hint ?? ''] })), [all, uiText]);
  const searchable = props.searchable ?? (creatable || all.length > 7);
  const footer = props.footer ?? multiple;

  // Value: controlled when `value` is passed, otherwise held here.
  const [inner, setInner] = useState<string[]>(() => multiple ? (props as MultiComboboxProps).defaultValue ?? [] : (props as SingleComboboxProps).defaultValue === undefined ? [] : [(props as SingleComboboxProps).defaultValue as string]);
  const propValue = props.value, controlled = propValue !== undefined;
  const values = useMemo<string[]>(() => propValue === undefined ? inner : Array.isArray(propValue) ? propValue : [propValue], [propValue, inner]);
  const selected = useMemo(() => values.map(value => all.find(option => option.value === value)).filter((option): option is ComboboxOption => !!option), [values, all]);
  const single = !multiple ? selected[0] : undefined;

  const [open, setOpen] = useState(!!props.defaultOpen), [shown, setShown] = useState(!!props.defaultOpen), [typed, setTyped] = useState<string | null>(null);
  const [active, setActive] = useState(-1), [pointerIn, setPointerIn] = useState(true), [armed, setArmed] = useState(false), [announcement, setAnnouncement] = useState("");
  const [place, setPlace] = useState<{ left: number; width: number; top?: number; bottom?: number; max: number; side: "below" | "above" } | null>(null);
  const [fit, setFit] = useState(Infinity);
  const field = useRef<HTMLDivElement>(null), input = useRef<HTMLInputElement>(null), pop = useRef<HTMLDivElement>(null), list = useRef<HTMLDivElement>(null), inner$ = useRef<HTMLDivElement>(null), pill = useRef<HTMLSpanElement>(null), hidden = useRef<HTMLInputElement>(null);
  const measure = useRef<HTMLUListElement>(null), closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined), typeBuffer = useRef({ text: "", time: 0 }), selectOnUp = useRef(false), side = useRef<"below" | "above">("below");

  const query = searchable ? typed ?? "" : "";
  const view = useMemo(() => {
    const matches = searchable && query.trim() ? filterOptions(displayAll, query) : displayAll;
    const offer = creatable && query.trim() && !hasExactMatch(all, query) ? query.trim() : undefined;
    return { matches, ...buildSections(matches, offer) };
  }, [all, displayAll, query, searchable, creatable]);
  const { rows, sections } = view;

  // `fresh` is an option created a moment ago: it is not in `all` yet (that list updates on the next render).
  const commit = useCallback((next: string[], fresh?: ComboboxOption) => {
    if (!controlled) setInner(next);
    const chosen = next.map(value => all.find(option => option.value === value) ?? (fresh?.value === value ? fresh : undefined)).filter((option): option is ComboboxOption => !!option);
    if (multiple) (props as MultiComboboxProps).onChange?.(next, chosen);
    else if (chosen[0]) (props as SingleComboboxProps).onChange?.(next[0], chosen[0]);
  }, [controlled, all, multiple, props]);

  // Opening and closing. The list stays mounted for a moment after closing so it can fade out.
  const openList = useCallback((at?: number) => {
    if (disabled) return;
    clearTimeout(closeTimer.current);
    setOpen(true); setShown(true); setPointerIn(true);
    const first = firstEnabled(rows), current = rows.findIndex(row => row.kind === "option" && values.includes(row.option!.value));
    setActive(at ?? (!multiple && current >= 0 ? current : first));
  }, [disabled, rows, values, multiple]);
  const closeList = useCallback(() => {
    setOpen(false); setArmed(false);
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setShown(false), reduce ? 0 : interactionMotion.exit);
  }, [reduce]);
  useEffect(() => () => clearTimeout(closeTimer.current), []);

  const choose = useCallback((row: Row | undefined) => {
    if (!row) return;
    let option = row.option;
    if (row.kind === "create") {
      const text = row.text ?? "";
      option = onCreate?.(text) || { value: text, label: text, localize: false };
      setCreated(previous => [...previous, option!]);
    }
    if (!option || option.disabled) return;
    if (multiple) {
      const has = values.includes(option.value), next = has ? values.filter(value => value !== option!.value) : [...values, option.value];
      commit(next, option); setTyped(null); setArmed(false);
      setAnnouncement(`${option.label} ${has ? "removed" : "added"}. ${next.length} selected.`);
      setActive(rows.findIndex(item => item.kind === "option" && item.option!.value === option!.value));
    } else {
      commit([option.value], option); setTyped(null); closeList();
      setAnnouncement(`${option.label} selected.`);
    }
  }, [multiple, values, commit, rows, closeList, onCreate]);

  const remove = useCallback((value: string) => {
    const option = all.find(item => item.value === value);
    commit(values.filter(item => item !== value)); setArmed(false);
    if (option) setAnnouncement(`${option.label} removed. ${values.length - 1} selected.`);
  }, [all, values, commit]);

  // Typing: the first match becomes active.
  function onInput(text: string) {
    if (!searchable) return;
    setTyped(text); setArmed(false);
    const next = buildSections(text.trim() ? filterOptions(displayAll, text) : displayAll, creatable && text.trim() && !hasExactMatch(all, text) ? text.trim() : undefined).rows;
    setActive(firstEnabled(next)); setPointerIn(true);
    if (!open) openList(firstEnabled(next));
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    pill.current?.style.setProperty("transition-duration", "0ms");
    const { key } = event;
    if (disabled) return;
    if (key === "ArrowDown" || key === "ArrowUp") {
      event.preventDefault(); setPointerIn(true);
      if (!open) { openList(); return; }
      setActive(current => current < 0 ? (key === "ArrowDown" ? firstEnabled(rows) : lastEnabled(rows)) : moveActive(rows, current, key === "ArrowDown" ? 1 : -1));
    } else if (key === "Enter") {
      if (open && active >= 0) { event.preventDefault(); choose(rows[active]); }
      else if (!open) { event.preventDefault(); openList(); }
    } else if (key === "Escape") {
      if (open) { event.preventDefault(); event.stopPropagation(); closeList(); setTyped(null); }
      else if (typed) { event.preventDefault(); event.stopPropagation(); setTyped(null); }
    } else if (key === "Tab") { if (open) closeList(); setTyped(null); }
    else if (key === "Backspace" && multiple && !typed && values.length) {
      event.preventDefault();
      if (armed) remove(values[values.length - 1]); else setArmed(true);
    } else if (!searchable && !event.metaKey && !event.ctrlKey && !event.altKey) {
      if (key === " ") { event.preventDefault(); if (open && active >= 0) choose(rows[active]); else openList(); }
      else if (key === "Home" || key === "End") { event.preventDefault(); if (!open) openList(); setActive(key === "Home" ? firstEnabled(rows) : lastEnabled(rows)); }
      else if (key.length === 1) {
        const now = performance.now(), buffer = now - typeBuffer.current.time > 700 ? key : typeBuffer.current.text + key;
        typeBuffer.current = { text: buffer, time: now };
        const found = typeahead(rows, buffer, active);
        if (found >= 0) { if (!open) openList(found); setActive(found); setPointerIn(true); }
      }
    } else if (armed) setArmed(false);
  }

  // The list sits in the top layer (Popover API) so no ancestor can clip it, not even a modal dialog.
  const estimate = sections.reduce((sum, section) => sum + (section.title ? TITLE : 0), 0) + Math.max(rows.length, 1) * ROW + PAD;
  const reposition = useCallback(() => {
    const element = field.current;
    if (!element) return;
    const rect = element.getBoundingClientRect(), below = window.innerHeight - rect.bottom - GAP - EDGE, above = rect.top - GAP - EDGE;
    const want = Math.min(maxMenuHeight, estimate) + (footer ? FOOT : 0);
    if (!pop.current || pop.current.dataset.state !== "closing") side.current = below < want && above > below ? "above" : "below";
    const room = (side.current === "below" ? below : above) - (footer ? FOOT : 0);
    setPlace({ left: rect.left, width: rect.width, max: Math.max(96, Math.min(maxMenuHeight, room)), side: side.current, ...(side.current === "below" ? { top: rect.bottom + GAP } : { bottom: window.innerHeight - rect.top + GAP }) });
  }, [estimate, footer, maxMenuHeight]);
  useLayoutEffect(() => {
    if (!shown) return;
    const element = pop.current;
    if (element && supportsPopover() && !element.matches(":popover-open")) { try { element.showPopover(); } catch { /* already open */ } }
    reposition();
    let frame = 0;
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(reposition); };
    window.addEventListener("resize", schedule); window.addEventListener("scroll", schedule, true);
    const observer = new ResizeObserver(schedule); if (field.current) observer.observe(field.current);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("resize", schedule); window.removeEventListener("scroll", schedule, true); observer.disconnect(); };
  }, [shown, reposition]);

  // The list's height follows its content; the highlight pill follows the active row.
  useLayoutEffect(() => {
    if (!shown || !list.current || !inner$.current) return;
    const box = list.current, content = inner$.current;
    const size = () => { box.style.height = `${Math.min(content.offsetHeight + PAD, place?.max ?? maxMenuHeight)}px`; };
    size();
    const observer = new ResizeObserver(size); observer.observe(content);
    return () => observer.disconnect();
  }, [shown, place?.max, maxMenuHeight, sections]);
  useLayoutEffect(() => {
    const box = list.current, mark = pill.current;
    if (!shown || !box || !mark) return;
    const row = box.querySelector<HTMLElement>(`[data-index="${active}"]`);
    if (!row) { mark.dataset.empty = "true"; return; }
    delete mark.dataset.empty;
    mark.style.transform = `translateY(${row.offsetTop}px)`; mark.style.height = `${row.offsetHeight}px`;
    requestAnimationFrame(() => { mark.dataset.ready = "1"; });
    const top = row.offsetTop - (row.previousElementSibling === null ? TITLE : 0), bottom = row.offsetTop + row.offsetHeight + 4;
    if (top < box.scrollTop) box.scrollTop = Math.max(0, top - 4);
    else if (bottom > box.scrollTop + box.clientHeight) box.scrollTop = bottom - box.clientHeight;
  }, [active, shown, sections, place?.max]);

  // On open, a single choice selects its text so typing replaces it.
  useEffect(() => { if (open && !multiple && searchable && typed === null) input.current?.select(); }, [open, multiple, searchable, typed]);

  // Forms: reset puts the default back.
  const defaultValueRef = useRef(inner);
  useEffect(() => {
    const form = hidden.current?.form;
    if (!form || controlled) return;
    const reset = () => setTimeout(() => setInner(defaultValueRef.current), 0);
    form.addEventListener("reset", reset);
    return () => form.removeEventListener("reset", reset);
  }, [controlled]);

  // Chips: as many as fit on one line, the rest roll up into "+N".
  const visibleLimit = multiple ? Math.min((props as MultiComboboxProps).maxVisibleTags ?? Infinity, fit) : 0;
  useEffect(() => {
    if (!multiple) return;
    let frame = 0;
    const compute = () => {
      const row = measure.current, area = field.current?.querySelector<HTMLElement>(".cbx__field-inner");
      if (!row || !area) return;
      const widths = [...row.querySelectorAll<HTMLElement>("[data-chip]")].map(item => item.offsetWidth), more = row.querySelector<HTMLElement>("[data-more]")?.offsetWidth ?? 40;
      const room = area.clientWidth - 64;
      let used = 0, count = 0;
      for (let index = 0; index < widths.length; index++) {
        const next = used + widths[index] + 4, remaining = widths.length - index - 1;
        if (next + (remaining ? more + 4 : 0) <= room) { used = next; count = index + 1; } else break;
      }
      setFit(count >= widths.length ? Infinity : count);
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(compute); };
    schedule();
    const observer = new ResizeObserver(schedule); if (field.current) observer.observe(field.current);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [multiple, selected]);
  const chips = multiple ? selected.slice(0, visibleLimit) : [];
  const more = multiple ? selected.length - chips.length : 0;

  function fieldPointer(event: ReactPointerEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (disabled || target.closest(".cbx__chip-x") || event.button > 0) return;
    if (target === input.current && searchable) {
      // Opening a single choice with a click selects its text, so typing replaces it; clicks while it is open place the caret.
      selectOnUp.current = !multiple && !open && typed === null;
      if (!open) openList();
      return;
    }
    event.preventDefault();
    input.current?.focus();
    if (open) closeList(); else openList();
  }

  // An explicit aria-label names the control (for example per card: "Move Notion to stage"); otherwise the visible label does.
  const labelledBy = label && !props["aria-label"] ? labelId : undefined;
  const activeId = open && active >= 0 && rows[active] ? `${uid}-o${active}` : undefined;
  const displaySingle = single?.localize === false ? single?.label : uiText(single?.label);
  const inputValue = searchable ? (typed ?? (multiple ? "" : displaySingle ?? "")) : (multiple ? "" : displaySingle ?? "");
  const showPlaceholder = multiple ? !selected.length : !single;
  const style: CSSProperties | undefined = place ? { left: place.left, width: place.width, top: place.top, bottom: place.bottom, ["--cbx-max" as string]: `${place.max}px` } : undefined;
  const emptyMessage = view.matches.length === 0 && (query.trim() ? `${emptyText} for “${query.trim()}”` : emptyText);

  return <div className={`cbx${className ? ` ${className}` : ""}`} data-open={open || undefined} data-size={size} data-multiple={multiple || undefined} data-disabled={disabled || undefined} data-searchable={searchable || undefined}>
    {label && <label className="cbx__label" id={labelId} htmlFor={inputId}>{uiText(label)}</label>}
    <div className="cbx__field" ref={field} onPointerDown={fieldPointer}>
      <div className="cbx__field-inner">
        {multiple && <ul className="cbx__measure" ref={measure} aria-hidden="true">{selected.map(option => <li key={option.value} className="cbx__chip" data-chip=""><span className="cbx__chip-body"><Avatar option={option} /><span className="cbx__chip-label">{option.localize === false ? option.label : uiText(option.label)}</span><span className="cbx__chip-x" /></span></li>)}<li className="cbx__chip" data-more=""><span className="cbx__chip-body">+99</span></li></ul>}
        {multiple && <ul className="cbx__chips" aria-label={uiText(label ? uiText("{0}: selected", [label]) : uiText("Selected"))}><AnimatePresence initial={false}>{chips.map((option, index) => <motion.li key={option.value} className="cbx__chip" data-armed={armed && index === selected.length - 1 && !more ? "" : undefined} layout={reduce ? false : "position"} initial={reduce ? false : { opacity: 0, scale: .82 }} animate={{ opacity: 1, scale: 1 }} exit={reduce ? { opacity: 0 } : { opacity: 0, scale: .82, width: 0, marginRight: -4 }} transition={{ duration: reduce ? 0 : .22, ease: [.22, 1, .36, 1] }}><span className="cbx__chip-body"><Avatar option={option} /><span className="cbx__chip-label">{option.localize === false ? option.label : uiText(option.label)}</span><button type="button" className="cbx__chip-x" tabIndex={-1} aria-label={uiText("Remove {0}", [option.label])} disabled={disabled} onPointerDown={event => event.preventDefault()} onClick={() => remove(option.value)}><Glyph d="M7 7l10 10M17 7L7 17" /></button></span></motion.li>)}</AnimatePresence>{more > 0 && <li className="cbx__chip cbx__more"><span className="cbx__chip-body"><span>+<Roll value={more} /></span></span></li>}</ul>}
        {!multiple && single?.color && <span className="cbx__dot" style={{ background: single.color }} aria-hidden="true" />}
        <input ref={input} id={inputId} className="cbx__input" role="combobox" autoComplete="off" spellCheck={false} aria-expanded={open} aria-controls={listId} aria-autocomplete={searchable ? "list" : "none"} aria-haspopup="listbox" aria-activedescendant={activeId} aria-labelledby={labelledBy} aria-label={uiText(labelledBy ? undefined : props["aria-label"])} aria-required={required || undefined} disabled={disabled} readOnly={!searchable} placeholder={uiText(showPlaceholder ? placeholder ?? (searchable ? "Search…" : "Select…") : undefined)} value={inputValue} onChange={event => onInput(event.target.value)} onKeyDown={onKeyDown} onMouseUp={event => { if (selectOnUp.current) { event.preventDefault(); selectOnUp.current = false; input.current?.select(); } }} onFocus={() => { if (searchable && !multiple) input.current?.select(); }} onBlur={() => { if (open) closeList(); setTyped(null); setArmed(false); }} />
      </div>
      <button type="button" className="cbx__toggle" tabIndex={-1} aria-label={uiText(open ? uiText("Close list") : uiText("Open list"))} disabled={disabled}><Glyph d="M8 10l4 4 4-4" /></button>
    </div>
    {name && (multiple ? values : [values[0] ?? ""]).map(value => <input key={value} ref={hidden} type="hidden" name={name} value={value} required={required && !multiple} />)}
    {name && multiple && !values.length && <input ref={hidden} type="hidden" disabled />}
    {shown && <div className="cbx__pop" ref={pop} popover={supportsPopover() ? "manual" : undefined} data-state={open ? "open" : "closing"} data-side={place?.side ?? "below"} data-fallback={supportsPopover() ? undefined : ""} style={style} onMouseDown={event => event.preventDefault()}>
      <div className="cbx__list" id={listId} ref={list} role="listbox" aria-multiselectable={multiple || undefined} aria-labelledby={labelledBy} aria-label={uiText(labelledBy ? undefined : props["aria-label"])} onPointerLeave={() => setPointerIn(false)} onPointerEnter={() => setPointerIn(true)}>
        <span className="cbx__pill" ref={pill} aria-hidden="true" data-hidden={!pointerIn || active < 0 || undefined} />
        <div className="cbx__list-inner" ref={inner$}>
          {emptyMessage && <div className="cbx__empty">{uiText(emptyMessage)}</div>}
          {sections.map(section => <div key={section.id} role={section.title ? "group" : "presentation"} aria-labelledby={section.title ? `${uid}-${section.id}` : undefined} className="cbx__group">
            {section.title && <div className="cbx__group-label" id={`${uid}-${section.id}`}>{uiText(section.title)}</div>}
            {section.rows.map(({ row, index }) => {
              const option = row.option, chosen = !!option && values.includes(option.value);
              return <div key={option?.value ?? "create"} id={`${uid}-o${index}`} data-index={index} role="option" aria-selected={row.kind === "option" ? chosen : false} aria-disabled={option?.disabled || undefined} data-active={index === active || undefined} className={`cbx__option${row.kind === "create" ? " cbx__create" : ""}`} onPointerMove={event => { if (event.pointerType !== "touch" && (index !== active || !pointerIn)) { pill.current?.style.removeProperty("transition-duration"); setActive(index); setPointerIn(true); } }} onClick={() => choose(row)}>
                {row.kind === "create" ? <><span className="cbx__plus" aria-hidden="true"><Glyph d="M12 6v12M6 12h12" /></span><span className="cbx__name">{uiText(createLabel(row.text ?? ""))}</span></> : <>
                  {option && <Avatar option={option} />}
                  {option?.color && <span className="cbx__dot" style={{ background: option.color }} aria-hidden="true" />}
                  <span className="cbx__text"><span className="cbx__name"><Highlight text={option!.label} query={query} /></span>{option!.hint && <span className="cbx__hint"><Highlight text={option!.hint} query={query} /></span>}</span>
                  <Glyph d="M5.5 12.5l4 4L18.5 8" className="cbx__check" />
                </>}
              </div>;
            })}
          </div>)}
        </div>
      </div>
      {footer && <div className="cbx__foot">{multiple && <span className="cbx__count"><Roll value={selected.length} /> {uiText(" selected")}</span>}<span className="cbx__keys"><kbd>↑</kbd><kbd>↓</kbd><span>{uiText("to move")}</span><kbd>↵</kbd><span>{uiText(multiple ? uiText("to toggle") : uiText("to select"))}</span></span></div>}
    </div>}
    <span className="cbx__live" role="status" aria-live="polite">{uiText(announcement)}</span>
  </div>;
}
