import { classifySegments, foldWord, isAddressClass, typeIndexOf, type ClassifyHints, type Segment } from "./address-classifier.ts";
import { LM_NUMBER, type GeoKnowledge, type Gaz } from "./geo-knowledge.ts";
import { caseShape, nfc, pieces, toAscii, withCase } from "./vn-text.ts";

/**
 * Recovers the letters a legacy export replaced by `?` in the address and location parts of a text.
 *
 * It reasons in accented Vietnamese: every damaged word gets the accented syllables of the dataset that fit its visible letters, every clean word
 * its accented forms, and the whole phrase is decoded at once (unigram and bigram of the accented language model, plus a reward for words that
 * form a real administrative unit, street or place name, more when that name lies under the administrative units found elsewhere in the cell).
 * Only after the best phrase is chosen is it written as Vietnamese without marks. Nothing here knows an answer for a particular word.
 */
export type GeoStatus = "verified_official" | "verified_internal_match" | "high_confidence_auto" | "contextual_auto" | "forced_guess" | "fallback_lossy" | "needs_review" | "unchanged_legitimate_punctuation" | "rejected_numeric_anchor_conflict";
export type RepairPolicy = "SAFE_AUTO" | "FORCE_NO_QUESTION_MARK";
/** The margins (between the best answer and the best answer that writes something else) from which a repair is trusted; measured on held-out data, see calibrate-geo. */
export interface GeoCalibration { highMargin: number; contextMargin: number; heldOut: number; precisionAtHigh: number; precisionAtContext: number; method: string }
export const UNCALIBRATED: GeoCalibration = { highMargin: 6, contextMargin: 3, heldOut: 0, precisionAtHigh: 0, precisionAtContext: 0, method: "not calibrated: conservative defaults" };

export interface TokenRepair {
  /** Offsets in the text that was given. */
  start: number; end: number;
  original: string; accented: string; ascii: string;
  status: GeoStatus; applied: boolean;
  margin: number; score: number; runnerUp?: string;
  evidence: string[]; variableLength: boolean;
}
export interface SegmentRepair { segment: Segment; tokens: TokenRepair[] }
export interface CellRecovery {
  value: string; changed: boolean; segments: SegmentRepair[];
  /** `?` placeholders still in an address segment after this recovery (a safe policy leaves some; an anchor conflict leaves its own). */
  remainingPlaceholders: number;
}
export interface RecoveryOptions { policy: RepairPolicy; calibration?: GeoCalibration; hints?: ClassifyHints; /** Also repair segments that are only ambiguous (default: address-like segments only). */ includeAmbiguous?: boolean }

// Weights of the decoder. Fixed and documented; the margins that decide trust are calibrated on held-out data, not these.
const W = { unigram: 1, bigram: 1.2, gazetteer: 2.2, exact: 1.5, context: 2.5, plainAtPlaceholder: 5, many: 0.25, unmarkedClean: 0.3, otherMarkClean: 0.1 };
const GROUP_WEIGHT: Record<Gaz["group"], number> = { province: 3, district: 3, ward: 3, street: 1.5, place: 1.2, admin_osm: 2, address_part: 1, feature: 0.7 };
const MAX_STATES = 24, MAX_ACCENTS = 4;

interface State { accented: string; ascii: string; local: number; bonus: number; variable: boolean; unknown: boolean; /** The reward comes from an administrative-unit name. */ official?: boolean; /** The reward comes from a name under the administrative units found in the cell. */ contextual?: boolean }
interface Word { piece: { text: string; start: number; end: number }; fold: string; kind: "number" | "mixed" | "anchor_conflict" | "corrupt" | "clean"; states: State[] }

/** The accented parents of a name (ward, district, province) as unit ids, self included. */
function ancestry(knowledge: GeoKnowledge, parent: number): number[] {
  const out: number[] = [];
  for (let id = parent, guard = 0; id >= 0 && guard < 4; id = knowledge.units[id]?.parent ?? -1, guard++) out.push(id);
  return out;
}
/** Administrative units named by clean windows of the text (any era): the context a damaged place name has to be consistent with. */
export function contextUnits(text: string, knowledge: GeoKnowledge): Set<number> {
  const folds = pieces(text).filter(piece => piece.kind === "word").map(piece => foldWord(piece.text));
  const out = new Set<number>();
  for (let size = 1; size <= 4; size++) for (let at = 0; at + size <= folds.length; at++) {
    const window = folds.slice(at, at + size);
    if (window.some(word => word.includes("?") || /^\d+$/.test(word))) continue;
    for (const unit of knowledge.unitsByCore.get(window.join(" ")) ?? []) out.add(unit.id);
  }
  return out;
}

