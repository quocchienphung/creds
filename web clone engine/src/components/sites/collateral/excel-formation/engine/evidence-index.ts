import type { Session } from "./session.ts";
import type { Row } from "./types.ts";
import { analyzeValue } from "./detect.ts";
import { VietnameseModel } from "./predict.ts";
import { resolveMapping } from "./profile.ts";
import { cellKey } from "./review.ts";
export const INDEX_VERSION = "evidence-1";
export interface SourceRecord { value: string; sourceId: string; entity: string; scope: string; sheetId: string; row: number; col: number }
export interface SheetEvidence { sheetId: string; headerRow: number; columns: ReturnType<typeof resolveMapping>["resolved"]; entityOf: (row: Row) => string | null }
export interface EvidenceIndex { sheets: Map<string, SheetEvidence>; entities: Map<string, SourceRecord[]>; phrases: Map<string, SourceRecord[]>; model: VietnameseModel }
export const evidenceKey = (scope: string, entity: string) => JSON.stringify([scope, entity]);
export function sheetEvidence(session: Session): Map<string, SheetEvidence> {
  const out = new Map<string, SheetEvidence>();
  session.workbook.sheets.forEach((sheet, i) => {
    const profile = session.wprofile.sheets.find(p => p.name === sheet.name)!;
    const mapping = sheet.name === session.wprofile.primary ? session.wprofile.mapping : resolveMapping(profile.headers, session.profile);
    const columns = mapping && !profile.ambiguousHeader && !mapping.ambiguous.length && !mapping.duplicates.length ? mapping.resolved : [];
    const group = session.profile.groupBy;
    const keys = [group.branch, group.customer, group.asset].map(h => columns.find(c => c.spec.header === h)?.col);
    out.set(sheet.name, { sheetId: `sheet-${i + 1}`, headerRow: profile.headerRow ?? 0, columns, entityOf: row => {
      if (keys.some(k => k === undefined)) return null;
      const values = keys.map(k => row.cells[k!]);
      if (values.some(c => !c || c.f || !c.v || /[?\ufffd]/.test(c.v))) return null;
      return JSON.stringify(values.map(c => c!.v));
    } });
  });
  return out;
}

export class EvidenceBuilder {
  readonly index: EvidenceIndex;
  private seen = new Set<string>();
  private count = 0;
  private activeScopes = new Set<string>();
  private excludedCells: ReadonlySet<string>;
  /** Distinct clean free-text values of the damaged columns, in reading order: the hold-out for the confidence calibration. Never leaves the worker. */
  readonly cleanTexts = new Set<string>();
  constructor(session: Session, excludedCells: ReadonlySet<string> = new Set()) {
    this.excludedCells = excludedCells;
    this.index = { sheets: sheetEvidence(session), entities: new Map(), phrases: new Map(), model: new VietnameseModel() };
    // Only index text fields that need recovery; unrelated clean fields still participate in workbook accounting.
    // Damage that exists only in a CSV-packed copy of the table still needs the clean text of the mapped columns to learn from.
    const packedDamage = session.workbook.sheets.some(sheet => session.wprofile.sheets.find(p => p.name === sheet.name)?.role === "csv-packed" && sheet.rows.some(row => row.cells.some(cell => cell?.v.includes("?"))));
    for (const sheet of session.workbook.sheets) {
      const info = this.index.sheets.get(sheet.name)!;
      for (const { col, spec } of info.columns) if (spec.role === "freeText" && (packedDamage || sheet.rows.some(row => row.r > info.headerRow && /[?\ufffdÃÄÆáâ]/.test(row.cells[col]?.v ?? "")))) this.activeScopes.add(JSON.stringify([info.sheetId, spec.comparisonOf ?? spec.header, spec.role]));
    }
  }
  add(sheetName: string, row: Row) {
    const info = this.index.sheets.get(sheetName)!;
    if (row.r <= info.headerRow) return;
    const entity = info.entityOf(row);
    for (const { col, spec } of info.columns) {
      if (this.excludedCells.has(cellKey(sheetName, row.r, col))) continue;
      const cell = row.cells[col];
      if (!cell || cell.f || !["s", "inlineStr", "str"].includes(cell.t) || spec.role !== "freeText" || !cell.v || cell.v.length > 32767) continue;
      if (cell.protectedText || analyzeValue(cell.v, spec, { diacriticPolicy: false }).length) continue;
      const field = spec.comparisonOf ?? spec.header, scope = JSON.stringify([info.sheetId, field, spec.role]);
      if (!this.activeScopes.has(scope)) continue;
      // Same row/twin/value counts once. No inference from duplicated corrupted descriptions.
      const key = JSON.stringify([scope, entity, entity ? null : row.r, cell.v]);
      if (this.seen.has(key)) continue;
      this.seen.add(key);
      if (++this.count > 250000) throw new Error("Evidence budget exceeded; use a smaller workbook.");
      const source: SourceRecord = { value: cell.v, sourceId: `source-${this.count}`, entity: entity ?? "", scope, sheetId: info.sheetId, row: row.r, col };
      if (entity) { const k = evidenceKey(scope, entity), list = this.index.entities.get(k); if (list) list.push(source); else this.index.entities.set(k, [source]); }
      const phraseKey = scope + "\u0000" + cell.v.normalize("NFC").slice(0, 2);
      const phrases = this.index.phrases.get(phraseKey); if (phrases) { if (phrases.length < 128) phrases.push(source); } else this.index.phrases.set(phraseKey, [source]);
      this.index.model.add(cell.v);
      if (this.cleanTexts.size < 120000) this.cleanTexts.add(cell.v);
    }
  }
  finish() { this.index.model.finish(); return this.index; }
}
