# MASTER PROMPT --- INTEGRATED UNIVERSAL LOCAL EXCEL AUTO-REPAIR ENGINE

## Mission

Deeply inspect, refactor, and complete the existing application so that
**automatic question-mark recovery is a first-class, integrated feature
of the actual Excel workflow**.

The user does not want a scan-only tool, a list of suggestions, a demo,
a separate experimental page, or a repair feature that works only with
the original MAU9 workbook.

The required product behavior is:

1.  The user imports a supported Excel workbook.
2.  The application discovers and scans **every worksheet** in that
    workbook.
3.  The engine detects suspicious `?` characters that replaced missing
    Vietnamese characters.
4.  The local recovery engine generates and ranks plausible repairs
    using evidence and context.
5.  The engine automatically applies repairs that pass the configured
    safety threshold.
6.  The application exports a genuinely modified `.repaired.xlsx` file.
7.  The application reports exactly what was repaired and what could not
    safely be repaired.

This must work with **different workbooks, sheet names, column names,
header layouts, and worksheet counts**, not only MAU9.

Do not stop after producing a plan. Inspect the repository, reproduce
failures, implement the changes, run tests, and verify the actual
exported workbook.

------------------------------------------------------------------------

## 1. Non-negotiable architecture

### 1.1 Separate generic Excel repair from MAU9-specific processing

There are two distinct capabilities:

**A. Generic Excel Auto-Repair --- always available**

-   Reads supported Excel workbooks without requiring a known profile.
-   Scans every worksheet and every eligible text cell.
-   Detects suspicious question-mark corruption.
-   Predicts and applies safe repairs.
-   Exports a repaired Excel workbook.
-   Must not depend on MAU9 headers, JSON field names, column mappings,
    or profile selection.

**B. MAU9-to-JSON transformation --- optional downstream capability**

-   May continue using `MAU9_PROFILE`, `TS001...`, `KB001...`, and the
    existing JSON schema.
-   Runs only when the workbook is compatible with the MAU9 profile and
    the user chooses the JSON workflow.
-   Must not block generic Excel scanning, repair, or XLSX export.

A workbook with an unknown structure must still be repairable and
exportable as Excel even if JSON mapping is unavailable.

### 1.2 Preserve the existing technology choices

First inspect the real repository. Preserve its current architecture
wherever practical:

-   TypeScript
-   Existing Web Worker architecture, including `collateral.worker.ts`
-   Existing ZIP/XLSX reader and patcher using `fflate`
-   Existing validation approach using `zod`
-   Existing review, patch, progress, and export infrastructure

Do not add ExcelJS, SheetJS, AG Grid, Ajv, or another spreadsheet
library to production unless a demonstrated technical blocker makes it
unavoidable and the user explicitly approves the dependency change.

Do not rewrite the application from scratch. Do not replace working
modules merely for stylistic preference.

### 1.3 No hard-coded Vietnamese replacement dictionary

Do not implement mappings such as:

-   `S?` → `Sổ`
-   `t?i` → `tài`
-   `d?t` → `đất`

The engine must generate candidates from the text, language patterns,
contextual evidence, and locally available trusted data.

Deterministic safety rules are allowed. Hard-coded replacement answers
are not.

Do not use network APIs or cloud AI. The repair process must work
locally after the application and any required local model assets have
been installed.

------------------------------------------------------------------------

## 2. Phase 0 --- Deep repository audit before changing code

Read the actual source files and trace the complete runtime flow.

At minimum inspect:

-   `xlsx-reader.ts`
-   `limits.ts`
-   `profile.ts`
-   `mapping-profiles.ts`
-   `detect.ts`
-   `predict.ts`
-   `review.ts`
-   `progress.ts`
-   `xlsx-patcher.ts`
-   `json-report.ts`
-   `json-session.ts`
-   `collateral.worker.ts`
-   `CollateralProvider.tsx`
-   `ReviewStep.tsx`
-   The actual upload, scan, repair, export, and download UI components
-   Existing test fixtures and test commands

File names may differ. Search the repository and identify the real
equivalents.

Trace these exact stages:

`File import → ZIP parsing → workbook discovery → worksheet discovery → cell extraction → issue detection → candidate generation → candidate ranking → repair acceptance → patch creation → XML patching → XLSX export → output verification → download`

For each stage, identify the real function, input, output, and error
path.

Do not assume the previous audit is completely current. Verify every
finding against the current code.

