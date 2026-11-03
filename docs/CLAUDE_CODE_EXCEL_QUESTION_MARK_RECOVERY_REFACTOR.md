# MASTER PROMPT — FIX MULTI-SHEET QUESTION-MARK REPAIR WITHOUT REWRITING THE APP

> For Claude Code / Codex. Execute inside the existing repository. Read this entire file before changing code.

## Mission (read first)

The current Excel repair product is accidentally coupled to the MAU9 profile. It may recognize errors on one worksheet but show another as green even when its text contains obvious `?` corruption. In addition, previous "repaired" exports contained no actual cell changes. The business requirement is **narrow and practical**:

**One click must scan every worksheet and every eligible text cell in an arbitrary `.xlsx` workbook, propose repairs for corrupted Vietnamese text involving `?`, apply only sufficiently safe repairs, and export a genuinely changed workbook with an accurate per-sheet report.**

This is **not** a request to rewrite the product, rebuild the JSON converter, create a large AI platform, hard-code MAU9-specific replacements, add ExcelJS / SheetJS, or automatically guess every ambiguity. Minimize changes, keep the current TypeScript + Web Worker architecture and existing `fflate` reader/patcher. The priority is **correctness + coverage + verifiable output**, not visual polish or high claimed accuracy.

### Non-negotiable distinctions

- **Scanning must be generic and profile-independent.** Profiles are optional for business validation/JSON mapping; they must not determine whether a sheet is scanned for textual corruption.
- **Every worksheet** means enumerate all real worksheets from the workbook OOXML relationship graph, not just first match or the currently viewed worksheet. A skipped/error sheet can never be shown green.
- **Every eligible text cell** means all readable cells whose value is string (`s`, `inlineStr`, formula cached string if safely readable, etc.) including hidden rows/columns by default; report formula cells separately if not safe to modify. Never try to "repair" numeric/date/code identifiers automatically without an explicit safe rule.
- **Detected** is not **repaired**. **Suggested** is not **accepted**. **Accepted** is not **patched**. **Patched** is not **verified**.
- **Fix `?` in damaged Vietnamese text**, not all legitimate question marks. If context is insufficient, retain the original and return 2–3 alternatives if available. Do not fabricate names, places, bank identifiers, serial numbers, or contract details.
- **Do not call it success** merely because a ZIP was recompressed or a `.repaired.xlsx` file was downloaded. An unchanged file with outstanding corruption must produce a precise warning/status.

## Inputs / evidence

Repository modules reported by user (verify actual paths/API before editing):
- `xlsx-reader.ts`, `limits.ts`, `profile.ts`, `mapping-profiles.ts`, `detect.ts`, `predict.ts`, `review.ts`, `progress.ts`, `xlsx-patcher.ts`
- `session.ts`, `collateral.worker.ts`, `ReviewStep.tsx`
- `json-report.ts`, `json-session.ts`, `template-mau09.ts` are currently MAU9-specific; **out of scope** except to prevent regressions.

Prior review reported:
- `session.ts` defaults `options.profile ?? MAU9_PROFILE`;
- worker does not pass a profile;
- review UI reads `MAU9_PROFILE.descriptionPair`;
- `profile.ts` selects a primary worksheet based on header matching, typically within first 15 rows;
- previous original/repaired XLSX contained byte-identical decompressed XML components, so no actual cell repair occurred;
- one sheet appears to have issues shown red while another can appear green despite many obvious `?` tokens.

**Treat these as hypotheses until verified in repository.** Do not assert a root cause from the screenshot alone. The screenshot cannot prove whether a sheet was unscanned, misclassified, cached, filtered, or actually parsed as empty.

Use user-provided local Excel originals and repaired outputs as **local-only test fixtures if present**. These may contain sensitive financial/identity data: do not print full records to logs, commit them, send them to remote services, or let hosted AI ingest sensitive values. Prefer synthetic fixtures for committed tests.

## Phase 0 — Deep scan and reproducible failing test (do not start by refactoring)

