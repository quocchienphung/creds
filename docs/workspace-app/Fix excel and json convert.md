# MASTER PROMPT — CREDIT / EXCEL REPAIR → JSON TRANSFORMATION

> Paste this entire prompt into Claude Code **at the root of the EXISTING project**. Do not start a new application. Respond to the user in Vietnamese, but use English for consistent code identifiers and technical documentation where appropriate.

## ROLE / MISSION

You are a principal full-stack engineer, data engineer, QA architect, and security-conscious banking software engineer. Work inside the **existing** web application, currently accessible in local development at:

`http://localhost:3000/personalize?section=credit`

**Primary goal:** Add a production-quality, privacy-first workflow within the existing Credit section:

**Import Excel → Identify data/character errors → Interactive human repair → Generate corrected Excel → Map nested banking JSON → Validate/reconcile → Export JSON + audit report.**

This is a feature integration, **not** a new website or a standalone Electron application. Do not redesign the overall app. Inspect and reuse the existing layouts, tokens, navigation, forms, panels, tables, status feedback, file-upload components, loading patterns, drawers, dialogs, keyboard shortcuts, and state conventions already used by other sections.

### Business constraints

- The text is commonly **Vietnamese without diacritics**. Do **not** add diacritics. Do **not** use generative AI to invent missing Vietnamese letters.
- Some input files contain a literal `?` inside words, replacement characters `�`, mojibake, invisible Unicode, malformed strings, or legacy encodings. A literal `?` can also be legitimate in certain contexts. Detection must be contextual and field-aware.
- In particular, `MOTABDS` describes secured assets. In the reference workbook, `MOTABDS` is column AK and `MOTABD` is column V; the sample showed matching contents. For different workbook versions, confirm headings dynamically and flag conflicting values rather than assuming they are identical.
- `MOTABDS` must map to `TS013` in the referenced target JSON. It can describe *any* collateral (real estate, machinery, vehicles, inventory, deposits, etc.), not just real estate, regardless of its naming.
- Exported JSON must follow the **actual provided reference JSON schema and grouping logic**, not a flattened row-by-row conversion.
- **The Excel repair/review stage must be completed BEFORE normal JSON export is enabled.** A separate clearly labeled diagnostic JSON preview may be supported, but must never be confused with an approved final export.

## REQUIRED INPUTS — MUST INSPECT, NEVER LEAK

Ask the file system to locate the two reference assets in the currently available local workspace; do not assume their paths:

- `MAU9_20260930 ok.xlsx` — sample Excel input.
- `D4030420260930.001.json` — example of expected output structure.

If not present, build schema-driven code plus synthetic tests and report exactly what cannot be verified. Do not invent reference contents.

**The files may contain confidential bank/client information.** Absolutely never commit or push them, paste raw client rows into chat, print personally identifiable information in logs/test snapshots, send them to cloud services, analytics, LLM endpoints, error telemetry, GitHub, or external tools. Configure `.gitignore` for sensitive fixtures. Generate fabricated fixtures with structure-equivalent fake data. Do not use these sensitive files to populate demo screenshots. Do not alter originals.

Inspect reference JSON as **raw bytes first**: the provided exemplar has been observed to contain bytes not valid as strict UTF-8, so it cannot automatically be treated as a correctly encoded UTF-8 text file. Identify and document input encoding and decoding uncertainty. Never replace undecodable bytes silently or claim a specific legacy encoding without evidence. Treat the reference as an oracle for hierarchy, keys, and type patterns, **not** as infallible clean text. All newly exported JSON must be valid UTF-8.

## NON-NEGOTIABLE ENGINEERING GUARDRAILS