### Required diagnosis

Explain and fix why:

-   The original MAU9 workbook may work while unrelated Excel files do
    not.
-   One worksheet may be scanned while another appears clean despite
    visible corruption.
-   A worksheet may be marked green despite never being scanned.
-   A prediction may exist but never become an accepted patch.
-   A patch may exist but never reach the XLSX patcher.
-   An output file may be generated without any cell content changing.

Create a short root-cause report before or alongside implementation. Do
not stop at the report.

------------------------------------------------------------------------

## 3. Phase 1 --- Universal workbook and worksheet discovery

Implement or correct generic workbook discovery.

### Requirements

1.  Read the workbook's actual worksheet relationships from the OOXML
    package. Do not assume that the first worksheet is the main
    worksheet.
2.  Resolve worksheet relationship IDs to actual worksheet XML parts.
3.  Discover all worksheets, regardless of:
    -   Worksheet name
    -   Worksheet position
    -   Header names
    -   Header row location
    -   Number of columns
    -   MAU9 profile availability
4.  Scan visible and hidden worksheets. Hidden sheets must not silently
    disappear from scan coverage.
5.  Keep per-sheet metadata:
    -   Sheet name
    -   Worksheet XML path
    -   Relationship ID
    -   Visibility state
    -   Number of cells visited
    -   Number of eligible text cells
    -   Number of suspicious cells
    -   Number of accepted repairs
    -   Number of unresolved cells
    -   Scan status and error details
6.  A worksheet that has not been scanned, or whose scan failed, must
    never be represented as clean or green.
7.  One failed worksheet must not silently prevent other worksheets from
    being scanned. Report partial failures explicitly.

Do not rely on header detection to decide whether a worksheet is
scanned.

Header/profile detection is a separate optional operation.

------------------------------------------------------------------------

## 4. Phase 2 --- Generic detection of corrupted question marks

The primary scope is question marks used as replacement characters
inside Vietnamese text.

Scan eligible text cells throughout every worksheet, including columns
with unknown names and no headers.

### Detection behavior

Detect suspicious patterns such as:

-   `S? ti?t ki?m`
-   `Quy?n s? d?ng d?t`
-   `37 can h? c?a d? an`
-   `B?m be tong c?n`
-   `Tài s?n`
-   Other text containing `?` inside a word or phrase

These are examples of corruption patterns, not a replacement dictionary.

### Do not treat every question mark as corruption

Distinguish likely replacement characters from legitimate punctuation.

Examples:

-   `Is this correct?` may contain a legitimate question mark.
-   `S? ti?t ki?m` likely contains replacement characters.
-   `Can ho?` is ambiguous and requires contextual analysis.
-   `A?B` may be a corrupted code, identifier, or ordinary text and must
    be handled according to column/content evidence.

Use token boundaries, neighboring characters, repeated patterns,
language evidence, and context.

When uncertain, flag the cell as suspicious but do not silently replace
its punctuation.

### Preserve original information

Do not modify:

-   Numeric values
-   Dates
-   Formula expressions
-   IDs and codes without sufficient evidence
-   Unrelated punctuation
-   Text outside the corrupted span

Normalize text for analysis carefully. Do not normalize or rewrite the
entire workbook indiscriminately.

------------------------------------------------------------------------

## 5. Phase 3 --- Local Vietnamese recovery engine

Inspect the current `predict.ts` implementation and improve it
incrementally.

The current same-column corpus and unigram/bigram model can remain
useful, but it must not be the only source of evidence.

### 5.1 Candidate generation

Support:

-   One or multiple `?` characters in a token.
-   Unknown original character patterns.
-   Variable-length candidate restoration where justified.
-   Vietnamese syllable structure.
-   Vietnamese consonant, vowel, tone, and diacritic patterns.
-   Original capitalization and punctuation.
-   Mixed Vietnamese/English text.
-   Numbers and identifiers embedded in descriptions.

Do not assume that every `?` must always correspond to exactly one
recoverable character without validating that assumption against real
fixtures.

### 5.2 Evidence sources, in priority order

1.  Exact trusted matching records from the same workbook, where
    identifiers and context establish that they refer to the same
    information.
2.  Clean repeated descriptions within the same worksheet.
3.  Clean descriptions from other worksheets in the same workbook.
4.  Clean words and phrases from the same column or semantic field when
    such a field can be established safely.
5.  Local corpus built from previously verified data, only if the user
    has enabled that feature and data isolation is respected.
