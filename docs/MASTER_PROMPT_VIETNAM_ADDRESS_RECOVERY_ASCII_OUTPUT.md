# MASTER PROMPT --- VIETNAM ADDRESS RECOVERY + ACCENT-AWARE REASONING + ASCII OUTPUT

## Mission

Deeply inspect and extend the existing local Excel Auto-Repair
application with a specialized **Vietnam Address Recovery Engine**.

The user's data corruption is concentrated in Vietnamese geographical
information: - Property addresses - Street and road names -
Wards/communes - Districts and former districts - Provinces and cities -
Villages, hamlets, residential areas - Projects, industrial parks,
buildings, landmarks - Land parcels and property-location descriptions

The required output convention is **Vietnamese without diacritics**.

The engine must therefore use two separate representations:

1.  **Internal reasoning representation:** Vietnamese text with full
    Unicode diacritics, reconstructed and scored using Vietnamese
    linguistic and geographical knowledge.
2.  **Final output representation:** Vietnamese ASCII/no-diacritic text,
    generated only after the best internal candidate has been selected.

Example:

-   Corrupted source: `NHA ? H?NH THANH TRONG TUONG LAI`
-   Internal candidate: `NHÀ Ở HÌNH THÀNH TRONG TƯƠNG LAI`
-   Final output: `NHA O HINH THANH TRONG TUONG LAI`

This is intentional. Do not disable diacritic reasoning merely because
the final workbook must contain unaccented Vietnamese.

The user also prefers a force-completion mode in which no genuine
corruption placeholder `?` remains in an address span. This mode may
accept lower-confidence guesses, but every forced guess must be recorded
and distinguishable from a verified repair.

Do not promise that every guess is factually correct. Build a system
that can complete the requested output while exposing the provenance and
uncertainty of each change.

------------------------------------------------------------------------

# 1. First inspect the existing application

Before coding, inspect the actual repository and trace the current
pipeline:

`Excel import → workbook discovery → worksheet scan → cell extraction → question-mark detection → prediction → acceptance → patch → XLSX export → independent verification`

Inspect the real equivalents of:

-   `xlsx-reader.ts`
-   `detect.ts`
-   `predict.ts`
-   `review.ts`
-   `xlsx-patcher.ts`
-   `collateral.worker.ts`
-   `session.ts`
-   `mapping-profiles.ts`
-   `ReviewStep.tsx`
-   Actual import/repair/export UI
-   Existing tests and fixtures

The previous work established that XLSX patching can produce real cell
changes, but Vietnamese prediction quality is insufficient and some
candidates are guessed without reliable geographic evidence.

Verify the current code; do not assume previous findings are still
accurate.

Do not rewrite the application blindly. Preserve the existing
TypeScript, Web Worker, `fflate`, `zod`, and patch architecture unless a
measured technical limitation requires a change.

Do not add ExcelJS or SheetJS to production.

------------------------------------------------------------------------

# 2. Product architecture: add a specialized address engine

Keep the existing generic workbook scanner and XLSX patcher.

Add a specialized address-recovery subsystem that operates on suspicious
text spans within any worksheet, regardless of workbook name, sheet
name, header names, or MAU9 profile.

Suggested logical modules (adapt names to the actual repository):

-   `vn-address-detect.ts`
-   `vn-address-normalize.ts`
-   `vn-address-parser.ts`
-   `vn-admin-gazetteer.ts`
-   `vn-place-index.ts`
-   `vn-address-candidate-generator.ts`
-   `vn-address-ranker.ts`
-   `vn-address-validator.ts`
-   `vn-diacritic-restoration.ts`
-   `vn-ascii-output.ts`
-   `vn-address-repair-policy.ts`
-   `geo-provider/google-maps.ts` (optional provider, disabled by
    default)
-   `address-repair-report.ts`

Do not create files mechanically if existing modules already provide the
same responsibilities. Keep the architecture small and avoid duplicate
pipelines.

## Separation of concerns

### Generic workbook layer

-   Reads all supported worksheets and text cells.
-   Detects suspicious question marks.
-   Preserves original values.
-   Provides exact sheet/cell coordinates.

