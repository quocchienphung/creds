# Measured validation — 2026-11-03

Scope: the verified-only local repair MVP on the shared working tree, including Claude's concurrent JSON schema/naming/template changes. No private workbook/JSON was read for validation. Synthetic fixtures only. Results below are completed runs, not projected targets.

## Environment and commands

Windows 11 (`win32 10.0.26200`), AMD Ryzen 7 6800H, 16 logical CPUs, 16,312,721,408 bytes physical RAM. Baseline and benchmark: Node **v24.22.0**, npm initially 11.19.1. Later shells resolved an NVM Node **v24.6.0** / npm 11.5.1; browser QA and the final benchmark explicitly used `C:\Program Files\nodejs\node.exe` v24.22.0. Chrome **156.0.8078.80**, Excel **16.0**, Python 3.12. No production dependency or lockfile was added by this task.

| Check / exact command | Completed result |
|---|---|
| Baseline `npm test` | Exit 1: **606 total, 598 pass, 8 fail**, 6125.5965 ms. |
| Final `npm test` | Exit 1: **629 total, 621 pass, 8 fail**, 8977.8296 ms. Same eight missing-reference-fixture failures; no new failing test. |
| `node --experimental-strip-types --test "src/components/sites/collateral/**/*.test.mjs"` | Exit 0: **129/129**, 1819.6234 ms. |
| `npx eslint src/components/sites/collateral scripts/qa/auto-repair*` | Exit 0, no feature warnings/errors. |
| `npm run lint` | Exit 0, **0 errors, 24 pre-existing warnings**. |
| `npm run typecheck` | Exit 0 on the final repeat; no TypeScript errors. Production build also completed TypeScript checks. |
| `npm run build` | Exit 0, optimized build and worker compiled; all routes generated. |
| `node --experimental-strip-types scripts/qa/auto-repair-browser.mjs http://localhost:3004` | Exit 0, **16/16 real Chrome checks** against the production build. |
| `node --experimental-strip-types scripts/qa/auto-repair-artifacts.mjs` | Exit 0, synthetic original/repaired/formatting files and manifest. |
| `python scripts/qa/auto-repair-independent.py` | Exit 0: **26 XML-part parses, 72 cells compared, 2 patches checked, 7 untouched ZIP entries equal, 1 unchanged formula**. Python zipfile + ElementTree, no application parser import. |
| `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/qa/auto-repair-excel.ps1` | Exit 0: native control, original, repaired and formatting fixtures opened read-only in **Excel 16.0**, all `RepairMode=false`. Macros and link updates disabled. Leading zeros, approved repair, hidden row, text format, filter and formula checked. |
| `node --experimental-strip-types --test src/lib/server/home-server.test.mjs` | Exit 0: **6/6**, including LAN/token/cross-origin guard behavior. |
| `git diff --check` | No whitespace error. Existing LF/CRLF notices do not represent merge conflicts. |

Full logs are local `docs/auto-repair/*.log` (ignored generated files). Machine-readable evidence: [benchmark-results.json](benchmark-results.json), [browser/results.json](browser/results.json), plus screenshots in `browser/`. Generated XLSX artifacts are synthetic and ignored to avoid checking in large binary benchmarks.

The eight full-suite failures are missing files used by `skilled/split-bar`, `skilled/terrain` and `skilled/ui/confirm-morph`: `labels-fit.json`, terrain fixture JSON files and `fit.txt`. Their test locations match baseline. They were neither skipped nor supplied with invented data. Restoring authoritative reference fixtures is outside this Excel task.

## Sequential checkpoints and defects caught during verification

Safety checkpoint: **109/109** targeted tests after explicit archive/privacy/formula/duplicate changes. Reliability: **112/112** after strict XML/ZIP/numeric work. Recovery: **117/117**. Format/flow: **120/120**. Final combined tree: **129/129**, including formatting-only rows, semantic identifier protection, edited-source exclusion and Claude's new JSON gates.

Verification found and corrected: a stale rule-version assertion; a timing-number substring causing a false privacy-test match; non-deterministic fixture ZIP timestamps; incomplete synthetic style definitions that desktop Excel rejected; evidence-budget pressure from indexing irrelevant clean columns; and formatting-only rows being counted as data. The initial duplicate build invocation encountered a Next build lock; its sequential rerun succeeded. A browser harness incorrectly waited for Import after opening another file while the existing Review tab was retained; the harness now waits for actual parsed readiness. An under-load dialog close stability wait was replaced by the real accessible Escape close path for the cancellation check. No validation gate was disabled to obtain a pass.

## Browser and layout evidence

The final 16 checks cover local file opening with **0 automatic uploads**, one-click offline generation of both actual downloads, correct partial status, all-sheet report counts, preserved protected values, atomic Undo/Redo, existing suggestions still mounted, large-worker cancellation, unchanged review history after cancel, **0 page errors** and **0 external requests**.

Desktop suggestion geometry was exactly equal with the new header action shown and hidden: stage **1104 × 320 px**, details **1146 × 742.609375 px**, rail **952.84375 × 58.078125 px** at the measured positions in `browser/results.json`. Review had no document horizontal overflow at **390 px and 320 px**. Gallery/viewer/IssueDetails/IssueTable markup and CSS were not rewritten. This establishes the measured layout checks, not universal pixel identity on all devices.

On the real **50,000-row** browser input, a 10 ms main-thread timer recorded **17 ticks** while the worker ran; early cancellation was acknowledged in **609 ms**, with no download or history commit. This is an early-stage cancellation result, not a bound on synchronous verification latency. Desktop and mobile viewport screenshots are available; physical phones and other browsers were not tested.

## Performance — six actual synthetic cases

