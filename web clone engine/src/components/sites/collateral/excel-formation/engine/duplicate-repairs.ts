import type { Session } from "./session.ts";
import type { ReviewState } from "./review.ts";
import { applyEdits, cellKey } from "./review.ts";
import { sheetEvidence } from "./evidence-index.ts";
import { matchesMask } from "./corruption-span.ts";

interface Occurrence { sheet: string; row: number; col: number; identity: string | null; field: string; value: string; hidden: boolean }
export interface DuplicateSummary {
  withinAsset: { groups: number; rowOccurrences: number; cells: number; largestGroupRows: number };
  exactText: { groups: number; rowOccurrences: number; cells: number; largestGroupRows: number; groupsAcrossAssets: number };
}
export interface DuplicatePlan {
  scope: "asset"; sheet: string; anchor: { row: number; col: number }; rows: number[]; cells: number;
  skippedEdited: number; skippedExceptions: number; distinctAssets: number; canPropagate: boolean;
  hiddenRows: number;
  reason: "eligible" | "protected_or_unmapped" | "no_matching_rows";
}
interface Index { asset: Map<string, Occurrence[]>; text: Map<string, Occurrence[]>; at: Map<string, Occurrence>; identityCols: Map<string, number[]>; summary: DuplicateSummary }
const cached = new WeakMap<Session, Index>();
const textKey = (sheet: string, field: string, value: string) => JSON.stringify([sheet, field, value]);
const assetKey = (sheet: string, field: string, identity: string, value: string) => JSON.stringify([sheet, field, identity, value]);

/** Equal damaged text groups occurrences; it never supplies evidence for the missing characters. */
function indexOf(session: Session): Index {
  const found = cached.get(session); if (found) return found;
  const asset = new Map<string, Occurrence[]>(), text = new Map<string, Occurrence[]>(), at = new Map<string, Occurrence>();
  const identityCols = new Map<string, number[]>();
  const sheets = sheetEvidence(session);
  const add = (map: Map<string, Occurrence[]>, key: string, occurrence: Occurrence) => { const list = map.get(key); if (list) list.push(occurrence); else map.set(key, [occurrence]); };
  for (const sheet of session.workbook.sheets) {
    const info = sheets.get(sheet.name)!;
    const group = session.profile.groupBy;
    identityCols.set(sheet.name, [group.branch, group.customer, group.asset].flatMap(header => info.columns.filter(item => item.spec.header === header).map(item => item.col)));
    for (const row of sheet.rows) {
      if (row.r <= info.headerRow) continue;
      const identity = info.entityOf(row);
      for (const { col, spec } of info.columns) {
        const cell = row.cells[col];
        if (spec.role !== "freeText" || /(?:^|\.)(?:id|code|taxCode|idDocument|plate|province|registration|license|certificate)$/.test(spec.field)) continue;
        if (!cell || cell.f || cell.protectedText || !["s", "str", "inlineStr"].includes(cell.t) || !cell.v.includes("?")) continue;
        const occurrence = { sheet: sheet.name, row: row.r, col, identity, field: spec.comparisonOf ?? spec.header, value: cell.v, hidden: row.hidden };
        at.set(cellKey(sheet.name, row.r, col), occurrence);
        if (at.size > 250000) throw new Error("Duplicate-error index budget exceeded.");
        add(text, textKey(sheet.name, occurrence.field, cell.v), occurrence);
        if (identity) add(asset, assetKey(sheet.name, occurrence.field, identity, cell.v), occurrence);
      }
    }
  }
  const summarize = (map: Map<string, Occurrence[]>) => {
    let groups = 0, rowOccurrences = 0, cells = 0, largestGroupRows = 0, groupsAcrossAssets = 0;
    for (const items of map.values()) {
      const rows = new Set(items.map(item => item.row)); if (rows.size < 2) continue;
      groups++; rowOccurrences += rows.size; cells += items.length; largestGroupRows = Math.max(largestGroupRows, rows.size);
      if (new Set(items.flatMap(item => item.identity ? [item.identity] : [])).size > 1) groupsAcrossAssets++;
    }
    return { groups, rowOccurrences, cells, largestGroupRows, groupsAcrossAssets };
  };
  const { groupsAcrossAssets: unused, ...withinAsset } = summarize(asset); void unused;
  const index = { asset, text, at, identityCols, summary: { withinAsset, exactText: summarize(text) } };
  cached.set(session, index); return index;
}

