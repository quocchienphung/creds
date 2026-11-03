/**
 * The maths of the glyph loading effect: a grid of character cells that covers a page while it loads and then dissolves, cell by cell, in a
 * wave that starts from a point. Pure (no DOM, no clock, no randomness beyond a hash of the cell), so the canvas renderer is thin and the
 * rules can be tested.
 *
 * Behaviour was read from the rendered public demo https://quanhoangindex.github.io/ascii-reveal/ (four looks — decode, dither, terminal,
 * blueprint — a wave that starts at the centre, a corner or the pointer, and a speed factor; docs/research/ascii-reveal/). The code and the
 * numbers here are this project's own. Nothing in this file reads the page: the glyphs are never taken from its text.
 */
export type Preset = "decode" | "dither" | "terminal" | "blueprint";
export type Origin = "center" | "corner" | "cursor";
export const presets: readonly Preset[] = ["decode", "dither", "terminal", "blueprint"];
export const origins: readonly Origin[] = ["center", "corner", "cursor"];

/** Hard limits: a huge window must never mean a huge amount of drawing. */
export const MAX_CELLS = 5200;
export const MIN_CELL_WIDTH = 9;
/** Milliseconds the wave takes to cross the whole region at speed 1, and the time one cell takes to dissolve. */
export const WAVE_MS = 640;
export const CELL_MS = 360;
/** Longest the dissolve can last at any speed; the renderer drops the cover after this whatever happens. */
export const MAX_REVEAL_MS = 1800;
/** How much of the page a cell hides before it dissolves (the page stays faintly visible underneath). */
export const COVER = 0.9;

const SCRAMBLE = "01{}[]<>/\\=+*#%&@$?!";
const RAMP = " .:-=+*#";
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

export interface Grid { cols: number; rows: number; cellW: number; cellH: number }

/** A grid for a region in pixels: cells are 9 × 16 or larger, never more than MAX_CELLS of them. */
export function gridFor(width: number, height: number): Grid {
  const w = Math.max(1, width), h = Math.max(1, height);
  let cellW = MIN_CELL_WIDTH, cellH = 16;
  while ((w / cellW) * (h / cellH) > MAX_CELLS) { cellW += 1; cellH = Math.round(cellW * 16 / 9); }
  return { cols: Math.ceil(w / cellW), rows: Math.ceil(h / cellH), cellW, cellH };
}

