# 05 · Repair policies and audit

## Switches
* `autoRepair(session, state, { policy, geo, collateral })`. `collateral: true` turns on the ontology stage and the FORCE completion sweep. It is **off by default like `geo`**, so the evidence-only contract tests still protect the old layer; the worker (`collateral.worker.ts`) passes `collateral: true`.
* UI (`AutoRepairAction.tsx`): the policy card text now covers collateral text, not just addresses; the result panel shows the collateral block; two downloads: counts-only report and the collateral audit (values included, local).

## SAFE_AUTO
Applies source-verified repairs, the file model's calibrated repairs, geo words that are `verified_official` / `high_confidence_auto` (**`contextual_auto` is off**, see 01), and collateral words that pass the synthetic-calibrated margin of their impact tier. Everything else keeps its `?`. No `forced_guess`, no `fallback_lossy` is ever written (test: `SAFE_AUTO through the pipeline writes no guess`).

## FORCE_NO_QUESTION_MARK
Completes every damaged word in scope and records which were guesses. It never invents a legal fact: high-impact words below the margin become `KHONG XAC DINH`. Proper-name cells and `?` inside codes are left (so "no `?` left" is **not** guaranteed; the report says how many remain). Original values are only in the local audit; the workbook cell gets no annotation.

## Statuses
`safe_auto_domain_calibrated`, `forced_guess`, `fallback_lossy`, `needs_review`, `blocked_protected_anchor`, `legitimate_question_mark` (a `?` that is punctuation is simply not a token). `verified_exact_source` is the existing `source_verified` decision; `error_unscanned` is the existing per-sheet `status: "failed"`.

## Two metrics, never merged
* `report.collateral.questionMarkCompletion` = placeholders removed in the cells this stage touched (**completion**, not correctness).
* Reconstruction accuracy exists only on labelled data: synthetic (06) or a reviewed real set via `evaluate-collateral.mjs --real` (none supplied: **REAL-WORLD ACCURACY NOT VERIFIED**).

## Report (counts only, tested to contain no cell text) and audit
`report.collateral`: policy, lexicon version, calibration (`synthetic: true`, margins), `cellsRecovered`, `words{safe,forced,lossy,needsReview,blockedAnchors}`, `byDomain`, `bySheet[{cellsRecovered, words, byDomain, remainingQuestionMarks}]`, `questionMarkCompletion`, `finalStatus` (`COLLATERAL_COMPLETED` is never reported while a guess, a loss, an anchor or a placeholder remains), `note`.
Audit entry per cell: sheet, ref, original, repaired, domains, and per word: original, accented reading, ASCII, status, applied, impact tier, domain, margin, runner-up, evidence.
