import { tryDecodeMojibake } from "./detect.ts";
import { plausibleSyllable, stripMarks } from "./predict.ts";
export interface CorruptionSpan { start: number; end: number; kind: "replacement" | "suspected_punctuation" | "unknown" | "mojibake" }

/**
 * A `?` that ends the cell is most likely a question, unless what stands before it cannot be a whole word: a short run of letters that is no
 * Vietnamese syllable and is not an ALL-CAPS abbreviation (`can h?`, `th?`). A real question (`dong y?`, `Anh?`, `literal?`) is left alone.
 */
function brokenWordEnd(before: string): boolean {
  const fragment = /([\p{L}\p{M}]{1,3})$/u.exec(before)?.[1];
  if (!fragment || /[\p{L}\p{M}\p{N}]$/u.test(before.slice(0, before.length - fragment.length))) return false;
  if (fragment.length > 1 && fragment === fragment.toUpperCase()) return false;
  return !plausibleSyllable(stripMarks(fragment).toLowerCase());
}
/** UTF-16 offsets into the original; normalization is never written back. Terminal ? is ambiguous punctuation, never auto-guessed. */
export function corruptionSpans(text: string): CorruptionSpan[] {
  if (!/[?\ufffd]/.test(text)) return /[ÃÄÆáâ]/.test(text) && tryDecodeMojibake(text) ? [{ start: 0, end: text.length, kind: "mojibake" }] : [];
  const spans: CorruptionSpan[] = [];
  const urls = [...text.matchAll(/https?:\/\/\S+|www\.\S+/g)].map(m => [m.index, m.index + m[0].length]);
  for (const match of text.matchAll(/[?\ufffd]+/g)) {
    const start = match.index, end = start + match[0].length;
    const terminal = /^\?+$/.test(match[0]) && (text.slice(end).trim() === "" || urls.some(([a, b]) => start >= a && end <= b)) && !brokenWordEnd(text.slice(0, start));
    const adjacent = /[\p{L}\p{M}\p{N}]$/u.test(text.slice(0, start)) || /^[\p{L}\p{M}\p{N}]/u.test(text.slice(end));
    spans.push({ start, end, kind: terminal ? "suspected_punctuation" : match[0].includes("\ufffd") || adjacent ? "replacement" : "unknown" });
  }
  return spans;
}

/** Variable-length masked spans, letters/combining marks only. Every unmasked UTF-16 character must match exactly. Bounded NFA. */
export function matchesMask(original: string, candidate: string): boolean {
  if (original.length > 32767 || candidate.length > 32767 || candidate.includes("?") || candidate.includes("\ufffd")) return false;
  const parts = original.match(/[?\ufffd]+|[^?\ufffd]+/g) ?? [];
  if (parts.length > 128) return false;
  let positions = new Set([0]), operations = 0;
  for (const part of parts) {
    const next = new Set<number>();
    for (const pos of positions) {
      if (!/^[?\ufffd]/.test(part)) { if (candidate.startsWith(part, pos)) next.add(pos + part.length); }
      else {
        let at = pos;
        for (let n = 0; n < 32 && at < candidate.length; n++) {
          const ch = String.fromCodePoint(candidate.codePointAt(at)!);
          if (!/^[\p{L}\p{M}]$/u.test(ch)) break;
          at += ch.length; next.add(at); if (++operations > 100000) return false;
        }
      }
      if (++operations > 100000) return false;
    }
    positions = next;
    if (!positions.size) return false;
  }
  return positions.has(candidate.length);
}
