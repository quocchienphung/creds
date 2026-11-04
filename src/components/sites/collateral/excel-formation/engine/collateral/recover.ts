import { Lexicon, MAX_GRAM, type Gram } from "./lexicon.ts";
import type { TextDomain } from "./ontology.ts";
import { corruptionSpans } from "../corruption-span.ts";
import { caseOfDamaged, type RepairPolicy } from "../geo/address-recovery.ts";
import { toAscii, withCase } from "../geo/vn-text.ts";

/**
 * Recovers the letters a legacy export replaced by `?` in COLLATERAL text (land-use rights, buildings, vehicles, machinery, goods, deposits, rights,
 * ownership and security wording), whatever sheet or column it is in.
 *
 * It reasons in accented Vietnamese: every damaged word gets the accented syllables of the ontology that fit its visible letters, the whole phrase is decoded at
 * once (syllable unigram and bigram, plus a reward for words that form a phrase of the ontology), and only after the best phrase is chosen is it written as
 * Vietnamese without marks. Digits, codes and every clean character are never touched. A cell the ontology does not recognise is left alone for the other stages.
 *
 * Words that tell the values of a legal attribute apart (use / ownership, registered / not, mortgage / pledge, existing / future) are HIGH impact: they are
 * accepted by SAFE_AUTO only with a larger margin, and FORCE never invents one from language likelihood: below its own margin it writes `KHONG XAC DINH`.
 */
export type CollateralStatus = "safe_auto_domain_calibrated" | "forced_guess" | "fallback_lossy" | "needs_review" | "blocked_protected_anchor" | "legitimate_question_mark";
export const NON_ASSERTIVE = "KHONG XAC DINH";
/** Margins (best phrase minus the best phrase that writes something else) from which a word is trusted, by impact tier. Measured on held-out SYNTHETIC text. */
export interface CollateralCalibration { version: string; minMargin: { low: number; high: number }; forceSlotMargin: number; heldOutWords: number; precision: { low: number; high: number }; method: string; synthetic: true }
export const CALIBRATION_FALLBACK: CollateralCalibration = { version: "uncalibrated", minMargin: { low: 8, high: 14 }, forceSlotMargin: 4, heldOutWords: 0, precision: { low: 0, high: 0 }, method: "not calibrated: conservative defaults", synthetic: true };

export interface CollateralToken {
  start: number; end: number; original: string; accented: string; ascii: string;
  status: CollateralStatus; applied: boolean; margin: number; tier: "low" | "high"; domain: TextDomain | "unknown";
  /** Size of the largest ontology phrase that contains this word, with the word read as chosen. 0: no phrase supports it (frequency and neighbours only). */
  phraseSize: number; evidence: string[]; runnerUp?: string; variableLength: boolean;
}
export interface CollateralRecovery {
  value: string; changed: boolean; tokens: CollateralToken[]; domains: { domain: TextDomain; score: number }[];
  /** The ontology recognised this text as collateral wording. When false nothing here was touched. */
  recognized: boolean; remainingPlaceholders: number;
}
export interface CollateralOptions { policy: RepairPolicy; calibration?: CollateralCalibration; /** For ablations only: scales the decoder terms. */ weights?: Partial<typeof W> }

export const W = { unigram: 1, bigram: 1.2, gram: 1.6, whole: 1.4, spread: 4, plainAtPlaceholder: 6, many: 0.25 };
type Weights = typeof W;
interface State { /** `?` over a plain letter: the export loses marked letters, so this reading suggests the true word is not in the ontology. */ plain: number; syl: string; ascii: string; local: number; bonus: number; variable: boolean; unknown: boolean; /** Largest phrase of the ontology this reading completes. */ phrase: number; domains: Map<TextDomain, number> }
type Kind = "clean" | "corrupt" | "anchor" | "number";
interface Word { start: number; end: number; text: string; kind: Kind; states: State[]; chars: string[]; breakAfter: boolean }

const NUMBER_ONLY: ReadonlySet<string> = new Set([Lexicon.NUMBER]);
const WORD = /[\p{L}\p{M}\d?]+/gu;
const state = (partial: Partial<State> & Pick<State, "syl" | "ascii">): State => ({ plain: 0, local: 0, bonus: 0, variable: false, unknown: false, phrase: 0, domains: new Map(), ...partial });