### Vietnam address layer

-   Determines whether the suspicious text is likely an address/location
    span.
-   Parses address components.
-   Generates geographically plausible candidates.
-   Scores and validates candidates.
-   Produces an accented internal reconstruction.

### Output layer

-   Converts the selected Vietnamese reconstruction to the required
    no-diacritic convention.
-   Builds exact cell patches.
-   Exports and independently verifies the actual XLSX values.

### MAU9 JSON layer

-   Remains separate.
-   May consume the repaired workbook when the user chooses JSON
    conversion.
-   Must not control address scanning or Excel repair.

------------------------------------------------------------------------

# 3. Address-span detection --- do not rely only on column headers

The engine must recognize address-like content even when: - The column
name is unknown. - The header is missing. - The sheet is not the first
sheet. - The workbook is not MAU9. - The address is embedded inside a
longer collateral description.

Use a combination of: 1. Header semantic hints, when available. 2.
Address component patterns. 3. Vietnamese administrative-unit terms. 4.
Street/road/hamlet/ward/province patterns. 5. Property-location
vocabulary. 6. Numeric address structures. 7. Neighboring cells and
same-row context. 8. Existing verified records with matching
asset/property context.

Header names are weak evidence, not the sole gate.

Possible semantic hints include variations of: - dia chi - dia diem - vi
tri - noi o - dia ban - dia chi tai san - tai san bao dam - thua dat -
duong - phuong - xa - thi tran - tinh - thanh pho

Do not hard-code a single list of column names as the only way to find
addresses. Use a configurable semantic classifier and content evidence.

Do not classify every Vietnamese sentence as an address.

When the address span is embedded in a longer description, preserve the
non-address content and repair only the relevant span unless the
configured output policy explicitly requires normalization of the
complete address field.

------------------------------------------------------------------------

# 4. Build a Vietnam-specific geographic knowledge base

The address engine must not depend solely on a general-purpose language
model.

Build a local, versioned geographic knowledge base from permitted and
attributable sources.

## 4.1 Official administrative gazetteer

Use official Vietnamese administrative-unit data as the authoritative
source for administrative names and codes.

Important current reference: - Decision 19/2025/QD-TTg, effective 1 July
2025. - It establishes the official list and codes for 34
provincial-level units and 3,321 commune-level units.

Official reference:
https://vanban.chinhphu.vn/?classid=1&docid=214409&orggroupid=3&pageid=27160

Government summary:
https://baochinhphu.vn/bang-danh-muc-va-ma-so-cua-34-tinh-thanh-moi-3321-don-vi-hanh-chinh-cap-xa-moi-102250704153652947.htm

Requirements: - Import the actual official attachment/table where
legally and technically possible. - Do not manually type a partial list
into source code. - Store official administrative codes. - Store
accented canonical names. - Generate no-diacritic aliases for search. -
Store historical names and predecessor/successor relationships. - Store
validity dates or administrative-version metadata. - Record source,
publication date, effective date, and dataset version. - Validate
parent-child relationships between province and commune-level units.

Vietnam's 2025 administrative reorganization makes historical aliases
important. Do not assume that a district or province name in an older
property record is automatically wrong.

**Critical rule:** Reconstruct the text that the source record intended.
Do not silently modernize a historical address.

Keep these concepts separate: - `as_recorded_address`: restored version
of the original record, preserving its historical administrative
wording. - `current_admin_reference`: optional mapping to today's
administrative unit. - `normalized_current_address`: only generate if
explicitly requested.

Never replace an old province/district name with a new one merely
because a current administrative unit now exists.

## 4.2 OpenStreetMap Vietnam extract

Evaluate using an offline Vietnam OpenStreetMap extract as a secondary
geographic source for: - Road and street names - Named places -
Residential areas - Localities - Landmarks - Points of interest -
Administrative boundary relations where available

A Vietnam PBF extract is available from:
https://download.geofabrik.de/asia/vietnam.html

The extract is large. Do not load the complete PBF into the browser
worker at runtime.

