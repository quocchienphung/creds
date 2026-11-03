// Test-only, SYNTHETIC data. Two unrelated workbooks (different headers, sheet names, order, file names) built from a made-up vocabulary.
import { buildXlsx } from "./xlsx-builder.mjs";

/** Words written WITHOUT marks, the way a legacy no-diacritic export writes them. */
export const PLAIN = ["so", "tiet", "kiem", "can", "ho", "chung", "cu", "quyen", "su", "dung", "dat", "nha", "o", "rieng", "le", "xe", "to", "may", "moc", "thiet", "bi", "hop", "dong", "tin", "cong", "trinh", "kho", "bai", "gia", "tri", "tai", "san", "bao", "dam", "khoan", "vay", "ngan", "hang", "the", "chap", "cam", "co", "phong", "ban", "van", "tang", "lau", "dien", "tich"];
/** The same words WITH marks (NFC), index for index where it matters. */
export const MARKED = ["sổ", "tiết", "kiệm", "căn", "hộ", "chung", "cư", "quyền", "sử", "dụng", "đất", "nhà", "ở", "riêng", "lẻ", "xe", "ô", "tô", "máy", "móc", "thiết", "bị", "hợp", "đồng", "tín", "công", "trình", "kho", "bãi", "giá", "trị", "tài", "sản", "bảo", "đảm", "khoản", "vay", "ngân", "hàng", "thế", "chấp", "cầm", "cố", "phòng", "văn", "tầng", "lầu", "diện", "tích"];

/** Deterministic phrase number `i` of 3..6 words. */
export function phrase(words, i) {
  let x = (i * 2654435761 + 12345) >>> 0;
  const next = () => (x = (Math.imul(x, 1103515245) + 12345) >>> 0) / 4294967296;
  const n = 3 + Math.floor(next() * 4);
  return Array.from({ length: n }, () => words[Math.floor(next() * words.length)]).join(" ");
}
/** Replace the `k`-th (0-based) vowel-or-d of the phrase's `word`-th word by `?`. Used to damage a phrase the way a legacy export does. */
export function damage(text, wordIndex, charIndex = 0) {
  return text.split(" ").map((word, i) => {
    if (i !== wordIndex) return word;
    const slots = [...word].flatMap((ch, k) => /[aeiouyd]|[^\x00-\x7f]/i.test(ch) ? [k] : []);
    const at = slots[Math.min(charIndex, slots.length - 1)];
    return word.slice(0, at) + "?" + word.slice(at + 1);
  }).join(" ");
}
export const clean = (words, count, from = 0) => { const seen = new Set(), out = []; for (let i = from; out.length < count; i++) { const p = phrase(words, i); if (!seen.has(p)) { seen.add(p); out.push(p); } } return out; };

/** Cells the model has never seen as a whole phrase, with the position of their damage. */
export const target = (words, k) => phrase(words, 100000 + k);

/**
 * Workbook A: "Danh muc" (no MAU9 header) holds a long clean description column plus damaged rows; "Phu luc" is a second, unrelated table.
 * Returns the bytes and the truth of each damaged cell.
 */
export function workbookA(words = PLAIN) {
  const base = clean(words, 3600);
  const t = [target(words, 1), target(words, 2), target(words, 3), target(words, 4)];
  const rowsA = [["STT", "Noi dung", "Ghi chu"], ...base.slice(0, 3000).map((p, i) => [{ n: String(i + 1) }, p, "ok"])];
  rowsA.push([{ n: "3001" }, damage(t[0], 0, 0), "ok"]);          // damaged cell on sheet 1
  const rowsB = [["Ma", "Mo ta", "Gia tri"], ...base.slice(3000).map((p, i) => ["B" + i, p, { n: "7" }])];
  rowsB.push(["B900", damage(t[1], 1, 0), { n: "7" }]);            // damaged cell on sheet 2
  rowsB.push(["B901", damage(t[2], 0, 0), { n: "7" }]);
  rowsB.push(["B902", damage(t[0], 0, 0), { n: "7" }]);            // the SAME damaged phrase as sheet 1: both sheets must be patched
  return { bytes: buildXlsx([{ name: "Danh muc", rows: rowsA }, { name: "Phu luc", rows: rowsB }]), truth: { "Danh muc!B3002": t[0], "Phu luc!B602": t[1], "Phu luc!B603": t[2], "Phu luc!B604": t[0] }, targets: t };
}

/** Workbook B: other names, other column order, only the SECOND sheet damaged, sheet 1 spotless. */
export function workbookB(words = PLAIN) {
  const base = clean(words, 3600, 50000);
  const t = target(words, 9);
  const first = [["Tai san", "Dien giai"], ...base.slice(0, 1800).map((p, i) => ["TS" + i, p])];
  const second = [["Dien giai", "So luong", "Ma"], ...base.slice(1800).map((p, i) => [p, { n: "3" }, "M" + i]), [damage(t, 2, 0), { n: "3" }, "M999"]];
  return { bytes: buildXlsx([{ name: "Tong hop", rows: first }, { name: "Chi tiet", rows: second }]), truth: { "Chi tiet!A1802": t }, targets: [t] };
}
