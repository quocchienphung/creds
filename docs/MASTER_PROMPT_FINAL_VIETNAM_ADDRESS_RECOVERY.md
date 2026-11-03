# MASTER PROMPT --- UNIVERSAL VIETNAM ADDRESS & PLACE-NAME RECOVERY ENGINE

## Integrated local Excel Auto-Repair \| Free offline geographic knowledge \| Accent-aware inference \| Mandatory no-`?` completion for classified Vietnamese address spans

------------------------------------------------------------------------

# 0. Executive objective

You are working inside an existing TypeScript-based Excel repair
application.

Your task is to deeply inspect, refactor and extend that application
into a **Universal Vietnam Address & Place-Name Recovery Engine**.

The primary data problem is that Vietnamese address and location text
contains `?` characters where original letters were lost or corrupted.
The user needs the final Excel output in **Vietnamese without
diacritics**.

The user is willing to accept that some low-confidence guesses may be
wrong, provided the engine does not leave corruption placeholders behind
in the address spans it has classified for repair.

The application must therefore do more than detect errors or show
suggestions. It must:

1.  Import an arbitrary supported `.xlsx` workbook.
2.  Discover and scan every worksheet.
3.  Identify text cells and spans that appear to contain Vietnamese
    addresses, locations, place names or related property-location
    descriptions.
4.  Identify `?` characters that represent corrupted/missing letters.
5.  Use free, downloadable, local Vietnam geographic knowledge to
    retrieve candidate names.
6.  Infer likely missing text even when the exact full name is not found
    in the knowledge base.
7.  Reason internally using full Vietnamese Unicode with diacritics.
8.  Rank complete phrase/address candidates using linguistic,
    geographic, historical and workbook-context evidence.
9.  Automatically apply the best candidate under the selected repair
    policy.
10. Convert the selected accented Vietnamese reconstruction to
    Vietnamese ASCII/no-diacritic text.
11. Patch the actual target Excel cells.
12. Reopen the exported workbook and independently verify the actual
    cell values.
13. In `FORCE_NO_QUESTION_MARK` mode, leave no corruption placeholder
    `?` in any classified Vietnamese address span.
14. Report forced guesses and lossy fallbacks honestly; never claim they
    are verified facts.

The user does NOT want: - Google Maps API. - Google Places API. - Any
paid geocoding API. - API keys. - Per-request charges. - Cloud AI. -
Runtime internet requests. - Uploading workbooks to external services. -
A scan-only or suggestion-only tool. - A repair system that works only
on MAU9. - A hard-coded dictionary of individual replacement words. - An
implementation that merely changes ZIP size without changing actual cell
values.

**This document supersedes all previous Auto-Repair, Zero-Patch,
Universal Excel Repair and Vietnam Address Recovery prompts. Use this as
the single primary implementation specification.**

Do not stop after planning. Inspect the real repository, reproduce
failures, implement the feature, run tests and verify actual exported
workbooks.

------------------------------------------------------------------------

# 1. Non-negotiable product constraints

## 1.1 Free and offline

The normal repair workflow must work completely offline after local
datasets have been installed.

Do not implement or call: - Google Maps API. - Google Places API. -
Google Geocoding API. - Paid or metered geocoding services. - Cloud LLM
APIs. - Remote embedding APIs. - Public Nominatim bulk geocoding. - Any
third-party API that charges per request.

Do not scrape Google Maps or commercial map websites.

A deliberate one-time dataset setup/update may download public datasets.
Normal Excel import, scan, prediction, repair and export must not
require internet.

If a source cannot be downloaded automatically, support manual dataset
import. Do not silently substitute a paid service.

## 1.2 No hard-coded replacement dictionary

Do not implement code such as: - `D?c Hoa` always becomes `Duc Hoa`. -
`Nguyen V?n Linh` always becomes `Nguyen Van Linh`. - `Can h?` always
becomes `Can ho`.

Examples in this prompt are regression examples, not a replacement
dictionary.

The engine must retrieve candidates from data and infer from evidence.
Rules may describe character handling, address structure, Vietnamese
orthography, scoring and safety. They must not hard-code the answer to
individual corrupted words.

## 1.3 Preserve the current application

First inspect the actual codebase. Keep the existing architecture
wherever it is sound: - TypeScript. - Existing Web Worker design. -
`fflate` ZIP/XLSX parsing and patching. - Existing Zod validation. -
Existing patch/review/progress logic. - Existing UI and workflow.

Do not add ExcelJS, SheetJS, AG Grid, Ajv or other spreadsheet libraries
to production unless a demonstrated technical blocker makes it
unavoidable and the user approves the dependency change.

Do not rewrite the entire application merely to make the architecture
look cleaner.

## 1.4 Separate generic Excel repair from MAU9

The generic Excel Auto-Repair feature must not depend on: -
`MAU9_PROFILE`. - MAU9 headers. - `TS001...TS016`. - `KB001...KB004`. -
JSON mapping. - JSON grouping. - Any particular workbook name or
worksheet name.

MAU9-to-JSON conversion remains a separate optional downstream workflow.
An unknown workbook must still be scanned, repaired and exported as
Excel.

## 1.5 Output convention

The user's final address output is Vietnamese without diacritics.

Use full accented Vietnamese internally for inference, then convert the
selected result to ASCII only after candidate selection.

Do not remove diacritics before inference. Doing so throws away valuable
linguistic and geographic evidence.

------------------------------------------------------------------------

# 2. First task: deep repository audit and reproduction

Before modifying code, inspect the real repository and trace the current
runtime.

Find the real equivalents of:

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
-   Upload, scan, repair, export and download components
-   Existing dataset/configuration modules
-   Existing tests, fixtures and build scripts

