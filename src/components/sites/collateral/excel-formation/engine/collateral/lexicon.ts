import { loadConcepts, ONTOLOGY_VERSION, SLOT_VALUES, type Concept, type TextDomain } from "./ontology.ts";
import { toAscii } from "../geo/vn-text.ts";

/**
 * The indexes the domain recovery decodes with, built from a set of ontology concepts: accented syllable unigram/bigram counts, every contiguous
 * window of every phrase (the n-grams a damaged window is matched against, filed by the lengths of its words), the domains each syllable occurs in, and
 * the protected syllables that tell the values of a legal attribute apart.
 */
export interface Gram { syls: string[]; /** Concepts that contain this window. */ support: number; domains: Map<TextDomain, number>; /** The window is a whole concept phrase. */ whole: boolean }
const BOUNDARY_START = "\u0002", BOUNDARY_END = "\u0003", NUMBER = "\u0004";
const key = (a: string, b: string) => a + "\u0001" + b;
export const MAX_GRAM = 6;
const fold = (text: string) => toAscii(text);

/** Does a damaged word (lower case, composed) fit a syllable of the same length: every letter that is there equal up to marks, and a mark that is written must match. */
export function fits(pattern: readonly string[], syllable: readonly string[]): boolean {
  if (pattern.length !== syllable.length) return false;
  for (let i = 0; i < pattern.length; i++) {
    const p = pattern[i];
    if (p === "?") continue;
    const s = syllable[i];
    if (p !== s && !(fold(p) === p && fold(s) === p)) return false; // a plain letter matches its marked forms; a marked letter matches only itself
  }
  return true;
}

export class Lexicon {
  readonly version: string;
  readonly uni = new Map<string, number>();
  private readonly bi = new Map<string, number>();
  readonly total: number;
  private readonly byLen = new Map<number, { syl: string; chars: string[] }[]>();
  private readonly byFold = new Map<string, string[]>();
  private readonly grams = new Map<string, Gram[]>();
  private readonly gramsBySize = new Map<number, Gram[]>();
  private readonly domainOfSyllable = new Map<string, Map<TextDomain, number>>();
  readonly protectedSyllables = new Set<string>();
  private readonly memo = new Map<string, string[]>();
  readonly concepts: readonly Concept[];

  constructor(concepts: readonly Concept[] = loadConcepts(), version = ONTOLOGY_VERSION) {
    this.concepts = concepts; this.version = version;
    const gramIndex = new Map<string, Gram>();
    for (const concept of concepts) {
      // `#` stands for a number or a code (a text writes the number of a parcel, a contract, a frame after "số").
      const syls = concept.canonical.normalize("NFC").split(/\s+/).filter(Boolean).map(syl => syl === "#" ? NUMBER : syl);
      let previous = BOUNDARY_START;
      const weight = concept.weight ?? 1;
      for (const syl of syls) {
        this.uni.set(syl, (this.uni.get(syl) ?? 0) + weight);
        this.bi.set(key(previous, syl), (this.bi.get(key(previous, syl)) ?? 0) + weight);
        previous = syl;
        const domains = this.domainOfSyllable.get(syl) ?? new Map(); domains.set(concept.domain, (domains.get(concept.domain) ?? 0) + 1); this.domainOfSyllable.set(syl, domains);
      }
      this.bi.set(key(previous, BOUNDARY_END), (this.bi.get(key(previous, BOUNDARY_END)) ?? 0) + 1);
      for (let size = 2; size <= Math.min(MAX_GRAM, syls.length); size++) for (let at = 0; at + size <= syls.length; at++) {
        const window = syls.slice(at, at + size), id = window.join(" ");
        const gram = gramIndex.get(id) ?? { syls: window, support: 0, domains: new Map(), whole: false };
        gram.support++; gram.domains.set(concept.domain, (gram.domains.get(concept.domain) ?? 0) + 1);
        if (size === syls.length) gram.whole = true;
        gramIndex.set(id, gram);
      }
    }
    this.total = [...this.uni.values()].reduce((n, c) => n + c, 0);
    for (const syl of this.uni.keys()) {
      if (syl === NUMBER) continue; // a number or code is never a word to choose
      const chars = [...syl], list = this.byLen.get(chars.length); const entry = { syl, chars };
      if (list) list.push(entry); else this.byLen.set(chars.length, [entry]);
      const f = fold(syl), same = this.byFold.get(f); if (same) same.push(syl); else this.byFold.set(f, [syl]);
    }
    for (const list of this.byFold.values()) list.sort((a, b) => (this.uni.get(b) ?? 0) - (this.uni.get(a) ?? 0) || (a < b ? -1 : 1));
    for (const gram of gramIndex.values()) {
      const shape = gram.syls.map(s => [...s].length).join(","), list = this.grams.get(shape);
      if (list) list.push(gram); else this.grams.set(shape, [gram]);
      const sized = this.gramsBySize.get(gram.syls.length); if (sized) sized.push(gram); else this.gramsBySize.set(gram.syls.length, [gram]);
    }
    // Protected syllables: the ones that distinguish the values of a legal attribute (those every value shares are not).
    for (const values of Object.values(SLOT_VALUES)) {
      const sets = values.map(value => new Set(value.normalize("NFC").split(/\s+/)));
      const shared = new Set([...sets[0]].filter(syl => sets.every(set => set.has(syl))));
      for (const set of sets) for (const syl of set) if (!shared.has(syl)) this.protectedSyllables.add(syl);
    }
  }

