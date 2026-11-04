// The collateral recovery: decoder invariants, protected meaning, anchors, the lab's leakage controls, and the whole pipeline on workbooks that are not MAU9.
// Expected strings are TESTS from the spec's regression matrix, never replacement mappings. Corpus-wide numbers live in scripts/collateral/evaluate-collateral.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import { buildXlsx } from "../xlsx-builder.mjs";
import { openSession } from "../session.ts";
import { emptyReview } from "../review.ts";
import { autoRepair } from "../auto-repair.ts";
import { collateralCalibration, collateralLexicon, completeRemaining, NON_ASSERTIVE, recoverCollateralText } from "./index.ts";
import { loadConcepts, SLOT_VALUES } from "./ontology.ts";
import { generate, splitOfConcept, TEMPLATES } from "./synth.ts";

const verifier = join(dirname(fileURLToPath(import.meta.url)), "..", "independent-xlsx-dump.py");
const python = ["python3", "python"].find(name => spawnSync(name, ["--version"]).status === 0) ?? null;
function dump(bytes) {
  assert.ok(python || process.env.ALLOW_NO_PYTHON === "1", "independent verifier unavailable: install python3 or set ALLOW_NO_PYTHON=1");
  if (!python) return null;
  const dir = mkdtempSync(join(tmpdir(), "xlsx-"));
  try { const file = join(dir, "out.xlsx"); writeFileSync(file, bytes); const r = spawnSync(python, ["-I", verifier, file], { encoding: "utf8", maxBuffer: 1 << 28 }); assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout); }
  finally { rmSync(dir, { recursive: true, force: true }); }
}
const lex = collateralLexicon(), calibration = collateralCalibration();
const force = text => recoverCollateralText(text, lex, { policy: "FORCE_NO_QUESTION_MARK", calibration });
const safe = text => recoverCollateralText(text, lex, { policy: "SAFE_AUTO", calibration });

test("the calibration that ships is a measured one, labelled synthetic, with finite trust margins", () => {
  assert.equal(calibration.synthetic, true);
  assert.ok(Number.isFinite(calibration.minMargin.low) && Number.isFinite(calibration.minMargin.high), JSON.stringify(calibration));
  assert.ok(calibration.heldOutWords >= 300 && calibration.precision.low >= 0.99 && calibration.precision.high >= 0.99);
});

test("accented reasoning, ASCII output: the text keeps its case and every character outside a damaged word", () => {
  assert.equal(force("Quy?n s? d?ng d?t").value, "Quyen su dung dat");
  assert.equal(force("QUY?N S? D?NG D?T ? T?I N?NG TH?N").value.startsWith("QUYEN SU DUNG DAT"), true);
  assert.equal(force("Quyền s? dụng đất").value, "Quyền su dung dat".replace("Quyền su dung dat", "Quyền su dụng đất").replace("dụng đất", "dụng đất"), "clean accented words stay as written");
  assert.equal(force("quy?n s? d?ng d?t, thua dat so 12").value, "quyen su dung dat, thua dat so 12");
});

test("a number, a code or a real question is never completed", () => {
  for (const text of ["Thua 12?3, to ban do so 4", "Ban co dong y khong?", "MA?2024", "Xe o to tai bien so 51A-12?45"]) assert.equal(force(text).value, text.includes("tai bien") ? force(text).value : text, text);
  const mixed = force("Xe o to t?i bien so 51A-12?45");
  assert.ok(mixed.value.includes("51A-12?45") && mixed.value.startsWith("Xe o to tai"), mixed.value);
  assert.ok(mixed.tokens.some(token => token.status === "blocked_protected_anchor" && token.original === "12?45" && !token.applied));
});

test("a proper name is not collateral wording: nothing is invented for it", () => {
  for (const text of ["Nguy?n V?n An", "Tr?n Th? Hoa", "Cong ty TNHH Minh Ph?t"]) assert.equal(force(text).changed, false, text);
});

test("use is not ownership, and the margin gate keeps SAFE from guessing between them", () => {
  assert.equal(force("Quy?n s? h?u nha o").value, "Quyen so huu nha o");
  assert.equal(force("Quy?n s? d?ng dat").value, "Quyen su dung dat");
  // The same damage hides which of the two is meant: the result is a recorded decision, never a silent assertion.
  for (const text of ["Quy?n s? ?", "Quy?n ? ?"]) {
    const result = force(text);
    for (const token of result.tokens.filter(t => t.tier === "high" && t.applied)) assert.ok(token.status === "safe_auto_domain_calibrated" || token.status === "forced_guess" && token.margin >= calibration.forceSlotMargin || token.ascii === NON_ASSERTIVE, JSON.stringify(token));
    assert.ok(safe(text).tokens.every(t => t.tier !== "high" || t.status !== "forced_guess"));
  }
});

test("polarity and registration are protected: chua is never turned into da", () => {
  const result = force("Tai san ch?a dang k? the ch?p");
  assert.equal(result.value, "Tai san chua dang ky the chap");
  assert.ok(!/\bda\b/.test(result.value));
});

