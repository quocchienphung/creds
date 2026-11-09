import { analyzeValue, hasDiacritics, stripDiacritics, tryDecodeMojibake } from "./detect.ts";
import type { ColumnSpec } from "./mapping-profiles.ts";
import { specRoleOf } from "./sheet-scan.ts";

/**
 * Deterministic cleaning of strange characters, the part of the repair that needs no evidence: every step either undoes an encoding accident that can
 * be proven (the result re-encodes to exactly the input) or removes a character that carries no text. Nothing here guesses a letter.
 */
export const CLEAN_VERSION = "text-clean-1";

const hex = (code: number) => "\\u" + code.toString(16).padStart(4, "0");
// The Windows-1252 character of every byte: how UTF-8 text looks after it was read as 1252 (the same table `tryDecodeMojibake` inverts).
const decoder = new TextDecoder("windows-1252");
const klass = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => hex(decoder.decode(Uint8Array.of(from + i)).charCodeAt(0))).join("");
const CONT = klass(0x80, 0xbf);
/** One UTF-8 sequence as the mis-read text shows it: a lead byte and exactly as many continuation bytes as that lead calls for. */
const SEQUENCE = new RegExp(`[${klass(0xc2, 0xdf)}][${CONT}]|[${klass(0xe0, 0xef)}][${CONT}]{2}|[${klass(0xf0, 0xf4)}][${CONT}]{3}`, "g");
const CONTROL = new RegExp("[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f-\\u009f]", "g");
const ZERO_WIDTH = new RegExp("[\\u200b-\\u200f\\u2028\\u2029\\u202a-\\u202e\\u2060-\\u2064\\u00ad\\ufeff\\u180e]", "g");
/** A `?` that stands alone between spaces. */
const STANDALONE = /\s+\?+(?=\s|$)|^\?+\s+/g;
/** A number (or a date, or a numeric code) with a `?` at an edge: a legacy export loses letters that carry marks, never digits, so the `?` is stray. */
const NUMBER_WITH_QUESTION = /^\?*\d[\d.,\/\- ]*\?*$/;
const SPACES = new RegExp("[\\t\\u00a0\\u2000-\\u200a\\u202f\\u205f\\u3000]", "g");

/** Decode each mis-read UTF-8 sequence on its own, so one damaged word does not stop the rest of a mixed text (real Vietnamese letters next to it) from being read. */
export const decodeMojibakeRuns = (text: string) => text.replace(SEQUENCE, run => tryDecodeMojibake(run) ?? run);

function pass(value: string, spec?: Pick<ColumnSpec, "role" | "noDiacritics">): string {
  let text = decodeMojibakeRuns(value).replace(CONTROL, "").replace(ZERO_WIDTH, "").replace(SPACES, " ").normalize("NFC");
  // A replacement character inside a word is a lost letter like any `?`, so it takes the same road; on its own it stays as it is.
  if (/\p{L}/u.test(text)) text = text.replace(/\ufffd/g, "?");
  if (text.includes("?") && NUMBER_WITH_QUESTION.test(text.trim())) text = text.trim().replace(/^\?+|\?+$/g, "");
  // What is left is judged by the rules of the column: spaces at the edges, and repeated spaces where the column is a code, a name or a list.
  for (const finding of analyzeValue(text, spec ?? { role: specRoleOf(text) }, { diacriticPolicy: false })) {
    if (finding.category === "WHITESPACE_ANOMALY" && finding.fix && !finding.fix.lossy && finding.proposedValue !== undefined) text = finding.proposedValue;
  }
  return text;
}

/**
 * The worst case, applied only AFTER every recovery has had its chance: a `?` that stands alone is often a one-letter word the export lost (`Nha ? h?nh` is
 * `Nhà ở hình`), which the collateral recovery restores from the ontology. What no recovery could settle is dropped. A text made only of them is left to be looked at.
 */
export function dropLoneQuestionMarks(text: string): string {
  const alone = text.replace(STANDALONE, "");
  return alone !== text && /[\p{L}\p{N}]/u.test(alone) ? alone : text;
}

