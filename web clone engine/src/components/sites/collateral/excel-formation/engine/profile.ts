import type { Cell, Sheet, Workbook } from "./types.ts";
import { columnLetters } from "./text.ts";
import type { ColumnSpec, MappingProfile } from "./mapping-profiles.ts";

export interface HeaderCell { col: number; letter: string; text: string }
export type SheetRole = "primary" | "csv-packed" | "empty" | "other";
export interface ColumnStats { filled: number; types: Partial<Record<Cell["t"], number>>; leadingZero: number }
export interface SheetProfile {
  name: string;
  role: SheetRole;
  /** 1-based Excel row of the header, or null when none was found. */
  headerRow: number | null;
  headers: HeaderCell[];
  dataRows: number;
  hiddenRows: number;
  emptyRows: number;
  mergeCount: number;
  autoFilter: boolean;
  formulaCount: number;
  columns: Record<number, ColumnStats>;
  /** Known headers found / known headers in the profile; how well the sheet matches. */
  match: number;
  ambiguousHeader?: boolean;
}
export interface ResolvedColumn { spec: ColumnSpec; col: number }
export interface MappingResolution {
  resolved: ResolvedColumn[];
  /** Header found more than once: the person must choose, nothing is picked blindly. */
  ambiguous: { spec: ColumnSpec; cols: number[] }[];
  missing: ColumnSpec[];
  unknown: HeaderCell[];
  duplicates: { text: string; cols: number[] }[];
}
export interface WorkbookProfile {
  version: 1;
  fileName: string;
  fileHash: string;
  size: number;
  profileId: string;
  profileVersion: number;
  sheets: SheetProfile[];
  primary: string | null;
  mapping: MappingResolution | null;
  notes: string[];
}

export const normalizeHeader = (text: string) => text.normalize("NFKC").trim().replace(/\s+/g, " ").toUpperCase();

function findHeaderRow(sheet: Sheet, known: Set<string>): { row: number; match: number; ambiguous: boolean } | null {
  let best: { row: number; match: number; score: number } | null = null;
  let ambiguous = false;
  for (const row of sheet.rows.slice(0, 15)) {
    const texts = row.cells.filter((cell): cell is Cell => !!cell && cell.v !== "" && cell.t !== "n");
    if (texts.length < 3) continue;
    const match = texts.filter(cell => known.has(normalizeHeader(cell.v))).length;
    const score = match * 10 + new Set(texts.map(cell => normalizeHeader(cell.v))).size / texts.length;
    if (!best || score > best.score) { best = { row: row.r, match, score }; ambiguous = false; }
    else if (score === best.score && match >= 3) ambiguous = true;
  }
  return best ? { row: best.row, match: best.match, ambiguous } : null;
}

/** A sheet whose only real column holds whole CSV lines ("a","b","c") rather than separate cells. */
function looksCsvPacked(sheet: Sheet): boolean {
  if (sheet.maxCol > 4 || sheet.rows.length < 2) return false;
  let packed = 0, seen = 0;
  for (const row of sheet.rows.slice(0, 20)) for (const cell of row.cells) if (cell) { seen++; if ((cell.v.match(/","/g)?.length ?? 0) >= 4) packed++; }
  return seen > 0 && packed >= Math.max(1, Math.floor(seen / 4));
}