Trace the complete path:

`Import → ZIP parse → workbook relationships → worksheet discovery → cell extraction → suspicious ? detection → address-span classification → geographic candidate retrieval → candidate generation → candidate ranking → policy decision → accented reconstruction → ASCII conversion → patch creation → XML patching → XLSX export → output reopen → independent cell verification`

For every stage identify: - Actual function/module. - Input and output
types. - Whether it is profile-dependent. - Error handling. - Whether it
can silently skip a worksheet or cell. - Whether the UI can incorrectly
display an unscanned sheet as clean.

Reproduce at least: 1. A workbook that previously worked only because it
resembled MAU9. 2. A workbook with different sheet names and headers. 3.
A workbook with corruption on the second or later worksheet. 4. A
workbook containing Vietnamese place names with multiple `?` characters.
5. A workbook where a candidate is generated but never reaches the
patcher. 6. A workbook that exports a ZIP but has no actual cell
changes.

Use the previous observed examples as regression seeds when the original
fixture files are available:

-   `Can h? chung cu` --- likely intended accented phrase
    `Căn hộ chung cư`; final ASCII `Can ho chung cu`.
-   `NHA ? H?NH THANH TRONG TUONG LAI` --- investigate the complete
    phrase using language/context evidence; a plausible accented
    reconstruction is `NHÀ Ở HÌNH THÀNH TRONG TƯƠNG LAI`, with final
    ASCII `NHA O HINH THANH TRONG TUONG LAI`.
-   `Can h? chung cu V? D?nh s? 2.21` --- do not hard-code a guess for
    `V? D?nh`; retrieve candidates and preserve a `forced_guess` status
    if evidence is weak.
-   `QSD dat tai thua so: 63, TBD so: 8-1, KV.5, TT.D?c Hoa...` ---
    preserve all numeric/property anchors and investigate the geographic
    component.

Do not assume the earlier audit is still accurate. Verify the current
code and current behavior.

Create a concise root-cause report, but continue with implementation.

------------------------------------------------------------------------

# 3. Target architecture

Build a specialized geographic recovery subsystem integrated into the
existing repair pipeline.

Suggested logical modules; adapt to existing naming and avoid duplicate
modules:

-   `vn-address-classifier.ts`
-   `vn-address-span-detector.ts`
-   `vn-text-normalizer.ts`
-   `vn-accent-restoration.ts`
-   `vn-ascii-transliterator.ts`
-   `vn-address-parser.ts`
-   `vn-admin-gazetteer.ts`
-   `vn-admin-history.ts`
-   `vn-place-index.ts`
-   `vn-address-candidate-retriever.ts`
-   `vn-address-candidate-generator.ts`
-   `vn-address-ranker.ts`
-   `vn-geographic-validator.ts`
-   `vn-address-repair-policy.ts`
-   `vn-address-audit.ts`
-   `dataset-manifest.ts`
-   `dataset-importer.ts`
-   `dataset-index-builder.ts`

Keep responsibilities separate:

### A. Workbook layer

-   Discovers every worksheet.
-   Reads cells and their actual OOXML storage types.
-   Preserves original values.
-   Provides exact sheet/cell coordinates.
-   Does not need MAU9.

### B. Address classification layer

-   Determines whether a cell or text span is address/location-related.
-   Can use unknown headers and content evidence.
-   Does not assume every text containing `?` is an address.

### C. Geographic knowledge layer

-   Searches official administrative units, historical aliases, streets,
    named places and validated local address records.
-   Preserves source/version/license metadata.
-   Works offline.

### D. Inference layer

-   Generates accented candidates.
-   Uses character, word, phrase and geographic context.
-   Ranks complete phrases, not isolated characters only.
-   Can infer plausible words even when the exact full string is not
    found in the gazetteer.

### E. Policy layer

-   Decides whether to apply a high-confidence repair or force the best
    available guess.
-   Distinguishes verified and forced outcomes.

### F. Output layer

-   Converts selected accented text to Vietnamese ASCII.
-   Applies exact cell patches.
-   Reopens and verifies the XLSX.

------------------------------------------------------------------------

# 4. Build the free local Vietnam geographic knowledge base

This is the core data strategy. The engine must use knowledge retrieved
from local datasets, not a paid API.

Do not merge all sources into an undifferentiated list. Preserve source
authority, date, historical validity, parent-child relationships and
licensing.

## 4.1 Source A --- Official administrative catalogue from Vietnam's National Statistics Office

Official page:

https://www.nso.gov.vn/phuong-phap-luan-thong-ke/danh-muc/don-vi-hanh-chinh/

The page exposes administrative-unit information and an Excel export
function. It may display the data's `as-of` date and administrative
hierarchy.

Use it as the primary authority for: - Current official province/city
names. - Commune/ward-level administrative names. - Administrative
codes. - Parent-child hierarchy. - Administrative level. - Current
effective status. - Official update date.

Requirements: 1. Inspect the current official page and its actual
export/download flow. 2. Use the visible official Excel export or
official downloadable attachment where possible. 3. Do not
reverse-engineer undocumented private endpoints. 4. If automatic export
is impractical, provide a documented manual download/import step. 5.
Store the original source file unchanged in the dataset staging
directory. 6. Record retrieval date, as-of date, source URL, checksum
and dataset version. 7. Validate all parsed rows and codes. 8. Preserve
leading zeros in codes. 9. Do not assume a fixed number of provinces,
wards or districts; read the actual official dataset. 10. Recheck the
official catalogue during deliberate dataset updates.

The official catalogue is authoritative for administrative names and
codes, but it is not a complete list of every road, alley, property,
project or local landmark.

## 4.2 Source B --- Vietnamese Provinces Database

Repository:

