# Zero-patch investigation: why `.repaired.xlsx` changed no cell

Scope: `src/components/sites/collateral/excel-formation/` (engine, `AutoRepairAction.tsx`), worker `src/components/sites/collateral/engine/collateral.worker.ts`.
Input used: `docs/research/MAU9_20260930 ok.xlsx` (11,119,586 bytes, local only; counts below, no cell text).

## 1. Call graph (click to download)

| # | Stage | File : function |
|---|-------|-----------------|
| 1 | `onClick` | `AutoRepairAction.tsx` `run()` -> `engine.autoRepair()` |
| 2 | RPC | `useCollateralEngine.ts` `autoRepair` -> `engine().call({type:"autoRepair"})` |
| 3 | Worker | `collateral.worker.ts:59` `case "autoRepair"` -> `autoRepair(session, history.present, ...)` |
| 4 | Scan + evidence | `auto-repair.ts` `autoRepair` -> `EvidenceBuilder.add` (`evidence-index.ts`) |
| 5 | Detect | `corruption-span.ts` `corruptionSpans`, `detect.ts` `analyzeValue` |
| 6 | Candidates | `candidate-generator.ts:6` `generateCandidates` |
| 7 | Rank | `context-ranker.ts` `rankCandidates` |
| 8 | Decision | `repair-decision.ts:19` `decideRepair` |
| 9 | Patch layer | `auto-repair.ts` `applyEdits(...)` (`review.ts`) -> `patchesOf` (`session.ts`) |
| 10 | Writer | `xlsx-patcher.ts` `patchWorkbookBytes` (per-cell `t="inlineStr"`, ZIP via `fflate`) |
| 11 | Verify | `verifyRoundTrip`, `verifyPackageIntegrity`, new `comparePackageParts` |
| 12 | Download | worker transfers `bytes` -> `AutoRepairAction.tsx` `downloadBlob(made.fileName, made.blob)` |

## 2. Hypotheses and what the instrumentation showed

Per-stage counters (`repair-metrics.ts`, added for this investigation) on the real input, **before** the fix (verified-only policy):

| Stage | Count |
|-------|------:|
| sheets scanned | 2 |
| cells containing `?` (cells) | 11,287 (7,514 + 3,773) |
| flagged by detection (`needs_review` + `blocked`) | 12,756 |
| candidates generated | ~0 (`no_trusted_source` 7,020) |
| `source_verified` (the only status that becomes a patch) | **0** |
| patches committed | 0 |
| cells changed in output | 0 |

| Hypothesis from the brief | Verdict |
|---|---|
| Corruption not detected | **Rejected.** 11,287 `?` cells counted, 12,756 flagged. |
| Severity lowered / threshold removes everything | Partly: there was no score threshold at all, see the root cause. |
| Candidates empty | **Confirmed as a symptom** (7,020 `no_trusted_source`). |
| UI does not apply the suggestion / review not verified | **Rejected.** The job never reaches the review layer with a patch. |
| Accepted decisions not turned into patches | **Rejected.** `approved` was empty, not dropped. |
| Wrong sheet/row/column, shared string `t="s"` not handled | **Rejected.** The writer rewrites exactly the target cell as `inlineStr`; a synthetic E2E (see tests) changes the right cell and leaves another cell of the same shared string alone. |
| Writer writes `original` back / round-trip checks only empty cells / download uses original ZIP | **Rejected.** With patches present the output differs in `sheet*.xml`; `verifyRoundTrip` compares every cell. |
| `Sheet1` skipped | **Confirmed (secondary).** `Sheet1` is a CSV-packed sheet; its 3,855 cells were all `blocked: protected_or_unmapped_role`. |

## 3. Root cause

1. **Acceptance policy admitted exactly one kind of proof** (`repair-decision.ts`, `best.kind === "same_asset_clean_record"` at line 30, `status: "source_verified"`). A cell was patched only if a *clean record of the same branch/customer/asset and the same field* existed. In the real file the damaged description columns (`V` = MOTABD, `AK` = MOTABDS, identical to each other in every row) are damaged **together**, so no same-asset clean twin exists. Result: `applied = 0` for all 3,732 + 3,773 damaged cells.
2. Candidate generation had no other evidence path: the file's own clean text (39,683 clean ASCII description cells, 32,702 distinct) was indexed only into `VietnameseModel` for UI suggestions and never used by the repair job. A second recall defect: the cross-asset phrase lookup is keyed on `original.slice(0, 2)` (`candidate-generator.ts:10`) — a damaged word whose first two characters include `?` never finds a clean phrase. (Cross-asset matches were suggestions only, so this does not change the outcome; it is recorded, not fixed.)
3. **The result was reported as a repair anyway.** `RepairReport.status` was `"partially_repaired"` whenever anything was unresolved, `patchWorkbookBytes` re-compressed the unchanged parts into a new ZIP (new size, new SHA-256), and `AutoRepairAction.tsx` downloaded `<name>.repaired.xlsx` unconditionally. This is why the file looked "repaired" while all 11 uncompressed OOXML parts were byte-identical to the input.