export function profileSheet(sheet: Sheet, profile: MappingProfile): SheetProfile {
  const known = new Set(profile.columns.map(spec => normalizeHeader(spec.header)));
  const base: SheetProfile = { name: sheet.name, role: "other", headerRow: null, headers: [], dataRows: 0, hiddenRows: sheet.hiddenRows, emptyRows: sheet.emptyRows, mergeCount: sheet.mergeCount, autoFilter: sheet.autoFilter, formulaCount: sheet.formulaCount, columns: {}, match: 0 };
  if (!sheet.rows.length) return { ...base, role: "empty" };
  if (looksCsvPacked(sheet)) return { ...base, role: "csv-packed", dataRows: Math.max(0, sheet.rows.length - 1) };
  const header = findHeaderRow(sheet, known);
  if (!header) return { ...base, dataRows: sheet.rows.length };
  const headerRow = sheet.rows.find(row => row.r === header.row)!;
  const headers: HeaderCell[] = [];
  headerRow.cells.forEach((cell, col) => { if (cell && cell.v.trim() !== "") headers.push({ col, letter: columnLetters(col), text: cell.v.trim() }); });
  const data = sheet.rows.filter(row => row.r > header.row);
  const columns: Record<number, ColumnStats> = {};
  for (const { col } of headers) columns[col] = { filled: 0, types: {}, leadingZero: 0 };
  for (const row of data) for (const { col } of headers) {
    const cell = row.cells[col];
    if (!cell || cell.v === "") continue;
    const stats = columns[col];
    stats.filled++;
    stats.types[cell.t] = (stats.types[cell.t] ?? 0) + 1;
    if (cell.t !== "n" && /^0\d+$/.test(cell.v)) stats.leadingZero++;
  }
  return { ...base, role: header.match >= 3 ? "primary" : "other", headerRow: header.row, headers, dataRows: data.length, columns, match: header.match, ...(header.ambiguous ? { ambiguousHeader: true } : {}) };
}

/** Auto-map only exact (normalised) header matches; a header present twice is reported as ambiguous instead of being chosen. */
export function resolveMapping(headers: HeaderCell[], profile: MappingProfile, overrides: Record<string, number> = {}): MappingResolution {
  const byName = new Map<string, number[]>();
  for (const header of headers) { const key = normalizeHeader(header.text); byName.set(key, [...(byName.get(key) ?? []), header.col]); }
  const resolved: ResolvedColumn[] = [], ambiguous: MappingResolution["ambiguous"] = [], missing: ColumnSpec[] = [];
  for (const spec of profile.columns) {
    const cols = byName.get(normalizeHeader(spec.header)) ?? [];
    const chosen = overrides[spec.header];
    if (chosen !== undefined && headers.some(header => header.col === chosen)) resolved.push({ spec, col: chosen });
    else if (cols.length === 1) resolved.push({ spec, col: cols[0] });
    else if (cols.length > 1) ambiguous.push({ spec, cols });
    else missing.push(spec);
  }
  const known = new Set(profile.columns.map(spec => normalizeHeader(spec.header)));
  return {
    resolved, ambiguous, missing,
    unknown: headers.filter(header => !known.has(normalizeHeader(header.text))),
    duplicates: [...byName].filter(([, cols]) => cols.length > 1).map(([text, cols]) => ({ text, cols })),
  };
}

export function profileWorkbook(workbook: Workbook, profile: MappingProfile, overrides: Record<string, number> = {}): WorkbookProfile {
  const sheets = workbook.sheets.map(sheet => profileSheet(sheet, profile));
  // The primary sheet is the one that matches the profile best; ties go to the one with more rows. Nothing is chosen when no sheet matches.
  const candidates = sheets.filter(sheet => sheet.role === "primary").sort((a, b) => b.match - a.match || b.dataRows - a.dataRows);
  const primary = candidates[0] ?? null;
  const notes = [...workbook.notes];
  if (candidates.length > 1) notes.push("More than one sheet matches the profile; the best match was selected and the others are ignored.");
  for (const sheet of sheets) if (sheet.role === "csv-packed") notes.push(`Sheet "${sheet.name}" holds whole CSV lines in one column. It is not read as a table.`);
  return {
    version: 1, fileName: workbook.fileName, fileHash: workbook.fileHash, size: workbook.size, profileId: profile.id, profileVersion: profile.version,
    sheets, primary: primary?.name ?? null, mapping: primary ? resolveMapping(primary.headers, profile, overrides) : null, notes,
  };
}
