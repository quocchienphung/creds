import { planModelRepair, type Calibration, type ModelPlan } from "./model-repair.ts";
import type { VietnameseModel } from "./predict.ts";
import { isTextCell, textRoleOf } from "./sheet-scan.ts";
import type { Sheet } from "./types.ts";

/**
 * Person and organisation names are predicted from the names of THIS file only, never from addresses or descriptions: a name column has its own
 * words (family names, middle names, given names, company forms) and its own frequencies. The same hold-out calibration as for free text decides
 * whether a prediction may be applied, and a name the model cannot settle is left for a person.
 */
export const NAME_CALIBRATION_VERSION = "name-holdout-1";

/** The model fills letters in lower case unless the letters that are known say the text is written in capitals: one known capital (`D?`) says nothing. */
export function planNameRepair(model: VietnameseModel, text: string, calibration: Calibration): ModelPlan | null {
  const plan = planModelRepair(model, text, calibration);
  if (!plan || plan.value.length !== text.length) return plan;
  const capitals = !/\p{Ll}/u.test(text);
  let value = "";
  for (const match of text.matchAll(/\S+|\s+/g)) {
    const word = match[0], at = match.index!;
    const known = [...word].filter(ch => ch !== "?" && /\p{L}/u.test(ch)), upper = capitals || (known.length >= 2 && known.every(ch => ch === ch.toUpperCase()));
    for (let i = 0; i < word.length; i++) { const ch = plan.value[at + i]; value += word[i] === "?" && ch !== "?" ? (upper ? ch.toUpperCase() : ch.toLowerCase()) : ch; }
  }
  return { ...plan, value };
}

/**
 * The columns of a sheet that hold names although no profile says so: most of what they hold has the shape of a name (several words that each begin
 * with a capital letter, no digit). Needs enough values to tell; fewer than that and the column is left to the per-value judgement.
 */
export function nameColumnsOf(sheet: Sheet, mapped: ReadonlySet<number>): Set<number> {
  const seen = new Map<number, { names: number; letters: number }>();
  let scanned = 0;
  for (const row of sheet.rows) {
    if (++scanned > 600) break;
    row.cells.forEach((cell, col) => {
      if (!cell || cell.f || cell.protectedText || mapped.has(col) || !isTextCell(cell) || !/\p{L}/u.test(cell.v) || /[?�]/.test(cell.v)) return;
      const entry = seen.get(col) ?? { names: 0, letters: 0 };
      entry.letters++; if (textRoleOf(cell.v) === "name") entry.names++;
      seen.set(col, entry);
    });
  }
  return new Set([...seen].filter(([, entry]) => entry.letters >= 30 && entry.names / entry.letters >= 0.7).map(([col]) => col));
}
