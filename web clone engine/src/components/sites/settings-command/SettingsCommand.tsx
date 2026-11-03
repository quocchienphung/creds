"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence, animate, motion, useReducedMotion } from "motion/react";
import { Search, X } from "lucide-react";
import { Row, Segmented, SelectField, Switch, TextField } from "./Controls";
import { SaveBar, type BarPhase } from "./SaveBar";
import { SettingsPalette, type FlightRect } from "./SettingsPalette";
import { sectionIcons } from "./section-icons";
import { SecuritySettings } from "../security-settings/SecuritySettings";
import type { SettingsSearchRow } from "./settings-model";
import { changedKeys, dirtySections, errorsOf, rows, sections, type SectionId, type SettingKey, type SettingRow, type SettingsValues } from "./settings-model";
import type { CSSProperties } from "react";
import "./settings-command.css";


/** The place of an element in the order the page rises into view while it opens (see `reveal`). */
const step = (index: number) => ({ "--i": index }) as CSSProperties;

function rectIn(node: Element, frame: Element): FlightRect {
  const a = node.getBoundingClientRect(), b = frame.getBoundingClientRect();
  return { x: a.left - b.left, y: a.top - b.top, width: a.width, height: a.height };
}

/**
 * The Settings page: a header with a search field that grows into a command palette, a section navigation whose highlight follows the
 * section in view, rows grouped by section, and a floating bar for unsaved changes. Layout, spacing, type and motion were measured on the
 * public preview of UIArc's Settings command block (docs/research/uiarc-settings-command/); the component is this app's own.
 *
 * `saved` is what the workspace holds; `onSave` receives the edited copy once it validates. Nothing leaves the browser from here.
 */
