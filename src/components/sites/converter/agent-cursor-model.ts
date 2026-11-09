// Pure parts of the Agent cursor: how the cursor travels, how the text of a block is split into pieces so that a word can be flagged, selected and
// replaced, how edits are counted. Numbers come from the recordings of the public preview (docs/research/agent-cursor/): cursors glide on a gentle
// quadratic arc with an ease-in-out curve for 280 to 600 ms by distance, a selection fills at about 0.25 ms a pixel, a rewrite streams 3 to 6 words
// every 34 ms and each chunk fades in over 140 ms.

export type BlockType = "title" | "heading" | "paragraph";
export interface DocBlock { id: string; type: BlockType; text: string }
export type AgentEdit =
  /** Select a block and stream new text in its place. */
  | { type: "rewrite"; block: string; text: string; label?: string }
  /** Add a block after another. */
  | { type: "insert"; after: string; block: DocBlock; label?: string }
  /** Replace a word of a block, flagged with a wavy underline first. `occurrence` tells which one when the text holds it more than once. */
  | { type: "fix"; block: string; find: string; replace: string; occurrence?: number; label?: string };
export type AgentCursorPhase = "idle" | "thinking" | "editing" | "review" | "accepted" | "reverted" | "stopped" | "empty" | "error";

export interface Point { x: number; y: number }
export const STREAM_MS = 34;
export const FADE_OUT_MS = 110;
export const FILL_MS_PER_PX = 0.25;
export const TRAVEL_MIN_MS = 280;
export const TRAVEL_MAX_MS = 600;
export const SPRING_BLOCK = { type: "spring", visualDuration: 0.24, bounce: 0 } as const;

/** 280 ms for a short hop up to 600 ms for a long flight, by distance in pixels; `speed` multiplies the playback speed. */
export const travelMs = (distance: number, speed = 1) => Math.min(TRAVEL_MAX_MS, TRAVEL_MIN_MS + distance * 0.4) / speed;
export const distanceBetween = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
/** How long a selection takes to fill `width` pixels of a line. */
export const fillMs = (width: number, speed = 1) => Math.max(40, width * FILL_MS_PER_PX) / speed;

