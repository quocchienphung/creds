"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { motion, useReducedMotion } from "motion/react";
import { CornerDownLeft, Search } from "lucide-react";
import { searchSettings, type SettingsSearchRow } from "./settings-model";
import { sectionIcons } from "./section-icons";

export interface FlightRect { x: number; y: number; width: number; height: number }

/**
 * The search palette. The search field of the header grows into it on one spring (position, size and corner radius together; frame
 * traces of the public preview: 313 × 56 → 560 × 382, radius 10 → 14, settled by ~900ms). Choosing a result flies it to the row it names
 * while the page scrolls, then it fades; Escape sends it back to the field.
 */
export function SettingsPalette({ origin, frameWidth, onClose, onPick, onAnnounce }: {
  origin: FlightRect; frameWidth: number;
  /** `to` is where the palette should travel while it closes (the field, by default). */
  onClose: () => void;
  onPick: (row: SettingsSearchRow) => { to: FlightRect } | void;
  onAnnounce: (message: string) => void;
}) {
  const { t: uiText } = useWorkspaceI18n();
  const reduce = useReducedMotion();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [leaving, setLeaving] = useState<FlightRect | "origin" | null>(null);
  const hits = useMemo(() => searchSettings(query, uiText), [query, uiText]);
  const id = useId();
  const content = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [height, setHeight] = useState<number | null>(null);
  const width = Math.min(560, Math.max(240, frameWidth - 24));
  const target = { x: Math.round((frameWidth - width) / 2 * 10) / 10, y: 12, width };

  useLayoutEffect(() => {
    const node = content.current;
    if (!node) return;
    const measure = () => setHeight(node.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => { list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" }); }, [active]);
  useEffect(() => {
    onAnnounce(query.trim() ? `${hits.length} ${hits.length === 1 ? "setting" : "settings"} found` : "Suggested settings");
  }, [hits.length, query, onAnnounce]);

  function choose(index: number) {
    const hit = hits[index];
    if (!hit || leaving) return;
    const flight = onPick(hit.row);
    setLeaving(flight ? flight.to : "origin");
  }
  function close() { if (!leaving) { setLeaving("origin"); } }
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") { event.preventDefault(); setActive(current => (hits.length ? (current + 1) % hits.length : 0)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive(current => (hits.length ? (current - 1 + hits.length) % hits.length : 0)); }
    else if (event.key === "Home") { event.preventDefault(); setActive(0); }
    else if (event.key === "End") { event.preventDefault(); setActive(Math.max(0, hits.length - 1)); }
    else if (event.key === "Enter") { event.preventDefault(); choose(active); }
    else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
    else if (event.key === "Tab") { event.preventDefault(); }
  }
  const settled = height ?? origin.height;
  const spring = reduce ? { duration: 0 } : { type: "spring" as const, stiffness: 190, damping: 26 };
  const toRow = leaving && leaving !== "origin";
  const animate = leaving === null
    ? { x: target.x, y: target.y, width: target.width, height: settled, borderRadius: 14, opacity: 1 }
    : leaving === "origin"
      ? { x: origin.x, y: origin.y, width: origin.width, height: origin.height, borderRadius: 10, opacity: reduce ? 0 : 0.01 }
      : { x: leaving.x, y: leaving.y, width: leaving.width, height: leaving.height, borderRadius: 10, opacity: 0 };
  const transition = leaving === null ? spring : toRow ? { ...(reduce ? { duration: 0.18 } : { type: "spring" as const, stiffness: 120, damping: 20 }), opacity: { duration: reduce ? 0.18 : 0.42, delay: reduce ? 0 : 0.22 } } : { ...(reduce ? { duration: 0.14 } : { type: "spring" as const, stiffness: 230, damping: 28 }), opacity: { duration: 0.18, delay: reduce ? 0 : 0.1 } };

  return <>
    <motion.div className="sc-scrim" aria-hidden="true" initial={{ opacity: 0 }} animate={{ opacity: leaving ? 0 : 1 }} transition={{ duration: reduce ? 0.1 : 0.22 }} onPointerDown={close} />
    <motion.div className="sc-palette" role="dialog" aria-modal="true" aria-label={uiText("Search settings")}
      initial={{ x: origin.x, y: origin.y, width: origin.width, height: origin.height, borderRadius: 10, opacity: 1 }}
      animate={animate} transition={transition} onAnimationComplete={() => { if (leaving) onClose(); }}>
      <div className="sc-palette__content" ref={content} style={{ width }}>
        <div className="sc-palette__field">
          <Search size={16} aria-hidden="true" />
          <input autoFocus placeholder={uiText("Search settings")} role="combobox" aria-expanded="true" aria-controls={`${id}-results`} aria-autocomplete="list" aria-activedescendant={hits[active] ? `${id}-option-${hits[active].row.id}` : undefined} spellCheck={false} autoComplete="off" value={query} onChange={event => { setQuery(event.target.value); setActive(0); }} onKeyDown={onKeyDown} />
          <kbd className="sc-kbd">{uiText("Esc")}</kbd>
        </div>
        <motion.div className="sc-palette__body" initial={{ opacity: reduce ? 1 : 0 }} animate={{ opacity: leaving ? 0 : 1 }} transition={{ duration: 0.16, delay: leaving || reduce ? 0 : 0.08 }}>
          {!query.trim() && <p className="sc-palette__hint">{uiText("Suggested")}</p>}
          {hits.length ? <ul id={`${id}-results`} ref={list} role="listbox" aria-label={uiText("Matching settings")} className="sc-results">
            {hits.map((hit, index) => {
              const Icon = sectionIcons[hit.row.section];
              const [from, to] = hit.labelRange ?? [0, 0];
              return <li key={hit.row.id} id={`${id}-option-${hit.row.id}`} data-index={index} role="option" aria-selected={index === active} className="sc-result" onPointerMove={() => setActive(index)} onClick={() => choose(index)}>
                {index === active && <motion.span layoutId={`${id}-highlight`} className="sc-result__highlight" aria-hidden="true" transition={{ type: "spring", stiffness: 520, damping: 40 }} />}
                <Icon size={15} aria-hidden="true" />
                <span className="sc-result__text">
                  <span className="sc-result__label">{to > from ? <>{uiText(hit.row.label.slice(0, from))}<mark className="sc-mark">{uiText(hit.row.label.slice(from, to))}</mark>{uiText(hit.row.label.slice(to))}</> : hit.row.label}</span>
                  <span className="sc-result__description">{uiText(hit.row.hint)}</span>
                </span>
                <span className="sc-result__end" aria-hidden="true">{index === active && <CornerDownLeft size={14} />}</span>
              </li>;
            })}
          </ul> : <p className="sc-empty" role="status">{uiText("No settings match “")}{uiText(query.trim())}”.</p>}
          <div className="sc-palette__foot" aria-hidden="true"><span><kbd className="sc-kbd">↑</kbd><kbd className="sc-kbd">↓</kbd> {uiText(" Move")}</span><span><kbd className="sc-kbd">↵</kbd> {uiText(" Jump to setting")}</span></div>
        </motion.div>
      </div>
    </motion.div>
  </>;
}