function wordsOf(segment: string, knowledge: GeoKnowledge): Word[] {
  const index = typeIndexOf(knowledge);
  return pieces(segment).filter(piece => piece.kind === "word").map(piece => {
    const text = piece.text, fold = foldWord(text), hasQ = text.includes("?"), hasDigit = /\d/.test(text), hasLetter = /\p{L}/u.test(text);
    if (!hasQ && /^\d+$/.test(text)) return { piece, fold, kind: "number" as const, states: [{ accented: text, ascii: text, local: 0, bonus: 0, variable: false, unknown: false }] };
    if (hasDigit && hasQ) return { piece, fold, kind: "anchor_conflict" as const, states: [] };
    if (hasDigit && hasLetter) return { piece, fold, kind: "mixed" as const, states: [{ accented: text.toLowerCase(), ascii: toAscii(text).toLowerCase(), local: 0, bonus: 0, variable: false, unknown: true }] };
    if (!hasQ) {
      // A clean word: its accented forms from the data (or exactly itself when it already carries marks).
      const marked = nfc(text) !== toAscii(text);
      const known = knowledge.byFold.get(fold);
      const states: State[] = marked ? [{ accented: nfc(text).toLowerCase(), ascii: fold, local: Math.log(knowledge.p(nfc(text).toLowerCase())), bonus: 0, variable: false, unknown: !known }]
        : known ? known.variants.slice(0, MAX_ACCENTS).map(variant => ({ accented: variant.text, ascii: fold, local: Math.log(knowledge.p(variant.text)), bonus: 0, variable: false, unknown: false }))
        : [{ accented: fold, ascii: fold, local: Math.log(knowledge.p("\u0001")), bonus: 0, variable: false, unknown: true }];
      // An abbreviation of a type (TT, TP, KV) stands, for the language model, for the last word of the type it abbreviates.
      const abbreviated = index.abbreviations.get(fold);
      if (abbreviated && !known?.total) states[0].accented = abbreviated[0].phrase.split(" ").at(-1)!;
      return { piece, fold, kind: "clean" as const, states };
    }
    // A damaged word: the syllables of the data that fit its visible letters, one letter per `?` first, then a `?` standing for up to three letters.
    let found = knowledge.syllableCandidates(fold, 1), variable = false;
    if (!found.length) { found = knowledge.syllableCandidates(fold, 3).filter(candidate => candidate.fold.length !== fold.length); variable = found.length > 0; }
    const states: State[] = [];
    // The export loses the letters outside its character set, which are the letters that carry a mark: a placeholder over a plain letter is unlikely.
    const placeholders = [...fold].map((ch, at) => ch === "?" ? at : -1).filter(at => at >= 0);
    for (const candidate of found) {
      for (const variant of candidate.variants.slice(0, MAX_ACCENTS)) {
        const plain = variable ? 0 : placeholders.filter(at => toAscii(variant.text[at] ?? "") === variant.text[at]).length;
        states.push({ accented: variant.text, ascii: candidate.fold, local: Math.log(knowledge.p(variant.text)) - W.plainAtPlaceholder * plain, bonus: 0, variable, unknown: false });
      }
      if (states.length >= MAX_STATES * 2) break;
    }
    states.sort((a, b) => b.local - a.local); states.length = Math.min(states.length, MAX_STATES);
    return { piece, fold, kind: "corrupt" as const, states };
  });
}

