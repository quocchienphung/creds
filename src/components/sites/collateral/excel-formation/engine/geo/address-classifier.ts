import { abbreviationsOf, type GeoKnowledge, type NameGroup } from "./geo-knowledge.ts";
import { foldKey, pieces } from "./vn-text.ts";

/**
 * Which parts of a cell's text are an address or a location, judged from content: how names begin (the types the dataset itself shows), whether
 * pieces of the text are administrative units or places that exist, how specific the vocabulary is, and, as lesser clues, the column's header and the
 * other cells of the same column. No headers are required and no sheet is special. A text that does not look like an address is left to the generic repair.
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

interface TypeInfo { phrase: string; groups: Set<NameGroup> }
/** Types and their abbreviations, derived from the knowledge once. */
export class TypeIndex {
  readonly types = new Map<string, TypeInfo>();
  readonly abbreviations = new Map<string, TypeInfo[]>();
  readonly longest: number;
  constructor(knowledge: GeoKnowledge) {
    for (const [group, list] of knowledge.types) for (const phrase of list.keys()) {
      const key = foldKey(phrase), info = this.types.get(key) ?? { phrase, groups: new Set<NameGroup>() };
      info.groups.add(group); this.types.set(key, info);
    }
    for (const info of this.types.values()) for (const abbreviation of abbreviationsOf(info.phrase)) { const list = this.abbreviations.get(abbreviation); if (list) list.push(info); else this.abbreviations.set(abbreviation, [info]); }
    this.longest = Math.max(1, ...[...this.types.keys()].map(key => key.split(" ").length));
  }
}
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

  // 1. A type word (Phường, Hẻm, Chung cư, ...) or its abbreviation, followed by something it can introduce.
  let typeGroups = new Set<NameGroup>(), typeHits = 0;
  for (let at = 0; at < folds.length; at++) {
    let hit: TypeInfo | undefined;
    for (let size = Math.min(index.longest, folds.length - at); size >= 1 && !hit; size--) hit = index.types.get(folds.slice(at, at + size).join(" "));
    if (!hit && at + 1 < folds.length) { const abbreviated = index.abbreviations.get(folds[at]); const dotted = /^\.[\p{L}\d?]/u.test(segment.slice(wordPieces[at].end, wordPieces[at].end + 2)) || NUMBER.test(folds[at + 1]); if (abbreviated && (folds[at].length >= 2 || dotted) && !words[at].includes("?")) hit = abbreviated[0]; }
    if (hit && at + 1 < folds.length) { typeHits++; for (const group of hit.groups) typeGroups.add(group); }
  }
  if (typeHits) { score += Math.min(3, 2 + 0.5 * (typeHits - 1)); evidence.push(`type words: ${typeHits}`); }

  // 2. Windows of clean words that are the core of an administrative unit.
  let admin = 0;
  for (let size = Math.min(4, folds.length); size >= 1; size--) for (let at = 0; at + size <= folds.length; at++) {
    const window = folds.slice(at, at + size);
    if (window.some(word => word.includes("?") || NUMBER.test(word) && size === 1)) continue;
    const units = knowledge.unitsByCore.get(window.join(" "));
    if (units?.length) { admin++; at += size - 1; }
  }
  if (admin) { score += Math.min(2.5, 1.5 + 0.5 * (admin - 1)); evidence.push(`administrative units: ${admin}`); }

  // 3. How specific the vocabulary is: the share of weighted syllables that occur in names (rare ones count more).
  let known = 0, total = 0;
  for (const fold of folds) {
    if (fold.includes("?") || NUMBER.test(fold)) continue;
    const weight = 1 + Math.log(1 + knowledge.totalTokens / (1 + (knowledge.vocabulary.get(fold) ?? 0))) / 4;
    total += weight; if (knowledge.knows(fold)) known += weight;
  }
  const share = total ? known / total : 0;
  if (total && share > 0.6) { score += (share - 0.6) * 4; evidence.push(`vocabulary ${(share * 100).toFixed(0)}%`); }

  // 4. Numbers next to a type word are house, parcel or unit numbers.
  if (typeHits && folds.some(fold => NUMBER.test(fold))) { score += 0.5; evidence.push("number beside a type word"); }
  // 5. Lesser clues.
  if (hints.header && /dia ?chi|dia ?diem|vi ?tri|noi ?o|dia ?ban|address|location/.test(foldKey(hints.header))) { score += 1.5; evidence.push("column header"); }
  if ((hints.columnShare ?? 0) >= 0.3) { score += 1; evidence.push("column of addresses"); }

  const hasStreet = typeGroups.has("street"), hasPlace = typeGroups.has("place") || typeGroups.has("feature");
  if (score >= 3) {
    const cls: SpanClass = admin && !hasStreet && !hasPlace ? "ADMINISTRATIVE_ADDRESS" : hasStreet ? "STREET_OR_LOCALITY" : hasPlace ? (words.length >= 7 ? "PROPERTY_LOCATION_DESCRIPTION" : "PROJECT_OR_BUILDING_NAME") : words.length >= 7 ? "PROPERTY_LOCATION_DESCRIPTION" : "ADMINISTRATIVE_ADDRESS";
    return { class: cls, score, evidence };
  }
  if (score >= 1.5) return { class: "AMBIGUOUS", score, evidence };
  return { class: share >= 0.75 && words.length >= 2 ? "GENERAL_VIETNAMESE_TEXT" : "NON_ADDRESS_TEXT", score, evidence };
}

/** Classify every segment of a cell. */
export function classifySegments(text: string, knowledge: GeoKnowledge, hints: ClassifyHints = {}): Segment[] {
  return segmentsOf(text).map(part => ({ ...part, ...classifySegment(part.text, knowledge, hints) }));
}
export const isAddressClass = (cls: SpanClass): boolean => ADDRESS_CLASSES.includes(cls);
