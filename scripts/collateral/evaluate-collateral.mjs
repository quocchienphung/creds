// Synthetic benchmark and calibration of the collateral recovery. Run:
//   node --experimental-strip-types scripts/collateral/evaluate-collateral.mjs [--write] [--n 600] [--seeds 3]
// EVERYTHING HERE IS SYNTHETIC: text generated from the ontology, damaged by simulated operators. It says nothing about real files.
//
// Leakage control: concepts are split train / validation / test by hash, template families by their own split. Thresholds are calibrated on VALIDATION
// records against a lexicon that holds TRAIN concepts only. The TEST split is scored once, per condition:
//   held_out_concepts: the lexicon holds train+validation concepts; the core phrase of every test record is NOT in the index (the honest condition)
//   in_lexicon:        the lexicon holds every concept (what production has); upper bound, because the phrase being repaired can be looked up
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const engine = join(root, "src/components/sites/collateral/excel-formation/engine");
const load = path => import(join(engine, path));
const { loadConcepts } = await load("collateral/ontology.ts");
const { Lexicon } = await load("collateral/lexicon.ts");
const { recoverCollateralText, NON_ASSERTIVE } = await load("collateral/recover.ts");
const { completeRemaining } = await load("collateral/complete.ts");
const { generate, trainingCorpus, splitOfConcept, LAB_VERSION } = await load("collateral/synth.ts");
const { VietnameseModel, applyTargets } = await load("predict.ts");
const { calibrate, planModelRepair } = await load("model-repair.ts");
const { recoverAddressText } = await load("geo/address-recovery.ts");
const { knowledge } = await load("geo/geo-fixture.mjs");
const { toAscii } = await load("geo/vn-text.ts");

const arg = (name, fallback) => { const at = process.argv.indexOf(name); return at < 0 ? fallback : Number(process.argv[at + 1]); };
const N = arg("--n", 600), SEEDS = arg("--seeds", 3), WRITE = process.argv.includes("--write");
const all = loadConcepts();
const by = split => all.filter(c => splitOfConcept(c) === split);
const conceptCount = { train: by("train").length, validation: by("validation").length, test: by("test").length };
const lexTrain = new Lexicon(by("train")), lexTrainVal = new Lexicon([...by("train"), ...by("validation")]), lexAll = new Lexicon(all);
const synth = trainingCorpus(3000, 7, all); // train-split templates x train-split concepts only
const lexSynthTrainVal = new Lexicon([...by("train"), ...by("validation"), ...synth]), lexSynthTrain = new Lexicon([...by("train"), ...synth]);
const protectedAscii = new Set([...lexAll.protectedSyllables].map(toAscii));

// ---- a file-trained baseline: the existing VietnameseModel on the clean ASCII text of a (large) clean file of the train split
const cleanFile = generateTrainClean(4000);
function generateTrainClean(count) { return generate({ split: "train", count, seed: 99 }).map(r => r.asciiTruth); }
const fileModel = new VietnameseModel(); for (const t of cleanFile) fileModel.add(t); fileModel.finish();
const fileCalibration = calibrate(cleanFile, 0.4);

const wordsOf = text => text.split(" ");
function score(records, run) {
  let cells = 0, exact = 0, damagedWords = 0, right = 0, applied = 0, appliedRight = 0, qIn = 0, qOut = 0, anchorLoss = 0, flips = 0, cellsWithQ = 0, ms = 0;
  const tokens = [];
  for (const r of records) {
    const t0 = performance.now(); const out = run(r); ms += performance.now() - t0;
    const value = out.value, truth = wordsOf(r.asciiTruth), input = wordsOf(r.corruptedInput), got = value.split(" ");
    cells++; if (value === r.asciiTruth) exact++;
    qIn += (r.corruptedInput.match(/\?/g) ?? []).length; const q = (value.match(/\?/g) ?? []).length; qOut += q; if (q) cellsWithQ++;
    for (const a of r.protectedAnchors) if (!value.includes(a)) { anchorLoss++; break; }
    const aligned = got.length === truth.length;
    for (const w of r.damagedWords) {
      damagedWords++;
      const ok = aligned && got[w] === truth[w]; if (ok) right++;
      const changed = aligned ? got[w] !== input[w] && !got[w].includes("?") : true;
      if (changed) { applied++; if (ok) appliedRight++; }
      if (protectedAscii.has(truth[w].toLowerCase()) && !ok && aligned && protectedAscii.has(got[w].toLowerCase())) flips++;
    }
    if (out.tokens) for (const tk of out.tokens) {
      const w = r.corruptedInput.slice(0, tk.start).split(" ").length - 1, iw = input[w] ?? "", tw = truth[w] ?? "";
      const from = tk.start - (r.corruptedInput.slice(0, tk.start).lastIndexOf(" ") + 1), suffix = iw.length - (from + (tk.end - tk.start));
      const core = tw.slice(from, tw.length - Math.max(0, suffix));
      tokens.push({ tier: tk.tier, margin: Math.min(tk.margin, 99), phrase: tk.phraseSize, status: tk.status, domain: tk.domain, right: tk.ascii === core, applied: tk.applied, difficulty: r.difficulty });
    }
  }
  const f = x => +x.toFixed(4);
  return { cells, damagedWords, wordAccuracy: f(right / damagedWords), exactCell: f(exact / cells), applied, appliedPrecision: f(appliedRight / Math.max(1, applied)), coverage: f(applied / damagedWords), questionMarksIn: qIn, questionMarksOut: qOut, questionMarkCompletion: f(1 - qOut / qIn), cellsWithQuestionMarkLeft: cellsWithQ, cellsWithAnchorLoss: anchorLoss, protectedSlotFlips: flips, msPerCell: f(ms / cells), tokens };
}

