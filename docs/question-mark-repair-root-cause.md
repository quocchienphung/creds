# Question-mark repair: root cause and fix

Scope: the Excel text-repair engine (`src/components/sites/collateral/excel-formation/engine/`). JSON formation was not changed.
All data below is synthetic (`generic-fixture.mjs`). Nothing was run on real customer files.

## What was wrong (reproduced, not assumed)

Reproduced with two throw-away scripts on synthetic workbooks, then pinned by `generic-repair.test.mjs` (12 of 12 tests failed on the old code).

| # | Where (old code) | What it did | Visible effect |
|---|---|---|---|
| 1 | `auto-repair.ts` start of `autoRepair()` | `if (!session.wprofile.primary \|\| session.scan.blockers.length) throw "Resolve the workbook mapping…"` | A workbook with no MAU9 header could not be repaired at all. The button was also disabled by `AutoRepairAction.tsx` (`!profile.primary \|\| blockers.length`). |
| 2 | `detect.ts` `detectIssues()` | Returned `issues: []` when no sheet matched the profile, and otherwise looked only at the profile's mapped columns of ONE sheet | `OverviewStep.tsx` printed "No issue found. Nothing needs review." for a workbook full of `?`. This is the false green. |
| 3 | `auto-repair.ts` cell loop + `repair-decision.ts` | A cell outside a mapped column got role `unmapped`, and `decideRepair` blocks every role but `freeText` (`protected_or_unmapped_role`) | Obvious `?` on the second sheet was "blocked", never repaired, never reported as scanned. |
| 4 | `evidence-index.ts` | The language model learned only from mapped `freeText` columns of profiled sheets | An unrelated sheet contributed no evidence, and a workbook without a profile had an empty model. |
| 5 | `collateral.worker.ts` `languageOf`, `edit`, `row`, `predict` | All used `wprofile.primary` | Manual review and predictions could not address another sheet. |
| 6 | `predict.ts` / `model-repair.ts` | The model folded every mark away and only accepted `[A-Za-z?]` words, so it could not restore `tiết`, and calibration never saw marked words | In a file written with marks the repair either did nothing or produced unmarked text. |

First broken link in the chain `upload → read → enumerate sheets → profile → detect → predict → accept → patch → export → UI`: **profile → detect (2)**.
Everything before it (reader) and after it (patcher, round-trip check) was already correct: `xlsx-reader.ts` reads every worksheet from the relationship graph, and `xlsx-patcher.ts` writes each approved cell as its own inline string (the shared string table is never edited) and re-reads the result. The earlier "repaired" file with no cell change came from the gate in (1) and the `blocked` decisions in (3), not from the patcher.

## The fix (smallest set that makes the scan profile-free)

| File | Change |
|---|---|
| `sheet-scan.ts` (new) | `scanSheet`/`scanWorkbook`: per-sheet counters (rows, hidden rows/columns, text cells, `?` cells split confirmed/possible, formula/rich-text cells, `?` that cannot be repaired) and a status `clean` / `issues` / `error`. `textRoleOf` judges a single value: identifier, proper name or free text. |
| `generic-detect.ts` (new) | Issues for every cell the profile does not cover, on every sheet. Marked `generic: true`, so they are reviewable but never block the JSON conversion (that path is unchanged). |
| `session.ts` | Merges generic issues; `Session.sheetScans`; the review context is keyed by sheet and gives any unknown column a free-text spec. |
| `evidence-index.ts` | The model learns from every clean text cell of every sheet. Retrieval records are kept only for columns that hold damage. Scope of a column: same sheet, same column. |
| `auto-repair.ts` | Gate removed. Role of an unmapped cell comes from its value (`textRoleOf`). Calibration counts damaged words over all text cells. Per-sheet `verifiedChanges`. |
| `corruption-span.ts` | A `?` that ends a cell is a real question mark unless a fragment that is no word stands before it (`can h?`). All-caps abbreviations and longer words are left alone. |
| `predict.ts`, `model-repair.ts` | Marks: the model records the marked spellings of the file's own clean text. If the file writes with marks (≥ 5 % of its words), a `?` stands for a marked letter and only a spelling the file has used is offered; otherwise predictions stay unmarked as before. Calibration masks marked letters in such files. Nothing about particular words is built in. |
| `xlsx-patcher.ts` | `verifyRoundTrip` also returns the measured change count per sheet. |
| `collateral.worker.ts`, `protocol.ts`, `useCollateralEngine.ts`, `IssueDetails.tsx`, `ReviewStep.tsx` | `sheet` travels with edit/row/predict; the sheet viewer opens on the sheet of the selected issue; the language model is built from all sheets. |
| `sheet-status.ts` (new), `OverviewStep.tsx`, `AutoRepairAction.tsx` | One state per sheet: grey `unscanned`, red `error`, amber `issues`, green `clean`. Green needs: scan finished, no `?` that cannot be repaired, and every issue verified or accepted. The repair dialog shows a per-sheet table; the button no longer needs a profile. |

