import type { Change } from "./types.ts";

type Row = { id: string };
const isRow = (value: unknown): value is Row => !!value && typeof value === "object" && typeof (value as Record<string, unknown>).id === "string";

/** True when a collection is an array of records that all carry a string `id`. */
export const isRecordList = (value: unknown): value is Row[] => Array.isArray(value) && value.every(isRow);

/** What changed between two lists of records, matched by id. Order changes alone are not reported. */
export function diffById(previous: readonly Row[], next: readonly Row[]): Change[] {
  const before = new Map(previous.map(row => [row.id, row]));
  const after = new Set<string>();
  const changes: Change[] = [];
  for (const row of next) {
    after.add(row.id);
    const old = before.get(row.id);
    if (!old) changes.push({ op: "create", id: row.id, value: row });
    else if (JSON.stringify(old) !== JSON.stringify(row)) changes.push({ op: "update", id: row.id, value: row, previous: old });
  }
  for (const row of previous) if (!after.has(row.id)) changes.push({ op: "delete", id: row.id, previous: row });
  return changes;
}
