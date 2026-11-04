# MASTER PROMPT — COLLATERAL INTELLIGENCE RECOVERY ENGINE V2
## Deep repository audit · Domain-specific Vietnamese collateral recovery · Synthetic corruption lab · Offline knowledge · One-click XLSX repair · ASCII output

> **PRIMARY IMPLEMENTATION SPECIFICATION FOR CLAUDE CODE / CODEX**  
> Supersedes earlier address-only, generic Auto-Repair and zero-patch prompts where they conflict.  
> Work inside the **existing repository**, not in a new demo application.  
> **No paid API, no cloud AI, no runtime internet, no upload of real customer files.**

---

## 0. User's actual problem and the current baseline

The existing application has a working Excel reading/patching/export pipeline and a local Vietnam address-recovery pipeline. It is no longer enough to focus on place names: many remaining `?` placeholders occur in **bank collateral/property descriptions and associated rights**, such as:

- Quyền sử dụng đất (land-use rights)
- Quyền sở hữu nhà ở và tài sản khác gắn liền với đất
- Nhà ở, nhà xưởng, nhà kho, công trình, chung cư, căn hộ, dự án
- Tài sản hình thành trong tương lai
- Xe ô tô, xe tải, máy móc, dây chuyền thiết bị, tàu, phương tiện
- Tiền gửi, sổ tiết kiệm, giấy tờ có giá (carefully distinguish document evidence from securities)
- Hàng tồn kho, hàng hóa, nguyên vật liệu
- Quyền tài sản, khoản phải thu và quyền phát sinh từ hợp đồng
- Nội dung đăng ký, sở hữu chung/riêng, thế chấp, bảo đảm, tình trạng pháp lý

The user's priorities are:

1. **One-click automatic repair** inside the existing Excel UI.
2. **Universal across arbitrary XLSX workbooks, columns and every worksheet**, independent of MAU9.
3. **Vietnamese with accents for internal reasoning**, then **Vietnamese without diacritics (ASCII)** for the final repaired text.
4. **Greatly reduce/eliminate corrupted `?` placeholders** in relevant Vietnamese text, not merely in addresses.
5. User explicitly accepts some guessing errors in an optional **FORCE mode**, but all such guesses must be auditable and distinguished from verified facts.
6. **No paid APIs, no external model calls, offline after setup**.
7. Minimize unnecessary rewrites; improve what works.

### Baseline findings provided by the user; recheck against actual code

- Test command: `node --experimental-strip-types --test "src/components/sites/collateral/**/*.test.mjs"`
- Reported result: **202 pass, 0 fail, 1 skipped**.
- Typecheck: `npm run typecheck` reported clean.
- Existing MAU9 run: **10,764 repaired cells**, **5,479 unrepaired cells** (from prior reports, not freshly verified in this task).
- Prior address-model holdout was **synthetic**, not real addresses: word accuracy 97.8%, whole-address accuracy 85.3%; high-margin 99.2%; `forced_guess` 52.5%.
- **CRITICAL: `contextual_auto` measured only ~76% (165 words) despite expecting ~98%**. This automatic-accept category is currently unsafe until independently recalibrated.
- Independent Python verification test was skipped on the reported environment. Self-validation using the app's own reader is weaker than external verification.
- ~11 MB workbook reportedly took ~61 seconds; worker peak memory not measured.

**Do not present these as newly measured facts. Reproduce every claim possible using the actual repo and fixtures. Document which metrics are not reproducible.**

### Important product distinction

*No corrupted `?` remaining* is an output-completion requirement. It is **not** a claim of correct reconstruction or correct legal facts. Build two clearly labeled deliverables: (a) best-effort completed Excel, (b) machine-readable audit and uncertainty report. Never silently replace an uncertain ownership/right/status with a legally meaningful assertion.

---

## 1. Non-negotiable boundaries

- Preserve TypeScript + current Web Worker + `fflate` XLSX processing, review/patch/export infrastructure where it is sound.
- Do not add ExcelJS, SheetJS, or AG Grid as production dependencies merely to simplify this task. Dev-only independent verification tools are permitted if documented and kept out of production.
- Preserve every sheet; scan every eligible text cell regardless of profile/header/sheet name.
- Keep MAU9 JSON mapping independent of generic XLSX repair.
- No hard-coded corrupted-word-to-answer dictionary. **Domain taxonomies, templates, grammar rules and reference corpora ARE permitted**; they are not direct substitution tables.
- Do not change formulas, financial values, dates, contract numbers, land-parcel/map-sheet numbers, house numbers, VIN/chassis/engine numbers, registration IDs, certificate IDs, percentages, ownership fractions, loan/customer identifiers, or other protected anchors.
- Do not expand abbreviations, silently modernize administrative names or rewrite clauses beyond approved spans without explicit policy.
- Do not claim legal validity or ownership verification from text alone.
- Keep original workbook immutable; all changes are explicit, versioned patches.
- Do not write real customer data into committed tests, source control, public training data, logs, or cloud conversations.
- Full offline runtime once local models/data are installed. Dataset download is a separate opt-in installation/update stage.

