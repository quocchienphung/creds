"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, Check, ChevronDown, Circle, CircleCheck, GitBranch, Hand, ListChecks, LoaderCircle, MapPin, Play, RotateCcw, Square, Terminal, TriangleAlert, Waypoints } from "lucide-react";
import type { ReactNode } from "react";
import { AgentBar } from "../affectui-agent-tree/agent-bar";
import type { ResolveAction } from "../affectui-agent-tree/agent-bar";
import type { TreeAgent } from "../affectui-agent-tree/tree-model";
import { Mark } from "../affectui-agent-tree/tree-marks";
import { modelLabel } from "./catalog";
import { costFormatter, flattenNodes, markOf } from "./process-model";
import type { ProcessDoc } from "./process-model";
import type { EngineInfo } from "./engine";
import type { RunAction, RunSnapshot } from "./run-model";
import { monitorElapsed, monitorSteps, monitorTime } from "./run-monitor-model";
import type { MonitorStep } from "./run-monitor-model";
import "./process-run-monitor.css";

const spring = { type: "spring", stiffness: 300, damping: 37, mass: 1 } as const;
const labels = { running: "Working", waiting: "Waiting for you", done: "Done", failed: "Needs attention", stopped: "Stopped" } as const;
const verbs = { running: "Running", waiting: "Review", done: "Completed", failed: "Failed", stopped: "Stopped", queued: "Queued", idle: "Ready" } as const;

interface MonitorProps {
  doc: ProcessDoc;
  snapshot: RunSnapshot | null;
  simulated: boolean;
  engines: readonly EngineInfo[];
  starting: boolean;
  onStart: () => Promise<boolean>;
  onAction: (action: RunAction) => Promise<boolean>;
  onLocate: (id: string) => void;
  onReview: (id: string) => void;
  onTrace: () => void;
}
/** The top-right bar of the Process page with the activity card inside it: the bar is the card's header, and its toggle unfolds the detail below. */
interface BarProps extends MonitorProps {
  tree: TreeAgent;
  title: string;
  noun: readonly [string, string];
  formatCost: (amount: number) => string;
  showCost: boolean;
  onResolve: (agent: TreeAgent, action: ResolveAction) => void;
  onReviewWaiting: () => void;
  extra: ReactNode;
}

function Glyph({ status }: { status: string }) {
  if (status === "running") return <LoaderCircle className="prun-spin" size={14} />;
  if (status === "waiting") return <Hand size={14} />;
  if (status === "done") return <Check className="prun-check" size={14} />;
  if (status === "failed") return <TriangleAlert size={14} />;
  if (status === "stopped") return <Square size={12} />;
  return <Circle size={12} />;
}

function StepVerb({ status, motionOff }: { status: keyof typeof verbs; motionOff: boolean }) {
  const { t: uiText } = useWorkspaceI18n();
  const measure = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState<number>();
  const label = verbs[status];
  useLayoutEffect(() => { if (measure.current) setWidth(measure.current.getBoundingClientRect().width); }, [label]);
  return <motion.span className="prun-verb" initial={false} animate={{ width }} transition={motionOff ? { duration: 0 } : spring}>
    <span ref={measure} className="prun-verb-measure" aria-hidden="true">{uiText(label)}</span>
    <AnimatePresence initial={false}><motion.span className={`prun-verb-word${status === 'running' ? ' prun-shimmer' : ''}`} key={status} initial={motionOff ? false : { opacity: 0, y: 2 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: motionOff ? 0 : .1 } }} transition={{ duration: motionOff ? 0 : .16 }}>{uiText(label)}</motion.span></AnimatePresence>
  </motion.span>;
}

function StreamedSummary({ text, motionOff }: { text: string; motionOff: boolean }) {
  const { t: uiText } = useWorkspaceI18n();
  const words = text.split(' ');
  const chunks = Array.from({ length: Math.ceil(words.length / 3) }, (_, index) => words.slice(index * 3, index * 3 + 3).join(' '));
  return <p className="prun-summary" aria-label={uiText(text)}>{chunks.map((chunk, index) => <span key={`${text}:${index}`} aria-hidden="true" style={{ animationDelay: `${motionOff ? 0 : index * 34}ms` }}>{uiText(chunk)}{uiText(index < chunks.length - 1 ? ' ' : '')}</span>)}</p>;
}