Command: `node --experimental-strip-types scripts/qa/auto-repair-benchmark.mjs`. Parent runs each size/mode in a separate Node process with `--expose-gc`. Every case has **40 columns**; large cases account for **2,000,040 cells**, including the header. Both repeated and unique corrupted descriptions are present. Each test has known synthetic ground truth, direct clean same-asset sources for recoverable cases, and intentionally missing sources for unresolved cases.

Times are milliseconds. Repair/export includes indexing, candidates, patching and both verification passes; parse/profile/detect is listed separately. maxRSS is the **whole Node process high-water mark including fixture generation**, not browser-worker heap. Build/browser work also ran on the machine, so these are observed runs under shared load, not a quiet-machine capacity guarantee.

| Data rows | Source mode | Input bytes | Parse/profile/detect | Repair/export | Peak RSS MiB | Applied / corrupted | Unresolved |
|---:|---|---:|---:|---:|---:|---:|---:|
| 100 | repeated | 15,046 | 97 | 191 | 89 | 19 / 21 | 2 |
| 100 | unique | 15,907 | 140 | 281 | 87 | 19 / 21 | 2 |
| 5,000 | repeated | 657,304 | 2,825 | 7,603 | 295 | 910 / 1,090 | 180 |
| 5,000 | unique | 701,454 | 952 | 5,763 | 334 | 910 / 1,090 | 180 |
| 50,000 | repeated | 6,569,669 | 17,567 | 71,554 | 1,341 | 9,091 / 10,909 | 1,818 |
| 50,000 | unique | 7,037,238 | 10,209 | 57,978 | 1,492 | 9,091 / 10,909 | 1,818 |

Large repeated run stages: evidence **2935**, candidates **8286**, patch **19915**, verification **39845** ms. Large unique: **1779 / 5401 / 12819 / 37650** ms. Each emitted **206 measured progress events**. The largest event gap was **39,851 ms** (repeated) / **37,651 ms** (unique), because patch/re-read/package verification remain synchronous within the worker. Early evidence-stage cancellation took **114 / 62 ms** in Node. Cancel may wait through that long stage; the feature does not promise immediate interruption or constant memory.

No speculative UI speedup is included. The large repair/export path took **58.0–71.6 seconds**, plus **10.2–17.6 seconds** for opening/profile/detection, under the measured environment/load.

## Accuracy methodology and denominators

These are **retrieval** results on synthetic known-source data, not an independent production language-model benchmark. The clean same-asset record is deliberately available to the engine for recoverable cells. There is no approved reviewed private real-error holdout. No model auto-apply threshold was calibrated or enabled.

- Large accepted-change precision: **9,091 / 9,091 exact source restorations** in each mode.
- Whole-corrupted-cell exact match / coverage: **9,091 / 10,909 = 83.3349%**. Unresolved: **1,818 / 10,909 = 16.6651%**.
- Character matches over corrupted cells: repeated **270,907 / 272,725 = 99.3334%**; unique **323,034 / 324,852 = 99.4404%**. Most characters were never masked; this high character score must not be described as 99% recovery coverage.
- False-positive corruption on the generated clean cells: **0 / 1,989,131** per large case.
- Protected-field writes: **0**. Every generated patch targeted the expected text description, stayed non-numeric and matched known source text. Runtime cell/package checks found no unexpected changes.
- The smaller source/size cases and all denominators are in `benchmark-results.json`. Generalization is explicitly `not_measured`.

## Risk closure and concrete remaining work

| Priority | Current code location | Result / limit |
|---|---|---|
| P0 | `CollateralProvider.tsx:37`, `queue/ArchiveNotice.tsx` | Automatic original upload removed; explicit server save retained. |
| P0 | `json-session.ts` audit functions, `text.ts:72` | Exported value/file hashes and freeform text removed; insecure file-fingerprint fallback rejected. Internal IDs are not security claims. |
| P0 | `xlsx-patcher.ts:125`, `review.ts` | Formula/protected targets refused; all-cell/style/type checks and untouched-part checks before automatic output/commit. |
| P0 | `json-session.ts` serious/grouping checks, `workbook-coverage.ts` | Actual blockers, secondary/unmapped corruption and conflicting asset values fail closed. Claude's file-name/template gates retained. |
| P1 | `detect.ts:206`, `repair-decision.ts` | Mid-sentence trailing masks remain serious; terminal punctuation ambiguity stays unresolved. No model guess is auto-verified. |
| P1 | `xlsx-reader.ts`, `xml-scan.ts`, `xlsx-zip.ts` | Invalid shared indices/references/XML/CRC/ZIP budgets fail explicitly. Blank-format rows preserve data-row compatibility and accounting. |
| P1 | `json-report.ts` `numberLiteral` | Exact decimal/exponent strings; no business rounding invented. Excel itself may display numbers with its normal precision limits; XML lexical values are preserved. |
| P1 remaining | `auto-repair.ts` / ZIP / patch / verification | Whole-sheet memory and long synchronous checkpoint gaps are measured limitations. Future cooperative/chunked verification should reduce them. |
| Existing deployment boundary | `src/lib/server/api-guard.ts` | Empty token permits LAN/private-host access without user authentication. Explicit Queue users retain that policy; global authentication redesign is outside this task. |
| P2 research | Recovery model/corpus | Broader n-grams, approved corpus import and calibrated model auto-apply require a genuinely source-disjoint reviewed gold set. |
| Outside supplied evidence | Private inputs / full app | No accuracy claim for private workbooks, all OOXML extensions, physical devices or formal whole-app security certification. |

The MVP is functional and verified within those boundaries. The full repository suite is **not** claimed to be green, and ambiguous/missing-source data is **not** claimed repaired.
