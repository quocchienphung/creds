export interface DiffPart { text: string; changed: boolean }

/**
 * Word-level difference of two texts for display: the parts of `before` that are gone and the parts of `after` that are new, whitespace kept so
 * both sides read as the original text. Presentation only; it never decides a value. Texts longer than `LIMIT` words are shown as wholly changed.
 */
const LIMIT = 400;
const blank = (text: string) => /^\s+$/.test(text);
const split = (text: string) => text.split(/(\s+)/).filter(part => part !== "");

export function wordDiff(before: string, after: string): { before: DiffPart[]; after: DiffPart[] } {
  const a = split(before), b = split(after);
  if (before === after) return { before: a.map(text => ({ text, changed: false })), after: b.map(text => ({ text, changed: false })) };
  if (a.length > LIMIT || b.length > LIMIT) return { before: before ? [{ text: before, changed: true }] : [], after: after ? [{ text: after, changed: true }] : [] };
  // Longest common subsequence of the words (spaces compare equal to spaces).
  const same = (x: string, y: string) => x === y || blank(x) && blank(y);
  const table = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) table[i][j] = same(a[i], b[j]) ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
  const left: DiffPart[] = [], right: DiffPart[] = [];
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    if (same(a[i], b[j])) { left.push({ text: a[i++], changed: false }); right.push({ text: b[j++], changed: false }); }
    else if (table[i + 1][j] >= table[i][j + 1]) left.push({ text: a[i], changed: !blank(a[i++]) });
    else right.push({ text: b[j], changed: !blank(b[j++]) });
  }
  while (i < a.length) left.push({ text: a[i], changed: !blank(a[i++]) });
  while (j < b.length) right.push({ text: b[j], changed: !blank(b[j++]) });
  return { before: left, after: right };
}
