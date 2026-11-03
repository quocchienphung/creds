"use client";

import { useId, useRef } from "react";
import { ArrowRight, Check, ChevronDown } from "lucide-react";
import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { applyReviewChoices, type WordPrediction } from "../engine/predict";
import { SpeculativeRun } from "./SpeculativeRun";
import { useLinkedWords } from "./linked-words";
import "./speculative.css";

export interface Prediction { text: string; predictions: WordPrediction[]; modelWords: number }

/** A review workbench: real evidence, explicit choices and a draft the person must approve. */
export function SpeculativePanel({ prediction, loading, picks, onPick, onUse, onRetry }: {
  prediction: Prediction | null; loading: boolean; picks: Record<number, string>;
  onPick: (index: number, text: string) => void; onUse: (value: string) => void; onRetry: () => void;
}) {
  const { t, locale } = useWorkspaceI18n();
  const id = useId();
  const root = useRef<HTMLElement>(null);
  useLinkedWords(root);
  const n = (value: number) => new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US").format(value);
  if (loading) return <section className="sd-card" aria-busy="true" aria-label={t("Suggested corrections")}><p className="sd-status" role="status">{t("Looking for matching words in this workbook…")}</p></section>;
  if (!prediction) return <section className="sd-card"><p className="sd-status" role="status">{t("Suggestions are unavailable. You can still type the correction below.")}</p><button type="button" className="cd-row-toggle" onClick={onRetry}>{t("Try again")}</button></section>;
  const broken = prediction.predictions.filter(word => word.broken);
  if (!broken.length) return null;
  const reading = applyReviewChoices(prediction.text, prediction.predictions, picks);
  const unresolved = broken.filter(word => picks[word.index] === undefined && (!word.confident || !word.target)).length;
  const chosen = (word: WordPrediction) => picks[word.index] ?? (word.confident ? word.target : "");

  return <section ref={root} className="sd-card" aria-labelledby={`${id}-title`} data-phase="done">
    <header className="sd-header"><div><h4 className="sd-title" id={`${id}-title`}>{t("Suggested corrections")}</h4><p className="sd-status">{t("Choose a word or type your own. Check uncertain words before approving.")}</p></div><span className="sd-count">{t(broken.length === 1 ? "1 word to check" : "{0} words to check", [broken.length])}</span></header>
    <SpeculativeRun predictions={prediction.predictions} picks={picks} text={prediction.text} />
    <div className="sd-tablehead" aria-hidden="true"><span>{t("In the file")}</span><span>{t("Replacement")}</span><span>{t("Evidence")}</span></div>
    <div className="sd-words" aria-label={t("Broken words")}>
      {broken.map(word => <div className="sd-wordrow" key={word.index} data-word-row={word.index} data-unsure={!word.confident || !word.target || undefined}>
        <div className="sd-source"><code className="sd-wordrow__text">{word.text}</code><ArrowRight size={14} aria-hidden="true" /></div>
        <div className="sd-wordrow__choices">
          <div className="sd-wordrow__chips" role="group" aria-label={t("Candidates for {0}", [word.text])}>
            {word.alternatives.map(alt => <button type="button" key={alt.text} className="sd-alt" data-pick-chip={word.index} aria-pressed={chosen(word) === alt.text} onClick={() => onPick(word.index, alt.text)} title={t("{0} times in the file", [n(alt.support)])}>{chosen(word) === alt.text && <Check size={12} aria-hidden="true" />}{alt.text}<small>{n(alt.support)}×</small></button>)}
            <button type="button" className="sd-keep" data-pick-chip={word.index} aria-pressed={picks[word.index] === word.text} onClick={() => onPick(word.index, word.text)}>{t("Keep original")}</button>
            <details className="sd-manual" open={!word.alternatives.length || undefined}><summary>{t("Type another word")}</summary><label><span className="sr-only">{t("Your correction for {0}", [word.text])}</span><input type="text" className="ui-sb-input" aria-label={t("Your correction for {0}", [word.text])} placeholder={t("Or type the correct word…")} value={picks[word.index] !== undefined && !word.alternatives.some(alt => alt.text === picks[word.index]) && picks[word.index] !== word.text ? picks[word.index] : ""} onChange={event => onPick(word.index, event.target.value)} spellCheck={false} /></label></details>
          </div>
        </div>
        <div className="sd-evidence"><span className="sd-flag" data-clear={word.confident || undefined}>{picks[word.index] !== undefined ? t("Your choice") : !word.target ? t("No match in this file") : word.confident ? t("Supported by this file") : t("Needs your review")}</span><small>{picks[word.index] !== undefined ? picks[word.index] === word.text ? t("Original retained") : word.alternatives.some(alt => alt.text === picks[word.index]) ? t("Selected from workbook matches") : t("Entered manually") : word.target ? word.basis === "context" ? (word.contextSupport ? t("Seen {0}× next to these words in this workbook", [n(word.contextSupport)]) : t("Matches the surrounding words")) : t("Based on word frequency") : t("Type a correction or leave it for later")}</small></div>
      </div>)}
    </div>
    <p className="sd-keys" aria-hidden="true"><span><kbd>1</kbd>–<kbd>4</kbd> {t("choose a word")}</span><span><kbd>↑</kbd> <kbd>↓</kbd> {t("move between words")}</span><span>{t("Click a word in the answer to jump to it")}</span></p>
    <footer className="sd-use"><div><button type="button" className="ui-button" data-variant="secondary" data-size="sm" disabled={reading === prediction.text} onClick={() => onUse(reading)}><span className="ui-button__label">{t("Use this reading")}</span><ArrowRight size={14} aria-hidden="true" /></button><span className="sd-note" role="status">{unresolved ? t("{0} words still need your choice", [unresolved]) : t("Ready to copy into the final value")}</span></div><small>{t("This fills the draft. Approve below to save the change.")}</small></footer>
    <details className="sd-method"><summary>{t("Where do these suggestions come from?")}<ChevronDown size={13} aria-hidden="true" /></summary><p>{t("Matching words and phrases in this workbook. Counts show occurrences, not accuracy. Uncertain words stay unchanged until you choose. No file content leaves this browser.")}</p></details>
  </section>;
}