https://github.com/thanglequoc/vietnamese-provinces-database

This is a useful open-source supplementary dataset with administrative,
SQL/JSON/GIS and postal-code information. Its repository advertises an
MIT license, but verify the exact license and any separate data
licensing before incorporating or redistributing files.

Use it for: - Supplementary administrative records. - Codes and
hierarchy. - Historical administrative data where documented. - Postal
codes. - GIS boundaries if needed. - Cross-checking the official
catalogue.

Requirements: 1. Inspect the current release, not an old copied
snapshot. 2. Verify schema and actual contents. 3. Verify the exact
software/data license. 4. Cross-check official names and codes against
NSO. 5. Preserve source/version metadata. 6. If the source conflicts
with the official catalogue, do not silently choose the community
source. Record the discrepancy and use official authority for current
official names.

Repository: https://github.com/thanglequoc/vietnamese-provinces-database

Releases:
https://github.com/thanglequoc/vietnamese-provinces-database/releases

## 4.3 Source C --- OpenStreetMap Vietnam extract

Download:

https://download.geofabrik.de/asia/vietnam.html

Use a current Vietnam PBF extract as a supplementary source for: - Roads
and streets. - Named places. - Villages and hamlets where mapped. -
Residential areas. - Buildings and facilities with names. - Place names
and landmarks. - `addr:*` tags where present. - Administrative boundary
features where useful.

OSM is community-contributed. It is not the legal authority for every
address and does not guarantee complete coverage.

Requirements: 1. Download only during a deliberate dataset setup/update.
2. Record extract timestamp, URL, file size and checksum. 3. Do not load
the raw PBF in the browser or worker during every Excel import. 4. Use a
one-time ingestion/build process. 5. Extract only useful features and
tags. 6. Preserve OSM object type and source ID. 7. Preserve name tags
and available language variants. 8. Preserve coordinates and parent
geographic context where useful. 9. Deduplicate carefully without
merging distinct places that share a name. 10. Build a compact local
search index. 11. Split indexes into shards if needed. 12. Include OSM
attribution. 13. Review ODbL 1.0 obligations before distributing derived
databases. 14. Keep OSM-derived data logically separate from
MIT/Apache/official datasets so license obligations remain traceable.

Possible build-time tools: - `osmium-tool` - PyOsmium - GDAL/OGR

These may be used in a dataset preparation script, not automatically as
production runtime dependencies. Keep the repair application itself
lightweight.

OSM license and attribution: - https://www.openstreetmap.org/copyright -
https://opendatacommons.org/licenses/odbl/

## 4.4 Source D --- Supplementary Vietnamese address corpus

Optional candidate source:

https://huggingface.co/datasets/trucmtnguyen/vietnam-address-collection

The dataset card has documented approximately 79,931 address records and
Apache-2.0 licensing. Its coverage may reflect older administrative
boundaries and its files/schema require validation.

Do not assume it is clean, current or authoritative.

Before use: 1. Download and inspect each raw file independently. 2.
Verify exact schema. 3. Verify license and attribution. 4. Validate
UTF-8. 5. Detect duplicates and malformed rows. 6. Identify the
administrative era represented. 7. Retain historical context. 8. Exclude
records with unreliable provenance. 9. Use only as supplementary
candidate data, never as the sole source of truth.

If its data quality is poor, omit it and document why.

## 4.5 Source E --- Internal verified workbook corpus

This can become the most relevant source for collateral/property data,
but it must be privacy-controlled.

Potential evidence: - Clean repeated addresses in the same workbook. -
Other worksheets in the same workbook. - Previously verified local
records. - Repeated records for the same asset/property when identifiers
establish the match. - Previously accepted and later verified repairs.

Requirements: 1. Default to current-workbook evidence only. 2.
Cross-workbook learning must be explicit opt-in. 3. Keep the corpus
local. 4. Do not upload data. 5. Do not log customer names, tax IDs,
loan IDs, account numbers or full collateral descriptions. 6. Do not
treat repeated corrupted values as clean evidence. 7. Do not treat
duplicate copies of the same source as independent votes. 8. Do not use
a record as its own ground truth. 9. Keep source file fingerprint and
provenance. 10. Provide a way to exclude or reset the optional internal
corpus.

------------------------------------------------------------------------

# 5. Data model and provenance

Create a versioned local geographic knowledge model.

Suggested entities:

## AdministrativeUnit

-   `id`
-   `officialCode`
-   `canonicalNameAccented`
-   `canonicalNameAscii`
-   `unitLevel`
-   `parentId`
-   `validFrom`
-   `validTo`
-   `isCurrent`
-   `source`
-   `sourceVersion`
-   `sourceUrl`
-   `legalReference`

## AdministrativeAlias

-   `id`
-   `unitId`
-   `aliasAccented`
-   `aliasAscii`
-   `aliasType` (`historical`, `former_name`, `abbreviation`,
    `alternate_spelling`, `common_variant`)
-   `validFrom`
-   `validTo`
-   `source`
-   `sourceVersion`

## PlaceFeature

-   `id`
-   `source` (`OSM`, `official`, `address_corpus`, `internal_verified`)
-   `sourceFeatureId`
-   `nameAccented`
-   `nameAscii`
-   `nameType` (`road`, `street`, `village`, `hamlet`, `residential`,
    `project`, `building`, `poi`, `industrial_park`, `other`)
-   `parentAdminId`
-   `latitude`
-   `longitude`
-   `tags`
-   `sourceTimestamp`
-   `license`

## AddressCandidateRecord

-   `id`
-   `addressAccented`
-   `addressAscii`
-   `components`
-   `administrativeEra`
-   `source`
-   `sourceVersion`
-   `verificationStatus`

