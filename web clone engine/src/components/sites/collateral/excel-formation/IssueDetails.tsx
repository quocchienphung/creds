"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useEffect, useId, useState } from "react";
import { motion } from "motion/react";
import { RotateCcw, ShieldCheck, X } from "lucide-react";
import { ActionButton } from "../../skilled/ui/ActionButton";
import { SpeculativePanel, type Prediction } from "./gallery/SpeculativePanel";
import { Specimen } from "./gallery/Specimen";
import type { Issue, IssueStatus } from "./engine/types";
import type { IssueState } from "./engine/review";
import type { RowContext } from "../engine/protocol";
import type { CollateralEngine } from "../useCollateralEngine";
import { DuplicateRepairDialog } from "./DuplicateRepairDialog";
import type { DuplicatePlan } from "./engine/duplicate-repairs";
import { matchesMask } from "./engine/corruption-span";
import { CATEGORY_LABEL, SEVERITY_LABEL, STATUS_LABEL, cellRef, issueReason, severityTone, statusTone } from "../labels";

export type Variant = "original" | "suggested" | "new";
export interface Twin { issue: Issue; sameText: boolean }

/** Replace each suspicious word of `value` by the candidate the reviewer picked for it; words without a pick stay as they are. */
export function composeFromPicks(value: string, tokens: NonNullable<Issue["tokens"]>, picks: Record<number, string>): string {
  let out = "", at = 0;
  tokens.forEach((token, index) => { out += value.slice(at, token.start) + (picks[index] ?? value.slice(token.start, token.end)); at = token.end; });
  return out + value.slice(at);
}

/**
 * The correction block below the file preview: what is wrong, the original/suggested/new variants (a segmented picker whose highlight glides), per-word
 * candidates, the editor and the reviewer's decisions. Nothing here applies a suggestion by itself.
 */