1. First inspect the real project: `package.json`, lockfile, framework/router, TypeScript configuration, UI library, styling, existing Credit section, hooks, state, local backend/API routes, tests, permission/auth patterns, file handling, and existing utilities. Do not assume Next.js, React, Node, or Prisma until verified. Prefer the project's existing compatible stack.
2. Preserve `?section=credit`, other section links, state, CSS conventions, auth, and existing behavior. Avoid introducing a second competing design system or a new top-level route without need.
3. **Offline-first/private data handling**. If the app is truly local and backend executes on the same device, a local-only Node service is an option. If the backend is remote, process confidential Excel entirely client-side via Web Workers; do not upload files to remote APIs. Never assume `localhost:3000` in development guarantees local-only production behavior. Document and test data flow.
4. Use immutable original data plus a patch/override layer. Nothing overwrites the original spreadsheet until the user explicitly exports a corrected copy. Avoid unreviewed automatic modifications.
5. Never autocorrect a word by guessing based on context. Suggestions are separate from accepted values. An AI guess does not provide proof of the original. Any rule-based automatic normalization must be narrow, reversible, deterministic, disclosed, and separately approved.
6. Preserve leading zeros in string IDs, exact identifiers, dates in contractual formats, precision/scale of monetary values, `0` vs `""` vs `null`, arrays, record order when significant, and optional blank fields. Do not let Excel type coercion corrupt identifiers.
7. All issues must include source provenance: file fingerprint, sheet, Excel row, Excel column/letter, header name, original value fingerprint, type, severity, reason, suggested action, and review status.
8. Use clear security boundaries around external code. Only install vetted libraries with compatible licenses, documented versions, and reproducible lockfile. Do not wholesale-copy unknown GitHub repo code or violate its license.
9. Keep expensive scans and rendering off the main UI thread when feasible; show progress and cancellation; ensure the app remains responsive for the provided workbook scale (approximately 45k rows, 11MB input), and aim above it.
10. Fail closed on unresolved critical schema problems. Do not fabricate or silently drop records to make counts pass.

## PHASE 0 — REPOSITORY RECONNAISSANCE (DO THIS FIRST)

Locate relevant source files for `/personalize?section=credit`. Discover how query params select sections and where components in nearby sections are built. Produce:

- `docs/credit-excel/00-current-architecture.md`: existing stack, component inventory, Credit page entry, state management, data security model, proposed insertion point, files expected to be edited.
- A concise **reuse matrix** of existing UI components: `Upload/Dropzone`, `Tabs/Stepper`, `DataGrid/Table`, `Drawer/Modal`, `Badge/Status`, `Progress`, `Toast`, `ConfirmDialog`, `Download`, and if not available, the smallest compatible alternative.
- `docs/credit-excel/00-non-regression.md`: critical routes and existing features that must remain intact.

Do not start major implementation until you have understood the project. If source architecture differs from assumptions, adapt this prompt to the real codebase and state the reason.

## PHASE 1 — RESEARCH & REVERSE-ENGINEER *PERMITTED* OPEN-SOURCE BUILDING BLOCKS

Research these candidates using GitHub README, implementation modules, documentation, releases, issues, licensing, and installed dependency compatibility:

1. **ExcelJS** — https://github.com/exceljs/exceljs — XLSX reading, worksheets, cells, Excel writing, Node streaming where feasible.
2. **AG Grid Community** — https://github.com/ag-grid/ag-grid — performant, editable, searchable issue/row grid, only if the existing table components are insufficient. Do not silently add AG Grid Enterprise.
3. **Ajv** — https://github.com/ajv-validator/ajv — schema validation for nested JSON.
4. **iconv-lite** — https://github.com/pillarjs/iconv-lite — optional legacy input text decoding when positively indicated by evidence. Do not use it to claim recovery of already-lost `?` characters.
5. **SheetJS Community Edition** — https://github.com/SheetJS/sheetjs — optional comparison for parsing/performance/format support; verify actual upstream source/release provenance and license rather than blindly treating a GitHub mirror as the latest distribution.

Do NOT pull dependencies merely because they are popular. Evaluate actual bundle size, maintenance/release state, license, CVEs/advisories, client-vs-server capabilities, performance, formula/merged-cell behaviors, memory use, and compatibility. Favor reuse of compatible existing packages. If the project already has a good grid, retain it.

When possible, inspect selected libraries' **documented algorithms and API behavior** and write an internal adapter around them. You may clone open-source repositories into a temporary ignored research directory if tooling/network permits; do not copy unneeded repository trees into the application. Record repo URL, inspected commit/tag, license, rationale, alternatives, and tested API in `docs/credit-excel/01-github-evaluation.md`.

Deliverable: a decision matrix identifying **selected vs rejected vs optional**, with concrete reasons. Then implement, do not stop at research.

## PHASE 2 — EXCEL INGESTION + PROFILE DETECTION

Build the smallest independent import adapter, following the existing app architecture:

- Validate extension, file signature, size, workbook validity, sheet/header presence, unsupported encryption/passwords, formula handling, hidden rows/columns, merged cells, empty rows, and possible corrupt/huge ZIP bomb risks.
- Detect sheet names, exact header names, effective header row, data types, expected mapped columns, available metadata, repeated headers, multiple workbook variants, duplicates, nulls, formulas, leading zeros, and potential inconsistent field formatting.
- Keep source cell types as well as faithfully rendered text; store original row index and column coordinates. Do not silently turn dates/IDs into JavaScript numbers.
- Define a versioned `WorkbookProfile` and an **explicit editable mapping profile** (`column -> semantic field -> JSON field -> transform`) that can support additional Excel templates in the future.
- Show schema discovery preview and ask the user to confirm or resolve ambiguous mappings. Auto-map only high-confidence exact matches; never choose blindly among ambiguous columns.
- For large XLSX files use worker / background thread / streaming appropriately to the verified runtime. Support progress, error handling, cancel, and paginated/virtualized presentation.

Reference-specific initial hints (verify against actual headers, never hardcode without validation):

| Excel column name | Target path / role |
| --- | --- |
| `MACNTCTD` | `CNTCTD[].TTC01` |
| `MAKH` | `CNTCTD[].KHACHHANG[].TTC03` |
| `MASOBD` | `THONGTINBD[].TS001` |
| `MALOAIBD` | `THONGTINBD[].TS002` |
| `GIATRI` | `THONGTINBD[].TS005` |
| `DSSOHD` | `THONGTINBD[].TS009[]` (requires source-specific list parsing) |
| `MOTABDS` | `THONGTINBD[].TS013` |
| `MOTABD` | a second description source for comparison/fallback, subject to an explicit rule |

All other mappings, especially KB/TTC/TS ownership and date/amount fields, **must be inferred and verified from workbook headers and reference schema**. Do not invent undocumented business-field meaning.

## PHASE 3 — DETERMINISTIC DATA-QUALITY DETECTION

Design a reusable `IssueDetector` with pluggable rule sets and **field-aware policy**; source of truth is always original Excel or reviewed patch:

- `QUESTION_MARK_IN_WORD`: `?` replacing an expected letter, e.g. *synthetic* `Ke ho?ch trien khai` — critical/high unless explicitly excepted.
- `UNICODE_REPLACEMENT`: U+FFFD `�` — critical/high.
- `ENCODING_MOJIBAKE`: suspicious sequences (`Ã`, `Ä`, `á»`, etc.) — warning/high based on clear signature; do not propose irreversible fixes without validation.
- `INVISIBLE_OR_CONTROL`: zero-width characters, unexpected non-printables, null/control characters — warning/high; explain exact code point.
- `DIACRITIC_POLICY`: valid Vietnamese accented text may violate the **no-diacritic export policy**, but is **not** itself corrupted. Policy-specific warning, not automatically a data-loss error. Avoid changing names/company identifiers without approval.
- `DESCRIPTION_CONFLICT`: `MOTABD` != `MOTABDS` after **lossless** comparison; present both source values.
- `INVALID_CODE_OR_DATE`, `MISSING_REQUIRED`, `CONFLICTING_DUPLICATE`, `ARRAY_PARSE_AMBIGUOUS`, `UNKNOWN_COLUMN`, `TYPE_MISMATCH`, `FORMULA_UNRESOLVED` — independent profile/contract checks.

Avoid naive `[^a-zA-Z0-9]` rules. Valid field-specific punctuation can include `-`, `/`, `.`, `:`, `(`, `)`, `,`, `%`, `&`, `+`, units, and abbreviations. Question marks may be valid in explicit questions/notes, URLs, and text fields. Show low-confidence findings as **review**, not definitive errors. Do not mark `0`, empty strings, or `KHONGGAN` as corrupt without a business rule.

For each issue produce a stable ID and this typed data model (adjust to project conventions):

```
type Issue = {
  id: string;
  fileHash: string;
  sheet: string;
  row: number;
  column: string;
  field: string;
  category: string;
  severity: 'critical'|'high'|'medium'|'low';
  originalValueFingerprint: string;
  originalValue: string; // ONLY in authorized local UI state
  proposedValue?: string;
  correctedValue?: string;
  reason: string;
  status: 'open'|'edited'|'verified'|'accepted_exception';
  reviewedBy?: string;
  reviewedAt?: string;
  ruleVersion: string;
};
```

