"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useId, useMemo, useRef, useState } from "react";
import { Check, CircleAlert, ShieldCheck } from "lucide-react";
import { ActionButton } from "./ui/ActionButton";
import { draftOf, inspectDraft, isDirty, type SkillDraft } from "./skill-edit";
import type { SkillRecord, SkillTarget } from "./skill-model";
import "./skill-edit.css";

const guardrailLabels = { citeSources: "Cite sources", verifyBeforeAnswer: "Verify before answering", askWhenUncertain: "Ask when uncertain" } as const;
const size = (bytes: number) => (bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`);

/**
 * Edit a stored skill: the SKILL.md text (its header gives the name and description), where it runs and what the agent is asked to do. Save changes stores
 * the new text with a fresh checksum and the button stays on Saving until the workspace has really written it.
 */
export function SkillEditor({ skill, onSave, onClose }: { skill: SkillRecord; onSave: (draft: SkillDraft) => Promise<void>; onClose: () => void }) {
  const { t: uiText } = useWorkspaceI18n();
  const id = useId();
  const [draft, setDraft] = useState<SkillDraft>(() => draftOf(skill));
  const [error, setError] = useState("");
  const slot = useRef<HTMLDivElement>(null);
  const inspected = useMemo(() => inspectDraft(draft), [draft]);
  const dirty = isDirty(skill, draft);
  const canSave = dirty && inspected.ok;
  const change = (patch: Partial<SkillDraft>) => { setDraft(current => ({ ...current, ...patch })); setError(""); };

  return <div className="sk-editor" data-dirty={dirty || undefined}>
    <label htmlFor={`${id}-text`} className="sk-editor__label">{uiText("SKILL.md ")}<span>{uiText("the header gives the name and description")}</span></label>
    <textarea id={`${id}-text`} className="sk-editor__text" spellCheck={false} value={draft.instructions} aria-invalid={!inspected.ok} aria-describedby={`${id}-status`} onChange={event => change({ instructions: event.target.value })}
      onKeyDown={event => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); slot.current?.querySelector<HTMLButtonElement>("button.ab")?.click(); }
        if (event.key === "Escape") { event.stopPropagation(); onClose(); }
      }} />
    <p id={`${id}-status`} className="sk-editor__status" data-ok={inspected.ok || undefined} role="status">
      {inspected.ok ? <><ShieldCheck size={13} aria-hidden="true" /><span><strong>{uiText(inspected.name)}</strong> · {uiText(size(inspected.bytes))} {uiText(" · the checksum is recalculated when you save")}</span></> : <><CircleAlert size={13} aria-hidden="true" /><span>{uiText(inspected.error)}</span></>}
    </p>
    <div className="sk-editor__options">
      <div className="sk-editor__group" role="group" aria-label={uiText("Where the skill runs")}>{(["Local AI", "AI Agent"] as SkillTarget[]).map(target => <button key={target} type="button" aria-pressed={draft.target === target} onClick={() => change({ target })}>{uiText(target)}</button>)}</div>
      <div className="sk-guardrails">{(Object.keys(guardrailLabels) as (keyof typeof guardrailLabels)[]).map(key => <label key={key}><input type="checkbox" checked={draft.guardrails[key]} onChange={event => change({ guardrails: { ...draft.guardrails, [key]: event.target.checked } })} /><Check size={11} aria-hidden="true" /><span>{uiText(guardrailLabels[key])}</span></label>)}</div>
    </div>
    {error && <div className="sk-editor__error" role="alert"><CircleAlert size={14} aria-hidden="true" /><span>{uiText(error)}</span></div>}
    <div className="sk-editor__foot">
      <span className="sk-editor__dirty" aria-live="polite">{uiText(dirty ? uiText("Unsaved changes") : uiText("Everything is saved"))}</span>
      <div className="sk-editor__buttons" ref={slot}>
        <button type="button" className="sk-secondary" onClick={onClose}>{uiText(dirty ? uiText("Discard") : uiText("Done"))}</button>
        <ActionButton size="sm" label={uiText("Save changes")} disabled={!canSave} onAction={() => onSave(draft)} onActionError={failure => setError(failure instanceof Error ? failure.message : "Could not save the changes.")} />
      </div>
    </div>
    <p className="sk-editor__note">{uiText("Changes stay in this workspace")}{skill.sourceUrl ? uiText("; the original source is not touched") : ""}{uiText(". Supporting files are kept as they are.")}</p>
  </div>;
}
