// Pure parts of the TL;DR toggle: what a length means, how a result is cut into chunks and paced, how words are counted. Numbers come from the
// recordings of the public preview (docs/research/tldr-toggle/): 3 to 8 words per chunk, one chunk every 30 to 40 ms, thinking for 700 ms.

export type TldrMode = "full" | "summary" | "points";
export type TldrLength = 1 | 2 | 3 | 4 | 5;
export interface TldrParagraph { id: string; text: string }
export interface TldrKeyPoint { text: string; source: string }
export type TldrStreamEvent = { type: "text"; text: string } | { type: "point"; source: string };

export const MODES: readonly TldrMode[] = ["full", "summary", "points"];
export const LENGTHS: readonly TldrLength[] = [1, 2, 3, 4, 5];
/** The size a summary aims for at each length. */
export const TARGET_WORDS = [35, 60, 85, 100, 130] as const;
/** Key points return 3 to 7 items. */
export const pointCountFor = (length: TldrLength) => length + 2;
export const targetWordsFor = (length: TldrLength) => TARGET_WORDS[length - 1];

export const THINK_MS = 700;
export const CHUNK_MIN_MS = 30;
export const CHUNK_MAX_MS = 40;
export const WORDS_PER_MINUTE = 230;

export const cacheKey = (mode: TldrMode, length: TldrLength) => `${mode}:${mode === "full" ? 0 : length}`;
export const countWords = (text: string) => (text.trim().match(/\S+/g) ?? []).length;
/** Worked out at 230 words a minute when the article gives none. */
export function readingMinutes(paragraphs: readonly TldrParagraph[]) {
  const words = paragraphs.reduce((sum, paragraph) => sum + countWords(paragraph.text), 0);
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

export type Random = () => number;
/** A small deterministic generator, so a streamed text is cut the same way each time it is tested. */
export function mulberry32(seed: number): Random {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const between = (random: Random, low: number, high: number) => low + Math.floor(random() * (high - low + 1));

/** Cut a text into chunks of 3 to 8 words, each keeping the spaces that follow its last word, so that joining the chunks gives the text back. */
export function chunkWords(text: string, random: Random = Math.random, low = 3, high = 8): string[] {
  const words = text.match(/\S+\s*/g) ?? [];
  const chunks: string[] = [];
  for (let i = 0; i < words.length;) {
    const size = Math.min(words.length - i, between(random, low, high));
    chunks.push(words.slice(i, i + size).join(""));
    i += size;
  }
  return chunks;
}
/** Cut text at its delimiters (comma, semicolon, tab, pipe, line break) into groups of 3 to 8 fields: delimited text has few spaces to cut at. */
export function chunkFields(text: string, random: Random = Math.random, low = 3, high = 8): string[] {
  const fields = text.match(/[^,;\t|\n]*[,;\t|\n]?/g)?.filter(Boolean) ?? [];
  const chunks: string[] = [];
  for (let i = 0; i < fields.length;) {
    const size = Math.min(fields.length - i, between(random, low, high));
    chunks.push(fields.slice(i, i + size).join(""));
    i += size;
  }
  return chunks;
}
export const chunkDelay = (random: Random = Math.random) => CHUNK_MIN_MS + random() * (CHUNK_MAX_MS - CHUNK_MIN_MS);

const sleep = (ms: number, signal: AbortSignal) => new Promise<void>(resolve => {
  if (signal.aborted) { resolve(); return; }
  const done = () => { clearTimeout(timer); resolve(); };
  const timer = setTimeout(() => { signal.removeEventListener("abort", done); resolve(); }, ms);
  signal.addEventListener("abort", done, { once: true });
});

export interface StreamOptions { random?: Random; chunker?: (text: string, random: Random) => string[]; delay?: (random: Random) => number; skipPacing?: boolean }
/**
 * Turns a finished string or key point list into paced stream events, honouring the signal: text goes out in chunks every 30 to 40 ms; for key
 * points a { type: "point", source } event goes before the chunks of each point's text.
 */
export async function* streamResult(result: string | readonly TldrKeyPoint[], signal: AbortSignal, options: StreamOptions = {}): AsyncGenerator<TldrStreamEvent> {
  const random = options.random ?? Math.random, chunker = options.chunker ?? ((text: string, rnd: Random) => chunkWords(text, rnd)), delay = options.delay ?? chunkDelay;
  const pace = async () => { if (!options.skipPacing) await sleep(delay(random), signal); };
  if (typeof result === "string") {
    for (const chunk of chunker(result, random)) { if (signal.aborted) return; yield { type: "text", text: chunk }; await pace(); }
    return;
  }
  for (const point of result) {
    if (signal.aborted) return;
    yield { type: "point", source: point.source };
    for (const chunk of chunker(point.text, random)) { if (signal.aborted) return; yield { type: "text", text: chunk }; await pace(); }
  }
}

/** The paragraphs of a prose result: a blank line starts a new one. */
export const splitParagraphs = (text: string) => text.split(/\n{2,}/);

/** What the footer calls a finished result ("58 words", "4 points"). */
export const defaultCount = (mode: TldrMode, words: number, points: number) => mode === "points" ? `${points} ${points === 1 ? "point" : "points"}` : `${words} ${words === 1 ? "word" : "words"}`;
/** What the slider reads ("~60 words", "4 points"). */
export const defaultReadout = (mode: TldrMode, length: TldrLength) => mode === "points" ? `${pointCountFor(length)} points` : `~${targetWordsFor(length)} words`;

// ---------------------------------------------------------------------------------------------------------------------------------------
// The request, and the built-in simulation (the API reference's `simulateTldr`)
// ---------------------------------------------------------------------------------------------------------------------------------------
export interface TldrRequest {
  mode: "summary" | "points";
  length: TldrLength;
  /** 35 to 130, for the summary. */
  targetWords: number;
  /** 3 to 7, for key points. */
  pointCount: number;
  article: { title: string; paragraphs: readonly TldrParagraph[] };
  signal: AbortSignal;
}
const sentencesOf = (text: string) => text.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g)?.map(sentence => sentence.trim()).filter(Boolean) ?? [];
/**
 * The simulation behind the preview: it thinks for a moment (700 ms by default), then streams the lead sentences of the article (for a summary, as
 * many as fit the target; for key points, the first sentence of the paragraphs, each tied to its paragraph). Nothing is sent anywhere.
 */
export async function* simulateTldr(request: TldrRequest, options: { fail?: boolean; thinkMs?: number; random?: Random; skipPacing?: boolean } = {}): AsyncGenerator<TldrStreamEvent> {
  const { signal, article } = request;
  await sleep(options.thinkMs ?? THINK_MS, signal);
  if (signal.aborted) return;
  if (options.fail) throw new Error("The model did not respond in time.");
  if (request.mode === "points") {
    const points: TldrKeyPoint[] = article.paragraphs.filter(paragraph => paragraph.text.trim()).slice(0, request.pointCount).map(paragraph => ({ text: sentencesOf(paragraph.text)[0] ?? paragraph.text, source: paragraph.id }));
    yield* streamResult(points, signal, { random: options.random, skipPacing: options.skipPacing });
    return;
  }
  const picked: string[] = [];
  let words = 0;
  for (const paragraph of article.paragraphs) for (const sentence of sentencesOf(paragraph.text)) { if (words >= request.targetWords) break; picked.push(sentence); words += countWords(sentence); }
  yield* streamResult(picked.join(" "), signal, { random: options.random, skipPacing: options.skipPacing });
}
