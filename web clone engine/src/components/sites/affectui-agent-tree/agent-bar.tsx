"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import { MenuSurface } from "@/components/interaction/MenuSurface";
import type { ReactNode } from "react";
import { agentsWith, dollars, totalsOf, type TreeAgent } from "./tree-model";
import { Chevron, Spark, StatusGlyph } from "./tree-marks";

export type ResolveAction = "approve" | "reject" | "retry" | "dismiss";

export interface AgentBarProps {
  root: TreeAgent;
  title?: string;
  /** What an agent is called, singular and plural: ["task", "tasks"] for a plan. */
  noun?: readonly [string, string];
  formatCost?: (amount: number) => string;
  showCost?: boolean;
  /** An answer from the "needs you" or "failed" window. Without it the windows only show what is wrong. */
  onResolve?: (agent: TreeAgent, action: ResolveAction) => void;
  /** Controls beside the title, for example a Run button. */
  extra?: ReactNode;
  /** A host can supply a richer permission review surface instead of the compact waiting popover. */
  onReviewWaiting?: () => void;
  /** A control at the very end of the bar, after the cost (the Process page puts its activity toggle here). */
  trailing?: ReactNode;
}

/**
 * The bar of the Agent Tree and of the Process map: the title and the whole run in numbers (agents, running, needs you,
 * failed, cost). "Needs you" and "failed" open a small window to deal with them: the first answer is focused, Esc closes
 * it and gives the focus back to the button.
 */
export function AgentBar({ root, title = "Agents", noun = ["agent", "agents"], formatCost = dollars, showCost = true, onResolve, extra, onReviewWaiting, trailing }: AgentBarProps) {
  const { t: uiText } = useWorkspaceI18n();
  const [one, many] = noun;
  const ids = useId();
  const totals = totalsOf(root);
  const [open, setOpen] = useState<"waiting" | "failed" | null>(null);
  const waitingAgents = agentsWith(root, "waiting");
  const failedAgents = agentsWith(root, "failed");
  const windowKind = open === "waiting" && waitingAgents.length ? "waiting" : open === "failed" && failedAgents.length ? "failed" : null;
  const windowAgents = windowKind === "waiting" ? waitingAgents : windowKind === "failed" ? failedAgents : [];
  const pop = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!windowKind) return;
    pop.current?.querySelector<HTMLButtonElement>(".agt__btn--primary")?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!pop.current?.contains(target) && !bar.current?.contains(target)) setOpen(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault(); event.stopPropagation();
      bar.current?.querySelector<HTMLButtonElement>(`[data-kind="${windowKind}"]`)?.focus({ preventScroll: true });
      setOpen(null);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape, true);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape, true); };
  }, [windowKind]);

  const announce = `${totals.agents} ${totals.agents === 1 ? one : many}, ${totals.running} running${totals.waiting ? `, ${totals.waiting} ${totals.waiting === 1 ? "needs" : "need"} you` : ""}${totals.failed ? `, ${totals.failed} failed` : ""}`;
  return <div className="agt__bar" ref={bar}>
    <span className="agt__spark"><Spark /></span>
    <span className="agt__title">{uiText(title)}</span>
    {extra && <span className="agt__extra">{uiText(extra)}</span>}
    <span className="agt__sum">
      <span>{uiText(totals.agents)} {uiText(totals.agents === 1 ? one : many)}</span>
      {totals.running > 0 && <span className="agt__sum-run">{uiText(totals.running)} {uiText(" running")}</span>}
      {totals.waiting > 0 && <button type="button" className="agt__sum-btn" data-kind="waiting" aria-expanded={onReviewWaiting ? undefined : windowKind === "waiting"} aria-haspopup="dialog" aria-controls={windowKind === "waiting" ? `${ids}-window` : undefined} onClick={() => { if (onReviewWaiting) { setOpen(null); onReviewWaiting(); } else setOpen(windowKind === "waiting" ? null : "waiting"); }}>{uiText(totals.waiting)} {uiText(totals.waiting === 1 ? uiText("needs") : uiText("need"))} {uiText(" you")}<Chevron /></button>}
      {totals.failed > 0 && <button type="button" className="agt__sum-btn" data-kind="failed" aria-expanded={windowKind === "failed"} aria-haspopup="dialog" aria-controls={windowKind === "failed" ? `${ids}-window` : undefined} onClick={() => setOpen(windowKind === "failed" ? null : "failed")}>{uiText(totals.failed)} {uiText(" failed")}<Chevron /></button>}
      {showCost && <span className="agt__sum-cost"><span className="agt__amount" data-live={totals.live ? "" : undefined}>{uiText(formatCost(totals.cost))}</span></span>}
    </span>
    {trailing && <span className="agt__trailing">{uiText(trailing)}</span>}
    <AnimatePresence>{windowKind && <MenuSurface className="agt__pop" ref={pop} id={`${ids}-window`} role="dialog" aria-label={uiText(windowKind === "waiting" ? uiText("{0}{1} that need you", [many.charAt(0).toUpperCase(), many.slice(1)]) : uiText("Failed {0}", [many]))}>
      {windowAgents.map(agent => <div className="agt__pop-item" key={agent.id}>
        <div className="agt__pop-head"><span className="agt__status" data-status={agent.status}><StatusGlyph status={agent.status} /></span><span className="agt__pop-name">{uiText(agent.name)}</span><span className="agt__pop-task">{uiText(agent.task)}</span></div>
        <p className="agt__pop-text">{uiText(windowKind === "waiting" ? (agent.ask ?? `This ${one} is waiting for your decision.`) : (agent.error ?? `This ${one} failed.`))}</p>
        {onResolve && <div className="agt__pop-actions">
          <button type="button" className="agt__btn" onClick={() => onResolve(agent, windowKind === "waiting" ? "reject" : "dismiss")}>{uiText(windowKind === "waiting" ? uiText("Reject") : uiText("Dismiss"))}</button>
          <button type="button" className="agt__btn agt__btn--primary" onClick={() => onResolve(agent, windowKind === "waiting" ? "approve" : "retry")}>{uiText(windowKind === "waiting" ? uiText("Approve") : uiText("Retry"))}</button>
        </div>}
      </div>)}
    </MenuSurface>}</AnimatePresence>
    <span className="agt__sr" role="status" aria-live="polite">{uiText(announce)}</span>
  </div>;
}
