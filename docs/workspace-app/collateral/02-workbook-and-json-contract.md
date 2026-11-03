# 02 · Hợp đồng workbook ↔ JSON (đã kiểm chứng trên file tham chiếu)

> Chỉ chứa cấu trúc, tên cột và tỷ lệ; **không** có giá trị dữ liệu. Số liệu làm tròn.

## Workbook mẫu (`MAU9_…xlsx`)

- 2 sheet: `MAU9_<ngày>` (dữ liệu, 40 cột, dòng 1 là tiêu đề, ~45k dòng, bật autoFilter) và `Sheet1` (bản **dạng CSV nén vào một cột**, không phải bảng cột → *không phải nguồn chính*).
- Rất nhiều dòng đang **bị ẩn bởi bộ lọc** (hầu hết). Engine phải quét **cả dòng ẩn** và hiển thị trạng thái ẩn.
- ~2% dòng ở cuối sheet chính **trống hoàn toàn** → bỏ qua có báo cáo, không tính là bản ghi.
- Kiểu ô: ID/mã là **chuỗi** (`MAKH`, `MACNTCTD`, ngày `NGBDAU`, `NGDINHGIA` dạng `YYYYMMDD`), tiền là **số** (`GIATRI`, `GIATRIBDKV`). >99% `MAKH` có số 0 đứng đầu.
- Nhiều cột trống hoàn toàn (`NGKT`, `GTKHAUTRU`, nhóm `*DA`, `LOAIPT`, `BIENKS`…).
- `MOTABD` (cột V) và `MOTABDS` (cột AK): trong mẫu **giống hệt nhau mọi dòng**; vẫn phải so sánh lossless từng dòng cho phiên bản khác.

## JSON tham chiếu (`D4030…001.json`)

- Gốc: `KB001` (ngày `YYYYMMDD`), `KB002..KB004` (siêu dữ liệu người lập – **không sao chép từ file cũ**), `CNTCTD[]`.
- Phân cấp: `CNTCTD[] (TTC01,TTC02,KHACHHANG[]) → KHACHHANG[] (TTC03,TTC04,THONGTINBD[]) → THONGTINBD[]` với 16 khóa theo thứ tự cố định `TS001..TS008, TS013, TS009..TS012, TS014..TS016`.
- Kiểu: `TS005/TS006/TS008` là **number**, mọi `TS00x` khác dạng chuỗi/mảng; `TS010/TS011` là mảng chuỗi; `TS012` = mảng chủ sở hữu `{TS0121,TS0122,TS0123}`; `TS014/TS015/TS016` là mảng đối tượng theo **Mẫu số 09** (xem dưới). Trong file tham chiếu cũ cả năm nhánh này luôn rỗng vì dữ liệu mẫu không có cột tương ứng.
- Định dạng: thụt đầu dòng bằng **tab**, LF, không BOM.
- **Mã hóa: KHÔNG phải UTF-8 hợp lệ.** Khoảng 60% byte ≥0x80 là chuỗi không hợp lệ; chúng nằm ở `TS013`, `TS009[]`, `TS0121/2`, `TTC04`. Không có bằng chứng đủ để khẳng định code page (cp1258/cp1252/cp850 đều giải mã "trông giống tiếng Việt" vì phép thử quá lỏng). → Coi file là **oracle cấu trúc**, không phải văn bản sạch; JSON xuất ra luôn UTF-8 nghiêm ngặt. Ký tự `?` literal rất phổ biến (≈1/10 `TS013`).

## Quy tắc ánh xạ đã kiểm chứng (so khớp tham chiếu, dựa trên bản ghi ASCII)