6.  Language-level inference from character n-grams, word n-grams, and
    Vietnamese syllable structure.

Do not treat duplicate corrupted descriptions as independent evidence.

Do not treat two columns containing the same corrupted text as
independent confirmation.

### 5.3 Candidate ranking

Use deterministic contextual scoring.

Possible signals:

-   Character-level compatibility
-   Vietnamese syllable validity
-   Unigram, bigram, and trigram probabilities
-   Phrase-level context
-   Similarity to trusted descriptions
-   Same-asset or same-record evidence
-   Consistency across related rows
-   Number/code preservation
-   Candidate ambiguity and score margin

Use a candidate-ranking method that can evaluate the complete phrase,
not merely replace each `?` independently.

A candidate with a high language score is not automatically a verified
fact.

### 5.4 Safe acceptance

Separate these statuses:

-   `auto_accepted`: passed the configured, calibrated automatic-repair
    policy.
-   `needs_review`: plausible candidate exists, but evidence is
    insufficient or ambiguous.
-   `unchanged`: no safe candidate or the question mark appears
    legitimate.
-   `rejected`: candidate violates a protection rule.

Only `auto_accepted` candidates may be applied automatically.

Do not invent confidence percentages. If confidence thresholds are used,
calibrate them against a held-out test set and record how they were
calibrated.

If the existing model has not been independently evaluated, do not claim
98.8% accuracy or any other unverified metric.

------------------------------------------------------------------------

## 6. Phase 4 --- Integrated Auto-Repair workflow

This is a product requirement, not an optional experimental feature.

The main application must offer a clear integrated action such as:

**Scan & Auto-Repair Excel**

or:

**Auto-Repair & Export**

The user should not need to open individual issue cards and manually
approve thousands of cells.

### Required runtime sequence

1.  Import a supported Excel file.
2.  Discover every worksheet.
3.  Scan every worksheet.
4.  Detect suspicious question marks.
5.  Generate candidate repairs.
6.  Rank candidates using local evidence.
7.  Automatically accept candidates that pass the safety policy.
8.  Build cell-specific patches.
9.  Apply patches to the original workbook package.
10. Verify the output.
11. Download the repaired workbook.
12. Show unresolved cases separately.

The action must run the real pipeline. It must not merely simulate
progress or display a speculative-decoding animation.

### Progress UI

Show real progress for:

-   Reading workbook
-   Discovering worksheets
-   Scanning each worksheet
-   Detecting corruption
-   Generating candidates
-   Applying repairs
-   Exporting workbook
-   Verifying output

Use actual worker progress messages and counters.

Allow cancellation without corrupting the original file.

### Result summary

Show:

-   Worksheets discovered
-   Worksheets successfully scanned
-   Worksheets failed
-   Cells visited
-   Suspicious question-mark cells
-   Candidates generated
-   Automatically repaired cells
-   Unresolved cells
-   Rejected candidates
-   Verified output changes

Do not call a worksheet clean if it was not scanned.

Do not call the workbook repaired merely because a ZIP file was
generated.

------------------------------------------------------------------------

## 7. Phase 5 --- Real XLSX patching across worksheets

Inspect `xlsx-patcher.ts` carefully.

The patcher must apply accepted repairs to the correct worksheet and
cell, regardless of worksheet order or name.

Every patch must contain enough information to identify the exact
target:

-   Worksheet relationship ID and XML path
-   Worksheet name
-   Cell reference
-   Original cell value
-   Repaired cell value
-   Original storage type
-   Candidate evidence
-   Acceptance reason
-   Recovery engine version

### OOXML storage cases

Inspect and test at least:

1.  Shared-string cells (`t="s"`)
2.  Inline-string cells (`t="inlineStr"`)
3.  Ordinary string cells
4.  Rich-text shared strings
5.  Formula cells
6.  Cells with styles
7.  Hidden worksheets
8.  Repeated shared-string references

For shared strings, be careful: editing one shared-string entry can
unintentionally change every cell that references it.

Use copy-on-write behavior when a repair should affect only one cell:

-   Create a new shared-string entry when necessary.
-   Update only the intended cell's shared-string index.
-   Update shared-string counts consistently.
-   Preserve unrelated entries.

Never edit formula expressions as ordinary text. If a formula cell
cannot be safely handled, leave it unchanged and report why.

If a specific OOXML feature is unsupported, fail safely and report the
exact affected sheet/cell. Do not silently skip it.

