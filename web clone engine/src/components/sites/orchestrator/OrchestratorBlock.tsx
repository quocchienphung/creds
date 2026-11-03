"use client";

import { motion } from "motion/react";
import { ChevronDown, FilePen, FileText, Gauge, Globe, Play, RotateCcw, Search, ShieldCheck, Square } from "lucide-react";
import { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { CONCURRENCY, formatCost, formatDuration, formatSeconds, formatTokens, liveLog, ordinal, workerMark, workerName } from "./orchestrator-model.ts";
import type { LaneView, LogRow, RunView, Scenario, SimEvent, ToolKind } from "./orchestrator-model.ts";
import { Button, Chunks, Count, Glyph, LabelSlot, ModelMark, SegmentedControl, Swap, TextShimmer, useMotionOff } from "./parts";
import type { RunController } from "./use-orchestrator-run";
import { PULSE, computeWires } from "./wires.ts";
import type { Rect, Wires } from "./wires.ts";
import type { Translate } from "../i18n/translate";
import { useOrchestratorCopy } from "./OrchestratorI18n";
import { runAnnouncement } from "./orchestrator-copy";

const series = (index: number) => `var(--series-${(index % 4) + 1})`;
const TOOL_ICON: Record<ToolKind | "retry" | "return", ReactNode> = {
  search: <Search strokeWidth={1.75} aria-hidden="true" />, fetch: <Globe strokeWidth={1.75} aria-hidden="true" />, read: <FileText strokeWidth={1.75} aria-hidden="true" />, write: <FilePen strokeWidth={1.75} aria-hidden="true" />,
  retry: <RotateCcw strokeWidth={1.75} aria-hidden="true" />, return: <Glyph kind="done" />,
};

/** Re-renders its caller every 100 ms while `on`, for the clocks that tick in tenths. */
function useTick(on: boolean) {
  const [, set] = useState(0);
  useEffect(() => {
    if (!on) return;
    const id = window.setInterval(() => set(value => value + 1), 100);
    return () => window.clearInterval(id);
  }, [on]);
}
function Elapsed({ clock, from, frozen, on }: { clock: () => number; from: number; frozen?: number | null; on: boolean }) {
  useTick(on && frozen == null);
  return <span className="ob-tabular">{formatSeconds(frozen ?? Math.max(0, clock() - from))}</span>;
}

// --------------------------------------------------------------------------- a lane

const ACTIVE: ReadonlySet<LaneView["phase"]> = new Set(["starting", "working", "error", "approval"]);

function activityOf(lane: LaneView, clock: () => number, t: Translate): { key: string; icon: ReactNode; label: ReactNode; shimmer: boolean; tone?: "danger" } {
  switch (lane.phase) {
    case "waiting": return { key: "waiting", icon: <Glyph kind="clock" />, label: t("Waiting for the plan"), shimmer: false };
    case "planned": return { key: "planned", icon: <Glyph kind="idle" />, label: t("Planned"), shimmer: false };
    case "queued": return { key: `queued${lane.place}`, icon: <Glyph kind="queued" />, label: t("Queued, {0}", [t(ordinal(lane.place))]), shimmer: false };
    case "starting": return { key: "starting", icon: <Glyph kind="spin" />, label: t("Starting"), shimmer: false };
    case "approval": return { key: "approval", icon: <ShieldCheck strokeWidth={1.75} aria-hidden="true" />, label: t("Waiting for approval"), shimmer: false };
    case "error": return { key: "error", icon: <Glyph kind="error" />, label: <>{t("Failed, retrying in")} <RetryIn at={lane.retryAt} clock={clock} /></>, shimmer: false, tone: "danger" };
    case "done": return { key: "done", icon: <Glyph kind={lane.denied ? "stop" : "done"} />, label: lane.denied ? t("Returned without writing") : t("Returned after {0} tool calls", [lane.toolCalls]), shimmer: false };
    case "stopped": return { key: "stopped", icon: <Glyph kind="stop" />, label: t("Stopped"), shimmer: false };
    case "working": {
      const step = lane.step;
      return { key: `w${step?.index}.${step?.attempt}`, icon: step ? TOOL_ICON[step.tool] : <Glyph kind="spin" />, label: step ? (step.target ? `${t(step.label)} · ${step.target}` : t(step.label)) : t("Working"), shimmer: true };
    }
  }
}
function RetryIn({ at, clock }: { at: number | null; clock: () => number }) {
  useTick(at !== null);
  const left = at === null ? 0 : Math.max(0, Math.ceil((at - clock()) / 1000));
  return <span className="ob-tabular">{left}s</span>;
}

/** The one line a lane streams. A line that outgrows the lane glides left so the newest words stay in view; a finished lane rests with an ellipsis. */
function Ticker({ text, settled, animated }: { text: string; settled: boolean; animated: boolean }) {
  const box = useRef<HTMLSpanElement>(null), inner = useRef<HTMLSpanElement>(null);
  const [shift, setShift] = useState(0);
  useEffect(() => {
    if (settled || !animated) return;
    const outer = box.current, content = inner.current;
    if (!outer || !content) return;
    // one read of the layout for the whole line; the timers then only move it
    const width = outer.clientWidth;
    const edges = ([...content.children] as HTMLElement[]).map(chunk => chunk.offsetLeft + chunk.offsetWidth);
    if (!edges.length || edges[edges.length - 1] <= width) return;
    const timers = edges.map((edge, index) => window.setTimeout(() => setShift(Math.max(0, edge - width)), index * 36));
    return () => timers.forEach(timer => window.clearTimeout(timer));
  }, [text, settled, animated]);
  return <span ref={box} className="ob-ticker" data-settled={settled ? "" : undefined} data-shifted={!settled && shift > 0 ? "" : undefined}>
    <span ref={inner} className="ob-ticker__text" style={settled ? undefined : { transform: `translateX(${-shift}px)` }}>{settled || !animated ? text : <Chunks text={text} />}</span>
  </span>;
}

function Transcript({ rows, onRetry }: { rows: LogRow[]; onRetry?: () => void }) {
  const t = useOrchestratorCopy();
  if (!rows.length) return <p className="ob-log__empty">{t("Nothing has run yet.")}</p>;
  return <ol className="ob-log">
    {rows.map(row => <li key={row.id} className="ob-log__row" data-tone={row.tone === "danger" ? "danger" : undefined}>
      <span className="ob-log__icon">{row.tone === "danger" && row.tool !== "write" ? <Glyph kind="error" /> : TOOL_ICON[row.tool]}</span>
      <span className="ob-log__main"><span className="ob-log__title">{t(row.title)}{row.target && <span className="ob-log__target"> {row.target}</span>}</span>{row.detail && <span className="ob-log__detail">{t(row.detail)}</span>}</span>
      <span className="ob-tabular ob-log__time">{row.ms !== undefined ? formatDuration(row.ms) : ""}</span>
    </li>)}
    {onRetry && <li className="ob-retry"><Button size="sm" onClick={onRetry}><RotateCcw size={14} strokeWidth={1.75} aria-hidden="true" />{t("Retry now")}</Button></li>}
  </ol>;
}

interface LaneCardProps { scenario: Scenario; index: number; lane: LaneView; clock: () => number; retryNow: (lane: number) => void; open: boolean; onToggle: (lane: number) => void; id: string }
const LaneCard = memo(function LaneCard({ scenario, index, lane, clock, retryNow, open, onToggle, id }: LaneCardProps) {
  const t = useOrchestratorCopy();
  const off = useMotionOff();
  const activity = activityOf(lane, clock, t);
  const active = ACTIVE.has(lane.phase);
  const started = lane.phase !== "waiting" && lane.phase !== "planned" && lane.phase !== "queued";
  const settled = lane.phase === "done" || lane.phase === "stopped";
  const rows = useMemo(() => liveLog(scenario, index, lane), [scenario, index, lane]);
  const name = workerName(scenario, index);
  const phaseWord = lane.phase === "error" ? "Failed, retrying" : lane.phase === "done" ? "Returned" : lane.phase === "approval" ? "Waiting for approval" : lane.phase.charAt(0).toUpperCase() + lane.phase.slice(1);
  return <div className="ob-lane" data-phase={lane.phase} style={{ "--lane": series(index) } as React.CSSProperties} data-wire="lane">
    <button type="button" className="ob-lane__button" aria-expanded={open} aria-controls={id} aria-label={t("{0}, {1}. {2}. {3} transcript", [t(lane.title ?? "Unassigned"), name, t(phaseWord), t(open ? "Hide" : "Show")])} onClick={() => onToggle(index)}>
      <span className="ob-lane__head">
        <span className="ob-lane__mark" aria-hidden="true"><ModelMark mark={workerMark(scenario, index)} /></span>
        <span className="ob-lane__model">{name}</span>
        <span className="ob-lane__time" data-hidden={started ? undefined : ""}><Elapsed clock={clock} from={lane.dispatchAt ?? 0} frozen={lane.ms} on={active} /></span>
      </span>
      <span className="ob-lane__title" data-muted={lane.title ? undefined : ""}><Swap id={lane.title ?? "none"}><span className="ob-lane__titletext" style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t(lane.title ?? "Unassigned")}</span></Swap></span>
      <Swap id={activity.key}>
        <span className="ob-activity" data-tone={activity.tone}>
          <span className="ob-activity__icon">{activity.icon}</span>
          <span className="ob-activity__label">{activity.shimmer ? <span className="ob-shimmer"><TextShimmer>{activity.label}</TextShimmer></span> : activity.label}</span>
        </span>
      </Swap>
      <Swap id={`${lane.lineKey}:${lane.lineTone}`}>
        <span className="ob-output" data-tone={lane.lineTone === "normal" ? undefined : lane.lineTone}>
          {lane.lineTone === "danger" ? <span className="ob-clip">{t(lane.line)}</span> : lane.line ? <Ticker text={t(lane.line)} settled={settled} animated={!settled} /> : null}
        </span>
      </Swap>
      <span className="ob-lane__foot">
        <span className="ob-lane__metrics" data-hidden={started ? undefined : ""}>
          <span><Count value={lane.tokens} format={formatTokens} className="ob-tabular" /> tokens</span><span className="ob-dot" aria-hidden="true" />
          <Count value={laneCostOf(scenario, index, lane.tokens)} format={value => formatCost(value)} className="ob-tabular" />
        </span>
        <ChevronDown className="ob-chevron" data-open={open ? "" : undefined} size={14} strokeWidth={1.75} aria-hidden="true" />
      </span>
    </button>
    <motion.div id={id} className="ob-collapse" initial={false} animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }} inert={!open}
      transition={off ? { duration: 0 } : { height: { type: "spring", stiffness: 380, damping: 39 }, opacity: { duration: open ? 0.16 : 0.1, ease: open ? [0.16, 1, 0.3, 1] : [0.22, 1, 0.36, 1] } }}>
      <div className="ob-transcript"><Transcript rows={rows} onRetry={lane.phase === "error" ? () => retryNow(index) : undefined} /></div>
    </motion.div>
  </div>;
});
function laneCostOf(scenario: Scenario, index: number, tokens: number) { const worker = scenario.workers.find(item => item.id === scenario.lanes[index].workerId) ?? scenario.workers[index]; return (tokens * worker.price) / 1e6; }