Instead: 1. Create an offline data-ingestion/build script. 2. Extract
only useful address/place features. 3. Normalize and deduplicate names.
4. Build a compact local searchable index. 5. Include data version and
attribution. 6. Make the resulting local data package loadable by the
application. 7. Document OSM attribution and ODbL obligations. Review
the license before distributing derived databases.

The public Nominatim server is not a bulk data source. Do not issue
thousands of automated queries against the public service. If Nominatim
is used, follow its usage policy:
https://operations.osmfoundation.org/policies/nominatim/

Prefer a locally hosted search index or a deliberately selected
commercial provider for repeat/bulk workloads.

OSM is community-contributed and is not the legal authority for every
address. Treat it as supporting evidence, not unquestionable truth.

## 4.3 Internal trusted address corpus

Build a local corpus from: - Repeated clean addresses in the same
workbook. - Other worksheets in the same workbook. - Previously verified
local workbooks only when the user explicitly enables this feature. -
Trusted property/address records with reliable matching identifiers.

Do not treat repeated corrupted text as independent evidence.

Do not treat two duplicate columns containing the same corruption as
independent confirmation.

Do not use a row as its own ground truth.

Use exact asset/customer/property matching only inside the local
process. Do not expose customer identifiers in logs or send them to
external providers.

------------------------------------------------------------------------

# 5. Optional Google Maps integration --- use API correctly

Google Maps may be useful as an **optional online resolver**, not as the
engine's permanent training database.

Evaluate: - Google Maps Geocoding API for address lookup and structured
address components. - Google Places API Text Search for
place/project/landmark searches. - Place Details only when a reliable
Place ID is available and the required fields are justified.

Official documentation: - Geocoding API:
https://developers.google.com/maps/documentation/geocoding/geocoding -
Places Text Search:
https://developers.google.com/maps/documentation/places/web-service/text-search -
Geocoding policies:
https://developers.google.com/maps/documentation/geocoding/policies -
Places policies:
https://developers.google.com/maps/documentation/places/web-service/policies -
Web-service optimization and caching:
https://developers.google.com/maps/optimize-web-services

### Google provider rules

1.  Disabled by default.
2.  The user/administrator must explicitly configure an API key and
    enable online lookup.
3.  Never scrape the Google Maps website or browser UI.
4.  Use documented APIs only.
5.  Restrict requests to Vietnam where supported.
6.  Set Vietnamese language preferences where supported.
7.  Use address components and component types, not fragile parsing of a
    formatted address string.
8.  Use geographic context from the workbook only when it is reliable.
9.  Avoid sending entire rows, borrower names, customer IDs, loan
    numbers, collateral values, or unrelated personal data.
10. Extract and send only the minimum address span needed for lookup.
11. Warn that an address sent to Google is transmitted to a third party.
12. Do not use Google results as a bulk downloadable dictionary or as an
    unrestricted training corpus.
13. Do not persist/cache Google content contrary to Google Maps Platform
    terms. Place IDs have specific caching exceptions; verify current
    terms before implementation.
14. Do not claim an address is verified merely because Google returned
    one result.
15. Record provider, query scope, response timestamp, result type, and
    evidence summary without storing prohibited content.
16. Respect billing, quotas, retries, and rate limits.
17. Keep the application fully functional when the API key is missing,
    the user declines online lookup, or the network is unavailable.

### Privacy

Collateral addresses can be sensitive financial information.

The default workflow must remain local. Online geocoding requires
explicit user/administrator authorization and a clear disclosure of
exactly what address data will be sent.

Never automatically upload a workbook or full row.

### Google is a candidate source, not the final judge

A Google result may be: - A nearby place rather than the exact
address. - A current administrative address rather than the historical
address. - A road with a similar name in another province. - A result
with incomplete house-number information.

Validate returned components against the local administrative hierarchy
and the original record before accepting the candidate.

------------------------------------------------------------------------

# 6. Address parsing and geographic hierarchy

Parse a Vietnamese address into structured components where possible:

