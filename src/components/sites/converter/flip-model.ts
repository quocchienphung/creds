/**
 * The pure parts of the Flip page and of the three components it is built from (Ghost text, Generation stats, AI translate, each rebuilt from the
 * open preview of UIArc's component of that name: `docs/research/{ghost-text,generation-stats,ai-translate}/`).
 */

// ---------------------------------------------------------------------------------------------------------------------------------------
// AI translate: units and chunks
// ---------------------------------------------------------------------------------------------------------------------------------------
/** Sentences, keeping decimals like 4.2 whole and handling 。！？ (as the preview's documentation says it does). A line break always ends a unit. */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split(/\n/)) {
    let start = 0;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (/[。！？]/.test(ch)) { out.push(line.slice(start, i + 1)); start = i + 1; continue; }
      if (/[.!?]/.test(ch)) {
        const next = line[i + 1];
        if (ch === "." && /\d/.test(line[i - 1] ?? "") && /\d/.test(next ?? "")) continue;
        if (next === undefined || /\s/.test(next)) { let end = i + 1; while (/\s/.test(line[end] ?? "") && end < line.length) end++; out.push(line.slice(start, end)); start = end; i = end - 1; }
      }
    }
    if (start < line.length) out.push(line.slice(start));
  }
  return out.filter(unit => unit !== "");
}
/** One unit per line, for text that is rows and not prose. */
export const splitLines = (text: string): string[] => text.split("\n");

const WORDS = [3, 4, 5, 6, 4, 5, 3, 6];
/** 3 to 6 words per chunk, trailing spaces kept so that the chunks put end to end give the unit back. */
export function chunkWords(unit: string, seed = 0): string[] {
  const parts = unit.match(/\S+\s*|\s+/g) ?? [];
  const out: string[] = []; let i = 0, n = seed;
  while (i < parts.length) { const size = WORDS[n++ % WORDS.length]; out.push(parts.slice(i, i + size).join("")); i += size; }
  return out;
}
/** For text without spaces (Japanese in the preview: about 10 characters; here comma-separated rows): pieces that end after a separator once they are long enough. */
export function chunkCharacters(unit: string, size = 10): string[] {
  const out: string[] = []; let current = "";
  for (const ch of unit) { current += ch; if (current.length >= size && /[,;\t。、]/.test(ch)) { out.push(current); current = ""; } else if (current.length >= size * 2) { out.push(current); current = ""; } }
  if (current) out.push(current);
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// The output of the page: delimited text
// ---------------------------------------------------------------------------------------------------------------------------------------
export interface FormatOption { code: string; name: string; meta: string; delimiter: string }
export const SOURCE_CODE = "original";
export const FORMATS: FormatOption[] = [
  { code: "csv", name: "CSV", meta: "comma ,", delimiter: "," },
  { code: "csv-semicolon", name: "CSV ;", meta: "semicolon ;", delimiter: ";" },
  { code: "tsv", name: "TSV", meta: "tab", delimiter: "\t" },
  { code: "psv", name: "PSV", meta: "pipe |", delimiter: "|" },
];
/** One field as RFC 4180 writes it: quoted when it holds the delimiter, a quote, or a line break; quotes doubled. Nothing else is touched (leading zeros stay). */
export function field(value: string, delimiter: string): string {
  return value.includes(delimiter) || /["\r\n]/.test(value) ? `"${value.replaceAll("\"", "\"\"")}"` : value;
}
export const delimitedLine = (values: readonly string[], delimiter: string) => values.map(value => field(value, delimiter)).join(delimiter);
export const delimitedText = (rows: readonly (readonly string[])[], delimiter: string) => rows.map(row => delimitedLine(row, delimiter)).join("\n");
/** How the rows read in the workbook: columns separated by a tab-like gap, one row per line (this is the "original" of the card). */
export const gridText = (rows: readonly (readonly string[])[]) => rows.map(row => row.map(value => value.replace(/\s*\n\s*/g, " ")).join("  │  ")).join("\n");
/** Trailing empty columns of a row are not part of the data. */
export function trimRow(values: readonly string[]): string[] { let end = values.length; while (end > 0 && values[end - 1] === "") end--; return values.slice(0, end); }

// ---------------------------------------------------------------------------------------------------------------------------------------
// Ghost text: a continuation made only of what is in the workbook
// ---------------------------------------------------------------------------------------------------------------------------------------
/**
 * The rest of the output name. The candidates are the workbook's own names (its file name, its sheets): what the person types is completed
 * from the first candidate it starts, and a name that is complete is offered its extension.
 */
export function suggestName(text: string, candidates: readonly string[], extension: string): string | null {
  const typed = text.replace(/^\s+/, "");
  if (typed === "" || /\s$/.test(typed)) return null;
  const lower = typed.toLowerCase();
  if (lower.endsWith(extension.toLowerCase())) return null;
  const match = candidates.find(candidate => candidate.length > typed.length && candidate.toLowerCase().startsWith(lower));
  if (match) return match.slice(typed.length) + extension;
  if (candidates.some(candidate => candidate.toLowerCase() === lower)) return extension;
  return null;
}
export const baseName = (fileName: string) => fileName.replace(/\.[^.]+$/, "");
/** A name that is safe to write: no path separators or control characters, no leading dots. */
export const safeName = (name: string) => name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/^\.+/, "").trim();

// ---------------------------------------------------------------------------------------------------------------------------------------
// Generation stats: numbers
// ---------------------------------------------------------------------------------------------------------------------------------------
export const formatDuration = (ms: number) => ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(2)}s`;
export const formatBytes = (bytes: number) => bytes < 1024 ? `${Math.round(bytes)} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB` : `${(bytes / 1048576).toFixed(bytes < 10485760 ? 2 : 1)} MB`;
export const formatCost = (usd: number) => `$${usd.toFixed(usd >= 1 ? 2 : 4)}`;
/** The glide of a counting number: it covers 1 - 1/e of the way to a new value in `tau` ms. A drop cuts straight to the new value. */
export function glide(current: number, target: number, dt: number, tau = 100): number {
  if (target < current) return target;
  const next = current + (target - current) * (1 - Math.exp(-dt / tau));
  return target - next < 0.5 ? target : next;
}
/** The path of the sparkline over `width` x `height`, from readings oldest first; compressed to at most `max` points keeping the run's shape. */
export function sparkPath(samples: readonly number[], width: number, height: number, max = 48): { d: string; end: [number, number] | null } {
  if (samples.length < 2) return { d: "", end: null };
  let points = [...samples];
  while (points.length > max) points = points.filter((_, i) => i % 2 === 0 || i === points.length - 1);
  const top = Math.max(...points), low = Math.min(...points), span = Math.max(1e-9, top - low);
  const xy = points.map((v, i) => [i / (points.length - 1) * width, height - (v - low) / span * (height - 2) - 1] as [number, number]);
  return { d: xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" "), end: xy[xy.length - 1] };
}
