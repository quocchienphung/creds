"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useId, useState, type KeyboardEvent, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, ChevronDown, X } from "lucide-react";
import { dayId, dayLabel, fullDate, shortAge } from "./time";

export interface TimelineEvent {
  id: string; at: number;
  /** Bold lead-in, usually who or what the update is about. */
  actor?: string; title: string; meta?: string;
  tone?: "neutral" | "success" | "danger";
  /** Rows with detail expand in place. */
  detail?: ReactNode;
}

/**
 * What happened, newest first, grouped by day. Day labels stay pinned while updates scroll under them; the connecting line draws as rows come
 * into view and markers pop in; new updates slide in at the top while the rest glide down; rows with detail expand on a spring. Arrow keys,
 * Home and End move between expandable rows. Reduced motion replaces travel with instant changes.
 */
export function Timeline({ events, now, label, maxHeight, empty }: { events: readonly TimelineEvent[]; now: number; label: string; maxHeight?: number; empty?: ReactNode }) {
  const { t: uiText } = useWorkspaceI18n();
  const reduce = useReducedMotion();
  const base = useId();
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const sorted = [...events].sort((a, b) => b.at - a.at);
  const groups: { key: string; label: string; rows: TimelineEvent[] }[] = [];
  for (const event of sorted) {
    const key = dayId(event.at), group = groups.at(-1);
    if (group?.key === key) group.rows.push(event); else groups.push({ key, label: dayLabel(event.at, now), rows: [event] });
  }
  const toggle = (id: string) => setOpen(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button[data-tl-toggle]")];
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    event.preventDefault();
    buttons[event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : Math.min(buttons.length - 1, Math.max(0, at + (event.key === "ArrowDown" ? 1 : -1)))]?.focus();
  }
  if (!sorted.length) return <div className="sk-tl sk-tl--empty" role="region" aria-label={uiText(label)}>{uiText(empty)}</div>;
  const spring = reduce ? { duration: 0 } : { type: "spring" as const, stiffness: 350, damping: 34 };
  return <div className="sk-tl" role="region" aria-label={uiText(label)} onKeyDown={onKeyDown} style={maxHeight ? { maxHeight } : undefined} data-scroll={maxHeight ? "" : undefined}>
    {groups.map(group => <section key={group.key}>
      <h3 className="sk-tl__day"><span>{uiText(group.label)}</span><small>{uiText(group.rows.length)} {uiText(" update")}{uiText(group.rows.length === 1 ? "" : "s")}</small></h3>
      <ol>
        <AnimatePresence initial={false}>
          {group.rows.map((row, index) => {
            const expanded = open.has(row.id), panel = `${base}-${row.id}`;
            const body = <>
              <span className="sk-tl__marker" data-tone={row.tone ?? "neutral"} aria-hidden="true">{row.tone === "success" ? <Check size={11} strokeWidth={2.4} /> : row.tone === "danger" ? <X size={11} strokeWidth={2.4} /> : <i />}</span>
              <span className="sk-tl__text"><span>{row.actor && <b>{row.actor} </b>}{uiText(row.title)}</span>{row.meta && <small>{uiText(row.meta)}</small>}</span>
              <time dateTime={new Date(row.at).toISOString()} title={uiText(fullDate(row.at))}>{uiText(shortAge(row.at, now))}<span className="sk-sr-only">, {uiText(fullDate(row.at))}</span></time>
              {row.detail ? <ChevronDown size={14} className="sk-tl__chevron" aria-hidden="true" /> : <span className="sk-tl__chevron" />}
            </>;
            return <motion.li key={row.id} layout={reduce ? false : "position"} initial={reduce ? false : { opacity: 0, y: -14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={spring} className="sk-tl__row" data-last={index === group.rows.length - 1 || undefined} style={{ ["--tl-delay" as string]: `${Math.min(index, 8) * 45}ms` }}>
              {row.detail
                ? <button type="button" data-tl-toggle="" aria-expanded={expanded} aria-controls={panel} onClick={() => toggle(row.id)}>{uiText(body)}</button>
                : <div className="sk-tl__plain">{uiText(body)}</div>}
              <AnimatePresence initial={false}>{row.detail && expanded && <motion.div id={panel} className="sk-tl__detail" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={spring}><div>{uiText(row.detail)}</div></motion.div>}</AnimatePresence>
            </motion.li>;
          })}
        </AnimatePresence>
      </ol>
    </section>)}
  </div>;
}
