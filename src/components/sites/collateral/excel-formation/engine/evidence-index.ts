import type { Session } from "./session.ts";
import type { Cell, Row } from "./types.ts";
import type { ColumnSpec } from "./mapping-profiles.ts";
import { analyzeValue } from "./detect.ts";
import { VietnameseModel } from "./predict.ts";
import { resolveMapping } from "./profile.ts";
import { cellKey } from "./review.ts";
import { isTextCell, textRoleOf } from "./sheet-scan.ts";
export const INDEX_VERSION = "evidence-2";
export interface SourceRecord { value: string; sourceId: string; entity: string; scope: string; sheetId: string; row: number; col: number; /** Rows of the column holding exactly this text, when more than one was seen. */ count?: number }
export interface SheetEvidence { sheetId: string; headerRow: number; columns: ReturnType<typeof resolveMapping>["resolved"]; entityOf: (row: Row) => string | null }
export interface EvidenceIndex { sheets: Map<string, SheetEvidence>; entities: Map<string, SourceRecord[]>; phrases: Map<string, SourceRecord[]>; model: VietnameseModel }
export const evidenceKey = (scope: string, entity: string) => JSON.stringify([scope, entity]);
/**
 * Where a clean text is filed so that a damaged text can find it: by word count and the letters at both ends. A `?` at an end matches any
 * letter, so a clean text is filed four times (exact ends, either end open, both open) and a damaged one looks up the single key it needs.
 */
const END = (ch: string | undefined) => ch === undefined || ch === "?" || ch === "�" ? "*" : ch;
const phraseKey = (scope: string, words: number, first: string, last: string) => scope + "\u0000" + words + "\u0000" + first + "\u0000" + last;
export function phraseKeysOf(scope: string, text: string): string[] {
  const t = text.normalize("NFC").trim(), words = t.split(/\s+/).length, first = t[0] ?? "*", last = t[t.length - 1] ?? "*";
  return [phraseKey(scope, words, first, last), phraseKey(scope, words, first, "*"), phraseKey(scope, words, "*", last), phraseKey(scope, words, "*", "*")];
}
export function phraseLookup(scope: string, damaged: string): string {
  const t = damaged.normalize("NFC").trim();
  return phraseKey(scope, t.split(/\s+/).length, END(t[0]), END(t[t.length - 1]));
}
/** Where the clean records of a column are looked up: the same column of the same sheet. A column the profile knows is named by its header, any other by its position. */
export const scopeOf = (info: Pick<SheetEvidence, "sheetId">, col: number, spec: ColumnSpec | undefined, role: string) => JSON.stringify([info.sheetId, spec ? spec.comparisonOf ?? spec.header : `column-${col}`, role]);
const DAMAGE = /[?�ÃÄÆáâ]/;
/** Only these findings make a text unfit to learn from; spacing and mark policy do not. */
const UNFIT = new Set(["QUESTION_MARK_IN_WORD", "UNICODE_REPLACEMENT", "ENCODING_MOJIBAKE", "INVISIBLE_OR_CONTROL"]);

export function sheetEvidence(session: Session): Map<string, SheetEvidence> {
  const out = new Map<string, SheetEvidence>();
  session.workbook.sheets.forEach((sheet, i) => {
    const profile = session.wprofile.sheets.find(p => p.name === sheet.name)!;
    const mapping = sheet.name === session.wprofile.primary ? session.wprofile.mapping : resolveMapping(profile.headers, session.profile);
    const columns = mapping && !profile.ambiguousHeader && !mapping.ambiguous.length && !mapping.duplicates.length ? mapping.resolved : [];
    const group = session.profile.groupBy;
    const keys = [group.branch, group.customer, group.asset].map(h => columns.find(c => c.spec.header === h)?.col);
    // A sheet the profile does not know has no header row to skip: every row of it is text to read and, if damaged, to repair.
    out.set(sheet.name, { sheetId: `sheet-${i + 1}`, headerRow: columns.length ? profile.headerRow ?? 0 : 0, columns, entityOf: row => {
      if (keys.some(k => k === undefined)) return null;
      const values = keys.map(k => row.cells[k!]);
      if (values.some(c => !c || c.f || !c.v || /[?�]/.test(c.v))) return null;
      return JSON.stringify(values.map(c => c!.v));
    } });
  });
  return out;
}