## InternalVerifiedAddress

-   Keep separate from public geographic data.
-   Local only.
-   Opt-in.
-   Access-controlled.
-   Must never be included in a public dataset package.

Do not flatten the historical relationships into a single current-name
alias. Preserve lineage and time validity.

------------------------------------------------------------------------

# 6. Address and location detection across arbitrary Excel workbooks

The engine must scan all worksheets and must not depend on MAU9 or known
headers.

Classify text spans using combined evidence:

1.  Header semantics when present.
2.  Address keywords.
3.  Administrative-unit terms.
4.  Road/street/locality terms.
5.  Address-like number and separator patterns.
6.  Property-location vocabulary.
7.  Same-row neighboring cells.
8.  Related asset/property context.
9.  Repeated address structure elsewhere in the workbook.

Possible semantic clues include: - dia chi - dia diem - vi tri - noi o -
dia ban - dia chi tai san - dia chi nha dat - tai san bao dam - thua
dat - duong - pho - phuong - xa - thi tran - tinh - thanh pho - khu dan
cu - ap - thon - xom - hem - ngo - lo - khu cong nghiep - du an

These are generic classification clues, not a list of hard-coded
replacement answers.

The engine must also identify address/location spans embedded in a
longer property description.

Distinguish at least these classes:

-   `ADMINISTRATIVE_ADDRESS`
-   `STREET_OR_LOCALITY`
-   `PROPERTY_LOCATION_DESCRIPTION`
-   `PROJECT_OR_BUILDING_NAME`
-   `GENERAL_VIETNAMESE_TEXT`
-   `NON_ADDRESS_TEXT`
-   `AMBIGUOUS`

Do not assume every Vietnamese sentence is an address.

When confidence is insufficient to classify a span as address-related: -
In safe mode, leave it unchanged and report it. - In force mode, only
apply the no-question-mark policy if the user explicitly enables force
repair for ambiguous Vietnamese text too. The default force scope is
classified address/location spans.

------------------------------------------------------------------------

# 7. Detect corruption patterns correctly

The target corruption is a `?` replacing one or more original Vietnamese
characters.

Examples: - `Phuong D?c Hoa` - `Nguyen V?n Linh` -
`Duong Tr?n Hung Dao` - `Khu dan c?` - `Can h? chung cu` -
`NHA ? H?NH THANH TRONG TUONG LAI`

Do not assume every `?` is a corruption character in every cell.

Use: - Position inside a word. - Adjacent character classes. - Address
classification. - Repeated pattern. - Token shape. - Vietnamese syllable
validity. - Candidate matches in geographic data. - Context from the
rest of the address. - Whether the cell is an actual question or
contains punctuation.

In a classified address span, a `?` inside a word is strongly
suspicious. In force mode, all classified corruption placeholders must
be resolved.

Preserve legitimate punctuation outside confirmed corruption spans.

Do not modify: - Numeric values. - House numbers. - Parcel numbers. -
Map sheet numbers. - Unit numbers. - Asset codes. -
Loan/account/customer identifiers. - Formula expressions. - Unrelated
punctuation. - Non-target text spans.

------------------------------------------------------------------------

# 8. Internal Vietnamese Unicode reasoning --- mandatory

This is one of the most important requirements.

Do not strip Vietnamese accents before prediction.

Maintain two separate representations:

1.  `accentedInternal`: full Vietnamese Unicode with diacritics.
2.  `finalAscii`: Vietnamese without diacritics, required by the user's
    output convention.

For each candidate store: - `rawOriginal` - `analysisNormalized` -
`candidateAccented` - `candidateAscii` - `candidateEvidence` -
`candidateScore` - `runnerUpScore` - `selectedStatus`

## 8.1 Full Vietnamese character support

The internal model and candidate generator must support: - `ă`, `â`,
`ê`, `ô`, `ơ`, `ư`, `đ` - All valid tone-marked vowel combinations. -
Uppercase and lowercase. - Vietnamese onset, medial, nucleus, coda and
tone patterns. - Mixed accented and unaccented text.

Do not implement an incomplete hand-written list of a few vowel forms.

Use Unicode normalization and a complete tested mapping.

## 8.2 Why accented reasoning is better

Vietnamese diacritics carry lexical and phonetic information. Internal
accented candidates help: - Distinguish words with similar ASCII
spellings. - Match canonical geographic names. - Validate Vietnamese
syllable forms. - Rank candidate place names. - Recover complete
phrases. - Avoid confusing different administrative units.

The final Excel output can still be ASCII.

## 8.3 Final Vietnamese ASCII conversion

After candidate selection:

1.  Normalize to Unicode NFD.
2.  Remove combining diacritic marks.
3.  Explicitly map `đ` to `d`.
4.  Explicitly map `Đ` to `D`.
5.  Preserve case.
6.  Preserve digits and punctuation.
7.  Apply only the configured whitespace normalization.
8.  Do not transliterate unrelated content outside the approved repair
    span.

Test examples:

-   `Đường Nguyễn Huệ` → `Duong Nguyen Hue`
-   `Phường Đức Hòa` → `Phuong Duc Hoa`
-   `Thành phố Hồ Chí Minh` → `Thanh pho Ho Chi Minh`
-   `Xã Đắk Lắk` → `Xa Dak Lak`
-   `Khu công nghiệp Tân Tạo` → `Khu cong nghiep Tan Tao`

Do not use simple `toLowerCase()` as the conversion method.

Do not remove accents from the entire workbook by default. The default
is to write the repaired address span in ASCII while preserving
unrelated cell content.

------------------------------------------------------------------------

# 9. Candidate retrieval: use geographic knowledge, not only language prediction

The engine must retrieve candidates from the local knowledge base before
guessing.

