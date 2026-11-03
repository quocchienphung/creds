# MASTER DEBUG PROMPT — ZERO-PATCH AUTO-REPAIR (CLAUDE CODE / CODEX)

> Dán toàn bộ prompt này vào Claude Code hoặc Codex ở thư mục gốc repository. Đây là nhiệm vụ **điều tra và sửa bug thật**, không phải yêu cầu tạo kế hoạch, demo, hoặc viết lại engine. Thực hiện tuần tự, chậm rãi, có bằng chứng trước/sau. Khi hoàn tất phải có XLSX đầu ra thực sự thay đổi nội dung ở các ô được phép sửa, hoặc giải thích định lượng tại sao không thể tự sửa một ô nào.

## VAI TRÒ VÀ MỤC TIÊU

Bạn là Staff/Principal TypeScript engineer, XLSX/OOXML engineer, Vietnamese text-recovery engineer, test engineer và security reviewer. Nhiệm vụ: debug end-to-end hành vi **nút Auto Repair tạo ra `.repaired.xlsx` nhưng nội dung ô không thay đổi**; sửa bug và tăng khả năng khôi phục ký tự `?` trên **toàn bộ worksheet**, bảo toàn dữ liệu nhạy cảm và các cấu trúc Excel.

**Bằng chứng thực tế đã được xác nhận độc lập:**
- Input: `MAU9_20260930 ok(2).xlsx`.
- Output hiện tại: `MAU9_20260930 ok.repaired.xlsx`.
- Hai file ZIP có SHA-256 khác nhau và kích thước khác nhau **nhưng cả 11 phần được giải nén trong OOXML đều giống nhau từng byte**, bao gồm `xl/worksheets/sheet1.xml`, `xl/worksheets/sheet2.xml`, `xl/sharedStrings.xml`. Kết luận: **0 thay đổi nội dung Excel**, output chỉ bị re-compress. Không được tuyên bố đã sửa thành công.
- Thống kê từ input dựa trên cell references tới shared strings chứa dấu `?`:
  - Sheet `MAU9_20260915`: tổng **7.514 ô chứa `?`**; cột `V`: **3.732**; `AK`: **3.732**; còn có `S` (39), `T` (5), `W` (4), `AJ` (1), `G` (1).
  - Sheet `Sheet1`: cột `B` có **3.773 ô chứa `?`**.
  - Tổng theo hai sheet: **11.287 ô chứa `?`**, không phải 11.287 lỗi được xác nhận; có thể có dấu hỏi dấu câu hoặc dữ liệu sao chép.
  - `xl/sharedStrings.xml` có 261.879 mục `si`; 6.639 mục chứa `?`.
- Khi bạn chạy thử tại repo, hãy tự tái tạo các con số nếu có đủ file và ghi rõ sai khác với phiên bản input khác. Không sửa engine để hard-code các con số này; đây chỉ là regression fixture.

**Không được phán đoán nguyên nhân khi chưa chạy instrumentation.** Khả năng cần kiểm tra: không phát hiện lỗi; lỗi bị hạ severity; candidate trống; scoring/threshold loại hết; UI không apply gợi ý; `review` chưa `verified`; pipeline không chuyển accepted decisions thành patches; sai sheet/row/column; shared-string cell `t="s"` không được xử lý; writer ghi ngược `original`; writer tạo patch nhưng bỏ qua; round-trip verify chỉ đối chiếu các ô expected empty; output download dùng buffer ZIP gốc; xử lý `Sheet1` bị bỏ qua.

## QUY TẮC KHÔNG THỂ THƯƠNG LƯỢNG