-   House number
-   Alley/lane
-   Street/road
-   Residential group/quarter
-   Hamlet/village
-   Ward/commune/town
-   Former district or district-level unit
-   Province/city
-   Project/building/industrial park
-   Land parcel number
-   Map sheet number
-   Other property-specific descriptors

The parser must tolerate: - Missing separators - Abbreviations -
Uppercase text - No-diacritic text - Mixed accented and unaccented
text - OCR/encoding corruption - Multiple components embedded in one
sentence - Old and new administrative names

Use geographic hierarchy as a constraint:

`province → commune/ward → locality/street → house/property`

The exact hierarchy varies by historical period and address source. Do
not force an obsolete district level into a current address.

Preserve all numeric anchors: - House numbers - Road numbers - Parcel
numbers - Map sheet numbers - Block numbers - Project codes -
Building/floor/unit numbers

Do not invent or alter these values.

------------------------------------------------------------------------

# 7. Accent-aware internal reasoning and no-diacritic output

This is a core requirement.

## 7.1 Maintain separate representations

For every suspicious text span, retain:

-   `rawOriginal`: exact original text.
-   `analysisNormalized`: normalized text used for matching.
-   `accentedCandidates`: one or more Vietnamese candidates with full
    Unicode diacritics.
-   `selectedAccentedCandidate`: selected internal reconstruction.
-   `finalAsciiCandidate`: no-diacritic output.
-   `provenance`: source and evidence for the selected candidate.

Do not overwrite the original value during inference.

## 7.2 Why internal diacritics are useful

Vietnamese diacritics encode lexical and phonetic distinctions.
Restoring them internally can improve: - Word identity - Syllable
validity - Place-name matching - Candidate ranking - Context
interpretation - Distinguishing similarly spelled locations

The model should reason over accented Vietnamese whenever possible, even
when the source workbook and required output are unaccented.

## 7.3 Generate accented candidates

Support the full Vietnamese character inventory and tone combinations,
including: - ă, â, ê, ô, ơ, ư, đ - All valid tone-marked vowel forms -
Vietnamese syllable onset/rime/tone constraints

Do not implement an enormous hard-coded mapping from fragments to words.

Generate candidates from: - Official gazetteer entries - Local place
index - Verified internal corpus - Vietnamese character/word language
model - Contextual phrase ranking

The gazetteer should be data-driven and versioned.

## 7.4 Final no-diacritic conversion

After selecting the best accented candidate, convert it to the required
Vietnamese ASCII form.

Implement a deterministic Unicode-aware conversion: 1. Normalize to
Unicode NFD. 2. Remove combining diacritic marks. 3. Explicitly map `đ`
to `d` and `Đ` to `D`. 4. Preserve case. 5. Preserve digits and address
punctuation. 6. Normalize whitespace only according to the configured
policy. 7. Do not modify unrelated text outside the approved repair
span.

Test every Vietnamese vowel family and uppercase/lowercase variants.

Examples: - `Đường Nguyễn Huệ` → `Duong Nguyen Hue` - `Phường Đức Hòa` →
`Phuong Duc Hoa` - `Thành phố Hồ Chí Minh` → `Thanh pho Ho Chi Minh` -
`Xã Đắk Lắk` → `Xa Dak Lak`

Do not simply strip accents from the entire workbook without an explicit
output policy.

The user requires no-diacritic Vietnamese output for repaired address
fields. Implement a clear output setting: - `VIETNAMESE_ASCII` ---
selected by default for the user's address-repair workflow. -
`PRESERVE_ACCENTS` --- optional for other use cases.

When the workbook contains non-Vietnamese text, preserve it unless the
user explicitly selects whole-field transliteration.

------------------------------------------------------------------------

# 8. Candidate generation and ranking

The engine must not simply replace each `?` independently.

For each corrupted address span:

1.  Identify suspicious placeholder positions.
2.  Determine whether each `?` is likely a replacement character or
    legitimate punctuation.
3.  Parse the surrounding address components.
4.  Retrieve matching geographic names from the local gazetteer.
5.  Generate variable-length candidates where the corruption mechanism
    justifies it.