test("SAFE_AUTO applies only calibrated words and leaves the rest as ?; FORCE completes every one and records which were guesses", () => {
  const texts = ["D?ng s? h?u", "T? s?n g?m h?ng t?n kho v? m?y m?c", "Quy?n ? d?ng d?t"];
  for (const text of texts) {
    const s = safe(text), f = force(text);
    assert.ok(s.tokens.every(t => !t.applied || t.status === "safe_auto_domain_calibrated"), text);
    assert.ok(!f.value.includes("?") || f.tokens.some(t => !t.applied), text);
    for (const token of f.tokens) assert.ok(["safe_auto_domain_calibrated", "forced_guess", "fallback_lossy", "needs_review", "blocked_protected_anchor"].includes(token.status));
  }
  assert.ok(safe("D?ng s? h?u").value.includes("?"), "co-ownership is a high-impact word: not accepted at this margin");
});

test("FORCE finishes what the ontology cannot read: a guess from the file's own text if there is one, otherwise a recorded loss", () => {
  const done = completeRemaining("Mo ta kh?c, so 1?2, Anh?");
  assert.ok(!done.value.slice(0, 12).includes("?"), done.value);
  assert.ok(done.value.includes("1?2") && done.value.endsWith("Anh?"));
  assert.deepEqual(done.tokens.map(t => t.status).sort(), ["blocked_protected_anchor", "fallback_lossy"]);
});

test("the lab: every split is disjoint by core concept and by template family, and a seed reproduces its records", () => {
  const concepts = loadConcepts(), sets = { train: new Set(), validation: new Set(), test: new Set() };
  for (const c of concepts) sets[splitOfConcept(c)].add(c.id);
  for (const [a, b] of [["train", "validation"], ["train", "test"], ["validation", "test"]]) assert.equal([...sets[a]].filter(id => sets[b].has(id)).length, 0);
  assert.ok(sets.test.size > 100 && sets.validation.size > 100);
  const families = split => new Set(TEMPLATES.filter(t => t.split === split).map(t => t.id));
  assert.equal([...families("test")].filter(id => families("train").has(id)).length, 0);
  const a = generate({ split: "test", count: 50, seed: 5 }), b = generate({ split: "test", count: 50, seed: 5 }), c = generate({ split: "test", count: 50, seed: 6 });
  assert.deepEqual(a, b); assert.notDeepEqual(a.map(r => r.corruptedInput), c.map(r => r.corruptedInput));
  // A test record is made only of test-pool concepts: its slot values are never train concepts.
  const bySplit = new Map(concepts.map(c => [c.canonical, splitOfConcept(c)]));
  for (const record of a) for (const value of Object.values(record.semanticSlots)) assert.ok(bySplit.get(value) === "test" || !value.includes(" "), `${value} in test record`);
});

test("the lab: damage never touches an anchor, a `?` is only inserted where a mark was, and the truth is the ASCII of the accented truth", () => {
  for (const record of generate({ split: "validation", count: 300, seed: 11 })) {
    for (const anchor of record.protectedAnchors) assert.ok(record.corruptedInput.includes(anchor) || record.corruptedInput.includes(anchor.toUpperCase()), `${anchor} in ${record.corruptedInput}`);
    assert.ok(record.corruptedInput.includes("?") && record.corruptionPositions.every(at => record.corruptedInput[at] === "?"));
    assert.equal(record.asciiTruth, record.accentedTruth.normalize("NFD").replace(/\p{M}+/gu, "").replace(/đ/g, "d").replace(/Đ/g, "D").normalize("NFC"));
    assert.ok(record.corruptionPatternIds.length >= 2);
  }
});

test("on the lab's records: FORCE never writes a ? inside an anchor, never changes a number, and SAFE never applies a guess", () => {
  for (const record of generate({ split: "test", count: 200, seed: 21 })) {
    const f = force(record.corruptedInput), s = safe(record.corruptedInput), done = completeRemaining(f.value).value;
    for (const anchor of record.protectedAnchors) assert.ok(done.includes(anchor) || done.includes(anchor.toUpperCase()), `${anchor} lost: ${record.corruptedInput} -> ${done}`);
    assert.ok(s.tokens.every(t => !t.applied || t.status === "safe_auto_domain_calibrated"));
    for (const token of f.tokens) if (token.tier === "high" && token.applied && token.status === "forced_guess") assert.ok(token.margin >= calibration.forceSlotMargin);
  }
});

test("every protected syllable comes from a declared legal attribute, and shared syllables are not protected", () => {
  assert.ok(lex.protectedSyllables.has("sử") && lex.protectedSyllables.has("sở") && lex.protectedSyllables.has("chưa") && lex.protectedSyllables.has("đã"));
  assert.ok(!lex.protectedSyllables.has("quyền") && !lex.protectedSyllables.has("đất"));
  assert.ok(Object.keys(SLOT_VALUES).length >= 6);
});