/** A stable pseudo-random number in [0, 1) for a cell and a time slot. */
export function hash(col: number, row: number, slot = 0): number {
  let h = (Math.imul(col + 1, 374761393) + Math.imul(row + 1, 668265263) + Math.imul(slot + 1, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export interface Wave { origin: Origin; /** Pointer position in the region (px); used by "cursor". */ x?: number; y?: number; width: number; height: number }

/** 0 at the wave's source and 1 at the farthest cell. */
export function distance(col: number, row: number, grid: Grid, wave: Wave): number {
  const px = (col + 0.5) * grid.cellW, py = (row + 0.5) * grid.cellH;
  const sx = wave.origin === "center" ? wave.width / 2 : wave.origin === "corner" ? 0 : Math.min(wave.width, Math.max(0, wave.x ?? wave.width / 2));
  const sy = wave.origin === "center" ? wave.height / 2 : wave.origin === "corner" ? 0 : Math.min(wave.height, Math.max(0, wave.y ?? wave.height / 2));
  const reach = Math.max(
    Math.hypot(sx, sy), Math.hypot(wave.width - sx, sy), Math.hypot(sx, wave.height - sy), Math.hypot(wave.width - sx, wave.height - sy), 1,
  );
  return Math.min(1, Math.hypot(px - sx, py - sy) / reach);
}

/** Time in ms at which a cell starts to dissolve. "terminal" sweeps row by row instead of outward. */
export function delayOf(preset: Preset, col: number, row: number, grid: Grid, wave: Wave, speed: number): number {
  const spread = WAVE_MS / Math.max(0.2, speed);
  const base = preset === "terminal" ? (row + col / Math.max(1, grid.cols)) / Math.max(1, grid.rows) : distance(col, row, grid, wave);
  return base * spread + hash(col, row, 7) * 70 / Math.max(0.2, speed);
}

/** The total time a reveal needs, so the renderer knows when it is over. */
export function revealDuration(speed: number): number {
  return Math.min(MAX_REVEAL_MS, (WAVE_MS + 70) / Math.max(0.2, speed) + CELL_MS / Math.max(0.2, speed));
}

export interface Cell {
  /** The character to draw ("" for none). */
  glyph: string;
  /** Opacity of the character, 0–1. */
  ink: number;
  /** How much of the page this cell hides, 0–1. */
  cover: number;
  /** Draws the character in the accent colour (the terminal's cursor, the blueprint's marks). */
  accent?: boolean;
}
const EMPTY: Cell = { glyph: "", ink: 0, cover: 0 };

const rampChar = (level: number) => RAMP[Math.max(0, Math.min(RAMP.length - 1, Math.floor(level * RAMP.length)))];

/**
 * What one cell looks like while the page is still loading (`t` is a time in ms, only used to move the pattern).
 * The cover is the same as the first frame of the dissolve, so the end of the wait and the start of the reveal join without a jump.
 */
export function loadingCell(preset: Preset, col: number, row: number, grid: Grid, wave: Wave, t: number): Cell {
  const d = distance(col, row, grid, wave);
  const swell = 0.5 + 0.5 * Math.sin(d * 9 - t / 380);
  if (preset === "decode") {
    const slot = Math.floor(t / 140 + hash(col, row, 3) * 6);
    return hash(col, row, slot) < 0.04 + swell * 0.15
      ? { glyph: SCRAMBLE[Math.floor(hash(col, row, slot + 11) * SCRAMBLE.length)], ink: 0.22 + swell * 0.5, cover: COVER }
      : { glyph: "", ink: 0, cover: COVER };
  }
  if (preset === "dither") {
    const level = swell * 0.85 + hash(col, row, Math.floor(t / 260)) * 0.15;
    const glyph = rampChar(level > BAYER[(row % 4) * 4 + (col % 4)] / 16 ? level : 0);
    return { glyph: glyph === " " ? "" : glyph, ink: 0.3 + swell * 0.5, cover: COVER };
  }
  if (preset === "terminal") {
    const line = Math.floor(t / 110) % Math.max(1, grid.rows);
    const head = row === line && col === Math.floor(((t / 55) % Math.max(1, grid.cols)));
    if (head) return { glyph: "#", ink: 1, cover: COVER, accent: true };
    return row % 2 === 0 && hash(col, row, Math.floor(t / 500)) < 0.07 ? { glyph: "_", ink: 0.35, cover: COVER } : { glyph: "", ink: 0, cover: COVER };
  }
  // blueprint: a measured grid of crosses that breathes
  const cross = col % 4 === 0 && row % 3 === 0;
  return cross ? { glyph: "+", ink: 0.35 + swell * 0.55, cover: COVER, accent: true } : (row % 3 === 0 && hash(col, row, 5) < 0.18 ? { glyph: "-", ink: 0.2 + swell * 0.3, cover: COVER } : { glyph: col % 4 === 0 && hash(col, row, 9) < 0.2 ? "|" : "", ink: 0.22, cover: COVER });
}

/** What one cell looks like `t` ms into the dissolve. A cell that has finished returns nothing, and costs nothing to draw. */
export function revealCell(preset: Preset, col: number, row: number, grid: Grid, wave: Wave, speed: number, t: number): Cell {
  const delay = delayOf(preset, col, row, grid, wave, speed);
  const progress = (t - delay) * Math.max(0.2, speed) / CELL_MS;
  if (progress >= 1) return EMPTY;
  const before = loadingCell(preset, col, row, grid, wave, t);
  if (progress <= 0) return before;
  const left = 1 - progress;
  if (preset === "decode") {
    const slot = Math.floor(t / 55);
    // the glyph scrambles faster, settles to a space, and the cell lets the page through
    return { glyph: progress < 0.7 ? SCRAMBLE[Math.floor(hash(col, row, slot) * SCRAMBLE.length)] : "", ink: left * 0.95, cover: COVER * left * left };
  }
  if (preset === "dither") {
    const threshold = BAYER[(row % 4) * 4 + (col % 4)] / 16;
    return left > threshold ? { glyph: rampChar(left) === " " ? "." : rampChar(left), ink: 0.2 + left * 0.7, cover: COVER * Math.min(1, left * 1.4) } : EMPTY;
  }
  if (preset === "terminal") {
    return progress < 0.2 ? { glyph: "#", ink: 1, cover: COVER, accent: true } : { glyph: "", ink: 0, cover: COVER * (1 - Math.min(1, (progress - 0.2) / 0.8)) };
  }
  const mark = col % 4 === 0 && row % 3 === 0;
  return { glyph: mark && progress < 0.6 ? "+" : "", ink: left, cover: COVER * left, accent: mark };
}