function tokenize(text: string, lexicon: Lexicon, W: Weights): Word[] {
  // A `?` that is punctuation (a question ending the text, one inside a link) is not part of a word.
  const punctuation = corruptionSpans(text).filter(span => span.kind === "suspected_punctuation");
  const isPunct = (at: number) => punctuation.some(span => at >= span.start && at < span.end);
  const words: Word[] = [];
  for (const match of text.matchAll(WORD)) {
    let start = match.index!, end = start + match[0].length;
    while (end > start && text[end - 1] === "?" && isPunct(end - 1)) end--;
    while (start < end && text[start] === "?" && isPunct(start)) start++;
    if (start >= end) continue;
    const raw = text.slice(start, end), lower = raw.normalize("NFC").toLowerCase(), hasQ = raw.includes("?"), hasDigit = /\d/.test(raw);
    const base = { start, end, text: raw, chars: [...lower], breakAfter: false };
    if (hasDigit && hasQ) words.push({ ...base, kind: "anchor", states: [] });
    else if (hasDigit) words.push({ ...base, kind: "number", states: [state({ syl: Lexicon.NUMBER, ascii: raw })] });
    // A short word in capitals that the ontology does not know is a code (QJ, XD, HĐTC) and stands like a number.
    else if (!hasQ && /^\p{Lu}{1,4}$/u.test(raw) && !lexicon.knows(lower) && !lexicon.spellings(toAscii(lower)).length) words.push({ ...base, kind: "number", states: [state({ syl: Lexicon.NUMBER, ascii: raw })] });
    else if (!hasQ) {
      const marked = lower !== toAscii(lower), known = lexicon.spellings(lower);
      const states = marked ? [state({ syl: lower, ascii: toAscii(lower), local: Math.log(lexicon.p(lower)), unknown: !lexicon.knows(lower) })]
        : known.length ? known.slice(0, 4).map(syl => state({ syl, ascii: lower, local: Math.log(lexicon.p(syl)) }))
        : [state({ syl: lower, ascii: lower, local: Math.log(lexicon.p("\u0001")), unknown: true })];
      words.push({ ...base, kind: "clean", states });
    } else {
      const placeholders = base.chars.map((ch, at) => ch === "?" ? at : -1).filter(at => at >= 0);
      // One letter per `?` first; a `?` that stands for several letters (a mark lost together with a letter) is a costlier reading, always considered.
      const fixed = lexicon.candidates(lower), spread = lexicon.candidates(lower, 3);
      // The export loses the letters outside its character set, which are the ones that carry a mark: a placeholder over a plain letter is unlikely.
      const states = [
        ...fixed.slice(0, 80).map(syl => { const plain = placeholders.filter(at => toAscii([...syl][at] ?? "") === [...syl][at]).length; return state({ syl, ascii: toAscii(syl), plain, local: Math.log(lexicon.p(syl)) - W.plainAtPlaceholder * plain }); }),
        ...spread.slice(0, 40).map(syl => state({ syl, ascii: toAscii(syl), variable: true, local: Math.log(lexicon.p(syl)) - W.spread })),
      ];
      words.push({ ...base, kind: "corrupt", states });
    }
  }
  words.forEach((word, i) => { const next = words[i + 1]; word.breakAfter = !next || /[^\s]/.test(text.slice(word.end, next.start)); });
  return words;
}

