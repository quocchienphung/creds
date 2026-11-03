# 01 · Đánh giá thư viện GitHub/npm (Gate A)

Phương pháp: đọc metadata công khai (GitHub REST + npm registry + npm advisory API; không gửi dữ liệu nào đi), cài thử vào **thư mục nghiên cứu ngoài repo**, và **benchmark trên workbook thật chạy cục bộ** (chỉ ghi thời gian/bộ nhớ). Ngày đo: 2026-11-02, Node 24.21, macOS.

| Thư viện | Repo / phiên bản kiểm tra | License | Hoạt động | Advisory (npm) | Quyết định |
| --- | --- | --- | --- | --- | --- |
| **ExcelJS** | exceljs/exceljs · v4.4.0 | MIT | commit cuối 2025-01, release cuối 2023-10, 824 issue mở | không | **Chỉ làm oracle kiểm thử** (không đưa vào bundle) |
| **AG Grid Community** | ag-grid/ag-grid · 36.2.0 | MIT (GitHub báo NOASSERTION do repo gộp Enterprise) | rất tích cực | không | **Từ chối**: ~21 MB unpacked, theme riêng, repo trộn mã Enterprise; app đã có bảng `ui-sb-table` → tự viết ảo hóa nhỏ |
| **Ajv** | ajv-validator/ajv · v8.20.0 | MIT | tích cực | không | **Không thêm**: repo đã có `zod` 4 (tương đương) và `ajv@6` chỉ là transitive của ESLint, nâng lên sẽ xung đột hoisting. Dùng zod; xuất thêm JSON Schema dạng tài liệu |
| **iconv-lite** | pillarjs/iconv-lite · v0.7.3 | MIT | tích cực | không | **Tùy chọn / chỉ phía Node**: trình duyệt đã có `TextDecoder` hỗ trợ `windows-1252/1258`… Không đủ bằng chứng để chọn code page cho JSON tham chiếu nên không tự động giải mã |
| **SheetJS CE** | SheetJS/sheetjs · bản chính thức cdn.sheetjs.com **0.20.3** | Apache-2.0 | tarball chính thức; **bản npm `xlsx@0.18.5` đã lỗi thời** | `xlsx@0.18.5`: 2 advisory **high** (prototype pollution `<0.19.3`, ReDoS `<0.20.2`) | **Từ chối** cho runtime: cần cài từ CDN ngoài npm, và đọc nguyên sheet vào bộ nhớ |
| **fflate** *(đã có)* | 101arrowz/fflate · 0.8.3 | MIT | đã là dependency | không | **Chọn** làm lớp ZIP; đọc/ghi XML sheet do ta kiểm soát |

## Benchmark (workbook thật ≈ 11 MB, ≈ 45k dòng × 40 cột, 2 sheet)

| Cách đọc | Thời gian | RSS đỉnh | Ghi chú |
| --- | --- | --- | --- |
| ExcelJS đọc đầy đủ | 1.95 s | **836 MB** | giữ cả mô hình ô + style |
| ExcelJS streaming | 0.96 s | 410 MB | không giữ được bố cục để ghi lại nguyên vẹn |
| SheetJS 0.20.3 (dense) | 1.54 s | 670 MB | |
| Bộ đọc tự viết trên fflate | **0.42 s** | 448 MB (bản thử dùng chuỗi cả sheet; bản worker đọc theo khối) | giữ kiểu ô gốc (`s`/`n`/`inlineStr`), tọa độ, ẩn/hiện dòng |

## Quyết định kiến trúc rút ra

1. **Đọc**: bộ đọc XLSX riêng trên `fflate` – giữ **kiểu ô gốc** (shared string / số / inline), tọa độ `A1`, cờ dòng ẩn; không ép ID thành số.
2. **Ghi (xuất XLSX đã sửa)**: *vá XML trực tiếp trong ZIP gốc* – chỉ thay đúng các thẻ `<c>` được duyệt (ghi dạng `inlineStr`), mọi thứ khác (style, autoFilter, dòng ẩn, định dạng, sheet khác) **giữ nguyên byte**. ExcelJS đọc‑rồi‑ghi sẽ làm rơi một số tính năng và tốn ~0.8 GB RAM nên bị loại cho bước này.
3. **Kiểm chứng round-trip**: đọc lại bằng bộ đọc của ta **và** mở độc lập bằng ExcelJS/SheetJS trong thư mục nghiên cứu (không phải dependency của app).
4. **Schema JSON**: `zod` (đã có). Không thêm AG Grid, Ajv, iconv-lite, SheetJS vào `package.json` → **không thêm dependency runtime nào**, không đổi lockfile, không thêm CVE.
5. **Không sao chép mã** từ các repo trên; chỉ dùng tài liệu API công khai để so sánh hành vi.
