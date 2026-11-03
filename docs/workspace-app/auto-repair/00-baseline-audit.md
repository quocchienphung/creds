# Baseline audit — 2026-11-03

Environment: Windows, PowerShell, Node v24.22.0, npm 11.19.1; Next 16.3.8, React 19, strict TypeScript, fflate 0.8.3, zod 4. No production spreadsheet dependency added.

User changes present before work: package.json, public/storage/pdf.worker.min.mjs, public/storage/pdfjs-LICENSE, scripts/storage-assets.mjs, json-doc.ts/test and json-viewer/json-model.ts. Private workbook/JSON inputs are present but were not read; all new validation uses synthetic data.

Dataflow: ImportStep → CollateralProvider.open → useCollateralEngine → EngineClient → collateral.worker → openSession → reader/profile/detect → immutable ReviewState patches → patchWorkbookBytes → verifyRoundTrip → Blob download. JSON uses the same patches through planJson/buildReport and its export gates. Prediction is a local corpus model; speculative animation is not a benchmark.

| Reported finding | Observed baseline / priority |
|---|---|
| 1 upload | Confirmed P0: CollateralProvider.open calls save immediately. useUploadArchive sends original bytes and later processing metadata. Queue retains originals until explicit deletion. Empty API token permits private Host headers, not authenticated users; same origin is not confidentiality. |
| 2 hashes | Confirmed P0: text.ts cyrb53/fp53 fallback; auditJson/auditCsv expose value fingerprints, filenames, freeform exception reasons. |
| 3 trailing ? | Confirmed P1: questionMarkFinding downgrades any frequent trailing word, even mid-sentence. |
| 4 duplicates | Confirmed P0: groupRules medium; rec.assetsWithValueConflicts is counted, not gated. |
| 5 decimals | Exact lexical decimal and BigInt addition already exist; exponent fallback uses Number and can lose precision. No business rounding policy is supplied. Preserve exact decimals. |
| 6 memory | Confirmed P1: unzipSync + whole-sheet string; not chunk streaming despite older documentation. |
| 7 XML | Confirmed P1: double-quoted attrs only, prefix unsupported, invalid shared-string index becomes empty. |
| 8 formulas | Confirmed P0: patchRow replaces entire cell including f; roundtrip compares value/numeric category, not formula/style. |
| 9 mapping | Partly stale: current profile maps optional blocks, but legacy json-report still has limitations; missing optional fields do not block. Hidden rows included. Header/sheet ties silently selected. |
| 10 ready / grouping | `ready || true` affects audit generation only: contractual bytes already require ready. groupRowsOf scans all rows once per issue (not per group). |
| 11 accuracy | Existing 98.8% is same-file evaluation, not independent generalization/calibration. No model auto-apply threshold justified. |

Baseline `npm test`: exit 1, 606 tests, 598 pass, 8 fail, 6125.5965 ms. All eight failures are missing frozen split-bar/terrain/confirm-morph fixtures (see baseline-tests.log). Lint/typecheck/build started before implementation; completion results recorded in validation document. Historical counts 545/570/119 are not current results.

No service worker or beacon was found in the collateral path. Queue network calls are separate from worker processing. Existing progress export deliberately includes sensitive corrections and is distinct from redacted audit export.

Concurrent-work note: mapping/block/template/package code changed during this task. Those are not evidence of the original baseline and were preserved. In the combined tree, JSON now has eleven gates (the original nine plus file-name and template), and optional mapped arrays are supported. See `CLAUDE_HANDOFF.md` for ownership and the test-fixture integration; do not infer that those JSON product changes were authored by this repair pass.