function Step({ step, now, simulated, engines, unit, onLocate, onReview, onAction, motionOff }: {
  step: MonitorStep; now: number; simulated: boolean; engines: readonly EngineInfo[]; unit: ProcessDoc['unit'];
  onLocate: (id: string) => void; onReview: (id: string) => void; onAction: (action: RunAction) => Promise<boolean>; motionOff: boolean;
}) {
  const { t: uiText } = useWorkspaceI18n();
  const [expanded, setExpanded] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const head = useRef<HTMLButtonElement>(null);
  const id = useId();
  const { node, run } = step;
  const mark = markOf(node.ai.provider);
  const waiting = run.status === "waiting" && step.current;
  const open = expanded ?? waiting;
  const elapsed = Math.max(0, (run.ended ?? now) - (run.started ?? now));
  async function decide(type: "approve" | "reject" | "retry") {
    if (pending.current) return;
    pending.current = true; setBusy(true);
    const surface = head.current?.closest('.prun');
    try { await onAction({ type, id: node.id }); } finally {
      pending.current = false; setBusy(false);
      requestAnimationFrame(() => {
        const target = surface?.querySelector<HTMLButtonElement>('.prun-fold[aria-expanded=false]') ?? (head.current?.isConnected ? head.current : undefined);
        target?.focus({ preventScroll: true });
      });
    }
  }
  return <motion.li className="prun-step" data-state={run.status} data-block-id={node.id} initial={motionOff ? false : { height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} transition={motionOff ? { duration: 0 } : spring}>
    <button ref={head} type="button" className="prun-step-head" aria-expanded={open} aria-controls={id} onClick={() => setExpanded(!open)}>
      <span className="prun-step-icon">{mark ? <Mark id={mark} /> : <GitBranch size={16} />}</span>
      <span className="prun-step-label"><StepVerb status={run.status} motionOff={motionOff} /><span title={node.name}>{node.name}</span></span>
      {step.round > 1 && <span className="prun-round">{uiText("Round ")}{uiText(step.round)}</span>}
      <span className="prun-time">{uiText(waiting ? '' : uiText("{0}s", [(elapsed / 1000).toFixed(1)]))}</span>
      <span className="prun-step-state" aria-label={uiText(run.status)}><Glyph status={run.status} /></span>
      <ChevronDown size={16} className="prun-chevron" />
    </button>
    <AnimatePresence initial={false}>{open && <motion.div id={id} className="prun-detail-wrap" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={motionOff ? { duration: 0 } : spring}>
      <div className="prun-detail">
        <div className="prun-route">{step.from.length ? step.from.map(from => <span key={from.id}><button type="button" onClick={() => onLocate(from.id)}>{uiText(from.name)}</button><ArrowRight size={12} /></span>) : <span>{uiText("Start")}<ArrowRight size={12} /></span>}<button type="button" onClick={() => onLocate(node.id)}>{node.name}</button>{step.round > 1 && <span>{uiText("· Round ")}{uiText(step.round)}</span>}</div>
        <p>{uiText(node.task)}</p>
        <dl className="prun-config"><div><dt>{uiText("Model")}</dt><dd>{uiText(modelLabel(node.ai.provider, node.ai.model, engines))}</dd></div>{node.tools.length > 0 && <div><dt>{uiText("Configured tools")}</dt><dd>{uiText(node.tools.join(", "))}</dd></div>}{unit !== 'none' && <div><dt>{uiText("Cost limit")}</dt><dd>{uiText(node.limit === undefined ? uiText('No limit') : costFormatter(unit)(node.limit))}</dd></div>}{node.children.length > 0 && <div><dt>{uiText("Sub-tasks")}</dt><dd>{node.children.length} · {uiText(node.mode === 'parallel' ? uiText('In parallel') : uiText('In sequence'))}</dd></div>}</dl>
        {node.ai.instructions && <details className="prun-instructions"><summary>{uiText("Instructions")}</summary><p>{node.ai.instructions}</p></details>}
        {run.attempts?.map((attempt, index) => <div className="prun-attempt" key={attempt.started}><TriangleAlert size={13} />{uiText("Attempt ")}{uiText(index + 1)} · {uiText(((attempt.ended - attempt.started) / 1000).toFixed(1))}s<p>{uiText(attempt.error)}</p></div>)}
        {run.calls?.map(call => <details className="prun-call" key={call.id}><summary><Terminal size={14} /><span>{uiText(call.name)}{uiText(call.detail ? uiText(" · {0}", [call.detail]) : "")}</span><Glyph status={call.status} /></summary><div>{call.input !== undefined && <><span>{uiText("Input")}</span><pre>{call.input}</pre></>}{call.output !== undefined && <><span>{uiText("Output")}</span><pre>{call.output}</pre></>}{call.error && <p className="prun-error">{uiText(call.error)}</p>}{call.input === undefined && call.output === undefined && !call.error && <p>{uiText("The engine has not supplied input or output for this call.")}</p>}</div></details>)}
        {!run.calls?.length && <p className="prun-note">{uiText(simulated ? uiText("Simulated block activity. No model or tool is called.") : uiText("The engine has not reported individual calls for this block."))}</p>}
        {run.error && <p className="prun-error">{uiText(run.error)}</p>}
        {waiting && <div className="prun-review"><p>{"ask" in run && run.ask ? run.ask : node.askText || uiText("Approve {0} before it starts.", [node.name])}</p><div><span>{uiText("Nothing starts until you approve.")}</span><div className="prun-review-buttons"><button type="button" className="prun-button" disabled={busy} onClick={() => void decide('reject')}>{uiText("Reject")}</button><button type="button" className="prun-button prun-button--primary" disabled={busy} onClick={() => void decide('approve')}>{busy ? <LoaderCircle size={14} className="prun-spin" /> : null}{uiText("Approve")}</button></div></div></div>}
        <div className="prun-detail-actions"><button type="button" onClick={() => onLocate(node.id)}><MapPin size={13} />{uiText("Show block on map")}</button>{waiting && <button type="button" onClick={() => onReview(node.id)}><ListChecks size={13} />{uiText("Full permission details")}</button>}{run.status === "failed" && step.current && <button type="button" disabled={busy} onClick={() => void decide('retry')}><RotateCcw size={13} />{uiText("Retry block")}</button>}</div>
      </div>
    </motion.div>}</AnimatePresence>
  </motion.li>;
}

export function ProcessRunBar(props: BarProps) {
  const { t: uiText } = useWorkspaceI18n();
  const { doc, snapshot, simulated, engines } = props;
  const [open, setOpen] = useState(false);
  const [showFinished, setShowFinished] = useState(false);
  const [knownRun, setKnownRun] = useState(snapshot?.id);
  if (knownRun !== snapshot?.id) { setKnownRun(snapshot?.id); setShowFinished(false); }
  const [busy, setBusy] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const flight = useRef(false);
  const id = useId();
  const reduced = useReducedMotion();
  const [interfaceMotionOff, setInterfaceMotionOff] = useState(false);
  useEffect(() => {
    const host = container.current?.closest('[data-ui-motion]');
    if (!host) return;
    const update = () => setInterfaceMotionOff(host.getAttribute('data-ui-motion') === 'off');
    update(); const observer = new MutationObserver(update); observer.observe(host, { attributes: true, attributeFilter: ['data-ui-motion'] });
    return () => observer.disconnect();
  }, []);
  const motionOff = !!reduced || interfaceMotionOff;
  const steps = monitorSteps(doc, snapshot);
  const active = snapshot?.state === "running" || snapshot?.state === "waiting";
  const terminal = !!snapshot && !active;
  const [wasTerminal, setWasTerminal] = useState(terminal);
  if (wasTerminal !== terminal) { setWasTerminal(terminal); if (terminal) setShowFinished(false); }
  const listVisible = !terminal || showFinished;
  const elapsed = monitorElapsed(snapshot);
  // The process engine may finish its coordinator even when a child failed. Keep that failure visible.
  const state = snapshot?.state === 'done' && Object.values(snapshot.nodes).some(run => run.status === 'failed') ? 'failed' : snapshot?.state ?? "idle";
  const live = steps.filter(step => step.current && (step.run.status === "running" || step.run.status === "waiting"));
  const nodes = flattenNodes(doc.root);
  const completed = nodes.filter(node => snapshot?.nodes[node.id]?.status === "done").length;
  const mark = markOf(doc.root.ai.provider);
  const signature = steps.map(step => `${step.id}:${step.run.status}:${step.run.calls?.length ?? 0}`).join("|");

  // The bar grows into the card: the surface animates its dimensions, the card keeps its final width so its text never re-wraps on the way.
  const previous = useRef<{ width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const surface = container.current, inner = content.current;
    if (!surface || !inner) return;
    let animation: Animation | undefined;
    const settle = () => { surface.removeAttribute('data-morphing'); inner.style.removeProperty('width'); };
    const measure = () => {
      const before = animation ? surface.getBoundingClientRect() : previous.current;
      animation?.cancel(); settle();
      const target = surface.getBoundingClientRect();
      previous.current = { width: target.width, height: target.height };
      if (!before || motionOff || (Math.abs(before.width - target.width) < 1 && Math.abs(before.height - target.height) < 1)) return;
      inner.style.width = `${target.width - 2}px`; surface.setAttribute('data-morphing', '');
      animation = surface.animate([{ width: `${before.width}px`, height: `${before.height}px`, borderRadius: open ? '12px' : '18px' }, { width: `${target.width}px`, height: `${target.height}px`, borderRadius: open ? '18px' : '12px' }], { duration: 500, easing: 'cubic-bezier(.22,1,.36,1)' });
      const current = animation;
      void current.finished.then(() => { if (animation === current) { animation = undefined; settle(); } }, () => {});
    };
    measure(); window.addEventListener('resize', measure);
    return () => { if (animation) { const rect = surface.getBoundingClientRect(); previous.current = { width: rect.width, height: rect.height }; animation.cancel(); } settle(); window.removeEventListener('resize', measure); };
  }, [open, signature, listVisible, motionOff]);

  function collapse() { setOpen(false); requestAnimationFrame(() => trigger.current?.focus({ preventScroll: true })); }
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || !container.current?.contains(event.target as Node)) return;
      event.preventDefault(); event.stopPropagation(); collapse();
    };
    const outside = (event: PointerEvent) => { if (container.current && !event.composedPath().includes(container.current)) setOpen(false); };
    document.addEventListener('keydown', escape); document.addEventListener('pointerdown', outside);
    return () => { document.removeEventListener('keydown', escape); document.removeEventListener('pointerdown', outside); };
  }, [open]);
  async function action(run: () => Promise<boolean>) {
    if (flight.current) return;
    flight.current = true; setBusy(true);
    try { await run(); } finally { flight.current = false; setBusy(false); }
  }
  const locate = (nodeId: string) => { props.onLocate(nodeId); collapse(); };
  const review = (nodeId: string) => { props.onReview(nodeId); setOpen(false); };
  const toggle = <button ref={trigger} type="button" className="prun-toggle" aria-expanded={open} aria-controls={id} aria-label={uiText(open ? uiText('Hide process activity') : uiText("Show process activity{0}", [state !== 'idle' ? `: ${labels[state]}` : '']))} title={uiText("Process activity")} onClick={() => setOpen(value => !value)}>
    <Waypoints size={14} /><span className="prun-toggle-text">{uiText("Activity")}</span>{state !== "idle" && <span className="prun-toggle-state" aria-hidden="true"><Glyph status={state} /></span>}<ChevronDown size={14} className="prun-toggle-chevron" />
  </button>;
  return <div ref={container} className="proc-pill proc-pill--bar agt prun" data-open={open} data-state={state} data-motion-off={motionOff || undefined} data-interaction-own>
    <div className="prun-barrow">
      <AgentBar root={props.tree} title={uiText(props.title)} noun={props.noun} formatCost={props.formatCost} showCost={props.showCost} onResolve={props.onResolve} onReviewWaiting={props.onReviewWaiting} extra={props.extra} trailing={toggle} />
    </div>
    <div ref={content} className="prun-body">
      {open && <section id={id} className="prun-card" aria-label={uiText("{0} activity", [doc.name])}>
        <header className="prun-header">
          <div className="prun-meta"><span className="prun-model">{mark && <Mark id={mark} />}<span title={uiText(modelLabel(doc.root.ai.provider, doc.root.ai.model, engines))}>{uiText(modelLabel(doc.root.ai.provider, doc.root.ai.model, engines))}</span></span><span className={`prun-status${state === 'running' ? ' prun-shimmer' : ''}`}><Glyph status={state} />{uiText(state !== 'idle' ? labels[state] : uiText('Ready'))}</span><span className="prun-timer" title={uiText("Elapsed time, including approval waits")}>{uiText(monitorTime(elapsed))}</span></div>
        </header>
        <div className="prun-scroll">
          <div className="prun-context"><span className="prun-engine">{uiText(simulated ? uiText('Simulated') : uiText('Connected engine'))}</span><span>{uiText(snapshot ? uiText("{0} of {1} blocks complete", [completed, nodes.length]) : uiText("{0} blocks ready", [nodes.length]))}</span></div>
          {active && live.length > 0 && <div className="prun-live-routes" aria-label={uiText("Current block connections")}>{live.map(step => <button key={step.id} type="button" onClick={() => locate(step.node.id)} title={uiText("Show {0} on map", [step.node.name])}>{step.from.length ? <span>{step.from.map(node => node.name).join(' + ')}</span> : <span>{uiText("Start")}</span>}<ArrowRight size={12} /><strong>{step.node.name}</strong><Glyph status={step.run.status} /></button>)}</div>}
          {terminal && <button type="button" className="prun-fold" aria-expanded={showFinished} aria-controls={`${id}-steps`} onClick={() => setShowFinished(value => !value)}><ListChecks size={16} /><span>{uiText(steps.length)} {uiText(" steps · ")}{uiText(Math.round(elapsed / 1000))}s</span><ChevronDown size={16} /></button>}
          <AnimatePresence initial={false}>{listVisible && <motion.div key={snapshot?.id ?? 'idle'} id={`${id}-steps`} className="prun-steps-wrap" initial={motionOff ? false : { height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={motionOff ? { duration: 0 } : spring}><ol aria-label={uiText("Steps")} className="prun-steps">{steps.map(step => <Step key={step.id} step={step} now={snapshot?.at ?? 0} simulated={simulated} engines={engines} unit={doc.unit} onLocate={locate} onReview={review} onAction={props.onAction} motionOff={motionOff} />)}</ol></motion.div>}</AnimatePresence>
          {!snapshot && <div className="prun-empty"><GitBranch size={24} /><p>{uiText(doc.goal || doc.root.task)}</p><p className="prun-note">{uiText("Follow every block, its connections and the calls reported by your engine.")}</p><button type="button" className="prun-button prun-button--primary" disabled={props.starting || busy} onClick={() => void action(props.onStart)}><Play size={14} />{uiText(props.starting ? uiText('Starting…') : uiText('Start run'))}</button></div>}
          {terminal && <motion.div className="prun-result" initial={motionOff ? false : { height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} transition={motionOff ? { duration: 0 } : spring}><StreamedSummary text={state === 'done' ? `Completed ${completed} blocks in ${monitorTime(elapsed)}.` : state === 'failed' ? 'The run needs attention. Open the steps to inspect failures and retry a block.' : `Run stopped. ${completed} of ${nodes.length} blocks completed.`} motionOff={motionOff} /><div className="prun-result-blocks">{nodes.filter(node => snapshot.nodes[node.id]?.status !== 'queued').map(node => <button type="button" key={node.id} onClick={() => locate(node.id)}><GitBranch size={14} /><span>{node.name}</span><Glyph status={snapshot.nodes[node.id]?.status ?? 'idle'} /></button>)}</div><div className="prun-result-actions"><span><CircleCheck size={14} />{uiText(completed)} {uiText(" completed")}</span><button type="button" className="prun-button prun-button--primary" onClick={() => { props.onTrace(); setOpen(false); }}><Waypoints size={14} />{uiText("View trace")}</button></div></motion.div>}
        </div>
        <footer className="prun-footer">{uiText(simulated ? uiText('Simulation · no model or external tool is called.') : uiText('Activity reported by your connected engine.'))}</footer>
      </section>}
    </div>
    <span className="proc-sr" aria-live="polite" aria-atomic="true">{uiText(state !== 'idle' ? labels[state] : uiText('Ready'))}. {live.map(step => step.node.name).join(', ')}. {uiText(terminal ? uiText("{0} blocks completed.", [completed]) : '')}</span>
  </div>;
}