Not a bug in the writer, the shared-string handling, the sheet addressing or the download buffer.

## 4. Fix (phase D), by stage

| Stage | Change |
|---|---|
| Contracts | `repair-metrics.ts`: `RepairMetrics`, `ReasonCode`, `RepairOutcome`, `classifyOutcome`, `metricViolations` (outputCellsChanged <= patchesCommitted <= patchTargetsUnique <= patchProposals, accepted decisions must produce a patch, no zero-change success). A violation throws `RepairValidationError`; nothing is offered. |
| Detection eligibility | unchanged (`corruption-span.ts`). Terminal `?` stays `suspected_punctuation` and is never guessed. |
| Candidate generation | `model-repair.ts` `planModelRepair`: words of letters and `?` only, candidates only from the vowel/d pool (`fallback` flagged by `predict.ts`), digits/accents/punctuation inside a word excluded. |
| Acceptance policy | `repair-decision.ts`: new status `model_auto_accepted` next to `source_verified`. A prediction is accepted only above a **margin calibrated on a hold-out of the file's own clean text** (`calibrate`; target word precision 99.5%; off when the hold-out is < 300 words or the target is never reached). Patch source `auto_model`; `review.ts` keeps its issues `edited`, never `verified`. |
| Patch application | unchanged writer; per-cell `inlineStr`, `sharedStrings.xml` never edited. |
| Serialization / verification | `verifyRoundTrip` now returns measured `cellsChanged`; new `comparePackageParts` (`CONTENT_CHANGED` / `RECOMPRESSED_ONLY` / `BYTE_IDENTICAL`). |
| Zero patches | `autoRepair` returns the untouched input under `<name>.not-repaired.xlsx`, status `NO_REPAIR_APPLIED`, reason histogram in the report. |
| UI | `AutoRepairAction.tsx`: five outcomes, metrics table, reason histogram; downloads start by themselves only for `REPAIRED_*`. |
| Sheet1 | `packed-csv.ts`: header line maps field names to roles, only free-text, non-identifier fields are repaired, quotes/separators preserved. `EvidenceBuilder` trains on mapped columns when only a packed sheet is damaged. |

## 5. Regression tests (red first)

* `zero-patch.test.mjs` — failed before the fix (`AssertionError: at least one safely supported cell is repaired (patches)`), passes after. It reads the output with `ooxml-independent.mjs` (fflate + regex; does not import `xlsx-reader.ts`/`xlsx-patcher.ts`) and requires `CONTENT_CHANGED`, changed cells, no structural difference and exactly one changed cell per committed patch.
* `auto-repair-model.test.mjs` (11 tests): mid-word and word-final `?`; punctuation/evidence-free/names/ids untouched; `NO_REPAIR_APPLIED` with `BYTE_IDENTICAL` and `.not-repaired.xlsx`; shared string used by two cells; leading zeros, exact decimals, formulas, hidden rows, untouched sheet; CSV-packed sheet; never `verified` + undo + progress replay; zero network calls and redacted report; metric contract; determinism and cancellation.
* Browser E2E (`scripts/qa/auto-repair-browser.mjs`, production build, offline): 19/19, including click -> worker -> download -> independent parser for a model repair and the `NO_REPAIR_APPLIED` message without an automatic download.

## 6. Limits stated honestly

* The 99.6% word precision is measured by **masking vowels/d of clean text with the observed damage rate** (one `?` per damaged word, 99.8% in this file) and predicting with a model that never saw the cell. It is not measured against the true original text of the damaged cells, which is lost; it is a calibration, not a guarantee. The 768 genuinely accented cells of this file are too few and too unlike the rest to serve as a second gold set.
* Repairs by the model are **suggestions applied, not verified**: they stay `edited` in Review and the JSON gates still require confirmation.
* Words that appear in no clean text, words next to an unrecoverable word with a thin margin, terminal `?`, names and identifiers stay as they are.
* Not tested with desktop Excel/LibreOffice in this pass (no installed check performed); structure verified by two independent parsers (Node regex oracle, Python `zipfile`).
