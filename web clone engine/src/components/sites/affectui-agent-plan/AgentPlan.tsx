"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import {
  estimateMs, formatEstimate, formatStepTime, progressOf, type PlanStep,
} from "./plan-model";
import { defaultInvoiceSteps, invoiceStatusLabels, invoiceStatusOf, invoiceTitle, type InvoiceStatus, type PlanExecutor } from "./invoice-plan";
import { usePlanEngine } from "./usePlanEngine";
import "../affectui-fonts.css";
import "./agent-plan.css";

export type PlanBadge = { label: string; tone: string };

export type AgentPlanProps = {
  /** The goal of the plan: the heading and the list's label. */
  title: string;
  /** The steps to review; ids must be stable. */
  steps: readonly Omit<PlanStep, "state">[];
  /** Runs one step. Defaults to the simulated executor; reject to fail the step. */
  executor?: PlanExecutor;
  /** "Run plan" pressed: the steps in their final order. */
  onRun?: (steps: readonly PlanStep[]) => void;
  onDone?: (steps: readonly PlanStep[], elapsedMs: number) => void;
  /** A pill next to the title derived from the steps, e.g. the invoice's status. */
  badge?: (steps: readonly PlanStep[]) => PlanBadge | null;
  /** Estimated run time shown in review; derived from the steps when omitted. */
  estimate?: string;
  className?: string;
};

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** FLIP: every step glides from where it was to where it is now; steps released from a drag get their transitions back. */
function glide(before: Map<string, number>, els: Map<string, HTMLLIElement>, settle: Set<HTMLElement>) {
  const animate = !reducedMotion();
  els.forEach((el, id) => {
    const from = before.get(id);
    if (from === undefined || !animate) return;
    const delta = from - el.getBoundingClientRect().top;
    if (Math.abs(delta) > 0.5) el.animate([{ transform: `translateY(${delta}px)` }, { transform: "none" }], { duration: 420, easing: EASE });
  });
  requestAnimationFrame(() => { settle.forEach(el => { el.style.transition = ""; }); settle.clear(); });
}

const Spinner = () => <svg className="ap__spinner" viewBox="0 0 16 16" aria-hidden="true">
  {Array.from({ length: 8 }, (_, i) => <line key={i} x1="8" y1="1.75" x2="8" y2="4.75" transform={`rotate(${i * 45} 8 8)`} style={{ animationDelay: `${-800 + i * 100}ms` }} />)}
</svg>;

type Drag = {
  id: string; pointerId: number; startY: number; index: number; target: number;
  rows: { id: string; el: HTMLLIElement; top: number; height: number }[];
};

/**
 * An agent's step-by-step plan to review before it runs: rename, drag to reorder, remove or add steps, then watch each
 * step run with live timers and retry from a failed step. The card fills its parent and scales as a unit (a 360px-wide
 * design), so it keeps its proportions in a small frame or a full column.
 */
