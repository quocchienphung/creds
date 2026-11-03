/**
 * Geometry of the whole-file sheet view: every column fits the width of the stage (an overview of the entire sheet, like a zoomed-out page),
 * rows scroll through all of the file, and a strip at the edge maps where the issues are.
 * Pure, so it is testable; nothing here touches the DOM.
 */
export interface ColumnMeta { col: number; letter: string; header: string; weight: number }

/** Wider columns for text that is long by nature (descriptions, names, addresses); every other column weighs 1. */
export function columnWeight(header: string): number {
  return /MOTA|DIACHI|TEN|HOTEN|CHUDA|VITRI|BIENKS|GIAYPHEP|MATINH$/i.test(header) ? 3 : 1;
}
/** Pixel widths of the columns so that together they fill `width` exactly. */
export function columnWidths(columns: readonly ColumnMeta[], width: number): number[] {
  const total = columns.reduce((sum, column) => sum + column.weight, 0) || 1;
  return columns.map(column => width * column.weight / total);
}
export const columnLefts = (widths: readonly number[]): number[] => widths.reduce<number[]>((out, w, i) => { out.push(i === 0 ? 0 : out[i - 1] + widths[i - 1]); return out; }, []);

/** Which column a horizontal pixel falls in (clamped), by binary search over the left edges. */
export function columnAt(lefts: readonly number[], widths: readonly number[], x: number): number {
  if (!lefts.length) return 0;
  let lo = 0, hi = lefts.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (lefts[mid] <= x) lo = mid; else hi = mid - 1; }
  return Math.max(0, Math.min(lefts.length - 1, lo));
}

/** The strip along the edge of the sheet: `buckets` slots over `totalRows` rows, each with the worst severity of its issues (0 none … 4 critical). */
export function issueStrip(issueRows: readonly { row: number; level: number }[], totalRows: number, buckets: number): Uint8Array {
  const out = new Uint8Array(buckets);
  for (const item of issueRows) { const slot = Math.min(buckets - 1, Math.max(0, Math.floor((item.row - 1) / Math.max(1, totalRows) * buckets))); if (item.level > out[slot]) out[slot] = item.level; }
  return out;
}
/** The row a click on the strip means, and the strip slot of a row. */
export const rowOfStrip = (y: number, height: number, totalRows: number) => Math.max(1, Math.min(totalRows, Math.round(1 + (y / Math.max(1, height)) * (totalRows - 1))));
export const stripOfRow = (row: number, height: number, totalRows: number) => (row - 1) / Math.max(1, totalRows - 1) * height;