## Evidence (all numbers measured in this repository)

Tests: `node --experimental-strip-types --test …/generic-repair.test.mjs` → 15 pass, 0 fail (was 12 fail, 0 pass before the fix).
Whole app suite: 315 pass, 2 fail; the 2 failures (split-bar label rule, terrain traces) fail identically on the code before this work because they need `docs/research/uiarc-*` fixtures that were never committed. Root `npm test` (ponytail): 143 pass, 1 fail, same as before.
Typecheck, lint and `next build` are clean.

Independent check: every exported file in the multi-sheet tests is also read by `independent-xlsx-dump.py` (Python stdlib `zipfile` + `ElementTree`, no code shared with the app). Each approved cell must equal its proposed value and no other text cell may differ.

Per sheet, workbook A (two sheets, no MAU9 header; before = old code):

| sheet | text cells | cells with `?` | before: issues / repaired | after: issues / accepted / verified in output |
|---|---|---|---|---|
| Danh muc | 6005 | 1 | 0 / refused | 1 / 1 / 1 |
| Phu luc | 1209 | 3 | 0 / refused | 3 / 3 / 3 |

Workbook B (other headers, other order, only sheet 2 damaged): `Tong hop` → clean, 0 `?`; `Chi tiet` → issues, 1 `?`, repaired and verified. The first workbook's data does not appear in the second's report.

Before → after cells (synthetic, read back from the exported file):

| address | before | after |
|---|---|---|
| Danh muc!B3002 | `t?ng o tiet rieng quyen` | `tang o tiet rieng quyen` |
| Phu luc!B604 (same phrase, other sheet) | `t?ng o tiet rieng quyen` | `tang o tiet rieng quyen` |
| Chi tiet!A1802 | `su hop tr?nh chap` | `su hop trinh chap` |
| marked file, one cell | `h?p ??ng t?n d?ng` | `hợp đồng tín dụng` |
| marked file, one cell | `quy?n s? d?ng ??t` | `quyền s? dụng đất` (`s?` kept: `sổ` and `sử` are both attested, no context separates them) |

Retained on purpose: `b?n` where `ban` and `bon` are equally attested (policy on, word untouched, counted as unresolved); `Ban co dong y?`, `Anh?`, a lone `?`, `AB12?3`, a link with `?`, formula results, and multi-word proper names (`Nguy?n V?n An`) are never changed.

Model quality, synthetic corpora, 600 damaged cells each, accepted repairs compared with the known truth:

| corpus | accepted correct | accepted wrong | kept damaged | calibrated precision (hold-out) |
|---|---|---|---|---|
| no marks | 488 | 1 | 76 | 1.000 |
| with marks | 356 | 1 | 208 | 0.997 |

Both wrong cases are the same shape: a cell-final two-letter word (`s?` → `so`/`su`, `sổ`/`sử`). Measured wrong rate ≈ 0.3 %, in line with the 99.5 % target. This is a measurement on synthetic text, not a guarantee for real files.
Speed (laptop, Node): 20 301 rows over 2 sheets, open 0.2 s, repair 1.9 s (evidence 0.6 s, candidates 0.65 s, patch 0.16 s, round-trip check 0.4 s); 265 of 300 damaged cells accepted, 35 left for review, 0 unexpected output changes.

