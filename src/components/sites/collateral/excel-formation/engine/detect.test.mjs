import { test } from "node:test";
import assert from "node:assert/strict";
import { buildXlsx } from "./xlsx-builder.mjs";
import { readWorkbook } from "./xlsx-reader.ts";
import { MAU9_PROFILE } from "./mapping-profiles.ts";
import { profileWorkbook } from "./profile.ts";
import { analyzeValue, applyFix, Corpus, detectIssues, tryDecodeMojibake } from "./detect.ts";

const HEADERS = ["NGAYDULIEU", "MACNTCTD", "TENCNTCTD", "MAKH", "TENKH", "MASOBD", "MALOAIBD", "NGBDAU", "GIATRI", "GIATRIBDKV", "NGDINHGIA", "DSSOHD", "HOTENCSH", "MOTABD", "MOTABDS"];
/** One synthetic data row; every value is made up. */
const row = (o = {}) => {
  const base = { NGAYDULIEU: "30/09/2026", MACNTCTD: "00000001", TENCNTCTD: "CN TEST", MAKH: "00000123", TENKH: "Cong ty Mau", MASOBD: "D0001", MALOAIBD: "303", NGBDAU: "20200101", GIATRI: { n: "1000" }, GIATRIBDKV: { n: "500" }, NGDINHGIA: "20210101", DSSOHD: "0001/10R", HOTENCSH: "Nguyen Van A", MOTABD: "May moc thiet bi", MOTABDS: "May moc thiet bi", ...o };
  return HEADERS.map(h => base[h]);
};
const scan = (dataRows, opts) => {
  const wb = readWorkbook(buildXlsx([{ name: "MAU9_TEST", rows: [HEADERS, ...dataRows] }]), { fileName: "synthetic.xlsx", fileHash: "sha256:test" });
  const profile = profileWorkbook(wb, MAU9_PROFILE);
  return { wb, profile, ...detectIssues(wb, profile, MAU9_PROFILE, opts) };
};
const cats = (result, filter = () => true) => result.issues.filter(filter).map(issue => `${issue.field}:${issue.category}:${issue.severity}`).sort();

test("a clean workbook yields no issues", () => {
  const result = scan([row(), row({ MASOBD: "D0002", MOTABD: "Xe tai 5 tan (Hyundai) H6568/1 - 100% & KHONGGAN", MOTABDS: "Xe tai 5 tan (Hyundai) H6568/1 - 100% & KHONGGAN" })]);
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.blockers, []);
  assert.equal(result.profile.primary, "MAU9_TEST");
});

test("question mark inside a word is critical, and the suggestion comes from clean words of the same column", () => {
  const clean = Array.from({ length: 3 }, (_, i) => row({ MASOBD: `C${i}`, MOTABD: "Ke hoach trien khai", MOTABDS: "Ke hoach trien khai" }));
  const broken = row({ MASOBD: "X1", MOTABD: "Ke ho?ch trien khai", MOTABDS: "Ke ho?ch trien khai" });
  const result = scan([...clean, broken]);
  const issue = result.issues.find(item => item.field === "MOTABDS" && item.category === "QUESTION_MARK_IN_WORD");
  assert.ok(issue, "found");
  assert.equal(issue.severity, "critical");
  assert.deepEqual(issue.marks, [{ start: 5, end: 6 }], "the offset of the ? inside the cell");
  assert.equal(issue.status, "open");
  assert.equal(issue.correctedValue, undefined, "nothing is applied");
  assert.deepEqual(issue.suggestions.map(s => [s.value, s.basis, s.support]), [["Ke hoach trien khai", "corpus", 3]]);
  assert.equal(issue.tokens[0].text, "ho?ch");
  assert.equal(issue.proposedValue, undefined, "a guessed letter is never a proposedValue");
});

test("with several fitting words the suggestion is not made for the whole cell: the reviewer chooses per word", () => {
  const corpus = new Corpus();
  for (const value of ["Ke hoach", "Ke hoach", "Ke hoich"]) corpus.add(value);
  const findings = analyzeValue("Ke ho?ch", { role: "freeText" }, { corpus });
  const finding = findings.find(item => item.category === "QUESTION_MARK_IN_WORD");
  assert.equal(finding.suggestions, undefined);
  assert.deepEqual(finding.tokens[0].candidates.map(c => c.text), ["hoach", "hoich"]);
});