---

## 2. Phase 0 — Audit actual repository and reproduce current behavior

Inspect real equivalents of:

`xlsx-reader.ts`, `limits.ts`, `profile.ts`, `mapping-profiles.ts`, `detect.ts`, `predict.ts`, `review.ts`, `progress.ts`, `xlsx-patcher.ts`, `session.ts`, `json-report.ts`, `json-session.ts`, `collateral.worker.ts`, `CollateralProvider.tsx`, `ReviewStep.tsx`, repair/export buttons, local address and gazetteer modules, corpus/dataset builders, tests and documentation.

Trace:

`Import → workbook/sheet discovery → text extraction → corruption detection → domain classification → evidence retrieval → candidate generation → contextual decoding → safety gates → selection → ASCII transform → patch → export → independent verification`.

Produce `docs/collateral-recovery-v2/01-baseline-and-root-causes.md` with:

- Current call graph, data contracts, and which modules are tied to MAU9 or address-only routing.
- Exact reasons non-address `?` remain: not detected? classified as unknown? no corpus? no candidates? margin too low? unsafe protected spans? patch rejected? shared-string handling?
- Per-stage counters **per worksheet AND per domain**, not just global totals.
- Audit of `contextual_auto` threshold and source of the claimed calibration.
- Real test run, typecheck, build, lint, browser smoke results; mark unrun checks explicitly.
- Which user-supplied metrics can/cannot be reproduced.

Create at least one failing regression test **before the implementation** showing a non-address property/legal description containing `?` remains unrepaired even though a correct candidate is present in a controlled local corpus.

**Do not stop after analysis. Continue implementing.**

---

## 3. Architecture: make the scope collateral-wide, not address-only

Retain the generic worksheet scanner and XLSX patcher. Replace an address-only prediction router with a **multi-domain recovery orchestrator**.

Suggested logical interfaces (adapt to the real repository; do not generate unnecessary files):

```ts
type TextDomain =
  | 'land_use_right'
  | 'house_and_building'
  | 'land_attached_asset'
  | 'future_asset'
  | 'vehicle_and_transport'
  | 'machinery_equipment'
  | 'inventory_and_goods'
  | 'deposit_and_valuable_papers'
  | 'property_rights_and_receivables'
  | 'ownership_and_security_status'
  | 'geographic_address'
  | 'general_collateral_description'
  | 'unknown';

type RepairEvidence = {
  sourceType: 'same_asset_clean' | 'verified_internal' | 'domain_corpus' |
              'official_terminology' | 'geographic_index' | 'language_model';
  sourceVersion: string;
  referenceId?: string;
  matchedSpan?: string;
  independentlyVerified: boolean;
};

type RepairProposal = {
  sheetId: string;
  cellRef: string;
  rawOriginal: string;
  spanStart: number;
  spanEnd: number;
  domainCandidates: Array<{ domain: TextDomain; score: number }>;
  accentedCandidate: string;
  finalAscii: string;
  alternatives: string[];
  evidence: RepairEvidence[];
  decision: 'verified_match' | 'safe_auto' | 'forced_guess' |
            'fallback_lossy' | 'needs_review' | 'rejected';
  protectedAnchorChanges: string[];
  engineVersion: string;
  datasetVersions: string[];
};
```

Required components:

1. **Workbook-wide corruption scanner** — all text cells, all sheets, includes unknown columns.
2. **Multi-label domain classifier** — a cell can contain both address and land-right description, or both equipment and contract rights.
3. **Span-level semantic parser** — identify geographic, asset, ownership/right, document, qualifier and negation spans.
4. **Collateral ontology & lexicon** — versioned, sourced canonical Vietnamese accented terms plus ASCII aliases, abbreviations, document patterns, synonyms and asset subtype relationships.
5. **Evidence retrieval** — trusted same-record/same-asset matches, clean workbook phrases, local domain corpus, geographic data.
6. **Accent-aware candidate lattice** — generate Vietnamese candidates, including repairs of `?` inside words and whole missing tokens.
7. **Context decoder** — rank the complete phrase using domain-conditioned signals, not isolated `?` replacement.
8. **Legal-semantic invariant validator** — protect relationships and polarity.
9. **Policy engine** — SAFE vs FORCE with explicit statuses and risk-tier exclusions.
10. **ASCII normalization** — only after candidate selection.
11. **XLSX patch & independent verification** — actual cells changed, unrelated cells preserved.
12. **Per-domain audit/evaluation** — real performance, not synthetic-only accuracy.