Preserve unrelated workbook content, formatting, styles, formulas,
relationships, and macro content where applicable.

Do not claim byte-for-byte preservation of the entire XLSX ZIP when the
package has been rewritten. Instead, verify that all unrelated logical
workbook content remains unchanged.

------------------------------------------------------------------------

## 8. Phase 6 --- Independent output verification

This is mandatory.

After export, reopen the generated XLSX package and verify the actual
cell values.

Do not rely solely on the same in-memory patch list or the same
transformation function to claim success.

For every accepted patch:

1.  Locate the corresponding output worksheet.
2.  Locate the exact cell.
3.  Decode its actual stored value.
4.  Confirm it equals the expected repaired value.
5.  Confirm the original value was changed.
6.  Confirm the output contains no unintended modifications to unrelated
    cells.

Produce a verification result for every patch.

If zero cells changed:

-   Do not report success.
-   Do not label the file as repaired.
-   Report `ZERO_PATCH_APPLIED`.
-   Show the first pipeline stage where the count became zero.
-   Provide the reason and diagnostic information.

If the engine correctly finds no safe repairs, report that the workbook
was scanned but no changes were justified. This is different from a
successful repair.

------------------------------------------------------------------------

## 9. Phase 7 --- Keep generic repair separate from MAU9 JSON

Refactor only the necessary coupling.

The generic repair path must not call or require:

-   `MAU9_PROFILE`
-   `TS001...TS016`
-   `KB001...KB004`
-   MAU9-specific header mappings
-   JSON grouping rules
-   MAU9-specific required columns

The JSON workflow may continue using these rules after generic repair,
when a matching profile is selected.

An unknown workbook must still be able to:

-   Load
-   Scan all worksheets
-   Repair eligible text
-   Export a repaired XLSX

It may report that JSON conversion is unavailable because no compatible
profile exists. This must not affect Excel repair.

------------------------------------------------------------------------

## 10. Phase 8 --- Tests and regression fixtures

Create small synthetic workbooks with deliberately different structures.

Do not rely exclusively on the original MAU9 workbook.

### Required test matrix

**Workbook A --- MAU9-like**

-   Multiple worksheets.
-   Known headers.
-   Existing MAU9 workflow still works.
-   Corrupted Vietnamese descriptions are repaired.

**Workbook B --- Unknown structure**

-   Arbitrary sheet names.
-   No MAU9 headers.
-   No profile selected.
-   Corrupted text in the second and third worksheets.
-   Generic repair must work and export a modified XLSX.

**Workbook C --- Different layout**

-   Header row is not the first row.
-   Different numbers of columns.
-   Mixed text and numeric cells.
-   Corruption exists in an unknown column.
-   All worksheets must be scanned.

**Workbook D --- OOXML edge cases**

-   Shared strings reused by multiple cells.
-   Inline strings.
-   Hidden worksheet.
-   Formula cells.
-   Styles and merged cells.
-   Legitimate question-mark punctuation.
-   Multiple corrupted tokens in one cell.

### Required assertions

-   Every worksheet discovered is accounted for in the scan result.
-   Every successfully scanned worksheet has a real scan status.
-   Unscanned worksheets are never green.
-   A corrupted second worksheet is detected even if the first worksheet
    is clean.
-   An unknown workbook does not require MAU9 profile selection.
-   Accepted repairs modify the actual exported cell values.
-   Unrelated cells remain unchanged.
-   Shared-string changes do not unintentionally modify unrelated cells.
-   Legitimate punctuation is not automatically removed.
-   Formula expressions remain unchanged.
-   A zero-patch export is not reported as successful repair.
-   Existing regression tests continue to pass.

Use ground-truth original text in synthetic fixtures. Split training and
test examples by document/record, not random duplicated rows, to avoid
leakage.

Report exact metrics:

-   Detection precision and recall
-   Automatic-repair precision
-   Automatic-repair coverage
-   Unresolved rate
-   False-repair count
-   Per-worksheet scan coverage
-   Export verification pass rate
-   Runtime and peak memory where measurable

Never report a high accuracy percentage from training data as
independent test performance.

------------------------------------------------------------------------

## 11. Clean-code refactor rules

The purpose is to get the application back on track, not to create
another oversized architecture.

-   Keep modules small and single-purpose.
-   Separate workbook discovery, scanning, candidate generation,
    scoring, acceptance, patching, and verification.