1. **Source code thực tế có ưu tiên cao hơn tài liệu.** Đọc đúng implementation, không bịa API/file/đường dẫn. Thấy không khớp thì ghi discrepancy.
2. **Không thêm ExcelJS/SheetJS/AG Grid/Ajv/iconv-lite vào production**, không viết lại app. Giữ TypeScript + `fflate` + `zod`, Web Worker, original immutable, patch layer, tiến độ, undo/redo, JSON gates.
3. **Không hard-code** các mapping `S? → Sổ` hoặc danh sách riêng MAU9. Test fixture được phép có expected strings; production algorithm không được chứa danh sách sửa tay.
4. **Không upload/đọc log dữ liệu khách hàng lên dịch vụ ngoài**. Không gửi file thật vào cloud LLM; nếu agent đang chạy cloud và file thật ở local, chỉ xử lý bằng script cục bộ, đưa về console các con số và mẫu đã mask; dùng synthetic fixture cho các giá trị phải đưa vào ngữ cảnh AI.
5. Không thay ô formula, mã định danh, số tiền, mã khách hàng/tài sản, địa chỉ/tên riêng không có bằng chứng, số ngày tháng; không biến predicted thành verified. Duy trì export gates và ngăn sửa nhầm ô sạch.
6. Không fake status, không cố ép `accepted` cho tất cả để tạo file khác. **0 accepted patches phải là “không thể tự sửa an toàn”, không phải “Repaired successfully”.**
7. Không overwrite file gốc, không commit/reset/clean/stash các thay đổi của người dùng.
8. Làm đến mức code có test và UI thực thi được. Không dừng ở báo cáo/audit hay prompt khác.

## PHASE A — SCAN DEEPLY / TẠO BASELINE ĐỘC LẬP

- Đọc `git status`, `package.json`, test runner, worker messages, lifecycle component, reader, detection, `predict.ts`, `review.ts`, `progress.ts`, `xlsx-patcher.ts`, JSON gates, browser download code; tìm đúng module qua code search.
- Trace từ `onClick` tới final `new Blob`/download: **input bytes → parse cell → issue → candidates → decision → patch → writer → ZIP → download**. Ghi tên file + hàm + dòng thật cho từng chặng.
- Tạo `docs/auto-repair/zero-patch-investigation.md` với sơ đồ call graph, giả thuyết, minh chứng, tests baseline và root cause. `git diff` phải có phạm vi rõ.
- Run `typecheck`, `lint`, test, build nếu scripts tồn tại, ghi chính xác lệnh và kết quả. Không nhận claim “119 passed” nếu chưa chạy lại.
- Nếu 2 file thực tế có sẵn trong môi trường coding agent, chạy **independent OOXML compare**: enumerate ZIP entries → giải nén → SHA-256 trên *uncompressed* bytes → so toàn bộ workbook parts. Test này bắt buộc tồn tại trong dev/test. Nếu chưa có file, làm test synthetic tương đương và ghi rõ chưa chạy fixture thực.
- Tạo một XLSX tổng hợp có `t="s"` shared strings, `inlineStr`, text chứa `?` ở đầu/giữa/cuối từ, Unicode NFC/NFD, escaped XML, merge, hidden row, valid punctuation, formulas, numeric identifiers; bảo đảm test không chứa thông tin khách hàng.

## PHASE B — THÊM OBSERVABILITY (KHÔNG GHI GIÁ TRỊ NHẠY CẢM)

Tạo một đối tượng thống kê bất biến cho **mỗi job + mỗi worksheet**, ví dụ:

```ts
type RepairMetrics = {
  sheetsScanned: number;
  rowsScanned: number;
  textCellsScanned: number;
  cellsContainingQuestionMark: number;
  suspectedCorruptions: number;
  legitimatePunctuation: number;
  protectedCells: number;
  candidatesGenerated: number;
  candidatesRanked: number;
  sourceVerified: number;
  modelAutoAccepted: number;
  unresolved: number;
  patchProposals: number;
  patchTargetsUnique: number;
  patchesCommitted: number;
  outputCellsChanged: number;
  outputUnexpectedChanges: number;
};
```

