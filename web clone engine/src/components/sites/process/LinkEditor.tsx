"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useEffect, useId, useRef } from "react";
import { Hourglass, Minus, Plus, Repeat, Trash2, X } from "lucide-react";
import { LIMITS } from "./process-model";
import type { LinkKind, ProcessLink } from "./process-model";

export interface LinkEditorProps {
  link: ProcessLink;
  kind: LinkKind;
  fromName: string;
  toName: string;
  /** Edits are refused while a run is active: the plan must not change under it. */
  locked: boolean;
  onChange: (change: Partial<Pick<ProcessLink, "label" | "rounds">>) => void;
  onRemove: () => void;
  onClose: () => void;
}

/**
 * What a connection means and the two things the person can set on it: for a loop how many rounds it goes around at most, and
 * a short label. A floating card next to the connection; Escape closes it.
 */
export function LinkEditor({ link, kind, fromName, toName, locked, onChange, onRemove, onClose }: LinkEditorProps) {
  const { t: uiText } = useWorkspaceI18n();
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const rounds = link.rounds ?? 2;
  useEffect(() => { root.current?.querySelector<HTMLElement>("button, input")?.focus({ preventScroll: true }); }, [link.id]);
  return <div className="pmap__editor" ref={root} role="dialog" aria-label={uiText("Connection from {0} to {1}", [fromName, toName])} data-kind={kind}
    onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }} onPointerDown={event => event.stopPropagation()}>
    <div className="pmap__editor-head">
      <span className="pmap__editor-icon">{kind === "loop" ? <Repeat size={14} /> : <Hourglass size={14} />}</span>
      <span className="pmap__editor-title"><strong>{uiText(fromName)}</strong> → <strong>{uiText(toName)}</strong></span>
      <button type="button" className="proc-icon-button" aria-label={uiText("Close connection")} onClick={onClose}><X size={14} /></button>
    </div>
    <p className="pmap__editor-text">
      {kind === "loop"
        ? <>{uiText("When ")}{uiText(fromName)} {uiText(" has finished, the blocks from ")}{uiText(toName)} {uiText(" down to ")}{uiText(fromName)} {uiText(" run again. It stops after the round limit, or when a block fails or is stopped.")}</>
        : <>{uiText(toName)} {uiText(" starts only after ")}{uiText(fromName)} {uiText(" has finished, as well as after the block it hangs under.")}</>}
    </p>
    {kind === "loop" && <div className="pmap__editor-row">
      <span id={`${id}-rounds`}>{uiText("Go around at most")}</span>
      <span className="pmap__stepper" role="group" aria-labelledby={`${id}-rounds`}>
        <button type="button" aria-label={uiText("Fewer rounds")} disabled={locked || rounds <= 2} onClick={() => onChange({ rounds: rounds - 1 })}><Minus size={13} /></button>
        <output aria-live="polite">{uiText(rounds)}×</output>
        <button type="button" aria-label={uiText("More rounds")} disabled={locked || rounds >= LIMITS.rounds} onClick={() => onChange({ rounds: rounds + 1 })}><Plus size={13} /></button>
      </span>
    </div>}
    <label className="pmap__editor-row pmap__editor-label"><span>{uiText("Label")}</span>
      <input className="proc-input" value={link.label ?? ""} maxLength={LIMITS.label} placeholder={uiText(kind === "loop" ? uiText("For example: until it ships") : uiText("Optional"))} disabled={locked} onChange={event => onChange({ label: event.target.value })} /></label>
    <div className="pmap__editor-actions">
      <button type="button" className="proc-button proc-button--small proc-button--danger" disabled={locked} onClick={onRemove}><Trash2 size={13} />{uiText("Remove connection")}</button>
    </div>
    {locked && <p className="pmap__editor-text">{uiText("Stop the run to change connections.")}</p>}
  </div>;
}