const FOLD: Record<string, string> = { "ß": "ss", "æ": "ae", "Æ": "AE", "œ": "oe", "Œ": "OE", "ø": "o", "Ø": "O", "ł": "l", "Ł": "L", "ı": "i", "þ": "th", "Þ": "Th", "\u2010": "-", "\u2011": "-", "\u2012": "-", "\u2212": "-", "\u2032": "'", "\u00b2": "2", "\u00b3": "3", "\u00b9": "1", "\u2013": "-", "\u2014": "-", "\u2022": "-", "\u201c": "\"", "\u201d": "\"", "\u2018": "'", "\u2019": "'", "\u2026": "...", "\u00d7": "x", "\u00f7": "/", "\u00b1": "+/-", "\u2033": "\"", "\u02bc": "'" };
// What a text read in the wrong encoding leaves behind: the Latin-1 symbols and the Windows-1252 punctuation that are no letter and no mark Vietnamese uses.
const DEBRIS = new RegExp("[\\u00a1-\\u00ff\\u0152\\u0153\\u0160\\u0161\\u0178\\u017d\\u017e\\u0192\\u02c6\\u02dc\\u2020\\u2021\\u201a\\u201e\\u2030\\u2039\\u203a\\u2122\\u20ac\\u20ab]", "u");
/**
 * The export of this file is plain ASCII: every accented letter becomes its plain letter (ầ -> a, Đ -> d, ư -> u, the legacy eth too), typographic marks become
 * their ASCII form (– -> -, “ -> ", ² -> 2, × -> x) and signs with no ASCII form (° € ₫ § ® ©) and encoding debris are removed. Applied last, after every
 * recovery, because the marks are evidence while the text is being restored.
 */
export const toPlainText = (text: string) => {
  const plain = stripDiacritics(text).replace(/\u00d0/g, "D").replace(/\u00f0/g, "d");
  if (!/[^\x20-\x7e]/.test(plain)) return plain;
  // shortcut: other scripts (Cyrillic, CJK) and emoji stay as they are, they are text and not debris; they are listed as strange, never guessed.
  // Compatibility forms (ligatures, full-width letters, circled digits) have an ASCII reading of their own.
  const ascii = (ch: string) => { const k = ch.normalize("NFKD"); return /^[\x20-\x7e]+$/.test(k) ? k : null; };
  let dropped = false;
  const out = [...plain].map(ch => { if (KNOWN.test(ch)) return ch; const to = FOLD[ch] ?? (DEBRIS.test(ch) ? "" : ascii(ch) ?? ch); if (to === "") dropped = true; return to; }).join("");
  // shortcut: a removed sign leaves its spaces behind (`100.000 ₫`), so edges and doubled spaces are tidied only when something was removed.
  return dropped ? out.replace(/ {2,}/g, " ").replace(/^ +| +$/g, "") : out;
};
export const hasMarks = (text: string) => hasDiacritics(text) || /[\u00d0\u00f0]/.test(text);

/** The text without its strange characters, or the same text when there is nothing to clean. Text encoded twice needs more than one pass. */
export function cleanText(value: string, spec?: Pick<ColumnSpec, "role" | "noDiacritics">): string {
  if (!value.includes("?") && /^[\x21-\x7e]+(?: [\x21-\x7e]+)*$/.test(value)) return value;
  let text = value;
  for (let round = 0; round < 3; round++) { const next = pass(text, spec); if (next === text) break; text = next; }
  return text;
}

/**
 * Characters a Vietnamese workbook has no use for: anything outside printable ASCII, the precomposed Vietnamese letters and the usual typographic
 * marks. A combining mark counts too, since Vietnamese is written precomposed. What the cleaning could not settle shows up here.
 */
const KNOWN = new RegExp("^[\\x20-\\x7e\\n\\r\\u00c0-\\u00c3\\u00c8-\\u00ca\\u00cc\\u00cd\\u00d2-\\u00d5\\u00d9\\u00da\\u00dd\\u00e0-\\u00e3\\u00e8-\\u00ea\\u00ec\\u00ed\\u00f2-\\u00f5\\u00f9\\u00fa\\u00fd\\u0102\\u0103\\u0110\\u0111\\u0128\\u0129\\u0168\\u0169\\u01a0\\u01a1\\u01af\\u01b0\\u1ea0-\\u1ef9]$");
export function strangeChars(value: string): { start: number; end: number }[] {
  if (!/[^\x20-\x7e]/.test(value)) return [];
  const out: { start: number; end: number }[] = [];
  let at = 0;
  for (const ch of value) { if (!KNOWN.test(ch)) out.push({ start: at, end: at + ch.length }); at += ch.length; }
  return out;
}
