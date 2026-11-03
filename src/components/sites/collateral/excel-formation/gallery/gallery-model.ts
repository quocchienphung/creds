/**
 * Pure rules of the issue gallery: a rebuild, from the public preview of UIArc's Product gallery, of its stage + thumbnail
 * rail + fullscreen viewer. The "photo" here is a specimen of a cell's text. Every number is measured from the rendered preview
 * (docs/research/product-gallery/): stage radius 22, viewer padding 48/12, top bar 64/56.
 */
export interface Rect { x: number; y: number; width: number; height: number }
export interface Point { x: number; y: number }

export const STAGE_RATIO = 4 / 3;

/** The transform that makes a frame laid out at `to` look like it sits at `from`: the viewer's flight starts here and ends at the identity. */
export function flight(from: Rect, to: Rect): { x: number; y: number; scale: number } {
  const scale = from.width / to.width;
  return { x: from.x + from.width / 2 - (to.x + to.width / 2), y: from.y + from.height / 2 - (to.y + to.height / 2), scale };
}
/** The viewer's frame: as large as fits below the top bar and above the navigation, at the stage's ratio, centred. */
export function fitFrame(viewport: { width: number; height: number }, ratio: number = STAGE_RATIO): Rect {
  const compact = viewport.width < 640;
  const pad = compact ? 12 : 48, top = compact ? 56 : 64, bottom = 80;
  const maxW = Math.max(1, viewport.width - pad * 2), maxH = Math.max(1, viewport.height - top - bottom);
  const width = Math.min(maxW, maxH * ratio), height = width / ratio;
  return { x: (viewport.width - width) / 2, y: top + (maxH - height) / 2, width, height };
}

export const stepIndex = (index: number, delta: number, count: number) => count <= 0 ? 0 : Math.min(count - 1, Math.max(0, index + delta));
/** The slice of a long list the rail shows around the selected item. */
export function railWindow(index: number, count: number, size = 6): { start: number; end: number } {
  const start = Math.max(0, Math.min(index - Math.floor(size / 2), count - size));
  return { start: Math.max(0, start), end: Math.min(count, Math.max(0, start) + size) };
}

// ── specimen: the text of a cell, character by character ────────────────────────────────────────────────────────────────────────────
export interface Segment { text: string; start: number; end: number; kind: "plain" | "mark" | "glyph"; label?: string }
const GLYPHS: Record<string, string> = { "\t": "⇥", "\n": "↵", "\r": "↵", "\u00a0": "⍽", "\u200b": "ZW", "\u200c": "ZW", "\u200d": "ZW", "\ufeff": "BOM", "\u00ad": "SH" };
const unusual = (ch: string) => /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\u202a-\u202e\u2060-\u2064\u00ad\ufeff�\u00a0\u2000-\u200a\u202f\u205f\u3000\t\n\r]/.test(ch);
export const codePointLabel = (ch: string) => "U+" + ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0");

/** Split text into runs: plain text, runs the rules marked, and characters that cannot be seen (shown as glyphs with their code point). */
export function specimenSegments(value: string, marks: { start: number; end: number; label?: string }[] = []): Segment[] {
  const flags = new Array<string | null>(value.length).fill(null);
  for (const mark of marks) for (let i = Math.max(0, mark.start); i < Math.min(value.length, mark.end); i++) flags[i] = mark.label ?? "mark";
  const out: Segment[] = [];
  let i = 0;
  while (i < value.length) {
    const cp = value.codePointAt(i)!, ch = String.fromCodePoint(cp), width = ch.length;
    if (unusual(ch)) { out.push({ text: GLYPHS[ch] ?? (ch === "�" ? "�" : codePointLabel(ch).slice(2)), start: i, end: i + width, kind: "glyph", label: codePointLabel(ch) }); i += width; continue; }
    const marked = flags[i] !== null;
    let j = i + width;
    while (j < value.length) {
      const next = String.fromCodePoint(value.codePointAt(j)!);
      if (unusual(next) || (flags[j] !== null) !== marked) break;
      j += next.length;
    }
    out.push({ text: value.slice(i, j), start: i, end: j, kind: marked ? "mark" : "plain", ...(marked && flags[i] !== "mark" ? { label: flags[i]! } : {}) });
    i = j;
  }
  return out;
}