- Mọi stage phải report metrics lên UI (không report raw cell values). Lưu `reasonCode` cho từng trường hợp không sửa: `NO_CANDIDATE`, `LOW_CONFIDENCE`, `AMBIGUOUS`, `PROTECTED_ROLE`, `FORMULA`, `CONFLICT`, `PATCH_NOT_APPLIED`, `OUTPUT_UNCHANGED`, `PARSER_ERROR`, v.v.
- Đặt assert invariants:
  - `outputCellsChanged <= patchesCommitted <= patchTargetsUnique <= patchProposals` (điều chỉnh nếu writer cho phép nhiều patch/1 ô, và giải thích chính xác);
  - khi `sourceVerified + modelAutoAccepted > 0`, `patchesCommitted` phải >0 trừ trường hợp no-op được giải thích;
  - mọi accepted decision phải ánh xạ đúng một cell coordinate có sheet identifier ổn định;
  - `outputUnexpectedChanges === 0`; các thay đổi thật phải đối chiếu với expected patch set;
  - nếu `cellsContainingQuestionMark > 0 && outputCellsChanged === 0`, **hiện trạng thái `NO_REPAIR_APPLIED`**, kèm phân tích reason histogram; cấm `SUCCESS_REPAIRED`.
- Sau khi có metrics, chạy test và xác định **điểm đầu tiên trong pipeline số lượng rơi về 0**. Đây là mục tiêu chính, không tối ưu model trước khi biết vấn đề.

## PHASE C — FAILING TEST REPRODUCE ZERO-PATCH

Tạo tests làm đỏ trước khi fix; tối thiểu:

1. Với synthetic XLSX có một đoạn văn lỗi có nguồn tham chiếu rõ ràng, `detect` phải trả issue ở cell thực, `candidate` phải có ít nhất một đáp án phù hợp; decision có thể `source_verified`, writer phải thay giá trị ở đúng cell.
2. Reproduction test cho `?` giữa từ, `?` cuối từ (`can ho ba? tang 3`), nhiều `?`, 1 ký tự hay một cụm bị mất. Phân biệt dấu `?` hợp lệ cuối câu; không tự thay nếu không đủ chứng cứ.
3. End-to-end **UI click → worker response → accepted patch → ZIP bytes → downloaded XLSX → independent parser**. Mock network để bảo đảm 0 upload.
4. Case chỉ có ambiguity: zero patch là kết quả đúng nhưng UI phải nói rõ `NO_REPAIR_APPLIED`, không gọi `.repaired.xlsx` như file sửa thành công.
5. Shared-string `t="s"`: nếu hai cell cùng tham chiếu một string index, chỉ cell được chấp nhận thay, cell còn lại không bị cập nhật ngoài ý muốn. Không patch toàn cục `sharedStrings.xml` nếu gây side effects.
6. XLSX công thức/số/chính xác decimal/leading zeros/merged/hidden/rich text/style/sheet không mục tiêu giữ nguyên.
7. `Sheet1!B...` phải được scanner phát hiện như các cột khác; không giới hạn V/AK hay active sheet.

## PHASE D — FIX END-TO-END BUG THEO NGUYÊN NHÂN THẬT