/** Reward the states that spell a real name together with their neighbours, once per word (the best window), never summed over overlapping windows. */
function applyGazetteer(words: Word[], knowledge: GeoKnowledge, context: Set<number>) {
  for (let size = 2; size <= Math.min(5, words.length); size++) for (let at = 0; at + size <= words.length; at++) {
    const window = words.slice(at, at + size);
    if (!window.some(word => word.kind === "corrupt" && word.states.length) || window.some(word => word.kind === "anchor_conflict" || word.kind === "mixed")) continue;
    const matches = knowledge.matchWindow(window.map(word => word.fold), 400);
    if (!matches.length) continue;
    window.forEach((word, position) => {
      if (word.kind !== "corrupt") return;
      const support = new Map<string, { weight: number; best: number; official: boolean; contextual: boolean }>();
      for (const { name, offset } of matches) {
        // The type of an administrative unit (Thành phố, Thị xã) is not evidence for its name: hundreds of units share it.
        const unit = name.unit >= 0 ? knowledge.units[name.unit] : undefined;
        const typeLength = unit?.type ? unit.type.split(" ").length : 0;
        if (offset + size <= typeLength) continue;
        const accented = name.toks[offset + position].toLowerCase();
        // A window that is only a small part of a long name says less about it than a window that is most of the name.
        let weight = GROUP_WEIGHT[name.group] * Math.min(1, size / Math.max(1, name.toks.length - typeLength)), contextual = false;
        // A clean word of the text that is not spelt like the name's syllable (no marks where the name has them, or other marks) is weaker evidence for that name.
        window.forEach((other, q) => {
          if (other.kind !== "clean") return;
          const spelt = nfc(other.piece.text).toLowerCase(), have = name.toks[offset + q].toLowerCase();
          if (spelt !== have) weight *= spelt === toAscii(spelt) ? W.unmarkedClean : W.otherMarkClean;
        });
        const chain = name.unit >= 0 ? [name.unit, ...ancestry(knowledge, name.parent)] : ancestry(knowledge, name.parent);
        if (context.size && chain.some(id => context.has(id))) { weight *= W.context; contextual = true; }
        if (offset === 0 && size === name.toks.length) weight *= W.exact;
        const have = support.get(accented) ?? { weight: 0, best: 0, official: false, contextual: false };
        have.weight += weight; have.best = Math.max(have.best, weight); have.official ||= name.unit >= 0; have.contextual ||= contextual;
        support.set(accented, have);
      }
      for (const state of word.states) {
        const found = support.get(state.accented), bonus = found ? W.gazetteer * (Math.log(1 + found.best) + W.many * Math.log(1 + found.weight)) : 0;
        if (bonus > state.bonus) { state.bonus = bonus; state.official = found!.official; state.contextual = found!.contextual; }
      }
    });
  }
}

interface Solution { path: number[]; margins: number[]; runnerUps: (string | undefined)[]; score: number }
/** Viterbi over the lattice with max-marginals, so each damaged word gets the margin between its best answer and the best answer that writes something else. */
function decode(words: Word[], knowledge: GeoKnowledge): Solution {
  const n = words.length;
  const lm = (state: State) => /^\d+$/.test(state.accented) ? LM_NUMBER : state.accented;
  const stateScore = (state: State) => W.unigram * state.local + state.bonus;
  const trans = (previous: State | null, next: State) => W.bigram * Math.log(knowledge.pBigram(previous ? lm(previous) : "^", lm(next)));
  const active = words.map(word => word.states.length ? word.states : [{ accented: "", ascii: "", local: 0, bonus: 0, variable: false, unknown: true } as State]);
  const forward: number[][] = [], back: number[][] = [], from: number[][] = [];
  active.forEach((states, i) => {
    forward[i] = []; from[i] = [];
    states.forEach(state => {
      if (i === 0) { forward[i].push(stateScore(state) + trans(null, state)); from[i].push(-1); return; }
      let best = -Infinity, pick = 0;
      active[i - 1].forEach((previous, p) => { const score = forward[i - 1][p] + trans(previous, state); if (score > best) { best = score; pick = p; } });
      forward[i].push(best + stateScore(state)); from[i].push(pick);
    });
  });
  const endScore = (state: State) => W.bigram * Math.log(knowledge.pBigram(lm(state), "$"));
  for (let i = n - 1; i >= 0; i--) back[i] = active[i].map((state) => i === n - 1 ? endScore(state) : Math.max(...active[i + 1].map((next, q) => trans(state, next) + stateScore(next) + back[i + 1][q])));
  const totals = active[n - 1].map((state, s) => forward[n - 1][s] + back[n - 1][s]);
  const path: number[] = new Array(n);
  path[n - 1] = totals.indexOf(Math.max(...totals));
  for (let i = n - 1; i > 0; i--) path[i - 1] = from[i][path[i]];
  const margins: number[] = new Array(n).fill(Infinity), runnerUps: (string | undefined)[] = new Array(n).fill(undefined);
  words.forEach((word, i) => {
    if (word.kind !== "corrupt" || !word.states.length) return;
    const best = new Map<string, { score: number; accented: string }>();
    active[i].forEach((state, s) => { const score = forward[i][s] + back[i][s], key = state.ascii; const have = best.get(key); if (!have || score > have.score) best.set(key, { score, accented: state.accented }); });
    const ranked = [...best.values()].sort((a, b) => b.score - a.score);
    if (ranked.length > 1) { margins[i] = ranked[0].score - ranked[1].score; runnerUps[i] = ranked[1].accented; }
  });
  return { path, margins, runnerUps, score: Math.max(...totals) };
}

