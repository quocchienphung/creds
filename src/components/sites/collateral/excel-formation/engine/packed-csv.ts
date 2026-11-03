import type { Sheet } from "./types.ts";
import type { ColumnSpec, MappingProfile } from "./mapping-profiles.ts";
import { resolveMapping, type HeaderCell } from "./profile.ts";
import { corruptionSpans } from "./corruption-span.ts";
import { planModelRepair, type Calibration } from "./model-repair.ts";
import type { VietnameseModel } from "./predict.ts";

/**
 * A sheet whose rows are whole CSV lines ("a","b","c") spread over a quote cell, one big text cell and a quote cell. The first line names the
 * fields; the field NAMES decide which fields are free text, exactly as the column headers do on a normal sheet. A repaired line keeps every
 * character that is not a restored `?`: the quotes, the separators, the identifier and number fields.
 */
export const SEPARATOR = "\",\"";
/** A field the legacy profile calls free text but that identifies something (province code, plate...): never guessed. */
export const IDENTIFIER_FIELD = /(?:^|\.)(?:id|code|taxCode|idDocument|plate|province|registration|license|certificate)$/;

export interface PackedPlan { packedCol: number; headerRow: number; fieldCount: number; repairable: ReadonlyMap<number, ColumnSpec> }

/** The plan for a packed sheet, or null when its first line is not a header the profile recognises. */
export function planPacked(sheet: Sheet, profile: MappingProfile): PackedPlan | null {
  const first = sheet.rows[0];
  if (!first) return null;
  let packedCol = -1, best = 0;
  first.cells.forEach((cell, col) => { const n = cell ? cell.v.split(SEPARATOR).length - 1 : 0; if (n > best) { best = n; packedCol = col; } });
  if (packedCol < 0 || best < 3) return null;
  const names = first.cells[packedCol]!.v.split(SEPARATOR);
  const headers: HeaderCell[] = names.map((text, col) => ({ col, letter: "", text: text.trim() }));
  const mapping = resolveMapping(headers, profile);
  if (mapping.ambiguous.length || mapping.duplicates.length || mapping.resolved.length < 3) return null;
  const repairable = new Map<number, ColumnSpec>();
  for (const { spec, col } of mapping.resolved) if (spec.role === "freeText" && !IDENTIFIER_FIELD.test(spec.field)) repairable.set(col, spec);
  return { packedCol, headerRow: first.r, fieldCount: names.length, repairable };
}

export interface PackedOutcome {
  /** The line with the confidently restored words, or null when nothing was restored. */
  value: string | null;
  /** Fields (free text) restored / fields that still hold a `?`. */
  fixedFields: number; damagedFields: number; unresolvedFields: number; protectedFields: number; shape: boolean;
}

export function repairPackedLine(line: string, plan: PackedPlan, model: VietnameseModel, calibration: Calibration): PackedOutcome {
  const out: PackedOutcome = { value: null, fixedFields: 0, damagedFields: 0, unresolvedFields: 0, protectedFields: 0, shape: false };
  if (!line.includes("?")) return out;
  const fields = line.split(SEPARATOR);
  if (fields.length !== plan.fieldCount) { out.shape = true; out.damagedFields = 1; out.protectedFields = 1; return out; }
  let changed = false;
  const next = fields.map((field, index) => {
    if (!field.includes("?")) return field;
    out.damagedFields++;
    if (!plan.repairable.has(index)) { out.protectedFields++; return field; }
    if (!corruptionSpans(field).some(span => span.kind === "replacement")) { out.unresolvedFields++; return field; }
    const planned = planModelRepair(model, field, calibration);
    if (!planned) { out.unresolvedFields++; return field; }
    changed = true; out.fixedFields++;
    if (planned.unresolvedWords > 0 || corruptionSpans(planned.value).length) out.unresolvedFields++;
    return planned.value;
  });
  if (changed) out.value = next.join(SEPARATOR);
  return out;
}
