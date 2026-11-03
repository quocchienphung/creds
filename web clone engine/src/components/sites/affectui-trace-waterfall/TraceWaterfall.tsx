"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from "react";
import { Hourglass } from "lucide-react";
import { Mark, markNames, Spark } from "../affectui-agent-tree/tree-marks";
import { useWidth } from "../affectui-agent-tree/use-width";
import {
  MIN_RANGE, axisRange, barOf, branchCost, flattenSpans, formatDollars, formatDuration, formatStarted, formatTick, formatTokens, hasAnyCost, kindLabel,
  rowLabel, rowsOf, runStatus, slowestId, spanDuration, spanEnd, statusLabel, tagSide, ticksOf, totalsOf, visibleRows,
} from "./trace-model";
import type { TagSide, TraceRow, TraceSpan } from "./trace-model";
import "./trace-waterfall.css";

/**
 * Where the time and money of a run go: every model call, tool call and sub-agent as a bar on one timeline, with tokens and cost
 * per step, the slowest call marked, and branches that fold into their parent. Rebuilt from the public preview of affectUI's Trace
 * Waterfall (docs/research/trace-waterfall); the whole run is passed as a tree each time something changes, ids keep rows in place.
 */
export interface TraceWaterfallProps {
  /** The whole run as a tree, rebuilt as it goes on. Times are ms from the start of the run. */
  root: TraceSpan;
  /** The clock in ms from the start of the run. Without it the waterfall ticks its own clock from `startedAt` while a span runs. */
  now?: number;
  /** When the run started (epoch ms): used only when `now` is not given. */
  startedAt?: number;
  collapsed?: readonly string[];
  defaultCollapsed?: readonly string[];
  onCollapsedChange?: (collapsed: string[]) => void;
  openId?: string | null;
  defaultOpenId?: string | null;
  onOpenChange?: (id: string | null, span?: TraceSpan) => void;
  /** Tags the slowest finished model or tool call. */
  markSlowest?: boolean;
  /** The shortest time the axis shows, in ms: it grows in round steps as the run gets longer. */
  minRange?: number;
  formatCost?: (amount: number) => string;
  /** The heading of the bar; next to it the root's input (or name). */
  title?: string;
  /** What is shown next to the heading instead of the root's input. */
  subtitle?: string;
  /** What the state chip says instead of Live / Done / Failed (for example "Needs you"). */
  state?: { label: string; status: "running" | "done" | "failed" | "waiting" | "stopped" };
  className?: string;
}

/* Layout numbers that the stylesheet also uses (--twf-pad, --twf-name, --twf-gap, --twf-end): the timeline starts after them. */
const PAD = 10, NAME = 232, GAP = 14, END = 16, NARROW = 560;
const ROW_DELAY = 30;

/* One shared clock for waterfalls that tick themselves: 10 times a second while any of them has a running span. */
let wall = 0;
const clockListeners = new Set<() => void>();
let clockTimer: ReturnType<typeof setInterval> | undefined;
function subscribeClock(listener: () => void) {
  wall = Date.now();
  clockListeners.add(listener);
  clockTimer ??= setInterval(() => { wall = Date.now(); clockListeners.forEach(notify => notify()); }, 100);
  return () => { clockListeners.delete(listener); if (!clockListeners.size) { clearInterval(clockTimer); clockTimer = undefined; } };
}
const quietClock = () => () => {};
const readClock = () => { if (!wall) wall = Date.now(); return wall; };

