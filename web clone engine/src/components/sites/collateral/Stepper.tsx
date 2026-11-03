"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

export interface StepSpec<K extends string> { id: K; label: string; badge?: ReactNode }
/** Step tabs with the Usage page's sliding pill. Only steps that are available can be reached; arrow keys skip the others. */
export function Stepper<K extends string>({ steps, current, onChange, available, group, reveal = false }: { steps: StepSpec<K>[]; current: K; onChange: (id: K) => void; available: (id: K) => boolean; group: string; reveal?: boolean }) {
  const { t: uiText } = useWorkspaceI18n();
  const reduced = useReducedMotion();
  return <motion.div className="ui-as-toolbar ui-sb__bar" initial={reveal && !reduced ? { height: 0, opacity: 0 } : false} animate={{ height: "auto", opacity: 1 }} transition={{ duration: reduced ? 0 : .46, ease: [.22, 1, .36, 1] }}><div className="ui-as-tabs" role="tablist" aria-label={uiText("Steps")} onKeyDown={event => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const enabled = steps.map(step => step.id).filter(available);
    const at = enabled.indexOf(current);
    const next = enabled[event.key === "Home" ? 0 : event.key === "End" ? enabled.length - 1 : (at + (event.key === "ArrowRight" ? 1 : enabled.length - 1)) % enabled.length];
    onChange(next);
    event.currentTarget.querySelector<HTMLButtonElement>(`[data-step="${next}"]`)?.focus();
  }}>{steps.map((step, index) => <motion.button type="button" key={step.id} id={`${group}-tab-${step.id}`} data-step={step.id} role="tab" className="ui-as-tabs__tab" data-interaction-own={reveal ? "" : undefined} initial={reveal && !reduced ? { opacity: 0, y: 8, filter: "blur(4px)" } : false} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={{ duration: reduced ? 0 : .46, delay: reduced ? 0 : index * .09, ease: [.22, 1, .36, 1] }} aria-selected={current === step.id} aria-controls={`${group}-panel`} aria-disabled={!available(step.id) || undefined} tabIndex={current === step.id ? 0 : -1} onClick={() => available(step.id) && onChange(step.id)}>
    {current === step.id && <motion.span className="settings-tab-pill" layoutId={`${group}-tab`} transition={{ type: "spring", stiffness: 450, damping: 38 }} />}
    <span className="cr-step-num" aria-hidden="true">{index + 1}</span><span>{uiText(step.label)}</span>{step.badge}
  </motion.button>)}</div></motion.div>;
}
