import { abbreviationsOf, type GeoKnowledge, type NameGroup } from "./geo-knowledge.ts";
import { foldKey, pieces } from "./vn-text.ts";

/**
 * Which parts of a cell's text are an address or a location, judged from content: how names begin (the types the dataset itself shows), whether
 * pieces of the text are administrative units or place names that exist, how specific the vocabulary is, and, as lesser clues, the column's header,
 * the other cells of the column and the neighbouring segments of the same cell. No header is required and no sheet is special. A text that does not
 * look like an address is left to the generic repair.
 */
export type SpanClass = "ADMINISTRATIVE_ADDRESS" | "STREET_OR_LOCALITY" | "PROPERTY_LOCATION_DESCRIPTION" | "PROJECT_OR_BUILDING_NAME" | "GENERAL_VIETNAMESE_TEXT" | "NON_ADDRESS_TEXT" | "AMBIGUOUS";
export const ADDRESS_CLASSES: readonly SpanClass[] = ["ADMINISTRATIVE_ADDRESS", "STREET_OR_LOCALITY", "PROPERTY_LOCATION_DESCRIPTION", "PROJECT_OR_BUILDING_NAME"];
export interface Segment { start: number; end: number; text: string; class: SpanClass; score: number; evidence: string[] }
export interface ClassifyHints {
  /** The header text of the column, when the sheet has one. A weak clue. */
  header?: string;
  /** The share of the column's other cells that look like addresses (0..1). A weak clue. */
  columnShare?: number;
}

/** Groups whose types name a place (administrative units, streets, areas, villages); the other groups (shops, schools, ...) are weaker evidence. */
const STRONG: readonly NameGroup[] = ["province", "district", "ward", "street", "place"];
interface TypeInfo { phrase: string; groups: Set<NameGroup>; strong: boolean }
/** Types and their abbreviations, derived from the knowledge once. */
export class TypeIndex {
  /** The types that fit a damaged type word (huy?n), the strong ones first. */
  declare findPatterns: (parts: string[]) => TypeInfo[];
  readonly types = new Map<string, TypeInfo>();
  readonly abbreviations = new Map<string, TypeInfo[]>();
  readonly longest: number;
  private byShape = new Map<string, string[]>();
  constructor(knowledge: GeoKnowledge) {
    for (const [group, list] of knowledge.types) for (const phrase of list.keys()) {
      const key = foldKey(phrase), info = this.types.get(key) ?? { phrase, groups: new Set<NameGroup>(), strong: false };
      info.groups.add(group); if (STRONG.includes(group)) info.strong = true;
      this.types.set(key, info);
    }
    for (const info of this.types.values()) if (info.strong) for (const abbreviation of abbreviationsOf(info.phrase)) { const list = this.abbreviations.get(abbreviation); if (list) list.push(info); else this.abbreviations.set(abbreviation, [info]); }
    for (const key of this.types.keys()) { const shape = key.split(" ").map(part => part.length).join(","); const list = this.byShape.get(shape); if (list) list.push(key); else this.byShape.set(shape, [key]); }
    this.longest = Math.max(1, ...[...this.types.keys()].map(key => key.split(" ").length));
  }
}
TypeIndex.prototype.findPatterns = function findPatterns(this: TypeIndex, parts: string[]) {
  const shape = parts.map(part => part.length).join(","), found: TypeInfo[] = [];
  for (const key of (this as unknown as { byShape: Map<string, string[]> }).byShape.get(shape) ?? []) { const have = key.split(" "); if (parts.every((part, i) => [...part].every((ch, j) => ch === "?" || ch === have[i][j]))) found.push(this.types.get(key)!); }
  return found.sort((a, b) => Number(b.strong) - Number(a.strong));
};
const indexes = new WeakMap<GeoKnowledge, TypeIndex>();
export const typeIndexOf = (knowledge: GeoKnowledge): TypeIndex => { let index = indexes.get(knowledge); if (!index) indexes.set(knowledge, index = new TypeIndex(knowledge)); return index; };

