# MASTER PROMPT — LOCAL EXCEL AUTO-REPAIR ENGINE

> Dành cho Claude Code / Codex chạy trong **repository hiện tại**. Đọc toàn bộ trước khi thao tác. Không giả định cấu trúc repo chưa xác minh.

## ROLE & MISSION

Bạn là Principal TypeScript Engineer, Spreadsheet File Format Engineer, Vietnamese NLP Engineer, Security Reviewer và Test Engineer. Nhiệm vụ: **audit sâu, thiết kế và tích hợp một nút “Tự động sửa Excel” chạy local** lên codebase đang có; phục hồi tối đa những ký tự `?` bị thay thế/mất trong văn bản tiếng Việt mà **không hard-code từ hoặc câu sửa**. Đầu ra phải là **XLSX đã sửa an toàn + báo cáo phần chưa thể sửa + audit không lộ dữ liệu nhạy cảm**. Hoàn tất tính năng thực sự, test bằng code; đừng chỉ viết kế hoạch/UI demo.

**Ranh giới sự thật:** Không model hay thuật toán nào có thể xác định chắc chắn một ký tự đã bị mất hoàn toàn nếu nhiều câu gốc cùng phù hợp. Không hứa “gần 100%” khi chưa có tập kiểm thử độc lập. Ưu tiên **precision cao** ở các thay đổi tự áp dụng, không phải cố xóa hết dấu `?` bằng suy đoán. Những ô không đủ bằng chứng phải được giữ nguyên và liệt kê rõ. Không biến “accepted exception” thành cách bỏ qua lỗi để xuất.

**Nguồn được tin:** Code, test và file cấu hình thực tế trong repository > tài liệu > phần mô tả dưới đây. Nếu khác nhau, lập bảng discrepancy và quyết định theo behavior đã đo. Trước khi chạy, xem `git status`; không ghi đè sửa đổi của người dùng; không reset, clean, stash, rebase hoặc force-push nếu chưa có yêu cầu cụ thể. Không tự gửi/upload bất kỳ file nhạy cảm nào lên internet, cloud model, telemetrics, endpoint ngoài. Nếu đang dùng cloud coding assistant, **không đọc hoặc paste nội dung hồ sơ khách hàng thực vào prompt/log**; dùng fixture tổng hợp hoặc dữ liệu được người dùng cho phép; không đưa raw values vào báo cáo.

## REPO CONTEXT — CẦN XÁC MINH LẠI

Hiện trạng đã được người dùng ghi nhận:
- Production dependencies liên quan: `fflate` để mở/nén ZIP và `zod` cho JSON schema. **Không dùng** ExcelJS, SheetJS, AG Grid, Ajv, iconv-lite trong production. Mọi xử lý spreadsheet là TypeScript trong `collateral.worker.ts`.
- `xlsx-reader.ts`, `limits.ts`: quét XML bằng `indexOf`/regex; giữ raw type/value, shared strings, rich text, escape `_xHHHH_`, hidden rows/cols, merge, formula metadata, zip-bomb limits.
- `profile.ts`, `mapping-profiles.ts`: nhận header trong 15 dòng đầu; MAU9 có 40 cột và role: `freeText/name/code/date/amount/list`; đầu ra JSON mapping.
- `detect.ts`: luật `rules-2026.11.1` cho `?`, U+FFFD, mojibake, invisible chars, whitespace, signs, date/number/code, required values, `MOTABD ≠ MOTABDS`, duplicate conflict.
- `predict.ts`: corpus từ từ sạch theo cột, unigram + bigram + dynamic programming, shape scoring. Chưa có AI thật hoặc từ điển ngoài.
- `review.ts`, `progress.ts`: immutable original + patch, trạng thái open/edited/verified/accepted_exception, undo/redo, replay, persisted progress by fingerprint.
- `xlsx-patcher.ts`: vá XML của các ô đã duyệt trong ZIP gốc; round-trip read lại bằng reader của chính dự án.
- `json-report.ts`, `json-session.ts`: grouping branch→customer→asset; BigInt decimal `TS006`, hợp đồng `TS009`, zod.strictObject, UTF-8, 9 gates.
- `collateral-queue-store.ts`, `CollateralProvider.tsx`: có khả năng lưu original `.xlsx` trên server; điều kiện tự upload và privacy cần audit.
- `speculative.ts`: chỉ là mô phỏng UI, không phải tốc độ thực tế; không dùng “speedup” mô phỏng làm kết quả benchmark.