test("known characters must match exactly, case included; only the ? is a wildcard", () => {
  const corpus = new Corpus();
  corpus.add("TAI SAN"); corpus.add("Tai san");
  const candidates = pattern => corpus.candidates(pattern).map(c => c.text);
  assert.deepEqual(candidates("T?I"), ["TAI"]);
  assert.deepEqual(candidates("T?i"), ["Tai"]);
  assert.deepEqual(candidates("t?i"), [], "lower-case t is not T");
  assert.deepEqual(candidates("T??"), ["TAI", "Tai"], "two wildcards fit both, ties are ordered by text");
});

test("a real question mark is a low-severity review, not an error", () => {
  const corpus = new Corpus();
  for (let i = 0; i < 4; i++) corpus.add("tai san dam bao");
  const finding = analyzeValue("Co phai tai san?", { role: "freeText" }, { corpus }).find(f => f.category === "QUESTION_MARK_IN_WORD");
  assert.equal(finding.severity, "low");
  assert.equal(analyzeValue("see https://example.com/a?b=1", { role: "freeText" }).length, 0, "URLs are left alone");
  assert.equal(analyzeValue("?", { role: "freeText" })[0].severity, "low");
});

test("a question mark is always an error in a code or a name", () => {
  for (const role of ["code", "name", "list"]) assert.equal(analyzeValue("AB?12", { role })[0].severity, "critical", role);
});

test("replacement characters, control characters and zero-width characters are reported with their code points", () => {
  const fffd = analyzeValue("Ke ho�ch", { role: "freeText" })[0];
  assert.equal(fffd.category, "UNICODE_REPLACEMENT");
  assert.equal(fffd.severity, "critical");
  const contract = analyzeValue("0090\u00071H/10R", { role: "list" })[0];
  assert.equal(contract.category, "INVISIBLE_OR_CONTROL");
  assert.equal(contract.severity, "high");
  assert.equal(contract.marks[0].label, "U+0007");
  assert.equal(contract.fix, undefined, "what a control character replaced cannot be known");
  const zw = analyzeValue("May\u200b moc", { role: "freeText" })[0];
  assert.equal(zw.severity, "medium");
  assert.deepEqual([zw.fix.kind, zw.proposedValue], ["strip-invisible", "May moc"]);
});

test("mojibake is detected and a decode is proposed only when it is exactly reversible", () => {
  assert.equal(tryDecodeMojibake("CÃ´ng ty"), "Công ty");
  assert.equal(tryDecodeMojibake("plain text"), null);
  assert.equal(tryDecodeMojibake("Ã"), null, "a lone lead byte is not valid UTF-8");
  const finding = analyzeValue("CÃ´ng ty", { role: "freeText", noDiacritics: true })[0];
  assert.equal(finding.category, "ENCODING_MOJIBAKE");
  assert.equal(finding.proposedValue, "Công ty");
  assert.equal(analyzeValue("CÃ´ng ty", { role: "freeText", noDiacritics: true }).some(f => f.category === "DIACRITIC_POLICY"), false, "mojibake is not also reported as a diacritic issue");
  const broken = analyzeValue("Ã© and Ã", { role: "freeText" }).find(f => f.category === "ENCODING_MOJIBAKE");
  assert.equal(broken?.proposedValue, undefined);
});

test("valid accented Vietnamese is a policy warning, never a corruption error", () => {
  const finding = analyzeValue("Công ty Đại Việt", { role: "freeText", noDiacritics: true })[0];
  assert.equal(finding.category, "DIACRITIC_POLICY");
  assert.equal(finding.severity, "low");
  assert.equal(finding.proposedValue, "Cong ty Dai Viet");
  assert.equal(finding.fix.lossy, true);
  assert.deepEqual(analyzeValue("Công ty", { role: "freeText", noDiacritics: false }), []);
  assert.deepEqual(analyzeValue("Công ty", { role: "freeText", noDiacritics: true }, { diacriticPolicy: false }), []);
});

