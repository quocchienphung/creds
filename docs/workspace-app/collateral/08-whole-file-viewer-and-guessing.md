# 08 · Xem toàn bộ tệp, đoán chữ lỗi, lưu tiến độ (Phase 5)

Ngày 2026-11-02. Phạm vi: bước **Review and fix** của Excel formation. Không thêm dependency. Mọi số liệu trên tệp thật là **số đếm và thời gian**, không có giá trị ô nào được ghi lại.

## 1. Vì sao làm lại phần xem tệp

Bản trước phóng to một bản sao DOM của "mặt file" bằng `transform: scale`, và cắt quanh ô lỗi. Hai hậu quả: chữ bị lấy mẫu lại nên **vỡ pixel khi zoom** (nhất là DPR 2), và người dùng chỉ thấy một mảnh nhỏ của tệp. Yêu cầu: thấy **toàn bộ tệp**, tự rê chuột để phóng to.

| Trước | Sau |
| --- | --- |
| Cắt quanh ô lỗi, chỉ vài cột/dòng | Mọi cột của sheet vừa bề rộng stage; mọi dòng cuộn được (ảo hóa, đọc theo từng khối qua RPC `grid`) |
| Kính lúp = bản sao DOM bị `scale` | Kính lúp **vẽ lại vài ô thật** ở cỡ chữ lớn (không có lớp to bị scale, không bị lấy mẫu lại) |
| Một mức zoom | Rê chuột = kính lúp; `Alt` + lăn chuột = 2 đến 8 lần (bước 0,5); viewer có hai chế độ **Whole file** / **Readable** |
| Không biết đang ở đâu trong tệp | Thanh dọc (strip) tô màu mức lỗi theo vị trí, có cửa sổ hiện tại; kéo/bấm để nhảy; dải tên ô, tab sheet, "Row x of y" |

Mã: `gallery/SheetViewer.tsx`, `gallery/sheet-viewer.css`, hình học thuần `engine/sheet-geometry.ts` (có test). Nhãn của kính lúp nằm **ngoài** vòng tròn để không đè chữ. Trên thiết bị không hover nút phóng to luôn hiện; kính lúp chỉ dành cho chuột.

## 2. Đoán chữ lỗi từ tiếng Việt không dấu

Dữ liệu cho thấy (đo trên tệp tham chiếu): một `?` đại diện **đúng một chữ cái** (99,8% từ lỗi chỉ có một `?`), và các chữ mất dấu khi xuất không dấu là nguyên âm và `d`. Nên từ lỗi = từ cùng độ dài, các chữ còn lại khớp, ô `?` là nguyên âm hoặc `d`.

- Tập huấn luyện là **chữ sạch của chính tệp** (bỏ dấu, không phân biệt hoa thường). Không từ điển ngoài, không dịch vụ mô hình.
- Hai vai trò theo ý tưởng *speculative decoding*: **draft** (chỉ tần suất, nhanh) và **target** (tần suất + từ liền trước/sau + dạng âm tiết tiếng Việt). Target quyết định; người dùng vẫn duyệt từng thay đổi.
- Mã: `engine/predict.ts`, mô phỏng `engine/speculative.ts`, phát lại `engine/playback.ts`; chạy trong worker (RPC `predict`).

Kết quả giữ-ra-ngoài (train 90% dòng, che một nguyên âm/`d` của từ ở 10% còn lại, `scripts/qa/collateral-predict-eval.mjs`): có ứng viên 99,8%; draft top-1 93,3%; **target top-1 98,8%**, top-3 99,7%; target đánh dấu "chắc chắn" 98,9% số từ và đúng 99,5% trong số đó; chạy draft 4 từ nhận 97,6%.

**Giới hạn thật:** đây là *gợi ý*, không phải 100%. Số trên là trên chính tệp tham chiếu nên lạc quan hơn một tệp lạ; từ không có trong chữ sạch của tệp sẽ không có ứng viên (43 ô "không có bằng chứng" trên tệp tham chiếu). Vì vậy giao diện không bao giờ tự áp dụng: nút **Use this reading** chỉ điền giá trị mới, người dùng bấm **Approve value**; từ sát nhau được đánh dấu **Close call**.

## 3. Giao diện Speculative decoding

Dựng độc lập từ preview công khai `https://uiarc.dev/components/speculative-decoding` (chỉ đọc trang đã render; ghi chú ở `docs/research/speculative-decoding/README.md`). `gallery/SpeculativePanel.tsx` + `speculative.css`: hai làn Draft/Target, chip nháp, quét kiểm tra, ô chấp nhận/loại, dòng Output có gạch chân theo nguồn, số liệu (Faster, Drafts accepted, Words per pass), thanh trượt độ dài bản nháp, công tắc so sánh, Play/Pause/Restart, giảm chuyển động thì nhảy đến kết quả.