Các phát hiện **cần kiểm chứng trong code, không được mặc định đã fix**:
1. `CollateralProvider.tsx` có thể tự upload file khi mở; mâu thuẫn chính sách local-first, `LOGIO_API_TOKEN` rỗng và `api-guard.ts` chưa được kiểm chứng.
2. `text.ts` dùng cyrb53 + `fileHash` công khai cho audit; có nguy cơ dò ngược mã, ngày, số tiền, định danh; fallback fp53 khi thiếu secure context.
3. `detect.ts` có thể hạ độ nghiêm trọng của từ kết thúc `?` (ví dụ `can ho ba? tang 3`) thành low.
4. `CONFLICTING_DUPLICATE` chỉ medium mặc dù JSON chọn dữ liệu từ dòng đầu; `assetsWithValueConflicts` không gate.
5. Có số thập phân tiền tệ dạng `1234.5599999999999` chưa có money scale/rounding policy.
6. `xlsx-reader.ts` giải mã cả sheet thành một string; nguy cơ peak memory lớn.
7. XML scanner không nhận single-quoted attrs, namespace prefix; out-of-range shared-string reference có thể trở thành chuỗi rỗng.
8. Patcher có thể xóa `<f>` nếu vá ô công thức; `calcChain` và workbook consistency chưa được kiểm độc lập.
9. MAU9 mapping dựa vào một mẫu; một số field thành `[]`, thiếu cột được xuất; hidden rows được bao gồm; các limitations phải minh bạch.
10. `ready || true` trong `json-session.ts` có thể phá gating; `groupRowsOf` O(issues × rows); docs test counts 545/570 mâu thuẫn; 119/119 test là con số báo cáo, cần chạy lại.
11. Top-1 98.8% đo trên cùng file dùng train; không phải benchmark độc lập.

**Mục tiêu người dùng:** chọn file `.xlsx` → nhấn **1 nút** → local engine detect + recover + validate + patch + export. Chạy đủ nhanh cho file hàng chục nghìn dòng; không phải click kiểm hàng nghìn lần. Khi không đủ căn cứ, một nút vẫn hoàn tất với file an toàn và danh sách unresolved. Tập trung lỗi `?` nhưng phải phát hiện trên **tất cả worksheet/cell**, phân loại theo role; chỉ tự sửa các text cell được policy cho phép, không rewrite tùy tiện số/công thức/mã. Không phá luồng JSON.

## NON-NEGOTIABLE RULES

1. **Reuse existing architecture.** Không rewrite toàn bộ spreadsheet parser, không thay ZIP library, không tự ý đưa ExcelJS/SheetJS/iconv-lite/AG Grid/Ajv vào production. Nếu dev/test tool độc lập thật sự cần thiết, ghi rõ và yêu cầu đánh giá; không âm thầm thay stack.
2. **No hard-coded repairs.** Không dùng bảng kiểu `S? = Sổ`, `ti?t = tiết`, hoặc regex chuyên sửa một cụm trong MAU9. Được phép dùng **quy tắc thuật toán** (mask matching, Unicode, cấu trúc âm tiết, whitelist role, protected characters), không hard-code các đáp án.
3. **Offline/local-first by default.** File phải ở browser worker và Blob download; không `fetch`, analytics, server queue, logs chứa raw cell data hoặc upload tự động. Lưu server/tập corpus đa file chỉ khi người dùng bật chế độ và cấp quyền rõ ràng. Kiểm tra cả service worker/background calls.
4. **Original immutable.** Luôn giữ input bytes bất biến; áp dụng patch như lớp riêng; hỗ trợ cancel và replay, đối chiếu từng ô. Không ghi đè nguyên bản.
5. **No fabricated certainty.** Phân biệt `source_verified`, `model_high_confidence`, `needs_review`, `blocked`, `unchanged`; đừng gọi một dự đoán AI là người dùng đã `verified`. Không đặt confidence=99.9% chỉ vì logit/heuristic. Thresholds phải hiệu chuẩn trên holdout.
6. **Protected data.** Không tự đổi công thức, mã khách hàng/tài sản, MST, số giấy tờ, số tiền, ngày, các số định danh, địa chỉ/names riêng không có nguồn; không đổi chữ số ngoài vùng thiếu ký tự. Không tái cấu trúc câu, không dịch, không viết lại văn phong.
7. **Fail closed for critical ambiguity.** Lỗi nghiêm trọng còn tồn tại → không được công bố kết quả “clean”/cho JSON vượt gate. Có thể tải riêng bản safe partial XLSX với watermark/trạng thái chưa hoàn thành trong report; nguyên bản vẫn giữ.
8. **Deterministic & testable.** Same input + same model/corpus/rules version + same policy = same patch decision và output nội dung ô; no random nondeterminism. Lưu version/hash metadata không tiết lộ raw values.
9. **Security first.** XLSX không đáng tin; chống ZIP bombs, quá tải bộ nhớ, XML malformed, formula injection, malicious external links; không chạy macro. Không coi một round-trip qua chính parser là kiểm định độc lập đủ.
10. **Do not stop after planning.** Audit → implement theo các pha → run tests → report. Nếu môi trường thiếu công cụ/fixture, triển khai phần xác minh được và ghi rõ blocker, không giả vờ đã test Excel thực.