1. Inspect package scripts and real source tree (`rg`, imports, worker RPC, hooks, render components). Read the actual parser, detect, predict, review, patch, and export code. Identify data structures and naming conventions. No assumptions about APIs.
2. Draw the real end-to-end chain: `upload -> unzip/read workbook -> enumerate worksheets -> profile -> issue detect -> prediction -> acceptance -> patch list -> xlsx patcher -> download -> read-back verify -> UI issue coloring`.
3. Trace precisely where `sheetId`, sheet name, OOXML worksheet path, row/column and cell address may be lost, remapped or filtered. Confirm whether detection loops all worksheets or only selected/profiled sheet. Check hidden rows, blank-looking cells, sharedStrings, and virtualization.
4. Identify why "green" is currently displayed: does it mean scanned-and-clean, no issues loaded, no profile, no visible issues, or stale cache? Find every conditional and state initialization involved.
5. Add minimal diagnostic counters **for each sheet** (do not log cell contents): `sheetId`, `sheetName`, `sheetXmlPath`, `scanStatus`, `rowsSeen`, `textCellsSeen`, `questionMarkCells`, `issuesDetected`, `candidatesGenerated`, `autoAccepted`, `patchesBuilt`, `patchesWritten`, `verifiedChanges`, `needsReview`, `skipReasons`, `durationMs`.
6. Create a small synthetic workbook with at least two worksheets and predictable corrupted cells. Show a test that fails on the existing code before the fix. Include a case where only worksheet 2 contains corruption and worksheet 1 has no MAU9 headers.
7. Write concise `docs/question-mark-repair-root-cause.md`: specific file:line or function evidence, observed reproduction, actual first broken link, proposed minimum fix. Do not begin broad unrelated changes.

## Phase 1 — Untangle scanning from MAU9 profile (smallest necessary refactor)

Target conceptual separation:

```ts
scanWorkbookForQuestionMarks(workbook): WorkbookScanReport
// Generic: iterate all worksheets, all eligible cells, no MAU9 requirement.

resolveOptionalProfile(workbook): ProfileResolution
// Optional: mapping/JSON validation only. Does not gate generic scan.

repairQuestionMarkIssues(workbook, scanReport, options): RepairPlan
// Produces cell-addressed candidate patches and unresolved issues.
```

- Reuse current reader data model; only adapt where needed. Discover worksheets using workbook relationships/content types, not sheet title heuristics or current tab; handle renamed, reordered, missing/unsupported sheets explicitly.
- For every sheet, enumerate all cells of text type, including sharedStrings and inline strings. Correctly decode XML entities/Excel escape sequences through the current reader. For corrupted/malformed unsupported cells, surface a parse error; do not silently replace with `""` and call sheet clean.
- Do **not** use `header confidence`, `MAU9_PROFILE`, number of mapped columns, `descriptionPair`, or `mainSheet` as a prerequisite to run generic `?` detection. Keep MAU9-specific checks in the MAU9/profile path only.
- Build a stable cell identity: workbook sheet relationship/path + A1 coordinate, and keep it through detection, proposals, review, patching and verification.
- UI should default to **All worksheets** for repair scanning. Sheet selection should filter what is displayed only, not what the scan processes, unless user explicitly chooses a sheet-only mode.
- **Scan status semantics:** `unscanned` = neutral/gray, `scanning` = running, `clean` = scanned with 0 applicable issues, `issues` = red/orange according to severity, `partial` = some unresolved, `error` = parser/scan failure. Never show `clean` for missing results, unsupported profile, exceptions or failed scan.
- Confirm caching keyed to file bytes/hash AND scan algorithm version. Switching files/sheets cannot reuse stale issue counts; aborting/terminating worker must clear or invalidate incomplete state.

## Phase 2 — Narrow question-mark detection, no scope creep

Implement a generic `questionMarkDetector` independent of profile:

- Candidate if a `?` occurs **inside or adjacent to a token that looks like damaged Vietnamese text**, including word-final `?` before a space/punctuation; examples: `S? ti?t ki?m`, `can h?`, `c?a d? an`, `B?m be tong c?n`.
- Do not automatically classify a legitimate sentence-ending `?`, `??` discussion, a standalone `?`, URL query marker, or code-like data as corrupted words. Distinguish **possible corruption** from **confirmed corruption**; uncertain cases still appear in review counts.
- Include only in-scope cells with a text value, while flagging skipped cells with reasons. Do not infer "no issue" from a missing column role or absent header. Generic fallback role is `unknownText/freeText`, not `unmapped -> skip`.
- Do not assume one `?` == exactly one Unicode code point or one word-length-preserving replacement. Generate candidates constrained by unchanged visible surrounding text. Normalize NFC before comparison; preserve original format and visible characters outside approved replaced spans.
- Collect issue counts and short privacy-safe samples for development. Tests must cover `?` at word start/middle/end, repeated `?`, real question punctuation, diacritics, mixed casing, multiline cells and multiple worksheets.

