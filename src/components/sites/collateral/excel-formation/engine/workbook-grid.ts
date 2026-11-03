import type { GridMeta, GridRow } from "../../engine/protocol.ts";
import type { Workbook } from "./types.ts";
import type { WorkbookProfile } from "./profile.ts";
import type { ReviewState } from "./review.ts";
import { columnLetters } from "./text.ts";
import { columnWeight } from "./sheet-geometry.ts";

function getSheet(workbook: Workbook, name: string) {
  const sheet = workbook.sheets.find(item => item.name === name);
  if (!sheet) throw new Error("The requested worksheet is unavailable.");
  return sheet;
}

export function workbookGridMeta(workbook: Workbook, profile: WorkbookProfile, name: string): GridMeta {
  const sheet = getSheet(workbook, name);
  const headerRow = profile.sheets.find(item => item.name === name)?.headerRow ?? 1;
  const header = sheet.rows.find(row => row.r === headerRow);
  // Include empty trailing rows/columns declared in the file, including entirely empty sheets.
  const end = sheet.dimension?.split(":").at(-1)?.match(/^\$?([A-Z]+)\$?(\d+)$/i);
  let dimensionCol = 0;
  for (const letter of end?.[1]?.toUpperCase() ?? "") dimensionCol = dimensionCol * 26 + letter.charCodeAt(0) - 64;
  const lastRow = Math.min(1_048_576, Math.max(1, sheet.rows.at(-1)?.r ?? 1, Number(end?.[2] ?? 1)));
  const colCount = Math.min(16_384, Math.max(1, sheet.maxCol, dimensionCol));
  return {
    fileName: workbook.fileName, sheet: sheet.name, sheets: workbook.sheets.map(item => item.name), firstRow: 1, lastRow,
    headerRow, hiddenRows: sheet.hiddenRows,
    columns: Array.from({ length: colCount }, (_, col) => {
      const text = header?.cells[col]?.v ?? "";
      return { col, letter: columnLetters(col), header: text, weight: columnWeight(text) };
    }),
  };
}

export function workbookGridRows(workbook: Workbook, profile: WorkbookProfile, patches: ReviewState["patches"], name: string, from: number, count: number): GridRow[] {
  const sheet = getSheet(workbook, name);
  const headerRow = profile.sheets.find(item => item.name === name)?.headerRow ?? 1;
  const first = Math.max(1, Math.min(1_048_576, Math.floor(Number.isFinite(from) ? from : 1)));
  const size = Math.max(0, Math.min(200, Math.floor(Number.isFinite(count) ? count : 0), 1_048_577 - first));
  let lo = 0, hi = sheet.rows.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (sheet.rows[mid].r < first) lo = mid + 1; else hi = mid; }
  const rows: GridRow[] = [];
  for (let r = first, i = lo; r < first + size; r++) {
    const row = sheet.rows[i]?.r === r ? sheet.rows[i++] : undefined;
    // Never truncate source text or convert numeric strings (leading zeros and precision matter).
    const values = Array.from({ length: sheet.maxCol }, (_, col) => patches[`${sheet.name}\u0001${r}\u0001${col}`]?.value ?? row?.cells[col]?.v ?? "");
    rows.push({ r, hidden: row?.hidden ?? false, header: r === headerRow, values });
  }
  return rows;
}