/** A number that glides to a new value: the axis range grows in round steps and everything on it rescales with it. */
function useGlide(target: number, ms = 520) {
  const [shown, setShown] = useState(target);
  const current = useRef(target);
  useEffect(() => {
    const from = current.current;
    if (from === target) return;
    const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const begin = performance.now();
    let frame = 0;
    const step = (at: number) => {
      const t = reduce ? 1 : Math.min(1, (at - begin) / ms);
      const value = from + (target - from) * (1 - Math.pow(1 - t, 3));
      current.current = value;
      setShown(value);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, ms]);
  return shown;
}

const Chevron = () => <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="m3 4.5 3 3 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const Warn = () => <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M7 2.2 12.6 11.8H1.4L7 2.2ZM7 6v2.8M7 10.2v.1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const Spin = () => <svg className="twf__spin" width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" opacity=".25" /><path d="M7 2a5 5 0 0 1 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>;
const Close = () => <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="m3.5 3.5 7 7m0-7-7 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>;

function SpanIcon({ span }: { span: TraceSpan }) {
  return <span className="twf__icon" data-logo={span.mark ? "" : undefined} data-wait={span.kind === "wait" ? "" : undefined}>
    {span.mark ? <Mark id={span.mark} /> : span.kind === "wait" ? <Hourglass size={12} /> : <span className="twf__swatch" />}
  </span>;
}

interface Shown { row: TraceRow; leaving: boolean }
/** The current rows with the ones that just left kept in place (closing up) for a moment. */
function withLeaving(previous: readonly TraceRow[], rows: readonly TraceRow[], leaving: ReadonlySet<string>): Shown[] {
  const now = new Map(rows.map(row => [row.span.id, row]));
  const shown: Shown[] = [];
  const placed = new Set<string>();
  for (const old of previous) {
    const current = now.get(old.span.id);
    if (current) { shown.push({ row: current, leaving: false }); placed.add(old.span.id); }
    else if (leaving.has(old.span.id)) shown.push({ row: old, leaving: true });
  }
  for (const row of rows) if (!placed.has(row.span.id)) shown.push({ row, leaving: false });
  return shown;
}

export function TraceWaterfall({
  root, now: nowProp, startedAt, collapsed: collapsedProp, defaultCollapsed = [], onCollapsedChange, openId: openProp, defaultOpenId = null, onOpenChange,
  markSlowest = true, minRange = MIN_RANGE, formatCost = formatDollars, title = "Trace", subtitle, state, className,
}: TraceWaterfallProps) {
  const { t: uiText } = useWorkspaceI18n();
  const uid = useId();
  const [setBox, width] = useWidth();
  const [innerCollapsed, setInnerCollapsed] = useState<readonly string[]>(defaultCollapsed);
  const collapsedIds = collapsedProp ?? innerCollapsed;
  const [innerOpen, setInnerOpen] = useState<string | null>(defaultOpenId);
  const openId = openProp !== undefined ? openProp : innerOpen;
  const [focusId, setFocusId] = useState<string>(root.id);
  const [closing, setClosing] = useState<string | null>(null);
  const rowEls = useRef(new Map<string, HTMLElement>());

  const running = flattenSpans(root).some(span => span.status === "running");
  const wallClock = useSyncExternalStore(running && nowProp === undefined && startedAt !== undefined ? subscribeClock : quietClock, readClock, readClock);
  const now = nowProp ?? (startedAt !== undefined ? Math.max(0, wallClock - startedAt) : Math.max(0, ...flattenSpans(root).map(span => span.end ?? span.start)));

  const collapsedSet = useMemo(() => new Set(collapsedIds), [collapsedIds]);
  const rows = useMemo(() => rowsOf(root, collapsedSet), [root, collapsedSet]);
  const totals = totalsOf(root, now);
  const status = runStatus(root);
  const slow = markSlowest ? slowestId(root) : null;
  const extent = Math.max(totals.duration + root.start, now > 0 && running ? now : 0);
  const target = axisRange(extent, minRange);
  const range = useGlide(target);

  // Ticks of the axis: the ones that are no longer on it fade out where they are, the new ones fade in.
  const [axis, setAxis] = useState({ target, ticks: ticksOf(target), gone: [] as number[] });
  if (axis.target !== target) {
    const next = ticksOf(target);
    setAxis({ target, ticks: next, gone: [...new Set([...axis.gone, ...axis.ticks.filter(tick => !next.includes(tick))])].filter(tick => !next.includes(tick)) });
  }
  useEffect(() => {
    if (!axis.gone.length) return;
    const timer = setTimeout(() => setAxis(current => ({ ...current, gone: [] })), 440);
    return () => clearTimeout(timer);
  }, [axis.target, axis.gone.length]);

  // Rows that are no longer in the trace close up a beat after each other, bottom first.
  const [seen, setSeen] = useState<readonly TraceRow[]>(rows);
  const [leavingIds, setLeavingIds] = useState<ReadonlySet<string>>(new Set());
  if (seen !== rows) {
    const ids = new Set(rows.map(row => row.span.id));
    const gone = seen.filter(row => !ids.has(row.span.id) && !row.hidden).map(row => row.span.id);
    setSeen(rows);
    if (gone.length) setLeavingIds(current => new Set([...current, ...gone]));
  }
  useEffect(() => {
    if (!leavingIds.size) return;
    const timer = setTimeout(() => setLeavingIds(new Set()), 420);
    return () => clearTimeout(timer);
  }, [leavingIds]);
  const shown = useMemo(() => withLeaving(seen === rows ? rows : seen, rows, leavingIds), [seen, rows, leavingIds]);
  const [settled, setSettled] = useState(false);
  useEffect(() => { const timer = setTimeout(() => setSettled(true), 900); return () => clearTimeout(timer); }, []);

  const narrow = width > 0 && width <= NARROW;
  const trackPx = Math.max(120, width - PAD - NAME - GAP - END);
  const reachable = visibleRows(rows);
  const rovingId = reachable.some(row => row.span.id === focusId) ? focusId : root.id;

  const setCollapsed = useCallback((next: string[]) => { if (collapsedProp === undefined) setInnerCollapsed(next); onCollapsedChange?.(next); }, [collapsedProp, onCollapsedChange]);
  const toggle = (id: string, folded?: boolean) => {
    const isFolded = folded ?? collapsedSet.has(id);
    setCollapsed(isFolded ? collapsedIds.filter(item => item !== id) : [...collapsedIds, id]);
  };
  const setOpen = useCallback((id: string | null) => {
    if (openProp === undefined) setInnerOpen(id);
    onOpenChange?.(id, id ? flattenSpans(root).find(span => span.id === id) : undefined);
  }, [openProp, onOpenChange, root]);
  const closeDetails = (focus = true) => {
    if (!openId) return;
    const was = openId;
    setClosing(was);
    setTimeout(() => setClosing(current => current === was ? null : current), 170);
    setOpen(null);
    if (focus) rowEls.current.get(was)?.focus({ preventScroll: true });
  };
  const toggleOpen = (id: string) => { if (openId === id) closeDetails(); else { setClosing(null); setOpen(id); } setFocusId(id); };
  const focusRow = (id: string) => { setFocusId(id); rowEls.current.get(id)?.focus({ preventScroll: true }); };

  function onKey(event: ReactKeyboardEvent<HTMLDivElement>, row: TraceRow) {
    if (event.target !== event.currentTarget) return;
    const index = reachable.findIndex(item => item.span.id === row.span.id);
    const go = (target: TraceRow | undefined) => { if (target) { event.preventDefault(); focusRow(target.span.id); } };
    if (event.key === "ArrowDown") go(reachable[index + 1]);
    else if (event.key === "ArrowUp") go(reachable[index - 1]);
    else if (event.key === "Home") go(reachable[0]);
    else if (event.key === "End") go(reachable[reachable.length - 1]);
    else if (event.key === "ArrowRight") {
      if (row.folded) { event.preventDefault(); toggle(row.span.id, true); }
      else if (row.hasChildren) go(reachable[index + 1]);
    } else if (event.key === "ArrowLeft") {
      if (row.hasChildren && !row.folded) { event.preventDefault(); toggle(row.span.id, false); }
      else go(reachable.find(item => item.span.id === row.parentId));
    } else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggleOpen(row.span.id); }
    else if (event.key === "Escape") closeDetails();
  }

  // The details window closes with a click anywhere outside it and its row.
  useEffect(() => {
    if (!openId) return;
    const listener = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (target?.closest(".twf__pop, .twf__row")) return;
      setClosing(openId);
      setOpen(null);
    };
    document.addEventListener("pointerdown", listener);
    return () => document.removeEventListener("pointerdown", listener);
  }, [openId, setOpen]);
  useEffect(() => {
    if (!closing) return;
    const timer = setTimeout(() => setClosing(null), 170);
    return () => clearTimeout(timer);
  }, [closing]);

  const pillStatus = state?.status ?? status;
  const pillText = state?.label ?? (status === "running" ? "Live" : statusLabel[status]);
  const header = subtitle ?? root.input ?? root.name;
  const popId = openId ?? closing;
  const leavingOrder = shown.filter(item => item.leaving).length;
  let leavingSeen = 0;

  const style = { "--twf-range": range, "--twf-at": Math.min(range, Math.max(0, now)) } as CSSProperties;
  const live = running;

  return <div className={`twf${className ? ` ${className}` : ""}`} ref={setBox} style={style} data-narrow={narrow ? "" : undefined}>
    <header className="twf__head">
      <span className="twf__spark"><Spark /></span>
      <span className="twf__heading">{uiText(title)}</span>
      <span className="twf__task">{uiText(header)}</span>
      <span className="twf__pill" data-status={pillStatus} aria-live="polite">{pillStatus === "running" && <span className="twf__pulse" />}{uiText(pillText)}</span>
    </header>
    <div className="twf__card">
      <dl className="twf__stats">
        <Stat label={uiText("Duration")} value={formatDuration(totals.duration)} live={live} />
        <Stat label={uiText("Cost")} value={totals.hasCost ? formatCost(totals.cost) : "–"} live={live && totals.hasCost} />
        <Stat label={uiText("Tokens")} value={totals.hasTokens ? formatTokens(totals.tokens) : "–"} live={live && totals.hasTokens} />
        <Stat label={uiText("LLM calls")} value={String(totals.llmCalls)} />
        <Stat label={uiText("Tool calls")} value={String(totals.toolCalls)} />
        <Stat label={uiText("Errors")} value={String(totals.errors)} failed={totals.errors > 0} />
      </dl>
      <div className="twf__body">
        <div className="twf__layer" aria-hidden="true">
          {axis.ticks.map(tick => <span key={tick} className="twf__tick" data-zero={tick === 0 ? "" : undefined} style={{ "--v": tick } as CSSProperties}><span>{uiText(formatTick(tick))}</span></span>)}
          {axis.gone.map(tick => <span key={`gone-${tick}`} className="twf__tick" data-leaving="" style={{ "--v": tick } as CSSProperties}><span>{uiText(formatTick(tick))}</span></span>)}
          <span className="twf__now" />
        </div>
        <div className="twf__axis" aria-hidden="true"><span>{uiText("Span")}</span></div>
        <div className="twf__rows" role="tree" aria-label={uiText(title)}>
          {shown.map(({ row, leaving }, index) => {
            const { span } = row;
            const open = openId === span.id;
            const bar = barOf(span, now, range);
            const duration = spanDuration(span, now);
            const cost = row.span.children?.length ? (hasAnyCost(span) ? branchCost(span) : undefined) : span.cost;
            const labelText = `${formatDuration(duration)}${cost !== undefined ? ` · ${formatCost(cost)}` : ""}`;
            const labelPx = labelText.length * 6.6 + 10;
            const side: TagSide = tagSide(bar.start * trackPx, (bar.start + bar.width) * trackPx, labelPx, trackPx);
            const marks = row.descendants.filter(item => item.kind === "llm" || item.kind === "tool" || item.kind === "wait");
            const delay = leaving ? (leavingOrder - 1 - leavingSeen++) * 40 : settled ? 0 : Math.min(index, 14) * ROW_DELAY;
            const above = reachable.length > 4 && reachable.findIndex(item => item.span.id === span.id) > reachable.length * 0.55;
            const pop = popId === span.id ? <Details key={`${span.id}-pop`} id={`${uid}-${span.id}`} span={span} now={now} formatCost={formatCost} width={width} narrow={narrow} trackPx={trackPx} bar={bar} above={above} closing={!open} onClose={() => closeDetails()} /> : null;
            return <Fragment key={span.id}>
              {uiText(above && pop)}
              <div
                ref={element => { if (element) rowEls.current.set(span.id, element); else rowEls.current.delete(span.id); }}
                className="twf__row" role="treeitem" aria-level={row.level} aria-selected={open} aria-label={uiText(rowLabel(span, now, formatCost))} aria-expanded={row.hasChildren ? !row.folded : undefined}
                tabIndex={rovingId === span.id && !row.hidden ? 0 : -1} data-kind={span.kind} data-status={span.status} data-parent={row.hasChildren ? "" : undefined} data-folded={row.folded ? "" : undefined}
                data-open={open ? "" : undefined} data-hidden={row.hidden ? "" : undefined} data-leaving={leaving ? "" : undefined} data-slow={slow === span.id ? "" : undefined} style={{ animationDelay: `${delay}ms` }}
                onClick={() => toggleOpen(span.id)} onFocus={event => { if (event.target === event.currentTarget) setFocusId(span.id); }} onKeyDown={event => onKey(event, row)}
              >
                <div className="twf__name">
                  {row.level > 1 && <span className="twf__guides" aria-hidden="true" style={{ width: `calc(${row.level - 1} * var(--twf-indent))` }} />}
                  <span className="twf__chev" data-leaf={row.hasChildren ? undefined : ""} aria-hidden="true" onClick={row.hasChildren ? event => { event.stopPropagation(); toggle(span.id, row.folded); } : undefined}>{row.hasChildren && <Chevron />}</span>
                  <SpanIcon span={span} />
                  <span className="twf__label"><span className="twf__title">{uiText(span.name)}</span>{span.detail && <span className="twf__detail">{uiText(span.detail)}</span>}</span>
                  {row.folded && <span className="twf__more" title={uiText("{0} hidden", [row.descendants.length])}>+{uiText(row.descendants.length)}</span>}
                  {span.status !== "done" && <span className="twf__state" data-status={span.status}>{span.status === "running" ? <Spin /> : <Warn />}</span>}
                  <span className="twf__meta"><span className="twf__amount" data-live={span.status === "running" ? "" : undefined}>{uiText(formatDuration(duration))}{cost !== undefined && <span className="twf__meta-cost"> · {uiText(formatCost(cost))}</span>}</span>{slow === span.id && <span className="twf__slow">{uiText("Slowest")}</span>}</span>
                </div>
                <div className="twf__track">
                  <span className="twf__bar" data-bar="" data-kind={span.kind} data-status={span.status} style={{ "--s": span.start, "--d": Math.max(0, spanEnd(span, now) - span.start), animationDelay: `${delay + 60}ms` } as CSSProperties} />
                  {marks.map(mark => <span key={mark.id} className="twf__mark" data-kind={mark.kind} data-status={mark.status} aria-hidden="true" style={{ "--s": mark.start, "--d": spanDuration(mark, now) } as CSSProperties} />)}
                  <span className="twf__tag" data-side={side} style={{ "--s": span.start, "--d": spanEnd(span, now) - span.start } as CSSProperties}><span className="twf__amount" data-live={span.status === "running" ? "" : undefined}>{uiText(labelText)}</span></span>
                  {slow === span.id && <span className="twf__slow twf__slow--bar" style={{ "--e": spanEnd(span, now) } as CSSProperties}>{uiText("Slowest")}</span>}
                </div>
              </div>
              {uiText(!above && pop)}
            </Fragment>;
          })}
        </div>
      </div>
    </div>
  </div>;
}

