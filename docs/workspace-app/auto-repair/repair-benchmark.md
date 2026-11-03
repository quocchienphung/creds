# Repair benchmark and verification (zero-patch fix)

Machine: Windows 11, Node v24.6.0. Real input: `docs/research/MAU9_20260930 ok.xlsx` (11,119,586 bytes, local only, nothing uploaded). Counts only; no cell text is recorded here.
Reproduce: `node --experimental-strip-types scripts/qa/zero-patch-real.mjs "<input.xlsx>" [output.xlsx]` (full output: `zero-patch-real.log`).

## Before / after on the real file

| | Before (verified-only) | After |
|---|---:|---:|
| Sheets scanned | 2 | 2 |
| Cells containing `?` (cells) | 11,287 (7,514 + 3,773) | 11,287 |
| Cells accepted `source_verified` | 0 | 0 (no same-asset clean twin exists) |
| Cells accepted `model_auto_accepted` | n/a | 10,764 |
| Patches committed | **0** | 10,764 |
| **Cells changed in output (app, measured)** | **0** | **10,764** |
| **Cells changed (independent parser)** | **0** | **10,764** (`MAU9_20260915!V` 3,589, `!AK` 3,589, `Sheet1!B` 3,586) |
| Unexpected changes | 0 | **0** (structural differences: 0) |
| Uncompressed OOXML parts identical / total | 11 / 11 (`RECOMPRESSED_ONLY`) | 9 / 11 (`sheet1.xml`, `sheet2.xml` differ) |
| `?` characters inside the changed cells | - | 86,392 -> 7,522 (91.3% restored) |
| Changed cells whose every non-`?` character is preserved | - | 10,764 / 10,764 |
| Status | `partially_repaired` + a `.repaired.xlsx` download (wrong) | `REPAIRED_PARTIALLY` |
| Unresolved cells (still containing `?`) | 12,756 | 5,479 |

Unresolved histogram (reason codes): `LOW_CONFIDENCE` 1,446; `PARTIAL_WORDS` 3,487 (cell repaired in part); `PUNCTUATION` 168 (terminal `?`, possibly real); `PROTECTED_ROLE` 219 (names, codes); `NO_CANDIDATE` 156; `UNSUPPORTED_STRUCTURE` 3. Cells in the fields `S`, `T`, `W`, `AJ`, `G` (names, ids, province codes) are protected by role and were not touched.

Confidence calibration (hold-out of this file's own clean text, deterministic): 4,239 held-out words, margin threshold 6, word precision 99.59%, coverage 91.2%. This measures the model under the observed damage pattern, not agreement with the lost originals.

Cross-sheet corroboration: Sheet1 repeats each MAU9 description inside its CSV line. After repair, 2,434 of the 2,437 newly resolved MAU9 rows appear verbatim in the matching Sheet1 line (99.96% overall agreement before and after). The two sheets were repaired by separate code paths (cell vs. packed field), so this checks the field alignment, not the model's accuracy.

## Independent verification

* Node oracle `engine/ooxml-independent.mjs` (fflate + regular expressions; no import of `xlsx-reader.ts`/`xlsx-patcher.ts`/`xml-scan.ts`): per-part SHA-256 of uncompressed bytes, shared strings and `inlineStr` resolved, cell map with type/value/formula/style, hidden rows. Result: `CONTENT_CHANGED`, 10,764 changed cells, 0 structural differences.
* Python stdlib (`zipfile`, `hashlib`, `-I`): 11 entries, 9 identical, differing `xl/worksheets/sheet1.xml` and `sheet2.xml` only.
* Desktop Excel 16 (COM, read-only, `AutomationSecurity=3`, never saved): original and repaired both open, 2 sheets, no repair prompt; in `V2:V4000` the cells containing `?` went 337 -> 108.
* LibreOffice: not installed / not run.

## Stage timings (real file, one run)

Parse + profile + detect 7.6 s; evidence index 4.2 s; calibration 1.2 s; scan, candidates and decisions 12.7 s; patch (write ZIP) 12.6 s; round-trip + package verification 29.5 s; total repair 60.9 s. Worker peak memory was not measured on the real file. 0 network requests (the unit test stubs `fetch`/`XMLHttpRequest`/`WebSocket`; the browser run is offline).

## Commands and exit codes (final tree)

| Command | Exit | Result |
|---|---:|---|
| `node --experimental-strip-types --test "src/components/sites/collateral/**/*.test.mjs"` | 0 | 161 / 161 pass |
| `npm test` | 1 | 653 / 661 pass; the 8 failures are the pre-existing missing-reference-fixture tests in `skilled/terrain`, `skilled/split-bar`, `skilled/ui/confirm-morph`, outside this feature |
| `npm run typecheck` | 0 | clean |
| `npx eslint src/components/sites/collateral scripts/qa` | 0 | 0 errors, 2 warnings |
| `npm run lint` | 0 | 0 errors, 24 warnings (none from this change, e.g. Stripe footer a11y) |
| `npm run build` | 0 | production build OK (`zero-patch-build.log`) |
| `node --experimental-strip-types scripts/qa/zero-patch-real.mjs "docs/research/MAU9_20260930 ok.xlsx" out.xlsx` | 0 | `RESULT: independent parser confirms 10764 changed cells` |
| `node --experimental-strip-types scripts/qa/auto-repair-browser.mjs http://localhost:3002` (production build) | 0 | 19 / 19 checks |
| `node --experimental-strip-types scripts/qa/auto-repair-benchmark.mjs 5000 repeated` / `unique` | 0 / 0 | see below |

Red/green: `zero-patch.test.mjs` failed before the fix (`at least one safely supported cell is repaired (patches)`) and passes after.

## Synthetic benchmark (5,000 rows, 40 columns, 1,090 damaged cells)

| Mode | Source-verified | Model-accepted | Output cells changed | Unexpected | Unresolved | Total |
|---|---:|---:|---:|---:|---:|---:|
| repeated (one distinct clean text) | 910 | 0 (calibration correctly refuses: too little text) | 910 | 0 | 180 | 4.9 s |
| unique | 910 | 180 | 1,090 | 0 | 0 | 4.2 s |

The 50k-row cancel check in the browser run responded to cancel with the main thread still ticking.

## Next actions for the remaining 5,479 cells

1. Terminal `?` (168 cells): ask the reviewer; a real question mark cannot be told from damage without the original.
2. `LOW_CONFIDENCE` (1,446): in Review, the existing per-word suggestions list the candidates; a person confirms or types.
3. Repaired-by-model cells are `edited`, not `verified`: confirm them in bulk in Review before the JSON gates will pass.
4. To raise recall further, supply an authorised second source of clean text (for example an earlier export of the same assets); the policy never reaches across files on its own.
