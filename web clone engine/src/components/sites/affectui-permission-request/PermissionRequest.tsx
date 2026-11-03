"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useId } from "react";
import type { ReactNode } from "react";
import { Check, LoaderCircle, ShieldCheck, X } from "lucide-react";
import "./permission-request.css";

export interface PermissionItem { id: string; label: string; detail?: string; icon?: ReactNode }
export type PermissionDecision = "approve" | "reject";

/** Independently authored from affectUI's public Clean preview. The Process engine supports single-run grants. */
export function PermissionRequest({ name, avatar, target, reason, items, decision, busy = false, error, preview = false, simulated = false, onDecision, onReset }: {
  name: string; avatar?: ReactNode; target: string; reason: string; items: PermissionItem[];
  decision?: PermissionDecision; busy?: boolean; error?: string; preview?: boolean; simulated?: boolean;
  onDecision: (decision: PermissionDecision) => void; onReset?: () => void;
}) {
  const { t: uiText } = useWorkspaceI18n();
  const id = useId();
  return <div className="permission-request" data-decision={decision} data-preview={preview ? "" : undefined}
    role={decision ? "status" : preview ? "group" : "dialog"} aria-modal={!decision && !preview ? false : undefined}
    aria-labelledby={`${id}-title`} aria-describedby={!decision ? `${id}-reason` : undefined} aria-busy={busy} tabIndex={-1}
    onKeyDown={event => {
      if (decision || busy || event.repeat) return;
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onDecision("reject"); }
      if (event.key === "Enter" && event.target === event.currentTarget) { event.preventDefault(); onDecision("approve"); }
    }}>
    {decision ? <div className="permission-request__resolved">
      <span className="permission-request__result-icon" aria-hidden="true">{decision === "approve" ? <Check size={14} /> : <X size={14} />}</span>
      <span id={`${id}-title`}><strong>{uiText(decision === "approve" ? uiText("Allowed just once") : uiText("Denied"))}</strong><span className="permission-request__result-name"> · {name}</span></span>
      {onReset && <button type="button" className="permission-request__text-button" onClick={onReset}>{uiText("Try again")}</button>}
    </div> : <>
      <header className="permission-request__head" data-panel-reveal>
        <span className="permission-request__avatar" aria-hidden="true">{uiText(avatar ?? name.slice(0, 2).toUpperCase())}</span>
        <div className="permission-request__heading"><span id={`${id}-title`}><b>{name}</b> {uiText(" wants to ")}<b>{uiText("run this block")}</b></span><span className="permission-request__target">{uiText(target)}</span></div>
        <span className="permission-request__badge"><ShieldCheck size={12} aria-hidden="true" />{uiText("Ask first")}</span>
      </header>
      <p id={`${id}-reason`} className="permission-request__reason" data-panel-reveal>{uiText(reason)}</p>
      <section className="permission-request__preview" aria-labelledby={`${id}-what`} data-panel-reveal>
        <h4 id={`${id}-what`}>{uiText("What will happen ")}<span>{uiText(items.length)}</span></h4>
        <ul>{items.map(item => <li key={item.id}>
          <span className="permission-request__item-icon" aria-hidden="true">{item.icon ?? <ShieldCheck size={16} />}</span>
          <span className="permission-request__item-label">{uiText(item.label)}</span>{item.detail && <span className="permission-request__meta">{uiText(item.detail)}</span>}
        </li>)}</ul>
      </section>
      <footer className="permission-request__answer" data-panel-reveal>
        <div className="permission-request__scope"><span><ShieldCheck size={13} aria-hidden="true" />{uiText("Just once")}</span><small>{uiText("Ask again next run")}</small></div>
        <p className="permission-request__note">{uiText(preview ? uiText("Preview only. These buttons won’t start a run.") : simulated ? uiText("Simulation only. No model or external tool is called.") : uiText("Allows this block in this run. Other blocks keep their own rules."))}</p>
        {error && <p className="permission-request__error" role="alert">{uiText(error)}</p>}
        <div className="permission-request__buttons">
          <button type="button" className="permission-request__button" disabled={busy} aria-label={uiText("Deny")} onClick={() => onDecision("reject")}>{uiText("Deny")}<kbd aria-hidden="true">{uiText("Esc")}</kbd></button>
          <button type="button" className="permission-request__button permission-request__button--primary" disabled={busy} aria-label={uiText("Allow once")} onClick={() => onDecision("approve")}>{busy ? <><LoaderCircle size={14} className="permission-request__spinner" aria-hidden="true" />{uiText("Sending…")}</> : <>{uiText("Allow once")}<kbd aria-hidden="true">↵</kbd></>}</button>
        </div>
      </footer>
    </>}
  </div>;
}