6.  Generate accented Vietnamese candidate forms.
7.  Compare candidate token sequences with the local place index.
8.  Check administrative parent-child consistency.
9.  Check street/locality/province consistency.
10. Compare with clean duplicate records and same-asset evidence.
11. Score the complete phrase.
12. Keep the best candidates and the runner-up score.
13. Produce the accented reconstruction and final ASCII output.

### Ranking signals

Use explicit, testable signals: - Exact administrative name match -
Administrative code match - Historical alias match - Province/commune
parent-child validity - Street/place name match - Candidate character
compatibility - Vietnamese syllable validity - Character n-gram
probability - Word/phrase n-gram probability - Context from neighboring
words - Context from other cells in the same row - Repeated verified
address evidence - Numeric anchor preservation - Candidate ambiguity and
score margin

Avoid double-counting correlated signals.

Do not treat the same source copied into two columns as two independent
votes.

A language-model score alone is not proof of a real-world address.

------------------------------------------------------------------------

# 9. Two repair policies: safe and force-complete

The user prefers not to leave corrupted question-mark placeholders in
address spans, and accepts that some low-confidence guesses may be
wrong.

Implement two explicit policies.

## Policy A --- `SAFE_AUTO`

-   Automatically apply only candidates that meet the calibrated safety
    threshold.
-   Preserve ambiguous/unresolved address spans.
-   Report remaining suspicious placeholders.
-   Never claim that all address errors were repaired.

## Policy B --- `FORCE_NO_QUESTION_MARK`

This is the user's requested completion mode and must be available as an
explicit setting.

For every `?` classified as a corruption placeholder inside a Vietnamese
address span:

1.  Use exact trusted matching evidence if available.
2.  Otherwise use official administrative gazetteer matching.
3.  Otherwise use local OSM/place-index matching.
4.  Otherwise use contextual Vietnamese candidate generation.
5.  Otherwise use character-level beam search constrained by Vietnamese
    syllable structure.
6.  Select the highest-ranked candidate even when its confidence is low.
7.  Convert the selected candidate to no-diacritic output.
8.  Verify that the targeted corruption placeholder no longer exists in
    the exported address span.
9.  Mark the repair as `forced_guess`, not `verified`.

If no plausible word candidate exists, use a deterministic final
fallback that removes/replaces the placeholder without leaving `?` in
the targeted address span, but clearly mark the result as
`fallback_lossy` and retain the exact original text in the local
audit/provenance record.

Do not silently apply a lossy fallback.

Do not remove legitimate question-mark punctuation outside a confirmed
corruption span.

Do not alter numeric anchors, parcel identifiers, or unrelated text to
satisfy the no-question-mark requirement.

### Status values

Use explicit statuses: - `verified_source` - `high_confidence_auto` -
`forced_guess` - `fallback_lossy` - `needs_review` -
`unchanged_legitimate_punctuation` -
`rejected_numeric_or_identifier_conflict`

The user may choose force-complete mode, but the UI and report must make
clear that `forced_guess` and `fallback_lossy` are not verified facts.

------------------------------------------------------------------------

# 10. Local model strategy

Do not begin by adding a large cloud LLM.

First improve the deterministic local address pipeline: - Official
gazetteer retrieval - OSM/local place retrieval - Variable-length
masked-token candidate generation - Accent-aware Vietnamese language
model - Phrase-level scoring - Geographic hierarchy validation

If a neural model is justified by benchmark results, evaluate a compact
local Vietnamese model for candidate ranking or diacritic restoration.

The neural model must: - Run locally. - Work offline after
installation. - Never upload workbook content. - Return candidate
alternatives, not unrestricted free-form address rewrites. - Preserve
numeric anchors. - Be versioned and benchmarked. - Be optional if model
assets are unavailable.

Do not claim that an LLM can guarantee correct addresses.

------------------------------------------------------------------------

# 11. XLSX integration

Integrate the address engine into the actual one-click workflow:

`Import workbook → scan every worksheet → detect address spans → recover accented candidates → geographic validation → apply selected policy → convert to Vietnamese ASCII → patch XLSX → reopen output → verify`