- Đọc logic thực và fix tại chặng làm mất kết quả. Không thay bừa thresholds cho đến khi chứng minh vấn đề nằm ở thresholds.
- Tách riêng **detection eligibility**, **candidate generation**, **acceptance policy**, **patch application**, **ZIP serialization**. Các contract phải typed và có assert.
- Nếu sản phẩm trước đây chỉ sinh suggestions mà không chấp nhận áp dụng: tạo `autoRepair` job với decision types riêng (`SOURCE_VERIFIED`, `MODEL_AUTO_ACCEPTED`, `NEEDS_REVIEW`, `BLOCKED`); chỉ quyết định hợp lệ mới thành patch, giữ audit/provenance.
- Nếu `review.ts` bắt buộc `verified` thủ công: không giả `verified`. Thêm đường trạng thái `auto_accepted` được policy cho phép, và giữ `verified` cho nguồn/người thực sự xác minh. Không phá 9 JSON gates.
- Nếu lỗi là sheet/cell coordinate: dùng sheet relation ID/name + real row/col, xử lý noncontiguous row indexes, header offset, hidden rows, duplicated labels.
- Nếu lỗi là shared string: patch giá trị ô được duyệt bằng chiến lược OOXML an toàn (chẳng hạn chuyển **chính cell đó** sang inlineStr và giữ style/metadata liên quan khi thích hợp; hoặc append index shared string đúng cách). Mọi XML phải đúng escape / namespaces. Không sửa công thức; không giả định tất cả text đều inline.
- Nếu lỗi là writer download buffer: xác nhận Blob dùng **patched ZIP** thay vì original ZIP, không tái tạo workbook từ original trước download.
- Duy trì business rules, original immutable, rollback, cancel, worker memory limits, và policy về dữ liệu nhạy cảm.

## PHASE E — NÂNG KHẢ NĂNG KHÔI PHỤC `?` MÀ KHÔNG HARDCODE

Chỉ bắt đầu sau khi ít nhất một test E2E thực sự thay đổi ô đã pass. Nếu nguyên nhân là tất cả quyết định bị từ chối, cần **hiển thị nguyên nhân minh bạch**, đồng thời tối ưu recall của ứng viên:

- Xây corpus từ toàn bộ các nguồn văn bản sạch được phép dùng (per-column + cross-sheet/cross-file **chỉ khi được người dùng chọn/cho phép**). Loại bỏ từ chưa kiểm chứng; không học từ outputs model không được duyệt.
- Tạo chỉ mục theo ký tự còn nhìn thấy, độ dài biến thiên, prefix/suffix, grapheme/Unicode, approximate pattern matching. Không mặc định một `?` luôn bằng một ký tự. Chống combinatorial explosion bằng candidate/time budgets.
- Dùng character n-gram + unigram/bigram/trigram + ngữ cảnh trước/sau trong cùng mô tả + vai trò cột + source evidence. Dùng beam search / dynamic programming có giới hạn thời gian. Model hiện hữu trong `predict.ts` tiếp tục làm baseline.
- Sửa detector cho `?` cuối từ: phân biệt punctuation và corrupted token bằng biên từ, chữ trước/sau và sentence context; khi chưa rõ giữ issue nghi vấn thay vì âm thầm cho qua.
- Nếu cần neural model, coi là optional offline-only phase với benchmark cải thiện rõ. Không dùng cloud LLM, không được làm thiếu chức năng offline vì model chưa tải.
- `confidence` phải được hiệu chuẩn trên holdout theo customer/asset/file, có margin giữa top1/top2 và kiểm tra evidence; không bịa 99.9%. Không bao giờ tự sửa tên riêng/định danh/chữ số dựa chỉ trên dự đoán.
- Mỗi issue phải có `status`, `reason`, provenance, confidence-calibration version. Không biến “tôi đã tìm ứng viên” thành “tôi đã sửa ô”.

## PHASE F — ONE-CLICK PRODUCT CONTRACT

- 1 nút `Tự động sửa Excel` thực sự gửi đúng RPC job tới worker; progress phải phản ánh stage thật, không mô phỏng speculative speedup.
- Workflow: `Scan → Detect → Generate → Validate → Auto-accept safe patches → Apply → Reopen output independently → Compare expected cell diffs → Offer Download`.
- Có status rõ: `REPAIRED_PARTIALLY`, `REPAIRED_VERIFIED`, `NO_REPAIR_APPLIED`, `FAILED_VALIDATION`, `CANCELLED`; `NO_REPAIR_APPLIED` không dùng file name/notification tuyên bố repaired.
- Nếu còn unresolved, cho tải XLSX sửa an toàn một phần kèm báo cáo unresolved, không giấu lỗi. Khi có zero patches, có thể tải nguyên bản nhưng **phải dán nhãn “chưa sửa”**.
- Báo cáo UI: số sheet, số ô chứa `?`, số được xác định lỗi, source verified, model accepted, thực tế changed, unresolved, loại lý do không sửa; phân biệt số ô và số chuỗi duy nhất.
- Giữ 9 JSON gates; không cấp `verified` giả, không vô hiệu hóa security validations để cho ra output.