Keep domain modules optional and composable; absence of an address dataset must not disable machinery/inventory/property-right recovery.

---

## 4. Build a full collateral-language ontology (not merely a word list)

Implement a versioned, data-driven **Vietnamese Collateral Domain Knowledge Base** with hierarchical types, relationships, phrase patterns and protected semantics. Begin with the categories below; expand based on real anonymized failures and actual corpus distribution. A type taxonomy assists language understanding; it does NOT determine legal eligibility for security.

| Domain group | Important subtypes / language contexts |
|---|---|
| Land use | Quyền sử dụng đất, đất ở, đất nông nghiệp, đất trồng cây lâu năm, thửa đất, tờ bản đồ, diện tích, mục đích/thời hạn sử dụng |
| Attached property | Quyền sở hữu nhà ở, công trình, nhà xưởng, kho bãi, vật kiến trúc, tài sản khác gắn liền với đất, cây lâu năm |
| Homes and projects | Nhà riêng lẻ, căn hộ chung cư, nhà ở thương mại, nhà ở hình thành trong tương lai, dự án, block, tầng, căn số |
| Transport | Xe ô tô, xe tải, xe đầu kéo, xe chuyên dùng, mô tô, tàu/thuyền, phương tiện và đăng ký liên quan |
| Machinery | Máy móc, thiết bị, máy xây dựng, máy sản xuất, dây chuyền công nghệ, máy phát điện, máy xúc, máy bơm bê tông |
| Inventory | Hàng tồn kho, nguyên vật liệu, thành phẩm, hàng luân chuyển, kho hàng, sản lượng, khối lượng |
| Deposits/financial papers | Sổ tiết kiệm, tiền gửi, chứng chỉ tiền gửi, trái phiếu, cổ phiếu, giấy tờ có giá, tài khoản được mô tả trong hồ sơ |
| Property rights | Quyền đòi nợ, khoản phải thu, quyền phát sinh từ hợp đồng, quyền khai thác, quyền sở hữu trí tuệ trong mô tả tài sản |
| Ownership/security | Chủ sở hữu, đồng sở hữu, người sử dụng đất, bên thế chấp, bên nhận thế chấp, nghĩa vụ bảo đảm, đã/chưa đăng ký, hiện có/hình thành trong tương lai |
| Evidence/documents | Giấy chứng nhận, số phát hành, số vào sổ, giấy đăng ký phương tiện, hợp đồng mua bán, hợp đồng thế chấp, hóa đơn, biên bản, phụ lục |
| Geographic | Tỉnh/thành, xã/phường, địa chỉ, đường, thôn/ấp, khu dân cư, dự án, khu công nghiệp, tên địa danh lịch sử |

**Important distinctions to model explicitly**:

- `quyen su dung dat` vs `quyen so huu nha o` vs `tai san gan lien voi dat` are not interchangeable.
- `giay chung nhan` is a documentary reference and must not automatically be interpreted as a `giay to co gia`.
- `so tiet kiem` (saving passbook) vs `so` (number); same corrupted ASCII prefix `S?` may mean different words.
- `tai san hien co` vs `tai san hinh thanh trong tuong lai` are different states.
- `da` vs `chua` / `khong` vs positive verb are different polarity.
- `the chap`, `cam co`, `bao lanh`, `giu ho`, `chuyen nhuong`, `cho thue` are different relations: NEVER rewrite one to another merely for language fluency.
- `chu so huu`, `nguoi su dung`, `ben bao dam`, `ben nhan bao dam` are different roles.
- Land use and land-attached property can be described separately; do not force their rights into a combined ownership statement.

Reference concepts from applicable Vietnamese civil/property law and banking-domain documents, but **do not convert text normalization into legal certification**. Record source citations and effective-date metadata. Accept archived historical terminology when a source document is old.

Sources to consult/verify during corpus preparation:

- Civil Code 2015, Articles 105, 107, 115 (asset categories and property rights): https://m.thuvienphapluat.vn/van-ban/quyen-dan-su/bo-luat-dan-su-2015-296215.aspx
- Government Decree 21/2021/ND-CP (security obligations; asset-related terminology): https://thuvienphapluat.vn/van-ban/Quyen-dan-su/Nghi-dinh-21-2021-ND-CP-huong-dan-Bo-luat-Dan-su-bao-dam-thuc-hien-nghia-vu-468069.aspx
- Land Law 2024 (land-use and attached-property terminology): https://xaydungchinhsach.chinhphu.vn/toan-van-luat-dat-dai-119240221224513596.htm
- Official administrative data, historical gazetteer and offline OSM index from the previous phase.

