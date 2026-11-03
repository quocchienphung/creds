import { wordsOf, type WordPrediction } from "./predict.ts";

/**
 * What a person just confirmed, as the words the Speculative-decoding replay plays back. Presentation only: it reads the text the file had and
 * the text that was approved, never decides anything, and never touches a value.
 *
 * Each word the file had is the "draft" lane and the word that was approved is the "target" lane. A word that stayed is accepted by the check; a word
 * that changed is the first miss (struck through) and the approved word is written in its place. When the two texts do not have the same number
 * of words they cannot be paired word by word, so the whole cell is one changed word.
 */
export function wordsOfChange(before: string, after: string): WordPrediction[] {
  const was = wordsOf(before), now = wordsOf(after);
  const pair = (text: string, start: number, end: number, target: string, index: number): WordPrediction => {
    const changed = text !== target;
    return { index, text, start, end, broken: changed, draft: text, target, alternatives: [], confident: true, basis: changed ? "context" : "clean", contextSupport: 0, margin: Infinity, fallback: false };
  };
  if (was.length && was.length === now.length) return was.map((word, index) => pair(word.text, word.start, word.end, now[index].text, index));
  const text = before.trim(), start = Math.max(0, before.indexOf(text));
  return [pair(text, start, start + text.length, after.trim(), 0)];
}

/** How many words the approval changed. */
export const changedWords = (before: string, after: string): number => wordsOfChange(before, after).filter(word => word.broken).length;