/**
 * The case shape of a damaged word. Its first letter may be the one that was lost, so the shape is read from the text of the whole cell: a word with
 * letters of its own keeps their shape; one whose first letter is lost follows the style of the words whose first letter is known (capitals throughout,
 * or each word capitalised).
 */
function caseOfDamaged(word: string, cell: string): "upper" | "title" | "lower" {
  const letters = (text: string) => text.replace(/\?/g, "");
  const known = (cell.match(/[\p{L}\p{M}\d?]+/gu) ?? []).filter(text => !text.startsWith("?") && /\p{L}/u.test(letters(text))).map(text => caseShape(letters(text)));
  const upper = known.filter(item => item === "upper").length, title = known.filter(item => item === "title").length, lower = known.length - upper - title;
  const crowdUpper = known.length > 1 && upper >= known.length * 0.6, crowdTitle = title > 0 && title >= lower;
  const own = /\p{L}/u.test(letters(word)) ? caseShape(letters(word)) : undefined;
  if (own === "upper" && crowdUpper) return "upper";
  if (!word.startsWith("?")) return own ?? "lower";
  return crowdUpper ? "upper" : crowdTitle ? "title" : "lower";
}
const isPlaceholderOnly = (text: string) => text === "?";

function repairSegment(segment: Segment, knowledge: GeoKnowledge, options: Required<Pick<RecoveryOptions, "policy">> & { calibration: GeoCalibration }, cellContext: Set<number>, cellText: string): SegmentRepair {
  const words = wordsOf(segment.text, knowledge);
  const result: SegmentRepair = { segment, tokens: [] };
  if (!words.some(word => word.kind === "corrupt" || word.kind === "anchor_conflict")) return result;
  const context = new Set([...cellContext, ...contextUnits(segment.text, knowledge)]);
  applyGazetteer(words, knowledge, context);
  const solved = decode(words, knowledge);
  const { calibration, policy } = options;
  words.forEach((word, i) => {
    if (word.kind !== "corrupt" && word.kind !== "anchor_conflict") return;
    const base = { start: segment.start + word.piece.start, end: segment.start + word.piece.end, original: word.piece.text };
    // A damaged number (a `?` among digits) is an anchor: it is never changed.
    if (word.kind === "anchor_conflict") { result.tokens.push({ ...base, accented: word.piece.text, ascii: word.piece.text, status: "rejected_numeric_anchor_conflict", applied: false, margin: 0, score: 0, evidence: ["digits and ? in one word"], variableLength: false }); return; }
    // A lone `?` that ends the segment, after a space, is punctuation (a question), not a lost letter.
    if (isPlaceholderOnly(word.piece.text) && i === words.length - 1 && segment.text[word.piece.start - 1] === " ") { result.tokens.push({ ...base, accented: word.piece.text, ascii: word.piece.text, status: "unchanged_legitimate_punctuation", applied: false, margin: Infinity, score: 0, evidence: ["a lone ? ending the text"], variableLength: false }); return; }
    const state = word.states[solved.path[i]];
    if (!word.states.length || !state) {
      // Nothing in the data fits: the placeholder is dropped, nothing is invented.
      const lossy = word.piece.text.replace(/\?/g, "");
      result.tokens.push({ ...base, accented: lossy, ascii: lossy, status: policy === "FORCE_NO_QUESTION_MARK" ? "fallback_lossy" : "needs_review", applied: policy === "FORCE_NO_QUESTION_MARK", margin: 0, score: 0, evidence: ["no syllable of the data fits"], variableLength: false });
      return;
    }
    const margin = solved.margins[i], evidence: string[] = [];
    const gazetteer = state.bonus > 0;
    if (gazetteer) evidence.push("name found in the geographic data");
    if (state.official) evidence.push("an official administrative unit");
    if (state.contextual) evidence.push("under the administrative units found in the cell");
    evidence.push(`${state.unknown ? "unseen" : "known"} syllable (${state.local.toFixed(1)})`);
    if (state.variable) evidence.push("one ? stands for several letters");
    const ascii = withCase(state.ascii, caseOfDamaged(word.piece.text, cellText));
    let status: GeoStatus;
    if (state.official && margin >= calibration.contextMargin) status = "verified_official";
    else if (margin >= calibration.highMargin) status = "high_confidence_auto";
    else if (margin >= calibration.contextMargin && gazetteer) status = "contextual_auto";
    else status = "forced_guess";
    const trusted = status !== "forced_guess";
    result.tokens.push({ ...base, accented: state.accented, ascii, status: trusted || policy === "FORCE_NO_QUESTION_MARK" ? status : "needs_review", applied: trusted || policy === "FORCE_NO_QUESTION_MARK", margin, score: solved.score, ...(solved.runnerUps[i] ? { runnerUp: solved.runnerUps[i] } : {}), evidence, variableLength: state.variable });
  });
  return result;
}

