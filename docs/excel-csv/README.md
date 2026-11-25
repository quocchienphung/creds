# Excel → CSV engine (`src/lib/excel-csv/`)

Engine only: no UI file was touched. `Converter.tsx`, `useConverter.ts`, `convert.worker.ts` and `convert.ts` are unchanged and still drive the existing converter screen.

## Engine decision (what was actually checked)

| Candidate | Result |
|---|---|
| **In-repo reader** `collateral/excel-formation/engine/xlsx-reader.ts` (fflate) | **Chosen as reader.** Verified by tests: keeps numbers as raw text, shared/inline/rich strings, leading zeros, row/column coordinates, formula flag + cached value, bounded unzip (size, ratio, entries, cells), rejects `.xls`/encrypted/non-zip/truncated. Limits: whole sheet XML in RAM (not streaming), no number-format codes, no date1904 flag, hidden-column positions and merge ranges are not exposed. |
| **csv-parse 7.0.3** (MIT, `npm view`) | **Added (devDependency, pinned)** as the independent verifier: the writer shares no code with it. `npm audit`: 13 vulnerabilities before and after (same count, pre-existing, none from csv-parse). |
| csv-stringify | Not added: a 3-line RFC 4180 writer, checked against csv-parse, is enough. |
| ExcelJS, SheetJS CE, calamine, excelize, DuckDB | **NOT EVALUATED.** No proof-of-concept was run and no advisories were fetched, so there is no verdict on them here. Their facts quoted in the master prompt (ExcelJS 4.4.0 stale, `xlsx` on npm 0.18.5) are unverified by me. Reason not to add one: a second reader is a second dependency for no demonstrated fidelity gap. Revisit if streaming for very large files is needed. |

The reader sits behind `open()` in `conversion-engine.ts`; swapping it does not change the API.

## API (`conversion-engine.ts`)

- `inspectWorkbook({name, bytes})` → sheets (used range, rows, columns, leading blank rows, hidden/merged/formula counts, column kinds) + risks. No cell values.
- `convertWorkbook({name, bytes}, options?, onProgress?)` → `ConvertedFile[]` (`fileName, mime, bytes, report`), one per selected sheet. Each output is parsed back and compared cell by cell before the report is returned.
- `verifyConversion({name, bytes}, outputBytes, {sheetName?, ...options})` → re-reads the workbook, verifies an existing file.
- Cancel with `options.signal` (checked before, per 1024 rows, per sheet) → `ConversionError('aborted')`. Everything is in memory, so there are no temp files to clean up.
- Errors are `ConversionError` with `code` (`empty`, `legacy-or-encrypted`, `not-xlsx`, `corrupt`, `zip-bomb`, `too-large`, `invalid_options`, `sheet_selection_required`, `sheet_not_found`, `unsupported_option`, `range_too_large`, `aborted`, …).
- Options: see `types.ts` (`DEFAULT_OPTIONS`: `standard_csv`, `data_region`, `includeHidden`, `stored_value`, BOM on, CRLF, `lossless`, full verification).

## Data contract

| Mode | Output |
|---|---|
| `standard_csv` | RFC 4180, `,`, N fields per record, UTF-8 (+BOM by default), CRLF. `;` is never split. |
| `single_column_csv` | Valid CSV, 1 field per record; the field is a whole inner CSV line. Needs 2 parses to get N fields. One record can span several physical lines when a value holds a newline. Not for SQL/importers. |
| `plain_text_comma` | Byte-identical to `standard_csv`, named `.txt`. |

`stored_value` (only supported policy; `displayed_value` throws `unsupported_option` because number formats are not available):
strings untouched (no trim/normalize/NFC); numbers = the raw text in the file; booleans → `TRUE`/`FALSE`; Excel errors as stored; formulas never evaluated, cached value only; date-formatted numbers stay serial numbers (warning `DATE_AS_SERIAL`).
Ranges: `data_region` = bounding box of non-empty cells (excluded leading rows/columns reported as `DATA_REGION_TRIMMED`); `entire_selected_range` = A1 to the data's bottom-right, or `explicitRange`. Empty rows/cells inside the range are kept in place. Duplicate/blank headers untouched. Multi-sheet workbooks must name the sheets; one file each, safe unique names.