test("whitespace fixes are deterministic and edge/odd spaces are found", () => {
  assert.equal(applyFix("trim", "  a b  "), "a b");
  assert.equal(applyFix("collapse-spaces", " a   b "), "a b");
  assert.equal(applyFix("normalize-space-chars", "a\u00a0b "), "a b");
  const name = analyzeValue(" Cty  Mau ", { role: "name" })[0];
  assert.equal(name.category, "WHITESPACE_ANOMALY");
  assert.equal(name.proposedValue, "Cty Mau");
  assert.equal(analyzeValue("May  moc  thiet bi", { role: "freeText" }).length, 0, "repeated spaces inside free text are not an error");
  const tab = analyzeValue("a\tb", { role: "name" })[0];
  assert.equal(tab.fix, undefined, "embedded tabs need a human");
});

test("MOTABD and MOTABDS are compared losslessly and shown side by side", () => {
  const result = scan([row({ MOTABD: "May moc A", MOTABDS: "May moc B" }), row({ MASOBD: "D2", MOTABD: "x", MOTABDS: "" }), row({ MASOBD: "D3" })]);
  const conflicts = result.issues.filter(i => i.category === "DESCRIPTION_CONFLICT");
  assert.deepEqual(conflicts.map(i => [i.row, i.severity, i.related[0].value]), [[2, "high", "May moc A"], [3, "medium", "x"]]);
});

test("dates, amounts, codes and required fields", () => {
  const result = scan([
    row({ NGBDAU: "20201301" }),                                  // month 13
    row({ MASOBD: "D2", GIATRI: "1,000" }),                       // amount as text
    row({ MASOBD: "D3", MAKH: { n: "123" } }),                    // code as number
    row({ MASOBD: "D4", MACNTCTD: "" }),                          // missing required
    row({ MASOBD: "D5", NGDINHGIA: { n: "46000" } }),             // date as number
  ]);
  assert.deepEqual(cats(result, i => i.row === 2), ["NGBDAU:INVALID_CODE_OR_DATE:high"]);
  assert.deepEqual(cats(result, i => i.row === 3), ["GIATRI:TYPE_MISMATCH:high"]);
  assert.deepEqual(cats(result, i => i.row === 4), ["MAKH:TYPE_MISMATCH:medium"]);
  assert.deepEqual(cats(result, i => i.row === 5), ["MACNTCTD:MISSING_REQUIRED:high"]);
  assert.deepEqual(cats(result, i => i.row === 6), ["NGDINHGIA:TYPE_MISMATCH:high"]);
});

test("a text cell that only carries a date format is not a problem; a date stored as a number is", () => {
  const result = scan([row()]);
  assert.deepEqual(result.issues, []);
  const wb = readWorkbook(buildXlsx([{ name: "MAU9_TEST", rows: [HEADERS, row()], styles: { 0: 2, 7: 2 } }]), { fileName: "s.xlsx", fileHash: "h" });
  assert.deepEqual(detectIssues(wb, profileWorkbook(wb, MAU9_PROFILE), MAU9_PROFILE).issues, [], "date style on text cells is harmless");
});

test("names get candidates from the clean names of the same file", () => {
  const rows = [row({ TENKH: "Nguyen Van An" }), row({ MASOBD: "D2", TENKH: "Nguyen Van An" }), row({ MASOBD: "D3", MAKH: "00000124", TENKH: "Nguy?n Van An" })];
  const issue = scan(rows).issues.find(i => i.field === "TENKH" && i.category === "QUESTION_MARK_IN_WORD");
  assert.equal(issue.severity, "critical");
  assert.deepEqual(issue.tokens[0].candidates.map(c => c.text), ["Nguyen"]);
});

test("legitimate values are not flagged: zero, KHONGGAN, leading zeros, slashes, empty optional columns", () => {
  const result = scan([row({ GIATRI: { n: "0" }, GIATRIBDKV: { n: "0" }, MOTABD: "KHONGGAN", MOTABDS: "KHONGGAN", DSSOHD: "00901H6568/10R", NGDINHGIA: null, HOTENCSH: null })]);
  assert.deepEqual(result.issues, []);
});