## 9.1 Normalize for search

Build normalized search forms: - Unicode NFD. - Accent-stripped
Vietnamese ASCII. - `đ → d`. - Case-folded. - Whitespace-normalized. -
Punctuation-aware token form.

Keep the accented canonical string separately.

The normalized form is for retrieval only. It is not the final truth.

## 9.2 Candidate retrieval methods

Use a combination of:

-   Exact ASCII-normalized lookup.
-   Prefix lookup.
-   Token overlap.
-   Character n-gram retrieval.
-   Wildcard matching where `?` represents a missing character.
-   Weighted edit distance.
-   Damerau-Levenshtein distance for transposition-like corruption.
-   Variable-length matching where the corruption mechanism may have
    removed more than one character.
-   Administrative hierarchy constraints.
-   Road/locality type constraints.
-   Historical alias lookup.
-   Local verified-address retrieval.

Do not retrieve candidates from the entire country without context if
the workbook provides a reliable province/city or region clue.

Use context to narrow the candidate search, but do not overconstrain
when the administrative name itself is corrupted.

## 9.3 Do not assume one `?` equals exactly one missing character

The source may have: - One unknown original character. - Multiple lost
characters represented by one placeholder. - Several placeholders in a
word. - A whole corrupted token. - Encoding damage that is not a
one-character substitution.

Generate variable-length candidates when evidence supports them.

Retain the original string and never silently change token length
without recording the transformation.

------------------------------------------------------------------------

# 10. Candidate generation and complete phrase inference

The user specifically wants the engine to use geographic knowledge and
then infer likely text, not merely perform exact dictionary replacement.

Implement a multi-stage process.

## Stage A --- Candidate retrieval

Retrieve candidate administrative units, roads, localities, projects and
named places from the local indexes.

## Stage B --- Candidate expansion

For every suspicious span: - Generate candidate words from retrieved
place names. - Generate candidate phrase sequences. - Generate
candidates using known aliases and historical names. - Generate
candidates from clean repeated workbook text. - Generate candidate
completions with Vietnamese syllable constraints. - Use character-level
beam search for unresolved fragments. - Preserve numeric anchors and
known tokens.

## Stage C --- Accent restoration

Generate or retrieve accented Vietnamese forms for each candidate.

Prefer canonical accented names from the gazetteer over guessed accent
placement.

For general phrase fragments not in the geographic gazetteer, use: -
Verified local text corpus. - Licensed Vietnamese word/syllable
resources if available. - Character and word n-gram models trained only
on permitted data. - Contextual phrase evidence. - Optional small local
model only if benchmark results justify it.

Do not invent a large dictionary manually.

## Stage D --- Complete phrase reconstruction

Score the whole address or property-location phrase, not just each `?`
independently.

Example:

`Duong Tr?n Hung Dao, Phuong 5, Quan 5, TP HCM`

Possible accented candidate:

`Đường Trần Hưng Đạo, Phường 5, Quận 5, Thành phố Hồ Chí Minh`

The system must assess the whole chain and its geographic consistency.

Example:

`NHA ? H?NH THANH TRONG TUONG LAI`

This may be a property-description phrase rather than a geographic name.
Use Vietnamese phrase context and local verified corpus to infer it. Do
not force it into the place-name gazetteer.

------------------------------------------------------------------------

# 11. Geographic validation and historical context

A candidate should be scored using the address hierarchy.

Possible components: - Province/city. - Former district or
district-level unit. - Ward/commune. - Street/road. - Village/hamlet. -
Residential area. - Project/building/industrial park. - House/property
number. - Parcel number and map sheet number.

Use parent-child consistency when the dataset supports it.

## 11.1 Historical address preservation

Vietnam's administrative boundaries and names have changed.

The system must preserve the address as it was recorded at the relevant
time.

Do not automatically rewrite: - Old province names to new province
names. - Former district names to current names. - Old commune/ward
names to newly merged units. - Historical address wording to a modern
administrative format.

Store: - `asRecordedAccented` - `asRecordedAscii` -
`historicalAdminVersion` - `currentAdminReference` (optional,
separate) - `normalizedCurrentAddress` (only if explicitly requested)

The user needs to restore missing characters, not silently modernize
collateral records.

Use official administrative history and version metadata to resolve
historical names.

Do not assume the number of provinces, districts or communes remains
constant. Load the latest official dataset version rather than
hard-coding a fixed count.

------------------------------------------------------------------------

# 12. Candidate ranking model

Build a deterministic, explainable ranking model first.

Suggested signals:

  -----------------------------------------------------------------------
  Signal                              Purpose
  ----------------------------------- -----------------------------------
  Exact official name match           Strong evidence for administrative
                                      units

  Official code match                 Very strong when present and
                                      reliable

  Historical alias match              Supports older recorded addresses

  Parent-child administrative         Rejects geographically inconsistent
  validity                            chains

  Place type compatibility            Distinguishes road, ward, village,
                                      project, etc.

  ASCII normalized similarity         Finds missing/corrupted letters

  Wildcard compatibility              Matches the locations of `?`

  Weighted edit distance              Handles insertions, deletions and
                                      substitutions

  Vietnamese syllable validity        Rejects impossible word candidates

  Character n-gram probability        Helps rank unknown fragments

  Word/phrase n-gram probability      Helps reconstruct complete phrases

  Same-workbook verified duplicate    Strong contextual evidence

  Same-asset verified match           Strong evidence if identity is
                                      reliable

  Numeric anchor preservation         Prevents changing house/parcel/unit
                                      numbers

  Candidate ambiguity                 Penalizes candidates with multiple
                                      equally plausible matches

  Source quality and freshness        Distinguishes authoritative from
                                      supplementary sources
  -----------------------------------------------------------------------

