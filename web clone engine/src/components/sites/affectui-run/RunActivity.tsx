"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { memo, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { RunSpinner } from "./RunPlan";
import type { RunActivityProps, RunStep, StepRuntime, ToolCall } from "./run-types";

// Static SVGs observed in the public preview; payload values are rendered as text.
const toolIcons: Record<ToolCall["icon"], string> = {
  "currency": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" color=\"currentColor\" class=\"\" stroke-width=\"1.9\" stroke=\"currentColor\" aria-hidden=\"true\"><path d=\"M17.9583 8.38889C17.9583 6.24111 15.2907 4.5 12 4.5C8.7093 4.5 6.04167 6.24111 6.04167 8.38889C6.04167 10.5367 7.66667 11.7222 12 11.7222C16.3333 11.7222 18.5 12.8333 18.5 15.6111C18.5 18.3889 15.5899 19.5 12 19.5C8.41015 19.5 5.5 17.7589 5.5 15.6111\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-width=\"1.9\"></path><path d=\"M12.5 2.5V4.21M12.5 21.5V19.79\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.9\"></path></svg>",
  "search": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" color=\"currentColor\" class=\"\" stroke-width=\"1.9\" stroke=\"currentColor\" aria-hidden=\"true\"><path d=\"M17 17L21 21\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.9\"></path><path d=\"M19 11C19 6.58172 15.4183 3 11 3C6.58172 3 3 6.58172 3 11C3 15.4183 6.58172 19 11 19C15.4183 19 19 15.4183 19 11Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.9\"></path></svg>",
  "document": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" color=\"currentColor\" class=\"\" stroke-width=\"1.9\" stroke=\"currentColor\" aria-hidden=\"true\"><path d=\"M13 20.8268V22H14.1734C14.5827 22 14.7874 22 14.9715 21.9238C15.1555 21.8475 15.3003 21.7028 15.5897 21.4134L20.4133 16.5894C20.6864 16.3164 20.8229 16.1799 20.8959 16.0327C21.0347 15.7525 21.0347 15.4236 20.8959 15.1434C20.8229 14.9961 20.6864 14.8596 20.4133 14.5866C20.1403 14.3136 20.0038 14.1771 19.8565 14.1041C19.5763 13.9653 19.2473 13.9653 18.9671 14.1041C18.8198 14.1771 18.6833 14.3136 18.4103 14.5866L18.4103 14.5866L13.5867 19.4106C13.2972 19.7 13.1525 19.8447 13.0762 20.0287C13 20.2128 13 20.4174 13 20.8268Z\" stroke=\"currentColor\" stroke-linejoin=\"round\" stroke-width=\"1.9\"></path><path d=\"M19 11C19 11 19 9.4306 18.8478 9.06306C18.6955 8.69552 18.4065 8.40649 17.8284 7.82843L13.0919 3.09188C12.593 2.593 12.3436 2.34355 12.0345 2.19575C11.9702 2.165 11.9044 2.13772 11.8372 2.11401C11.5141 2 11.1614 2 10.4558 2C7.21082 2 5.58831 2 4.48933 2.88607C4.26731 3.06508 4.06508 3.26731 3.88607 3.48933C3 4.58831 3 6.21082 3 9.45584V14C3 17.7712 3 19.6569 4.17157 20.8284C5.23467 21.8915 6.8857 21.99 10 21.9991M12 2.5V3C12 5.82843 12 7.24264 12.8787 8.12132C13.7574 9 15.1716 9 18 9H18.5\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.9\"></path></svg>",
  "mail": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" color=\"currentColor\" class=\"\" stroke-width=\"1.9\" stroke=\"currentColor\" aria-hidden=\"true\"><path d=\"M2 6L8.91302 9.91697C11.4616 11.361 12.5384 11.361 15.087 9.91697L22 6\" stroke=\"currentColor\" stroke-linejoin=\"round\" stroke-width=\"1.9\"></path><path d=\"M2.01577 13.4756C2.08114 16.5412 2.11383 18.0739 3.24496 19.2094C4.37608 20.3448 5.95033 20.3843 9.09883 20.4634C11.0393 20.5122 12.9607 20.5122 14.9012 20.4634C18.0497 20.3843 19.6239 20.3448 20.7551 19.2094C21.8862 18.0739 21.9189 16.5412 21.9842 13.4756C22.0053 12.4899 22.0053 11.5101 21.9842 10.5244C21.9189 7.45886 21.8862 5.92609 20.7551 4.79066C19.6239 3.65523 18.0497 3.61568 14.9012 3.53657C12.9607 3.48781 11.0393 3.48781 9.09882 3.53656C5.95033 3.61566 4.37608 3.65521 3.24495 4.79065C2.11382 5.92608 2.08114 7.45885 2.01576 10.5244C1.99474 11.5101 1.99475 12.4899 2.01577 13.4756Z\" stroke=\"currentColor\" stroke-linejoin=\"round\" stroke-width=\"1.9\"></path></svg>",
  "calendar": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" color=\"currentColor\" class=\"\" stroke-width=\"1.9\" stroke=\"currentColor\" aria-hidden=\"true\"><path d=\"M16 2V6M8 2V6\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.9\"></path><path d=\"M13 4H11C7.22876 4 5.34315 4 4.17157 5.17157C3 6.34315 3 8.22876 3 12V14C3 17.7712 3 19.6569 4.17157 20.8284C5.34315 22 7.22876 22 11 22H13C16.7712 22 18.6569 22 19.8284 20.8284C21 19.6569 21 17.7712 21 14V12C21 8.22876 21 6.34315 19.8284 5.17157C18.6569 4 16.7712 4 13 4Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.9\"></path><path d=\"M3 10H21\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.9\"></path><path d=\"M12.1258 14H12.0008M12.1258 18H12.0008M7.625 14H7.5M7.625 18H7.5M16.625 14H16.5M12.2508 14C12.2508 14.1381 12.1389 14.25 12.0008 14.25C11.8628 14.25 11.7508 14.1381 11.7508 14C11.7508 13.8619 11.8628 13.75 12.0008 13.75C12.1389 13.75 12.2508 13.8619 12.2508 14ZM12.2508 18C12.2508 18.1381 12.1389 18.25 12.0008 18.25C11.8628 18.25 11.7508 18.1381 11.7508 18C11.7508 17.8619 11.8628 17.75 12.0008 17.75C12.1389 17.75 12.2508 17.8619 12.2508 18ZM7.75 14C7.75 14.1381 7.63807 14.25 7.5 14.25C7.36193 14.25 7.25 14.1381 7.25 14C7.25 13.8619 7.36193 13.75 7.5 13.75C7.63807 13.75 7.75 13.8619 7.75 14ZM7.75 18C7.75 18.1381 7.63807 18.25 7.5 18.25C7.36193 18.25 7.25 18.1381 7.25 18C7.25 17.8619 7.36193 17.75 7.5 17.75C7.63807 17.75 7.75 17.8619 7.75 18ZM16.75 14C16.75 14.1381 16.6381 14.25 16.5 14.25C16.3619 14.25 16.25 14.1381 16.25 14C16.25 13.8619 16.3619 13.75 16.5 13.75C16.6381 13.75 16.75 13.8619 16.75 14Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.9\"></path></svg>"
};

