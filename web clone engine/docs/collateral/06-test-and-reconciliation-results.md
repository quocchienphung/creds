# 06 · Kết quả kiểm thử và đối soát

Ngày chạy: 2026-11-02. Mọi số liệu từ file thật chỉ là số đếm (không giá trị, không tên, không mã). Số liệu làm tròn ở các tài liệu khác; ở đây giữ số đếm vì đây là kết quả kiểm thử.

## Kiểm thử tự động

| Lệnh | Kết quả |
| --- | --- |
| `npm test` | 545 test: **534 đạt**, 11 lỗi **có sẵn từ trước** (skill installer, terrain; xác nhận bằng cách chạy lại bản gốc). 70 test mới của Collateral đều đạt. |
| `npx tsc --noEmit` | sạch (trừ 2 lỗi có sẵn ở `storage-extract.ts` do `pdfjs-dist` thiếu kiểu) |
| `eslint` (thư mục mới + file sửa) | 0 lỗi |
| `npm run build` | thành công (bao gồm bundle của Web Worker) |
| `node scripts/qa/collateral.mjs <url>` | **69 kiểm tra đạt** trên dev và production (workbook tổng hợp; gồm 0 request rời `localhost`) |
| `node scripts/qa/rules-collateral.mjs <url>` | 17 đạt (bộ chọn Guide me, thư mục, sidebar, tìm kiếm, dark, 390/320 px) |
| QA Storage (`storage-controls.mjs`, `storage.mjs`) | **lỗi giống hệt trên bản gốc** (Split menu ArrowDown; timeout tải xuống) → không phải hồi quy; `StorageDropzone` chỉ thêm prop tùy chọn |

## Đối soát với tệp tham chiếu (cục bộ, chỉ số đếm)

- Chi nhánh / khách hàng / tài sản: **213 / 30.947 / 36.550**, trùng khóa 100% (0 chỉ ở một phía). 44.183 dòng dữ liệu, 791 dòng trống bỏ qua có báo cáo, 0 dòng không xếp được.
- Thứ tự tài sản trùng tham chiếu **36.550/36.550** vị trí.
- Khớp trường: `TS001` 100%, `TS004/TS008/TS010–016` 100%, `TS003` 99,997%, `TS002` 99,98%, `TS005` 99,98%, `TS006` (tổng) 99,97%, `TS007` 99,95%, `TS013` (bản ghi ASCII) 99,99%, `TS009` tập hợp 99,98% (thứ tự 94,5%), chủ sở hữu đầu 99,95%.
- Số hợp đồng: 43.725 (workbook) so với 43.742 (tham chiếu): chênh 17, do tham chiếu có thêm số mà workbook không có.
- 7 tài sản không có chủ sở hữu trong cả hai.

Chênh lệch còn lại được xếp theo lớp (workbook mới hơn JSON, ghi mã hóa cũ ở `TS013`/`TS009`/tên), **không** ép khớp bằng cách đổi dữ liệu.

## Hiệu năng (workbook ~11 MB, ~45k dòng × 40 cột)

| Việc | Thời gian |
| --- | --- |
| Đọc + quét (Node) | 0,5 s + 0,5 s |
| Từ lúc chọn tệp tới màn hình Tổng quan (Chrome, production) | **2,3 s**, 0 tác vụ dài trên main thread |
| Bảng 10.689 lỗi | 16 dòng trong DOM; đổi bộ lọc ~30 ms; đi 1 lỗi ~50 ms |
| 5.000 chỉnh sửa | 0,5 s |
| Xuất XLSX đã sửa + đọc lại kiểm chứng | 2,8 s; 0 sai lệch; ExcelJS và SheetJS đều mở được |
| Kế hoạch JSON (2 lần dựng + kiểm tra) | 1,6 s |

Bộ nhớ đỉnh quan sát ở Node ~1,2 GB cho kế hoạch JSON; ở trình duyệt chưa đo riêng worker.

## Sự cố ghi nhận

Một script kiểm tra đầu tiên của tôi đã in hai dòng dữ liệu thật (tên công ty, MST) ra terminal. Dữ liệu chỉ nằm trong output cục bộ, không vào repo hay nơi nào khác; script đã sửa chỉ in tên cột.