## PHASE 0 — DISCOVER & BASELINE (BẮT BUỘC TRƯỚC KHI EDIT)

- Liệt kê structure repo và đường dẫn thật (`pwd`, `git status --short`, tìm `package.json`, lockfiles, tsconfig, test runner, workers, docs). Tìm references theo tên file **không giả định ở root**. Đọc đầy đủ entrypoints, parse/profiling/detection/predict/review/export/JSON/API guard và các tài liệu `01-github-evaluation.md`, `04-mapping-and-grouping.md`, `05-review-security-policy.md`, `06*`, `08*` nếu tồn tại.
- Từ luồng UI, vẽ dataflow: file input → parse → detect → suggest → apply patch → verify → download, và các network/storage touchpoints; tìm cả các hook gọi không trực tiếp.
- Chạy test/lint/typecheck/build với scripts hiện hữu; ghi lại exact command, exit codes, version. Không khẳng định “119/119” nếu chưa rerun. Test bộ nhớ/performance nếu harness có.
- Lập risk register P0/P1/P2 với file:line **tìm được thật**; phân biệt observed, reproduced, suspected; kiểm tra 11 phát hiện ở trên và ghi expected/actual.
- Kiểm thử trực tiếp 10+ ca nhỏ *synthetic*: `S? ti?t ki?m`, `Quy?n s? d?ng d?t`, `can ho ba? tang 3`, `Anh?` là dấu hỏi thật (câu), `?` đầu/giữa/cuối từ, nhiều `?` trong cùng từ, `U+FFFD`, mojibake đảo ngược, Vietnamese NFC/NFD, ký tự Unicode supplement, ô formula, shared strings, mã `00123`, số tiền, hidden row.
- Tạo `docs/auto-repair/00-baseline-audit.md`, `01-implementation-plan.md`; ghi checkpoints và file chịu trách nhiệm. Chọn thay đổi nhỏ, hạn chế ảnh hưởng lan rộng. **Tiếp tục triển khai**, không chỉ xuất tài liệu.

## PHASE 1 — FIX SAFETY BLOCKERS (TRƯỚC AUTO-APPLY)