/** cubic-bezier(.65, 0, .35, 1) solved for x by bisection: the ease-in-out of the preview. */
export function easeInOut(t: number): number {
  if (t <= 0) return 0; if (t >= 1) return 1;
  const x1 = 0.65, y1 = 0, x2 = 0.35, y2 = 1;
  const bez = (a: number, b: number, s: number) => 3 * a * (1 - s) * (1 - s) * s + 3 * b * (1 - s) * s * s + s * s * s;
  let low = 0, high = 1, s = t;
  for (let i = 0; i < 24; i++) { s = (low + high) / 2; if (bez(x1, x2, s) < t) low = s; else high = s; }
  return bez(y1, y2, s);
}
/** A point of the quadratic arc from a to b: the control point stands off the straight line by `bend` of its length, to the side the cursor travels away from. */
export function arcAt(from: Point, to: Point, t: number, bend = 0.08): Point {
  const dx = to.x - from.x, dy = to.y - from.y, length = Math.hypot(dx, dy) || 1;
  const sign = dx >= 0 ? 1 : -1;
  const control = { x: (from.x + to.x) / 2 - dy / length * length * bend * sign, y: (from.y + to.y) / 2 + dx / length * length * bend * sign };
  const u = 1 - t;
  return { x: u * u * from.x + 2 * u * t * control.x + t * t * to.x, y: u * u * from.y + 2 * u * t * control.y + t * t * to.y };
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Pieces: the text of a block as runs that can be flagged, tinted or replaced
// ---------------------------------------------------------------------------------------------------------------------------------------
export interface Piece {
  key: number; text: string;
  /** plain: untouched; chunk: streamed in; typo: flagged with a wavy underline; tint: a replacement. */
  kind: "plain" | "chunk" | "typo" | "tint";
  /** Waiting for review: tinted with the agent's colour until it is accepted. */
  pending: boolean;
}
let counter = 0;
export const piece = (text: string, kind: Piece["kind"] = "plain", pending = false): Piece => ({ key: ++counter, text, kind, pending });
export const pieceText = (pieces: readonly Piece[]) => pieces.map(item => item.text).join("");

/** Cut the pieces at `start` and `end` (character offsets in their joined text) and give the pieces between them `patch`. */
export function patchRange(pieces: readonly Piece[], start: number, end: number, patch: Partial<Pick<Piece, "kind" | "pending">>): Piece[] {
  const out: Piece[] = [];
  let at = 0;
  for (const item of pieces) {
    const from = at, to = at + item.text.length; at = to;
    if (to <= start || from >= end || item.text.length === 0) { out.push(item); continue; }
    const a = Math.max(start, from) - from, b = Math.min(end, to) - from;
    if (a > 0) out.push({ ...item, key: ++counter, text: item.text.slice(0, a) });
    out.push({ ...item, ...patch, key: ++counter, text: item.text.slice(a, b) });
    if (b < item.text.length) out.push({ ...item, key: ++counter, text: item.text.slice(b) });
  }
  return out;
}
/** Replace the characters from `start` to `end` with one new piece. */
export function replaceRange(pieces: readonly Piece[], start: number, end: number, replacement: Piece): Piece[] {
  const out: Piece[] = [];
  let at = 0, placed = false;
  for (const item of pieces) {
    const from = at, to = at + item.text.length; at = to;
    if (to <= start || from >= end) { if (from >= end && !placed) { out.push(replacement); placed = true; } out.push(item); continue; }
    const a = Math.max(start, from) - from, b = Math.min(end, to) - from;
    if (a > 0) out.push({ ...item, key: ++counter, text: item.text.slice(0, a) });
    if (!placed) { out.push(replacement); placed = true; }
    if (b < item.text.length) out.push({ ...item, key: ++counter, text: item.text.slice(b) });
  }
  if (!placed) out.push(replacement);
  return out.filter(item => item.text.length > 0 || item === replacement);
}
/** Where the n-th (0-based) occurrence of `find` starts in `text`, or -1. */
export function findOccurrence(text: string, find: string, occurrence = 0): number {
  if (!find) return -1;
  let from = -1;
  for (let n = 0; n <= occurrence; n++) { from = text.indexOf(find, from + 1); if (from < 0) return -1; }
  return from;
}

/** The number of blocks the edits touch: what the review bar counts ("3 edits"). An insert counts the block it adds. */
export function countEdits(edits: readonly AgentEdit[]): number {
  return new Set(edits.map(edit => edit.type === "insert" ? edit.block.id : edit.block)).size;
}
/** The blocks as the edits leave them, for the text handed to `onAccept`. */
export function applyEdits(blocks: readonly DocBlock[], edits: readonly AgentEdit[]): DocBlock[] {
  let out = blocks.map(block => ({ ...block }));
  for (const edit of edits) {
    if (edit.type === "insert") { const at = out.findIndex(block => block.id === edit.after); const next = [...out]; next.splice(at < 0 ? next.length : at + 1, 0, { ...edit.block }); out = next; continue; }
    out = out.map(block => {
      if (block.id !== edit.block) return block;
      if (edit.type === "rewrite") return { ...block, text: edit.text };
      const at = findOccurrence(block.text, edit.find, edit.occurrence ?? 0);
      return at < 0 ? block : { ...block, text: block.text.slice(0, at) + edit.replace + block.text.slice(at + edit.find.length) };
    });
  }
  return out;
}

/** Group the client rects of a text range into lines: rects that share a top (within 2 px) are one line, widest-first merged. */
export function groupLines(rects: readonly { left: number; top: number; width: number; height: number }[]): { left: number; top: number; width: number; height: number }[] {
  const lines: { left: number; top: number; width: number; height: number }[] = [];
  for (const rect of [...rects].filter(item => item.width > 0.5 && item.height > 0.5).sort((a, b) => a.top - b.top || a.left - b.left)) {
    const line = lines.find(item => Math.abs(item.top - rect.top) < 2 || (rect.top >= item.top && rect.top + rect.height <= item.top + item.height + 1));
    // a DOMRect keeps its fields on the prototype: copy them out by name, a spread would lose them
    if (!line) { lines.push({ left: rect.left, top: rect.top, width: rect.width, height: rect.height }); continue; }
    const right = Math.max(line.left + line.width, rect.left + rect.width);
    line.left = Math.min(line.left, rect.left); line.width = right - line.left; line.height = Math.max(line.height, rect.height);
  }
  return lines;
}
