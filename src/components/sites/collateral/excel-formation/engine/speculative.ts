import type { WordPrediction } from "./predict.ts";

/**
 * The run of a speculative-decoding style check over the words of one cell, after UIArc's "Speculative decoding" card: a small draft guesses
 * `k` words ahead, the target checks them all in ONE pass, the words before the first mistake are accepted, the target writes the word at
 * the mistake (or one more word when nothing was wrong) and the guesses after it are thrown away. Pure; the screen only plays it back.
 */
export type ColumnState = "accepted" | "rejected" | "discarded";
export interface Column { index: number; draft: string; target: string; state: ColumnState; broken: boolean }
export interface Pass { number: number; columns: Column[]; accepted: number; /** The word the target wrote in this pass (after the accepted ones). */ written: { index: number; text: string; reason: "correction" | "next" } | null }
export interface OutputWord { index: number; text: string; source: "draft" | "target" }
export interface RunStats {
  words: number; drafted: number; accepted: number; passes: number;
  /** Words per target pass: what speculation buys over the target writing one word at a time. */
  wordsPerPass: number; speedup: number; acceptedPercent: number;
  /** Broken words whose answer the target is confident about. */
  confident: number; broken: number;
}
export interface Run { passes: Pass[]; output: OutputWord[]; stats: RunStats }

export const MIN_DRAFT = 1, MAX_DRAFT = 8, DEFAULT_DRAFT = 4;

export function simulate(predictions: readonly WordPrediction[], draftLength: number = DEFAULT_DRAFT): Run {
  const k = Math.max(MIN_DRAFT, Math.min(MAX_DRAFT, Math.round(draftLength)));
  const passes: Pass[] = [], output: OutputWord[] = [];
  let at = 0, drafted = 0, accepted = 0;
  while (at < predictions.length) {
    const window = predictions.slice(at, at + k);
    const columns: Column[] = [];
    let good = 0, mistake = -1;
    window.forEach((word, offset) => {
      drafted++;
      const same = word.draft === word.target;
      if (mistake >= 0) columns.push({ index: word.index, draft: word.draft, target: word.target, state: "discarded", broken: word.broken });
      else if (same) { good++; accepted++; columns.push({ index: word.index, draft: word.draft, target: word.target, state: "accepted", broken: word.broken }); output.push({ index: word.index, text: word.target, source: "draft" }); }
      else { mistake = offset; columns.push({ index: word.index, draft: word.draft, target: word.target, state: "rejected", broken: word.broken }); }
    });
    // Discarded guesses were never really checked: they do not count as drafted work that was accepted, but they were drafted.
    let written: Pass["written"] = null;
    let consumed = good;
    if (mistake >= 0) { const word = window[mistake]; written = { index: word.index, text: word.target, reason: "correction" }; output.push({ index: word.index, text: word.target, source: "target" }); consumed = mistake + 1; }
    else if (at + good < predictions.length) { const word = predictions[at + good]; written = { index: word.index, text: word.target, reason: "next" }; output.push({ index: word.index, text: word.target, source: "target" }); consumed = good + 1; }
    passes.push({ number: passes.length + 1, columns, accepted: good, written });
    at += Math.max(1, consumed);
  }
  const broken = predictions.filter(word => word.broken);
  return {
    passes, output,
    stats: {
      words: predictions.length, drafted, accepted, passes: passes.length, wordsPerPass: predictions.length ? predictions.length / Math.max(1, passes.length) : 0,
      speedup: predictions.length ? predictions.length / Math.max(1, passes.length) : 1, acceptedPercent: drafted ? Math.round(accepted / drafted * 100) : 0,
      confident: broken.filter(word => word.confident).length, broken: broken.length,
    },
  };
}
/** Without speculation the target writes every word itself: one pass per word. */
export const baseline = (predictions: readonly WordPrediction[]) => ({ passes: predictions.length });