/**
 * Repair the address and location segments of one cell's text. Segments that are not addresses are untouched, and so is every character outside
 * a damaged word of an address segment.
 */
export function recoverAddressText(text: string, knowledge: GeoKnowledge, options: RecoveryOptions): CellRecovery {
  const policy = options.policy, calibration = options.calibration ?? UNCALIBRATED;
  const segments = classifySegments(text, knowledge, options.hints);
  const eligible = (segment: Segment) => isAddressClass(segment.class) || options.includeAmbiguous && segment.class === "AMBIGUOUS";
  const run = (cellContext: Set<number>) => segments.map(segment => eligible(segment) ? repairSegment(segment, knowledge, { policy, calibration }, cellContext, text) : { segment, tokens: [] });
  let cellContext = contextUnits(text, knowledge), repairs = run(cellContext);
  // A cell whose units are damaged too (ward, district and province all with ?) has no clean context. Read the units from the best phrase of the first
  // pass and decode again with them: the names then have to agree with the units the whole phrase points to.
  if (repairs.some(repair => repair.tokens.some(token => token.applied && token.margin < calibration.highMargin))) {
    let guess = text;
    for (const token of repairs.flatMap(repair => repair.tokens).filter(token => token.applied && token.accented).sort((a, b) => b.start - a.start)) guess = guess.slice(0, token.start) + token.accented + guess.slice(token.end);
    const wider = contextUnits(guess, knowledge);
    if ([...wider].some(id => !cellContext.has(id))) { cellContext = new Set([...cellContext, ...wider]); repairs = run(cellContext); }
  }
  let value = text;
  const applied = repairs.flatMap(repair => repair.tokens).filter(token => token.applied).sort((a, b) => b.start - a.start);
  for (const token of applied) {
    const replacement = token.ascii;
    // A dropped placeholder that leaves nothing takes its separator with it.
    if (!replacement) { value = value.slice(0, token.start).replace(/ +$/, "") + value.slice(token.end).replace(/^ +(?=[,;.])/, ""); continue; }
    value = value.slice(0, token.start) + replacement + value.slice(token.end);
  }
  const remaining = repairs.flatMap(repair => repair.tokens).filter(token => !token.applied && token.status !== "unchanged_legitimate_punctuation").length;
  return { value, changed: value !== text, segments: repairs, remainingPlaceholders: remaining };
}