export const duplicateSummary = (session: Session): DuplicateSummary => indexOf(session).summary;

function targets(session: Session, state: ReviewState, sheet: string, row: number, col: number, includeTwin: boolean) {
  const index = indexOf(session), anchor = index.at.get(cellKey(sheet, row, col));
  if (!anchor) return { anchor: null, items: [] as Occurrence[], skippedEdited: 0, skippedExceptions: 0 };
  const candidates = anchor.identity ? index.asset.get(assetKey(sheet, anchor.field, anchor.identity, anchor.value)) ?? [] : [];
  const items: Occurrence[] = []; let skippedEdited = 0, skippedExceptions = 0;
  for (const item of candidates) {
    if (!includeTwin && item.col !== col) continue;
    // Original grouping becomes stale when any identity component is edited. Do not propagate into that row.
    if (state.patches[cellKey(item.sheet, item.row, item.col)] || index.identityCols.get(item.sheet)?.some(keyCol => state.patches[cellKey(item.sheet, item.row, keyCol)])) { skippedEdited++; continue; }
    if (session.ctx.issuesAt(item.sheet, item.row, item.col).some(issue => state.states[issue.id]?.status === "accepted_exception")) { skippedExceptions++; continue; }
    items.push(item);
  }
  return { anchor, items, skippedEdited, skippedExceptions };
}

export function planDuplicateRepair(session: Session, state: ReviewState, sheet: string, row: number, col: number, includeTwin = true): DuplicatePlan {
  const selection = targets(session, state, sheet, row, col, includeTwin);
  const rows = [...new Set(selection.items.map(item => item.row))].sort((a, b) => a - b);
  return { scope: "asset", sheet, anchor: { row, col }, rows, cells: selection.items.length, skippedEdited: selection.skippedEdited, skippedExceptions: selection.skippedExceptions,
    distinctAssets: new Set(selection.items.flatMap(item => item.identity ? [item.identity] : [])).size,
    hiddenRows: new Set(selection.items.filter(item => item.hidden).map(item => item.row)).size,
    canPropagate: rows.length > 1 && selection.items.some(item => item.row === row && item.col === col),
    reason: !selection.anchor ? "protected_or_unmapped" : rows.length > 1 ? "eligible" : "no_matching_rows" };
}

/** Explicit human-approved batch, re-planned against current state. No guessed character is inferred from repetition. */
export function applyDuplicateRepair(session: Session, state: ReviewState, sheet: string, row: number, col: number, value: string, includeTwin: boolean): { state: ReviewState; plan: DuplicatePlan; changedCells: number } {
  const plan = planDuplicateRepair(session, state, sheet, row, col, includeTwin);
  if (!plan.canPropagate) throw new Error("The repeated-error group changed or has no eligible matching rows. Review it again.");
  const selection = targets(session, state, sheet, row, col, includeTwin);
  const original = selection.anchor!.value;
  if (!matchesMask(original, value) || (original.match(/\d+/g) ?? []).join("|") !== (value.match(/\d+/g) ?? []).join("|") || /^\s*[=+@-]/.test(value)) throw new Error("A grouped repair must fill only the missing-character spans and preserve every known character and digit.");
  const next = applyEdits(state, session.ctx, selection.items.map(item => ({ sheet: item.sheet, row: item.row, col: item.col, value, source: "group" })));
  return { state: next, plan, changedCells: selection.items.length };
}
