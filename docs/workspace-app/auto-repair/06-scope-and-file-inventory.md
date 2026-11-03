# Scope and implementation inventory

The delivered feature is the brief's **verified-only one-click MVP**. It uses existing TypeScript/React/worker/review/fflate/zod boundaries. Existing suggestion components, gallery/viewer CSS and application routes are not redesigned. No repository reset/stash/clean, new production spreadsheet dependency, private-data ingestion, remote model, deployment or commit was performed.

The checkout contained existing work in package/PDF assets/storage-assets, JSON document/viewer code and, during the session, mapping/block/template work. That work was retained. The files below describe this repair task's responsibilities; shared files may also contain that independent work.

Prefix `C/` below means `src/components/sites/collateral/`. Prefix `E/` means `C/excel-formation/engine/`.

| Path | Responsibility |
|---|---|
| `C/CollateralProvider.tsx` | Local-only open; explicit archive action; correct current File for saved Queue entries. |
| `C/queue/ArchiveNotice.tsx` | Local status and explicit server-save button. |
| `C/engine/protocol.ts` | Typed repair/cancel/progress/result RPC messages. |
| `C/engine/engine-client.ts` | Dedicated measured repair progress callback. |
| `C/engine/collateral.worker.ts` | Repair transaction lock, cancellation, atomic commit, transfer of XLSX bytes. |
| `C/useCollateralEngine.ts` | React repair/cancel state, Blob construction, stale-request protection. |
| `C/excel-formation/ExcelFormation.tsx` | Header action, keyed to the open workbook. |
| `C/excel-formation/AutoRepairAction.tsx` | One click, progress/cancel/result dialog, automatic local downloads and retry links. |
| `C/excel-formation/auto-repair.css` | Scoped header button/result dialog only. |
| `C/excel-formation/steps/ReviewStep.tsx` | Sensitive progress-export confirmation; existing suggestion markup stays intact. |
| `E/corruption-span.ts` | Unicode spans and bounded variable-length mask validation. |
| `E/evidence-index.ts` | Clean original same-field/entity indexing; no manually patched sources. |
| `E/candidate-generator.ts` | Bounded candidates, clean-source conflicts, reversible-encoding match. |
| `E/context-ranker.ts` | Reproducible evidence/frequency ranking without probability claims. |
| `E/repair-decision.ts` | Verified-only decisions, protected data and preserved-character checks. |
| `E/auto-repair.ts` | Workbook-wide accounting, batching, provenance, validation, redacted report. |
| `E/workbook-coverage.ts` | JSON safety checks for secondary/unmapped/header cells. |
| `E/xml-scan.ts` | Strict token scanning with quotes/prefixes/entities/nesting and offsets. |
| `E/xlsx-zip.ts` | Existing fflate, directory/actual expansion/CRC/path/entry budgets. |
| `E/xlsx-reader.ts` | Strict OOXML extraction, lexical values, explicit errors and protected structures. |
| `E/xlsx-patcher.ts` | Approved target spans only; protected targets refused; cell/package verification. |
| `E/text.ts` | Secure SHA-256 context required; weak file fingerprint fallback removed. |
| `E/types.ts` | Protected text structures and compatible shared types. |
| `E/profile.ts` | Ambiguous header detection. |
| `E/detect.ts` | Trailing corruption severity, high duplicate conflicts, mapping blockers, version. |
| `E/review.ts` | Formula protection, per-sheet specifications, batch source/provenance, meaningful exceptions. |
| `E/session.ts` | Indexed group membership/cells and fail-closed corrected export. |
| `E/progress.ts` | Automatic source provenance replay and exception validation. |
| `C/json-formation/engine/json-session.ts` | Actual blocker computation, duplicate gate, all-cell safety and redacted JSON/CSV audit. |
| `C/json-formation/engine/json-report.ts` | Exact exponent expansion, no binary floating-point conversion for lexical decimals. Existing independent mapping work is preserved. |
| `E/xlsx-builder.mjs` | Synthetic-only fixture: deterministic timestamp and complete style definitions for desktop Excel. |
| `E/auto-repair-fixture.mjs` | Synthetic shared fixture; no customer data. |
| `E/auto-repair.test.mjs` | Masks, full flow, determinism, immutability, history/replay, cancellation and conflicts. |
| `E/auto-repair-security.test.mjs` | Secondary JSON gate, ambiguity, secure context, XML/CRC, mojibake, stale evidence and semantic identifiers. |
| `E/repair-safety.test.mjs` | Trailing corruption, duplicate gate, formulas/numeric injection, exact money. |
| `E/xml-reliability.test.mjs` | Namespace/single quotes/Unicode/invalid references/XML/exact exponents. |
| `E/xlsx-preservation.test.mjs` | Shared references, attributes, styles, unrelated parts, calcChain/panes, rich/merged/formula protection. |
| `E/detect.test.mjs` | Expected rule version updated to the implemented rules. |
| `C/json-formation/engine/json-report.test.mjs` | Redacted-audit assertions; synthetic valid naming fixtures for Claude's eleven gates; missing-name negative test and populated shared-array type checks. |
| `scripts/qa/auto-repair-browser.mjs` | Real production Chrome workflow, offline downloads, layout, Undo/Redo and large-worker cancel. |
| `scripts/qa/auto-repair-benchmark.mjs` | Synthetic 100/5k/50k × 40, repeated/unique sources, timings, maxRSS, retrieval correctness and cancellation. |
| `scripts/qa/auto-repair-artifacts.mjs` | Synthetic original/repaired/formatting workbooks and approved manifest. |
| `scripts/qa/auto-repair-independent.py` | Independent Python zipfile/ElementTree oracle. |
| `scripts/qa/auto-repair-excel.ps1` | Read-only real Excel smoke test; macros/link updates disabled; native control. |
| `docs/auto-repair/00…06` | Baseline, plan, design, measured validation, privacy, user workflow and this scope inventory. |

## Concrete remaining work

- **P1, measured limitation:** break synchronous patch/re-read/package-verification stages into cooperative work or isolate them, to reduce worst-case cancel latency and peak memory. The current run remains on the worker, not React's main thread, but cancel waits for a checkpoint.
- **P1, deployment policy outside this feature:** explicit server Queue storage still uses the application's existing token/LAN guard and retention; no global authentication redesign was authorized.
- **P2, optional research:** approved private source-disjoint gold set and calibrated statistical model auto-apply; broader n-gram retrieval/ranking and approved corpus import. None is represented as implemented or benchmarked generalization.
- **Outside Excel scope:** restore the eight missing split-bar/terrain/confirm-morph reference fixtures from their authoritative source. Do not fabricate their contents or skip their tests to show a green full suite.
- **Outside supplied evidence:** private workbook accuracy, arbitrary Excel extensions, mobile physical devices, and a formal security certification. They were not verified here.
