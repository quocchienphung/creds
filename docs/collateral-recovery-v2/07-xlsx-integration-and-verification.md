# 07 · XLSX integration and verification

## Infrastructure
Unchanged: fflate reader/patcher, per-cell patches, copy-on-write shared strings, review history. New code only decides the text of a patch.

## Independent verification
* `independent-xlsx-dump.py` (existing) and new `independent-ooxml-check.py`: Python stdlib (`zipfile`, `ElementTree`, `hashlib`), no code shared with the app.
* `scripts/collateral/verify-output.mjs before.xlsx after.xlsx` proves: zip integrity; same sheets, order, state, workbook relationships; every differing cell held a `?` before, has no formula, did not become a number; every other cell identical; every package part other than the sheets and shared strings byte-identical. No python → `verification_degraded`, exit 2; the app's own re-read is never called independent.
* Tests call the Python reader and **fail** when it is missing (`ALLOW_NO_PYTHON=1` accepts degraded runs explicitly).
* Result on the sample (`docs/collateral-recovery-v2/sample/`, 3 sheets, one headerless, SYNTHETIC): SAFE 86 changed cells, FORCE 90, both `verified_independent`, 0 problems, 0 unexpected changes. Hidden-sheet, headerless, shared-string, formula and proper-name cases are in `collateral/collateral.test.mjs`.
* **Not tested**: Excel desktop / LibreOffice, rich-text cells (not producible by the test builder; the reader treats them as protected), a browser run of the UI.

## Performance (SYNTHETIC, Node, this machine; a browser worker was not measured)
| rows | file | open | repair total | of which candidates / verify | peak RSS | changed cells |
|---|---|---|---|---|---|---|
| 120,000 | 3.9 MB | 1.0 s | 18.7 s | – | 1.3 GB | 23,800 |
| 220,000 | 7.1 MB | 1.9 s | 35.8 s | 13.5 s / 14.1 s | 2.1 GB | 43,634 |

Collateral decoding is ~0.8 ms per damaged cell (benchmark); most time is the existing candidate scan and re-read verification. Above 250,000 clean records the existing evidence budget aborts with an explicit error (330,000 rows reproduced it): a pre-existing limit, not changed. The reported 11 MB / 61 s baseline could not be reproduced for lack of the file. No LRU or batching was added: no measured need.
