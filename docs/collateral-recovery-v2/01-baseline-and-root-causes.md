# 01 · Baseline and root causes

All numbers below were produced in this repository on 2026-11-04 unless marked **not reproduced**.

## Reproduced baseline

| Claim given | Result here |
|---|---|
| `node --experimental-strip-types --test "src/components/sites/collateral/**/*.test.mjs"` → 202 pass, 0 fail, 1 skipped | **Reproduced**: 203 tests, 202 pass, 0 fail, 1 skipped |
| `npm run typecheck` clean | **Reproduced** |
| Independent Python verification skipped | **Reproduced, cause found**: the tests probed `python`; macOS has only `python3`. The verifier vanished silently and the tests passed on `if (!after) return;`. Fixed (probe `python3` then `python`, fail loudly unless `ALLOW_NO_PYTHON=1`). After the fix 0 skipped. |
| `contextual_auto` ≈ 76% on 165 words | **Reproduced** from `public/data/vn-geo/evaluation.json` (165 words, 76.4%), and it is worse in production, see below |
| Address holdout: word 97.8%, whole address 85.3%, `forced_guess` 52.5% | Reproduced from the same file; SYNTHETIC corruption, not real addresses |
| 10,764 repaired / 5,479 unrepaired cells on MAU9 | **Not reproduced**: no MAU9 workbook exists in the repository |
| ~11 MB workbook ≈ 61 s | **Not reproduced** (no such file). Synthetic 7.1 MB / 220,000 rows: 36 s, see 07 |

## Pipeline as found

```
Import → readWorkbook (xlsx-reader) → profile/mapping (profile.ts, mapping-profiles.ts; MAU9 header detection) → sheet-scan / detect (+ generic-detect for unmapped cells)
→ autoRepair (auto-repair.ts): EvidenceBuilder (same-asset clean records, clean text of the file) → generateCandidates → rankCandidates → decideRepair
     ├─ source_verified            (clean record of the same asset)
     ├─ model_auto_accepted        (VietnameseModel trained on the file's own clean text, calibrated on a hold-out of that text)
     └─ geo recovery               (recoverAddressText: ONLY address-class segments, needs the vn-geo dataset)
→ applyEdits → patchWorkbookBytes (xlsx-patcher, fflate, cell by cell) → verifyRoundTrip / verifyPackageIntegrity / verifyPatches (the app's own reader) → download
```
Worker: `engine/collateral.worker.ts` (only production caller of `autoRepair`). MAU9 JSON mapping (`json-formation/*`) is separate and untouched.

## Why non-address `?` stayed (reproduced on 12 collateral phrases, no clean copy in the file, FORCE mode, geo loaded)

| Stage | Finding |
|---|---|
| Detection | fine: every cell was flagged |
| Domain classification | **absent**. The only classifier was `address-classifier.ts`; text that is not an address got no domain |
| Evidence retrieval | the file model learns only from the file's own clean text; with none of these phrases in the file there is nothing to retrieve |
| Candidates | none → `CALIBRATION_UNAVAILABLE` / `NO_CANDIDATE` |
| Address engine on collateral text | **harmful**: common syllables look like place names, so it rewrote real words: `gắn→gon`, `hình→hanh`, `tải→thi`, `Giấy→Gay`, `từ→to`. 6 of 12 phrases kept `?`, 5 were written wrong, 1 right |
| Patch / shared strings | not a cause (patching is per cell and verified) |

Before the work the matrix regression test (`collateral/collateral-e2e.test.mjs`) failed with 11 of 12 phrases wrong.

## `contextual_auto` audit (Phase 1)

Two independent defects:

1. **Calibration measured the wrong population.** `scripts/geo/evaluate-geo.mjs` chose `contextMargin` as the smallest margin where *all gazetteer-backed words with margin ≥ t* (a superset dominated by `verified_official` and high-margin words) reached 95%. The status `contextual_auto` is the *residual* population, which that number says nothing about.
2. **Shipped threshold was lower than the measured one.** The measurement ran with `UNCALIBRATED` (high 6, context 3); `calibration.json` shipped `contextMargin: 0`, so in SAFE mode *every* name-backed word below the high margin was accepted.

Re-measured on the same 2,000 held-out addresses / 17,094 words, scoring each status exactly as the engine assigns it:

| configuration | `contextual_auto` words | its precision | SAFE accepted | SAFE precision |
|---|---|---|---|---|
| shipped before (high 6, context 0, contextual on) | 325 | **62.5%** | 99.6% of words | **97.96%** |
| now (high 12, context 2, contextual **off**) | 0 applied | n/a (no margin reaches 99% for that population) | 94.4% | **99.07%** |

`high_confidence_auto` was also over-claimed (98.0% own-population vs the 99.2% advertised); it is now calibrated on its own population (99.29%, 2,664 words). `GeoCalibration.contextualAuto` (default off) gates the status; a non-calibrated contextual word is labelled `forced_guess` and SAFE leaves it as `?`. Tests: `geo/contextual-auto-safety.test.mjs`.

## Per-stage and per-domain counters

The previous report had global totals only. `report.collateral` now carries, per worksheet and per domain: cells recovered, words by status (`safe / forced / lossy / needsReview / blockedAnchors`), remaining `?`, and the before/after placeholder count of the cells it touched.