Do not expose actual `originalValue` to telemetry or general debug logs. Detection must be deterministic/testable; suggestions are not accepted data.

## PHASE 4 — REVIEW & REPAIR UI, REUSING EXISTING DESIGN

Add this as a sub-view/tab/subsection **inside Credit**, not a new homepage. Prefer UI patterns borrowed from other existing sections rather than designing new concepts. Suggested compact flow:

1. **Nhập dữ liệu**: drag/drop/select XLSX, file metadata, profile, scan progress.
2. **Tổng quan lỗi**: sheet counts, affected records, category/severity summaries, search/filter by column/rule; no raw PII in aggregated dashboard.
3. **Rà soát & chỉnh sửa**: editable virtualized table with `Sheet / Row / Cell / Field / Original / Reason / Suggested / New / Status`. Compare `MOTABD` vs `MOTABDS` side-by-side, mark changed substrings and invisible characters, show nearby context only to authorized local user.
4. **Kiểm tra mapping**: grouped preview of branch > customer > collateral; highlight unmapped/ambiguous fields.
5. **Xuất dữ liệu**: corrected XLSX, JSON, audit report, validity and reconciliation summary.

Mandatory human actions:

- Edit and approve individual values.
- Reject proposed fixes without discarding the original.
- `Accept as-is / legitimate exception` with reason, scoped to the specific issue and recorded in audit.
- Undo/redo edits and display old/new diff.
- Bulk actions ONLY for proven deterministic transforms with a preview and explicit confirmation; never bulk-guess `?` replacements.
- Re-run validation for changed values, keeping review status synchronized; reject a supposedly corrected value if critical anomalies remain.
- Preserve pending review state while navigating tabs; durable persistence of sensitive contents is opt-in, local-only, and carefully protected. Prefer memory-only state by default.

Mandatory UX: visible states for loading/scanning/no issues/review needed/all approved/export ready/failure; keyboard accessible; responsiveness consistent with existing components; no new visual brand. Avoid dumping 45k raw rows into DOM at once.

## PHASE 5 — EXPORT A CORRECTED EXCEL FILE FIRST

Generate `originalname.reviewed.xlsx` *only after user action*; preserve original workbook separately. Preserve unrelated sheets/columns/cell formats/formulas/merged ranges when possible; apply only approved patch values to their exact original cell locations. Any unavoidable fidelity limitation must be shown before export. Provide a summary of changed cells and verify exported file roundtrips to expected values. Never rewrite all cells through a naive JSON conversion just to patch a handful of strings.

Only the approved in-memory patch layer feeds downstream JSON conversion. Corrected XLSX download is a distinct step from JSON download; the user can retain both.

## PHASE 6 — GROUPED BANKING JSON TRANSFORMER (STRICT)

Target JSON shape is derived from the provided exemplar; keep required root fields and nesting **exactly** as agreed by the data contract:

```
{
  "KB001": "YYYYMMDD",
  "KB002": "<authorized-runtime-metadata>",
  "KB003": "<authorized-runtime-metadata>",
  "KB004": "<authorized-runtime-metadata>",
  "CNTCTD": [
    {
      "TTC01": "<branch-code-as-string>",
      "TTC02": "<branch-name>",
      "KHACHHANG": [
        {
          "TTC03": "<customer-code-as-string>",
          "TTC04": "<customer-name>",
          "THONGTINBD": [
            {
              "TS001": "<asset-id-as-string>",
              "TS002": "<asset-type-code-as-string>",
              "TS003": "YYYYMMDD",
              "TS004": "",
              "TS005": 0,
              "TS006": 0,
              "TS007": "YYYYMMDD",
              "TS008": 0,
              "TS013": "<reviewed-MOTABDS>",
              "TS009": ["<contract-id>"],
              "TS010": [],
              "TS011": [],
              "TS012": [{"TS0121":"<owner>","TS0122":"<id-or-empty>","TS0123":"<tax-code-or-empty>"}],
              "TS014": [],
              "TS015": [],
              "TS016": []
            }
          ]
        }
      ]
    }
  ]
}
```

