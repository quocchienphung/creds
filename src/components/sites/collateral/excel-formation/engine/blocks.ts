import type { ColumnSpec, MappingProfile } from "./mapping-profiles.ts";

/**
 * A block of columns that makes one entry of an array in the JSON (a project, a land title, a vehicle), resolved against the columns of the
 * open workbook. Blocks whose key column is not in the workbook are left out: nothing can be judged without it.
 */
export interface ResolvedBlock { id: string; title: string; anchor: number; anchorHeader: string; members: number[] }

export function resolveBlocks(profile: MappingProfile, resolved: readonly { spec: ColumnSpec; col: number }[]): ResolvedBlock[] {
  const colOf = (header: string) => resolved.find(item => item.spec.header === header)?.col;
  const out: ResolvedBlock[] = [];
  for (const block of profile.blocks ?? []) {
    const anchor = colOf(block.anchor);
    if (anchor === undefined) continue;
    const members = block.members.map(colOf).filter((col): col is number => col !== undefined && col !== anchor);
    out.push({ id: block.id, title: block.title, anchor, anchorHeader: block.anchor, members });
  }
  return out;
}

export const isFilled = (text: string) => text.trim() !== "";

/**
 * The column of the first value in a block whose key column is empty, or null when the block is whole (key filled) or holds nothing.
 * Such a row would make an entry without a name; it is a problem to look at, and its values still reach the JSON.
 */
export function incompleteAt(block: ResolvedBlock, valueAt: (col: number) => string): number | null {
  if (isFilled(valueAt(block.anchor))) return null;
  for (const col of block.members) if (isFilled(valueAt(col))) return col;
  return null;
}
