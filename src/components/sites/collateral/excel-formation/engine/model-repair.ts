import { FILL_LETTERS, VietnameseModel, stripMarks, wordsOf } from "./predict.ts";

/**
 * Acceptance policy for repairs that no clean record of the same asset can prove: the file's own clean text predicts the letter a legacy
 * export replaced by `?` (see predict.ts). A prediction is never a verified fact. It is applied only when
 *   - the word is letters and `?` only (no digits or punctuation inside, so identifiers and numbers cannot be touched),
 *   - the candidates fit the vowel/d pool (never the open-alphabet or digit fallback),
 *   - the best candidate leads the second by a margin that a hold-out of THIS file's own clean text showed to be at least `TARGET_PRECISION`
 *     right, and is attested at least `minCount` times.
 * When the hold-out is too small or never reaches the target, the policy is switched off for the file and nothing is auto-accepted.
 */
export const CALIBRATION_VERSION = "holdout-margin-2";
export const TARGET_PRECISION = 0.995, MIN_HELD_OUT_WORDS = 300, MIN_COUNT = 5;
const MARGIN_GRID = [1.4, 2, 3, 4, 5, 6, 8, 10];
const SAFE_WORD = /^[\p{L}?]+$/u;
const baseOf = (ch: string) => stripMarks(ch).toLowerCase();

export interface Calibration {
  version: string; enabled: boolean; minMargin: number; minCount: number;
  heldOutWords: number; precision: number; coverage: number; reason: string;
}
export const DISABLED: Calibration = { version: CALIBRATION_VERSION, enabled: false, minMargin: Infinity, minCount: MIN_COUNT, heldOutWords: 0, precision: 0, coverage: 0, reason: "not_calibrated" };

export interface ModelPlan { value: string; resolvedWords: number; unresolvedWords: number; minMargin: number }

/** Replace the confidently predicted damaged words of `text`. Every character that is not a `?` of a resolved word stays byte-identical. */
export function planModelRepair(model: VietnameseModel, text: string, calibration: Calibration): ModelPlan | null {
  // Offsets of a text that is not in composed form do not line up with its letters: nothing is guessed there.
  if (!calibration.enabled || !text.includes("?") || text !== text.normalize("NFC")) return null;
  const predictions = model.predict(text);
  let out = "", at = 0, resolved = 0, unresolved = 0, minMargin = Infinity;
  for (const p of predictions) {
    if (!p.broken) continue;
    const original = text.slice(p.start, p.end), target = p.target;
    const ok = SAFE_WORD.test(original) && /\p{L}/u.test(original) && !!target && target.length === original.length && !p.fallback
      && (p.margin ?? 0) >= calibration.minMargin && (p.alternatives[0]?.support ?? 0) >= calibration.minCount
      && [...original].every((ch, i) => ch === "?" ? FILL_LETTERS.includes(baseOf(target[i])) : ch === target[i]);
    if (!ok) { unresolved++; continue; }
    out += text.slice(at, p.start) + target; at = p.end; resolved++;
    minMargin = Math.min(minMargin, p.margin ?? 0);
  }
  if (!resolved) return null;
  return { value: out + text.slice(at), resolvedWords: resolved, unresolvedWords: unresolved, minMargin };
}

function rng(seed: number) { return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/**
 * Hold out every tenth distinct clean text, damage it the way the file is damaged (one fill letter of a word becomes `?`, at the observed
 * rate), predict with a model that never saw it, and pick the smallest margin that reaches TARGET_PRECISION. Deterministic.
 */
export function calibrate(cleanTexts: readonly string[], damagedWordRate: number, budgetCells = 1500): Calibration {
  const train = new VietnameseModel(), held: string[] = [];
  cleanTexts.forEach((text, i) => { if (i % 10 === 0) held.push(text.normalize("NFC")); else train.add(text); });
  if (held.length > budgetCells) held.splice(budgetCells, held.length - budgetCells);
  train.finish();
  // A file written with marks loses its MARKED letters to `?`; a file written without marks loses vowels and d (see predict.ts).
  const rate = Math.min(0.8, Math.max(0.2, damagedWordRate || 0.4)), random = rng(20260930), marked = train.usesMarks;
  const rows: { ok: boolean; margin: number; support: number }[] = [];
  for (const truth of held) {
    const masked = truth.replace(/\S+/g, word => {
      if (!SAFE_WORD.test(word) || random() >= rate) return word;
      const slots = [...word].flatMap((ch, i) => FILL_LETTERS.includes(baseOf(ch)) && (!marked || ch.toLowerCase() !== baseOf(ch)) ? [i] : []);
      if (!slots.length) return word;
      const i = slots[Math.floor(random() * slots.length)];
      return word.slice(0, i) + "?" + word.slice(i + 1);
    });
    if (masked === truth) continue;
    const truthWords = wordsOf(truth);
    for (const p of train.predict(masked)) {
      if (!p.broken || !SAFE_WORD.test(p.text) || !p.target || p.fallback) continue;
      rows.push({ ok: p.target.toLowerCase() === truthWords[p.index]?.text.toLowerCase(), margin: p.margin ?? 0, support: p.alternatives[0]?.support ?? 0 });
    }
  }
  const base: Calibration = { ...DISABLED, heldOutWords: rows.length };
  if (rows.length < MIN_HELD_OUT_WORDS) return { ...base, reason: "calibration_set_too_small" };
  for (const minMargin of MARGIN_GRID) {
    const chosen = rows.filter(r => r.margin >= minMargin && r.support >= MIN_COUNT), correct = chosen.filter(r => r.ok).length;
    if (chosen.length >= MIN_HELD_OUT_WORDS / 2 && correct / chosen.length >= TARGET_PRECISION) {
      return { version: CALIBRATION_VERSION, enabled: true, minMargin, minCount: MIN_COUNT, heldOutWords: rows.length, precision: correct / chosen.length, coverage: chosen.length / rows.length, reason: "calibrated" };
    }
  }
  return { ...base, reason: "target_precision_not_reached" };
}