The placeholders are **illustrative** and never valid production substitutions. Do not add internal review metadata into the contractual JSON structure. Keep provenance/audit in a separate report.

### Mandatory grouping and transformation rules

- Discover and document true grouping keys and source relationships using sample Excel **and** sample JSON. Expected hierarchy is `CNTCTD[]` (branch) → `KHACHHANG[]` (customer) → `THONGTINBD[]` (asset), but do not assume only one row per asset.
- Repeated Excel rows may represent related contracts or owners for **one asset**. Determine when/how to aggregate without losing distinctions. Do not use row count as asset count.
- Asset identity must be assessed within appropriate branch+customer scope, not just globally by `MASOBD` unless justified.
- `DSSOHD` → `TS009[]`: preserve contract IDs as strings (with leading zeros and embedded slashes), parse only verified list delimiters, merge values across rows when appropriate, de-duplicate only under a clearly documented business rule while preserving stable order. **Never split on `/` solely because it occurs in an ID.**
- `TS012[]`: reconstruct ownership list from verified owner-related Excel columns; preserve owner identity and distinct owners; no guessing missing national IDs or tax IDs.
- Preserve other `TS009...TS016` empty array fields when required by the schema; do not invent zero values or blanks where the data contract requires `null`/omission.
- Root `KB001..KB004` metadata must come from validated workbook metadata, user-authorized input, or documented system configuration, never silently copied from an old file for a new reporting period.
- Ensure all output JSON bytes are **UTF-8**; run strict UTF-8 and JSON parsing checks after export. Do not reproduce legacy/invalid reference encoding.

Build an explicit `MappingProfile` (with version, source header, target field, type, transform, conflict policy, aggregation key, requiredness, and documentation), one `Transformer`, and a separate `Validator`. Separate data conversion from presentation. Never hide business logic inside React components.

## PHASE 7 — JSON SCHEMA, RECONCILIATION, AND AUDIT

Use Ajv or the existing equivalent validator to verify the actual nested contract. Create schema source under `src/.../schemas/` or an existing established location. All key names/types/requiredness must be checked against the real exemplar, not just the illustrative sketch.

Before enabling final JSON download, verify:

- No critical/high unreviewed issue in a field covered by the export blocking policy. Explicitly accepted exceptions remain visible in the report.
- Mapping profile is approved; no silently unmapped required fields.
- All JSON keys, types, required fields, arrays, date strings, and numbers satisfy the schema.
- Total source rows, distinct branches/customers/assets, related contracts, ownership items, unmatched rows, and grouped record counts are reconciled; explain *why* row and asset counts differ. Report duplicates/conflicts rather than silently dropping them.
- `TS013` equals **approved repaired text**, not stale source text. Sample/check all modified records and spot-check unchanged ones.
- Strict UTF-8 encode/decode roundtrip and JSON.parse succeed.
- Deterministic replay: same input + mapping version + review patches = byte-equivalent output (ignoring independently controlled metadata such as generated-at timestamp, which should live in audit, not target JSON).

Output separate user-downloadable files:

1. `source.reviewed.xlsx` — corrected copy (if selected).
2. `reporting-output.json` — **contractual** JSON only; no internal review keys.
3. `validation-audit.json` — issue status and reconciliation metadata, minimized/masked for sensitive content by default. Allow an explicitly authorized richer local export only if business policy permits.
4. Optional local downloadable `validation-report.csv` with masked values.

## PHASE 8 — SECURITY, TESTS, PERFORMANCE & INTEGRATION

### Tests — synthetic data first

Unit and integration tests must cover:

- `Ke ho?ch` / `T?i s?n` inside descriptions, `�`, mojibake, hidden Unicode, legitimately used `?`, ASCII and no-diacritic policy, valid punctuation and codes.
- Detect `MOTABDS` mismatch with `MOTABD` and require human resolution.
- Multiple branch/customer/asset groupings, repeated rows for one asset, contract IDs containing `/`, duplicate contracts, two distinct owners, empty optional arrays.
- Leading-zero customer codes, date strings `YYYYMMDD`, decimal values/zero/empty/null, precision issues, header order variation, missing headers, duplicate headers, different Excel profiles.
- Human edit → re-scan → approved patches → XLSX roundtrip → JSON mapping; no original mutation.
- Blocking export when critical findings unresolved; confirmed exception behavior; cancel scan; import errors.
- JSON legacy encoding handling only as input, always clean strict UTF-8 output.
- Performance benchmark using synthetic realistic workbooks >= ~45k rows, confirm responsiveness and memory consumption rather than asserting unmeasured results.
- Non-regression smoke tests for `/personalize?section=credit` and the app's adjacent sections, navigation, auth and styling.