## How scanning works for any workbook

The reader enumerates worksheets from `workbook.xml` and its relationships. `scanWorkbook` then visits every row (hidden ones included) and every cell of a text type on every sheet, with no look at sheet names, headers or mappings, and records counts per sheet. `generic-detect.ts` turns damaged cells into reviewable issues. `autoRepair` learns from the clean text of the whole workbook, decides each damaged cell by its own value (identifier, proper name or free text), accepts a repair only when a calibrated hold-out of this very file shows it is safe, patches each approved cell on its own sheet, re-reads the output and fails if any value differs. The MAU9 profile is still used for what only it can do: the mapped columns' roles, same-asset clean records, and the JSON conversion (whose gates are unchanged).

## Remaining limits

- One `?` is taken to stand for one letter; a run of `?` that replaced a different number of letters is not auto-repaired (the mask matcher allows it, the model does not).
- Without enough clean text (the calibrator wants about 300 held-out words) nothing is auto-accepted and every candidate stays for review. This is deliberate.
- Proper names, codes and identifiers are never repaired automatically, which also leaves capitalised multi-word descriptions for review.
- A worksheet that cannot be parsed makes the whole file fail to open (nothing is shown green); there is no partial open.
- Cells with rich text, merged ranges, formulas are read and counted but never written.
- Not tested: desktop Excel, a real customer file, the browser UI by hand (only its pure status logic and the engine are tested), cancellation of a very large file beyond the existing cancel test.
- `ReviewStep.tsx` still reads `MAU9_PROFILE.descriptionPair` for the twin-description view; it only matters for MAU9 columns and does not affect generic repair.

## Second round: what the browser showed (reproduced with Edge + playwright-core, outside the repo)

Report: "the file has two sheets but only one is scanned and the other is left blank".
The engine already scanned both (Overview listed 4 issues: 1 on sheet 1, 3 on sheet 2). The blank sheet was the **sheet viewer**: `SheetViewer.tsx` replaced the issue marks of any sheet other than the selected issue's sheet by an empty set (`issueCells: NO_CELLS`), opened it on row 1, and did not let a cell of it be selected. A damaged sheet 2 therefore looked unchecked.

| Change | File |
|---|---|
| Marks for every sheet (`bySheet`), cell selection on any sheet, the dropdown shows `Sheet · N ?`, another sheet opens on its first open problem | `SheetViewer.tsx`, `IssueGallery.tsx`, `ReviewStep.tsx` |
| Every `?` is damage by default: even a lone `?`, `Anh?` or a likely question is at least `high` | `generic-detect.ts` |
| A file too small to calibrate still repairs a cell when exactly one clean text of the same column fits it and that text stands in at least two cells | `repair-decision.ts`, `candidate-generator.ts`, `evidence-index.ts` |
| Clean texts are found by word count and both ends, not by the first two letters, so `S? ti?t` finds `So tiet` | `evidence-index.ts` |
| Deeper: a `?` in a sheet NAME makes the sheet `issues`; a note says when comments, text boxes, charts or tables exist (they are not scanned) | `sheet-scan.ts`, `xlsx-reader.ts` |

Checked in the browser after the change: sheet 2 opened from the dropdown is tinted and scrolled to row 602; "Tự động sửa Excel" on a two-sheet file and on a MAU9-plus-extra-sheet file scans 2/2 sheets, repairs 4/4 cells (verified in the output per sheet) and downloads `.repaired.xlsx` plus the report.
New tests: six sheets (clean, damaged, numbers only, empty, damaged name, last) each with its own status; default-damage severity; small-file repair. `generic-repair.test.mjs`: 18 pass. App suite 318 pass, same 2 fixture failures as before.
Still not covered: text outside cells (see the note above), a damaged sheet name cannot be repaired by a cell patch.