**Verify current legal texts and amendments when preparing the dataset**. Source data is for vocabulary, phrase patterns and domain constraints, not for deciding legal validity.

### Data representations

Store structured records such as:

- `conceptId`, `conceptType`, `parentConceptId`, `relations`
- `canonicalAccented`, `canonicalAscii`, `aliasesAccented`, `aliasesAscii`
- `examples`, `phraseTemplates`, `cooccurrenceContext`
- `protectedOpposites`, `negationScope`, `semanticRole`
- `sourceRef`, `sourceType`, `license`, `validFrom`, `validTo`, `sourceVersion`

No per-word hard-coded `? → value` answers. All candidates must be derived from allowed corpus/index/models.

---

## 5. Source material and data isolation

Create a multi-source LOCAL corpus:

**Tier A: verified contextual evidence**
- Clean text for the same asset/property record, only where exact and reliable asset identifiers match.
- Clean phrases from other sheets of the same workbook.
- User-confirmed historical repairs (opt-in to reuse across jobs).

**Tier B: specialized canonical vocabulary**
- Legal/professional terminology from permitted documents and standards.
- Category-specific asset labels and phrase patterns.
- Verified anonymized enterprise templates, when permitted.

**Tier C: broad linguistic and geographic evidence**
- Licensed Vietnamese text corpus for spelling and phrase probabilities.
- Offline place/admin knowledge base.
- Generic Vietnamese syllable/character models.

Maintain provenance. Do not treat two identical corrupted copies as independent evidence, and never train on the model's own forced guesses as if they were ground truth.

Privacy:
- Internal/real files remain local; do not upload/send to cloud coding tools, web APIs or dataset repositories.
- Synthetic tests should not preserve real names, borrower information, contract numbers or precise real collateral addresses.
- Deduplicate and de-identify corpus. Provide data retention / opt-out controls.

---

## 6. **Synthetic Collateral Corruption Lab** — central new capability

Build an offline **simulation/data augmentation pipeline** that generates realistic asset descriptions, then deliberately corrupts their text to train, evaluate and debug the recovery model. This is NOT a UI simulation. It must use real ground-truth strings generated from permitted canonical examples and versioned templates.

### 6.1 Create a structured synthetic generator

Parameterize combinations of:
- Asset type/subtype (land, apartment, machinery, vehicle, inventory, rights, deposits, etc.)
- Legal/semantic role (owner, land user, mortgage provider, secured party, etc.)
- Asset condition (existing, future, under construction, completed, registered, not registered, etc.)
- Description templates (short label; long narrative; inventory list; property certificate; mixed address+rights; contract reference)
- Order and phrasing variations (uppercase, lowercase, abbreviations, punctuation, whitespace, no-diacritic source, partially accented source)
- Geographic labels using permitted local indexes; synthetic identifiers, never actual customer identifiers
- Numeric anchors (parcel, map sheet, engine/chassis numbers, registration, area, quantity, price, dates, percentages) with safe fabricated values
- Domain-specific hard negatives (pairs that are similar in spelling but different in legal meaning)
- Mixed-domain descriptions: land + house; equipment + warehouse; future apartment + contract rights; vehicle + registration; inventory + warehouse address

Generator records must retain:

```ts
type SyntheticRecord = {
  syntheticId: string;
  templateId: string;
  assetDomains: string[];
  accentedTruth: string;
  asciiTruth: string;
  corruptedInput: string;
  corruptionPositions: number[];
  protectedAnchors: string[];
  semanticSlots: Record<string, string>;
  corruptionPatternIds: string[];
  split: 'train' | 'validation' | 'test';
  seed: number;
};
```

### 6.2 Learn actual corruption distribution from safe aggregates

First profile the current set of real Excel files **locally** and extract counts, not identifiable texts:
- `?` in first, middle or last character of a token
- One vs multiple question marks in a token
- Number of corrupted tokens per cell
- Real token lengths, casing, separators, abbreviations
- Frequency by category/worksheet/cell role
- Strings with mojibake and U+FFFD (separate error types)
- The amount of otherwise clean surrounding context

Use aggregate frequencies to shape synthetic corruption. Do **not** assume all `?` represent exactly one lost character.

### 6.3 Corruption operators