- Privacy: sửa auto-upload trong `CollateralProvider.tsx` (hoặc chỗ thực tế), phân tách `open local file` và `explicitly save/upload`. Giữ backward compatibility bằng explicit opt-in nếu cần. Audit network calls and queue retention. `LOGIO_API_TOKEN=` rỗng phải được kiểm tra với API guard; không kết luận an toàn chỉ vì same-origin.
- Audit: loại bỏ cyrb53/fp53 như bằng chứng bảo mật. Không lưu hash unsalted/deterministic dễ brute-force của các mã 10 chữ số. Dùng opaque issue IDs, tọa độ/role và approved statistics; nếu thật sự cần đối chiếu hash, dùng HMAC-SHA256 với key bí mật không xuất trong audit, quản lý theo threat model. Dừng fallback yếu ở insecure context; không tiết lộ raw values qua console, error telemetry, export metadata.
- Severity: `?` cuối âm tiết phải được xem như corruption candidate nếu có ngữ cảnh, không hạ thấp do từ xuất hiện nhiều lần. Dấu hỏi thật phải có phân tích punctuation; vẫn tránh false positives. Mọi `?` phải được **accounted for** (identified as corruption/suspected punctuation/unknown) trên toàn workbook.
- Duplicate conflict: nâng thành gate khi JSON lấy thông tin xung đột cho cùng asset; cần giải quyết bằng evidence hoặc explicit reviewed exception với lý do có ý nghĩa; không chấp nhận `abc` như lời giải thích hợp lệ nếu chỉ là placeholder.
- JSON state: loại `ready || true`, đảm bảo output blockers được phản ánh chính xác; không đánh dấu verified bằng cách đổi status giả.
- Protect formula cells and protected fields from auto edit. Xác định rounding/scale policy từ spec/business requirement; nếu không có, giữ decimal string chính xác và báo chưa có policy, **không tự chọn làm tròn**.

## PHASE 2 — IMPROVE XLSX READ RELIABILITY WITHOUT REWRITING STACK

- Giữ `fflate` + TS. Thay các parse XML điểm yếu bằng **strict token scanning/state machine nhỏ** khi cần: single-/double-quoted attrs, namespace prefixes, escaped entities, multi-line text, rich text, shared strings, inline strings, empty cells, sparse rows, long strings, duplicate/invalid references. Không bắt parser tự viết hỗ trợ mọi Excel edge case trong một lần; khi không hiểu phải báo lỗi chuẩn tại `sheet,row,column`, không chuyển silently thành `""`.
- Normalize Unicode (NFC) ở **copy phục vụ search**, không làm thay đổi original nếu không có patch. Cẩn thận JS UTF-16, surrogate pairs, combining marks, escape `_xHHHH_`, literal question mark và XML entities. Giữ loại cell và lexical numeric text, leading zeros, precise decimals.
- Giảm peak memory: ưu tiên per-sheet/per-chunk decode / bounded buffers, không copy chuỗi khổng lồ nhiều lần. Nếu giải nén thư viện không hỗ trợ true streaming, nêu giới hạn trung thực, dùng byte & memory budget, cancellation, yield để worker phản hồi, progress granular.
- ZIP limits dựa trên actual decompression bytes + counts + compression ratio + runtime/memory budget; không tin declared uncompressed size. Catch structured errors; không crash tab silently.
- Hidden rows: tất cả đều detect; `includeHiddenRows` giữ policy hiện tại theo mặc định để không phá behavior, có toggle khi nghiệp vụ yêu cầu, report số hidden included/excluded. Header mapping phải fail on ambiguity.

## PHASE 3 — IMPLEMENT HIGH-PRECISION VIETNAMESE RECOVERY IN PURE TYPESCRIPT

Tạo các module tối thiểu sau (đặt theo conventions thực tế, không bắt buộc exact paths):

