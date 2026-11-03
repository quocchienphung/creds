"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import { Check, Loader2, Play, RotateCcw, Square, X } from "lucide-react";
import "./workflow.css";

export type StepResult = "ok" | "error";
export type StepStatus = "idle" | "running" | "done" | "error" | "skipped";
export interface WorkflowStep {
  id: string;
  mark: ReactNode;
  title: string;
  /** One line after the title, in muted text. */
  detail?: string;
  /** What the step says while it runs, in a shimmering line. */
  activity?: string;
  result: StepResult;
  /** How long the step really took, when it was timed. The replay shows this number, never an invented one; a step that was not timed says "Done". */
  durationMs?: number;
  output?: ReactNode;
  /** A failed step says why, streamed in fast chunks, and may offer one action (the preview's Retry). */
  error?: string;
  action?: ReactNode;
  /** A branch (the last step only): the paths it can take, and the one it took. */
  paths?: { id: string; label: string; body: ReactNode }[];
  taken?: string;
}
export interface WorkflowLabels { done: string; run: string; runAgain: string; stop: string; running: string; failed: string; skipped: string; step: (title: string, status: string) => string; runningStep: (index: number, total: number) => string; passed: (ms: string) => string; blocked: (count: number) => string; announce: { start: string; step: (title: string, status: string) => string; done: string; stopped: string } }

/** Timings read off the public preview of UIArc's AI workflow (docs/research/ai-workflow/source/timeline-run.json). */
const TRAVEL_MS = 240, BETWEEN_MS = 116, FIRST_MS = 120, MIN_RUNNING_MS = 220, CHUNK_WORDS = 5, CHUNK_MS = 34;
const OUTPUT_SPRING = { type: "spring", visualDuration: 0.22, bounce: 0 } as const;
const EASE_ENTER = [0.16, 1, 0.3, 1] as const;
const formatMs = (ms: number | undefined) => ms === undefined ? "" : ms < 1 ? "<1ms" : ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

interface View { phase: "static" | "running" | "finished"; status: Record<string, StepStatus>; open: Record<string, boolean>; head: Record<string, "idle" | "active" | "done">; tail: Record<string, "idle" | "done">; dot: string | null; current: number; totalMs: number }
const settled = (steps: WorkflowStep[], phase: View["phase"] = "static", totalMs = 0): View => ({
  phase, status: Object.fromEntries(steps.map(step => [step.id, step.result === "ok" ? "done" : "error"])), open: Object.fromEntries(steps.map(step => [step.id, true])),
  head: Object.fromEntries(steps.map(step => [step.id, "done"])), tail: Object.fromEntries(steps.map(step => [step.id, "done"])), dot: null, current: -1, totalMs,
});

/**
 * A Linear-style workflow card: steps on one hairline rail, a run that moves one thing at a time (a dot down the next connector, the step to
 * Running, then its duration and its output opening on its measured height), a branch with small tabs, and a footer that says how the run ended.
 * Rebuilt from the open preview of UIArc's AI workflow and its public documentation. The card shows the state it is given at once; a run replays
 * that state step by step, and `onRun` lets the owner refresh the real data first.
 */
