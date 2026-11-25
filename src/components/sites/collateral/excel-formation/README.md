# Excel formation

Steps: **Import → Overview → Review and fix → Preview & export** (`ui/ExcelFormation.tsx` switches between them). Layer rules: [`../README.md`](../README.md).

## UI / UX (`ui/`) — what the person sees

| Part of the screen | Component | Calls (model / engine via `useCollateralEngine`) |
|---|---|---|
| Section shell, step tabs | `ExcelFormation.tsx` | `model/CollateralProvider` (`useCollateral`) |
| Step 1 Import: drop zone, preview, detected columns | `steps/ImportStep.tsx`, `steps/WorkbookUnfurl.tsx`, `steps/import-copy.ts` (copy), `steps/import-motion.ts` (motion), `import-step.css` | `engine.open`, `engine.restored`, `engine.failure` |
| Step 2 Overview: counts by severity, problem and column | `steps/OverviewStep.tsx` | `engine/types` (`SEVERITIES`), `engine/sheet-status` (`sheetStatuses`), `engine.result`, `engine.view` |
| Step 3 Review and fix: filters, issue table, bulk fixes, progress save/resume | `steps/ReviewStep.tsx`, `IssueTable.tsx` | `model/review-table` (rows), `model/sheet-marks` (tints), `engine.bulkPlan`, `engine.edit`, `engine.undo` |
| Step 3 details: variants, per-word candidates, editor, exceptions | `IssueDetails.tsx`, `DuplicateRepairDialog.tsx` | `model/compose-picks`, `engine.predict`, `engine.groupRows`, `engine.rowContext` |
| Step 3 correction workbench (Guess and check) — **preserve, see `../AGENTS.md`** | `gallery/SpeculativePanel.tsx`, `gallery/SpeculativeRun.tsx`, `gallery/AppliedChange.tsx`, `gallery/linked-words.ts` | `engine/predict`, `engine/run-timeline`, `engine/applied-change` |
| Issue gallery and file viewer | `gallery/IssueGallery.tsx`, `WorkbookViewer.tsx`, `SheetViewer.tsx`, `Specimen.tsx`, `RollingNumber.tsx`, `sheet-host.ts`, `viewer-labels.ts` | `model/gallery-model` (geometry, specimen), `engine/sheet-geometry` |
| One-click auto repair dialog | `AutoRepairAction.tsx`, `auto-repair.css` | `engine.autoRepair`, `engine.cancelRepair` |
| Remaining problems outline | `RemainingOutline.tsx`, `remaining-outline.css` | `engine/residual` via `engine.residual` |
| Step 4 Preview & export | `steps/ExportStep.tsx`, `final-preview.css` | `model/preview-model`, `model/sheet-marks`, `model/word-diff`, `engine.previewChanges`, `engine.exportXlsx` |

## MODEL (`model/`) — state and view-models, no layout

| File | Function |
|---|---|
| `review-filters.ts` | `ReviewFilters` and the defaults. |
| `review-table.ts` | `reviewRows` (filter + sort the issue table), `doneStatus`, table types. |
| `sheet-marks.ts` | `openIssueMarks` (open issues per sheet), `problemCells`, `previewMarks` (changed and problem cells). |
| `compose-picks.ts` | `composeFromPicks`: build the new text from the words the reviewer picked. |
| `preview-model.ts` | `previewCells`: the cells of the final preview, original against new. |
| `word-diff.ts` | `wordDiff`: word-level difference shown in the preview. |
| `gallery-model.ts` | Pure geometry and `specimenSegments` of the issue gallery. |

## ENGINE (`engine/`) — pure logic, also used by `scripts/`, `lib/excel-csv` and the converter

| Area | Files |
|---|---|
| Read and write XLSX | `xlsx-reader.ts`, `xlsx-zip.ts`, `xml-scan.ts`, `xlsx-patcher.ts`, `packed-csv.ts`, `text.ts`, `limits.ts`, `workbook-grid.ts`, `sheet-geometry.ts` |
| Session and review state | `session.ts`, `review.ts`, `progress.ts`, `profile.ts`, `mapping-profiles.ts`, `blocks.ts`, `types.ts` |
| Detect problems | `detect.ts`, `generic-detect.ts`, `sheet-scan.ts`, `sheet-status.ts`, `corruption-span.ts`, `text-clean.ts`, `residual.ts` |
| Suggest and predict | `predict.ts`, `speculative.ts`, `candidate-generator.ts`, `context-ranker.ts`, `evidence-index.ts`, `name-repair.ts`, `name-seed.ts`, `model-repair.ts`, `duplicate-repairs.ts`, `applied-change.ts`, `run-timeline.ts` |
| One-click repair | `auto-repair.ts`, `repair-decision.ts`, `repair-metrics.ts`, `workbook-coverage.ts` |
| Vietnamese address data | `geo/` |
| Collateral wording recovery | `collateral/` |

Test fixtures (`*-fixture.mjs`, `xlsx-builder.mjs`, `ooxml-independent.mjs`, `independent-*.py`) sit in `engine/` because `scripts/` and tests share them.
