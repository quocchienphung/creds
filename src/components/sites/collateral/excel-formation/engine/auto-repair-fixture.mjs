// Synthetic, test-only data. No private input is read by tests, browser QA or benchmarks.
import { buildXlsx } from "./xlsx-builder.mjs";
export const REPAIR_HEADERS = ["MACNTCTD", "MAKH", "MASOBD", "MALOAIBD", "GIATRI", "MOTABDS", "MOTABD", "TENKH"];
const row = (id, text, twin = text) => ["00001", "00123", id, "303", { n: "1234.5599999999999" }, text, twin, "Synthetic Person"];
export const repairFixture = () => buildXlsx([
  { name: "Synthetic", rows: [REPAIR_HEADERS, row("A", "S? ti?t ki?m", "Sổ tiết kiệm"), row("B", "Quy?n s? d?ng d?t", "Quyền sử dụng đất"), row("C", "can ho ba? tang 3", "can ho bay tang 3"), row("D", "Anh?"), row("E", "ma?", "may"), row("E", "mai"), row("F", "Other clean source")], hiddenRows: [2] },
  { name: "Other", rows: [["literal?", "�", { f: "1+1", v: "2" }, "00123", { n: "1234.5599999999999" }, "?code"], ["😀", "Cafe\u0301"]] },
]);
