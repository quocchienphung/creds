import { catalog } from './catalog';
export const converter = catalog(`
Converter	Chuyển đổi
Excel to CSV	Excel sang CSV
Turn a workbook into a CSV file	Chuyển một bảng tính thành file CSV
Drop an .xlsx file, pick a worksheet, check the preview, then download. Nothing leaves this device.	Thả file .xlsx vào, chọn trang tính, xem trước rồi tải xuống. Dữ liệu không rời khỏi thiết bị này.
Excel .xlsx up to {0} MB	Excel .xlsx tối đa {0} MB
Reading workbook	Đang đọc bảng tính
Reading workbook… {0}%	Đang đọc bảng tính… {0}%
Worksheet	Trang tính
{0} (hidden)	{0} (đã ẩn)
Delimiter	Dấu phân tách
Comma	Dấu phẩy
Semicolon	Dấu chấm phẩy
Encoding	Mã hóa
UTF-8 with BOM	UTF-8 có BOM
Lets Excel show accented text correctly.	Giúp Excel hiển thị đúng chữ có dấu.
Converter actions	Thao tác chuyển đổi
Another file	File khác
Right arrow accepts the suggested ending, Escape hides it.	Nhấn mũi tên phải để nhận phần gợi ý, Escape để ẩn.
Saved as {0}	Sẽ lưu thành {0}
Suggested from the workbook and worksheet. Type to use another name.	Gợi ý từ tên bảng tính và trang tính. Gõ để dùng tên khác.
A file name cannot contain \\ / : * ? " < > | and cannot start with a dot.	Tên file không được chứa \\ / : * ? " < > | và không được bắt đầu bằng dấu chấm.
Rows	Số hàng
Columns	Số cột
File size	Dung lượng
Conversion result	Kết quả chuyển đổi
{0} rows written, {1} empty rows skipped.	Đã ghi {0} hàng, bỏ qua {1} hàng trống.
{0} date cells written as ISO dates (YYYY-MM-DD).	{0} ô ngày được ghi theo chuẩn ISO (YYYY-MM-DD).
{0} formulas exported as their last calculated value.	{0} công thức được xuất bằng giá trị tính gần nhất.
UTF-8 with a byte order mark; Excel reads accented text correctly.	UTF-8 có BOM; Excel đọc đúng chữ có dấu.
UTF-8 without a byte order mark; Excel may misread accented text.	UTF-8 không có BOM; Excel có thể đọc sai chữ có dấu.
Numbers and codes keep the exact text stored in the file, including leading zeros.	Số và mã giữ nguyên văn bản lưu trong file, kể cả số 0 ở đầu.
Converting…	Đang chuyển đổi…
This worksheet has no values, so there is nothing to export.	Trang tính này không có giá trị nào nên không có gì để xuất.
The first {0} of {1} rows, as they will be written.	{0} hàng đầu trong {1} hàng, đúng như sẽ được ghi.
The original cells of the first {0} rows.	Các ô gốc của {0} hàng đầu.
Preview shows	Xem trước hiển thị
Source	Nguồn
That worksheet is not available.	Trang tính này không dùng được.
The conversion failed.	Chuyển đổi không thành công.
The converter stopped unexpectedly.	Trình chuyển đổi đã dừng đột ngột.
`);