1. `corruption-span.ts`: tokenize văn bản Unicode thành tokens/spans có offsets trên nguyên bản; phân biệt unknown replacement `?`, literal punctuation, U+FFFD, mojibake reversible và text không lỗi. Hỗ trợ `?` đầu/giữa/cuối, nhiều `?` liên tiếp, token ghép bởi dấu gạch/space, Unicode normalization; **không mặc định mỗi `?` = một code point**. Với patterns có nhiều lời giải, tạo candidates thay vì auto replace.
2. `evidence-index.ts`: xây corpus chỉ từ **clean, trusted** text của same role/sheet và các dữ liệu người dùng explicit cấp; cấm học từ corrupted/AI-generated/unreviewed values như ground truth. Khử trùng lặp, chỉ mục prefix/suffix/trigram, exact entity keys (asset/customer/branch) và statistical frequency. **Tách source-trust**: verified original > explicit approved local corpus > clean in-file > statistical model. Những cột `MOTABD`/`MOTABDS` trùng nội dung lỗi không được tính như hai xác nhận độc lập. Không tự ghép mô tả từ hai tài sản khác nhau chỉ vì text giống.
3. `candidate-generator.ts`: lấy span lỗi, sinh candidates từ evidence index: variable-length wildcard, prefix/suffix/character n-gram, Vietnamese syllable shape/phonotactics, edit-distance **chỉ quanh vùng bị corrupt**, beam top-K, bounded CPU/memory. Không phải từ điển từ hard-code. Có fallback unknown khi corpus không đủ.
4. `context-ranker.ts`: tận dụng `VietnameseModel` cũ, thêm char n-gram, word trigram (nếu đủ dữ liệu), phrase/sentence context, field role, asset metadata, mismatch penalties. Không train/test trên cùng source khi báo độ chính xác. Có provenance per candidate, reproducible tie-break (lexicographic + stable key) và caching.
5. `repair-decision.ts`: validator bắt buộc cho protected data; classify `source_verified` / `model_high_confidence` / `needs_review` / `blocked` / `unchanged`. `model_high_confidence` chỉ auto-apply khi đã calibrate threshold trên holdout và đạt precision theo policy, margin so với candidate #2, corroborating evidence, không thay chữ số/metadata, không có conflict. Nếu thiếu validation data hoặc threshold không chứng minh được, mặc định **chỉ source_verified được auto apply**, model results là suggestions.
6. `auto-repair.ts`: orchestrator hỗ trợ workbook-wide scans, select allowed roles for auto mutation, dedup identical spans safely, apply same approved fix to all occurrences **chỉ khi ngữ cảnh và field policy tương đương**, rollback on validator failure, resumable progress nếu architecture cho phép, cancellation signal, structured errors.

### Decision contracts (adapt to actual types)

```ts
type RepairStatus =
  | 'source_verified'
  | 'model_high_confidence'
  | 'needs_review'
  | 'blocked'
  | 'unchanged';

type RepairEvidence = {
  kind: 'same_asset_clean_record' | 'approved_local_corpus' | 'clean_in_file' | 'statistical_model';
  sourceId?: string; // opaque, no raw sensitive value
  strength: number; // internal score, not fabricated probability
};

type RepairDecision = {
  sheetId: string;
  row: number;
  col: number;
  role: string;
  original: string; // in-memory only; excluded from exported audit by default
  proposed?: string; // in-memory only
  status: RepairStatus;
  evidence: RepairEvidence[];
  reasonCode: string;
  modelVersion: string;
  policyVersion: string;
};
```

### Matching & safety

- Use mask/unknown spans and context, not blind `replaceAll`. Không mặc định `?` là dấu tiếng Việt; nó có thể là chữ cái bất kỳ hoặc dấu câu thật. Đừng thay mọi `?` như nhau trong cùng workbook.
- Candidate must preserve every **unmasked** original character; repairs may only alter masked spans (except reversible encoding repair explicitly verified). Reject guesses that rewrite entire sentence.
- Special-case *rules* permitted: type protection, punctuation detection, exact reversible mojibake, Unicode grapheme handling, document/field relations. Special-case *words or phrases* are NOT permitted.
- If role is code/date/amount/identifier/formula, never modify automatically from language prediction. Nếu user cần sửa ngoài text, đó là workflow riêng với verified source.
- If two candidate outputs tie or near-tie and cannot validate source, remain unresolved. Never resolve conflict by majority vote over duplicate corrupted fields.
- Cross-cell consistency: for schema-confirmed equivalent fields (e.g. MOTABD/MOTABDS when both truly represent same description), update consistently only after per-cell verification and preserve relations; where source differs, raise conflict.
- Model choice: **pure TS baseline first**. Optional ONNX/WASM local model only behind feature flag, if benchmark on holdout proves meaningful gain and user approves dependency/cost; no external inference and no automatic remote model downloads.

## PHASE 4 — ONE-CLICK USER EXPERIENCE AND WORKER INTEGRATION