-   Reuse existing interfaces where sound.
-   Remove duplicate logic only after confirming behavior.
-   Avoid MAU9-specific imports in generic repair modules.
-   Avoid circular dependencies.
-   Keep types explicit and avoid unsafe `any`.
-   Use structured errors with worksheet and cell context.
-   Keep the original workbook immutable.
-   Make the repair process deterministic and reproducible.
-   Keep tests close to the behavior they verify.
-   Do not introduce unnecessary dependencies or unrelated UI redesigns.

Before deleting or replacing an existing function, identify all callers
and tests.

------------------------------------------------------------------------

## 12. Privacy and local execution

The repair process must remain local.

-   Do not upload workbooks automatically.
-   Do not send workbook content to cloud models or external APIs.
-   Do not log full cell contents, customer identifiers, tax IDs,
    account numbers, or financial values.
-   Keep audit records privacy-preserving.
-   Do not use weak non-cryptographic hashes as a substitute for
    protecting short sensitive values.
-   Preserve the user's original file.
-   Make any optional persistent corpus explicitly opt-in and local.

------------------------------------------------------------------------

## 13. Required implementation order

Execute sequentially.

### Step 1 --- Baseline and root cause

-   Inspect the repository.
-   Run existing tests.
-   Reproduce the multi-sheet and unrelated-workbook failures.
-   Trace the first zero-count point in the current repair pipeline.

### Step 2 --- Decouple generic repair

-   Remove MAU9 profile requirements from generic scanning and repair.
-   Keep JSON mapping separate.
-   Ensure unknown workbooks can still be repaired as Excel.

### Step 3 --- Fix workbook-wide scanning

-   Discover all worksheets through OOXML relationships.
-   Scan all eligible text cells.
-   Add per-sheet scan accounting and truthful statuses.

### Step 4 --- Fix candidate generation and acceptance

-   Improve the existing Vietnamese recovery engine.
-   Use local evidence and contextual candidate ranking.
-   Add safe automatic acceptance.
-   Preserve unresolved cases.

### Step 5 --- Fix real XLSX patching

-   Apply accepted patches across every worksheet.
-   Handle shared strings safely.
-   Preserve unrelated workbook content.

### Step 6 --- Integrate the one-click feature

-   Connect the real worker pipeline to the existing application UI.
-   Show actual progress and results.
-   Generate a real repaired workbook.

### Step 7 --- Independent verification

-   Reopen the output.
-   Verify each patched cell.
-   Verify unrelated cells.
-   Reject false success.

### Step 8 --- Regression and clean-code pass

-   Run all existing tests.
-   Run the new multi-workbook and multi-sheet test matrix.
-   Remove dead code introduced by the refactor.
-   Report remaining limitations honestly.

Do not jump to Step 6 while Steps 2--5 are broken.

------------------------------------------------------------------------

## 14. Definition of Done

The task is complete only when all of the following are true:

1.  Auto-Repair is integrated into the actual application workflow.
2.  It works on supported Excel workbooks with different names, headers,
    columns, and worksheet counts.
3.  It scans every worksheet, not just the first or a profile-selected
    sheet.
4.  It detects suspicious `?` corruption in generic text cells.
5.  It predicts repairs without a hard-coded Vietnamese replacement
    dictionary.
6.  It automatically applies candidates that pass the tested safety
    policy.
7.  It exports an XLSX whose actual cell values contain the accepted
    repairs.
8.  It reports unresolved and ambiguous cases.
9.  It does not mark unscanned worksheets as clean.
10. It does not require MAU9 to perform generic Excel repair.
11. Existing MAU9 JSON functionality remains intact.
12. Tests prove that at least one known corrupted cell in a non-MAU9
    workbook and a non-first worksheet is repaired and verified.
13. No success claim is made without measured evidence.

### Final deliverables

Provide:

-   Implemented source code.
-   A concise root-cause report.
-   A list of changed files and why each changed.
-   Test commands and actual results.
-   Per-workbook and per-worksheet scan/repair statistics.
-   A real `.repaired.xlsx` generated from a synthetic test fixture.
-   A clear list of unsupported Excel features and unresolved cases.

**Final instruction:** Build a working, integrated,
universal-by-structure local Excel Auto-Repair workflow. Do not merely
scan, suggest, simulate, or export an unchanged workbook. The central
proof of success is that accepted repairs are present in the actual
exported Excel cells across all affected worksheets.
