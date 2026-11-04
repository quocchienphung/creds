# 08 · Handoff and known limits

## Commands and results (2026-11-04, this machine)
| command | result |
|---|---|
| `node --experimental-strip-types --test "src/components/sites/collateral/**/*.test.mjs"` | **223 pass, 0 fail, 0 skipped** (was 202 / 0 / 1) |
| `npm run typecheck` | clean |
| `npm run lint` | clean |
| `npm run build` | succeeds |
| `node --experimental-strip-types scripts/geo/evaluate-geo.mjs --n 2000 --write` | recalibrated geo trust levels (01) |
| `node --experimental-strip-types scripts/collateral/evaluate-collateral.mjs --n 600 --seeds 3 --write` | 06; writes `collateral/calibration.ts` |
| `node --experimental-strip-types scripts/collateral/make-sample.mjs` | `sample/{before,after-safe,after-force}.xlsx`, `evidence.json`, independent verification |
| `node scripts/collateral/verify-output.mjs before.xlsx after.xlsx` | independent package check, exit 0/1/2 |
| `node --experimental-strip-types --max-old-space-size=6144 scripts/collateral/perf.mjs --rows 220000` | 07 |
| `scripts/collateral/profile-corruption.mjs`, `evaluate-collateral.mjs --real reviewed.json` | for local real files (`data/collateral-real/`, git-ignored) |

On the 90-cell synthetic sample: FORCE leaves no `?` (405 → 0 placeholders; 24/90 cells exactly equal to the truth, 319 words safe, 57 forced guesses, 1 lossy); SAFE completes 85% of placeholders (401 → 61), 17/90 cells exact, 0 guesses.

## Changed / added
Changed: `geo/address-recovery.ts` (`contextualAuto`, exported `caseOfDamaged`), `scripts/geo/*`, `public/data/vn-geo/{calibration,evaluation}.json`, `auto-repair.ts`, `repair-decision.ts`, worker, protocol, hook, `AutoRepairAction.tsx`, legacy tests (python probe). Added: `engine/collateral/*`, `independent-ooxml-check.py`, `scripts/collateral/*`, tests, these docs. Untouched: MAU9 JSON mapping, XLSX reader/patcher.

## NOT verified / not done
* **Real-world accuracy: not verified.** No real or reviewed workbook was provided; every accuracy figure above is synthetic and optimistic by construction (the ontology and the templates were written by the same author as the engine).
* The MAU9 numbers (10,764 / 5,479) and the 11 MB / 61 s run: not reproduced.
* Legal citations in the ontology: unverified, not fetched. No licensed corpus; no feedback store; no neural reranker; no mojibake / U+FFFD recovery for collateral text.
* No browser smoke test of the UI was run (build and typecheck only); no Excel desktop / LibreOffice check; worker memory in a browser not measured (Node RSS only).
* Pre-existing limits kept: 250,000-record evidence budget aborts large files.

## Known risks
* FORCE writes guesses: on this synthetic data 17% of FORCE words are wrong; any such cell is `forced_guess` in the audit and must not be treated as verified. The UI status can still read "REPAIRED_VERIFIED" (an existing label); the collateral block and audit carry the real status.
* Proper-name cells are not completed, so `?` can remain even in FORCE; a `?` beside a short fragment at the end of a cell may be read as punctuation.
* Protected syllables are per syllable (over-protective for `đồng`), and `KHONG XAC DINH` can appear inside a sentence.
* SAFE's collateral margins were calibrated on synthetic data and transferred at 98.8%, not 99%, on the frozen test; recalibrate on a reviewed real set before trusting SAFE on customer data.
* Do not commit real workbooks or reviewed sets; `data/collateral-real/` and `*.reviewed.json` are ignored.