  get size() { return this.uni.size; }
  count(syl: string) { return this.uni.get(syl) ?? 0; }
  /** Smoothed unigram probability. */
  p(syl: string) { return ((this.uni.get(syl) ?? 0) + 0.1) / (this.total + 0.1 * (this.uni.size + 1)); }
  /** P(next | previous), smoothed towards the unigram so an unseen pair is unlikely, not impossible. Digits are one symbol. */
  pBigram(previous: string, next: string) { return ((this.bi.get(key(previous, next)) ?? 0) + this.p(next)) / ((previous === BOUNDARY_START ? this.total / 8 : previous === NUMBER ? this.total / 8 : this.uni.get(previous) ?? 0) + 1); }
  static readonly START = BOUNDARY_START; static readonly END = BOUNDARY_END; static readonly NUMBER = NUMBER;
  knows(syl: string) { return this.uni.has(syl); }
  /** The spellings (with marks) of a word written without them, the most frequent first. */
  spellings(plain: string): string[] { return this.byFold.get(plain) ?? []; }
  domainsOf(syl: string): Map<TextDomain, number> | undefined { return this.domainOfSyllable.get(syl); }

  /**
   * Syllables that a damaged word (lower case, composed) can be. `spread` 1: every `?` is one letter. A larger spread lets a `?` stand for up to that many letters
   * (a mark lost together with the letter), used only when nothing fits with one.
   */
  candidates(pattern: string, spread = 1): string[] {
    const id = pattern + "\u0001" + spread, cached = this.memo.get(id); if (cached) return cached;
    const chars = [...pattern], out: string[] = [];
    if (spread === 1) { for (const entry of this.byLen.get(chars.length) ?? []) if (fits(chars, entry.chars)) out.push(entry.syl); }
    else {
      const regex = new RegExp("^" + chars.map(ch => ch === "?" ? `[a-z]{1,${spread}}` : fold(ch).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("") + "$");
      for (const syl of this.uni.keys()) if (!fits(chars, [...syl]) && regex.test(fold(syl)) && [...pattern].every(ch => ch === "?" || fold(ch) === ch || syl.includes(ch))) out.push(syl);
    }
    out.sort((a, b) => (this.uni.get(b) ?? 0) - (this.uni.get(a) ?? 0) || (a < b ? -1 : 1));
    this.memo.set(id, out);
    return out;
  }

  /**
   * The windows of the ontology that fit these (damaged or clean) words. A word whose `?` stands for a different number of letters (`allowed`: the syllables
   * it can be) is matched by those, so the windows are searched by size instead of by the lengths of the words.
   */
  matchWindow(patterns: readonly string[][], allowed: readonly (ReadonlySet<string> | null)[] = []): Gram[] {
    const variable = allowed.some(set => set);
    const list = variable ? this.gramsBySize.get(patterns.length) : this.grams.get(patterns.map(p => p.length).join(","));
    return list ? list.filter(gram => gram.syls.every((syl, i) => allowed[i] ? allowed[i]!.has(syl) : fits(patterns[i], [...syl]))) : [];
  }
}