export function Workflow({ title, description, steps, labels, onRun, className }: { title: string; description?: string; steps: WorkflowStep[]; labels: WorkflowLabels; onRun?: () => Promise<WorkflowStep[] | void>; className?: string }) {
  const reduce = useReducedMotion() ?? false;
  const uid = useId();
  const [view, setView] = useState<View>(() => settled(steps));
  const [shown, setShown] = useState<WorkflowStep[]>(steps);
  const [announce, setAnnounce] = useState("");
  const [picked, setPicked] = useState<Record<string, string>>({});
  const run = useRef(0);
  const latest = useRef(steps);
  useEffect(() => { latest.current = steps; }, [steps]);
  // Until a run replaces them, the steps are the ones the owner passes in (a new plan updates the card in place).
  const live = view.phase === "running" ? shown : steps;
  const passed = live.every(step => step.result === "ok");
  const failedCount = live.filter(step => step.result === "error").length;

  const stop = useCallback(() => { run.current++; setView(settled(latest.current, "finished")); setShown(latest.current); setAnnounce(labels.announce.stopped); }, [labels.announce.stopped]);
  const play = useCallback(async () => {
    const id = ++run.current, alive = () => run.current === id;
    setAnnounce(labels.announce.start);
    const fresh = (await onRun?.()) || latest.current;
    if (!alive()) return;
    setShown(fresh);
    const idle: View = { phase: "running", status: Object.fromEntries(fresh.map(step => [step.id, "idle"])), open: Object.fromEntries(fresh.map(step => [step.id, false])), head: Object.fromEntries(fresh.map(step => [step.id, "idle"])), tail: Object.fromEntries(fresh.map(step => [step.id, "idle"])), dot: null, current: 0, totalMs: 0 };
    setView(idle);
    await sleep(reduce ? 0 : FIRST_MS);
    let total = 0;
    for (let i = 0; i < fresh.length; i++) {
      const step = fresh[i];
      if (!alive()) return;
      if (i > 0) {
        if (!reduce) { setView(v => ({ ...v, current: i, dot: step.id, head: { ...v.head, [step.id]: "active" } })); await sleep(TRAVEL_MS); if (!alive()) return; }
        setView(v => ({ ...v, current: i, dot: null, head: { ...v.head, [step.id]: "done" } }));
      } else setView(v => ({ ...v, current: 0 }));
      setView(v => ({ ...v, status: { ...v.status, [step.id]: "running" } }));
      await sleep(Math.max(reduce ? 0 : MIN_RUNNING_MS, step.durationMs ?? 0));
      if (!alive()) return;
      total += step.durationMs ?? 0;
      const status: StepStatus = step.result === "ok" ? "done" : "error";
      setView(v => ({ ...v, status: { ...v.status, [step.id]: status }, open: { ...v.open, [step.id]: true }, tail: { ...v.tail, [step.id]: "done" } }));
      setAnnounce(labels.announce.step(step.title, step.result === "ok" ? formatMs(step.durationMs) || labels.done : labels.failed));
      await sleep(reduce ? 0 : BETWEEN_MS);
    }
    if (!alive()) return;
    setView(v => ({ ...v, phase: "finished", current: -1, totalMs: total }));
    setShown(fresh);
    setAnnounce(labels.announce.done);
  }, [onRun, reduce, labels]);
  useEffect(() => () => { run.current++; }, []);

  const running = view.phase === "running";
  const shownView = running ? view : settled(live, view.phase, view.totalMs);
  const summary = running ? { key: "run", state: "running" as const, text: labels.runningStep(Math.max(1, view.current + 1), live.length) }
    : passed ? { key: "ok", state: "passed" as const, text: labels.passed(view.phase === "finished" && view.totalMs ? formatMs(view.totalMs) : "") }
    : { key: "bad", state: "failed" as const, text: labels.blocked(failedCount) };

  return <section className={`wf-root${className ? ` ${className}` : ""}`} aria-labelledby={`${uid}-title`} aria-busy={running}>
    <header className="wf-header">
      <div className="wf-headText"><h4 className="wf-title" id={`${uid}-title`}>{title}</h4>{description && <span className="wf-description">{description}</span>}</div>
      <button type="button" className="wf-runButton" data-variant={running ? "secondary" : undefined} onClick={() => running ? stop() : void play()}>
        {running ? <Square size={12} aria-hidden="true" /> : view.phase === "static" ? <Play size={12} aria-hidden="true" /> : <RotateCcw size={12} aria-hidden="true" />}
        {running ? labels.stop : view.phase === "static" ? labels.run : labels.runAgain}
      </button>
    </header>
    <div className="wf-canvas">
      <LayoutGroup id={uid}>
        <ol className="wf-list">
          {live.map((step, i) => <StepRow key={step.id} uid={uid} step={step} index={i} last={i === live.length - 1} view={shownView} reduce={reduce} labels={labels} picked={picked[step.id]} onPick={path => setPicked(current => ({ ...current, [step.id]: path }))} />)}
        </ol>
      </LayoutGroup>
    </div>
    <footer className="wf-footer">
      <div className="wf-summary" aria-hidden="true">
        <AnimatePresence initial={false}>
          <motion.span key={summary.key} className="wf-summaryInner" data-state={summary.state} initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1, transition: { duration: reduce ? 0 : 0.16, ease: EASE_ENTER } }} exit={{ opacity: 0, transition: { duration: reduce ? 0 : 0.1 } }}>
            <span className="wf-summaryIcon">{summary.state === "running" ? <span className="wf-liveDot" /> : summary.state === "passed" ? <Check size={14} aria-hidden="true" /> : <X size={14} aria-hidden="true" />}</span>
            <span className="wf-summaryText wf-tabular">{summary.text}</span>
          </motion.span>
        </AnimatePresence>
      </div>
    </footer>
    <span className="wf-srOnly" role="status" aria-live="polite">{announce}</span>
  </section>;
}