// --------------------------------------------------------------------------- wires

interface Geometry { wires: Wires; width: number; height: number }
function useWires(flow: React.RefObject<HTMLDivElement | null>, deps: readonly unknown[]): Geometry | null {
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  const frame = useRef(0);
  const measure = useCallback(() => {
    const element = flow.current;
    if (!element) return;
    const base = element.getBoundingClientRect();
    const rect = (target: Element | null): Rect | null => { if (!target) return null; const r = target.getBoundingClientRect(); return { left: r.left - base.left, top: r.top - base.top, width: r.width, height: r.height }; };
    const leadMark = rect(element.querySelector('[data-wire="lead-mark"]')), lead = rect(element.querySelector('[data-wire="lead"]')), summary = rect(element.querySelector('[data-wire="summary"]')), summaryMark = rect(element.querySelector('[data-wire="summary-mark"]'));
    const lanes = [...element.querySelectorAll('[data-wire="lane"]')].map(rect).filter((item): item is Rect => item !== null);
    if (!leadMark || !lead || !summary || !summaryMark) return;
    const wires = computeWires({ leadMark, lead, lanes, summary, summaryMark });
    if (!wires) return;
    setGeometry(previous => (previous && previous.width === base.width && previous.height === base.height && previous.wires.trunk === wires.trunk && previous.wires.branches.every((branch, index) => branch.d === wires.branches[index]?.d) ? previous : { wires, width: base.width, height: base.height }));
  }, [flow]);
  const schedule = useCallback(() => { window.cancelAnimationFrame(frame.current); frame.current = window.requestAnimationFrame(measure); }, [measure]);
  useLayoutEffect(() => {
    const element = flow.current;
    if (!element) return;
    measure();
    const observer = new ResizeObserver(schedule);
    observer.observe(element);
    element.querySelectorAll('[data-wire]').forEach(part => observer.observe(part));
    return () => { observer.disconnect(); window.cancelAnimationFrame(frame.current); };
  // the parts change size as the plan grows and transcripts open: they are observed above; deps re-attach the observers when lanes mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow, measure, schedule, ...deps]);
  return geometry;
}

/** A packet running a route: one dash, animated with the Web Animations API on stroke-dashoffset, removed when it lands. */
function Pulse({ d, color, onDone }: { d: string; color: string; onDone: () => void }) {
  const path = useRef<SVGPathElement>(null);
  useEffect(() => {
    const element = path.current;
    if (!element) return;
    const length = element.getTotalLength();
    // one dash of 18px and a gap that is the whole route and a little more, so exactly one packet travels it
    element.style.strokeDasharray = `${PULSE.dash}, ${length + PULSE.dash}`;
    const animation = element.animate([{ strokeDashoffset: PULSE.dash }, { strokeDashoffset: -length }], { duration: PULSE.duration, easing: PULSE.easing, fill: "forwards" });
    animation.onfinish = onDone;
    return () => animation.cancel();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- one animation per pulse
  }, []);
  return <path ref={path} className="ob-pulse" d={d} stroke={color} strokeDasharray={`${PULSE.dash}, 100000`} strokeDashoffset={PULSE.dash} />;
}

// --------------------------------------------------------------------------- the block

export function leadStatus(view: RunView, scenario: Scenario, t: Translate): { key: string; glyph: ReactNode; text: string } {
  const working = view.lanes.filter(lane => lane.phase === "starting" || lane.phase === "working" || lane.phase === "error" || lane.phase === "approval").length;
  switch (view.status) {
    case "idle": return { key: "idle", glyph: <Glyph kind="idle" />, text: "Ready" };
    case "planning": return { key: "planning", glyph: <Glyph kind="spin" />, text: "Planning" };
    case "running": return { key: working ? `w${working}` : "dispatch", glyph: <Glyph kind="spin" />, text: working ? t("{0} working", [working]) : "Dispatching" };
    case "merging": return view.summaryChunks > 0 ? { key: "writing", glyph: <Glyph kind="spin" />, text: "Writing summary" } : { key: "merging", glyph: <Glyph kind="spin" />, text: "Merging results" };
    case "done": return { key: "done", glyph: <Glyph kind="done" />, text: "Done" };
    case "stopped": return { key: "stopped", glyph: <Glyph kind="stop" />, text: "Stopped" };
  }
  void scenario;
}

function summaryText(scenario: Scenario, t: Translate) { return `${scenario.summary.chunks.map(chunk => t(chunk)).join("")}\n${scenario.summary.bullets.map(bullet => `- ${t(bullet)}`).join("\n")}`; }

export function OrchestratorBlock({ run, onLaneOpen }: { run: RunController; onLaneOpen?: (lane: number) => void }) {
  const t = useOrchestratorCopy();
  const { scenario, view } = run;
  const off = useMotionOff();
  const root = useRef<HTMLDivElement>(null), flow = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const baseId = useId().replace(/[^\w-]/g, "");
  const lanes = scenario.lanes.length;
  const total = lanes;

  // the first run starts when the block scrolls into view (never by itself with reduced motion)
  const started = useRef(false);
  useEffect(() => {
    const element = root.current;
    if (!element || off || started.current) return;
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting) && !started.current) { started.current = true; run.start(); observer.disconnect(); } }, { threshold: 0.35 });
    observer.observe(element);
    return () => observer.disconnect();
  }, [off, run]);

  const toggleLane = useCallback((index: number) => { setOpen(current => ({ ...current, [index]: !current[index] })); onLaneOpen?.(index); }, [onLaneOpen]);
  const geometry = useWires(flow, [lanes, view.plan > 0, open]);
  const geometryRef = useRef<Geometry | null>(null);
  useEffect(() => { geometryRef.current = geometry; }, [geometry]);

  // packets: one per dispatch and one per return, on the route measured when the event arrives
  const [pulses, setPulses] = useState<{ id: number; d: string; color: string }[]>([]);
  const seen = useRef(0), counter = useRef(0);
  useEffect(() => {
    if (run.events.length < seen.current) seen.current = 0;
    const fresh: SimEvent[] = run.events.slice(seen.current);
    seen.current = run.events.length;
    const wires = geometryRef.current?.wires;
    if (off || !wires || !fresh.length) return;
    const added = fresh.flatMap(event => (event.type === "dispatch" ? [{ d: wires.dispatch[event.lane], lane: event.lane }] : event.type === "return" ? [{ d: wires.back[event.lane], lane: event.lane }] : []));
    if (added.length) setPulses(current => [...current, ...added.filter(item => item.d).map(item => ({ id: (counter.current += 1), d: item.d, color: series(item.lane) }))]);
  }, [run.events, off]);

  const status = leadStatus(view, scenario, t);
  const working = view.status === "planning" || view.status === "running" || view.status === "merging";
  const summaryStatus = view.status === "done" ? { key: "done", glyph: <Glyph kind="done" />, text: t("Merged {0} results", [total]) }
    : view.status === "merging" ? { key: "merging", glyph: <Glyph kind="spin" />, text: t("Merging {0} results", [total]) }
    : view.status === "stopped" ? { key: "stopped", glyph: <Glyph kind="stop" />, text: t("{0} of {1} returned", [view.returned, total]) }
    : view.status === "running" ? { key: `r${view.returned}`, glyph: <Glyph kind={view.returned ? "arc" : "idle"} progress={view.returned / total} />, text: t("{0} of {1} returned", [view.returned, total]) }
    : { key: "waits", glyph: <Glyph kind="idle" />, text: t("Waits for {0} results", [total]) };
  const showSummary = view.status === "merging" || view.status === "done";
  const [copied, setCopied] = useState<"idle" | "copied" | "error">("idle");
  const copySummary = async () => {
    const totals = view.totals;
    const text = `${t(scenario.goal)}\n\n${summaryText(scenario, t)}${totals ? `\n\n${t("Tokens {0}, cost {1}, wall time {2}, {3} in sequence.", [formatTokens(totals.tokens), formatCost(totals.cost, 2), formatSeconds(totals.wall), formatSeconds(totals.sequential)])}` : ""}`;
    try { await navigator.clipboard.writeText(text); setCopied("copied"); } catch { setCopied("error"); }
    window.setTimeout(() => setCopied("idle"), 1800);
  };
  // the totals row opens 75 ms after the run ends (a timer, so the state is set from a callback)
  const [totalsFor, setTotalsFor] = useState(-1);
  useEffect(() => {
    if (view.status !== "done") return;
    const timer = window.setTimeout(() => setTotalsFor(run.runs), off ? 0 : 75);
    return () => window.clearTimeout(timer);
  }, [view.status, run.runs, off]);
  const totalsOn = view.status === "done" && totalsFor === run.runs;

  const runLabel = working ? { key: "stop", icon: <Square size={14} strokeWidth={1.75} aria-hidden="true" />, text: "Stop" } : view.status === "idle" ? { key: "run", icon: <Play size={14} strokeWidth={1.75} aria-hidden="true" />, text: "Run" } : { key: "again", icon: <RotateCcw size={14} strokeWidth={1.75} aria-hidden="true" />, text: "Run again" };
  const onRun = () => { started.current = true; if (working) run.stop(); else run.start(); };

  return <div ref={root} className="ob" data-lanes={lanes} style={{ "--count": lanes } as React.CSSProperties}>
    <header className="ob-header">
      <h3 className="ob-goal">{t(scenario.goal)}</h3>
      <div className="ob-toolbar">
        <div className="ob-limit">
          <span className="ob-limit__label" aria-hidden="true">{t("Concurrency")}</span>
          <SegmentedControl label="Concurrency limit" value={run.concurrency} onChange={run.setConcurrency} options={Array.from({ length: CONCURRENCY.max - CONCURRENCY.min + 1 }, (_, index) => ({ value: CONCURRENCY.min + index, label: String(CONCURRENCY.min + index) }))} />
        </div>
        <Button onClick={onRun}><LabelSlot id={runLabel.key}>{runLabel.icon}{t(runLabel.text)}</LabelSlot></Button>
      </div>
    </header>
    <div ref={flow} className="ob-flow">
      {geometry && <svg className="ob-wires" width={geometry.width} height={geometry.height} viewBox={`0 0 ${geometry.width} ${geometry.height}`} aria-hidden="true">
        <path className="ob-trunk" d={geometry.wires.trunk} />
        {geometry.wires.branches.map((branch, index) => {
          const lane = view.lanes[branch.lane];
          const on = branch.side === "in" ? lane.phase === "working" || lane.phase === "error" || lane.phase === "approval" || lane.phase === "done" || lane.phase === "stopped" && lane.dispatchAt !== null : lane.phase === "done";
          return <path key={index} className="ob-branch" d={branch.d} data-on={on ? "" : undefined} style={{ "--wire": series(branch.lane) } as React.CSSProperties} />;
        })}
        {geometry.wires.ports.map((port, index) => {
          const lane = view.lanes[port.lane];
          const on = port.side === "in" ? lane.phase === "working" || lane.phase === "error" || lane.phase === "approval" || lane.phase === "done" : lane.phase === "done";
          return <circle key={index} className="ob-port" cx={port.cx} cy={port.cy} r={3.5} data-on={on ? "" : undefined} style={{ "--wire": series(port.lane) } as React.CSSProperties} />;
        })}
        {pulses.map(pulse => <Pulse key={pulse.id} d={pulse.d} color={pulse.color} onDone={() => setPulses(current => current.filter(item => item.id !== pulse.id))} />)}
      </svg>}

      <section className="ob-node" aria-label={t("Lead agent")} data-wire="lead">
        <div className="ob-node__row">
          <span className="ob-node__mark" aria-hidden="true" data-wire="lead-mark"><ModelMark mark={scenario.lead.mark} /></span>
          <span className="ob-node__name">{scenario.lead.name}<span className="ob-node__role">{t("Lead")}</span></span>
          <span className="ob-node__status">
            <Swap id={status.key}><span className="ob-status"><span className="ob-activity__icon">{status.glyph}</span><span>{t(status.text)}</span></span></Swap>
            <span className="ob-node__time"><Elapsed clock={run.clock} from={0} frozen={view.status === "done" ? view.totals?.wall : view.status === "stopped" ? view.endedAt : view.status === "idle" ? 0 : null} on={working} /></span>
          </span>
        </div>
        <div className="ob-node__body">
          {view.plan > 0 && <ol className="ob-plan" aria-label={t("Plan")}>
            {scenario.lanes.slice(0, view.plan).map((lane, index) => <motion.li key={lane.id} className="ob-plan__item" initial={off ? false : { height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
              transition={off ? { duration: 0 } : { height: { type: "spring", stiffness: 380, damping: 39 }, opacity: { duration: 0.16, ease: [0.16, 1, 0.3, 1] } }}>
              <span className="ob-plan__inner"><span className="ob-plan__dot" aria-hidden="true" style={{ "--lane": series(index) } as React.CSSProperties} /><span className="ob-plan__text"><Chunks text={t(lane.instruction)} animated={view.status !== "idle"} /></span></span>
            </motion.li>)}
          </ol>}
        </div>
      </section>

      <div className="ob-lanes">
        {scenario.lanes.map((lane, index) => <LaneCard key={lane.id} scenario={scenario} index={index} lane={view.lanes[index]} clock={run.clock} retryNow={run.retryNow} id={`${baseId}-${index}`} open={!!open[index]} onToggle={toggleLane} />)}
      </div>

      <section className="ob-node" aria-label={t("Summary")} data-wire="summary">
        <div className="ob-node__row">
          <span className="ob-node__mark" aria-hidden="true" data-wire="summary-mark"><ModelMark mark={scenario.lead.mark} /></span>
          <span className="ob-node__name">{t("Summary")}</span>
          <span className="ob-node__status"><Swap id={summaryStatus.key}><span className="ob-status"><span className="ob-activity__icon">{summaryStatus.glyph}</span><span>{summaryStatus.text}</span></span></Swap></span>
        </div>
        <div className="ob-node__body">
          <Swap id={showSummary ? "text" : "hint"}>
            {showSummary
              ? <div className="ob-summary" role="region" aria-label={t("Summary text")}>
                  <p>{scenario.summary.chunks.map((chunk, index) => (view.summaryChunks > index || view.status === "done" ? <span key={index} className={view.status === "done" ? undefined : "op-chunk"}>{t(chunk)}</span> : null))}</p>
                  <ul>{scenario.summary.bullets.map((bullet, index) => (view.summaryChunks > scenario.summary.chunks.length + index || view.status === "done" ? <li key={index}>{view.status === "done" ? t(bullet) : <Chunks text={t(bullet)} />}</li> : null))}</ul>
                </div>
              : <p className="ob-hint">{t("The lead merges what the subagents return here.")}</p>}
          </Swap>
          <motion.div className="ob-totals-wrap" initial={false} animate={{ height: totalsOn && view.totals ? "auto" : 0, opacity: totalsOn && view.totals ? 1 : 0 }} inert={!(totalsOn && view.totals)}
            transition={off ? { duration: 0 } : { height: { type: "spring", stiffness: 380, damping: 39 }, opacity: { duration: 0.16, ease: [0.16, 1, 0.3, 1] } }}>
            {view.totals && <div className="ob-totals">
              <dl className="ob-stats">
                <div><dt>{t("Tokens")}</dt><dd className="ob-tabular">{formatTokens(view.totals.tokens)}</dd></div>
                <div><dt>{t("Cost")}</dt><dd className="ob-tabular">{formatCost(view.totals.cost, 2)}</dd></div>
                <div><dt>{t("Wall time")}</dt><dd className="ob-tabular">{formatSeconds(view.totals.wall)}</dd></div>
                <div><dt>{t("In sequence")}</dt><dd className="ob-tabular">{formatSeconds(view.totals.sequential)}</dd></div>
              </dl>
              <div className="ob-speed-row">
                <span className="ob-speed"><Gauge size={14} strokeWidth={1.75} aria-hidden="true" />{t("{0}x faster than running in sequence", [view.totals.speedup.toFixed(1)])}</span>
                <Button size="sm" onClick={copySummary}><span className="op-icon" aria-hidden="true"><span data-state={copied}>{copied === "copied" ? <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg> : <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></svg>}</span></span>{t(copied === "copied" ? "Copied" : copied === "error" ? "Failed" : "Copy summary")}</Button>
              </div>
            </div>}
          </motion.div>
        </div>
      </section>
    </div>
    <p className="ob-sr" role="status" aria-live="polite">{runAnnouncement(view, t)}</p>
  </div>;
}
