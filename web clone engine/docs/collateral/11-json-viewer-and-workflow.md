# 11 · JSON formation: JSON viewer và workflow

2026-11-02. Bước **Preview** của JSON formation giờ là bản dựng lại của UIArc **JSON viewer** trên chính tài liệu sắp được xuất; bước **Export** mở đầu bằng thẻ workflow dựng theo UIArc **AI workflow**, chạy trên 9 cổng kiểm tra thật. Bằng chứng và bảng đối chiếu: `docs/research/json-viewer/README.md`, `docs/research/ai-workflow/README.md`.

## Cách hoạt động

- Worker giữ báo cáo mà `planJson` vừa dựng (`json-doc.ts`) và trả từng trang con theo yêu cầu (RPC `docRoot/docChildren/docSearch/docText`). Tệp tham chiếu nặng 27,7 MB nên trang **không bao giờ parse nó**. `remote-source.ts` là nguồn của viewer phía trang (cache theo trang, gộp thông báo mỗi khung hình).
- Plan có thêm `timings` (dựng, kiểm chứng, phát lại: đo trong worker) và `epoch`. Mẫu cây `preview` cũ (4 chi nhánh × 3 × 3), kiểu `Preview*` và CSS `cr-tree` đã bị xoá.
- `useCollateralEngine` đo thời gian mở tệp (`openMs`).

## Kiểm thử (2026-11-02, production :3002 trừ ghi chú)

| Kiểm tra | Kết quả |
| --- | --- |
| `node scripts/qa/json-viewer.mjs <url>` | 59/59: ARIA/thuộc tính, spring mở nhánh (rmse 0,8%), highlight, bàn phím, tìm kiếm, phân trang 130 phần tử, copy, workflow (dấu chấm 240 ms, trạng thái), reduced motion, 390/320 px |
| `json-model.test.mjs` (11), `json-doc.test.mjs` (3) | đạt, so với dữ liệu ghi từ trang gốc |
| Tệp thật 27,7 MB (`collateral-reference-browser.mjs`) | hàng đầu sau ~2,2 s (gồm dựng báo cáo), mở nhánh 40 ms, đếm tìm kiếm 820 ms (2000+), mở tất cả 428 ms (1.258 hàng), tác vụ dài tối đa 176 ms, 0 request ra ngoài, 0 lỗi |
| Độ mượt (`scripts/forensics/json-viewer-fps.mjs`) | CPU thường: 60 fps, 0 khung trễ ở mở/đóng, nhảy kết quả, chạy workflow. CPU chậm 4×: mở/đóng và workflow 0 khung rớt; **nhảy kết quả tìm kiếm rớt 11 khung** (tối đa 83 ms) |

## Hạn chế thật

Nhiều quy tắc nhỏ phải suy ra vì dữ liệu mẫu của trang không có (nhãn số ít, đường dẫn của khóa lạ, nội dung copy của nhánh, nhánh copy thành công): liệt kê ở README nghiên cứu. Với nguồn từ worker, tìm kiếm chỉ mở nhánh của kết quả hiện tại và "Expand all" dừng ở 600 hàng. Chưa thử trên thiết bị cảm ứng thật; `collateral.mjs` còn dừng ở ngưỡng chiều cao stage của Codex (320 px so với ≤ 300) từ trước, không do thay đổi này.