Requirements: - Works on unrelated workbook names and structures. - Does
not depend on MAU9. - Applies patches to exact sheet/cell references. -
Handles shared strings safely using copy-on-write. - Preserves formulas
and unrelated cells. - Keeps the original workbook immutable. - Uses the
existing XLSX patcher unless it is proven incorrect. - Verifies actual
exported cell contents by reopening the output package.

The output must be a genuinely modified `.repaired.xlsx`, not merely a
re-compressed copy.

------------------------------------------------------------------------

# 12. Audit and reporting

For every changed cell, record locally:

-   Workbook fingerprint
-   Worksheet name and XML path
-   Cell reference
-   Original value (keep protected; do not expose in telemetry)
-   Selected accented reconstruction
-   Final no-diacritic value
-   Repair status
-   Candidate source
-   Evidence types
-   Geographic components matched
-   Confidence/score and runner-up margin, if calibrated
-   Whether force mode was used
-   Whether lossy fallback was used
-   Engine and gazetteer versions

Do not log customer IDs, tax IDs, borrower names, account numbers, or
full address text to remote services.

The user-facing report should summarize: - Sheets scanned - Address-like
cells scanned - Suspicious address spans - Verified repairs -
High-confidence automatic repairs - Forced guesses - Lossy fallbacks -
Remaining legitimate question marks - Remaining unresolved non-address
question marks - Output verification status

A workbook may be reported as
`ADDRESS_SPANS_COMPLETED_WITH_FORCED_GUESSES`, but never as
`100_PERCENT_VERIFIED` if forced guesses or lossy fallbacks occurred.

------------------------------------------------------------------------

# 13. Google Maps and online-provider privacy controls

Because the workbook may contain collateral/property addresses and
sensitive bank-related information:

-   Local-only mode is the default.
-   Do not upload workbooks automatically.
-   Online lookup is opt-in.
-   Show exactly which address span will be transmitted.
-   Strip unrelated row fields and identifiers before sending.
-   Allow the user to cancel online resolution.
-   Never send customer names, customer IDs, loan IDs, account numbers,
    financial values, or full records.
-   Keep API keys out of source code and browser bundles.
-   Use a secure local/server-side proxy if the application architecture
    requires it.
-   Apply quota limits, rate limits, and cost controls.
-   Follow the current provider's terms for storage, caching,
    attribution, and display.
-   Do not build a permanent local Google Maps address database from API
    responses.
-   If online lookup is disabled or fails, continue with the local
    engine.

------------------------------------------------------------------------

# 14. Regression tests

Create ground-truth fixtures that contain both accented source truth and
no-diacritic output expectations.

Test at least:

### Vietnamese spelling and output

-   `Đường Nguyễn Huệ` → `Duong Nguyen Hue`
-   `Phường Đức Hòa` → `Phuong Duc Hoa`
-   `Thành phố Hồ Chí Minh` → `Thanh pho Ho Chi Minh`
-   `Xã Đắk Lắk` → `Xa Dak Lak`
-   Uppercase/lowercase preservation
-   All Vietnamese vowel and tone families
-   Explicit `đ/Đ` handling

### Geographic reconstruction

-   Missing letters in province names
-   Missing letters in commune/ward names
-   Missing letters in former district names
-   Missing letters in road names
-   Missing letters in village/hamlet names
-   Missing letters in project/industrial park names
-   Ambiguous same-name places in different provinces
-   Historical administrative names
-   Current administrative names
-   Old-to-new administrative mapping without rewriting the original
    historical address

### Corruption patterns

-   One `?` in a token
-   Multiple `?` in one token
-   Multiple corrupted tokens in one address
-   `?` that may be legitimate punctuation
-   Unknown project names
-   Corrupted words mixed with numbers and parcel identifiers
-   Uppercase unaccented text
-   Mixed accented and unaccented text

### Workbook integration

-   Multiple worksheets
-   Unknown sheet names
-   Unknown column names
-   Header row not at row 1
-   Address embedded in a long description
-   Shared-string and inline-string cells
-   Unrelated cells remain unchanged
-   Real exported cells contain final ASCII values

