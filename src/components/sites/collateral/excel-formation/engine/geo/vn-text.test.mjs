import { test } from "node:test";
import assert from "node:assert/strict";
import { accentedVariants, caseShape, foldKey, isVietnameseWord, pieces, toAscii, VIETNAMESE_LETTERS, withCase } from "./vn-text.ts";

test("the conversion to Vietnamese without marks handles every example of the specification and keeps case, digits and punctuation", () => {
  const cases = { "Đường Nguyễn Huệ": "Duong Nguyen Hue", "Phường Đức Hòa": "Phuong Duc Hoa", "Thành phố Hồ Chí Minh": "Thanh pho Ho Chi Minh", "Xã Đắk Lắk": "Xa Dak Lak", "Khu công nghiệp Tân Tạo": "Khu cong nghiep Tan Tao", "NHÀ Ở HÌNH THÀNH TRONG TƯƠNG LAI": "NHA O HINH THANH TRONG TUONG LAI", "Số 12/3, Hẻm 45": "So 12/3, Hem 45", "ĐẠI LỘ": "DAI LO" };
  for (const [from, to] of Object.entries(cases)) assert.equal(toAscii(from), to);
  assert.equal(toAscii("Đ".normalize("NFD")), "D", "decomposed input gives the same result as composed input");
  assert.equal(toAscii("đ"), "d");
  assert.equal(foldKey("  Đường   NGUYỄN  Huệ "), "duong nguyen hue");
});

test("every Vietnamese vowel and tone combination is generated and folds back to its base letter", () => {
  const counts = Object.fromEntries([..."aeiouy"].map(base => [base, accentedVariants(base).length]));
  assert.deepEqual(counts, { a: 18, e: 12, i: 6, o: 18, u: 12, y: 6 });
  assert.deepEqual(accentedVariants("d").sort(), ["d", "đ"]);
  for (const base of "aeiouyd") for (const variant of accentedVariants(base)) { assert.equal([...variant].length, 1); assert.equal(toAscii(variant), base); }
  for (const letter of "ăâêôơưđ") assert.ok(VIETNAMESE_LETTERS.includes(letter), letter);
  assert.equal(new Set(VIETNAMESE_LETTERS).size, VIETNAMESE_LETTERS.length);
  assert.ok(isVietnameseWord("nguyễn") && isVietnameseWord("ĐỨC") && !isVietnameseWord("w") && !isVietnameseWord("x?"));
});

test("NFD input and NFC input are the same text for the engine", () => {
  const composed = "Hưng Đạo", decomposed = composed.normalize("NFD");
  assert.notEqual(composed, decomposed);
  assert.equal(toAscii(decomposed), toAscii(composed));
});

test("case shapes are read from letters and given back to a candidate", () => {
  assert.deepEqual(["TT", "Duc", "duc", "D?C", "V?n", "?"].map(caseShape), ["upper", "title", "lower", "upper", "title", "lower"]);
  assert.equal(withCase("duc", "upper"), "DUC");
  assert.equal(withCase("duc", "title"), "Duc");
});

test("the text is cut into words that may hold ?, digits and the characters between them", () => {
  assert.deepEqual(pieces("TT.D?c Hoa, 2.21").map(piece => piece.text), ["TT", ".", "D?c", " ", "Hoa", ",", " ", "2", ".", "21"]);
  assert.ok(pieces("a ? b").some(piece => piece.text === "?" && piece.kind === "word"));
});