Avoid double-counting correlated signals. Two copies of the same address
are not two independent votes.

Use a calibrated score and runner-up margin.

Do not call a score `98% confidence` unless it has been calibrated
against a held-out, document-separated dataset.

The engine must retain: - Top candidate. - Runner-up candidate. -
Score. - Score margin. - Evidence types. - Source provenance. - Decision
policy. - Final status.

------------------------------------------------------------------------

# 13. Repair policies: safe mode and force-complete mode

Implement two explicit policies.

## 13.1 `SAFE_AUTO`

-   Automatically apply only candidates that meet the tested threshold.
-   Leave ambiguous spans unchanged.
-   Report remaining suspicious `?` characters.
-   Do not claim complete repair.

## 13.2 `FORCE_NO_QUESTION_MARK` --- required user mode

This mode is central to the user's requirement.

For every `?` classified as a corruption placeholder inside a Vietnamese
address/location span:

1.  Retrieve official administrative candidates.
2.  Retrieve historical aliases.
3.  Retrieve OSM road/place candidates.
4.  Retrieve validated supplementary address candidates.
5.  Retrieve same-workbook verified matches.
6.  Generate contextual Vietnamese candidates.
7.  Rank complete phrases.
8.  Select the highest-ranked candidate even when confidence is low.
9.  Restore an accented internal version.
10. Convert the selected span to Vietnamese ASCII.
11. Apply the exact cell patch.
12. Reopen the XLSX and verify the target span.
13. Confirm no classified corruption placeholder remains in that span.
14. Mark the outcome honestly.

If no plausible candidate can be generated: - Use a deterministic
`fallback_lossy` strategy that removes the corruption placeholder from
the targeted address span without inventing an unsupported place name. -
Preserve the exact original text in the protected local audit. - Mark
the cell `fallback_lossy`. - Do not claim the address is correct. - Do
not modify numeric anchors or unrelated text.

Force mode prioritizes completion over factual certainty, as explicitly
requested by the user.

### Important distinction

The system must not remove every `?` from every workbook cell.

It must: - Resolve corruption placeholders in classified
address/location spans. - Preserve legitimate punctuation outside those
spans. - Keep non-address content under the generic repair policy. -
Provide an optional explicit scope expansion if the user later wants all
Vietnamese text fields included.

## 13.3 Status values

Use explicit statuses:

-   `verified_official`
-   `verified_internal_match`
-   `high_confidence_auto`
-   `contextual_auto`
-   `forced_guess`
-   `fallback_lossy`
-   `needs_review`
-   `unchanged_legitimate_punctuation`
-   `rejected_numeric_anchor_conflict`

Never label `forced_guess` or `fallback_lossy` as verified.

The final report may say: -
`ADDRESS_SPANS_COMPLETED_WITH_FORCED_GUESSES` -
`ADDRESS_SPANS_COMPLETED_WITH_LOSSY_FALLBACKS`

It must never say `100_PERCENT_VERIFIED` if forced guesses or fallbacks
occurred.

------------------------------------------------------------------------

# 14. Should the engine use a local LLM?

Do not start by installing a large local LLM.

The strongest initial design is:

1.  Local geographic knowledge retrieval.
2.  Fuzzy/wildcard candidate retrieval.
3.  Historical administrative matching.
4.  Vietnamese accented candidate generation.
5.  Phrase-level character/word n-gram ranking.
6.  Geographic hierarchy validation.
7.  Force-completion policy.

This is more explainable and often more reliable for named addresses
than asking a general LLM to invent a complete address.

After the deterministic engine is benchmarked, evaluate an optional
compact local model for: - Diacritic restoration. - Candidate ranking. -
Ambiguous phrase reconstruction.

If used: - Run locally. - No cloud inference. - No workbook upload. -
Use it to rank or select among retrieved candidates, not to freely
rewrite an entire record. - Preserve numeric anchors. - Return
structured candidates and evidence. - Benchmark against the
deterministic baseline. - Keep it optional. - Do not add model assets if
they do not materially improve exact-match accuracy.

The local geographic knowledge base remains the evidence source. The
model is not the source of truth.

------------------------------------------------------------------------

# 15. Build the local search index efficiently

Do not load the full raw OSM PBF into the application on every repair.

Use a one-time dataset preparation pipeline.

Possible build-time steps: 1. Download source datasets. 2. Validate
checksums and file types. 3. Parse official administrative Excel/JSON.
4. Parse OSM PBF using an appropriate build-time tool. 5. Normalize
names and aliases. 6. Preserve accented and ASCII forms. 7. Build
hierarchy references. 8. Deduplicate while retaining distinct features.
9. Generate searchable indexes. 10. Shard by administrative region or
feature type. 11. Produce a dataset manifest. 12. Generate a compact
local package for the app.

Possible indexes: - Exact lookup map. - Prefix/trie. - Character n-gram
inverted index. - Weighted edit-distance candidate retrieval. - Token
index. - Alias index. - Parent-child adjacency map. - Per-region shards.

Choose the simplest approach that meets measured memory and latency
requirements.

Do not introduce Elasticsearch or a full database server unless
benchmarks demonstrate a need.

If SQLite is considered, account for the actual Electron/browser/Worker
runtime and avoid unnecessary database dependencies.

Measure: - Raw dataset size. - Processed index size. - Initial load
time. - Lookup latency. - Batch throughput. - Worker memory. - Update
time.

------------------------------------------------------------------------

# 16. Integrate into the actual one-click Excel workflow

The feature must be part of the existing application, not a separate
demo.

The user action should be clear, for example:

**Scan & Auto-Repair Vietnamese Addresses**

or:

**Auto-Repair Excel**

Required sequence:

`Import → discover all worksheets → scan every sheet → classify address spans → detect ? corruption → retrieve local geographic knowledge → generate accented candidates → rank complete phrases → apply repair policy → convert to ASCII → patch workbook → export → reopen → verify`

The UI must: - Show real progress. - Show worksheet-by-worksheet scan
status. - Show address spans found. - Show automatically repaired
cells. - Show forced guesses. - Show lossy fallbacks. - Show unresolved
non-address corruption separately. - Allow cancellation. - Preserve the
original workbook. - Never display an unscanned or failed worksheet as
green/clean.

Do not use fake progress or simulated speculative-decoding metrics as
evidence of real processing.

The user should not need to approve thousands of cells one by one.

Force mode may run automatically after the user selects/enables it. The
UI must make the policy visible.

------------------------------------------------------------------------

# 17. XLSX patching and independent verification

Inspect the existing XLSX patcher before modifying it.

Every patch must identify: - Worksheet relationship ID. - Worksheet XML
path. - Sheet name. - Cell reference. - Original value. - Original
storage type. - Exact corrupted span. - Selected accented
reconstruction. - Final ASCII value. - Candidate provenance. - Repair
status.

Test: - Shared strings. - Inline strings. - Ordinary strings. - Rich
text. - Repeated shared-string references. - Formula cells. - Hidden
sheets. - Styled cells. - Merged cells.

For shared strings, use copy-on-write if changing one shared string must
not affect other cells that reference it.

Do not rewrite formula expressions as plain text.

Do not silently skip unsupported cells. Report the exact sheet/cell and
reason.

After export: 1. Reopen the actual XLSX package. 2. Decode each patched
cell from the output. 3. Compare with the expected final ASCII value. 4.
Confirm the original target value changed. 5. Confirm no classified
corruption placeholder remains in force-repaired address spans. 6.
Verify unrelated cells remain logically unchanged. 7. Verify formulas
and workbook relationships. 8. Report any unsupported package features.

Do not claim success because ZIP bytes changed.

------------------------------------------------------------------------

# 18. Privacy and data protection

The workbook may contain sensitive collateral, borrower and banking
information.

Mandatory: - No workbook upload. - No cloud AI. - No paid API. - No
remote geocoding. - No external transmission of address text. - No raw
customer data in logs. - No full address in telemetry. - Internal
verified corpus is local and opt-in. - Public geographic datasets remain
separate from internal customer data. - Preserve original file. -
Protect audit data. - Do not use weak hashes as a substitute for
protecting low-entropy identifiers.

Dataset setup may access public download sources once. Normal repair
must be offline.

------------------------------------------------------------------------

# 19. Tests and evaluation

Create independent ground-truth fixtures. Do not evaluate on the same
rows used to build the corpus.

Split by document/property/record, not random rows, to avoid leakage
from duplicate addresses.

## 19.1 Geographic tests

Test: - Province/city names. - Ward/commune names. - Historical
province/district/ward names. - Road and street names. - Villages and
hamlets. - Residential areas. - Projects and buildings. - Industrial
parks. - Same-name places in different provinces. - Historical address
preservation. - Current address reference as a separate field.

## 19.2 Corruption tests

Test: - One `?` in a token. - Multiple `?` in a token. - Multiple
corrupted tokens in one address. - Variable-length corruption. - Mixed
accented and unaccented text. - Uppercase text. - Abbreviations. -
Missing separators. - Unknown project names. - Legitimate question-mark
punctuation. - Numeric anchors embedded in addresses. - Corrupted
address inside a long property description.

## 19.3 Vietnamese Unicode tests

Test all Vietnamese vowels and tone combinations: -
`a, ă, â, e, ê, i, o, ô, ơ, u, ư, y` - All valid tone-marked forms. -
`đ` and `Đ`. - Uppercase and lowercase. - NFD/NFC normalization. - Final
ASCII conversion.

## 19.4 Workbook tests

Test: - MAU9-like workbook. - Completely unrelated workbook. - Multiple
worksheets. - Unknown sheet names. - Unknown headers. - Header row not
at row 1. - Address in an unknown column. - Corruption on second and
later worksheets. - Shared strings and inline strings. - Formula
cells. - Hidden sheets. - Actual output cell values.

## 19.5 Force-mode tests

In `FORCE_NO_QUESTION_MARK`: - Every classified corruption placeholder
is removed from the exported address span. - The final span is
ASCII/no-diacritic. - Every forced guess is labelled. - Every lossy
fallback is labelled. - Numeric anchors are preserved. - Legitimate
punctuation outside target spans is preserved. - The audit retains the
original text. - The output is independently reopened and verified.

## 19.6 Metrics

Report: - Address-span detection precision/recall. - Candidate
recall@k. - Exact accented reconstruction accuracy. - Exact final ASCII
reconstruction accuracy. - High-confidence automatic repair precision. -
Force-guess rate. - Lossy-fallback rate. - Remaining classified
corruption placeholders. - False modification count. - Numeric-anchor
preservation rate. - Per-sheet scan coverage. - Output verification pass
rate. - Runtime and peak memory.

Do not claim 100% factual accuracy simply because force mode removed all
`?`.

------------------------------------------------------------------------

# 20. Clean-code requirements

-   Keep modules single-purpose.
-   Avoid duplicate pipelines.
-   Separate generic scanning, address classification, geographic
    retrieval, candidate generation, ranking, policy, transliteration,
    patching and verification.
-   Reuse existing interfaces where sound.
-   Remove dead code only after tracing callers and tests.
-   Avoid circular imports.
-   Avoid unsafe `any`.
-   Use explicit TypeScript types.
-   Use structured errors with workbook/sheet/cell context.
-   Keep the original workbook immutable.
-   Make results deterministic and reproducible.
-   Version the geographic dataset and recovery engine.
-   Keep test fixtures separate from production datasets.
-   Keep licensing metadata next to derived datasets.
-   Do not add unrelated UI redesigns.