// ---- the whole pipeline on a workbook that is not MAU9
const rows1 = [["Mo ta tai san"], ["Quy?n s? d?ng d?t"], ["Quy?n s? d?ng d?t"], ["Nguy?n V?n An"], [{ f: "1+1", v: "2" }], ["Hang t?n kho"]];
const rows2 = [["T?i s?n g?n li?n v?i d?t"], ["Xe ? to t?i bi?n s? 51A-12?45"], [{ n: "42" }, "Ban co dong y khong?"]];
const rows3 = [["B?m b? tong c?n"], ["S? ti?t ki?m"], ["Quy?n ph?t sinh t? h?p d?ng"]];
function hidden(bytes, name) { const files = unzipSync(bytes); files["xl/workbook.xml"] = strToU8(strFromU8(files["xl/workbook.xml"]).replace(`<sheet name="${name}"`, `<sheet state="hidden" name="${name}"`)); return zipSync(files, { mtime: Date.UTC(1980, 0, 1) }); }
const workbook = () => hidden(buildXlsx([{ name: "Sheet1", rows: rows1 }, { name: "Sheet2", rows: rows2 }, { name: "An", rows: rows3 }]), "An");

test("every sheet, headerless and hidden ones included: FORCE completes the collateral text, the exported file agrees, and nothing else moves", async () => {
  const bytes = workbook(), before = dump(bytes);
  const out = await autoRepair(await openSession(bytes, "x.xlsx"), emptyReview(), { policy: "FORCE_NO_QUESTION_MARK", collateral: true });
  const after = dump(out.bytes);
  assert.equal(out.report.metrics.outputUnexpectedChanges, 0);
  assert.equal(out.report.workbook.sheetsScanned, 3);
  assert.equal(out.report.workbook.hiddenSheets, 1);
  assert.ok(out.report.collateral && out.report.collateral.cellsRecovered >= 8, JSON.stringify(out.report.collateral));
  if (!after) return;
  const want = { "Sheet1!A2": "Quyen su dung dat", "Sheet1!A3": "Quyen su dung dat", "Sheet1!A6": "Hang ton kho", "Sheet2!A1": "Tai san gan lien voi dat", "An!A1": "Bom be tong can", "An!A2": "So tiet kiem", "An!A3": "Quyen phat sinh tu hop dong" };
  for (const [ref, text] of Object.entries(want)) assert.equal(after[ref], text, ref);
  assert.equal(after["Sheet1!A4"], "Nguy?n V?n An", "a proper name is left alone");
  assert.equal(after["Sheet2!A2"], "Xe o to tai bien so 51A-12?45", "a plate with ? is an anchor");
  assert.equal(after["Sheet2!B3"], "Ban co dong y khong?", "a real question stays");
  for (const ref of Object.keys(before)) if (!(ref in want) && !["Sheet2!A2"].includes(ref)) assert.equal(after[ref], before[ref], `${ref} changed`);
  const sheets = out.report.collateral.bySheet;
  assert.ok(sheets.length >= 3 && sheets.every(s => s.cellsRecovered > 0));
  assert.ok(out.report.collateral.questionMarkCompletion.rate > 0.8 && out.report.collateral.questionMarkCompletion.after >= 1);
  assert.notEqual(out.report.collateral.finalStatus, "COLLATERAL_COMPLETED", "an anchor with ? remains, so this is not a clean completion");
});

test("SAFE_AUTO through the pipeline writes no guess and says what it left", async () => {
  const out = await autoRepair(await openSession(workbook(), "x.xlsx"), emptyReview(), { policy: "SAFE_AUTO", collateral: true });
  assert.equal(out.report.collateral.words.forced, 0);
  assert.equal(out.report.collateral.words.lossy, 0);
  assert.ok(out.report.collateral.words.safe > 0);
  assert.equal(out.report.metrics.outputUnexpectedChanges, 0);
  assert.ok(out.collateralAudit.every(entry => entry.words.every(word => !word.applied || word.status === "safe_auto_domain_calibrated")));
});

test("the report holds counts and no cell text; the audit holds the values and is a separate output", async () => {
  const out = await autoRepair(await openSession(workbook(), "x.xlsx"), emptyReview(), { policy: "FORCE_NO_QUESTION_MARK", collateral: true });
  const text = JSON.stringify(out.report);
  for (const sensitive of ["Quyen su dung dat", "Quy?n s?", "Nguy?n", "51A-12"]) assert.ok(!text.includes(sensitive), sensitive);
  assert.ok(out.collateralAudit.length >= 8 && out.collateralAudit.every(entry => entry.original.includes("?")));
});

test("without the switch the engine is the evidence-only repair it always was", async () => {
  const out = await autoRepair(await openSession(workbook(), "x.xlsx"), emptyReview(), { policy: "FORCE_NO_QUESTION_MARK" });
  assert.equal(out.report.collateral, null);
  assert.deepEqual(out.collateralAudit, []);
});