Generate realistic damaged views from known clean truth using:
- Replace one Unicode code point with `?`
- Replace multiple letters independently with `?`
- Replace a span with one `?` (variable-length loss)
- Replace whole short tokens with `?`
- Remove accents but preserve letters (ASCII input)
- Mixed accent loss + question-mark loss
- First-/middle-/end-of-token corruption
- Uppercase/abbreviation damage
- Whitespace/separator errors, punctuation loss
- Mojibake and U+FFFD as separate input families, when supported
- Mixed corruption modes and clean negative examples

Keep true question punctuation intact in negative tests.

### 6.4 Hard negatives and meaning inversion

Explicitly generate close examples where guessing can reverse legal meaning:
- `quyen su dung` vs `quyen so huu`
- `da dang ky` vs `chua dang ky`
- `duoc cap` vs `chua duoc cap`
- `dong so huu` vs `so huu rieng`
- `co` vs `khong`
- `hien co` vs `hinh thanh trong tuong lai`
- `the chap` vs `cam co`
- `tai san` vs `giay to`/`quyen tai san`
- `so tiet kiem` vs `so [ma dinh danh]`

Never let a fluent text model overrule protected semantic slots without strong corroborating original/source evidence.

### 6.5 Avoid evaluation leakage

- Split **by template family, asset identity, underlying canonical phrase and source document**, not only random damaged copies.
- Do not place the clean version of a test description into a retrieval index used by that test.
- Deduplicate near-identical train/test phrases.
- Fixed seeds for reproducibility; run multiple seeds for robustness.
- Keep a blind test set untouched during tuning.
- Synthetic scores MUST be labeled synthetic; never claim real-file accuracy from synthetic scores alone.

### 6.6 Curriculum and variants

Train/evaluate progressively:
- Easy: one corrupt letter, strong local context, known domain
- Medium: multiple corruptions and common abbreviations
- Hard: multiple corrupted words, mixed asset types, missing column headers
- Adversarial: ownership/polarity contradictions, similar legal terms, numeric anchors, unknown names
- Unknown/OOD: entirely new terms/types; safe abstention or forced but labeled guesses

Generate balanced coverage; avoid evaluating only frequent phrases such as `quyen su dung dat`.

### 6.7 Feedback learning

User-verified corrections may be saved into an encrypted/local permission-scoped training set. Only `verified_by_human` and independently verified source matches may become trusted new corpus entries. Do not promote `forced_guess` or `fallback_lossy` to ground truth automatically.

---

## 7. Candidate retrieval and decoding strategy

Build a **collateral-aware retrieval-augmented decoder**, not merely a one-word fuzzy matcher.

### Step A: detect type and spans

Recognize subspans of:
- Domain asset descriptions
- Rights/ownership/security relation
- Property documents and identifiers
- Geography/address
- Generic Vietnamese connective text
- Numeric/technical protected anchors

Use multi-label routing. An address embedded in a description of land-use rights must receive both geographic and legal-domain context.

### Step B: retrieve candidates

Use:
- Verified same-asset clean instances
- Similar clean phrases in workbook
- Domain term/phrase index
- Local geographic gazetteer
- Character n-gram index / wildcard `?` matching
- Weighted edit distance / length-variable masks
- Phrase templates (with semantic slots)
- Vietnamese syllable and word models

Use candidate provenance. Limit search by likely domain and context, but provide a fallback cross-domain search if classifier uncertain.

### Step C: generate accented internal candidates

Support complete Vietnamese Unicode, including tone variants, `ă â ê ô ơ ư đ`, uppercase/lowercase and NFD/NFC. Generate candidates over entire phrases, preserving clean spans and anchors.

Prefer canonical licensed/verified candidates to generated free-form completions. For non-geographic common phrases, use domain-specific phrase probabilities, not a geographic database.

### Step D: rank with domain semantics

Use a composable, calibrated score with signals:
- Character alignment to the corrupted form
- Amount of changed text outside masked spans (large penalty)
- Exact corpus/domain phrase match
- Domain/subtype relevance
- Phrase-level n-gram likelihood
- Vietnamese orthographic validity
- Source reliability
- Geographic hierarchy compatibility
- Coherence among asset, right, owner and document roles
- Negation and temporal/status compatibility
- Same-asset verified evidence
- Numeric/identifier anchor preservation (hard gate)
- Margin from runner-up and ambiguity

Do not rely only on `unigram + bigram` or a single scalar `contextMargin`.

### Step E: protect semantic invariants

Maintain a **locked semantic-slot layer**:
- Ownership vs land-use rights
- Secured party vs property owner
- Mortgaged vs pledged, where context distinguishes
- Present vs future asset
- Affirmative vs negated legal status
- Certificate/document type
- Asset existence/status
- Quantity/unit and all numbers/codes