| Nguồn Excel | Đích JSON | Tỷ lệ khớp | Kết luận |
| --- | --- | --- | --- |
| `MACNTCTD` / `TENCNTCTD` | `TTC01` / `TTC02` | khóa 100% | tên chi nhánh có biến thể giữa các dòng → cần quy tắc xung đột |
| `MAKH` / `TENKH` | `TTC03` / `TTC04` | khóa 100% | |
| `MASOBD` | `TS001` | khóa 100% | định danh tài sản = **bộ ba** (chi nhánh, khách hàng, MASOBD) |
| `MALOAIBD` | `TS002` | 99.98% | |
| `NGBDAU` / `NGKT` | `TS003` / `TS004` | 99.99% / 100% | |
| `GIATRI` | `TS005` | 99.98% (lấy dòng đầu) | |
| `GIATRIBDKV` | `TS006` | **tổng các dòng cùng tài sản**: 99.8% (dòng đầu chỉ ~1%) | **tổng** là quy tắc đúng; còn vài ngoại lệ |
| `NGDINHGIA` / `GTKHAUTRU` | `TS007` / `TS008` | 99.95% / 100% | thiếu → `0` |
| `MOTABDS` | `TS013` | 99.99% (bản ghi ASCII) | |
| `DSSOHD` | `TS009[]` | **tập hợp** khớp 99.97% | **thứ tự** không tái tạo được (≈95% theo thứ tự xuất hiện) → xem Quyết định mở |
| `HOTENCSH` / `GIAYTOCNCSH` / `MSTCSH` | `TS0121/0122/0123` | ≥99.9% | 1 chủ sở hữu/tài sản; tài sản không có tên chủ ⇒ `TS012: []` |

Số bản ghi: nhóm theo bộ ba cho **đúng bằng** số tài sản của JSON tham chiếu (0 khóa chỉ có ở một phía).

## Quyết định nghiệp vụ còn mở (hiển thị trong UI, không tự đoán)

1. **Thứ tự `TS009`**: tham chiếu có thứ tự mà workbook không chứa. Mặc định: thứ tự xuất hiện đầu tiên, so sánh khi đối soát theo *tập hợp*; người dùng xác nhận.
2. **Khi `GIATRIBDKV`/`GIATRI` khác nhau giữa các dòng của một tài sản**: mặc định `TS006 = tổng`, `TS005 = dòng đầu`; ngoại lệ được gắn cờ `CONFLICTING_DUPLICATE`.
3. **Tên chi nhánh khác nhau cho cùng `MACNTCTD`**: gắn cờ, người dùng chọn.
4. **`KB002..KB004`**: nhập tay lúc xuất (không lấy từ file cũ).
5. Cột `MOTABD` vs `MOTABDS` khi khác nhau: người dùng chọn nguồn cho `TS013`.

## Mẫu số 09 (nguồn chính thức, ghi lại từ biểu mẫu giấy, 2026-11-03)

Cấu trúc đầy đủ nằm trong `json-formation/engine/template-mau09.ts` (khóa, thứ tự, kiểu) và được kiểm tra trên **mọi đối tượng** của tài liệu xuất, không chỉ tài sản đầu tiên. Tên tệp: `D40<Mã TCTD đầu mối báo cáo><ngày báo cáo>.<zzz>.json`, tệp nén `.zip` cùng tên.

| Nhánh | Cấu trúc | Cột Excel |
| --- | --- | --- |
| `TS010[]` | chuỗi: mã chi nhánh TCTD khác nhận TSBĐ chung | `TSCHUNGMATCTD` |
| `TS011[]` | chuỗi: mã khách hàng chung TSBĐ | `TSCHUNGMAKH` |
| `TS014[]` | `{TS0141[], TS0142…TS0148}`; mỗi bộ cột dự án khác nhau là một phần tử | `TENDA`, `VITRIDA`, `MATINHDTU`, `GIAYPHEP`, `GIATRIDA` (số), `THOIHANDA`, `MOTADA` |
| `TS014[].TS0141[]` | `{TS01411…TS01414}` chủ đầu tư | `CHUDA`, `GIAYTOCHUDA`, `MSTCHUDA`, `DIACHICHUDA` |
| `TS015[]` | `{TS0151…TS0154}` | `GIAYCN`, `DIACHI`, `MATINH`, `MOTABD` (mô tả; không tự tạo phần tử vì dòng nào cũng có mô tả) |
| `TS016[]` | `{TS0161…TS0163}` | `LOAIPT`, `GIAYDK`, `BIENKS` |

Giả định cần người có thẩm quyền xác nhận: `TS0154` lấy từ `MOTABD` (cột song sinh của `MOTABDS`); tổng đầu tư rỗng thì `TS0146` = 0; tên tệp: mã TCTD 1–20 ký tự chữ/số, `<zzz>` đúng 3 ký tự chữ/số, cả hai nhập khi xuất (không có trong workbook).
