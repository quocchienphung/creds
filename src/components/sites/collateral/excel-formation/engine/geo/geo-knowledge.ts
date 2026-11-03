import { foldKey, nfc } from "./vn-text.ts";

/**
 * The local Vietnam geographic knowledge: names of administrative units, streets, places and projects, read from the dataset package built by
 * scripts/geo (official administrative seeds, a public address corpus, OpenStreetMap names). Everything the engine knows comes from those rows:
 *   - a language model over ACCENTED syllables (unigram and bigram counts), trained on the names themselves;
 *   - an index of the names by their syllables without marks, so a damaged word can be matched against what exists;
 *   - the hierarchy province > district > ward, kept in the era it was recorded in;
 *   - the words that start names (Phường, Hẻm, Chung cư, ...), derived from how names begin, not typed.
 * No answer for a particular damaged word exists anywhere in this file.
 */
export interface GeoDataset {
  manifest: { datasetVersion: string; sources: { id: string; name: string; url: string; license: string; retrieved?: string }[]; counts: Record<string, number> };
  admin: { current: { provinces: [string, string][]; wards: [string, string, string][] }; recorded: { provinces: string[]; districts: [string, number][]; wards: [string, number][] } };
  streets: [string, number][];
  osm: { kinds: string[]; names: [string, number, number][] };
}
export type NameGroup = "province" | "district" | "ward" | "street" | "place" | "feature" | "admin_osm" | "address_part";
export interface Gaz { id: number; text: string; toks: string[]; fold: string[]; group: NameGroup; kind: string; era: "recorded" | "current" | "osm"; /** Parent unit (province > district > ward chain), when the source gives one. */ parent: number }
export interface Unit { id: number; level: 0 | 1 | 2; text: string; type: string; core: string; coreFold: string; parent: number; era: "recorded" | "current"; code?: string }
export interface SyllableCandidate { fold: string; variants: { text: string; count: number }[]; total: number }

const WORD = /[\p{L}\p{M}\d]+/gu;
export const tokensOf = (text: string): string[] => nfc(text).match(WORD) ?? [];
const isNumeric = (token: string) => /^\d+$/.test(token);
export const LM_NUMBER = "<n>";
const lmToken = (token: string) => isNumeric(token) ? LM_NUMBER : token.toLowerCase();
const groupOfOsm = (kind: string): NameGroup => kind.startsWith("road:") ? "street" : kind.startsWith("place:") ? "place" : kind.startsWith("admin:") ? "admin_osm" : kind.startsWith("addr:") ? "address_part" : kind.startsWith("landuse:") ? "place" : "feature";

export class GeoKnowledge {
  readonly version: string;
  readonly names: Gaz[] = [];
  readonly units: Unit[] = [];
  readonly unigram = new Map<string, number>();
  readonly bigram = new Map<string, number>();
  totalTokens = 0;
  readonly byFold = new Map<string, SyllableCandidate>();
  private byLength = new Map<number, string[]>();
  private postings = new Map<string, number[]>();
  private memo = new Map<string, SyllableCandidate[]>();
  /** Words and word pairs that start names of each group, with how many names they start (derived, see leadingTypes). */
  readonly types = new Map<NameGroup, Map<string, number>>();
  readonly unitsByCore = new Map<string, Unit[]>();
  /** The syllables of every name, without marks: the vocabulary an address can be made of. */
  readonly vocabulary = new Map<string, number>();