A model cannot infer a legal/ownership fact from dictionary fluency alone. If the candidate changes a protected semantic relationship that is not unambiguously supported by the source, reject in SAFE mode. In FORCE mode, mark as **high-impact uncertain** and use an explicitly non-assertive fallback or separate exception, not an invented verified fact.

### Step F: convert selected accented text to ASCII

Do this ONLY after selecting the accented candidate:
1. Normalize NFD.
2. Remove combining accents.
3. `đ → d`, `Đ → D`.
4. Preserve case, digits, punctuation, technical symbols and identifiers.
5. Patch approved damaged spans, not clean unrelated text.

Examples (illustrative; not mapping rules):
- `Quyền sử dụng đất` → `Quyen su dung dat`
- `Tài sản gắn liền với đất` → `Tai san gan lien voi dat`
- `Sổ tiết kiệm` → `So tiet kiem`
- `Nhà ở hình thành trong tương lai` → `Nha o hinh thanh trong tuong lai`

---

## 8. Repair modes and handling residual `?`

The user wants no remaining corruption placeholders, but must not be told that every guessed term is factual.

### `SAFE_AUTO`

- Apply verified exact matches and candidates backed by calibrated high precision **per domain and risk tier**.
- `contextual_auto` with measured 76% accuracy must be **disabled or downgraded from automatic acceptance** until independent re-evaluation shows it meets the stated policy.
- Do not auto-accept legal polarity/ownership/registration assertions based on language likelihood alone.
- Leave uncertain corruption unresolved and export honest report.

### `FORCE_COMPLETE_TEXT` — explicit opt-in, user-requested

- Scope may cover **all suspected Vietnamese text corruption**, not just addresses: asset type, legal description, collateral documents, machinery, vehicles, deposits, inventory, rights and general connective text.
- Use all local evidence and domain-aware decoding; select best candidate even when low confidence where the risk policy permits.
- Record `forced_guess` on every low-confidence replacement.
- On HIGH-IMPACT LEGAL SEMANTIC SLOTS that cannot be reliably inferred, **do not silently invent a legal fact**. Use the explicitly visible non-assertive text `KHONG XAC DINH` (or user-configured equivalent without `?`) and status `fallback_lossy` rather than fabricating ownership, registration, or security status. Store original value and original masked span in protected local audit. This meets the no-`?` output request, but it is *not* a successfully reconstructed fact.
- For lower-impact linguistic gaps with no plausible candidate, use a documented non-assertive fallback with `fallback_lossy` status; do not simply drop `?` without tracing it.
- Preserve legitimate question punctuation and protected codes/identifiers. In cases where the `?` is in a protected identifier, do not invent digits/letters; output can mark the affected field as unresolved under a separate explicit exception, rather than quietly corrupt the identifier.
- Add an optional report sheet or sidecar CSV/JSON indicating exact cell, original, repaired, risk tier, decision and provenance. Do not insert explanatory annotation into protected input fields unless the user explicitly chooses that output mode.

Use statuses:

- `verified_exact_source`
- `safe_auto_domain_calibrated`
- `forced_guess`
- `fallback_lossy`
- `needs_review`
- `blocked_protected_anchor`
- `legitimate_question_mark`
- `error_unscanned`

Define **two separate success metrics**:

1. `question_mark_completion_rate`: percent of classified corruption placeholders removed or replaced in the chosen scope.
2. `ground_truth_reconstruction_accuracy`: percent that match verified originals on labeled samples.

Never conflate the two.

---

## 9. Experimental design and honest calibration

### 9.1 Re-evaluate the model first

Existing reported `contextual_auto ≈76%` is a critical blocker. Diagnose:
- Calibration leakage
- Overly optimistic synthetic corruption patterns
- Score/margin not comparable across domains
- Wrong category router
- Retrieval collisions (same text, different asset roles)
- Lack of real ground truth
- Incorrect confidence estimation

Disable auto acceptance for the affected class until the failure is addressed. Add risk-tier/domain-specific thresholds and abstention gates. SAFE policy should privilege precision over coverage; FORCE policy should privilege coverage with transparent audit.

### 9.2 Real-file evaluation requirement

Synthetic simulation is a development tool, not final evidence. Build a **local, human-reviewed evaluation set** from real workbooks (no external data transfer), ideally 300–1,000 varied corrupted text snippets or a representative full sample if available. Include multiple domains and document families, not only common real-estate terms. Every expected output must be confirmed from an authoritative record or reviewed by a domain expert; an inferred guess is not ground truth.

