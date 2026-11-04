// Builds a SYNTHETIC multi-sheet workbook of damaged collateral descriptions (lab test split, not MAU9), repairs it through the real one-click pipeline in both
// policies, writes before/after files and runs the independent verifier. Run: node --experimental-strip-types scripts/collateral/make-sample.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const engine = join(root, "src/components/sites/collateral/excel-formation/engine");
const load = p => import(join(engine, p));
const { buildXlsx } = await load("xlsx-builder.mjs");
const { openSession } = await load("session.ts");
const { emptyReview } = await load("review.ts");
const { autoRepair } = await load("auto-repair.ts");
const { generate } = await load("collateral/synth.ts");
const { verify } = await import("./verify-output.mjs");
const { spawnSync } = await import("node:child_process");
const out = join(root, "docs/collateral-recovery-v2/sample"); mkdirSync(out, { recursive: true });
const records = generate({ split: "test", count: 90, seed: 777 });
const sheet = (name, list, header) => ({ name, rows: [header, ...list.map((r, i) => [{ n: String(i + 1) }, r.corruptedInput, "ghi chu"])] });
const before = buildXlsx([sheet("Tai san 1", records.slice(0, 30), ["STT", "Mo ta", "Ghi chu"]), sheet("Phu luc", records.slice(30, 60), ["So", "Noi dung", "Ghi chu"]), { name: "Sheet3", rows: records.slice(60).map(r => [r.corruptedInput]) }]);
writeFileSync(join(out, "before.xlsx"), before);
const python = ["python3", "python"].find(n => spawnSync(n, ["--version"]).status === 0);
const dump = file => JSON.parse(spawnSync(python, ["-I", join(engine, "independent-xlsx-dump.py"), file], { encoding: "utf8", maxBuffer: 1 << 28 }).stdout);
const truthRef = i => i < 30 ? `Tai san 1!B${i + 2}` : i < 60 ? `Phu luc!B${i - 30 + 2}` : `Sheet3!A${i - 60 + 1}`;
const evidence = { workbook: "SYNTHETIC: lab test split, 3 sheets (one without a header), cells drawn from templates and concepts of the ontology; production lexicon (every concept)", warning: "SYNTHETIC. REAL-WORLD ACCURACY NOT VERIFIED.", policies: {} };
for (const policy of ["SAFE_AUTO", "FORCE_NO_QUESTION_MARK"]) {
  const t0 = performance.now();
  const result = await autoRepair(await openSession(before, "mau-tai-san.xlsx"), emptyReview(), { policy, collateral: true });
  const file = join(out, policy === "SAFE_AUTO" ? "after-safe.xlsx" : "after-force.xlsx"); writeFileSync(file, result.bytes);
  const after = dump(file), cells = records.map((r, i) => ({ ref: truthRef(i), exact: after[truthRef(i)] === r.asciiTruth, hasQ: (after[truthRef(i)] ?? "").includes("?") }));
  evidence.policies[policy] = {
    seconds: +((performance.now() - t0) / 1000).toFixed(2), status: result.report.status, cells: cells.length, exactCells: cells.filter(c => c.exact).length, cellsWithQuestionMarkLeft: cells.filter(c => c.hasQ).length,
    collateral: result.report.collateral, outputCellsChanged: result.report.metrics.outputCellsChanged, outputUnexpectedChanges: result.report.metrics.outputUnexpectedChanges,
    independentVerification: verify(join(out, "before.xlsx"), file),
  };
  if (policy === "FORCE_NO_QUESTION_MARK") writeFileSync(join(out, "collateral-audit.json"), JSON.stringify(result.collateralAudit.slice(0, 40), null, 2) + "\n");
}
writeFileSync(join(out, "evidence.json"), JSON.stringify(evidence, null, 2) + "\n");
console.log(JSON.stringify(Object.fromEntries(Object.entries(evidence.policies).map(([k, v]) => [k, { ...v, collateral: v.collateral && { cellsRecovered: v.collateral.cellsRecovered, words: v.collateral.words, finalStatus: v.collateral.finalStatus, qm: v.collateral.questionMarkCompletion } }])), null, 2));