------------------------------------------------------------------------

# 21. Required implementation order

Execute in sequence. Do not skip directly to UI polish.

## Phase 1 --- Audit and baseline

-   Inspect repository.
-   Run existing tests.
-   Reproduce current failures.
-   Identify the first pipeline stage where repairs are lost.
-   Record baseline output and metrics.

## Phase 2 --- Generic workbook decoupling

-   Ensure all worksheets are discovered.
-   Remove MAU9 dependency from generic scanning/repair.
-   Fix false-green sheet states.
-   Keep JSON mapping separate.

## Phase 3 --- Dataset ingestion

-   Implement official NSO Excel/JSON import.
-   Implement supplementary administrative database import.
-   Implement historical alias/lineage support.
-   Evaluate and implement OSM PBF extraction.
-   Evaluate optional address corpus.
-   Build dataset manifest and license notices.

## Phase 4 --- Local geographic index

-   Normalize accented and ASCII names.
-   Build exact, alias, token, n-gram and fuzzy indexes.
-   Build parent-child hierarchy.
-   Add historical validity.
-   Benchmark memory and lookup.

## Phase 5 --- Address classification and parsing

-   Detect address/location spans.
-   Parse administrative and locality components.
-   Preserve numeric anchors.
-   Support unknown headers and long descriptions.

## Phase 6 --- Accent-aware inference

-   Generate accented candidates.
-   Retrieve local geographic candidates.
-   Use phrase-level ranking.
-   Add Vietnamese syllable and n-gram support.
-   Use local verified workbook evidence.
-   Evaluate optional local model only if needed.

## Phase 7 --- Output normalization

-   Implement Unicode-safe Vietnamese-to-ASCII conversion.
-   Preserve `đ/Đ` mapping.
-   Preserve case, numbers and punctuation.
-   Test complete Vietnamese character coverage.

## Phase 8 --- Repair policy

-   Implement `SAFE_AUTO`.
-   Implement `FORCE_NO_QUESTION_MARK`.
-   Add `forced_guess` and `fallback_lossy`.
-   Preserve audit/provenance.

## Phase 9 --- Real XLSX integration

-   Connect the feature to the actual one-click UI.
-   Apply patches across all worksheets.
-   Reopen output.
-   Verify actual cells.

## Phase 10 --- Regression and final QA

-   Run existing tests.
-   Run new geographic and multi-workbook tests.
-   Benchmark.
-   Check privacy and license notices.
-   Report unresolved limitations honestly.

After each phase: - Run the relevant tests. - Report failures. - Fix
them before proceeding. - Do not mark a phase complete based on code
compilation alone.

------------------------------------------------------------------------

# 22. Definition of Done

The task is complete only if all of the following are true:

1.  The feature is integrated into the real existing application.
2.  It works on unrelated supported Excel workbooks.
3.  It scans every worksheet.
4.  It detects Vietnamese address/location spans without relying solely
    on column headers.
5.  It uses free local geographic datasets.
6.  It can retrieve candidates from official administrative units,
    historical aliases and local place-name data.
7.  It can infer plausible candidates when the exact full corrupted
    string is not present in the database.
8.  It reasons internally using full accented Vietnamese Unicode.
9.  It writes repaired address spans in Vietnamese ASCII/no-diacritic
    format.
10. It preserves numeric anchors and unrelated content.
11. `FORCE_NO_QUESTION_MARK` leaves no classified corruption placeholder
    in targeted address spans.
12. Forced guesses and lossy fallbacks are explicitly recorded.
13. No paid API, cloud model, API key or runtime network request is
    required.
14. The output XLSX is reopened and independently verified.
15. Existing MAU9 JSON functionality remains separate and working.
16. Dataset provenance, version and licenses are documented.
17. Tests demonstrate actual repaired cells in non-MAU9 workbooks and
    non-first worksheets.

## Final deliverables

Provide: - Implemented source code. - Root-cause report. - Changed-file
list and reasons. - Official administrative dataset importer. - Dataset
manifest with source, version, retrieval date and license. - OSM
extraction/index build scripts. - Local geographic search index. -
Historical alias/lineage support. - Vietnamese address parser. -
Accent-aware candidate generator and ranker. - Vietnamese ASCII
converter. - Safe and force repair modes. - Per-cell audit/provenance. -
Regression fixtures. - Test commands and actual test results. -
Before/after repaired XLSX fixture. - Independent output verification
report. - Setup/update documentation. - Known limitations and unresolved
cases.

------------------------------------------------------------------------

# 23. Final instruction to the coding agent

Do not build a chatbot that freely rewrites addresses.

Build a **local evidence-driven recovery system**:

`Free geographic data → local knowledge index → candidate retrieval → Vietnamese accented reasoning → geographic validation → force/safe policy → ASCII output → XLSX patch → independent verification`

The engine must be able to use the knowledge in its local datasets and
infer missing characters even when the exact corrupted phrase is not
directly stored.

The user's chosen priority is completion: in `FORCE_NO_QUESTION_MARK`
mode, do not leave classified corruption placeholders in Vietnamese
address/location spans. When evidence is weak, choose the best available
guess or a clearly labelled lossy fallback, preserve the original and
disclose the uncertainty.

**Use Vietnamese with full diacritics internally. Convert to Vietnamese
without diacritics only after selecting the reconstruction.**

**No paid APIs. No Google Maps API. No cloud AI. No runtime internet. No
MAU9 dependency for generic Excel repair. No false success.**