Warnings carry a code, count and first coordinate, never a value. `verified` only when all warnings are informational (`HIDDEN_INCLUDED`, `DATA_REGION_TRIMMED`, `MERGED_CELLS_TOP_LEFT_ONLY`, `WORKBOOK_NOTE`, `EMPTY_RANGE`); otherwise `verified_with_warnings`; sampled verification is `not_verified`; any mismatch is `failed`.
`CSV_FORMULA_INJECTION_RISK`: default is lossless (reported); `excel_view_safe` prefixes `'` and reports `CSV_VALUE_SANITIZED` (output ≠ stored value).

## Tests (run on this machine: macOS, Node 24.21, Apple M4)

`npm run test:app` → 467 tests, 463 pass, 3 fail, all outside this engine and not caused by it: 2 documented in `src/README.md` (missing `docs/research/uiarc-*`), 1 in `lib/server/home-server.test.mjs` (`Refusing symbolic link path: /var`, macOS tmp symlink). The engine file `src/lib/excel-csv/excel-csv.test.mjs`: 25 tests, 24 pass, 1 skipped (`REAL_FIXTURE_NOT_AVAILABLE`). `tsc --noEmit` and `eslint src` clean. Breaking the writer's quoting made 7 tests fail (the tests are not vacuous).

Covered with synthetic data: R18-shaped sheet (5 blank rows, header on row 6, 11,971 rows x 10 fields, `;`, Vietnamese, leading zeros) cell-by-cell against the independent OOXML oracle `ooxml-independent.mjs`; single-column two-level round trip; newlines/quotes/commas/tab/NFC+NFD/emoji; BOM and LF; sparse/empty/duplicate headers; raw numbers, precision risk, serial dates, formulas with/without cache; injection modes; hidden rows; multi-sheet names (`/`, `:`, `CON`, collisions); empty sheet; hashes; tampered/truncated/extra-column/wrong-BOM/lone-surrogate outputs failing verification; sampled mode; invalid/legacy/truncated input; cancellation; progress.

Real R18 file: **not present locally, not searched for → R18 is NOT validated.** Run it with
`EXCEL_CSV_REAL_FIXTURE=/path/R18.20260930.xlsx node --experimental-strip-types --test src/lib/excel-csv/excel-csv.test.mjs`
(expects 11,972 records x 10 fields, compares every cell with the OOXML oracle, checks both modes; prints the report with no values).

Benchmark, synthetic R18-shaped rows x 10 text columns, `standard_csv`, read + convert + verify + hash (single run, includes building the workbook in the same process, so RSS is an upper bound):

| rows | xlsx | csv | total | convert+verify | peak RSS |
|---|---|---|---|---|---|
| 10,000 | 0.5 MB | 1.0 MB | 210 ms | 39 ms | 267 MB |
| 100,000 | 4.6 MB | 10.4 MB | 1.8 s | 303 ms | 827 MB |
| 100,000 `single_column_csv` | 4.6 MB | 11.4 MB | 2.3 s | 828 ms | 1020 MB |

## Known limitations

- Not streaming: workbook, expected matrix and CSV are in memory (reader limits in `limits.ts`: 120 MB file, 12M cells).
- `.xls`, `.xlsb`, encrypted files: rejected, not converted.
- Digits Excel already lost (>15 significant) cannot be recovered; flagged only.
- Formula cache cannot be checked for staleness. Rich text/hyperlinks export as plain text.
- `includeHidden=false` cannot drop hidden columns (throws `unsupported_option`); hidden rows with no value are not seen by the reader.
- The verifier and the writer share the expected matrix from the same reader; the R18 test and the OOXML oracle are the independent check.
- The old `convert.ts` used by the UI skips empty rows and turns dates into text; it is not fidelity-safe and was left alone on purpose. Wiring the UI to this engine is a separate step.