### Sensitive reference comparison

When reference files are available locally and allowed, run **read-only** structural/semantic comparisons, without exposing PII in terminal output. Compare grouping counts, key presence/types, and source-to-target mappings. Report counts and anonymized hashes/row coordinates, not client names or source text. Since reference JSON has legacy encoding uncertainty and may contain unrepaired text, a perfect raw-byte comparison is NOT the goal. Investigate discrepancy classes rather than forcing matching output by changing correct values.

### Security acceptance

No network exfiltration, no third-party AI, no accidental automatic remote upload, no raw PII in git logs/console/telemetry, no persistent storage by default, no new dangerous file execution, no spreadsheet macro execution, secure export, safe rendering of untrusted cell values (never treat as HTML).

## REQUIRED DOCUMENTATION / FILE LAYOUT (ADAPT TO REAL REPO)

Within existing source conventions, use a feature boundary similar to:

```
src/features/credit/excel-pipeline/
  engine/importWorkbook.ts
  engine/detectIssues.ts
  engine/reviewPatches.ts
  engine/exportWorkbook.ts
  engine/mappingProfiles.ts
  engine/groupToJson.ts
  engine/reconcile.ts
  engine/validateJson.ts
  types.ts
  components/...
  tests/...
docs/credit-excel/
  00-current-architecture.md
  01-github-evaluation.md
  02-workbook-and-json-contract.md
  03-detection-rules.md
  04-mapping-and-grouping.md
  05-review-security-policy.md
  06-test-and-reconciliation-results.md
  07-operating-guide.md
  IMPLEMENTATION_CHECKLIST.md
```

Treat this as a proposed architecture only; reuse the actual project's naming/layout. All docs and tests must be safe to commit with **synthetic** data.

## EXECUTION CHECKPOINTS / WORK ORDER

Proceed sequentially with short, independently verifiable milestones:

- **Gate A — Audit:** understand app, identify Credit integration point, security/data flow, select/reject repos, document contract. No layout rewrite.
- **Gate B — Excel inspection:** import, profile, header mapping, progress, synthetic tests.
- **Gate C — Detection:** deterministic rules, per-cell issue report, false-positive review tests.
- **Gate D — Human repair:** grid, filters, edit/approve/exception, undo/redo, patch persistence policy; corrected XLSX.
- **Gate E — JSON mapping:** nested grouping, TS013 mapping, contracts/owners arrays, schema.
- **Gate F — Validation:** reconciliations, UTF-8, export gating, audit file.
- **Gate G — Integration/QA:** complete local UI walkthrough, performance, regression, security checks, documents.

For each gate, update `IMPLEMENTATION_CHECKLIST.md` with: changed files, completed features, test commands/results, unresolved uncertainties, next action. Implement in small commits/patches when repo workflow allows. If business rules cannot be deduced from sample, **surface them as explicit unresolved mapping decisions and design a review UI**, not fabricated assumptions. Do not stop at a pretty UI without functioning parsing, repair, JSON conversion, and tests.

## DEFINITION OF DONE

A user can open the existing Credit section, upload an approved Excel workbook, view detected anomalies with precise cell references, see both description columns when relevant, manually repair or explicitly except each issue, download corrected XLSX, preview verified grouped JSON in the same hierarchy as the reference, review reconciliation and schema results, and download a valid **UTF-8** JSON file plus an audit report, while the original file and all other site sections remain unaffected.

**Final message to user (in Vietnamese):** list modified integration points/files, selected GitHub libraries and versions/licenses, how to run, how to test, exact tests passed/failed, how privacy is enforced, sample data limitations, and all unresolved business rules. Never claim success for unexecuted tests. Do not include any real client rows or identifying values in that message.

**START NOW: Inspect the existing repo first and implement Gate A. Then proceed gate by gate without asking redundant questions; only request a business decision when no defensible mapping rule can be established.**
