import { corruptionSpans } from "../corruption-span.ts";
import type { VietnameseModel } from "../predict.ts";
import { toAscii } from "../geo/vn-text.ts";
import type { CollateralToken } from "./recover.ts";

/**
 * FORCE_NO_QUESTION_MARK, last stage: every `?` still standing in a text that is not a number, a code or a real question gets a documented outcome.
 * A word the file's own clean text can predict is written (`forced_guess`: the best choice, never verified); one nothing can predict loses its placeholder
 * (`fallback_lossy`: nothing is invented, and the report says so). A `?` inside a number or a code is an anchor and stays (`blocked_protected_anchor`).
 */
export interface Completion { value: string; tokens: CollateralToken[] }
export function completeRemaining(text: string, model?: VietnameseModel): Completion {
  if (!text.includes("?")) return { value: text, tokens: [] };
  const punctuation = corruptionSpans(text).filter(span => span.kind === "suspected_punctuation");
  const isPunct = (at: number) => punctuation.some(span => at >= span.start && at < span.end);
  const guesses = new Map<number, { target: string }>();
  if (model && model.size && text === text.normalize("NFC")) for (const p of model.predict(text)) if (p.broken && p.target && !p.fallback && !p.noSpelling && p.target.length === p.text.length) guesses.set(p.start, { target: toAscii(p.target) });
  const tokens: CollateralToken[] = [], edits: { start: number; end: number; to: string }[] = [];
  for (const match of text.matchAll(/[\p{L}\p{M}\d?]+/gu)) {
    let start = match.index!, end = start + match[0].length;
    while (end > start && text[end - 1] === "?" && isPunct(end - 1)) end--;
    while (start < end && text[start] === "?" && isPunct(start)) start++;
    const word = text.slice(start, end);
    if (!word.includes("?")) continue;
    const base = { start, end, original: word, margin: 0, tier: "low" as const, domain: "unknown" as const, phraseSize: 0, variableLength: false };
    if (/\d/.test(word)) { tokens.push({ ...base, accented: word, ascii: word, status: "blocked_protected_anchor", applied: false, evidence: ["digits and ? in one word: a code or number is never completed"] }); continue; }
    const guess = guesses.get(start);
    if (guess && guess.target.length === word.length) { edits.push({ start, end, to: guess.target }); tokens.push({ ...base, accented: guess.target, ascii: guess.target, status: "forced_guess", applied: true, evidence: ["best word of the file's own clean text; no ontology phrase"] }); continue; }
    const lossy = word.replace(/\?/g, "");
    edits.push({ start, end, to: lossy });
    tokens.push({ ...base, accented: lossy, ascii: lossy, status: "fallback_lossy", applied: true, evidence: ["no evidence fits: the placeholder is dropped, nothing is invented"] });
  }
  let value = text;
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    if (edit.to) { value = value.slice(0, edit.start) + edit.to + value.slice(edit.end); continue; }
    value = value.slice(0, edit.start).replace(/ +$/, "") + value.slice(edit.end).replace(/^ +(?=[,;.])/, "");
  }
  return { value, tokens };
}