  constructor(data: GeoDataset, options: { exclude?: (name: string, group: NameGroup) => boolean } = {}) {
    this.version = data.manifest.datasetVersion;
    const exclude = options.exclude ?? (() => false);
    const { recorded, current } = data.admin;
    const add = (text: string, group: NameGroup, kind: string, era: Gaz["era"], parent: number) => {
      const name = nfc(text).trim();
      if (!name || exclude(name, group)) return -1;
      const toks = tokensOf(name);
      if (!toks.length) return -1;
      const id = this.names.length;
      this.names.push({ id, text: name, toks, fold: toks.map(token => foldKey(token)), group, kind, era, parent });
      return id;
    };
    // Administrative units, each kept in the era it comes from.
    const unitOf = (text: string, level: Unit["level"], parent: number, era: Unit["era"], code?: string) => { const id = this.units.length; this.units.push({ id, level, text: nfc(text), type: "", core: "", coreFold: "", parent, era, ...(code ? { code } : {}) }); add(text, (["province", "district", "ward"] as const)[level], `admin:${level}`, era, parent); return id; };
    const provinces = recorded.provinces.map(name => unitOf(name, 0, -1, "recorded"));
    const districts = recorded.districts.map(([name, province]) => unitOf(name, 1, provinces[province], "recorded"));
    const wards = recorded.wards.map(([name, district]) => unitOf(name, 2, districts[district], "recorded"));
    const currentProvince = new Map(current.provinces.map(([code, name]) => [code, unitOf(name, 0, -1, "current", code)]));
    for (const [code, name, province] of current.wards) unitOf(name, 2, currentProvince.get(province) ?? -1, "current", code);
    for (const [name, ward] of data.streets) add(name, "street", "street", "recorded", wards[ward] ?? -1);
    for (const [name, kind, count] of data.osm.names) { void count; add(name, groupOfOsm(data.osm.kinds[kind]), data.osm.kinds[kind], "osm", -1); }

    for (const group of ["province", "district", "ward", "street", "place", "feature"] as const) this.types.set(group, leadingTypes(this.names.filter(item => item.group === group)));
    this.splitUnits();
    this.train();
  }

  /** Split "Phường Đức Hòa" into its type and core with the types derived from the data of its level. */
  private splitUnits() {
    for (const unit of this.units) {
      const level = (["province", "district", "ward"] as const)[unit.level], types = this.types.get(level)!;
      const toks = tokensOf(unit.text);
      const two = toks.slice(0, 2).join(" ").toLowerCase(), one = toks[0]?.toLowerCase() ?? "";
      const type = toks.length > 2 && types.has(two) ? two : toks.length > 1 && types.has(one) ? one : "";
      unit.type = type;
      unit.core = toks.slice(type ? type.split(" ").length : 0).join(" ");
      unit.coreFold = foldKey(unit.core);
      if (!unit.coreFold) continue;
      const list = this.unitsByCore.get(unit.coreFold); if (list) list.push(unit); else this.unitsByCore.set(unit.coreFold, [unit]);
    }
  }

  private train() {
    const seenSyllable = new Map<string, Map<string, number>>();
    for (const name of this.names) {
      let previous = "^";
      for (const token of name.toks) {
        const word = lmToken(token), fold = foldKey(word);
        this.unigram.set(word, (this.unigram.get(word) ?? 0) + 1); this.totalTokens++;
        const key = previous + " " + word; this.bigram.set(key, (this.bigram.get(key) ?? 0) + 1);
        previous = word;
        if (word !== LM_NUMBER) { let forms = seenSyllable.get(fold); if (!forms) seenSyllable.set(fold, forms = new Map()); forms.set(word, (forms.get(word) ?? 0) + 1); this.vocabulary.set(fold, (this.vocabulary.get(fold) ?? 0) + 1); }
      }
      const end = previous + " $"; this.bigram.set(end, (this.bigram.get(end) ?? 0) + 1);
      for (const fold of new Set(name.fold)) { const list = this.postings.get(fold); if (list) list.push(name.id); else this.postings.set(fold, [name.id]); }
    }
    for (const [fold, forms] of seenSyllable) {
      const variants = [...forms].map(([text, count]) => ({ text, count })).sort((a, b) => b.count - a.count || (a.text < b.text ? -1 : 1));
      this.byFold.set(fold, { fold, variants, total: variants.reduce((n, item) => n + item.count, 0) });
      const bucket = this.byLength.get(fold.length); if (bucket) bucket.push(fold); else this.byLength.set(fold.length, [fold]);
    }
  }

  /** Probability of an accented syllable (add-one over the vocabulary). */
  p(word: string): number { return ((this.unigram.get(word) ?? 0) + 1) / (this.totalTokens + this.unigram.size + 1); }
  /** P(next | previous), interpolated with the unigram so an unseen pair is unlikely and not impossible. */
  pBigram(previous: string, next: string): number {
    const pair = this.bigram.get(previous + " " + next) ?? 0, base = this.unigram.get(previous) ?? 0;
    const lambda = base / (base + 3);
    return lambda * (pair / Math.max(1, base)) + (1 - lambda) * this.p(next);
  }

