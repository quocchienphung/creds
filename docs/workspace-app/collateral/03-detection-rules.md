# 03 · Quy tắc phát hiện lỗi (`excel-formation/engine/detect.ts`, phiên bản `rules-2026.11.1`)

Phát hiện **xác định** (cùng đầu vào cho cùng kết quả), theo **vai trò cột** (`freeText`, `name`, `code`, `date`, `dateDMY`, `amount`, `list`) lấy từ hồ sơ ánh xạ. Gợi ý không bao giờ được áp dụng tự động.

| Quy tắc | Khi nào | Mức |
| --- | --- | --- |
| `QUESTION_MARK_IN_WORD` | `?` trong mô tả: giữa từ → nghiêm trọng; ở rìa từ → cao; từ còn lại là từ sạch đã gặp ≥3 lần ở cuối câu → thấp ("có thể là dấu hỏi thật"). Trong **mã/tên**: luôn nghiêm trọng. URL bị bỏ qua. | critical / high / low |
| `UNICODE_REPLACEMENT` | có U+FFFD | critical |
| `ENCODING_MOJIBAKE` | chữ ký UTF-8 bị đọc bằng Windows-1252/Latin-1; chỉ đề xuất giải mã khi **đảo ngược chính xác** | high |
| `INVISIBLE_OR_CONTROL` | ký tự độ rộng 0, điều khiển (kể cả `_x0007_` trong XML); nêu mã điểm, không đoán ký tự đã thay | high (mã/tên) / medium |
| `DIACRITIC_POLICY` | có dấu trong cột `noDiacritics`; không phải hỏng dữ liệu; tắt được | low |
| `WHITESPACE_ANOMALY` | khoảng trắng đầu/cuối, lặp (không tính trong mô tả), khoảng trắng đặc biệt, tab/xuống dòng | low / medium |
| `DESCRIPTION_CONFLICT` | `MOTABD` ≠ `MOTABDS` (so khớp từng ký tự) hoặc chỉ một cột có giá trị | high / medium |
| `INVALID_CODE_OR_DATE`, `TYPE_MISMATCH` | ngày không thật (YYYYMMDD, DD/MM/YYYY); ngày/mã lưu dạng số; số tiền là chữ | high / medium |
| `MISSING_REQUIRED`, `FORMULA_UNRESOLVED` | ô bắt buộc trống; công thức không có kết quả lưu | high / medium |
| `CONFLICTING_DUPLICATE` | các dòng cùng tài sản/chi nhánh/khách hàng khác nhau ở trường phải nhất quán | medium |
| `ARRAY_PARSE_AMBIGUOUS` | số hợp đồng có dấu phân cách bên trong | medium |
| `UNKNOWN_COLUMN`, `DUPLICATE_HEADER` | cột lạ / tiêu đề trùng | low / high |

## Gợi ý có bằng chứng (không phải AI)

Với `?` trong mô tả/tên: xây **kho từ sạch** của chính cột đó (ô không có `?`), tìm các từ cùng độ dài khớp từng ký tự (phân biệt hoa/thường), `?` là ký tự thay thế duy nhất cho một chữ/số. Kết quả kèm số lần xuất hiện. Gợi ý cả ô chỉ xuất hiện khi **mỗi** từ đáng ngờ có đúng một từ khớp; còn lại người rà soát chọn từng từ. Không có mô hình ngôn ngữ, không gọi ra ngoài.

## Sửa hàng loạt

Chỉ các phép biến đổi **chính xác, lặp lại được**: cắt hai đầu, gộp khoảng trắng lặp, đổi khoảng trắng đặc biệt, xóa ký tự độ rộng 0. Luôn xem trước, một lần Hoàn tác khôi phục tất cả. Không bao giờ hàng loạt cho `?`, mojibake hay bỏ dấu.

## Trạng thái và kiểm tra lại

`open → edited → verified | accepted_exception`. Mỗi lần sửa chạy lại quy tắc của chính loại lỗi đó trên giá trị mới: còn lỗi thì ở `edited` và vẫn chặn xuất; lỗi mới phát sinh do giá trị vừa gõ được ghi nhận riêng. Ngoại lệ bắt buộc có lý do (≥3 ký tự) và nằm trong báo cáo kiểm toán.