test("conflicting values for one asset, branch or customer are reported once, with the rows involved", () => {
  const result = scan([row({ GIATRI: { n: "1" } }), row({ GIATRI: { n: "2" }, DSSOHD: "0002/10R" }), row({ MASOBD: "D2", TENCNTCTD: "CN KHAC", TENKH: "Cty Khac" })]);
  const issues = result.issues.filter(i => i.category === "CONFLICTING_DUPLICATE");
  assert.deepEqual(issues.map(i => [i.field, i.row, i.related.map(r => r.row).join(",")]).sort(), [["GIATRI", 2, "2,3"], ["TENCNTCTD", 2, "2,4"], ["TENKH", 2, "2,4"]]);
});

test("a list value with separators inside is ambiguous and is not split", () => {
  const result = scan([row({ DSSOHD: "0001/10R, 0002/10R" })]);
  assert.deepEqual(cats(result), ["DSSOHD:ARRAY_PARSE_AMBIGUOUS:medium"]);
});

test("unknown and duplicate headers are reported at the header cell", () => {
  const wb = readWorkbook(buildXlsx([{ name: "S", rows: [[...HEADERS, "EXTRA", "MAKH"], row().concat(["x", "y"])] }]), { fileName: "s.xlsx", fileHash: "h" });
  const profile = profileWorkbook(wb, MAU9_PROFILE);
  const result = detectIssues(wb, profile, MAU9_PROFILE);
  assert.ok(result.issues.some(i => i.category === "UNKNOWN_COLUMN" && i.field === "EXTRA" && i.row === 1));
  assert.equal(result.issues.filter(i => i.category === "DUPLICATE_HEADER").length, 2);
  assert.ok(result.blockers.some(text => /MAKH/.test(text)), "an ambiguous required column blocks, nothing is chosen blindly");
});

test("a sheet that matches no profile yields a blocker, not a guess", () => {
  const wb = readWorkbook(buildXlsx([{ name: "S", rows: [["a", "b", "c"], ["1", "2", "3"]] }]), { fileName: "s.xlsx", fileHash: "h" });
  const profile = profileWorkbook(wb, MAU9_PROFILE);
  assert.equal(profile.primary, null);
  assert.equal(detectIssues(wb, profile, MAU9_PROFILE).blockers.length, 1);
});

test("issue ids are stable between runs and carry provenance, hashes and the rule version", () => {
  const rows = [row({ MOTABD: "ho?ch", MOTABDS: "ho?ch" })];
  const a = scan(rows), b = scan(rows);
  assert.deepEqual(a.issues.map(i => i.id), b.issues.map(i => i.id));
  const issue = a.issues[0];
  assert.equal(issue.fileHash, "sha256:test");
  assert.equal(issue.sheet, "MAU9_TEST");
  assert.equal(issue.ruleVersion, "rules-2026.11.5");
  assert.match(issue.originalValueFingerprint, /^[0-9a-f]{14}$/);
  assert.notEqual(issue.originalValueFingerprint, issue.originalValue);
  assert.equal(new Set(a.issues.map(i => i.id)).size, a.issues.length);
});

test("hidden rows are scanned and counted; blank rows are skipped and counted", () => {
  const wb = readWorkbook(buildXlsx([{ name: "MAU9_TEST", hiddenRows: [2], rows: [HEADERS, row({ MOTABD: "a?b", MOTABDS: "a?b" }), [], row({ MASOBD: "D2" })] }]), { fileName: "s.xlsx", fileHash: "h" });
  const profile = profileWorkbook(wb, MAU9_PROFILE);
  const result = detectIssues(wb, profile, MAU9_PROFILE);
  assert.equal(result.stats.rowsHidden, 1);
  assert.equal(result.stats.rowsEmptySkipped, 1);
  assert.ok(result.issues.some(i => i.row === 2), "a hidden row's error is still found");
});