## Phase 3 — Adapt existing `predict.ts`, do not replace with LLM

Re-use `Corpus`, `VietnameseModel`, existing decoding and ranking. Make the smallest changes required:

1. Build evidence from **all clean and trusted eligible text cells across the workbook**, optionally weighted by same sheet/column/context. Do not train on strings with `?` as if they were clean. Avoid leaking predictions into evidence until verified.
2. Generate candidates based on unchanged fragments around the mask, syllable/word boundary patterns, compatible observed vocabulary, and character n-gram/frequency evidence. Use backoff corpus across sheets if the same column has no clean examples. Never hard-code example repairs or dictionary phrases into runtime.
3. Score by phrase context, similar trusted descriptions, surrounding words, and minimal edits. Do not change words without `?` merely to make a sentence fluent. Preserve proper nouns, identifiers, dates and digits.
4. Produce ranked candidates and evidence metadata, plus `no_candidate`/`ambiguous`. A high raw model score is **not** a calibrated 99% probability; don't invent confidence percentages. Use measured thresholds calibrated on held-out fixtures; otherwise auto-accept only when an exact verified source/evidence rule applies.
5. Deduplicate identical text for performance **but retain individual cell locations**: one prediction can map to N addressed patches. Dedup must not result in only one sheet being patched.
6. Keep the recovery engine local. No remote model calls, no external dictionary API, no auto-upload on opening Excel. Neural ONNX/LLM and JSON redesign are explicitly **not required** for this task.

## Phase 4 — Make the output actually change, and verify every patch

- Define one explicit `RepairPlan` with fields: sheet path/id, cell address, old value, proposed value, evidence, status, reason, protected-value check.
- `candidate -> approved` only after evidence and guards. `approved -> written` only after xlsx-patcher applies it. `written -> verified` only after re-reading final XLSX and comparing expected old/new values.
- Avoid mutating shared string entries globally. If multiple cells reference one shared string, edits to one cell must not inadvertently alter others. Use the existing safe per-cell patch mechanism or create an isolated shared string entry if necessary.
- Never patch formulas, unsupported structures, IDs, codes or numeric values by default. Preserve non-target cells, styles, merges, other sheets, relationships, and workbook metadata as far as the existing patcher supports. If preservation cannot be guaranteed, fail with a report rather than silently produce a destructive file.
- Add assertion on export: for **each approved patch**, `exportedCellValue === proposedValue`, and for **every unapproved text cell**, `exportedCellValue === originalValue`. Independently compare OOXML outputs or use an independent test-only verification parser (e.g. Python stdlib zipfile + ElementTree, no production xlsx libraries) to avoid self-validating with one faulty reader.
- If original has applicable issues but `patchesWritten === 0`, show `0 cells auto-repaired; N need review` with reasons; **not** "Repaired successfully". If patch count > 0 but `verifiedChanges === 0`, throw an export failure. If patch count is 0 because every candidate is ambiguous, that is a valid no-auto-change outcome — surface it clearly.
- Only persist accepted patches and never mutate the source file buffer. Respect existing undo/review logic.

## Phase 5 — One click and a truthful multi-sheet UI

Provide/repair the **Auto-repair `?`** button:

`Select Excel -> Scan ALL sheets -> Detect `?` -> Retrieve/score candidates -> Auto-accept safe candidates -> Apply patches -> Verify output -> Download repaired.xlsx + summary of unresolved.`