const strip = s => { const { tokens, ...rest } = s; return rest; };
const policies = ["SAFE_AUTO", "FORCE_NO_QUESTION_MARK"];

// ---- real-file mode: node ... evaluate-collateral.mjs --real data/collateral-real/reviewed.json
// The file is a LOCAL, human-reviewed list [{ "input": "damaged text", "expected": "text without marks" }] (never committed: .gitignore). Every expected value
// must come from an authoritative record or a domain expert; an inferred guess is not ground truth. Prints the same metrics, by status, for the production engine.
const realAt = process.argv.indexOf("--real");
if (realAt > 0) {
  const { readFileSync } = await import("node:fs");
  const items = JSON.parse(readFileSync(process.argv[realAt + 1], "utf8"));
  const records = items.map(item => { const truth = item.expected.split(" "), input = item.input.split(" "); return { corruptedInput: item.input, asciiTruth: item.expected, damagedWords: input.flatMap((w, i) => w.includes("?") ? [i] : []), protectedAnchors: truth.filter(w => /\d/.test(w)), difficulty: "real" }; }).filter(r => r.corruptedInput.split(" ").length === r.asciiTruth.split(" ").length);
  const { collateralLexicon, collateralCalibration } = await load("collateral/index.ts");
  const lex = collateralLexicon(), calib = collateralCalibration(), out = {};
  for (const policy of ["SAFE_AUTO", "FORCE_NO_QUESTION_MARK"]) out[policy] = strip(score(records, r => { const x = recoverCollateralText(r.corruptedInput, lex, { policy, calibration: calib }); return { value: policy === "FORCE_NO_QUESTION_MARK" ? completeRemaining(x.value).value : x.value, tokens: x.tokens }; }));
  console.log(JSON.stringify({ REAL: true, reviewedItems: records.length, skippedMisaligned: items.length - records.length, results: out }, null, 2)); process.exit(0);
}
// ---- calibration on VALIDATION (lexicon: train concepts only)
const val = generate({ split: "validation", count: N, seed: 1001 });
const grid = [0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 14, 16, 20, 24, 32, 99];
const probe = score(val, r => { const x = recoverCollateralText(r.corruptedInput, lexTrain, { policy: "FORCE_NO_QUESTION_MARK" }); return { value: x.value, tokens: x.tokens }; }).tokens.filter(t => t.phrase >= 2);
const TARGET = 0.99, MIN_WORDS = 100;
function threshold(tier) {
  const rows = probe.filter(t => t.tier === tier);
  for (const thr of grid) { const kept = rows.filter(t => t.margin >= thr); if (kept.length >= MIN_WORDS && kept.filter(t => t.right).length / kept.length >= TARGET) return { thr, words: kept.length, precision: kept.filter(t => t.right).length / kept.length }; }
  return { thr: 1e9, words: rows.length, precision: rows.length ? rows.filter(t => t.right).length / rows.length : 0, note: "no margin reaches the target: SAFE_AUTO is off for this tier" };
}
const low = threshold("low"), high = threshold("high");
const highRows = probe.filter(t => t.tier === "high");
const slot = grid.find(thr => { const kept = highRows.filter(t => t.margin >= thr); return kept.length >= 30 && kept.filter(t => t.right).length / kept.length >= 0.95; });
const calibration = { version: `collateral-calibration-${LAB_VERSION}`, minMargin: { low: low.thr, high: high.thr }, forceSlotMargin: slot ?? 99, heldOutWords: probe.length, precision: { low: +low.precision.toFixed(4), high: +high.precision.toFixed(4) }, method: `SYNTHETIC validation split (${val.length} records, ${probe.length} damaged words in ontology phrases), lexicon of train concepts only; smallest margin per impact tier with precision >= ${TARGET} (n >= ${MIN_WORDS}); forceSlotMargin: smallest margin at which high-impact words are right >= 95% (below it FORCE writes KHONG XAC DINH)`, synthetic: true };