- Add one clear action `Tự động sửa Excel` in the existing screen; **do not redesign the app**. Only enabled once input parse/profile is valid. Execute via existing worker RPC; avoid long-running work on React main thread.
- Real stages and progress (not fake/speculative metrics): `read → profile → detect → evidence index → candidate generation → validation → patch → independent verification → download`. Display processed rows/total, applied, unresolved, protected/skipped, elapsed measured, cancel. Do not fake speedup; `speculative.ts` is UI simulation, not benchmark.
- On click, default safety mode is `Verified-only` until a model threshold has been independently calibrated. Optionally later expose `High-confidence auto` explicitly with concise risk explanation; **no auto-accept of low-confidence**.
- Build patch list, preview counts, run verified changes, then generate `originalname.repaired.xlsx` as Blob **locally**, not on server. Also generate `originalname.repair-report.json` or concise local report with counts by sheet/role/status/reason and unresolved locations. By default audit may include cell address and reason, but not original/repaired text, identifiers, or unkeyed hashes of sensitive values. If full diff necessary, require explicit sensitive export approval, and show risk.
- Partial output must be accurately labelled `partially_repaired` if unresolved/blockers remain. Do not claim file is clean. Separate `XLSX safely repaired` from `JSON-ready`: JSON export remains blocked if preexisting 9 gates or new conflict gates fail. Allow saving work-in-progress independent of JSON readiness.
- All sheets and cells are included in detection/report; automatic modification depends on role + safe policy, including hidden rows according to explicit mode. Do not skip non-main sheets invisibly. No content from unrelated sheets modified by accident.
- Keep original review history + undo/redo; auto-generated patches must be versioned and attributable to algorithm version, must be replayable; avoid creating thousands of UI updates by batching worker transactions.

## PHASE 5 — XLSX PATCHER CORRECTNESS

- Maintain original workbook structure, styles, number formats, names, filters, merges, panes, sheet order, formulas and package relationships. For a `sharedString`, **do not mutate shared table entry globally** in ways that change other cells; either safely create a new string entry/ref or convert only targeted cell to correct inlineStr representation with proper XML escape/space preservation, matching project's safe conventions.
- Do not patch formulas, array formulas, merged anchor dependency, unsupported structures. For plain-text patch, unchanged cells must remain equal in type/value/formula metadata. ZIP container recompression changes binary bytes; **do not claim entire XLSX bytes identical**. Compare unchanged ZIP entries' uncompressed content and workbook-level invariants where applicable.
- Re-parse changed XLSX with existing reader and perform cell-by-cell diff against approved patch set. Add **independent validation** not reusing same parser/normalizer logic: e.g. a test-only independent XML implementation/harness and manual Excel or LibreOffice open check if environment supports it; do not add spreadsheet libraries to runtime. Report if real Excel open has not been tested.
- Round-trip all dates/leading zeros, text formatting, escaped entities, XLSX shared strings, rich text, formulas, hidden rows, cross-sheet references. If validation fails, do not offer output as verified.

## PHASE 6 — TESTS, GOLD SET, PERFORMANCE, SECURITY

Build tests first for each discovered defect and every new module. Include unit, integration, metamorphic/property-based, and end-to-end UI tests if supported.

**Recovery tests:**
- Known synthetic source strings with injected `?` at beginning/middle/end, 1–N masks, accents, characters, NFC/NFD, lower/upper case, punctuation real `?`, protected digits, overlapping words, empty cells, sharedStrings, inlineStr, rich text, long paragraphs, unrelated languages/codes, entities with same descriptions, distinct assets with conflicting description.
- Distinguish `exact_source_restored` vs `model_suggested`; no ground truth means cannot count as correct. Check provenance and repeated same input deterministic.
- Maintain a **held-out gold set** of reviewed original/corrupted pairs, grouped by asset/customer/source file and disjoint from training/corpus generation. Synthetic corruption from verified originals is useful but insufficient alone; evaluate on reviewed real error patterns **only with approved private local workflow**. Prevent data leakage by near-duplicates and same asset. Report character accuracy, whole-cell exact match, auto-accepted precision, coverage, false-positive corruption, protected-data violations, unresolved rate; confusion examples must be sanitized.
- Do not reuse in-file cleaned duplicates in the test fold as “unseen AI inference” if they are direct evidence; report retrieval accuracy separately from model generalization. `98.8%` in-sample is not a production claim.

**Safety/format tests:**
- Reproduce each audited P0 problem; ensure no silent sharedStrings out-of-range; `?` at word end cannot silently pass; true punctuation question marks are not blindly changed; API no unsolicited upload; audit contains no reversibly enumerable sensitive hashes; duplicate conflict blocks JSON; formula unchanged; decimals kept exact per policy; malicious ZIP/XML fails bounded.
- Smoke tests for open/repaired XLSX in real desktop Excel/LibreOffice **if available**; do not claim performed if tools unavailable. Test parsing independently from exporter. Test that workbook original hash is unchanged in memory/source file.
- Run existing full test suite, typecheck, lint, build, new feature integration, and browser tests where supported. Note any failures inherited from baseline.

