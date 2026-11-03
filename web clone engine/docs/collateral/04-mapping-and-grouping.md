# 04 · Ánh xạ và gom nhóm (`json-formation/engine/json-report.ts`)

Hồ sơ ánh xạ `MAU9 v1` (`excel-formation/engine/mapping-profiles.ts`) chỉ tự ánh xạ khi **tiêu đề khớp đúng một cột**; tiêu đề trùng được liệt kê để người dùng chọn, không chọn bừa.

## Phân cấp

`CNTCTD[]` (chi nhánh `MACNTCTD`) → `KHACHHANG[]` (`MAKH`) → `THONGTINBD[]` (tài sản `MASOBD`). Khóa tài sản là **bộ ba** (chi nhánh, khách hàng, mã tài sản). Dòng thiếu một phần khóa được đếm là *không xếp được* và **chặn xuất**; không bao giờ bị bỏ lặng lẽ.

## Giá trị của một tài sản (nhiều dòng)

| Trường | Quy tắc | Căn cứ |
| --- | --- | --- |
| `TS002..TS005, TS007, TS013` | dòng đầu của tài sản | khớp ≥99.9% với tham chiếu |
| `TS004`, `TS008` | rỗng → `""` / `0` | đúng 100% |
| `TS006` | **tổng chính xác** (BigInt thập phân) các dòng | khớp ~99.97%; dòng đầu chỉ ~1% |
| `TS009` | số hợp đồng không trùng, thứ tự xuất hiện đầu tiên, **không tách theo `/`** | tập hợp khớp ~99.97%; thứ tự không tái tạo được |
| `TS012` | mọi chủ sở hữu khác nhau (mặc định) hoặc chỉ dòng đầu; không có tên/giấy tờ/MST → `[]` | quyết định người dùng |
| `TS010`, `TS011` | mọi giá trị khác nhau của các dòng tài sản (`TSCHUNGMATCTD`, `TSCHUNGMAKH`), thứ tự xuất hiện đầu tiên | Mẫu số 09 |
| `TS014` (+ `TS0141`) | mỗi bộ cột dự án khác nhau là một phần tử; chủ đầu tư khác nhau nằm trong `TS0141` | Mẫu số 09 |
| `TS015`, `TS016` | mỗi bộ cột giấy chứng nhận đất / phương tiện khác nhau là một phần tử | Mẫu số 09 |

## Thứ tự

Tham chiếu **sắp xếp tăng dần theo mã ở cả ba cấp** (213/213 chi nhánh, 100% khách hàng và tài sản); engine mặc định theo mã (khớp 36.550/36.550 vị trí tài sản), có tuỳ chọn giữ thứ tự trong workbook.

## Quyết định chưa có luật nghiệp vụ (hiển thị trong giao diện)

1. Thứ tự `TS009`.
2. Chủ sở hữu khi các dòng của một tài sản ghi người khác nhau (3 tài sản trong mẫu; tham chiếu chỉ giữ một).
3. Số hợp đồng: tham chiếu có thêm ~17 hợp đồng mà workbook không có.
4. `KB002..KB004` và ngày báo cáo: nhập khi xuất, không lấy từ tệp cũ.

## Khối cột và cột khóa (`blocks` trong hồ sơ ánh xạ)

Các nhánh `TS014`, `TS0141`, `TS015`, `TS016` được ghép từ nhiều cột. Mỗi khối có **cột khóa** (`TENDA`, `CHUDA`, `GIAYCN`, `LOAIPT`). Dòng có giá trị ở cột khác của khối nhưng cột khóa trống là lỗi `INCOMPLETE_GROUP` (mức *high*, chặn xuất cho tới khi sửa hoặc chấp nhận kèm lý do). Giá trị **vẫn được đưa vào JSON**, không bị bỏ lặng lẽ. Trên file mẫu thật: 44 dòng (25 `CHUDA` + 19 `MATINH` gõ nhầm mô tả vào cột), ảnh hưởng 22 tài sản `TS014` và 19 tài sản `TS015`, mà file tham chiếu cũ để trống.