/** Reward the readings that spell a phrase of the ontology together with their neighbours, once per word (the best window), never summed over overlapping windows. */
function applyPhrases(words: Word[], lexicon: Lexicon, cellWords: number, W: Weights) {
  for (let size = 2; size <= Math.min(MAX_GRAM, words.length); size++) for (let at = 0; at + size <= words.length; at++) {
    const window = words.slice(at, at + size);
    if (window.slice(0, -1).some(word => word.breakAfter) || window.some(word => word.kind === "anchor")) continue;
    if (!window.some(word => word.kind === "corrupt" && word.states.length)) continue;
    const grams = lexicon.matchWindow(window.map(word => word.chars), window.map(word => word.kind === "number" ? NUMBER_ONLY : word.kind === "corrupt" && word.states.some(st => st.variable) ? new Set(word.states.map(st => st.syl)) : null));
    if (!grams.length) continue;
    // A clean word that is spelt with marks must be the gram's spelling (already ensured by `fits`); a plain one stands for any of its spellings.
    window.forEach((word, position) => {
      if (word.kind !== "corrupt") return;
      const support = new Map<string, { best: number; sum: number; whole: boolean; domains: Map<TextDomain, number> }>();
      for (const gram of grams) {
        const syl = gram.syls[position], have = support.get(syl) ?? { best: 0, sum: 0, whole: false, domains: new Map() };
        have.best = Math.max(have.best, gram.support); have.sum += gram.support; have.whole ||= gram.whole && size === cellWords;
        for (const [domain, n] of gram.domains) have.domains.set(domain, (have.domains.get(domain) ?? 0) + n);
        support.set(syl, have);
      }
      for (const st of word.states) {
        const found = support.get(st.syl); if (!found) continue;
        const bonus = W.gram * (Math.log(1 + found.best) + W.many * Math.log(1 + found.sum)) * (found.whole ? W.whole : 1) * (1 + 0.15 * (size - 2));
        if (bonus > st.bonus) { st.bonus = bonus; st.phrase = size; st.domains = found.domains; }
        else if (size > st.phrase) { st.phrase = size; for (const [d, n] of found.domains) st.domains.set(d, Math.max(st.domains.get(d) ?? 0, n)); }
      }
    });
  }
}

interface Solution { path: number[]; margins: number[]; runnerUps: (string | undefined)[]; score: number }
function decode(words: Word[], lexicon: Lexicon, W: Weights): Solution {
  const n = words.length;
  const stateScore = (st: State) => W.unigram * st.local + st.bonus;
  const trans = (previous: State | null, next: State) => W.bigram * Math.log(lexicon.pBigram(previous ? previous.syl : Lexicon.START, next.syl));
  const empty = state({ syl: "", ascii: "", unknown: true });
  const active = words.map(word => word.states.length ? word.states : [empty]);
  const forward: number[][] = [], back: number[][] = [], from: number[][] = [];
  active.forEach((states, i) => {
    forward[i] = []; from[i] = [];
    states.forEach(st => {
      if (i === 0) { forward[i].push(stateScore(st) + trans(null, st)); from[i].push(-1); return; }
      let best = -Infinity, pick = 0;
      active[i - 1].forEach((previous, p) => { const score = forward[i - 1][p] + trans(previous, st); if (score > best) { best = score; pick = p; } });
      forward[i].push(best + stateScore(st)); from[i].push(pick);
    });
  });
  const endScore = (st: State) => W.bigram * Math.log(lexicon.pBigram(st.syl, Lexicon.END));
  for (let i = n - 1; i >= 0; i--) back[i] = active[i].map(st => i === n - 1 ? endScore(st) : Math.max(...active[i + 1].map((next, q) => trans(st, next) + stateScore(next) + back[i + 1][q])));
  const totals = active[n - 1].map((st, s) => forward[n - 1][s] + back[n - 1][s]);
  const path: number[] = new Array(n);
  path[n - 1] = totals.indexOf(Math.max(...totals));
  for (let i = n - 1; i > 0; i--) path[i - 1] = from[i][path[i]];
  const margins: number[] = new Array(n).fill(Infinity), runnerUps: (string | undefined)[] = new Array(n).fill(undefined);
  words.forEach((word, i) => {
    if (word.kind !== "corrupt" || !word.states.length) return;
    // The margin is to the best reading that WRITES something else: readings that differ only in marks write the same text.
    const best = new Map<string, { score: number; syl: string }>();
    active[i].forEach((st, s) => { const score = forward[i][s] + back[i][s], have = best.get(st.ascii); if (!have || score > have.score) best.set(st.ascii, { score, syl: st.syl }); });
    const ranked = [...best.values()].sort((a, b) => b.score - a.score);
    if (ranked.length > 1) { margins[i] = ranked[0].score - ranked[1].score; runnerUps[i] = ranked[1].syl; }
  });
  return { path, margins, runnerUps, score: Math.max(...totals) };
}

/**
 * The case of a damaged word. A word with letters of its own keeps their shape; one whose first letter is lost is lower case, except at the start of the text
 * (sentence case), in capitals when the text is, and in title case when every clean word of the text is.
 */
function caseOf(word: Word, index: number, words: Word[], text: string): "upper" | "title" | "lower" {
  const shape = caseOfDamaged(word.text, text);
  if (!word.text.startsWith("?")) return shape;
  if (shape === "upper") return "upper";
  const clean = words.filter(other => other.kind === "clean" && /\p{L}{2}/u.test(other.text));
  if (clean.length && clean.every(other => /^\p{Lu}/u.test(other.text))) return "title";
  return index === 0 ? "title" : "lower";
}