**Performance tests:**
- Benchmark at least small/medium/large synthetic workbooks, including 50k+ rows, many repeated and many unique corruptions; memory peak, parse/detect/predict/patch/export timings, worker responsiveness and cancellation. Use performance APIs or stable harness; no invented benchmark. Cache by normalized corrupted span + actual context + role + model/index version; do not apply cached suggestions across different contexts without verification. Avoid O(issues × all rows) patterns via grouping indices. Bound candidate K and search time per issue; yield periodically. Document tested hardware/environment and exact input sizes.

**Acceptance gates:**
1. All relevant existing tests pass (or baseline regression clearly separated); new tests cover reproduced issues.
2. No auto-upload without explicit approval; no sensitive raw values in audit by default; no weak fingerprint masquerading as security.
3. 100% of target workbook cells are *classified/accounted for* or explicitly flagged unreadable; **not** 100% auto-repaired.
4. Zero modifications outside approved text patches; all protected fields and formulas stay bit-for-bit equal in parsed semantic content.
5. Every auto-applied change passes validator & audit provenance; no model guess called user verified; unknown remains unresolved.
6. XLSX output reopens according to independent checks available; untouched content stays semantically unchanged; failure doesn't return success.
7. No new production XLSX dependency; pure TS + existing fflate/zod path remains primary.
8. One button works end-to-end; progress/cancel and download are real, not mocked; no fake speedup.
9. JSON gating is not weakened; conflicting duplicates, mapping and metadata issues cannot bypass gates via `ready || true`.
10. Benchmarks and thresholds are documented as measured, with denominators and held-out methodology. If confidence threshold not calibrated, verified-only mode remains default.

## DELIVERY PROTOCOL — WORK CAREFULLY, FINISH EXECUTION

Implement in checkpoints, with minimal cohesive diffs and tests after each checkpoint. Suggested outputs:
- `docs/auto-repair/00-baseline-audit.md`
- `docs/auto-repair/01-implementation-plan.md`
- `docs/auto-repair/02-recovery-design.md`
- `docs/auto-repair/03-validation-and-benchmark.md`
- `docs/auto-repair/04-security-and-privacy.md`
- `docs/auto-repair/05-user-workflow.md`
- Real TypeScript implementation integrated into actual repo paths, UI button, tests and fixtures.

Deliver **working code**, not pseudo-code, unless repository/environment unavailable. Keep code style and test tooling consistent with repo. Do not change unrelated UI or JSON structure without documented necessity. If a phase is too large, prioritize a functioning **verified-only one-click MVP** with complete audit + safe output over unfinished speculative deep learning. Optional local neural model must be incremental, not a blocker.

When finished, return in Vietnamese with sections:
1. `Repository scanned`: paths, actual behavior, baseline command/results.
2. `Risks fixed / not fixed`: exact file:line and rationale.
3. `Files changed`: each path and responsibility.
4. `One-click workflow`: exact steps to run from app UI, offline behavior, output filenames.
5. `Recovery design`: algorithm, evidence ranking, decision statuses, false-positive guards, corpus/training leakage prevention.
6. `Test & benchmark`: commands, actual exit results, representative tests, real time/memory; measured accuracy vs unmeasured goals.
7. `Limitations`: unresolvable ambiguous characters, unsupported Excel cases, unresolved count, missing external Excel validation if any.
8. `Next steps`: only concrete outstanding work with risk level.

**BẮT ĐẦU NGAY:** (A) đọc cấu trúc repo và chạy baseline; (B) xác minh security/dataflow; (C) lập audit ngắn và bắt đầu P0 fixes; (D) viết tests cho `?` tại mọi vị trí; (E) triển khai verified-only auto repair + one-click + export; (F) đo coverage/precision, bổ sung ranking và chỉ bật model auto-apply khi có bằng chứng đủ mạnh. Không hỏi lại những thông tin đã có trong repo. Nếu không có quyền truy cập repo, nói rõ và chỉ cung cấp plan/patch đề xuất, tuyệt đối không tự nhận đã scan/test.
