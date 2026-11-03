"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useId } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { RunStep } from "./run-types";
import { RunIcon } from "./RunIcon";

export function RunApproval({step,index,decision,onApprove,onDeny}:{step:RunStep;index:number;decision?:"approved"|"denied";onApprove:()=>void;onDeny:()=>void}){
  const { t: uiText } = useWorkspaceI18n();
  const id=useId(),reduce=useReducedMotion();
  const approval=step.approval;
  if(!approval)return null;
  const title=decision ? `${id}-row` : `${id}-title`;
  return <div className="ui-ap ui-as-rise" role="group" aria-labelledby={title} aria-describedby={decision ? undefined : `${id}-desc`} data-status={decision || "pending"} data-label="" data-actions="card">
    <div className="ui-ap__label">{uiText("Step ")}{uiText(index+1)} · {uiText(step.tool)}</div>
    <AnimatePresence mode="wait" initial={false}>{decision ? <motion.div key="resolved" className="ui-ap__card ui-ap__resolved" data-status={decision} tabIndex={-1} initial={{opacity:0,y:4}} animate={{opacity:1,y:0}} transition={{duration:reduce ? 0 : .28}}><span className="ui-ap__mark" aria-hidden="true"><svg viewBox="0 0 16 16">{decision==="approved" ? <path d="M4.2 8.4 6.9 11 11.8 5.6" pathLength="1" /> : <path d="m5.2 5.2 5.6 5.6m0-5.6-5.6 5.6" pathLength="1" />}</svg></span><span className="ui-ap__row-title" id={title}>{uiText(approval.title)}</span><span className="ui-ap__row-status">{uiText(decision==="approved" ? uiText("Approved") : uiText("Denied"))}<span className="ui-ap__row-time"> {uiText(" · just now")}</span></span></motion.div> : <motion.div className="ui-ap__pending" key="pending" exit={{opacity:0,scale:.98}} transition={{duration:reduce ? 0 : .16}}><div className="ui-ap__card"><div className="ui-ap__head"><span className="ui-ap__icon" aria-hidden="true"><RunIcon name="ui-ap__icon" /></span><div className="ui-ap__titles"><h3 className="ui-ap__title" id={title}>{uiText(approval.title)}</h3><p className="ui-ap__desc" id={`${id}-desc`}>{uiText(approval.description)}</p></div><span className="ui-ap__risk" data-risk={approval.risk}><span className="ui-ap__risk-dot" aria-hidden="true" />{uiText(approval.risk[0].toUpperCase()+approval.risk.slice(1))}<span className="ui-ap__risk-word"> {uiText(" risk")}</span></span></div><div className="ui-ap__preview"><dl className="ui-ap__details">{approval.details.map(detail=><div className="ui-ap__detail" key={detail.label}><dt>{uiText(detail.label)}</dt><dd>{uiText(detail.value)}</dd></div>)}</dl></div><div className="ui-ap__foot"><div className="ui-ap__actions"><button type="button" className="ui-ap__btn ui-ap__btn--quiet ui-ap__deny" aria-keyshortcuts="Escape" onClick={onDeny}>{uiText("Deny")}<kbd className="ui-ap__kbd" aria-hidden="true">{uiText("Esc")}</kbd></button><button type="button" className="ui-ap__btn ui-ap__btn--primary ui-ap__approve" aria-keyshortcuts="Meta+Enter Control+Enter" onClick={onApprove}>{uiText("Approve")}<kbd className="ui-ap__kbd" aria-hidden="true">{uiText("Ctrl ↵")}</kbd></button></div></div></div></motion.div>}</AnimatePresence>
    <span className="ui-ap__sr" role="status" aria-live="polite">{uiText(decision ? uiText("{0}: {1}", [decision==="approved" ? "Approved" : "Denied", approval.title]) : "")}</span>
  </div>;
}
