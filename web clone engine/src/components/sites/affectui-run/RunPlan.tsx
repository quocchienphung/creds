"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { RunPlanProps, RunStep, StepStatus } from "./run-types";
import { RunClock } from "./RunClock";

export function RunSpinner({ className = "ui-pl__spinner" }: { className?: string }) {
  return <svg className={className} viewBox="0 0 16 16" aria-hidden="true">{Array.from({ length: 8 }, (_, index) => <line key={index} x1="8" y1="1.75" x2="8" y2="4.75" transform={`rotate(${index * 45} 8 8)`} style={{ animationDelay: `${index * 100 - 800}ms` }} />)}</svg>;
}

function Check({ className = "ui-pl__mark" }: { className?: string }) {
  return <svg viewBox="0 0 16 16" className={className} aria-hidden="true"><path d="M4.2 8.4 6.8 11l5-5.6" pathLength="1" className="ui-pl__draw" /></svg>;
}

const statusLabels: Record<StepStatus, string> = { pending: "Pending", running: "In progress", waiting: "Waiting for approval", done: "Done", denied: "Failed", stopped: "Failed" };
const decimalSeconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
const wholeSeconds = (ms: number) => `${Math.round(ms / 1000)}s`;

export function RunPlan({ title, snapshot, onRename, onMove, onRemove, onAdd, editing = false, onRetry }: RunPlanProps) {
  const { t: uiText } = useWorkspaceI18n();
  const hintId = useId();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [addition, setAddition] = useState("");
  const [dragging, setDragging] = useState<string | null>(null);
  const rows = useRef(new Map<string, HTMLLIElement>());
  const activeIndex = snapshot.steps.findIndex(step => step.id === snapshot.activeId);
  const completed = snapshot.steps.filter(step => snapshot.states[step.id]?.status === "done").length;
  const failedIndex = snapshot.steps.findIndex(step => snapshot.states[step.id]?.status === "stopped" || snapshot.states[step.id]?.status === "denied");
  const planStatus = editing ? "draft" : snapshot.phase === "done" ? "done" : "running";
  const elapsed = `${Math.round(snapshot.elapsed / 1000)}s`;
  const footer = snapshot.phase === "done" ? `Done in ${elapsed}` : snapshot.phase === "stopped" ? `Stopped${failedIndex >= 0 ? ` · step ${failedIndex + 1} failed` : ""}` : `Running · ${Math.max(1, activeIndex + 1)} of ${snapshot.steps.length}`;

  function startRename(step: RunStep) {
    if (!editing) return;
    setName(step.title);
    setRenaming(step.id);
  }

  function saveName(id: string) {
    const trimmed = name.trim();
    if (trimmed) onRename(id, trimmed);
    setRenaming(null);
    rows.current.get(id)?.focus();
  }

  function stepKey(event: KeyboardEvent<HTMLLIElement>, step: RunStep, index: number) {
    if (!editing || event.target instanceof HTMLInputElement || event.target instanceof HTMLButtonElement) return;
    if (event.key === "Enter" || event.key === "F2") {
      event.preventDefault();
      startRename(step);
    } else if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      onMove(step.id, event.key === "ArrowUp" ? -1 : 1);
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      onRemove(step.id);
      rows.current.get(snapshot.steps[index + 1]?.id ?? snapshot.steps[index - 1]?.id)?.focus();
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      rows.current.get(snapshot.steps[index + (event.key === "ArrowUp" ? -1 : 1)]?.id)?.focus();
    }
  }

  function reorder(target: string) {
    if (!dragging || dragging === target) return;
    const sourceIndex = snapshot.steps.findIndex(step => step.id === dragging);
    const targetIndex = snapshot.steps.findIndex(step => step.id === target);
    if (sourceIndex < 0 || targetIndex < 0) return;
    for (let move = 0; move < Math.abs(targetIndex - sourceIndex); move++) onMove(dragging, targetIndex > sourceIndex ? 1 : -1);
  }

  return <div className="ui-pl" data-status={planStatus} data-dragging={dragging ? "" : undefined}>
    <div className="ui-pl__card">
      <div className="ui-pl__head"><div className="ui-pl__meta"><span className="ui-pl__state"><span className="ui-pl__state-icon" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M6.5 4.5h7M6.5 8h7M6.5 11.5h7" /><circle cx="3.25" cy="4.5" r=".6" /><circle cx="3.25" cy="8" r=".6" /><circle cx="3.25" cy="11.5" r=".6" /></svg></span><span className="ui-pl__state-label">{uiText("Plan · ")}{uiText(snapshot.steps.length)} {uiText(" steps")}</span></span></div><h3 className="ui-pl__title">{uiText(title)}</h3></div>
      <p id={hintId} className="ui-pl__sr">{uiText("Press Enter to rename, Alt plus arrow keys to move, Delete to remove.")}</p>
      <ol className="ui-pl__list" aria-label={uiText("Plan: {0}", [title])}>
        <AnimatePresence initial={false}>{snapshot.steps.map((step, index) => {
          const runtime = snapshot.states[step.id];
          const status = runtime?.status ?? "pending";
          const active = status === "running" || status === "waiting";
          const failed = status === "stopped" || status === "denied";
          const visual = active ? "active" : failed ? "failed" : status;
          return <motion.li key={step.id} layout={editing ? "position" : false} exit={{ opacity: 0, height: 0, paddingTop: 0, paddingBottom: 0 }} transition={{ duration: .3, ease: [.22, 1, .36, 1] }} className="ui-pl__step" data-step={visual} data-dragging={dragging === step.id ? "" : undefined} aria-current={active ? "step" : undefined} tabIndex={editing ? 0 : undefined} aria-describedby={editing ? hintId : undefined} ref={element => { if (element) rows.current.set(step.id, element); else rows.current.delete(step.id); }} onKeyDown={event => stepKey(event, step, index)} onDragOver={event => { if (editing && dragging) event.preventDefault(); }} onDrop={event => { event.preventDefault(); reorder(step.id); setDragging(null); }}>
            {editing && <button className="ui-pl__grip" type="button" aria-label={uiText("Move {0}", [step.title])} title={uiText("Drag to reorder · Alt + arrow keys")} draggable onDragStart={event => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", step.id); setDragging(step.id); }} onDragEnd={() => setDragging(null)}><svg viewBox="0 0 16 16" aria-hidden="true">{[5, 8, 11].flatMap(y => [6, 10].map(x => <circle key={`${x}-${y}`} cx={x} cy={y} r="1" />))}</svg></button>}
            <span className="ui-pl__marker" aria-hidden="true">{active ? <RunSpinner /> : status === "done" ? <Check /> : failed ? <svg viewBox="0 0 16 16" className="ui-pl__mark"><path d="M8 4.2v4.4M8 11.6h.01" /></svg> : <span className="ui-pl__num">{uiText(index + 1)}</span>}</span>
            <div className="ui-pl__main">
              {renaming === step.id && editing ? <input className="ui-pl__edit" aria-label={uiText("Step name")} value={name} autoFocus onFocus={event => event.currentTarget.select()} onChange={event => setName(event.target.value)} onBlur={() => saveName(step.id)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); saveName(step.id); } if (event.key === "Escape") { event.preventDefault(); setRenaming(null); rows.current.get(step.id)?.focus(); } }} /> : <span className="ui-pl__name" onDoubleClick={() => startRename(step)}>{uiText(step.title)}</span>}
              <span className="ui-pl__sub"><span className="ui-pl__detail">{uiText(step.detail)}</span>{step.tool && <code className="ui-pl__tool">{step.tool}</code>}</span><span className="ui-pl__sr">, {uiText(statusLabels[status])}</span>
              {failed && <span className="ui-pl__fail"><span className="ui-pl__error">{uiText(status === "denied" || snapshot.approvals[step.id] === "denied" ? uiText("You denied this step") : uiText("Stopped by you"))}</span>{onRetry && <button type="button" className="ui-pl__retry" onClick={() => onRetry(step.id)}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13 8a5 5 0 1 1-1.6-3.7" /><path d="M13 3v2.6h-2.6" /></svg>{uiText("Retry from here")}</button>}</span>}
            </div>
            <span className="ui-pl__aside">{status === "done" || active ? <span className={`ui-pl__time${status === "done" ? " ui-pl__time--done" : ""}`} aria-hidden={active ? true : undefined}>{status === "done" && <span className="ui-pl__sr">{uiText("took ")}</span>}<RunClock base={(runtime?.elapsed ?? 0) + (runtime?.waited ?? 0)} waitingSince={status === "waiting" ? snapshot.waitStartedAt : undefined} format={decimalSeconds} /></span> : null}{editing && <button className="ui-pl__remove" type="button" aria-label={uiText("Remove {0}", [step.title])} onClick={() => onRemove(step.id)}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4.5 4.5 7 7m0-7-7 7" /></svg></button>}</span>
            {index < snapshot.steps.length - 1 && <span className="ui-pl__rail" aria-hidden="true" />}
          </motion.li>;
        })}</AnimatePresence>
      </ol>
      <div className="ui-pl__tail" inert={!editing}><div className="ui-pl__tail-inner"><label className="ui-pl__add"><span className="ui-pl__add-icon" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M8 4.5v7M4.5 8h7" /></svg></span><input placeholder={uiText("Add step")} aria-label={uiText("Add a step at the end")} enterKeyHint="done" value={addition} onChange={event => setAddition(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && addition.trim()) { event.preventDefault(); onAdd(addition.trim()); setAddition(""); } }} /></label></div></div>
    </div>
    <div className="ui-pl__foot" data-phase={snapshot.phase === "stopped" ? "failed" : snapshot.phase === "done" ? "done" : "running"}><span className="ui-pl__status"><span className="ui-pl__status-icon" aria-hidden="true">{snapshot.phase === "running" || snapshot.phase === "waiting" ? <RunSpinner /> : snapshot.phase === "done" ? <svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.5" /><path d="M5.4 8.2 7.2 10l3.4-3.8" pathLength="1" className="ui-pl__draw" /></svg> : <svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.5" /><path d="M8 4.9v3.6M8 11h.01" /></svg>}</span><span className="ui-pl__status-label">{uiText(editing ? uiText("Edit the plan, then restart the run") : footer)}</span></span>{(snapshot.phase === "running" || snapshot.phase === "waiting") && <span className="ui-pl__elapsed" aria-hidden="true"><RunClock base={snapshot.elapsed} waitingSince={snapshot.phase === "waiting" ? snapshot.waitStartedAt : undefined} format={wholeSeconds} /></span>}</div>
    <p className="ui-pl__sr" role="status" aria-live="polite">{uiText(editing ? uiText("Editing plan") : snapshot.phase === "done" ? uiText("Plan completed") : completed ? uiText("Step {0} done: {1}", [completed, snapshot.steps.filter(step => snapshot.states[step.id]?.status === "done").at(-1)?.title]) : uiText("Running plan"))}</p>
  </div>;
}