Measure separately:
- Detection recall / false positives
- Candidate recall@1 / recall@5
- Exact ASCII word and phrase accuracy
- Exact full-cell accuracy
- Accuracy by domain and risk tier
- SAFE precision and coverage
- FORCE accuracy, guessed rate, lossy-fallback rate
- Protected semantic-slot changes, polarity flips and invented legal facts (target zero)
- Unintended numeric/identifier modifications (must be zero)
- Remaining corrupted `?` by sheet/domain/status
- Production file runtime and peak worker memory

### 9.3 Mandatory ablation and baseline comparisons

Compare on the SAME frozen holdout:
1. Existing `predict.ts` baseline
2. Existing address-only model
3. Domain corpus retrieval only
4. Domain-aware candidate generation + ranker
5. Domain-aware + synthetic corruption training
6. Optional compact local neural reranker if measured and justified

Only promote improvements whose performance is demonstrated on held-out real descriptions. Do not report that creating more synthetic examples proves production accuracy.

---

## 10. Optional local neural model — only when justified

If tests show deterministic domain/phrase decoding saturates:

- Evaluate a small locally installed Vietnamese model (masked LM/seq2seq/ONNX), OFFLINE runtime.
- Use retrieval-restricted candidate ranking and span restoration, not unrestricted rewriting of whole collateral records.
- Freeze numeric and semantic anchors before inference.
- Prefer rescoring top-N candidates from verified domain corpus and template grammar.
- Do not use cloud APIs or silently fetch models at runtime.
- Quantify added disk size, memory, latency and quality improvement.
- Keep this optional; no model asset means deterministic engine still works.

Training or fine-tuning must be on licensed/public materials and explicitly permitted, de-identified local documents; do not use confidential loan data as cloud training inputs.

---

## 11. XLSX integration and QA

The working one-click UI should execute:

`Import XLSX → scan all worksheets → classify spans → domain/geography retrieval → candidate generation → context decode → policy gating → ASCII conversion → patch exact cells → export XLSX → reopen and verify → report`

Required counters per sheet:

- `textCellsScanned`
- `suspectedCorruptionCells`
- `addressCorruptions`
- `collateralCorruptionsByDomain`
- `candidatesGenerated`
- `verifiedRepairs`
- `safeRepairs`
- `forcedGuesses`
- `lossyFallbacks`
- `blockedAnchors`
- `remainingQuestionMarks`
- `verifiedChangedCells`
- `scanStatus`

Never mark an unscanned sheet as clean. Never label mere ZIP recompression as repair. Handle shared strings copy-on-write and preserve styles, formulas and unaffected cells.

### Independent output verification

The current external Python test was skipped. Implement an **independent test-only validator** runnable in the available environment, such as a separate OOXML reader based on a *different* XML parsing implementation or a test-only dependency. It must not reuse the exact same production XLSX reader. Optionally verify with Excel/LibreOffice in a separate QA environment when available.

If this independent validator cannot run, show a clear QA failure or `verification_degraded`; do not quietly count app-reader revalidation as independent verification.

Verify actual changed cell values plus unchanged protected cells and all worksheet relationships. Test unseen non-MAU9 workbooks.

### Performance

Baseline is reportedly ~61 s on 11 MB: measure real wall-clock time, candidate lookups, inference time, export time and worker memory. Improve through unique-string deduplication, LRU caching keyed by corpus/model version, batched candidate generation and indexed search. Do not compromise traceability or cross-record evidence checks in the name of speed.

---

## 12. Specific regression matrix

Include synthetic ground-truth fixtures for all categories, with examples such as these (illustrative strings are *tests*, never production replacement mappings):

| Corrupted input | Plausible intended ASCII result | Domain |
|---|---|---|
| `Quy?n s? d?ng d?t` | `Quyen su dung dat` | Land-use rights |
| `T?i s?n g?n li?n v?i d?t` | `Tai san gan lien voi dat` | Attached property |
| `Nha ? h?nh thanh trong tuong lai` | `Nha o hinh thanh trong tuong lai` | Future housing |
| `C?n h? chung cu` | `Can ho chung cu` | Apartment |
| `S? ti?t ki?m` | `So tiet kiem` | Savings document |
| `M?y m?c thi?t b?` | `May moc thiet bi` | Machinery |
| `Xe ? to t?i` | `Xe o to tai` | Vehicle |
| `Hang t?n kho` | `Hang ton kho` | Inventory |
| `Quy?n ph?t sinh t? h?p d?ng` | `Quyen phat sinh tu hop dong` | Contract property rights |
| `D?ng s? h?u` | `Dong so huu` | Co-ownership |
| `G?y ch?ng nh?n` | `Giay chung nhan` | Supporting document |
| `B?m b? tong c?n` | `Bom be tong can` | Construction equipment |