/** Split a cell into the pieces an address is written in: comma/semicolon/line separated, each trimmed, with offsets into the cell. */
export function segmentsOf(text: string): { start: number; end: number; text: string }[] {
  const out: { start: number; end: number; text: string }[] = [];
  let from = 0;
  const flush = (to: number) => { const raw = text.slice(from, to), lead = raw.length - raw.trimStart().length, body = raw.trim(); if (body) out.push({ start: from + lead, end: from + lead + body.length, text: body }); };
  for (let i = 0; i < text.length; i++) if (",;|\n\r".includes(text[i])) { flush(i); from = i + 1; }
  flush(text.length);
  return out;
}

const NUMBER = /^\d+[a-z]?$/i;
/** Fold a word for matching: lower case without marks; `?` stays. */
export const foldWord = (word: string): string => foldKey(word.replace(/\?/g, "\u0001")).replace(/\u0001/g, "?");

export function classifySegment(segment: string, knowledge: GeoKnowledge, hints: ClassifyHints = {}): { class: SpanClass; score: number; evidence: string[] } {
  const index = typeIndexOf(knowledge);
  const wordPieces = pieces(segment).filter(piece => piece.kind === "word"), words = wordPieces.map(piece => piece.text);
  const folds = words.map(foldWord);
  const evidence: string[] = [];
  let score = 0;
  if (!words.length) return { class: "NON_ADDRESS_TEXT", score: 0, evidence };

  // 1. A type word (Phường, Hẻm, Chung cư, ...) or its abbreviation, followed by something it can introduce. Strong types count fully, the others half.
  const typeGroups = new Set<NameGroup>();
  let typeScore = 0, typeHits = 0;
  // A type introduces something that exists: a number (house, ward and alley numbers), or a name that really follows this type in the data.
  const introduces = (hit: TypeInfo, follow: string | undefined) => follow !== undefined && (NUMBER.test(follow) ? hit.strong : knowledge.matchWindow([...foldKey(hit.phrase).split(" "), follow], 1).length > 0);
  for (let at = 0; at + 1 < folds.length; at++) {
    let picked: TypeInfo | undefined, size = 0;
    for (let trySize = Math.min(index.longest, folds.length - at - 1); trySize >= 1 && !picked; trySize--) {
      const parts = folds.slice(at, at + trySize), follow = folds[at + trySize];
      const options = [index.types.get(parts.join(" ")), ...(parts.some(part => part.includes("?")) ? index.findPatterns(parts) : [])].filter((option): option is TypeInfo => !!option);
      picked = options.find(option => introduces(option, follow)); if (picked) size = trySize;
    }
    if (!picked && !words[at].includes("?")) {
      const abbreviated = index.abbreviations.get(folds[at]);
      const dotted = /^\.[\p{L}\d?]/u.test(segment.slice(wordPieces[at].end, wordPieces[at].end + 2)) || NUMBER.test(folds[at + 1]);
      if (abbreviated && (folds[at].length >= 2 || dotted)) { picked = abbreviated.find(option => introduces(option, folds[at + 1])); size = 1; }
    }
    if (picked) { typeHits++; typeScore += picked.strong ? 3 : 1.5; for (const group of picked.groups) typeGroups.add(group); at += size - 1; }
  }
  if (typeHits) { score += Math.min(4, typeScore); evidence.push(`type words: ${typeHits}`); }

  // 2. Windows of clean words that are the core of an administrative unit.
  let admin = 0;
  for (let size = Math.min(4, folds.length); size >= 1; size--) for (let at = 0; at + size <= folds.length; at++) {
    const window = folds.slice(at, at + size);
    if (window.some(word => word.includes("?")) || size === 1 && NUMBER.test(window[0])) continue;
    if (knowledge.unitsByCore.get(window.join(" "))?.length && size >= 2 - Number(typeHits > 0)) { admin++; at += size - 1; }
  }
  if (admin) { score += Math.min(2, 1 + 0.5 * admin); evidence.push(`administrative units: ${admin}`); }

  // 3. Place-name phrases: two or more clean syllables in a row that are written together in several street, place or administrative names.
  let phrases = 0;
  for (let at = 0; at + 1 < folds.length; at++) {
    const pair = [folds[at], folds[at + 1]];
    if (pair.some(word => word.includes("?") || NUMBER.test(word))) continue;
    const found = knowledge.matchWindow(pair, 30).filter(match => match.name.group !== "feature");
    if (found.length >= 3) { phrases++; at++; }
  }
  if (phrases) { score += Math.min(1.5, 0.5 * phrases); evidence.push(`place-name phrases: ${phrases}`); }

  // 4. A booster only: the share of weighted syllables that occur in names (rare ones count more). Needs another clue to matter.
  let known = 0, total = 0;
  for (const fold of folds) {
    if (fold.includes("?") || NUMBER.test(fold)) continue;
    const weight = 1 + Math.log(1 + knowledge.totalTokens / (1 + (knowledge.vocabulary.get(fold) ?? 0))) / 4;
    total += weight; if (knowledge.knows(fold)) known += weight;
  }
  const share = total ? known / total : 0;
  if (score > 0 && share > 0.6) { score += (share - 0.6) * 2; evidence.push(`vocabulary ${(share * 100).toFixed(0)}%`); }

  // 5. Numbers next to a type word are house, parcel or unit numbers; lesser clues from the column.
  if (typeHits && folds.some(fold => NUMBER.test(fold))) { score += 0.5; evidence.push("number beside a type word"); }
  if (hints.header && /dia ?chi|dia ?diem|vi ?tri|noi ?o|dia ?ban|address|location/.test(foldKey(hints.header))) { score += 1.5; evidence.push("column header"); }
  if ((hints.columnShare ?? 0) >= 0.3) { score += 1; evidence.push("column of addresses"); }

  const hasStreet = typeGroups.has("street"), hasPlace = typeGroups.has("place") || typeGroups.has("feature");
  if (score >= 3) {
    const cls: SpanClass = hasStreet ? "STREET_OR_LOCALITY" : admin && !hasPlace ? "ADMINISTRATIVE_ADDRESS" : hasPlace ? (words.length >= 7 ? "PROPERTY_LOCATION_DESCRIPTION" : "PROJECT_OR_BUILDING_NAME") : words.length >= 7 ? "PROPERTY_LOCATION_DESCRIPTION" : "ADMINISTRATIVE_ADDRESS";
    return { class: cls, score, evidence };
  }
  if (score >= 1.5) return { class: "AMBIGUOUS", score, evidence };
  return { class: share >= 0.75 && words.length >= 2 ? "GENERAL_VIETNAMESE_TEXT" : "NON_ADDRESS_TEXT", score, evidence };
}

/**
 * Classify every segment of a cell. A segment that is only ambiguous on its own (a bare abbreviation and a name, for instance) is taken as part of the
 * address when a neighbouring segment of the same cell is clearly one.
 */
export function classifySegments(text: string, knowledge: GeoKnowledge, hints: ClassifyHints = {}): Segment[] {
  const segments: Segment[] = segmentsOf(text).map(part => ({ ...part, ...classifySegment(part.text, knowledge, hints) }));
  // In a list of address parts the parts without a type word of their own (a street name, a house number) belong to it too.
  if (segments.some(segment => isAddressClass(segment.class) && segment.score >= 3.5))
    for (const segment of segments) if ((segment.class === "AMBIGUOUS" || segment.class === "GENERAL_VIETNAMESE_TEXT" || segment.class === "NON_ADDRESS_TEXT") && segment.text.split(/s+/).length <= 8) { segment.class = "ADMINISTRATIVE_ADDRESS"; segment.evidence.push("part of an address list in the same cell"); }
  return segments;
}
export const isAddressClass = (cls: SpanClass): boolean => ADDRESS_CLASSES.includes(cls);