## PHASE G — INDEPENDENT VERIFICATION & PERFORMANCE

Viết dev/test verifier **độc lập với `xlsx-reader.ts`**:

1. Mở input/output ZIP, parse shared strings, resolve `t="s"`, `inlineStr`, công thức/numeric text theo worksheet.
2. Lập canonical map `(sheetId,row,column) -> {cellType, literalValue, formula, style/metadata}`.
3. Tính `changedCells` và `unexpectedChanges`, kiểm tra set thay đổi đúng accepted patch set; mọi ô ngoài patch phải giữ nguyên giá trị/ngữ nghĩa (các phần nội dung không đổi nếu policy yêu cầu).
4. Nếu patch >0 mà `sheet*.xml` / `sharedStrings.xml` hoàn toàn giống input thì fail ngay. Nếu ZIP checksum khác nhưng inner contents giống thì ghi rõ `RECOMPRESSED_ONLY` và fail repaired claim.
5. Mở XLSX output bằng Microsoft Excel hoặc LibreOffice trong một bài test thủ công **nếu môi trường có sẵn**; nếu không có, báo là chưa xác minh, không tự tuyên bố đã test.
6. Trên file benchmark, đo metrics & timing per stage, peak memory của worker nếu đo được, cancel/timeout, 0 network upload; chạy tests, lint, typecheck, build.
7. Với file gốc MAU9, nếu được phép truy cập local, ghi ít nhất: `11_287 cells with '?' detected at raw shared-string level` (nếu input đúng version), `N accepted`, `M committed patches`, `K independently confirmed changed cells`; kèm histogram nguyên nhân unresolved. **Không đưa thông tin khách hàng ra terminal/report**.
8. Không cam kết mọi `?` được sửa. Số ô unresolved >0 là hợp lệ nếu dữ liệu bị mất không thể khẳng định; nhưng agent không được tự nhận “xong” khi zero changes mà chưa phân tích bằng chứng.

## DELIVERABLES / DEFINITION OF DONE

- Code sửa bug root cause, không chỉ mock UI.
- Regression tests chạy đỏ trước fix và xanh sau fix; một e2e thực sự thay đổi ít nhất 1 text cell trong XLSX synthetic và sau đó được independent parser xác nhận.
- Test trường hợp shared strings, multi-sheet, `?` cuối token, punctuation hợp lệ, protected fields, zero-patch status, undo, privacy.
- Bản build thực sự hoạt động cho nút One-Click; không gửi network khi user chưa cho phép.
- `docs/auto-repair/zero-patch-investigation.md` gồm root cause với file:line và trước/sau.
- `docs/auto-repair/repair-benchmark.md` gồm bảng metrics, command + exit code, counts cho file thực nếu có, đặc biệt `outputCellsChanged`, `unexpectedChanges`, và thời gian xử lý.
- Không được gọi thành công khi chỉ đổi kích thước ZIP. Nếu không thể sửa an toàn dù còn `?`, báo trung thực reason histogram và next actions cụ thể.

**BẮT ĐẦU NGAY:** Trace click → worker → decisions → patches → writer → download, tạo số liệu stage-by-stage; xác định vì sao `.repaired.xlsx` chỉ re-compress, rồi thêm một regression E2E làm đỏ. Fix chặng lỗi trước, test xanh, sau đó mới cải thiện candidate/recovery. Tiếp tục thực thi qua các phase cho đến khi có các deliverables. Không trả lời chỉ bằng kế hoạch.