For each category also create:
- Short/long descriptions, multiple clauses, mixed domains, uppercase/lowercase, ASCII/accented text.
- Missing one or many letters and different error positions.
- Headerless Sheet2/Sheet3 workbook, hidden sheet, repeated shared string, rich text and formulas.
- Same corrupted surface with different correct readings depending on sentence context.
- Legitimate question punctuation, `?` inside codes, unknown proper noun and out-of-distribution types.
- Semantic hard negatives: ownership vs use, present vs future, mortgage vs pledge, registered vs unregistered.
- No data leakage: split by template family, asset identity and source, fixed seeds.

**Never rely on 202 passing legacy tests alone.** Add meaningful failing-to-passing E2E tests for collateral domains previously unhandled.

---

## 13. Required deliverable files and phase gates

Create documentation in `docs/collateral-recovery-v2/`:

1. `01-baseline-and-root-causes.md` — real call graph, reproduced failures, metrics.
2. `02-domain-ontology-and-sources.md` — category tree, terms, legal-semantic protected slots, source attribution and license.
3. `03-synthetic-corruption-lab.md` — generator, operators, leakage prevention, sample counts, seeds and splits.
4. `04-retrieval-and-decoding.md` — multi-domain candidate search, ranking, accented→ASCII.
5. `05-repair-policies-and-audit.md` — SAFE/FORCE, semantic risk gates, residual `?` classification.
6. `06-benchmark-and-calibration.md` — existing vs new on synthetic AND independently reviewed real samples.
7. `07-xlsx-integration-and-verification.md` — changed-cell evidence, independent validator, compatibility.
8. `08-handoff-and-known-limits.md` — exact commands/results, unresolved work and limitations.

Deliver code and tests, not docs alone. Each phase must end with reproducible commands and actual outcomes.

**Implementation order:**

1. Audit real code and reproduce non-address failures.
2. Stop unsafe `contextual_auto` automatic acceptance in SAFE mode.
3. Decouple domain routing from address-only and MAU9.
4. Create collateral ontology/phrase corpus with provenance.
5. Build synthetic asset-description generator and corruption simulator.
6. Add domain-aware retrieval and accented candidate generation.
7. Add semantic-slot invariants, protected anchors and risk-aware ranking.
8. Add SAFE and FORCE_COMPLETE_TEXT policies.
9. Integrate real one-click worker/UI/XLSX patching.
10. Add independent, non-skipped output verification.
11. Benchmark on held-out synthetic and locally reviewed real descriptions.
12. Profile worker memory/time, run typecheck/build/lint/browser smoke.
13. Produce handoff report with measured numbers and clearly labeled unverified claims.

Do not stop after a plan; implement sequentially. Never claim a phase is complete on compilation alone.

---

## 14. Definition of Done (strict)

- [ ] Works on arbitrary supported XLSX workbooks and EVERY worksheet, including unrelated non-MAU9 files.
- [ ] Understands and classifies all major categories of collateral descriptions, not just addresses.
- [ ] Has a locally sourced, versioned collateral ontology and phrases with source provenance.
- [ ] Generates realistic balanced synthetic corruption data across asset forms and legal statuses.
- [ ] Uses accented Vietnamese for internal inference and writes Vietnamese ASCII to target repaired spans.
- [ ] Handles multi-word/multi-placeholder corruption with context and cross-domain evidence.
- [ ] Does not blindly change owner, property right, negation, registration/security status or protected identifiers.
- [ ] SAFE mode uses independently calibrated thresholds; the previous 76%-accurate `contextual_auto` is not silently accepted.
- [ ] FORCE mode can complete corrupted Vietnamese text with explicit forced-guess/lossy-fallback accounting.
- [ ] Distinguishes output-completion rate from actual reconstruction accuracy.
- [ ] Keeps real/customer data local, private and out of public training/code artifacts.
- [ ] Patches actual XLSX cells and independently validates exported workbook.
- [ ] Passes tests, typecheck and feasible production/browser QA; skipped verification is disclosed.
- [ ] Reports per-domain/per-sheet results on a genuine real-file holdout when one has been securely made available; otherwise states "REAL-WORLD ACCURACY NOT VERIFIED".
- [ ] Does not break existing MAU9 JSON conversion or already working address repair.

### The one-sentence requirement

**Transform the existing address-biased question-mark fixer into a universal, free, offline, collateral-domain-aware Vietnamese text recovery system that can infer missing words in many asset types, output unaccented Vietnamese, run one-click on all XLSX sheets, and never pretend forced guesses are verified facts.**