export function SettingsCommand({ saved, onSave, notify, initialSection, onClose, reveal = false, profileEmail = "" }: {
  saved: SettingsValues; onSave: (values: SettingsValues) => void; notify?: (message: string) => void;
  /** The section to open on (a link such as `?settings=members`). */
  initialSection?: SectionId;
  /** Shown as a close button in the header when the page sits in a panel over the workspace. */
  onClose?: () => void;
  /** Texts, tabs and rows rise into place one after another (while the panel grows out of the menu). */
  reveal?: boolean;
  profileEmail?: string;
}) {
  const { t: uiText } = useWorkspaceI18n();
  const reduce = useReducedMotion();
  const [draft, setDraft] = useState(saved);
  const [current, setCurrent] = useState<SectionId>("general");
  const [palette, setPalette] = useState<FlightRect | null>(null);
  const [frameWidth, setFrameWidth] = useState(745);
  const [phase, setPhase] = useState<BarPhase>("edit");
  const [prevSaved, setPrevSaved] = useState(saved);
  const [attempted, setAttempted] = useState(false);
  const [pulse, setPulse] = useState<{ id: string; flip: "a" | "b" } | null>(null);
  const [message, setMessage] = useState("");
  const shortcut = useSyncExternalStore(() => () => {}, () => (/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘K" : "Ctrl K"), () => "⌘K");
  const frame = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const sectionNodes = useRef(new Map<SectionId, HTMLElement>());
  const rowNodes = useRef(new Map<string, HTMLDivElement>());
  const lock = useRef<{ stop: () => void } | null>(null);
  const timers = useRef<number[]>([]);

  const changed = changedKeys(draft, saved);
  const errors = errorsOf(draft);
  const errorKeys = Object.keys(errors) as SettingKey[];
  const dirty = dirtySections(draft, saved);
  const failed = attempted && errorKeys.length > 0;
  // The bar shows while there is something to save, is being saved, or confirms a save; a new edit during the confirmation brings the edit view back.
  const barPhase: BarPhase = changed.length && phase === "saved" ? "edit" : phase;
  const barVisible = changed.length > 0 || phase !== "edit";

  // Values changed from elsewhere (the small account pop-up, another tab) replace the copy only while nothing here is being edited.
  if (prevSaved !== saved) {
    setPrevSaved(saved);
    if (!changedKeys(draft, prevSaved).length) setDraft(saved);
  }
  useEffect(() => () => { timers.current.forEach(window.clearTimeout); lock.current?.stop(); }, []);
  useLayoutEffect(() => {
    const node = frame.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setFrameWidth(Math.round(node.getBoundingClientRect().width)));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const announce = useCallback((text: string) => setMessage(text), []);
  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); };

  function scrollTo(top: number, onDone?: () => void) {
    const node = scroller.current;
    if (!node) return;
    lock.current?.stop();
    const max = node.scrollHeight - node.clientHeight;
    const to = Math.max(0, Math.min(max, top));
    if (reduce) { node.scrollTop = to; onDone?.(); return; }
    const controls = animate(node.scrollTop, to, { type: "spring", stiffness: 90, damping: 17, onUpdate: value => { node.scrollTop = value; }, onComplete: () => { lock.current = null; onDone?.(); } });
    lock.current = controls;
  }
  function sectionTop(id: SectionId) { const node = sectionNodes.current.get(id); return node ? node.offsetTop - 8 : 0; }
  function goToSection(id: SectionId) {
    setCurrent(id);
    scrollTo(sectionTop(id));
  }

  // Scroll-spy: the section at the top of the scroller, throttled to one read per frame.
  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    let frameId = 0;
    const read = () => {
      frameId = 0;
      if (lock.current) return;
      const atEnd = node.scrollTop + node.clientHeight >= node.scrollHeight - 4;
      let next: SectionId = sections[0].id;
      if (atEnd) next = sections[sections.length - 1].id;
      else for (const section of sections) if (sectionTop(section.id) <= node.scrollTop + 64) next = section.id;
      setCurrent(next);
    };
    const onScroll = () => { if (!frameId) frameId = requestAnimationFrame(read); };
    node.addEventListener("scroll", onScroll, { passive: true });
    return () => { node.removeEventListener("scroll", onScroll); if (frameId) cancelAnimationFrame(frameId); };
  }, []);

  // A link such as ?settings=members opens on that section.
  useEffect(() => {
    const id = initialSection;
    if (id) requestAnimationFrame(() => {
      setCurrent(id);
      const node = scroller.current;
      if (!node) return;
      // The section may sit too near the end to reach the top; the scroll-spy must not overrule the link for the scroll this causes.
      lock.current = { stop() {} };
      node.scrollTop = sectionTop(id);
      later(() => { lock.current = null; }, 250);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openPalette() {
    const button = trigger.current, host = frame.current;
    if (!button || !host || palette) return;
    setPalette(rectIn(button, host));
  }
  // Ctrl/⌘ K opens the search from anywhere on this page (and takes the shortcut from the workspace search); "/" does while focus is in the page.
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); event.stopImmediatePropagation(); openPalette(); return; }
      const target = event.target as HTMLElement | null;
      const typing = !!target && (target.matches("input,textarea,select,[contenteditable]") || target.closest("[role=listbox]"));
      if (event.key === "/" && !typing && frame.current?.contains(document.activeElement) && !event.metaKey && !event.ctrlKey) { event.preventDefault(); openPalette(); }
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  });

  function pulseRow(id: string) { setPulse(previous => ({ id, flip: previous?.flip === "a" ? "b" : "a" })); }
  function pick(row: SettingsSearchRow) {
    if (row.kind === 'section') { goToSection(row.section); announce(row.label); return; }
    const scrollerNode = scroller.current, host = frame.current, rowNode = rowNodes.current.get(row.id);
    if (!scrollerNode || !host || !rowNode) return;
    const sectionId = row.section;
    const desired = rowNode.offsetTop + (rowNode.offsetParent ? (rowNode.offsetParent === scrollerNode ? 0 : (rowNode.offsetParent as HTMLElement).offsetTop) : 0) - scrollerNode.clientHeight * 0.32;
    const max = scrollerNode.scrollHeight - scrollerNode.clientHeight;
    const finalTop = Math.max(0, Math.min(max, desired));
    const rowRect = rowNode.getBoundingClientRect(), scrollerRect = scrollerNode.getBoundingClientRect(), hostRect = host.getBoundingClientRect();
    const to: FlightRect = { x: rowRect.left - hostRect.left, y: rowRect.top - hostRect.top + (scrollerNode.scrollTop - finalTop), width: rowRect.width, height: rowRect.height };
    to.y = Math.max(scrollerRect.top - hostRect.top, to.y);
    setCurrent(sectionId);
    scrollTo(finalTop, () => {
      pulseRow(row.id);
      rowNode.querySelector<HTMLElement>("input,button")?.focus({ preventScroll: true });
      announce(`${row.label}, in ${sections.find(section => section.id === sectionId)!.label}`);
    });
    return { to };
  }
  function closePalette() { setPalette(null); }
  // When the palette is gone the field is visible again: focus goes back to it unless a result already moved focus into the page.
  const paletteShown = useRef(false);
  useEffect(() => {
    if (palette) { paletteShown.current = true; return; }
    if (!paletteShown.current) return;
    paletteShown.current = false;
    if (!frame.current?.contains(document.activeElement) || document.activeElement === document.body) trigger.current?.focus({ preventScroll: true });
  }, [palette]);

  function update<K extends SettingKey>(key: K, value: SettingsValues[K]) { setDraft(previous => ({ ...previous, [key]: value })); }
  function discard() { setDraft(saved); setAttempted(false); setPhase("edit"); announce("Changes discarded"); }
  function save() {
    if (phase === "saving") return;
    if (errorKeys.length) {
      setAttempted(true);
      const first = rows.find(row => errors[row.key]);
      if (first) { const node = rowNodes.current.get(first.id); if (node) { const top = node.offsetTop - 120; scrollTo(top, () => node.querySelector<HTMLElement>("input")?.focus({ preventScroll: true })); } }
      announce(`${errorKeys.length} ${errorKeys.length === 1 ? "setting needs" : "settings need"} attention: ${errors[errorKeys[0]]}`);
      return;
    }
    setPhase("saving");
    later(() => {
      onSave(draft);
      setAttempted(false);
      setPhase("saved");
      announce("Settings saved");
      notify?.("Settings saved");
      later(() => setPhase("edit"), 1800);
    }, reduce ? 0 : 900);
  }

  const edited = new Set(changed);
  function control(row: SettingRow) {
    const value = draft[row.key];
    const labelled = `${row.id}-label`, described = `${row.id}-hint`;
    if (row.kind === "text") return <TextField id={row.id} value={String(value)} onChange={next => update(row.key, next as never)} labelledBy={labelled} describedBy={described} prefix={row.prefix} placeholder={uiText(row.placeholder)} invalid={!!errors[row.key] && (attempted || edited.has(row.key))} errorId={`${row.id}-error`} />;
    if (row.kind === "select") return <SelectField id={row.id} label={uiText(row.label)} value={String(value)} options={row.options!} onChange={next => update(row.key, next as never)} />;
    if (row.kind === "segmented") return <Segmented label={uiText(row.label)} value={String(value)} options={row.options!} onChange={next => update(row.key, next as never)} />;
    return <Switch id={row.id} checked={Boolean(value)} onChange={next => update(row.key, next as never)} labelledBy={labelled} describedBy={described} />;
  }

  return <div className="sc sc-tokens" data-reveal={reveal ? "" : undefined} onKeyDown={event => { if (event.key === "Escape" && !palette && changed.length && (event.target as HTMLElement).matches?.("input")) (event.target as HTMLElement).blur(); }}>
    <div className="sc-frame" ref={frame}>
      <header className="sc-header">
        <h2 style={step(0)}>{uiText("Settings")}</h2>
        <div className="sc-trigger-slot" style={step(1)}>
          <button ref={trigger} type="button" className="sc-trigger" aria-haspopup="dialog" aria-keyshortcuts="Meta+K Control+K /" data-hidden={palette ? "" : undefined} onClick={openPalette}>
            <Search size={16} aria-hidden="true" /><span>{uiText("Search settings")}</span><kbd className="sc-kbd" aria-hidden="true">{uiText(shortcut)}</kbd>
          </button>
        </div>
        {onClose && <button type="button" className="sc-close" aria-label={uiText("Close settings")} style={step(2)} onClick={onClose}><X size={16} aria-hidden="true" /></button>}
      </header>
      <nav className="sc-nav" aria-label={uiText("Settings sections")}><ul>
        {sections.map((section, index) => {
          const Icon = sectionIcons[section.id];
          const active = current === section.id;
          return <li key={section.id} style={step(3 + index)}><button type="button" className="sc-nav__item" aria-current={active ? "true" : undefined} onClick={() => goToSection(section.id)}>
            {active && <motion.span className="sc-nav__highlight" layoutId="sc-nav-highlight" aria-hidden="true" transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 40 }} />}
            <Icon size={16} aria-hidden="true" /><span className="sc-nav__label">{uiText(section.label)}</span>
            {dirty.has(section.id) && <><span className="sc-nav__dot" aria-hidden="true" /><span className="sc-sr-only">{uiText("Has edited settings")}</span></>}
          </button></li>;
        })}
      </ul></nav>
      <div className="sc-main">
        <div className="sc-scroller" ref={scroller} tabIndex={-1}>
          {sections.map((section, sectionIndex) => <section key={section.id} className="sc-section" id={`sc-section-${section.id}`} aria-labelledby={`sc-heading-${section.id}`} ref={node => { if (node) sectionNodes.current.set(section.id, node); }}>
            <div className="sc-section__head" style={step(9 + sectionIndex * 2)}><h3 id={`sc-heading-${section.id}`}>{uiText(section.label)}</h3><p>{section.id === "general" ? uiText("Name, address, and regional defaults for {0}.", [draft.workspaceName.trim() || uiText("this workspace")]) : uiText(section.description(draft))}</p></div>
            {section.id === 'where-you-log' && <SecuritySettings email={profileEmail} embedded labelledBy={`sc-heading-${section.id}`} />}
            <div className="sc-rows">
              {rows.filter(row => row.section === section.id).map(row => <Row key={row.id} order={rows.indexOf(row)} id={row.id} label={uiText(row.label)} hint={uiText(row.hint)} kind={row.kind} wide={row.kind === "text"} dirty={edited.has(row.key)} error={errors[row.key] && (attempted || edited.has(row.key)) ? errors[row.key] : undefined} pulse={pulse?.id === row.id ? pulse.flip : undefined} rowRef={node => { if (node) rowNodes.current.set(row.id, node); else rowNodes.current.delete(row.id); }}>{uiText(control(row))}</Row>)}
            </div>
          </section>)}
        </div>
        <SaveBar visible={barVisible} phase={barPhase} count={Math.max(changed.length, 1)} failed={failed} onSave={save} onDiscard={discard} />
      </div>
      <AnimatePresence>{palette && <SettingsPalette key="palette" origin={palette} frameWidth={frameWidth} onClose={closePalette} onPick={pick} onAnnounce={announce} />}</AnimatePresence>
    </div>
    <div className="sc-sr-only" role="status" aria-live="polite">{uiText(message)}</div>
  </div>;
}
