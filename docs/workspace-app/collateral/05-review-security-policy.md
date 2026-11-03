# 05 · Quyền riêng tư và chính sách rà soát

- **Xử lý tại chỗ.** Tệp được đọc, quét, sửa và xuất trong một **Web Worker của thẻ trình duyệt**. Không có `fetch`, không `useResource`, không telemetry. QA kiểm tra tự động: số request rời khỏi `localhost` = 0.
- **Bộ nhớ, không lưu.** Không `localStorage`/IndexedDB. Tải lại trang hoặc đóng tệp (kết thúc worker) xoá mọi thứ. Trạng thái giữ khi chuyển giữa *Excel formation* và *JSON formation* vì cùng một Provider; mất khi đóng tab.
- **Không sửa bản gốc.** Chỉnh sửa là lớp vá riêng; file xuất chỉ ghi giá trị đã duyệt vào đúng ô trong XML gốc (giữ style, lọc, dòng ẩn, sheet khác).
- **Giới hạn đầu vào.** ≤120 MB, ≤2000 mục nén, chống zip-bomb theo tỷ lệ/kích thước, từ chối `.xls`/tệp mật khẩu, macro không bao giờ chạy, công thức không bao giờ tính.
- **Hiển thị an toàn.** Nội dung ô luôn là văn bản (không HTML).
- **Báo cáo kiểm toán** chỉ có dấu vân tay giá trị, trạng thái, mã dòng/cột, lý do ngoại lệ (do người rà soát gõ). JSON hợp đồng không chứa trường rà soát (schema `strict`).
- **Tệp tham chiếu** nằm trong `.gitignore`; script QA trên dữ liệu thật chỉ in số đếm. Fixture và ảnh QA trong repo hoàn toàn tổng hợp.
- Gợi ý chỉ lấy từ ô sạch của cùng tệp; không AI, không dịch vụ ngoài.
