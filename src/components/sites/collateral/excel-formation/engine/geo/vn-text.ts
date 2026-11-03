/**
 * Vietnamese text handling for the geographic recovery engine: Unicode normalisation, the conversion to Vietnamese without marks, and the
 * inventory of accented letters. Nothing here is a list of words; the letter inventory is composed from Unicode rules, not typed.
 */
export const nfc = (text: string): string => text.normalize("NFC");

/**
 * Vietnamese without diacritics: NFD, drop every combining mark, then the two letters that carry a stroke instead of a mark (`đ`, `Đ`) are mapped
 * explicitly, because Unicode does not decompose them. Case, digits and punctuation are untouched. Never lower-cases.
 */
export function toAscii(text: string): string {
  return text.normalize("NFD").replace(/\p{M}+/gu, "").replace(/đ/g, "d").replace(/Đ/g, "D").normalize("NFC");
}
/** The key used to search: ASCII, lower case, single spaces. */
export const foldKey = (text: string): string => toAscii(text).toLowerCase().replace(/\s+/g, " ").trim();

export type CaseShape = "upper" | "title" | "lower";
/** The case shape of a word as written, judged on its letters only (a `?` and digits are ignored). */
export function caseShape(word: string): CaseShape {
  const letters = [...word].filter(ch => /\p{L}/u.test(ch));
  if (!letters.length) return "lower";
  if (letters.length > 1 && letters.every(ch => ch === ch.toUpperCase() && ch !== ch.toLowerCase())) return "upper";
  return letters[0] === letters[0].toUpperCase() && letters[0] !== letters[0].toLowerCase() ? "title" : "lower";
}
/** Put a lower-case candidate into the case shape of the word it replaces. */
export function withCase(candidate: string, shape: CaseShape): string {
  if (shape === "upper") return candidate.toUpperCase();
  if (shape === "title") return candidate.charAt(0).toUpperCase() + candidate.slice(1);
  return candidate;
}

const TONES = ["̀", "́", "̉", "̃", "̣"];
const MODIFIERS: Record<string, string[]> = { a: ["̆", "̂"], e: ["̂"], o: ["̂", "̛"], u: ["̛"] };
/**
 * Every lower-case Vietnamese letter that is one code point and has base letter `base` once its marks are removed, composed from the base letter,
 * the shape marks (breve, circumflex, horn) and the five tone marks. `d` also has `đ`. The result is derived, so no combination can be forgotten.
 */
export function accentedVariants(base: string): string[] {
  const out = new Set<string>([base]);
  if (base === "d") out.add("đ");
  if (!"aeiouy".includes(base)) return [...out]; // tone marks belong to the vowels only
  const shapes = ["", ...(MODIFIERS[base] ?? [])];
  for (const shape of shapes) {
    const shaped = (base + shape).normalize("NFC");
    if ([...shaped].length === 1) out.add(shaped);
    for (const tone of TONES) { const toned = (base + shape + tone).normalize("NFC"); if ([...toned].length === 1) out.add(toned); }
  }
  return [...out];
}
/** All letters of the Vietnamese alphabet (lower case, one code point each): the vowels with their marks, `đ` and the plain consonants. */
export const VIETNAMESE_LETTERS: readonly string[] = [..."abcdefghiklmnopqrstuvxy"].flatMap(accentedVariants);

/** True for a word made only of letters (with marks) that Vietnamese uses. */
export const isVietnameseWord = (word: string): boolean => word.length > 0 && [...word.toLowerCase()].every(ch => VIETNAMESE_LETTERS.includes(nfc(ch)));

/** Split text into the pieces a corrupted address is made of: words (letters, digits and `?`), and single other characters. Offsets index the input. */
export interface Piece { text: string; start: number; end: number; kind: "word" | "other" | "space" }
export function pieces(text: string): Piece[] {
  const out: Piece[] = [];
  for (const match of text.matchAll(/[\p{L}\p{M}\d?]+|\s+|[^\s\p{L}\p{M}\d?]/gu)) {
    const kind = /^\s/.test(match[0]) ? "space" : /^[\p{L}\p{M}\d?]/u.test(match[0]) ? "word" : "other";
    out.push({ text: match[0], start: match.index!, end: match.index! + match[0].length, kind });
  }
  return out;
}