**Cập nhật 2026-11-02:** nhịp riêng và `playback.ts` đã bị thay bằng nhịp đo trực tiếp từ preview (`engine/run-timeline.ts`; bảng đo ở `docs/research/speculative-decoding/README.md`). Mục này và `speculative.css` cũ đã được thay bởi `SpeculativeRun.tsx` + `speculative-run.css`.

## 4. Độ tin cậy ("không rollback, không lỗi")

Không thể hứa "100%" cho chữ đoán; có thể hứa **không ghi sai và không mất việc**:

1. **Đọc**: so từng ô với ExcelJS và SheetJS trên tệp thật: **795.242 ô, trùng 795.242, lệch 0**, cả hai chiều không thiếu ô. Số dòng ẩn: 44.071 dòng ẩn có dữ liệu khớp ExcelJS; 791 dòng ẩn rỗng chỉ có trong XML nên ExcelJS bỏ qua (44.071 + 791 = 44.862).
2. **Ghi**: vá ở mức XML một lượt, đọc lại và so (`roundTrip`): 5.000 sửa trên tệp thật, `wrongValues 0`, `unexpectedChanges 0`. Không bao giờ ghi đè tệp gốc.
3. **Mất việc do rời trang/worker chết**: nay có `beforeunload` (chỉ khi có chỉnh sửa chưa nằm trong tệp nào) và **Save progress / Resume progress**. Tệp `.progress.json` chứa chỉnh sửa (ô, chữ gốc, chữ mới), ngoại lệ có lý do, các đếm để đối chiếu; **không chứa bảng tính**. Gắn với đúng một bảng tính bằng dấu vân tay. Nạp lại = phát lại từng chỉnh sửa từ chữ gốc; **từ chối cả tệp** nếu sai bảng tính, một ô không còn như lúc lưu, phiên bản khác, hoặc hỏng; xong chỉ là một bước, Undo quay lại; so đếm với tệp, lệch thì cảnh báo. Mã: `engine/progress.ts` (+ 5 test), RPC `progressSave/progressLoad`. Trang không tự lưu gì.
4. **Lỗi hiển thị**: `CollateralBoundary` bắt lỗi vẽ một bước; bảng tính và chỉnh sửa nằm trong engine nên "Try again" không mất gì.
5. **Hồi quy đã sửa trong đợt này**: (a) trên tệp thật 40 cột, thanh trạng thái dài làm cột lưới nở ra, 12/40 cột nằm ngoài stage (đã ép `minmax(0, 1fr)`, đo lại `outside 0`); (b) đóng viewer không trả focus về stage vì trang đang `inert` (nay trả sau khi viewer rời cây); (c) ở 320 px toolbar tràn ngang (grid một cột ngầm); (d) nút phóng to không hiện trên màn hình cảm ứng.

## 5. Kết quả kiểm thử (2026-11-02)

| Kiểm tra | Kết quả |
| --- | --- |
| `npx tsc --noEmit` (trừ 2 lỗi sẵn có `storage-extract.ts`) | sạch |
| ESLint `src/components/sites/collateral` | sạch |
| `npm test` | 570 test: 559 đạt; 11 lỗi **sẵn có** (skill installer, terrain), không thuộc phạm vi |
| `scripts/qa/collateral.mjs` (production :3002) | 87/87 (gồm toàn bộ cột, kính lúp thật, Alt+wheel, panel đoán, viewer hai chế độ, lưu/nạp/từ chối tiến độ, 390 và 320 px) |
| `scripts/qa/rules-collateral.mjs` | 17/17 |
| `scripts/qa/collateral-reference-browser.mjs` (tệp thật, production) | scan → overview 2,97 s, 0 tác vụ dài; viewer 40 cột đều trong stage, 24 dòng trong DOM, kính lúp sẵn sàng 105 ms; xuất tệp sửa 3,7 s, kiểm chứng "passed"; 0 request ra ngoài, 0 lỗi trang |
| `scripts/qa/collateral-reference.mjs` | 36.550/36.550 tài sản, 213/213 chi nhánh, 30.947/30.947 khách hàng, thứ tự giống tham chiếu 36.550/36.550 |

Chưa thử trên thiết bị di động thật (mới giả lập `isMobile`/`hasTouch`); chưa đo bộ nhớ riêng của worker trong trình duyệt; QA Storage có 2 script lỗi sẵn có.