function Stat({ label, value, live, failed }: { label: string; value: string; live?: boolean; failed?: boolean }) {
  const { t: uiText } = useWorkspaceI18n();
  return <div className="twf__stat" data-kind={failed ? "failed" : undefined}><dt>{uiText(label)}</dt><dd><span className="twf__amount" data-live={live ? "" : undefined}>{uiText(value)}</span></dd></div>;
}

interface DetailsProps { id: string; span: TraceSpan; now: number; formatCost: (amount: number) => string; width: number; narrow: boolean; trackPx: number; bar: { start: number; width: number }; above: boolean; closing: boolean; onClose: () => void }
function Details({ id, span, now, formatCost, width, narrow, trackPx, bar, above, closing, onClose }: DetailsProps) {
  const { t: uiText } = useWorkspaceI18n();
  const popWidth = Math.min(320, Math.max(0, width - 16));
  const left = narrow ? 8 : Math.max(8, Math.min(width - popWidth - 8, PAD + NAME + GAP + bar.start * trackPx - 24));
  const duration = spanDuration(span, now);
  const kind = `${kindLabel[span.kind]}${span.mark ? ` · ${markNames[span.mark]}` : span.detail ? ` · ${span.detail}` : ""}`;
  const cost = span.cost;
  return <div className="twf__anchor" data-above={above ? "" : undefined}>
    <div className="twf__pop" id={id} role="dialog" aria-label={uiText("{0} details", [span.name])} data-kind={span.kind} data-status={span.status} data-side={above ? "above" : "below"} data-closing={closing ? "" : undefined} style={{ left }} onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }}>
      <div className="twf__pop-head">
        <SpanIcon span={span} />
        <span className="twf__pop-who"><span className="twf__pop-name">{uiText(span.name)}</span><span className="twf__pop-kind">{uiText(kind)}</span></span>
        <span className="twf__pill" data-status={span.status}>{uiText(statusLabel[span.status])}</span>
        <button type="button" className="twf__close" aria-label={uiText("Close details")} onClick={onClose}><Close /></button>
      </div>
      <dl className="twf__pop-stats">
        <div><dt>{uiText("Duration")}</dt><dd>{uiText(formatDuration(duration))}</dd></div>
        <div><dt>{uiText("Started")}</dt><dd>{uiText(formatStarted(span.start))}</dd></div>
        {cost !== undefined && <div><dt>{uiText("Cost")}</dt><dd>{uiText(formatCost(cost))}</dd></div>}
        {span.tokensIn !== undefined && <div><dt>{uiText("Tokens in")}</dt><dd>{uiText(formatTokens(span.tokensIn))}</dd></div>}
        {span.tokensOut !== undefined && <div><dt>{uiText("Tokens out")}</dt><dd>{uiText(formatTokens(span.tokensOut))}</dd></div>}
      </dl>
      {span.error && <div className="twf__pop-error"><Warn /><span>{uiText(span.error)}</span></div>}
      {span.input && <div className="twf__pop-io"><span>{uiText("Input")}</span><p>{uiText(span.input)}</p></div>}
      {span.output && <div className="twf__pop-io"><span>{uiText("Output")}</span><p>{uiText(span.output)}</p></div>}
    </div>
  </div>;
}