/** A text the file wrote itself and nothing has damaged: the only thing the language model and the retrieval may learn from. */
function learnable(cell: Cell, spec: ColumnSpec | undefined): boolean {
  if (cell.f || cell.protectedText || !isTextCell(cell) || !cell.v || cell.v.length > 32767) return false;
  if (spec ? spec.role !== "freeText" : textRoleOf(cell.v) !== "freeText") return false;
  return !analyzeValue(cell.v, { role: "freeText", noDiacritics: false }, { diacriticPolicy: false }).some(finding => UNFIT.has(finding.category));
}

export class EvidenceBuilder {
  readonly index: EvidenceIndex;
  private seen = new Set<string>();
  private count = 0;
  private activeScopes = new Set<string>();
  private excludedCells: ReadonlySet<string>;
  private byCol = new Map<string, Map<number, ColumnSpec>>();
  /** Distinct clean free-text values of the workbook, in reading order: the hold-out for the confidence calibration. Never leaves the worker. */
  readonly cleanTexts = new Set<string>();
  constructor(session: Session, excludedCells: ReadonlySet<string> = new Set()) {
    this.excludedCells = excludedCells;
    this.index = { sheets: sheetEvidence(session), entities: new Map(), phrases: new Map(), model: new VietnameseModel() };
    // The model learns from every clean text of every worksheet. The clean records that a single cell is matched against are kept only for the
    // columns that hold damage, so a large workbook does not index what it will never look up.
    // Damage that exists only in a CSV-packed copy of the table still needs the clean text of the mapped columns to learn from.
    const packedDamage = session.workbook.sheets.some(sheet => session.wprofile.sheets.find(p => p.name === sheet.name)?.role === "csv-packed" && sheet.rows.some(row => row.cells.some(cell => cell?.v.includes("?"))));
    for (const sheet of session.workbook.sheets) {
      const info = this.index.sheets.get(sheet.name)!;
      const specs = new Map(info.columns.map(item => [item.col, item.spec]));
      this.byCol.set(sheet.name, specs);
      const damaged = new Set<number>();
      for (const row of sheet.rows) if (row.r > info.headerRow) row.cells.forEach((cell, col) => { if (cell && DAMAGE.test(cell.v)) damaged.add(col); });
      for (const col of damaged) {
        const spec = specs.get(col);
        if (!spec || spec.role === "freeText") this.activeScopes.add(scopeOf(info, col, spec, "freeText"));
      }
      if (packedDamage) for (const [col, spec] of specs) if (spec.role === "freeText") this.activeScopes.add(scopeOf(info, col, spec, spec.role));
    }
  }
  add(sheetName: string, row: Row) {
    const info = this.index.sheets.get(sheetName)!, specs = this.byCol.get(sheetName)!;
    if (row.r <= info.headerRow) return;
    const entity = info.entityOf(row);
    for (let col = 0; col < row.cells.length; col++) {
      const cell = row.cells[col], spec = specs.get(col);
      if (!cell || this.excludedCells.has(cellKey(sheetName, row.r, col)) || !learnable(cell, spec)) continue;
      this.index.model.add(cell.v);
      if (this.cleanTexts.size < 120000) this.cleanTexts.add(cell.v);
      const scope = scopeOf(info, col, spec, "freeText");
      if (!this.activeScopes.has(scope)) continue;
      // The same text on another row of the same column is one more witness for it, not one more record to keep.
      const keys = phraseKeysOf(scope, cell.v), twin = !entity ? this.index.phrases.get(keys[0])?.find(item => item.value === cell.v && !item.entity) : undefined;
      if (twin) { twin.count = (twin.count ?? 1) + 1; continue; }
      // Same row/twin/value counts once. No inference from duplicated corrupted descriptions.
      const key = JSON.stringify([scope, entity, entity ? null : row.r, cell.v]);
      if (this.seen.has(key)) continue;
      this.seen.add(key);
      if (++this.count > 250000) throw new Error("Evidence budget exceeded; use a smaller workbook.");
      const source: SourceRecord = { value: cell.v, sourceId: `source-${this.count}`, entity: entity ?? "", scope, sheetId: info.sheetId, row: row.r, col };
      if (entity) { const k = evidenceKey(scope, entity), list = this.index.entities.get(k); if (list) list.push(source); else this.index.entities.set(k, [source]); }
      for (const filed of keys) { const phrases = this.index.phrases.get(filed); if (phrases) { if (phrases.length < 128) phrases.push(source); } else this.index.phrases.set(filed, [source]); }
    }
  }
  finish() { this.index.model.finish(); return this.index; }
}
