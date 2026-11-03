# Checklist theo Gate

| Gate | Nội dung | Trạng thái |
| --- | --- | --- |
| A | Kiến trúc, đánh giá thư viện, hợp đồng dữ liệu (`00`–`02`) | Xong. Không thêm dependency nào. |
| B | Đọc XLSX, hồ sơ workbook, ánh xạ có thể chỉnh, tiến độ/hủy | Xong. `excel-formation/engine/{xlsx-reader,profile,mapping-profiles}.ts`, Worker. Hủy = kết thúc worker. |
| C | Phát hiện xác định, theo trường, gợi ý có bằng chứng | Xong. `03-detection-rules.md`. |
| D | Rà soát: sửa, từ chối gợi ý, ngoại lệ có lý do, undo/redo, hàng loạt xác định, xuất XLSX vá XML + kiểm chứng đọc lại | Xong. Bảng ảo hóa trên bảng CRM, mặt file + kính lúp + viewer. |
| E | Gom nhóm JSON, `TS013`, hợp đồng, chủ sở hữu, schema | Xong. `04-mapping-and-grouping.md`. |
| F | Đối soát, UTF-8, xuất bị khóa tới khi 9 kiểm tra đạt, báo cáo kiểm toán che giá trị | Xong. |
| G | Tích hợp, hiệu năng, hồi quy, tài liệu | Xong, kèm các hạn chế dưới đây. |
| H | Xem toàn bộ tệp, kính lúp ô thật, đoán chữ lỗi (draft/target), giao diện Speculative decoding, lưu/nạp tiến độ, error boundary, cảnh báo rời trang | Xong. `08-whole-file-viewer-and-guessing.md`. QA 87/87, đối chiếu ExcelJS/SheetJS 795.242/795.242 ô. |
| I | Replay Speculative decoding chép 1:1 từ preview (nhịp đo được, spring 300/36), tích hợp trong layout workbench, dọn code chết | Xong. `SpeculativeRun.tsx`, `run-timeline.ts`, QA 50 kiểm tra; production 60 fps, 0 khung rớt (CPU x4). |
| J | JSON viewer clone (xem JSON sắp xuất, 27 MB không parse trong trang) + workflow card trên 9 cổng thật | Xong. `11-json-viewer-and-workflow.md`; QA 59/59; tệp thật OK. |

## Việc chưa làm / hạn chế

- Quy tắc nghiệp vụ còn mở (hiển thị trong giao diện): thứ tự `TS009`, chủ sở hữu nhiều người, 17 hợp đồng chỉ có trong tham chiếu.
- Mã hóa của JSON tham chiếu **không xác định được** (không phải UTF-8 hợp lệ); chỉ dùng làm tham chiếu cấu trúc.
- Chưa đo bộ nhớ riêng của worker trong trình duyệt; chưa thử trên thiết bị di động thật (mới giả lập). Kính lúp chỉ dành cho chuột; trên cảm ứng dùng nút mở rộng.
- Chữ đoán là **gợi ý** (target top-1 98,8% trên giữ-ra-ngoài của tệp tham chiếu), không phải 100%; không tự áp dụng. Tiến độ không tự lưu: người dùng chủ động **Save progress**.
- Chưa tích hợp: Bottom sheet cho sửa hàng loạt trên điện thoại, Notification stack, Timeline.
- 11 test và 2 script QA Storage lỗi **sẵn có**, không thuộc phạm vi.
