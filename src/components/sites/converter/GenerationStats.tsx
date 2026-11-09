"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AlertTriangle, Check, ChevronDown, Copy, Loader2, RotateCcw, Square, X } from "lucide-react";
import { glide, sparkPath } from "./flip-model";
import "./flip-tokens.css";
import "./generation-stats.css";

export type GenerationStatus = "idle" | "waiting" | "streaming" | "done" | "stopped" | "error";
export interface StatCell {
  id: string;
  label: string;
  /** null shows a dash. A number that goes up counts up; one that goes down cuts straight to the new value. */
  value: number | null;
  format: (value: number) => string;
  unit?: string;
  /** The unit as it reads in the inline variant ("to first token", "tokens"). */
  unitInline?: string;
  /** Readings for a sparkline, oldest first. */
  spark?: number[];
}
export interface StatsTable { caption: string; head: [string, ...string[]]; rows: { label: string; cells: ReactNode[] }[]; total?: { label: string; cells: ReactNode[] }; /** Index (among the cells) of a column that hides below 440 px. */ rateColumn?: number }
export interface StatsLatency { first: { label: string; ms: number }; rest: { label: string; ms: number }; total: { label: string; ms: number }; format: (ms: number) => string; ariaLabel: string }
export interface GenerationStatsProps {
  status: GenerationStatus;
  /** The label next to the status icon ("Done in 3.60s", "Waiting"). */
  statusLabel: string;
  model: { name: string; mark?: ReactNode };
  cells: StatCell[];
  table?: StatsTable;
  latency?: StatsLatency;
  error?: string;
  onRetry?: () => void;
  retryLabel?: string;
  variant?: "card" | "inline";
  expanded?: boolean;
  defaultExpanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  note?: ReactNode;
  /** What the copy button puts on the clipboard (JSON). */
  copyValue?: unknown;
  labels?: { details?: string; showDetails?: string; hideDetails?: string; copy?: string; copied?: string; copyFailed?: string; statsSuffix?: string; announce?: string };
  className?: string;
}

const SPRING = { type: "spring", visualDuration: 0.26, bounce: 0 } as const;
const EASE = [0.22, 1, 0.36, 1] as const;