export function recoverCollateralText(text: string, lexicon: Lexicon, options: CollateralOptions): CollateralRecovery {
  const calibration = options.calibration ?? CALIBRATION_FALLBACK, none: CollateralRecovery = { value: text, changed: false, tokens: [], domains: [], recognized: false, remainingPlaceholders: 0 };
  if (!text.includes("?") || text !== text.normalize("NFC")) return none;
  const w = { ...W, ...options.weights }, words = tokenize(text, lexicon, w);
  if (!words.some(word => word.kind === "corrupt" || word.kind === "anchor")) return none;
  applyPhrases(words, lexicon, words.length, w);
  // Recognised only when an ontology phrase supports the reading or the cell holds a whole clean ontology phrase beside the damage.
  const solved = decode(words, lexicon, w);
  const supported = words.some((word, i) => word.kind === "corrupt" && (word.states[solved.path[i]]?.phrase ?? 0) >= 2);
  if (!supported) return none;

  const tokens: CollateralToken[] = [], domainScore = new Map<TextDomain, number>();
  words.forEach((word, i) => {
    if (word.kind !== "corrupt" && word.kind !== "anchor") return;
    const base = { start: word.start, end: word.end, original: word.text, margin: 0, tier: "low" as const, domain: "unknown" as const, phraseSize: 0, variableLength: false };
    if (word.kind === "anchor") { tokens.push({ ...base, accented: word.text, ascii: word.text, status: "blocked_protected_anchor", applied: false, evidence: ["digits and ? in one word: a code or number is never completed"] }); return; }
    const st = word.states[solved.path[i]];
    if (!word.states.length || !st) return; // nothing of the ontology fits: left for the later stages
    const margin = solved.margins[i], tier = lexicon.protectedSyllables.has(st.syl) ? "high" as const : "low" as const;
    const domains = [...st.domains].sort((a, b) => b[1] - a[1]), domain = domains[0]?.[0] ?? [...(lexicon.domainsOf(st.syl) ?? [])].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown";
    for (const [d, n] of domains) domainScore.set(d, (domainScore.get(d) ?? 0) + n);
    const evidence = [st.phrase >= 2 ? `phrase of the ontology (${st.phrase} words)` : "no ontology phrase: frequency and neighbours only", `${st.unknown ? "unseen" : "known"} syllable`];
    if (st.variable) evidence.push("one ? stands for several letters");
    if (tier === "high") evidence.push("tells apart the values of a legal attribute");
    const ascii = withCase(st.ascii, caseOf(word, i, words, text));
    if (st.plain) evidence.push("a ? stands over a plain letter");
    const sure = st.phrase >= 2 && !st.plain && margin >= calibration.minMargin[tier];
    let status: CollateralStatus, applied: boolean, written = ascii;
    if (sure) { status = "safe_auto_domain_calibrated"; applied = true; }
    else if (options.policy !== "FORCE_NO_QUESTION_MARK") { status = "needs_review"; applied = false; }
    // A word that decides what the text asserts is not guessed from fluency: below its own margin the text says it is undetermined.
    else if (tier === "high" && margin < calibration.forceSlotMargin) { status = "fallback_lossy"; applied = true; written = NON_ASSERTIVE; evidence.push("high-impact word below the margin: not asserted"); }
    else { status = "forced_guess"; applied = true; }
    tokens.push({ ...base, accented: st.syl, ascii: written, status, applied, margin, tier, domain, phraseSize: st.phrase, evidence, ...(solved.runnerUps[i] ? { runnerUp: solved.runnerUps[i] } : {}), variableLength: st.variable });
  });
  let value = text;
  for (const token of tokens.filter(t => t.applied).sort((a, b) => b.start - a.start)) value = value.slice(0, token.start) + token.ascii + value.slice(token.end);
  const sum = [...domainScore.values()].reduce((a, b) => a + b, 0) || 1;
  return {
    value, changed: value !== text, tokens, recognized: true,
    domains: [...domainScore].map(([domain, score]) => ({ domain, score: +(score / sum).toFixed(3) })).sort((a, b) => b.score - a.score),
    remainingPlaceholders: tokens.filter(t => !t.applied).length,
  };
}
export type { Gram };
