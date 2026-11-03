# Shared-workspace coordination — Codex / Claude Code

User request: keep the Excel repair task compatible with Claude's concurrent work. This is a coordination note, not a new application requirement.

## Ownership for this pass

- **Codex:** local Excel verified-only repair, new `auto-repair*` / evidence / decision / XML / ZIP modules, scoped header action/dialog, worker repair/cancel RPC, privacy/duplicate/formula safety, repair QA and `docs/auto-repair/`.
- **Concurrent work observed, left intact:** mapping/block expansion, `template-mau09.ts`, `json-package.ts`, `report-options.ts`, JSON grouping/package naming/UI/document viewer, package/PDF/storage assets. These appear to be the other working stream; Codex has no direct access to Claude's live conversation.
- **Shared files:** `types.ts`, `review.ts`, `session.ts`, `detect.ts`, worker/protocol and `json-session.ts` / `json-report.ts` / tests. Re-read before patching; use narrow edits, preserve other changes. Do not reset/stash/clean or replace shared files wholesale.

## Safety contracts to retain in JSON work

- Actual review blockers plus `otherCellBlockers` must gate JSON; the caller's zero summary is not sufficient.
- Conflicting representative asset values (`assetsWithValueConflicts`) block grouping/export.
- `ready || true` was only an audit-generation issue, not a historic contractual-byte bypass. Audit is available for failures; contractual bytes require every gate.
- Redacted audit excludes original/corrected values, value/file hashes, filenames, actual sheet names, metadata and freeform exception reasons.
- `numberLiteral` expands exponents with string arithmetic and sums exact decimals; no inferred currency rounding.
- New required package/naming metadata from Claude should remain fail-closed and be reflected in JSON tests. Codex will not loosen these checks to make old fixtures pass.

## Current verified results / remaining checks

Final completed combined-tree runs: **129/129** targeted tests; full suite **629 total / 621 pass / eight baseline missing-reference-fixture failures**. Production build, independent Python and Excel 16.0 checks passed. Final production browser repeat passed **16/16**, including the accessible Escape close path and a measured 609 ms early cancel on 50k rows. All six benchmark cases completed; large cases repaired 9091/10909 synthetic corrupted cells and left 1818 unresolved. Details and limitations: `03-validation-and-benchmark.md`. Counts describe that snapshot, not a guarantee about later concurrent edits.

## Reader compatibility fix completed (Codex-owned)

Preserving styled empty rows in `Sheet.rows` would make existing profile/detection/JSON consumers treat formatting-only rows as missing-required data. Codex retained the original **data-bearing rows only** contract and added an `emptyCells` count for explicitly blank cells in skipped rows. Those cells remain byte-preserved in the original ZIP and count as unchanged in workbook-wide repair accounting. No changes to Claude's JSON grouping implementation are needed for this fix.

Update: reader compatibility fix and regression test implemented. Codex also adapted the older `json-report.test.mjs` fixtures to Claude's new explicit file-name options and eleven gates, retained a negative test for missing naming metadata, and replaced the obsolete “TS010 must always be empty” assertion with string-array type checks. No runtime JSON/template/package code was overwritten for that integration.

## Known limits, not to hide

Verified-only; no calibrated model auto-apply or private gold-set claim. All hidden rows included. Unsupported rich/merged/formula-dependent cells remain unchanged. Whole-sheet strings and synchronous patch/package verification still create measurable memory/cancel latency. The eight missing terrain/split-bar/confirm-morph fixtures are outside this feature; do not invent/skip them to force a green suite.

## Follow-up: repeated corrupt rows (Codex)

User explicitly chose **same asset + identical damaged content**, not cross-asset propagation. Codex is adding `duplicate-repairs.ts`, its tests and read-only local scan/QA tools, plus narrow RPC/hook additions and a confirmation overlay from IssueDetails. Existing prediction/suggestion markup and CSS remain in place. One approved replacement can patch all eligible identical occurrences of the same schema-equivalent text field within the exact branch/customer/asset tuple, including hidden rows, in one history transaction. Different assets, edited/excepted cells, formulas, identifiers and known characters/digits are protected. Repeated damaged copies are not treated as evidence for the missing letters. No changes to Claude's JSON template/package logic are needed.

## Update: zero-patch fix (supersedes "Verified-only" above)

Auto repair is no longer verified-only. A cell is patched when a same-asset clean record proves it (`source_verified`, patch source `auto_source`) **or** when the calibrated local model is confident (`model_auto_accepted`, patch source `auto_model`; issues stay `edited`, never `verified`). Calibration is a hold-out on the file's own clean text and switches the model path off when it cannot reach 99.5% word precision. A job that changes no cell returns the untouched input as `*.not-repaired.xlsx` with status `NO_REPAIR_APPLIED`; the UI never starts a download for it. CSV-packed sheets (`Sheet1`) are repaired through their header line (`packed-csv.ts`). Root cause, call graph and evidence: `zero-patch-investigation.md`; numbers and commands: `repair-benchmark.md`. Independent oracle: `engine/ooxml-independent.mjs`; real-file QA (counts only): `scripts/qa/zero-patch-real.mjs`.