/** A number that glides toward each new value (about 100 ms per step), in tabular numerals; a drop cuts straight to the new value. Re-renders only itself. */
function CountNumber({ value, format, instant }: { value: number; format: (value: number) => string; instant: boolean }) {
  const [shown, setShown] = useState(instant ? value : 0);
  const state = useRef({ current: instant ? value : 0, target: value });
  useEffect(() => {
    state.current.target = value;
    if (instant) { state.current.current = value; const frame = requestAnimationFrame(() => setShown(value)); return () => cancelAnimationFrame(frame); }
    let frame = 0, last = performance.now();
    const tick = (now: number) => {
      const s = state.current; s.current = glide(s.current, s.target, now - last); last = now;
      setShown(s.current);
      if (s.current !== s.target) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, instant]);
  return <span className="gs-num">{format(shown)}</span>;
}

function Spark({ samples }: { samples: number[] }) {
  const { d, end } = sparkPath(samples, 56, 16);
  if (!d || !end) return null;
  return <svg className="gs-spark" width="56" height="16" viewBox="0 0 56 16" aria-hidden="true"><line className="gs-sparkBase" x1="0" x2="56" y1="15.5" y2="15.5" /><path className="gs-sparkLine" d={d} /><circle className="gs-sparkDot" cx={end[0]} cy={end[1]} r="2" /></svg>;
}

/**
 * A live stats strip: the model's mark and name with a status, four cells split by hairlines whose numbers count up in tabular numerals (one with a
 * sparkline), and a Details panel that opens into a latency bar and a table. Rebuilt from the open preview of UIArc's Generation stats (a Pro
 * component: DOM, declared CSS and recordings of the rendered page; docs/research/generation-stats/). It is driven by what it is given: it
 * invents no reading. The LLM-specific fields of the original (usage, pricing) are not part of this build: `cells` and `table` carry the numbers.
 */
export function GenerationStats(props: GenerationStatsProps) {
  const { status, statusLabel, model, cells, table, latency, error, onRetry, variant = "card", note, copyValue, className } = props;
  const labels = { details: "Details", showDetails: "Show details", hideDetails: "Hide details", copy: "Copy stats as JSON", copied: "Copied", copyFailed: "Copy failed", statsSuffix: " stats", announce: "", ...props.labels };
  const reduce = useReducedMotion() ?? false;
  const uid = useId();
  const [innerOpen, setInnerOpen] = useState(props.defaultExpanded ?? false);
  const open = props.expanded ?? innerOpen;
  const toggle = () => { if (props.expanded === undefined) setInnerOpen(!open); props.onExpandedChange?.(!open); };
  const [copyState, setCopyState] = useState<"idle" | "done" | "error">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async () => {
    let state: "done" | "error" = "done";
    try { await navigator.clipboard.writeText(JSON.stringify(copyValue ?? {}, null, 2)); } catch { state = "error"; }
    setCopyState(state); clearTimeout(timer.current); timer.current = setTimeout(() => setCopyState("idle"), 1400);
  };
  const running = status === "waiting" || status === "streaming";
  const icon = running ? <Loader2 size={14} className="gs-spinner" aria-hidden="true" /> : status === "done" ? <DrawnCheck reduce={reduce} /> : status === "stopped" ? <Square size={12} aria-hidden="true" /> : status === "error" ? <AlertTriangle size={14} aria-hidden="true" /> : <span aria-hidden="true">–</span>;
  const cellNodes = cells.map(cell => <div className="gs-cell" key={cell.id}>
    <dt className="gs-label">{cell.label}</dt>
    <dd className="gs-value">{cell.value === null ? <span className="gs-num">–</span> : <CountNumber value={cell.value} format={cell.format} instant={reduce || status === "idle"} />}
      {cell.unitInline && <span className="gs-unitInline">{cell.unitInline}</span>}{cell.unit && cell.value !== null && <span className="gs-unit">{cell.unit}</span>}
      {cell.spark && cell.spark.length > 1 && <Spark samples={cell.spark} />}</dd>
  </div>);
  const panel = (table || latency) ? <AnimatePresence initial={false}>{open && <motion.div key="panel" id={`${uid}-panel`} className="gs-panelClip" initial={reduce ? false : { height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={reduce ? undefined : { height: 0, opacity: 0 }} transition={reduce ? { duration: 0 } : { height: SPRING, opacity: { duration: 0.16, ease: EASE } }}>
    <div className="gs-panel">
      {latency && <section className="gs-latency" aria-label={latency.ariaLabel}>
        <div className="gs-bar" aria-hidden="true"><span className="gs-segTtft" style={{ flexGrow: latency.first.ms / Math.max(1, latency.total.ms) }} /><span className="gs-segGen" style={{ flexGrow: latency.rest.ms / Math.max(1, latency.total.ms) }} /></div>
        <dl className="gs-legend">
          <div className="gs-legendItem"><dt><span className="gs-swatchTtft" aria-hidden="true" />{latency.first.label}</dt><dd><span className="gs-num">{latency.format(latency.first.ms)}</span></dd></div>
          <div className="gs-legendItem"><dt><span className="gs-swatchGen" aria-hidden="true" />{latency.rest.label}</dt><dd><span className="gs-num">{latency.format(latency.rest.ms)}</span></dd></div>
          <div className="gs-legendItem"><dt>{latency.total.label}</dt><dd><span className="gs-num">{latency.format(latency.total.ms)}</span></dd></div>
        </dl>
      </section>}
      {table && <table className="gs-table">
        <caption className="fl-srOnly">{table.caption}</caption>
        <thead><tr>{table.head.map((h, i) => <th key={i} scope="col" className={i - 1 === table.rateColumn ? "gs-rateCol" : undefined}>{h}</th>)}</tr></thead>
        <tbody>{table.rows.map(row => <tr key={row.label}><th scope="row">{row.label}</th>{row.cells.map((c, i) => <td key={i} className={i === table.rateColumn ? "gs-rateCol" : undefined}>{typeof c === "string" || typeof c === "number" ? <span className="gs-num">{c}</span> : c}</td>)}</tr>)}</tbody>
        {table.total && <tfoot><tr><th scope="row">{table.total.label}</th>{table.total.cells.map((c, i) => <td key={i} className={i === table.rateColumn ? "gs-rateCol" : undefined}>{typeof c === "string" || typeof c === "number" ? <span className="gs-num">{c}</span> : c}</td>)}</tr></tfoot>}
      </table>}
      <div className="gs-foot"><p className="gs-note">{note}</p>
        {copyValue !== undefined && <button type="button" className="gs-copy" data-copy-state={copyState} aria-label={copyState === "done" ? labels.copied : copyState === "error" ? labels.copyFailed : labels.copy} onClick={() => void copy()}>
          <AnimatePresence mode="popLayout" initial={false}><motion.span key={copyState} style={{ display: "grid" }} initial={reduce ? false : { opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1, transition: { duration: reduce ? 0 : 0.16, ease: EASE } }} exit={{ opacity: 0, transition: { duration: reduce ? 0 : 0.1 } }}>
            {copyState === "done" ? <Check size={14} aria-hidden="true" /> : copyState === "error" ? <X size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}</motion.span></AnimatePresence></button>}
      </div>
    </div>
  </motion.div>}</AnimatePresence> : null;
  const errorRow = <AnimatePresence initial={false}>{status === "error" && error && <motion.div key="error" className="gs-errorClip" initial={reduce ? false : { height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={reduce ? undefined : { height: 0, opacity: 0 }} transition={reduce ? { duration: 0 } : { height: SPRING, opacity: { duration: 0.16, ease: EASE } }}>
    <div className="gs-error"><AlertTriangle size={16} className="gs-errorIcon" aria-hidden="true" /><p className="gs-errorText">{error}</p>{onRetry && <button type="button" className="gs-retry" onClick={onRetry}><RotateCcw size={13} aria-hidden="true" />{props.retryLabel ?? "Retry"}</button>}</div>
  </motion.div>}</AnimatePresence>;
  return <div className={`gs-root gs-${variant}${className ? ` ${className}` : ""}`} data-status={status} data-open={open || undefined} role="group" aria-labelledby={`${uid}-label`}>
    <div className="gs-head">
      <span className="gs-mark" aria-hidden="true">{model.mark}</span>
      <span id={`${uid}-label`} className="gs-model">{model.name}<span className="fl-srOnly">{labels.statsSuffix}</span></span>
      <span className="gs-status"><AnimatePresence initial={false} mode="popLayout"><motion.span key={`${status}-${statusLabel}`} className="gs-statusInner" initial={reduce ? false : { opacity: 0, y: 2 }} animate={{ opacity: 1, y: 0, transition: { duration: reduce ? 0 : 0.16, ease: EASE } }} exit={{ opacity: 0, transition: { duration: reduce ? 0 : 0.1, ease: EASE } }}>
        <span className="gs-statusIcon" data-status={status}>{icon}</span><span className="gs-statusLabel">{statusLabel}</span></motion.span></AnimatePresence></span>
    </div>
    <dl className="gs-stats">{cellNodes}</dl>
    {(table || latency) && <button type="button" className="gs-toggle" aria-expanded={open} aria-controls={`${uid}-panel`} aria-label={open ? labels.hideDetails : labels.showDetails} onClick={toggle}><span className="gs-toggleLabel">{labels.details}</span><ChevronDown size={14} className="gs-chevron" aria-hidden="true" /></button>}
    {errorRow}{panel}
    <span className="fl-srOnly" role="status" aria-live="polite">{labels.announce}</span>
  </div>;
}

/** The check of a finished run draws itself once. */
function DrawnCheck({ reduce }: { reduce: boolean }) {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: reduce ? 0 : 0.32, ease: EASE, delay: 0.04 }} />
  </svg>;
}