export function AgentPlan({ title, steps: initialSteps, executor, onRun, onDone, badge, estimate, className }: AgentPlanProps) {
  const { t: uiText } = useWorkspaceI18n();
  const { plan, dispatch, run, retry, reopen, elapsedLabel, stepMs } = usePlanEngine({ steps: initialSteps, executor, onRun, onDone });
  const hintId = `ap-${useId().replace(/[^a-zA-Z0-9]/g, "")}-hint`;
  const editable = plan.phase === "draft";
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const addField = useRef<HTMLInputElement>(null);
  const stepEls = useRef(new Map<string, HTMLLIElement>());
  const flip = useRef<Map<string, number> | null>(null);
  const focusAfter = useRef<string | null>(null);
  const settling = useRef(new Set<HTMLElement>());
  const dragging = useRef<Drag | null>(null);
  const removing = useRef(new Set<string>());
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);
  const [adding, setAdding] = useState("");
  const [entering, setEntering] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const total = plan.steps.length;

  /** Remember where every step is now; the next layout pass glides each one from there to its new place. */
  const snapshot = () => {
    const tops = new Map<string, number>();
    stepEls.current.forEach((el, id) => tops.set(id, el.getBoundingClientRect().top));
    flip.current = tops;
  };
  const playFlip = (before: Map<string, number>) => glide(before, stepEls.current, settling.current);

  useLayoutEffect(() => {
    const before = flip.current;
    flip.current = null;
    if (before) playFlip(before);
    const id = focusAfter.current;
    focusAfter.current = null;
    if (id) stepEls.current.get(id)?.focus({ preventScroll: true });
  }, [plan.steps]);

  // Keep the step being worked on in view when the list scrolls.
  const activeId = plan.steps.find(step => step.state === "active")?.id;
  useEffect(() => {
    const el = activeId ? stepEls.current.get(activeId) : undefined;
    const box = list.current;
    if (!el || !box) return;
    box.scrollTo({ top: el.offsetTop - (box.clientHeight - el.offsetHeight) / 2, behavior: reducedMotion() ? "auto" : "smooth" });
  }, [activeId]);

  const moveStep = (id: string, delta: number) => {
    const from = plan.steps.findIndex(step => step.id === id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= total) return;
    snapshot();
    focusAfter.current = id;
    dispatch({ type: "move", id, to });
    setAnnouncement(`Moved “${plan.steps[from].title}” to position ${to + 1} of ${total}`);
  };

  const removeStep = (id: string) => {
    const el = stepEls.current.get(id);
    const index = plan.steps.findIndex(step => step.id === id);
    if (!el || index < 0 || removing.current.has(id)) return;
    removing.current.add(id);
    const title = plan.steps[index].title;
    const neighbour = plan.steps[index + 1] ?? plan.steps[index - 1];
    el.style.height = `${el.offsetHeight}px`;
    void el.offsetHeight;
    el.setAttribute("data-removing", "");
    setTimeout(() => {
      removing.current.delete(id);
      focusAfter.current = neighbour?.id ?? null;
      if (!neighbour) addField.current?.focus();
      dispatch({ type: "remove", id });
      setAnnouncement(`Removed “${title}”`);
    }, reducedMotion() ? 0 : 280);
  };

  const addStep = () => {
    const text = adding.trim();
    if (!text) return;
    const id = `step-${plan.nextId}`;
    setEntering(id);
    dispatch({ type: "add", title: text });
    setAdding("");
    setAnnouncement(`Added “${text}” as step ${total + 1}`);
    requestAnimationFrame(() => list.current?.scrollTo({ top: list.current.scrollHeight, behavior: reducedMotion() ? "auto" : "smooth" }));
  };

  const finishEdit = (save: boolean) => {
    if (!editing) return;
    const { id, value } = editing;
    setEditing(null);
    focusAfter.current = id;
    const before = plan.steps.find(step => step.id === id)?.title;
    if (save && value.trim() && value.trim() !== before) {
      dispatch({ type: "rename", id, title: value });
      setAnnouncement(`Renamed step ${plan.steps.findIndex(step => step.id === id) + 1} to “${value.trim()}”`);
    } else stepEls.current.get(id)?.focus({ preventScroll: true });
  };

  function onStepKeyDown(event: KeyboardEvent<HTMLLIElement>, step: PlanStep, index: number) {
    if (!editable || event.target !== event.currentTarget) return;
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const delta = event.key === "ArrowUp" ? -1 : 1;
      if (event.altKey) moveStep(step.id, delta);
      else stepEls.current.get(plan.steps[index + delta]?.id ?? "")?.focus();
    } else if (event.key === "Enter") {
      event.preventDefault();
      setEditing({ id: step.id, value: step.title });
    } else if (event.key === "Delete") {
      event.preventDefault();
      removeStep(step.id);
    }
  }

  // Dragging a step: it follows the pointer, the others slide aside, and everything settles with the same glide.
  function onGripDown(event: ReactPointerEvent<HTMLElement>, id: string) {
    if (!editable || event.button !== 0 || editing) return;
    event.preventDefault();
    const rows = plan.steps.map(step => {
      const el = stepEls.current.get(step.id)!;
      const rect = el.getBoundingClientRect();
      return { id: step.id, el, top: rect.top, height: rect.height };
    });
    const index = rows.findIndex(row => row.id === id);
    dragging.current = { id, pointerId: event.pointerId, startY: event.clientY, index, target: index, rows };
    event.currentTarget.setPointerCapture(event.pointerId);
    rows[index].el.setAttribute("data-dragging", "");
    root.current?.setAttribute("data-dragging", "");
  }
  function onGripMove(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragging.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const me = drag.rows[drag.index];
    const first = drag.rows[0], last = drag.rows[drag.rows.length - 1];
    const dy = Math.min(last.top + last.height - (me.top + me.height), Math.max(first.top - me.top, event.clientY - drag.startY));
    me.el.style.transform = `translateY(${dy}px)`;
    const center = me.top + me.height / 2 + dy;
    let target = 0;
    drag.rows.forEach((row, i) => { if (i !== drag.index && row.top + row.height / 2 < center) target += 1; });
    drag.target = target;
    drag.rows.forEach((row, i) => {
      if (i === drag.index) return;
      const shift = drag.index < target && i > drag.index && i <= target ? -me.height : drag.index > target && i >= target && i < drag.index ? me.height : 0;
      row.el.style.transform = shift ? `translateY(${shift}px)` : "";
    });
  }
  function onGripEnd(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragging.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    dragging.current = null;
    const before = new Map<string, number>();
    drag.rows.forEach(row => before.set(row.id, row.el.getBoundingClientRect().top));
    drag.rows.forEach(row => {
      row.el.style.transition = "none";
      row.el.style.transform = "";
      row.el.removeAttribute("data-dragging");
      settling.current.add(row.el);
    });
    root.current?.removeAttribute("data-dragging");
    const moved = event.type === "pointerup" && drag.target !== drag.index;
    if (moved) {
      flip.current = before;
      focusAfter.current = drag.id;
      dispatch({ type: "move", id: drag.id, to: drag.target });
      setAnnouncement(`Moved “${plan.steps[drag.index].title}” to position ${drag.target + 1} of ${total}`);
    } else playFlip(before);
  }

  // What the engine does is announced from its state; edits announce themselves from their handlers.
  const lastDone = plan.steps.map(step => step.state).lastIndexOf("done");
  const engineText = plan.phase === "done" ? `Plan done in ${elapsedLabel}`
    : plan.phase === "failed" ? `Step ${plan.steps.findIndex(step => step.state === "failed") + 1} failed: ${plan.steps.find(step => step.state === "failed")?.title}. ${plan.steps.find(step => step.state === "failed")?.error ?? ""}`
    : plan.phase === "running" && lastDone >= 0 ? `Step ${lastDone + 1} done: ${plan.steps[lastDone].title}` : "";
  const liveText = plan.phase === "draft" ? announcement : engineText;
  const status = plan.phase === "failed" ? "running" : plan.phase;
  const { position } = progressOf(plan);
  const failedIndex = plan.steps.findIndex(step => step.state === "failed");
  const pill = badge?.(plan.steps) ?? null;
  const estimateLabel = estimate ?? formatEstimate(estimateMs(plan.steps));

  return <div className={className ? `ap-frame ${className}` : "ap-frame"}>
    <section ref={root} className="ap" data-status={status} aria-label={uiText(title)}>
      <header className="ap__head">
        <div className="ap__meta">
          <span className="ap__state">
            <svg className="ap__state-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M6.5 4.5h7M6.5 8h7M6.5 11.5h7" /><circle cx="3.25" cy="4.5" r=".6" /><circle cx="3.25" cy="8" r=".6" /><circle cx="3.25" cy="11.5" r=".6" /></svg>
            <span className="ap__state-label">{uiText("Plan · ")}{uiText(total)} {uiText(total === 1 ? uiText("step") : uiText("steps"))}</span>
          </span>
          {editable && <span className="ap__estimate">
            <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" /><path d="M8 5v3.2l2 1.3" /></svg>
            <span><span className="ap__sr">{uiText("Estimated time ")}</span>{uiText(estimateLabel)}</span>
          </span>}
        </div>
        <div className="ap__titlerow">
          <h3 className="ap__title">{uiText(title)}</h3>
          {pill && <span className="ap__pill" data-tone={pill.tone} key={pill.tone}>
            {pill.tone === "paid" && <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.2 8.4 6.8 11l5-5.6" /></svg>}
            {uiText(pill.label)}
          </span>}
        </div>
      </header>
      <p id={hintId} className="ap__sr">{uiText("Press Enter to rename, Alt plus arrow keys to move, Delete to remove.")}</p>
      <ol className="ap__list" ref={list} aria-label={uiText("Plan: {0}", [title])}>
        {plan.steps.map((step, index) => {
          const isEditing = editing?.id === step.id;
          return <li
            key={step.id}
            ref={el => { if (el) stepEls.current.set(step.id, el); else stepEls.current.delete(step.id); }}
            className="ap__step"
            data-step={editable ? undefined : step.state}
            data-enter={entering === step.id ? "" : undefined}
            tabIndex={editable ? 0 : undefined}
            aria-describedby={editable ? hintId : undefined}
            aria-current={step.state === "active" ? "step" : undefined}
            onAnimationEnd={() => { if (entering === step.id) setEntering(null); }}
            onKeyDown={event => onStepKeyDown(event, step, index)}
          >
            {editable && <span
              className="ap__grip"
              aria-hidden="true"
              title={uiText("Drag to reorder")}
              onPointerDown={event => onGripDown(event, step.id)}
              onPointerMove={onGripMove}
              onPointerUp={onGripEnd}
              onPointerCancel={onGripEnd}
            ><svg viewBox="0 0 16 16"><circle cx="6" cy="4" r="1.1" /><circle cx="10" cy="4" r="1.1" /><circle cx="6" cy="8" r="1.1" /><circle cx="10" cy="8" r="1.1" /><circle cx="6" cy="12" r="1.1" /><circle cx="10" cy="12" r="1.1" /></svg></span>}
            <span className="ap__marker" aria-hidden="true" key={`${step.state}-${editable}`}>
              {!editable && step.state === "active" ? <Spinner />
                : !editable && step.state === "done" ? <svg viewBox="0 0 16 16" className="ap__mark"><path d="M4.2 8.4 6.8 11l5-5.6" pathLength="1" className="ap__draw" /></svg>
                : !editable && step.state === "failed" ? <svg viewBox="0 0 16 16" className="ap__mark"><path d="M8 4.2v4.4M8 11.6h.01" /></svg>
                : <span className="ap__num">{uiText(index + 1)}</span>}
            </span>
            <div className="ap__main">
              {isEditing
                ? <input
                  className="ap__edit"
                  aria-label={uiText("Rename step {0}", [index + 1])}
                  autoFocus
                  value={editing.value}
                  onFocus={event => event.currentTarget.select()}
                  onChange={event => setEditing({ id: step.id, value: event.target.value })}
                  onBlur={() => finishEdit(true)}
                  onKeyDown={event => {
                    if (event.key === "Enter") { event.preventDefault(); finishEdit(true); }
                    else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); finishEdit(false); }
                  }}
                />
                : <span className="ap__name" onDoubleClick={() => { if (editable) setEditing({ id: step.id, value: step.title }); }}>{uiText(step.title)}</span>}
              {(step.detail || step.tool) && <span className="ap__sub">
                {step.detail && <span className="ap__detail">{uiText(step.detail)}</span>}
                {step.tool && <code className="ap__tool">{step.tool}</code>}
              </span>}
              {!editable && <span className="ap__sr">{uiText(step.state === "active" ? uiText(", In progress") : step.state === "done" ? uiText(", Done") : step.state === "failed" ? uiText(", Failed") : uiText(", Pending"))}</span>}
              {!editable && step.state === "failed" && <span className="ap__fail">
                <span className="ap__error">{uiText(step.error)}</span>
                <button type="button" className="ap__retry" onClick={() => retry(step.id)}>
                  <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13 8a5 5 0 1 1-1.6-3.7" /><path d="M13 3v2.6h-2.6" /></svg>
                  {uiText("Retry from here")}</button>
              </span>}
            </div>
            <span className="ap__aside">
              {editable
                ? <button type="button" className="ap__remove" aria-label={uiText("Remove step {0}: {1}", [index + 1, step.title])} onClick={() => removeStep(step.id)}>
                  <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" /></svg>
                </button>
                : step.state === "active" ? <span className="ap__time" aria-hidden="true">{uiText(formatStepTime(stepMs))}</span>
                : step.state === "done" && step.tookMs !== undefined ? <span className="ap__time ap__time--done"><span className="ap__sr">{uiText("took ")}</span>{uiText(formatStepTime(step.tookMs))}</span> : null}
            </span>
            <span className="ap__rail" aria-hidden="true" />
          </li>;
        })}
      </ol>
      <div className="ap__tail" inert={!editable ? true : undefined}>
        <div className="ap__tail-inner">
          <label className="ap__add">
            <span className="ap__add-icon" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M8 4.5v7M4.5 8h7" /></svg></span>
            <input
              ref={addField}
              placeholder={uiText("Add step")}
              aria-label={uiText("Add a step at the end")}
              enterKeyHint="done"
              value={adding}
              onChange={event => setAdding(event.target.value)}
              onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); addStep(); } else if (event.key === "Escape") setAdding(""); }}
            />
          </label>
        </div>
      </div>
      <div className="ap__foot" data-phase={plan.phase} key={plan.phase}>
        {plan.phase === "draft" && <>
          <span className="ap__hint" aria-hidden="true">{uiText("Drag to reorder · double-click to rename")}</span>
          <span className="ap__actions">
            <button type="button" className="ap__btn ap__btn--secondary" onClick={() => { dispatch({ type: "cancel" }); setAnnouncement("Changes discarded"); }}>{uiText("Cancel")}</button>
            <button type="button" className="ap__btn ap__btn--primary" disabled={total === 0} onClick={run}>
              {uiText("Run plan")}<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5.5 3.8v8.4L12 8z" /></svg>
            </button>
          </span>
        </>}
        {plan.phase === "running" && <>
          <span className="ap__status">
            <span className="ap__status-icon" aria-hidden="true"><Spinner /></span>
            <span className="ap__status-label ap__shimmer" data-text={`Running · ${position} of ${total}`}>{uiText("Running · ")}{uiText(position)} {uiText(" of ")}{uiText(total)}</span>
          </span>
          <span className="ap__elapsed" aria-hidden="true">{uiText(elapsedLabel)}</span>
        </>}
        {plan.phase === "failed" && <span className="ap__status">
          <span className="ap__status-icon" aria-hidden="true"><svg viewBox="0 0 16 16" className="ap__badge"><circle cx="8" cy="8" r="7" /><path d="M8 4.8v3.8M8 11.2h.01" /></svg></span>
          <span className="ap__status-label" data-text={`Stopped · step ${failedIndex + 1} failed`}>{uiText("Stopped · step ")}{uiText(failedIndex + 1)} {uiText(" failed")}</span>
        </span>}
        {plan.phase === "done" && <>
          <span className="ap__status">
            <span className="ap__status-icon" aria-hidden="true"><svg viewBox="0 0 16 16" className="ap__badge"><circle cx="8" cy="8" r="7" /><path d="M5.2 8.2 7.1 10l3.7-4" pathLength="1" className="ap__draw" /></svg></span>
            <span className="ap__status-label" data-text={`Done in ${elapsedLabel}`}>{uiText("Done in ")}{uiText(elapsedLabel)}</span>
          </span>
          <span className="ap__actions">
            <button type="button" className="ap__btn ap__btn--secondary ap__again" onClick={reopen}>
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13 8a5 5 0 1 1-1.6-3.7" /><path d="M13 3v2.6h-2.6" /></svg>
              {uiText("Run again")}</button>
          </span>
        </>}
      </div>
      <p className="ap__sr" role="status" aria-live="polite">{uiText(liveText)}</p>
    </section>
  </div>;
}

/** The plan card for invoices: draft -> review -> send (unpaid) -> wait -> record the payment (paid). */
export function InvoicePlan({ title = invoiceTitle, steps = defaultInvoiceSteps, ...rest }: Partial<AgentPlanProps>): ReactNode {
  const { t: uiText } = useWorkspaceI18n();
  return <AgentPlan
    title={uiText(title)}
    steps={steps}
    badge={list => { const status: InvoiceStatus = invoiceStatusOf(list); return { label: invoiceStatusLabels[status], tone: status }; }}
    {...rest}
  />;
}