  /**
   * Syllables that fit a word with damaged letters. `pattern` is lower case without marks, a `?` stands for one letter (or, with `spread`, for one to
   * `spread` letters when nothing fits one-to-one). Known letters must match; marks of the original are not asked for.
   */
  syllableCandidates(pattern: string, spread = 1): SyllableCandidate[] {
    const key = pattern + "\u0001" + spread, cached = this.memo.get(key);
    if (cached) return cached;
    const out: SyllableCandidate[] = [];
    const regex = new RegExp("^" + [...pattern].map(ch => ch === "?" ? `[a-z\\d]{1,${spread}}` : ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("") + "$");
    const lengths = spread === 1 ? [pattern.length] : [...Array(pattern.length * spread).keys()].map(n => n + 1).filter(n => n >= pattern.length && n <= pattern.length * spread);
    for (const length of lengths) for (const fold of this.byLength.get(length) ?? []) if (regex.test(fold)) out.push(this.byFold.get(fold)!);
    out.sort((a, b) => b.total - a.total);
    this.memo.set(key, out);
    return out;
  }

  /** Names that hold the window of syllables (patterns without marks, `?` for a damaged letter) as consecutive syllables, best known first. */
  matchWindow(window: string[], limit = 200): { name: Gaz; offset: number }[] {
    const clean = window.map((token, at) => ({ token, at })).filter(item => !item.token.includes("?"));
    if (!clean.length) return [];
    let best: number[] | undefined;
    for (const item of clean) { const list = this.postings.get(item.token); if (!list) return []; if (!best || list.length < best.length) best = list; }
    const out: { name: Gaz; offset: number }[] = [];
    for (const id of best!) {
      const name = this.names[id];
      for (let offset = 0; offset + window.length <= name.fold.length; offset++) {
        if (window.every((token, at) => { const have = name.fold[offset + at]; return have.length === token.length && [...token].every((ch, i) => ch === "?" || ch === have[i]); })) { out.push({ name, offset }); break; }
      }
      if (out.length >= limit) break;
    }
    return out;
  }

  /** True when this word, without marks, is a syllable that occurs in some name. */
  knows(fold: string): boolean { return this.vocabulary.has(fold); }
}

/**
 * The words (or pairs of words) that start names of a group, derived from how the names begin: a leading word or pair counts as a type when it starts at
 * least `share` of the group's names. (Phường, Xã, Thị trấn for wards; Hẻm, Đường, Ngõ for streets; whatever else the data shows.)
 */
export function leadingTypes(names: Gaz[], share = 0.004): Map<string, number> {
  const one = new Map<string, number>(), two = new Map<string, number>();
  for (const name of names) {
    const first = name.toks[0]?.toLowerCase(); if (!first || isNumeric(first)) continue;
    one.set(first, (one.get(first) ?? 0) + 1);
    if (name.toks.length > 2) { const pair = first + " " + name.toks[1].toLowerCase(); if (!isNumeric(name.toks[1])) two.set(pair, (two.get(pair) ?? 0) + 1); }
  }
  const floor = Math.max(3, Math.ceil(names.length * share)), out = new Map<string, number>();
  for (const [word, count] of one) if (count >= floor) out.set(word, count);
  // A pair is a type of its own only when it accounts for most of what its first word starts (Thành phố, Thị trấn, Quốc lộ), not a name that happens to repeat.
  for (const [pair, count] of two) if (count >= floor && count >= 0.6 * (one.get(pair.split(" ")[0]) ?? Infinity)) out.set(pair, count);
  return out;
}

/** Abbreviations a type can be written as: its initials, and its first letter when it is one word. Generated, not listed. */
export function abbreviationsOf(type: string): string[] {
  const parts = foldKey(type).split(" ");
  const out = new Set<string>([parts.map(part => part[0]).join("")]);
  if (parts.length === 1) out.add(parts[0].slice(0, 2));
  return [...out];
}