- Progress should show actual per-sheet processed counts, not a fake/simulated speedup. Show `Sheets scanned: X/Y`, `Text cells scanned`, `? issues`, `Applied`, `Need review`, `Skipped`, `Verified`, and export status.
- Present a compact sheet-level status table; clicking a sheet filters its own issues without changing overall scan completeness.
- A green sheet only if scan completed successfully and its applicable issue count is zero **after verified repairs**. A sheet with unresolved `?` stays orange/red. A sheet not scanned is gray; a failed sheet shows error, not green.
- Keep existing MAU9 → JSON path untouched; Excel text repair must work even if the workbook has NO MAU9 profile or NO usable JSON mapping.
- Ensure that the export button downloads the newly patched blob, not the source blob or stale cached output from an earlier file.

## Phase 6 — Required tests (do not claim done without tests)

Synthetic test matrix (commit only synthetic data):

| Test | Expected result |
| --- | --- |
| File with two sheets, only sheet 2 contains `S? ti?t ki?m` | Sheet 2 scanned, issue detected, correct evidence-driven candidate/patch if sufficient evidence |
| Neither sheet matches MAU9 headers | Both sheets still scanned for `?` |
| Sheet 1 clean, sheet 2 corrupted | Sheet 1 green after scan; sheet 2 unresolved/changed per actual state, never falsely green |
| Same corrupted phrase occurs in 2 different sheets | Both cell addresses receive verified changes, if accepted |
| Different workbook with different column names, order, file name | Generic repair still works |
| Inline string + shared-string cell | Both decoded; per-cell changes don't modify unrelated cells |
| Hidden row and hidden column | Included in scan by default, reported clearly |
| Formula, date, amount, ID with `?`-like text | Skipped/protected or explicitly flagged, never guessed unsafely |
| Literal punctuation `Bạn có đồng ý?` | Not silently changed |
| `can h?`, `quy?n s? d?ng d?t` | Word-end `?` is detected; unknown outcomes shown if not enough evidence |
| No evidence to pick correct expansion | Original retained, unresolved count increases |
| 0 accepted patches, >0 issues | No false "repair success"; export is labeled unchanged/partial and clear reasons |
| 1 accepted patch | Export cell content really differs; other cells match |
| Upload file B after file A | No old-sheet cache/report/patch leakage |
| Large workbook / cancellation | Bounded progress; worker aborts cleanly; no false scan complete |

Must run repository tests, build/typecheck, and add a **reproducible end-to-end multi-sheet test** that opens exported ZIP and checks actual worksheet XML/cell values. If UI test infrastructure exists, add a test for sheet status colors and per-sheet counts; do not add major UI dependencies solely for this.

## Expected diagnostics / delivery report

Provide a short final report with:

1. **Verified root cause** (exact functions/files and failing conditions, not generic guesses).
2. **Small diffs only**: changed files and rationale. If refactor spans many files, explain why each is necessary.
3. Baseline vs after, **per sheet**: discovered, scanned, text cells, `?` issues, candidate proposals, accepted, patches written, verified changes, unresolved and skipped.
4. At least 3 actual before→after cell-address examples using **synthetic data**, plus one ambiguous example correctly retained.
5. Results of tests/typecheck/build, performance numbers if measured, and remaining known limitations.
6. A one-paragraph explanation of how scanning works for arbitrary workbooks independently of MAU9 and how JSON mapping remains isolated.
7. Confirmation that a previously unchanged "repaired" output will now either contain **verified cell edits** or accurately say **why zero edits were possible**.

## Execution rules

- Start by reading/reproducing, then implement sequentially. Do not ask me to choose between a tiny fix and a report; **perform the minimum complete fix**.
- Keep code modular; prefer one small generic scanner and one repair-plan adapter instead of a generalized plugin framework. Delete obsolete branches only after proving no active callers.
- Do not sweep unrelated items (JSON schema redesign, financial calculations, dashboards, speculative decoding animation) into this change. Document them separately.
- No invented tests, fake benchmarks, hard-coded test-specific replacement mappings, arbitrary green indicators, or unsupported success claims.
- If exact original text is unknowable, do not falsely claim near-100% recovery. Prioritize **100% scan coverage of readable eligible cells**, correct patch mechanics, and honest unresolved handling.
- Maintain user privacy: local processing; no new automatic uploads; avoid logging actual financial/customer data.

**Start now: audit the repository, reproduce the multi-sheet false-green and zero-patch defects, establish a failing synthetic test, fix the smallest real breakpoints, and demonstrate an exported XLSX whose contents actually changed in at least one well-grounded case.**