function StepRow({ uid, step, index, last, view, reduce, labels, picked, onPick }: { uid: string; step: WorkflowStep; index: number; last: boolean; view: View; reduce: boolean; labels: WorkflowLabels; picked?: string; onPick: (path: string) => void }) {
  const status = view.status[step.id] ?? "idle", open = view.open[step.id] ?? false, running = status === "running";
  const head = view.head[step.id] ?? "idle", tail = view.tail[step.id] ?? "idle";
  const statusText = status === "done" ? formatMs(step.durationMs) || labels.done : status === "error" ? labels.failed : status === "running" ? labels.running : status === "skipped" ? labels.skipped : "";
  const taken = step.taken ?? step.paths?.[0]?.id, selected = picked ?? taken;
  return <li className="wf-item">
    <div className="wf-inner" data-head={index > 0 || undefined}>
      {index > 0 && <div className="wf-head" aria-hidden="true"><span className="wf-fill" data-state={head} />{view.dot === step.id && <span className="wf-dot" />}</div>}
      <div className="wf-body" data-status={status}>
        <div className="wf-row">
          <span className="wf-mark" aria-hidden="true">{step.mark}</span>
          <div className="wf-text">
            <span className="wf-stepTitle" aria-label={labels.step(step.title, statusText || "—")}>{step.title}</span>
            <span className="wf-stepDetail">
              <span className="wf-detailText" data-hidden={running || undefined}>{step.detail}</span>
              <span className="wf-activity" data-hidden={!running || undefined} data-shimmer={(running && !reduce) || undefined}>{step.activity ?? step.detail}</span>
            </span>
          </div>
          <div className="wf-status"><AnimatePresence initial={false}>
            <motion.span key={status} className="wf-statusInner" data-status={status} initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1, transition: { duration: reduce ? 0 : 0.16, ease: EASE_ENTER } }} exit={{ opacity: 0, transition: { duration: reduce ? 0 : 0.1 } }}>
              {status === "running" && <Loader2 size={13} className="wf-spinner" aria-hidden="true" />}
              {status === "done" && <Check size={13} aria-hidden="true" />}
              {status === "error" && <X size={13} aria-hidden="true" />}
              <span className="wf-tabular">{statusText}</span>
            </motion.span>
          </AnimatePresence></div>
        </div>
        <AnimatePresence initial={false}>
          {open && (step.output || step.error || step.paths) && <motion.div key="fold" className="wf-fold" initial={reduce ? false : { height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={reduce ? undefined : { height: 0, opacity: 0 }} transition={reduce ? { duration: 0 } : { height: OUTPUT_SPRING, opacity: { duration: 0.16, ease: EASE_ENTER } }}>
            {step.paths && <div className="wf-tabs" role="radiogroup" aria-label={step.title}>
              {step.paths.map(path => <button type="button" key={path.id} className="wf-tab" role="radio" aria-checked={selected === path.id} data-selected={selected === path.id || undefined} tabIndex={selected === path.id ? 0 : -1} onClick={() => onPick(path.id)}>
                {selected === path.id && <motion.span layoutId={`${uid}-${step.id}-tab`} className="wf-tabHighlight" transition={reduce ? { duration: 0 } : OUTPUT_SPRING} />}<span className="wf-tabLabel">{path.label}</span></button>)}
            </div>}
            <div className="wf-output">
              {step.paths ? <AnimatePresence mode="popLayout" initial={false}><motion.div key={selected} initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1, transition: { duration: reduce ? 0 : 0.16 } }} exit={{ opacity: 0, transition: { duration: reduce ? 0 : 0.1 } }}>{step.paths.find(path => path.id === selected)?.body}</motion.div></AnimatePresence> : step.output}
              {step.error && step.result === "error" && <div className="wf-errorOut"><p className="wf-errorText"><Stream text={step.error} play={view.phase === "running" && !reduce} /></p>{step.action}</div>}
            </div>
          </motion.div>}
        </AnimatePresence>
        {!last && <div className="wf-tail" aria-hidden="true"><span className="wf-fill" data-state={tail} /></div>}
      </div>
    </div>
  </li>;
}

/** Text that arrives five words every 34 ms, each chunk only fading in: the whole text is laid out from the first frame, so nothing reflows. */
function Stream({ text, play }: { text: string; play: boolean }) {
  const chunks = text.split(/(\s+)/).reduce<string[]>((out, part, i) => { if (i % 2 === 0) { const last = out.length - 1; if (last >= 0 && (out[last].match(/\S+/g)?.length ?? 0) < CHUNK_WORDS) out[last] += part; else out.push(part); } else if (out.length) out[out.length - 1] += part; else out.push(part); return out; }, []);
  const [count, setCount] = useState(play ? 0 : chunks.length);
  useEffect(() => {
    if (!play) return;
    const timer = setInterval(() => setCount(value => { if (value + 1 >= chunks.length) clearInterval(timer); return Math.min(chunks.length, value + 1); }), CHUNK_MS);
    return () => clearInterval(timer);
  }, [play, chunks.length]);
  return <>{chunks.map((chunk, i) => <span key={i} className="wf-chunk" data-shown={i < count || undefined}>{chunk}</span>)}</>;
}