// ---- the systems
const systems = lex => ({
  existing_predict_baseline: policy => r => policy === "SAFE_AUTO"
    ? { value: planModelRepair(fileModel, r.corruptedInput, fileCalibration)?.value ?? r.corruptedInput }
    : { value: applyTargets(r.corruptedInput, fileModel.predict(r.corruptedInput)).replace(/\?/g, "") },
  address_only_geo: policy => r => ({ value: recoverAddressText(r.corruptedInput, knowledge(), { policy, calibration: policy === "SAFE_AUTO" ? { highMargin: 12, contextMargin: 2, heldOut: 0, precisionAtHigh: 0, precisionAtContext: 0, method: "shipped", contextualAuto: false } : undefined }).value }),
  domain_retrieval_only: policy => r => { const x = recoverCollateralText(r.corruptedInput, lex.plain, { policy, calibration, weights: { unigram: 0.01, bigram: 0 } }); const done = policy === "FORCE_NO_QUESTION_MARK" ? completeRemaining(x.value, fileModel).value : x.value; return { value: done, tokens: x.tokens }; },
  domain_decoder: policy => r => { const x = recoverCollateralText(r.corruptedInput, lex.plain, { policy, calibration }); const done = policy === "FORCE_NO_QUESTION_MARK" ? completeRemaining(x.value, fileModel).value : x.value; return { value: done, tokens: x.tokens }; },
  domain_decoder_plus_synthetic_corpus: policy => r => { const x = recoverCollateralText(r.corruptedInput, lex.synthetic, { policy, calibration }); const done = policy === "FORCE_NO_QUESTION_MARK" ? completeRemaining(x.value, fileModel).value : x.value; return { value: done, tokens: x.tokens }; },
});

const conditions = {
  held_out_concepts: { plain: lexTrainVal, synthetic: lexSynthTrainVal },
  in_lexicon: { plain: lexAll, synthetic: new Lexicon([...all, ...synth]) },
};
const results = {};
for (const [name, lex] of Object.entries(conditions)) {
  results[name] = {};
  for (let seed = 0; seed < SEEDS; seed++) {
    const test = generate({ split: "test", count: N, seed: 2001 + seed });
    for (const [system, make] of Object.entries(systems(lex))) for (const policy of policies) {
      const s = score(test, make(policy)), key = `${system}|${policy}`;
      (results[name][key] ??= []).push(s);
    }
  }
}
const mean = list => Object.fromEntries(Object.keys(strip(list[0])).map(k => [k, typeof list[0][k] === "number" ? +(list.reduce((n, s) => n + s[k], 0) / list.length).toFixed(4) : list[0][k]]));
const range = (list, k) => [Math.min(...list.map(s => s[k])), Math.max(...list.map(s => s[k]))];
const summary = {};
for (const [cond, systemsOut] of Object.entries(results)) {
  summary[cond] = {};
  for (const [key, list] of Object.entries(systemsOut)) summary[cond][key] = { ...mean(list.map(strip)), wordAccuracyRange: range(list, "wordAccuracy"), seeds: list.length };
}
// per tier / per domain / per status for the full decoder, held-out condition, FORCE and SAFE (seed 0)
const detail = {};
for (const policy of policies) {
  const toks = results.held_out_concepts[`domain_decoder|${policy}`].flatMap(s => s.tokens);
  const group = (key) => Object.fromEntries([...new Set(toks.map(t => t[key]))].sort().map(v => { const k = toks.filter(t => t[key] === v); return [String(v), { words: k.length, precision: +(k.filter(t => t.right).length / k.length).toFixed(4) }]; }));
  detail[policy] = { byTier: group("tier"), byDomain: group("domain"), byStatus: group("status"), byDifficulty: group("difficulty") };
}
const report = { labVersion: LAB_VERSION, SYNTHETIC: true, warning: "SYNTHETIC benchmark: text generated from the ontology and damaged by simulated operators. REAL-WORLD ACCURACY NOT VERIFIED.", conceptCount, recordsPerSeed: N, seeds: SEEDS, calibration, calibrationPopulations: { low, high }, conditions: summary, detail };
console.log(JSON.stringify(report, null, 2));
if (WRITE) {
  mkdirSync(join(root, "docs/collateral-recovery-v2"), { recursive: true });
  writeFileSync(join(root, "docs/collateral-recovery-v2/benchmark-results.json"), JSON.stringify(report, null, 2) + "\n");
  writeFileSync(join(engine, "collateral/calibration.ts"), `// Generated by scripts/collateral/evaluate-collateral.mjs --write. SYNTHETIC calibration: not a statement about real files.\nimport type { CollateralCalibration } from "./recover.ts";\nexport const CALIBRATION: CollateralCalibration = ${JSON.stringify(calibration, null, 2).replace(/1000000000/g, "Infinity")};\n`);
}