function ToolIcon({ icon }: { icon: ToolCall["icon"] }) {
  return <span className="ui-tc__icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: toolIcons[icon] }} />;
}

function Chevron() {
  return <svg className="ui-tc__chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 6.25 8 9.75l3.5-3.5" /></svg>;
}

function ToolStatus({ running }: { running: boolean }) {
  return running ? <svg className="ui-tc__spinner" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.5" /><path d="M8 2.5a5.5 5.5 0 0 1 5.5 5.5" /></svg> : <svg className="ui-tc__ok" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.4 6.6 11.3 12.5 4.9" pathLength="1" /></svg>;
}

function duration(ms: number) { return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`; }
function payloadText(value: unknown) { return typeof value === "string" ? value : JSON.stringify(value, null, 2) ?? "null"; }

function Highlight({ value }: { value: unknown }) {
  const { t: uiText } = useWorkspaceI18n();
  const text = payloadText(value);
  if (typeof value === "string") return text;
  const tokens = /"(?:\\.|[^"\\])*"(?=\s*:)|"(?:\\.|[^"\\])*"|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
  const nodes: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(tokens)) {
    const start = match.index ?? 0;
    nodes.push(text.slice(last, start));
    const token = match[0];
    const type = token.startsWith('"') ? /^\s*:/.test(text.slice(start + token.length)) ? "key" : "str" : /^(true|false|null)$/.test(token) ? "lit" : "num";
    nodes.push(<span key={start} className={`ui-tc__t-${type}`}>{uiText(token)}</span>);
    last = start + token.length;
  }
  nodes.push(text.slice(last));
  return nodes;
}

function PayloadSection({ label, value, notify }: { label: "Arguments" | "Result"; value: unknown; notify: (message: string) => void }) {
  const { t: uiText } = useWorkspaceI18n();
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const reset = useRef<ReturnType<typeof setTimeout> | null>(null);
  const text = payloadText(value);
  const capped = text.split("\n").length > 12;
  useEffect(() => () => { if (reset.current) clearTimeout(reset.current); }, []);
  async function copy() {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else {
        const field = document.createElement("textarea");
        field.value = text;
        field.className = "run-copy-fallback";
        document.body.append(field);
        field.select();
        const success = document.execCommand("copy");
        field.remove();
        if (!success) throw new Error("Clipboard unavailable");
      }
      setCopied(true);
      notify(`${label} copied`);
      if (reset.current) clearTimeout(reset.current);
      reset.current = setTimeout(() => setCopied(false), 1800);
    } catch { notify("Clipboard unavailable. Select the payload text to copy it."); }
  }
  return <div className="ui-tc__section"><div className="ui-tc__section-head"><span className="ui-tc__label">{uiText(label)}</span><button type="button" className="ui-tc__copy" aria-label={uiText("Copy {0}", [label.toLowerCase()])} title={uiText("Copy {0}", [label.toLowerCase()])} data-copied={copied ? "" : undefined} onClick={copy}><svg className="ui-tc__copy-icon" viewBox="0 0 16 16" aria-hidden="true"><rect x="5.25" y="5.25" width="8" height="8" rx="2" /><path d="M10.75 5.25v-1a1.5 1.5 0 0 0-1.5-1.5h-4.5a2 2 0 0 0-2 2v4.5a1.5 1.5 0 0 0 1.5 1.5h1" /></svg><svg className="ui-tc__copy-done" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.4 6.6 11.3 12.5 4.9" pathLength="1" /></svg></button></div><pre className={`ui-tc__code${capped && !expanded ? " run-payload-capped" : ""}`} data-capped={capped && !expanded ? "" : undefined}><code><Highlight value={value} /></code></pre>{capped && <button type="button" className="ui-tc__more" aria-expanded={expanded} onClick={() => setExpanded(current => !current)}>{uiText(expanded ? uiText("Show less") : uiText("Show more"))}</button>}</div>;
}

const ToolCard = memo(function ToolCard({ call, running, elapsed, notify }: { call: ToolCall; running: boolean; elapsed: number; notify: (message: string) => void }) {
  const { t: uiText } = useWorkspaceI18n();
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  return <div className="ui-tc" data-status={running ? "running" : "success"} data-open={open ? "" : undefined}>
    <span className="ui-tc-sr" role="status" aria-live="polite">{uiText(call.name)} {uiText(running ? "running" : "finished")}</span>
    <button type="button" className="ui-tc__head" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen(current => !current)}><ToolIcon icon={call.icon} /><span className="ui-tc__main"><code className="ui-tc__name">{call.name}</code><span className="ui-tc__summary" title={uiText(call.summary)}>{uiText(call.summary)}</span></span><span className="ui-tc__status"><ToolStatus running={running} /><span className="ui-tc__time">{uiText(running ? `${(elapsed / 1000).toFixed(1)}s` : duration(call.duration))}</span></span><Chevron /></button>
    <div className="ui-tc__body" id={bodyId} inert={!open}><div className="ui-tc__clip"><div className="ui-tc__sections"><PayloadSection label={uiText("Arguments")} value={call.args} notify={notify} />{running ? <div className="ui-tc__section"><div className="ui-tc__section-head"><span className="ui-tc__label">{uiText("Result")}</span></div><p className="ui-tc__pending">{uiText("Waiting for result…")}</p></div> : <PayloadSection label={uiText("Result")} value={call.result} notify={notify} />}</div></div></div>
  </div>;
});

function ToolGroup({ step, runtime, notify }: { step: RunStep; runtime: StepRuntime; notify: (message: string) => void }) {
  const { t: uiText } = useWorkspaceI18n();
  const listId = useId();
  const running = runtime.status === "running" && runtime.completedCalls < step.calls.length;
  const mode = running ? "running" : "settled";
  const [choice, setChoice] = useState<{ mode: string; open: boolean } | null>(null);
  const open = choice?.mode === mode ? choice.open : running;
  const calls = step.calls.slice(0, Math.min(step.calls.length, runtime.completedCalls + (running && runtime.callElapsed > 0 ? 1 : 0)));
  const total = step.calls.slice(0, runtime.completedCalls).reduce((sum, call) => sum + call.duration, 0) + (running ? runtime.callElapsed : 0);
  const label = running ? "Using tools…" : `Used ${calls.length} tool${calls.length === 1 ? "" : "s"}`;
  return <div className="ui-tc-group" data-open={open ? "" : undefined}>
    <span className="ui-tc-sr" role="status" aria-live="polite">{uiText(label)}</span>
    <button type="button" className="ui-tc-group__head" aria-expanded={open} aria-controls={listId} onClick={() => setChoice({ mode, open: !open })}><span className="ui-tc-group__stack" aria-hidden="true">{calls.slice(0, 3).map((call, index) => <ToolIcon icon={call.icon} key={index} />)}</span><span className="ui-tc-group__title"><span className={`ui-tc-group__label${running ? " ui-tc__shine" : ""}`} data-text={label}>{uiText(label)}</span><span className="ui-tc-group__time">· {uiText((total / 1000).toFixed(1))}s</span></span><Chevron /></button>
    <div className="ui-tc__body" id={listId} inert={!open}><div className="ui-tc__clip"><div className="ui-tc-group__list">{calls.map((call, index) => <ToolCard key={`${index}-${call.name}`} call={call} running={running && index === runtime.completedCalls} elapsed={running && index === runtime.completedCalls ? runtime.callElapsed : call.duration} notify={notify} />)}</div></div></div>
  </div>;
}

function ApprovalIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true"><path d="M11 6L21 6M11 12L21 12M11 18L21 18" strokeLinecap="round" /><path d="M3 7.39286C3 7.39286 4 8.04466 4.5 9C4.5 9 6 5.25 8 4M3 18.3929C3 18.3929 4 19.0447 4.5 20C4.5 20 6 16.25 8 15" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function ActivityLoader({ label, done }: { label: string; done: boolean }) {
  const { t: uiText } = useWorkspaceI18n();
  const labelRef = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState<number | undefined>(undefined);
  useEffect(() => {
    const element = labelRef.current;
    if (!element) return;
    const observer = new ResizeObserver(entries => setWidth(Math.ceil(entries[0].contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, [label]);
  return <span className="ui-tl ui-ar__loader" data-size="sm" data-variant="pill" role="status" aria-live="polite" data-done={done ? "true" : undefined}><span className="ui-tl__icon" aria-hidden="true"><RunSpinner className="ui-tl__spinner" /><svg className="ui-tl__check" viewBox="0 0 16 16"><path d="M3.5 8.4 6.6 11.3 12.5 4.9" pathLength="1" /></svg></span><span className="ui-tl__text run-activity-text" style={width === undefined ? undefined : { width }}><span ref={labelRef} key={label} className={`ui-tl__label ui-tl__label--in${done ? "" : " ui-tl__shine"}`} data-text={label}>{uiText(label)}</span></span></span>;
}

export function RunActivity({ snapshot, onShowApproval, notify }: RunActivityProps) {
  const { t: uiText } = useWorkspaceI18n();
  const active = snapshot.steps.find(step => step.id === snapshot.activeId);
  const finished = snapshot.phase === "done";
  const loader = snapshot.phase === "waiting" ? "Waiting for your approval" : snapshot.phase === "done" ? `Done in ${Math.round(snapshot.elapsed / 1000)}s` : active?.title ?? "Working on your plan";
  return <div className="ui-ar__feed"><span className="ui-ar__label">{uiText("Activity")}</span><AnimatePresence initial={false}>{snapshot.steps.map((step, index) => {
    const runtime = snapshot.states[step.id];
    if (!runtime || runtime.status === "pending" || (runtime.status === "running" && runtime.elapsed < 700 && !runtime.completedCalls)) return null;
    const decision = snapshot.approvals[step.id];
    // The source retains the last approval event when a run is manually stopped.
    const waiting = runtime.status === "waiting" || (runtime.status === "stopped" && !!step.approval && !decision && runtime.elapsed >= 700);
    const hasCalls = runtime.completedCalls > 0 || (runtime.status === "running" && runtime.callElapsed > 0);
    return <motion.div key={step.id} className="ui-ar__entry ui-as-rise" exit={{ opacity: 0, height: 0 }} transition={{ duration: .25 }}>
      <span className="ui-ar__entry-head"><span className="ui-ar__num" data-done={runtime.status === "done" ? "true" : undefined}>{uiText(index + 1)}</span>{uiText(step.title)}</span>
      {(waiting || decision) && <span className="ui-ar__note" data-state={waiting ? "pending" : decision}><ApprovalIcon />{waiting ? <button type="button" className="run-approval-link" onClick={onShowApproval}>{uiText("Waiting for your approval")}</button> : decision === "approved" ? uiText("You approved this step") : uiText("You denied this step")}</span>}
      {hasCalls && <ToolGroup step={step} runtime={runtime} notify={notify} />}
    </motion.div>;
  })}</AnimatePresence>{snapshot.phase !== "stopped" && <ActivityLoader label={uiText(loader)} done={finished} />}</div>;
}
