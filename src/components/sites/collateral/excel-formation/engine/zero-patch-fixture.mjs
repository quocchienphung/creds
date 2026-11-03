// Synthetic, test-only data for the zero-patch regression and the calibrated-model tests.
import { buildXlsx } from "./xlsx-builder.mjs";

export const HEADERS = ["MACNTCTD", "MAKH", "MASOBD", "MALOAIBD", "GIATRI", "MOTABDS", "MOTABD", "TENKH"];
const NOUNS = ["may moc", "can ho", "nha pho", "quyen su dung dat", "xe tai", "kho xuong", "thiet bi", "dat nong nghiep", "van phong", "cua hang"];
const PARTS = ["tang ba", "mat tien", "duong lon", "co dien tich rieng", "gan cho", "gan truong hoc", "co so do", "san xuat", "van tai", "bao gom may tien", "dien va nuoc day du", "chung cu cao tang"];
/** 1600 distinct clean descriptions: enough text for a hold-out (the real file has tens of thousands). */
export const CLEAN = Array.from({ length: 1600 }, (_, i) => `${NOUNS[i % NOUNS.length]} ${PARTS[(i * 7) % PARTS.length]} va ${PARTS[(i * 5 + 3) % PARTS.length]} so ${i % 37}`);
const row = (n, text) => ["00001", `K${1000 + n}`, `A${n}`, "303", { n: "1234.5599999999999" }, text, text, "Synthetic Person"];
/** Clean corpus: every phrase appears on many other assets. Damaged rows: unique asset, `?` in place of vowels. */
export function zeroPatchWorkbook() {
  const rows = [HEADERS];
  CLEAN.forEach((text, i) => rows.push(row(i, text)));
  const damaged = [
    "m?y moc tang ba va c? so do so 5",
    "c?n ho gan cho va m?t tien so 12",
    "nha pho duong l?n va gan truong hoc so 3",
    "x? ?? ?? q? ??? k?",
    "Hello world?",
  ];
  damaged.forEach((text, k) => rows.push(row(1600 + k, text)));
  rows.push(["00001", "K9", "A99", "303", { n: "1" }, "sho?", "sho?", "Nguy?n Van A"]);
  return buildXlsx([{ name: "Synthetic", rows, hiddenRows: [1603] }, { name: "Other", rows: [["literal?", { f: "1+1", v: "2" }, "00123"]] }]);
}