export function IssueDetails({ issue, status, state, current, variant, onVariant, draft, onDraft, twin, engine, notify, onApproved, onSkip }: {
  issue: Issue; status: IssueStatus; state?: IssueState; current: string; variant: Variant; onVariant: (variant: Variant) => void; draft: string; onDraft: (value: string) => void;
  twin?: Twin; engine: CollateralEngine; notify: (message: string) => void; onApproved: () => void; onSkip?: () => void;
}) {
  const { t: uiText } = useWorkspaceI18n();
  const id = useId();
  const suggestion = issue.suggestions?.[0] ?? (issue.proposedValue !== undefined ? { value: issue.proposedValue, basis: "mechanical" as const, support: 0 } : undefined);
  const [picks, setPicks] = useState<Record<number, string>>({});
  const [alsoTwin, setAlsoTwin] = useState(true);
  const [excepting, setExcepting] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState(false);
  const [rowOpen, setRowOpen] = useState(false);
  const [context, setContext] = useState<RowContext | null>(null);
  const [groupSize, setGroupSize] = useState(0);
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [predictionPending, setPredictionPending] = useState(issue.category === "QUESTION_MARK_IN_WORD");
  const [predictionAttempt, setPredictionAttempt] = useState(0);
  const [approvalEpoch, setApprovalEpoch] = useState(0);
  const [duplicate, setDuplicate] = useState<{ plan: DuplicatePlan; value: string; source: "typed" | "suggestion" | "fix"; includeTwin: boolean } | null>(null);
  const [predictPicks, setPredictPicks] = useState<Record<number, string>>({});
  const wantsPrediction = issue.category === "QUESTION_MARK_IN_WORD";
  const variants: Variant[] = suggestion ? ["original", "suggested", "new"] : ["original", "new"];
  const label: Record<Variant, string> = { original: "Original", suggested: "Suggested", new: "New value" };

  // The parent keys this component by the issue, so every issue starts with fresh local state.
  // The guess for the broken words of this cell. It is asked for once per issue (this component is keyed by the issue) and never applied by itself.
  const { predict } = engine;
  useEffect(() => {
    if (!wantsPrediction) return;
    let alive = true;
    void predict(issue.row, issue.col).then(result => { if (alive) { setPrediction(result ?? null); setPredictionPending(false); } }).catch(() => { if (alive) setPredictionPending(false); });
    return () => { alive = false; };
  }, [wantsPrediction, issue.row, issue.col, predict, predictionAttempt]);
  useEffect(() => {
    let alive = true;
    if (issue.category === "CONFLICTING_DUPLICATE") void engine.groupRows(issue.id).then(rows => { if (alive) setGroupSize(rows.length); });
    return () => { alive = false; };
  }, [issue.id, issue.category, engine]);
  useEffect(() => {
    let alive = true;
    if (rowOpen) void engine.rowContext(issue.row).then(result => { if (alive) setContext(result); });
    return () => { alive = false; };
  }, [rowOpen, issue.row, engine, status]);

  const decided = status === "verified" || status === "accepted_exception";
  const changed = draft !== current;
  const twinWritable = !!twin && twin.sameText && issue.category !== "DESCRIPTION_CONFLICT";

  async function approveSingle(value: string, source: "typed" | "suggestion" | "fix", includeTwin: boolean): Promise<boolean> {
    const edits = [{ row: issue.row, col: issue.col, value, source }, ...(twinWritable && includeTwin ? [{ row: twin!.issue.row, col: twin!.issue.col, value, source: "twin" as const }] : [])];
    const response = await engine.edit(edits);
    if (response?.type !== "view") return false;
    notify(uiText("Value approved for {0}", [cellRef(issue)]));
    setDuplicate(null);
    onApproved();
    return true;
  }
  async function approve(value = draft, source: "typed" | "suggestion" | "fix" = "typed") {
    if (issue.category === "QUESTION_MARK_IN_WORD" && matchesMask(issue.originalValue, value)) {
      const plan = await engine.duplicatePlan(issue.id, twinWritable && alsoTwin);
      if (plan?.canPropagate) { setDuplicate({ plan, value, source, includeTwin: twinWritable && alsoTwin }); return; }
    }
    await approveSingle(value, source, alsoTwin);
  }
  async function submitException() {
    if (!(await engine.accept(issue.id, reason))) { setReasonError(true); return; }
    notify(uiText("Exception recorded for {0}", [cellRef(issue)]));
    setExcepting(false);
    onApproved();
  }
  const pick = (index: number, text: string) => {
    const next = { ...picks, [index]: text };
    setPicks(next);
    onDraft(composeFromPicks(issue.originalValue, issue.tokens!, next));
    onVariant("new");
  };

  return <div className="cd-root" data-status={status}>
    <div className="cr-section-heading"><span className="cr-step-number" aria-hidden="true">02</span><div><h3>{uiText("Review the correction")}</h3><p>{uiText("Compare the original, then choose or type a replacement.")}</p></div></div>
    <header className="cd-header">
      <div className="cd-title"><h3>{issue.field}</h3><span className="cd-ref">{cellRef(issue)} · {uiText("Row {0}", [issue.row])}</span></div>
      <div className="cd-pills"><span className="ui-sb-pill" data-tone={severityTone(issue.severity)}>{uiText(SEVERITY_LABEL[issue.severity])}</span><span className="ui-sb-pill" data-tone={statusTone(status)}>{uiText(STATUS_LABEL[status])}</span></div>
    </header>
    <p className="cd-category">{uiText(CATEGORY_LABEL[issue.category])}</p>
    <p className="cd-reason">{issueReason(issue, uiText)}</p>
    <div className="cd-original"><span className="cd-label">{uiText("Original text")}</span><Specimen value={issue.originalValue} marks={issue.marks} empty={uiText("(empty)")} /></div>

    {issue.category === "DESCRIPTION_CONFLICT" && issue.related?.[0] && <dl className="cd-compare" aria-label={uiText("Both descriptions")}>
      <div><dt>{issue.field}</dt><dd>{issue.originalValue || <i>{uiText("(empty)")}</i>}</dd></div>
      <div><dt>{uiText("Other column")}</dt><dd>{issue.related[0].value || <i>{uiText("(empty)")}</i>}</dd></div>
    </dl>}

    <div className="cd-picker" role="group" aria-labelledby={`${id}-v`}>
      <span className="cd-label" id={`${id}-v`}>{uiText("Preview in file")} <b>{uiText(label[variant])}</b></span>
      <div className="ui-seg" data-size="sm"><div className="ui-seg__scroller"><div className="ui-seg__track" role="radiogroup" aria-labelledby={`${id}-v`} onKeyDown={event => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        const next = variants[(variants.indexOf(variant) + (event.key === "ArrowRight" ? 1 : variants.length - 1)) % variants.length];
        onVariant(next);
        event.currentTarget.querySelector<HTMLButtonElement>(`[data-variant="${next}"]`)?.focus();
      }}>{variants.map(value => <button type="button" key={value} className="ui-seg__opt" data-variant={value} role="radio" aria-checked={variant === value} data-active={variant === value || undefined} tabIndex={variant === value ? 0 : -1} onClick={() => onVariant(value)}>
        {variant === value && <motion.span className="cr-pill" layoutId={`cd-variant`} transition={{ type: "spring", stiffness: 450, damping: 38 }} />}
        <span className="ui-seg__content"><span className="ui-seg__label"><span className="ui-seg__text">{uiText(label[value])}</span><span className="ui-seg__text ui-seg__text-bold" aria-hidden="true">{uiText(label[value])}</span></span></span>
      </button>)}</div></div></div>
    </div>

    {wantsPrediction && <SpeculativePanel prediction={prediction} loading={predictionPending} picks={predictPicks}
      onRetry={() => { setPredictionPending(true); setPredictionAttempt(value => value + 1); }}
      onPick={(index, text) => setPredictPicks(current => { const next = { ...current }; if (text) next[index] = text; else delete next[index]; return next; })}
      onUse={value => { onDraft(value); onVariant("new"); }} />}
    {wantsPrediction && prediction && !prediction.predictions.some(word => word.broken) && issue.tokens && issue.tokens.length > 0 && <div className="cd-tokens">
      <span className="cd-label">{uiText("Words to fix")}</span>
      {issue.tokens.map((token, index) => <div className="cd-token" key={token.start}>
        <code className="cd-token__text">{token.text}</code>
        {token.candidates.length ? <div className="cd-chips" role="group" aria-label={uiText("Candidates for {0}", [token.text])}>
          {token.candidates.map(candidate => <button type="button" key={candidate.text} className="cd-chip" aria-pressed={picks[index] === candidate.text} onClick={() => pick(index, candidate.text)} title={uiText("{0} clean cells", [candidate.support])}>{candidate.text}<small>{candidate.support}×</small></button>)}
        </div> : <span className="cd-none">{uiText("No match in this column")}</span>}
      </div>)}
    </div>}


    <section className="cd-final" aria-labelledby={`${id}-confirm`}>
    <div className="cr-section-heading"><span className="cr-step-number" aria-hidden="true">03</span><div><h4 id={`${id}-confirm`}>{uiText("Confirm the final value")}</h4><p>{uiText("Read the full text once more. Your changes are saved only when you approve.")}</p></div></div>
    <label className="cd-field" htmlFor={`${id}-draft`}><span className="cd-label">{uiText("New value")}</span>
      <textarea id={`${id}-draft`} className="ui-sb-input cd-textarea" rows={3} spellCheck={false} value={draft} disabled={decided && status === "accepted_exception"}
        onChange={event => { onDraft(event.target.value); onVariant("new"); }}
        aria-describedby={`${id}-draft-hint`}
        onKeyDown={event => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); if (changed && !engine.busy && status !== "accepted_exception") void approve(); } }} />
    </label>
    <p className="cd-draft-hint" id={`${id}-draft-hint`} role="status">{draft.includes("?") && wantsPrediction ? uiText("Some characters are still unresolved. Correct them here or review them later.") : changed ? uiText("Draft only · not saved yet") : uiText("Choose a suggestion above or edit this text directly.")}</p>
    {twinWritable && <label className="cd-check"><input type="checkbox" checked={alsoTwin} onChange={event => setAlsoTwin(event.target.checked)} />{uiText("Also apply to {0} (same text)", [twin!.issue.field])}</label>}

    <div className="cd-actions">
      <ActionButton key={approvalEpoch} size="sm" label={uiText("Approve value")} pendingLabel={uiText("Saving…")} successLabel={uiText("Approved")} resetAfterMs={0} disabled={engine.busy || !changed} onAction={() => approve()} />
      {suggestion && !wantsPrediction && <button type="button" className="ui-button" data-variant="secondary" data-size="sm" disabled={engine.busy} onClick={() => { onDraft(suggestion.value); onVariant("suggested"); }}><span className="ui-button__label">{uiText("Use suggestion")}</span></button>}
      {suggestion && !wantsPrediction && !state?.suggestionRejected && <button type="button" className="ui-button" data-variant="ghost" data-size="sm" disabled={engine.busy} onClick={() => void engine.reject(issue.id)}><span className="ui-button__label">{uiText("Reject suggestion")}</span></button>}
      {(status === "verified" || status === "edited" || status === "accepted_exception") && <button type="button" className="ui-button" data-variant="ghost" data-size="sm" disabled={engine.busy} onClick={() => { if (status === "accepted_exception") void engine.reopen(issue.id); else { onDraft(issue.originalValue); void engine.edit([{ row: issue.row, col: issue.col, value: issue.originalValue }]); } onVariant("original"); }}><span className="ui-button__icon"><RotateCcw size={14} /></span><span className="ui-button__label">{status === "accepted_exception" ? uiText("Remove exception") : uiText("Restore original")}</span></button>}
      {status !== "accepted_exception" && <button type="button" className="ui-button" data-variant="ghost" data-size="sm" aria-expanded={excepting} onClick={() => setExcepting(value => !value)}><span className="ui-button__icon"><ShieldCheck size={15} /></span><span className="ui-button__label">{uiText("Accept as legitimate")}</span></button>}
    </div>
    {onSkip && <button type="button" className="cd-row-toggle cd-skip" disabled={engine.busy} onClick={onSkip}>{uiText("Review later →")}</button>}
    {status === "accepted_exception" && <p className="cd-note"><ShieldCheck size={13} /> {state?.exceptionReason}</p>}
    {status === "edited" && <p className="cd-note cd-warn">{uiText("Still has this problem")}</p>}
    </section>

    {excepting && <form className="cd-exception" onSubmit={event => { event.preventDefault(); void submitException(); }}>
      <label className="cd-label" htmlFor={`${id}-why`}>{uiText("Reason")}</label>
      <input id={`${id}-why`} className="ui-sb-input" autoFocus value={reason} aria-invalid={reasonError} onChange={event => { setReason(event.target.value); setReasonError(false); }} maxLength={240} />
      {reasonError && <p className="cd-note cd-warn" role="alert">{uiText("A reason is required")}</p>}
      <div className="cd-actions"><button type="submit" className="ui-button" data-variant="primary" data-size="sm" disabled={engine.busy}><span className="ui-button__label">{uiText("Record exception")}</span></button><button type="button" className="ui-button" data-variant="ghost" data-size="sm" onClick={() => setExcepting(false)}><X size={14} /><span className="ui-button__label">{uiText("Cancel")}</span></button></div>
    </form>}

    {issue.category === "CONFLICTING_DUPLICATE" && issue.related && <div className="cd-group">
      <span className="cd-label">{uiText("Use one value for all {0} rows", [groupSize || issue.related.length])}</span>
      <div className="cd-chips">{issue.related.map(item => <button type="button" key={item.row + (item.value ?? "")} className="cd-chip" disabled={engine.busy} onClick={() => { void engine.chooseGroup(issue.id, item.value ?? ""); notify(uiText("One value chosen for {0} rows", [groupSize || issue.related!.length])); }}>{item.value || uiText("(empty)")}<small>{uiText("Row {0}", [item.row])}</small></button>)}</div>
    </div>}

    <button type="button" className="cd-row-toggle" aria-expanded={rowOpen} onClick={() => setRowOpen(value => !value)}>{rowOpen ? uiText("Hide row context") : uiText("Show row context")}</button>
    {rowOpen && <dl className="cd-context" aria-label={uiText("Row {0}", [issue.row])}>
      {context?.cells.map(cell => <div key={cell.col}><dt>{cell.header || cell.col}</dt><dd>{cell.value}</dd></div>) ?? <div><dd>{uiText("Loading…")}</dd></div>}
    </dl>}
    {duplicate && <DuplicateRepairDialog plan={duplicate.plan} busy={engine.busy}
      onClose={() => { setDuplicate(null); setApprovalEpoch(epoch => epoch + 1); }}
      onSingle={() => approveSingle(duplicate.value, duplicate.source, duplicate.includeTwin)}
      onAll={async () => {
        const result = await engine.duplicateApply(issue.id, duplicate.value, duplicate.includeTwin);
        if (!result) return false;
        notify(`Đã sửa chung ${result.rows} dòng / ${result.changedCells} ô cùng tài sản.`);
        setDuplicate(null); onApproved(); return true;
      }} />}
  </div>;
}
