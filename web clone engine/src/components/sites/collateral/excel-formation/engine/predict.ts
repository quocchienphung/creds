/**
 * Guessing the letter a legacy export replaced by `?`, for Vietnamese text written WITHOUT diacritics.
 *
 * What the data says (measured on the reference workbook, counts only): a `?` stands for exactly one letter (99.8% of broken words hold a single
 * one), and the letters that lose their mark in a no-diacritic export are the vowels and đ. So a broken word is a word of the same length whose
 * other letters match, with a vowel or `d` in the `?` place. The file's own clean text is the training data: no outside dictionary, no model
 * service. Frequency supplies candidates; a bounded phrase decoder uses the words on both sides and Vietnamese syllable shape.
 * A person still approves every change. The old draft field remains for the offline evaluation helpers.
 */
export const FILL_LETTERS = "aeiouyd";
const SENTENCE_START = "\u0002", SENTENCE_END = "\u0003";

export const stripMarks = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");
const EDGE = /^[(),.;:"'\[\]{}]+|[(),.;:"'\[\]{}]+$/g;

export interface Word { text: string; start: number; end: number }
/** Split a cell into words (runs of non-space), with the punctuation at the edges left out of the word and kept in the text. */
export function wordsOf(text: string): Word[] {
  const out: Word[] = [];
  for (const match of text.matchAll(/\S+/g)) {
    const raw = match[0], lead = raw.length - raw.replace(/^[(),.;:"'\[\]{}]+/, "").length;
    const core = raw.replace(EDGE, "");
    if (core === "") continue;
    out.push({ text: core, start: match.index! + lead, end: match.index! + lead + core.length });
  }
  return out;
}

/** Could this be a Vietnamese syllable written without marks? Onset + vowel nucleus + optional final, as Vietnamese spelling allows. Soft evidence only. */
const ONSET = "(?:ngh|ng|nh|ch|gh|gi|kh|ph|qu|th|tr|[bcdghklmnpqrstvx])?";
const NUCLEUS = "(?:uyen|uye|uoi|uou|ieu|yeu|oai|oay|oeo|uai|uay|uya|iao|ia|ie|ua|uo|ue|uu|oa|oe|uy|ui|ai|ay|ao|au|eo|eu|oi|iu|ya|a|e|i|o|u|y)";
const FINAL = "(?:ng|nh|ch|c|m|n|p|t)?";
const SYLLABLE = new RegExp(`^${ONSET}${NUCLEUS}${FINAL}$`);
export const plausibleSyllable = (word: string) => /^[a-z]+$/.test(word) && SYLLABLE.test(word);

const key = (a: string, b: string) => a + "\u0001" + b;

export interface Alternative { text: string; score: number; support: number }
export interface WordPrediction {
  index: number; text: string; start: number; end: number;
  broken: boolean;
  /** The fast guess: the most frequent word that fits. */
  draft: string;
  /** The context-aware answer, which is the one offered. */
  target: string;
  /** Best candidates by the target's score, the answer first. */
  alternatives: Alternative[];
  /** Repeated evidence and a wide score margin, with no candidate pruning. This is not a calibrated probability. */
  confident: boolean;
  /** `none`: no word of the file fits, nothing is offered. */
  basis: "context" | "frequency" | "none" | "clean";
  /** Observed adjacent pairs supporting the chosen spelling, not a probability. */
  contextSupport?: number;
  /** Score gap between the best and the second candidate (Infinity when only one candidate fits). A ranking distance, not a probability. */
  margin?: number;
  /** True when no word of the file fits the vowel/d pool and the candidates came from the open alphabet or digits: never trustworthy. */
  fallback?: boolean;
}

export class VietnameseModel {
  private uni = new Map<string, number>();
  private bi = new Map<string, number>();
  private byLength = new Map<number, string[]>();
  private cache = new Map<string, string[]>();
  private tokens = 0;
  private finished = false;

  /** Learn intact words and adjacent pairs, leaving gaps at damaged words. Marks and case are folded. */
  add(text: string) {
    if (this.finished) return;
    let previous = SENTENCE_START;
    for (const word of wordsOf(stripMarks(text))) {
      const w = word.text.toLowerCase();
      // Keep intact words of damaged cells, but never learn a guessed word or a pair across a gap.
      if (w.includes("?") || w.includes("\ufffd")) { previous = ""; continue; }
      this.uni.set(w, (this.uni.get(w) ?? 0) + 1);
      if (previous) this.bi.set(key(previous, w), (this.bi.get(key(previous, w)) ?? 0) + 1);
      previous = w; this.tokens++;
    }
    if (previous) this.bi.set(key(previous, SENTENCE_END), (this.bi.get(key(previous, SENTENCE_END)) ?? 0) + 1);
  }
  /** Freeze the vocabulary into its length index. Call once, after the last `add`. */
  finish() {
    if (this.finished) return this;
    for (const word of this.uni.keys()) { const list = this.byLength.get(word.length); if (list) list.push(word); else this.byLength.set(word.length, [word]); }
    this.finished = true;
    return this;
  }
  get size() { return this.uni.size; }
  count(word: string) { return this.uni.get(word.toLowerCase()) ?? 0; }

  /** Words that fit a pattern: every `?` is one of `fill` (vowels and d by default), every other letter equal (case folded). */
  candidates(pattern: string, fill: string = FILL_LETTERS): string[] {
    const lower = pattern.toLowerCase();
    const cached = this.cache.get(lower + "\u0001" + fill);
    if (cached) return cached;
    const out: string[] = [];
    for (const word of this.byLength.get(lower.length) ?? []) {
      let ok = true;
      for (let i = 0; i < lower.length; i++) { const want = lower[i]; if (want === "?" ? fill.indexOf(word[i]) < 0 : want !== word[i]) { ok = false; break; } }
      if (ok) out.push(word);
    }
    this.cache.set(lower + "\u0001" + fill, out);
    return out;
  }
  private p(word: string) { return ((this.uni.get(word) ?? 0) + 1) / (this.tokens + this.uni.size + 1); }
  /** P(next | previous), smoothed towards the word's own frequency so an unseen pair is unlikely, not impossible. */
  private cond(previous: string, next: string) { return ((this.bi.get(key(previous, next)) ?? 0) + this.p(next)) / ((this.uni.get(previous) ?? (previous === SENTENCE_START ? this.tokens / 10 : 0)) + 1); }

  /** Score of a candidate in its place: frequency, the word before, the word after, and whether it can be a Vietnamese syllable. */
  private score(candidate: string, previous: string, next: string | null): number {
    let s = Math.log(this.p(candidate));
    s += Math.log(this.cond(previous, candidate));
    if (next !== null) s += Math.log(this.cond(candidate, next));
    return s + (plausibleSyllable(candidate) ? 0.7 : /^[a-z]+$/.test(candidate) ? -1.5 : 0);
  }

  /** The case of the answer follows the letters that are known: all capitals stay capitals, otherwise lower case. */
  private cased(pattern: string, word: string): string {
    const known = [...pattern].filter(ch => ch !== "?" && /[A-Za-z]/.test(ch));
    const upper = known.length > 0 && known.every(ch => ch === ch.toUpperCase());
    let out = "";
    for (let i = 0; i < word.length; i++) out += pattern[i] === "?" ? (upper ? word[i].toUpperCase() : word[i]) : pattern[i];
    return out;
  }

  /**
   * Predict every word of a cell. Words without `?` are certain (the file's own text); each broken word gets a draft (frequency only) and a
   * target (the best whole phrase, including adjacent damaged words and later clean anchors).
   */
  predict(text: string): WordPrediction[] {
    const words = wordsOf(text);
    if (!words.length) return [];
    const pruned = new Set<number>(), fallback = new Set<number>();
    // Bound the lattice by local evidence first; decode the whole phrase in both directions.
    // Adjacent damaged words therefore help one another instead of inheriting an early greedy mistake.
    const choices = words.map((word, index) => {
      const pattern = stripMarks(word.text).toLowerCase();
      if (!pattern.includes("?")) return [pattern];
      let fit = this.candidates(pattern);
      // A digit can follow an m: m? is m2 or m3. Only if nothing of the file fits.
      if (!fit.length && /\bm\?$/i.test(pattern)) { fit = this.candidates(pattern, "23"); if (fit.length) fallback.add(index); }
      if (!fit.length) { fit = this.candidates(pattern, "abcdefghijklmnopqrstuvwxyz0123456789"); fallback.add(index); }
      const next = words[index + 1] && words[index + 1].text.indexOf("?") < 0 ? stripMarks(words[index + 1].text).toLowerCase() : words[index + 1] ? null : SENTENCE_END;
      const previous = index === 0 ? SENTENCE_START : !words[index - 1].text.includes("?") ? stripMarks(words[index - 1].text).toLowerCase() : "";
      if (fit.length > 32) pruned.add(index);
      return [...fit].sort((a, b) => this.score(b, previous, next) - this.score(a, previous, next) || this.count(b) - this.count(a) || a.localeCompare(b)).slice(0, 32).concat(fit.length ? [] : [pattern]);
    });
    const local = (word: string, index: number) => words[index].text.includes("?") && !word.includes("?")
      ? Math.log(this.p(word)) + (plausibleSyllable(word) ? 0.7 : /^[a-z]+$/.test(word) ? -1.5 : 0) : 0;
    const link = (a: string, b: string) => a.includes("?") || b.includes("?") ? 0 : Math.log(this.cond(a, b));
    const forward: number[][] = [], backward: number[][] = [], parents: number[][] = [];
    choices.forEach((options, index) => {
      parents[index] = [];
      forward[index] = options.map(word => {
        const scores = index ? choices[index - 1].map((prev, j) => forward[index - 1][j] + link(prev, word)) : [link(SENTENCE_START, word)];
        const best = Math.max(...scores);
        parents[index].push(scores.indexOf(best));
        return best + local(word, index);
      });
    });
    for (let i = choices.length - 1; i >= 0; i--) backward[i] = choices[i].map(word => i === choices.length - 1 ? link(word, SENTENCE_END) : Math.max(...choices[i + 1].map((next, j) => link(word, next) + local(next, i + 1) + backward[i + 1][j])));
    const selected: number[] = [];
    const last = choices.length - 1;
    const totals = forward[last].map((score, j) => score + backward[last][j]);
    selected[last] = totals.indexOf(Math.max(...totals));
    for (let i = last; i > 0; i--) selected[i - 1] = parents[i][selected[i]];
    return words.map((word, index) => {
      if (!word.text.includes("?")) return { index, ...word, broken: false, draft: word.text, target: word.text, alternatives: [], confident: true, basis: "clean" as const };
      const pattern = stripMarks(word.text);
      const targetWord = choices[index][selected[index]];
      const ranked = choices[index].map((w, j) => ({ w, j, score: forward[index][j] + backward[index][j] })).filter(item => !item.w.includes("?")).sort((a, b) => b.score - a.score || Number(b.j === selected[index]) - Number(a.j === selected[index]) || this.count(b.w) - this.count(a.w) || a.w.localeCompare(b.w));
      const top = ranked[0], second = ranked[1];
      const previous = index ? choices[index - 1][selected[index - 1]] : SENTENCE_START;
      const next = index < last ? choices[index + 1][selected[index + 1]] : SENTENCE_END;
      const contextSupport = (this.bi.get(key(previous, targetWord)) ?? 0) + (this.bi.get(key(targetWord, next)) ?? 0);
      const draft = ranked.reduce((best, item) => this.count(item.w) > this.count(best) ? item.w : best, top?.w ?? "");
      return { index, ...word, broken: true, draft: draft ? this.cased(pattern, draft) : "", target: top ? this.cased(pattern, targetWord) : "",
        alternatives: ranked.slice(0, 4).map(item => ({ text: this.cased(pattern, item.w), score: item.score, support: this.count(item.w) })),
        confident: !!top && !pruned.has(index) && this.count(targetWord) >= 3 && (!second || top.score - second.score > Math.log(4)),
        basis: !top ? "none" as const : contextSupport ? "context" as const : "frequency" as const, contextSupport,
        margin: top ? (second ? top.score - second.score : Infinity) : 0, fallback: fallback.has(index) };
    });
  }
}

/** Put the targets back into the cell: the broken words are replaced, everything else (spaces, punctuation, case) stays as it was. */
export function applyTargets(text: string, predictions: WordPrediction[], only?: (prediction: WordPrediction) => boolean): string {
  let out = "", at = 0;
  for (const prediction of predictions) {
    if (!prediction.broken || !prediction.target || (only && !only(prediction))) continue;
    out += text.slice(at, prediction.start) + prediction.target; at = prediction.end;
  }
  return out + text.slice(at);
}

/** Only supported suggestions and explicit reviewer choices enter the draft; an ambiguous guess stays damaged. */
export function applyReviewChoices(text: string, predictions: WordPrediction[], picks: Record<number, string>): string {
  return applyTargets(text, predictions.map(word => ({ ...word, target: picks[word.index] ?? word.target })), word => picks[word.index] !== undefined || word.confident);
}