### Force-complete policy

-   Every classified corruption placeholder in an address span is
    removed from the exported span.
-   Every forced guess is marked `forced_guess`.
-   Every lossy fallback is marked `fallback_lossy`.
-   Legitimate punctuation is preserved.
-   No numeric anchors are changed.
-   The report distinguishes complete output from verified accuracy.

Use document-level train/test separation to prevent duplicate addresses
from leaking into both sets.

Report measured precision, coverage, forced-guess rate, fallback rate,
unresolved rate, and output verification pass rate.

------------------------------------------------------------------------

# 15. Implementation order

Execute carefully and sequentially.

## Phase 1 --- Audit

-   Inspect current code.
-   Reproduce address prediction failures.
-   Identify the actual output policy and current `noDiacritics`
    behavior.
-   Trace all stages from prediction to patch.

## Phase 2 --- Unicode and output representation

-   Add accented internal candidate representation.
-   Add tested Vietnamese-to-ASCII conversion.
-   Preserve raw original values.

## Phase 3 --- Address classification and parsing

-   Identify address spans across all worksheets.
-   Parse address components and numeric anchors.
-   Avoid dependence on MAU9.

## Phase 4 --- Geographic data

-   Import official administrative gazetteer.
-   Build historical aliases and validity metadata.
-   Evaluate OSM Vietnam extract and create a compact local index.
-   Document data provenance and licensing.

## Phase 5 --- Recovery and ranking

-   Implement candidate generation.
-   Add accent-aware contextual ranking.
-   Add administrative hierarchy validation.
-   Add internal evidence retrieval.

## Phase 6 --- Optional Google provider

-   Implement only if explicitly enabled.
-   Follow Google API terms and privacy controls.
-   Never make it a required dependency.

## Phase 7 --- Repair policies

-   Implement `SAFE_AUTO`.
-   Implement `FORCE_NO_QUESTION_MARK`.
-   Record forced guesses and lossy fallbacks.

## Phase 8 --- XLSX integration

-   Connect to the real one-click workflow.
-   Patch every affected worksheet.
-   Verify the actual output.

## Phase 9 --- QA

-   Run all existing tests.
-   Run new address and Unicode tests.
-   Run multi-workbook tests.
-   Benchmark the local engine.
-   Report all limitations.

Do not skip phases or declare completion after writing only the address
parser.

------------------------------------------------------------------------

# 16. Definition of Done

The implementation is complete only when:

1.  The address engine works independently of MAU9.
2.  It scans all worksheets and recognizes address spans with unknown
    headers.
3.  It uses Vietnamese geographic data rather than a hard-coded list of
    replacement words.
4.  It uses accented Vietnamese internally for candidate generation and
    ranking.
5.  It writes the selected repaired address in Vietnamese no-diacritic
    form.
6.  It preserves numeric anchors and unrelated content.
7.  It supports safe mode and force-no-question-mark mode.
8.  In force mode, no classified corruption placeholder remains in the
    exported address span.
9.  Forced guesses and lossy fallbacks are explicitly reported.
10. Optional Google lookup is disabled by default and compliant with
    privacy and provider terms.
11. The exported XLSX has been reopened and independently verified.
12. Existing generic Excel repair and MAU9 JSON workflows remain
    functional.

### Final deliverables

-   Working source code.
-   Local Vietnam administrative gazetteer and version metadata.
-   Local place index build/import process and attribution.
-   Optional Google provider documentation and configuration, if
    implemented.
-   Unit and integration tests.
-   Before/after XLSX fixture.
-   Per-cell repair audit.
-   Benchmark report.
-   List of forced guesses, lossy fallbacks, and unresolved cases.

**Final instruction:** Build a specialized, integrated Vietnam
address-recovery engine. Use accented Vietnamese to reason accurately,
then convert only the selected result to the user's required
no-diacritic output. Use geographic evidence to improve place-name
reconstruction. In force-complete mode, do not leave corruption
placeholders in classified address spans, but never misrepresent a
forced guess as a verified address.
