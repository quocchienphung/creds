import { planModelRepair, type Calibration, type ModelPlan } from "./model-repair.ts";
import { FILL_LETTERS, stripMarks, type VietnameseModel } from "./predict.ts";
import { isTextCell, textRoleOf } from "./sheet-scan.ts";
import { GIVEN_NAMES, MIDDLE_NAMES } from "./name-seed.ts";
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

// ── a guess, only where the calibrated model cannot decide ─────────────────────────────────────────────────────────────────────────────────

/** Common Vietnamese family names and middle names, unmarked: a prior for a file with few names. The given names come from the file itself. */
const FAMILY_SEED = "nguyen tran le pham hoang huynh phan vu vo dang bui do ho ngo duong ly dinh trinh truong luong lam mai ta ha cao to thai doan quach chu kieu kim la lac lieu".split(" ");
const MIDDLE_SEED = "van thi huu duc minh quoc ngoc thanh xuan kim hong anh bao gia quang trung cong dinh ba tien viet phuong thu thuy khanh nhat hai manh lan diem".split(" ");
const SEPARATORS = /[^-–&,;/]+/g;

export interface NamePositions { family: Map<string, number>; middle: Map<string, number>; given: Map<string, number> }
const plain = (word: string) => stripMarks(word.toLowerCase());
/** The words of a name by position: the first word of a part is a family name, the last a given name, the rest middle names; `-` and `&` start a new part. */
function parts(text: string): { word: string; role: "family" | "middle" | "given" }[][] {
  return [...text.matchAll(SEPARATORS)].map(part => {
    const words = [...part[0].matchAll(/\S+/g)].map(item => item[0]);
    return words.map((word, i) => ({ word, role: words.length === 1 || i === words.length - 1 ? "given" as const : i === 0 ? "family" as const : "middle" as const }));
  });
}
export function namePositions(names: Iterable<string>): NamePositions {
  const out: NamePositions = { family: new Map(), middle: new Map(), given: new Map() };
  for (const word of FAMILY_SEED) out.family.set(word, 1);
  for (const word of MIDDLE_SEED) out.middle.set(word, 1);
  for (const name of names) for (const part of parts(name)) for (const { word, role } of part) { const w = plain(word); if (/^\p{L}+$/u.test(w)) out[role].set(w, (out[role].get(w) ?? 0) + 1); }
  // A word of the name list that the file never wrote counts for less than a word it wrote once, so it only ever settles what the file cannot.
  for (const [role, list] of [["given", GIVEN_NAMES], ["middle", MIDDLE_NAMES]] as const) for (const word of list) if (!out[role].has(word)) out[role].set(word, 0.5);
  return out;
}

/**
 * Fill every word of a name that still holds a `?`, with the word of that place (family, middle or given) that fits the letters and is the most often written in
 * this file. Only words the file or the seed lists hold are ever used, so nothing is invented; a word that nothing fits keeps its `?`. The result is a guess, never verified.
 */
export function guessName(text: string, positions: NamePositions): { value: string; resolved: number; unresolved: number } | null {
  if (!text.includes("?") || text !== text.normalize("NFC")) return null;
  const capitals = !/\p{Ll}/u.test(text);
  let value = text, resolved = 0, unresolved = 0;
  for (const part of [...text.matchAll(SEPARATORS)]) {
    const words = [...part[0].matchAll(/\S+/g)];
    words.forEach((match, i) => {
      const word = match[0];
      if (!word.includes("?")) return;
      const at = part.index! + match.index!;
      if (!/^[\p{L}?]+$/u.test(word) || !/\p{L}/u.test(word.replaceAll("?", ""))) { unresolved++; return; }
      const role = words.length === 1 || i === words.length - 1 ? "given" : i === 0 ? "family" : "middle", pattern = plain(word);
      let best = "", bestCount = 0, ties = 0;
      for (const [candidate, count] of positions[role]) {
        if (candidate.length !== pattern.length || count < bestCount || !([...pattern].every((ch, k) => ch === "?" ? FILL_LETTERS.includes(candidate[k]) : ch === candidate[k]))) continue;
        if (count > bestCount) { best = candidate; bestCount = count; ties = 1; } else { ties++; if (candidate < best) best = candidate; }
      }
      // Words of the public list carry no frequency (count < 1): when several of them fit, nothing tells them apart, so none is picked.
      if (!best || (bestCount < 1 && ties > 1)) { unresolved++; return; }
      const known = [...word].filter(ch => ch !== "?" && /\p{L}/u.test(ch)), upper = capitals || (known.length >= 2 && known.every(ch => ch === ch.toUpperCase()));
      value = value.slice(0, at) + [...word].map((ch, k) => ch !== "?" ? ch : upper ? best[k].toUpperCase() : best[k]).join("") + value.slice(at + word.length);
      resolved++;
    });
  }
  return resolved ? { value, resolved, unresolved } : null;
}
