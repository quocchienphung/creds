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
First rows	Các dòng đầu
{0} of {1} rows · {2} columns	{0} / {1} dòng · {2} cột
Row {0} becomes the header line, {1} columns.	Dòng {0} trở thành dòng tiêu đề, {1} cột.
In these rows, {0} cells hold a {1}, so they are written in quotes; the first is on row {2} ({3}).	Trong các dòng này có {0} ô chứa {1} nên được đặt trong dấu ngoặc kép; ô đầu tiên ở dòng {2} ({3}).
No cell in these rows holds a {0}, so none needs quotes for it.	Không ô nào trong các dòng này chứa {0}, nên không ô nào cần ngoặc kép vì lý do đó.
{0} cells hold a double quote: it is doubled inside the quotes (first on row {1}, {2}).	{0} ô chứa dấu nháy kép: dấu này được viết đôi bên trong ngoặc kép (đầu tiên ở dòng {1}, {2}).
{0} cell holds a line break: it stays inside its quotes, so one record spans two lines (row {1}, {2}).	{0} ô chứa ngắt dòng: ô đó nằm trong ngoặc kép nên một bản ghi trải trên hai dòng (dòng {1}, {2}).
{0} codes start with zeros (first on row {1}): they are written as typed. Excel drops the zeros when it reopens a CSV unless the column is Text.	{0} mã bắt đầu bằng số 0 (đầu tiên ở dòng {1}): được ghi đúng như đã gõ. Excel sẽ bỏ các số 0 khi mở lại CSV trừ khi cột được đặt là Text.
{0} empty cells stay empty fields, so every line keeps {1} columns.	{0} ô trống vẫn là trường trống, nên mọi dòng đều giữ {1} cột.
{0} cells hold accents or other non-ASCII text: they are written as UTF-8 (first on row {1}).	{0} ô chứa dấu hoặc ký tự ngoài ASCII: được ghi ở dạng UTF-8 (đầu tiên ở dòng {1}).
Joining the header	Nối dòng tiêu đề
Joining row {0}	Nối dòng {0}
Quoting a cell with a {0}	Đặt ô có {0} vào ngoặc kép
Doubling a quote	Viết đôi dấu nháy kép
Keeping a line break	Giữ ngắt dòng
{0} rows in all, {1} columns.	Tổng cộng {0} dòng, {1} cột.
Adding a summary line	Thêm dòng tóm tắt
Read in	Đọc trong
on this device	trên thiết bị này
to read	để đọc
data rows	dòng dữ liệu
Cells	Ô
read	đã đọc
cells	ô
workbook	sổ làm việc
on disk	trên đĩa
Sheets in this workbook	Các trang tính trong sổ làm việc này
Suggestions appear when you pause. Right Arrow accepts, Command or Control Right Arrow accepts one word, Escape dismisses.	Gợi ý hiện ra khi bạn dừng gõ. Mũi tên phải để nhận, Command hoặc Control cùng mũi tên phải để nhận một từ, Escape để bỏ.
to accept	để nhận
Accepted	Đã nhận
No suggestion	Không có gợi ý
Suggested from {0}	Gợi ý từ {0}
Lines	Dòng
Reading {0} rows	Đang đọc {0} dòng
Checking the cells	Đang kiểm tra các ô
Writing	Đang ghi
Write again	Ghi lại
Copy as text	Sao chép dạng văn bản
Copy notes	Sao chép ghi chú
Jump to row {0}: {1}	Đến dòng {0}: {1}
This sheet has no rows.	Trang tính này không có dòng nào.
Couldn’t check the cells	Không kiểm tra được các ô
Couldn’t write the text	Không ghi được văn bản
Something went wrong.	Đã có lỗi xảy ra.
Checking the cells.	Đang kiểm tra các ô.
Flipping to {0}.	Đang chuyển sang {0}.
{0} notes ready.	Đã có {0} ghi chú.
{0} lines ready.	Đã có {0} dòng.
Showing the saved notes.	Đang hiển thị ghi chú đã lưu.
Showing the saved text.	Đang hiển thị văn bản đã lưu.
Stopped. What arrived is kept.	Đã dừng. Phần đã có được giữ lại.
Showing row {0} in the sheet.	Đang hiển thị dòng {0} trong trang tính.
Reading the sheet	Đang đọc trang tính
Show me	Cho tôi xem
Accept changes	Nhận thay đổi
{0} changes ready for review	{0} thay đổi chờ xem lại
Accepted {0} changes	Đã nhận {0} thay đổi
Undid {0} changes	Đã hoàn tác {0} thay đổi
Stopped before any changes	Đã dừng trước khi có thay đổi nào
Stopped after {0} changes	Đã dừng sau {0} thay đổi
Connection lost	Mất kết nối
Nothing to change	Không có gì để thay đổi
{0} changes	{0} thay đổi
by {0}	bởi {0}
Review changes	Xem lại thay đổi
Joining a row	Nối một dòng
Adding a line	Thêm một dòng
Quoting a cell	Đặt ô vào ngoặc kép
Output file	Tệp đầu ra
Name the file the sheet will become, and pick how its cells are separated.	Đặt tên cho tệp mà trang tính sẽ trở thành và chọn cách phân tách các ô.
Output file name	Tên tệp đầu ra
This workbook	Sổ làm việc này
Saved as	Sẽ lưu thành
Format	Định dạng
Separated by a {0}	Phân tách bằng {0}
The first rows of the sheet, the text Flip writes for them and what to know about their cells. A note links back to the row it comes from.	Các dòng đầu của trang tính, văn bản Flip ghi cho chúng và những điều cần biết về các ô. Mỗi ghi chú liên kết về dòng mà nó xuất phát.
This sheet could not be read.	Không đọc được trang tính này.
Flip · on this device	Flip · trên thiết bị này
{0} notes	{0} ghi chú
{0} lines	{0} dòng
Watch it flip	Xem Flip chuyển đổi
A prediction on the first rows: each is joined with the {0}, then every cell that needs quotes gets them. Accept or undo; nothing is saved.	Dự đoán trên các dòng đầu: mỗi dòng được nối bằng {0}, sau đó ô nào cần ngoặc kép sẽ được đặt vào ngoặc kép. Nhận hoặc hoàn tác; không có gì được lưu.
First {0} rows · first {1} columns	{0} dòng đầu · {1} cột đầu
Prediction	Dự đoán
Figures	Số liệu
Read in {0}	Đọc trong {0}
Read on this device	Đọc trên thiết bị này
The time and size of the output appear here once Flip writes your file.	Thời gian và kích thước của tệp đầu ra sẽ hiện ở đây khi Flip ghi tệp của bạn.
Show details	Hiện chi tiết
Hide details	Ẩn chi tiết
Copy figures as JSON	Sao chép số liệu dạng JSON
Download is not wired yet.	Chức năng tải xuống chưa được nối.
Download comes with the conversion step. Nothing leaves this device.	Tải xuống sẽ có cùng bước chuyển đổi. Không có gì rời khỏi thiết bị này.
Convert	Chuyển đổi
`);
