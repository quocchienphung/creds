import { catalog } from './catalog';
/** Credit page copy. Keys already translated elsewhere (Cancel, Download, …) are not repeated. */
export const credit = catalog(`
(empty)	(trống)
0 issues	0 lỗi
A code is stored as a number, so leading zeros and exact digits are not guaranteed.	Mã được lưu dạng số nên số 0 đứng đầu và các chữ số chính xác không được đảm bảo.
A copy of your file with only the approved values written into their own cells. Formats, filters, hidden rows and other sheets are kept. Your original is not touched.	Bản sao của tệp, chỉ ghi các giá trị đã duyệt vào đúng ô của chúng. Định dạng, bộ lọc, dòng ẩn và các sheet khác được giữ nguyên. Tệp gốc không bị chạm tới.
A date is stored as an Excel number or date. It must be text in YYYYMMDD form so nothing is converted.	Ngày đang lưu dạng số/ngày của Excel. Phải là văn bản dạng YYYYMMDD để không bị chuyển đổi.
A mechanical change is available. It changes text, so it is never applied without your approval.	Có một thay đổi cơ học. Nó làm đổi văn bản nên không bao giờ được áp dụng khi chưa có sự duyệt của bạn.
A question mark sits where a letter was expected. Legacy exports replace letters they cannot encode with ?.	Có dấu ? ở chỗ lẽ ra là một chữ cái. Các bản xuất cũ thay chữ không mã hóa được bằng dấu ?.
A question mark that is probably real punctuation. Check it.	Dấu hỏi này có thể là dấu câu thật. Hãy kiểm tra.
A reason of at least 3 characters is required. It is kept in the audit report.	Cần nêu lý do ít nhất 3 ký tự. Lý do được lưu trong báo cáo kiểm toán.
A required value is empty.	Giá trị bắt buộc đang để trống.
Accept as legitimate	Chấp nhận là hợp lệ
Accepted as legitimate: {0}	Đã chấp nhận là hợp lệ: {0}
All columns	Tất cả cột
All problems	Tất cả loại lỗi
Also apply to {0} (same text)	Áp dụng luôn cho {0} (cùng nội dung)
An amount is stored as text or is not a number.	Số tiền đang là văn bản hoặc không phải số.
Apply to {0} cells	Áp dụng cho {0} ô
Approve value	Duyệt giá trị
Both descriptions	Cả hai mô tả
Broken encoding	Lỗi mã hóa ký tự
Building and checking…	Đang tạo và kiểm tra…
Bulk fixes	Sửa hàng loạt
By column	Theo cột
By problem	Theo loại lỗi
Candidates come only from clean cells of the same column. They are not applied until you approve.	Gợi ý chỉ lấy từ các ô sạch của cùng cột. Chúng không được áp dụng cho đến khi bạn duyệt.
Candidates for {0}	Gợi ý cho {0}
Cell	Ô
Cell {0}	Ô {0}
Cells changed	Ô đã sửa
Checked: the file was read back; {0} cells hold exactly the approved values and nothing else changed.	Đã kiểm tra: tệp được đọc lại; {0} ô đúng bằng giá trị đã duyệt và không có gì khác thay đổi.
Checking every cell…	Đang kiểm tra từng ô…
Choose the {0} column	Chọn cột {0}
Choose…	Chọn…
Click the text to zoom	Bấm vào chữ để phóng to
Closing the file or the tab erases everything the tool held.	Đóng tệp hoặc thẻ trình duyệt sẽ xóa mọi thứ công cụ đang giữ.
Collapse repeated spaces	Gộp khoảng trắng lặp
Column	Cột
Column mapping	Ánh xạ cột
Columns the profile does not know	Cột mà hồ sơ không nhận ra
Conflicting values	Giá trị mâu thuẫn
Corrected workbook	Tệp Excel đã sửa
Corrected workbook is ready and was checked.	Tệp Excel đã sửa đã sẵn sàng và đã được kiểm tra.
Create corrected workbook	Tạo tệp Excel đã sửa
Credit	Tín dụng
Critical	Nghiêm trọng
Data rows	Dòng dữ liệu
Deletes invisible characters that carry no letter.	Xóa các ký tự vô hình không mang chữ nào.
Descriptions differ	Hai mô tả khác nhau
Diacritics (policy)	Dấu tiếng Việt (chính sách)
Downloaded {0}	Đã tải {0}
Duplicate header	Tiêu đề trùng
Every issue has been verified or accepted.	Mọi lỗi đã được xác nhận hoặc chấp nhận.
Excel column	Cột Excel
Exception	Ngoại lệ
Exception recorded for {0}	Đã ghi ngoại lệ cho {0}
Exceptions	Ngoại lệ
Field	Trường
Filter	Bộ lọc
Filters	Bộ lọc
Find and repair errors in an Excel workbook, then convert it to the reporting JSON. Everything stays on this device.	Tìm và sửa lỗi trong tệp Excel, rồi chuyển sang JSON báo cáo. Mọi thứ chỉ nằm trên thiết bị này.
Fix these first	Hãy xử lý những mục này trước
Formula without result	Công thức chưa có kết quả
Header	Tiêu đề
Hidden	Ẩn
Hide row context	Ẩn ngữ cảnh dòng
Hover to look closer, or open it fullscreen.	Rê chuột để soi kỹ, hoặc mở toàn màn hình.
Invalid code or date	Mã hoặc ngày không hợp lệ
Invisible or control character	Ký tự vô hình hoặc điều khiển
Issues	Lỗi
JSON field	Trường JSON
List cannot be split safely	Danh sách không thể tách an toàn
Locked: {0} serious issues are still open.	Đang khóa: còn {0} lỗi nghiêm trọng chưa xử lý.
Meaning	Ý nghĩa
Move to pan, click to zoom out	Di chuột để kéo, bấm để thu nhỏ
New value	Giá trị mới
Next issue	Lỗi kế tiếp
No analytics, no third-party AI. Suggestions come only from clean cells of the same file.	Không phân tích truy cập, không AI bên thứ ba. Gợi ý chỉ lấy từ các ô sạch trong chính tệp này.
No clean word of this column fits. Type the correct text below.	Không có từ sạch nào của cột này phù hợp. Hãy gõ nội dung đúng bên dưới.
No issue found. Nothing needs review.	Không tìm thấy lỗi. Không cần rà soát.
No issue matches the filters.	Không có lỗi nào khớp bộ lọc.
No serious issue is waiting. The JSON export is available.	Không còn lỗi nghiêm trọng. Có thể xuất JSON.
No worksheet matches the mapping profile, so no data can be checked.	Không có sheet nào khớp hồ sơ ánh xạ nên không thể kiểm tra dữ liệu.
No worksheet matches the mapping profile, so no mapping can be shown.	Không có sheet nào khớp hồ sơ ánh xạ nên không thể hiển thị ánh xạ.
Non-breaking and other special spaces become a normal space.	Khoảng trắng không ngắt và các khoảng trắng đặc biệt khác thành khoảng trắng thường.
Nothing has been corrected yet. The copy would be identical to the original.	Chưa sửa gì. Bản sao sẽ giống hệt bản gốc.
Nothing is saved on this device unless you download a file.	Không có gì được lưu trên thiết bị này trừ khi bạn tải tệp xuống.
Nothing to show.	Không có gì để hiển thị.
One value chosen for {0} rows	Đã chọn một giá trị cho {0} dòng
Only exact, repeatable text operations can be applied to many cells. You see every change first, and one Undo restores them all. Question marks are never fixed in bulk.	Chỉ các thao tác văn bản chính xác, lặp lại được mới áp dụng cho nhiều ô. Bạn xem mọi thay đổi trước, và một lần Hoàn tác khôi phục tất cả. Dấu ? không bao giờ được sửa hàng loạt.
Only one of the two description columns has a value.	Chỉ một trong hai cột mô tả có giá trị.
Open fullscreen	Mở toàn màn hình
Original	Gốc
Other column	Cột còn lại
Previous issue	Lỗi trước
Privacy	Quyền riêng tư
Problem	Lỗi
Profile {0} · version {1}. Columns are matched by their exact header name; the target is the field of the reporting JSON.	Hồ sơ {0} · phiên bản {1}. Cột được ghép theo đúng tên tiêu đề; đích là trường của JSON báo cáo.
Question mark in a word	Dấu ? trong từ
Reading the workbook…	Đang đọc tệp Excel…
Record exception	Ghi ngoại lệ
Remove exception	Bỏ ngoại lệ
Remove zero-width characters	Xóa ký tự độ rộng bằng không
Removes spaces before and after the text.	Xóa khoảng trắng ở đầu và cuối văn bản.
Replace unusual spaces	Thay khoảng trắng lạ
Replacement character	Ký tự thay thế
Report accented text	Báo cáo văn bản có dấu
Reporting JSON	JSON báo cáo
Required	Bắt buộc
Required value missing	Thiếu giá trị bắt buộc
Restore original	Khôi phục bản gốc
Review and fix	Rà soát và sửa
Row	Dòng
Row {0}	Dòng {0}
Row, cell (AK45) or text	Dòng, ô (AK45) hoặc văn bản
Rows are changed only after you choose a value. Nothing is merged or dropped silently.	Các dòng chỉ thay đổi sau khi bạn chọn giá trị. Không có gì bị gộp hay bỏ âm thầm.
Rows hidden by a filter are checked too. Hidden rows are shown as such.	Các dòng bị bộ lọc ẩn vẫn được kiểm tra. Dòng ẩn được đánh dấu rõ.
Rows with issues	Dòng có lỗi
Rules that need your decision	Các quy tắc cần bạn quyết định
Search by row, cell or text	Tìm theo dòng, ô hoặc văn bản
See what was found	Xem kết quả kiểm tra
Several rows of one asset: the value of GIATRIBDKV is added up; GIATRI is taken from the first row. Differences are reported, never dropped.	Nhiều dòng của một tài sản: GIATRIBDKV được cộng lại; GIATRI lấy từ dòng đầu. Khác biệt được báo cáo, không bao giờ bị bỏ.
Severity	Mức độ
Sheet	Sheet
Show row context	Hiện ngữ cảnh dòng
Showing	Đang xem
Showing 8 of {0} changes.	Hiển thị 8 trên {0} thay đổi.
Spaces	Khoảng trắng
Still serious	Còn nghiêm trọng
Suggestion rejected. The original value is kept.	Đã từ chối gợi ý. Giá trị gốc được giữ.
The archive expands to an unsafe size.	Tệp nén giải ra kích thước không an toàn.
The cell is a formula without a stored result. It is never calculated here.	Ô là công thức chưa có kết quả lưu sẵn. Công cụ không bao giờ tự tính.
The check failed ({0} wrong values, {1} unexpected changes). The file is not offered.	Kiểm tra không đạt ({0} giá trị sai, {1} thay đổi ngoài dự kiến). Tệp không được cung cấp.
The corrected workbook did not pass its check.	Tệp Excel đã sửa không đạt bước kiểm tra.
The export policy is text without diacritics, and this text has them. The text is not damaged.	Chính sách xuất là văn bản không dấu, mà văn bản này có dấu. Văn bản không bị hỏng.
The export policy is text without diacritics. Accented text is reported as a low-priority warning, not as damage.	Chính sách xuất là văn bản không dấu. Văn bản có dấu chỉ là cảnh báo mức thấp, không phải hỏng dữ liệu.
The file is empty.	Tệp rỗng.
The file is larger than this tool accepts.	Tệp lớn hơn mức công cụ chấp nhận.
The list has separators inside a value. Splitting it automatically could break a contract number.	Danh sách có dấu phân cách bên trong một giá trị. Tự động tách có thể làm hỏng số hợp đồng.
The new value still has this problem, so it cannot be approved yet.	Giá trị mới vẫn còn lỗi này nên chưa thể duyệt.
The order of the contract list (DSSOHD) in the reference file cannot be reproduced from the workbook. The first-seen order is used, and reconciliation compares lists as sets.	Thứ tự danh sách hợp đồng (DSSOHD) trong tệp tham chiếu không thể tái tạo từ workbook. Dùng thứ tự xuất hiện đầu tiên, và đối soát so sánh danh sách như tập hợp.
The repair stage is complete.	Giai đoạn sửa lỗi đã hoàn tất.
The report date is stored as an Excel date, not as DD/MM/YYYY text.	Ngày báo cáo đang lưu dạng ngày Excel, không phải văn bản DD/MM/YYYY.
The reporting date and the contact details at the top of the JSON are entered when you export. They are never copied from an older file.	Ngày báo cáo và thông tin liên hệ ở đầu JSON được nhập khi xuất. Không bao giờ sao chép từ tệp cũ.
The same header appears more than once; the mapping cannot pick one on its own.	Tiêu đề xuất hiện nhiều lần; ánh xạ không thể tự chọn.
The text can be decoded back exactly. Check it before approving.	Văn bản có thể giải mã lại chính xác. Hãy kiểm tra trước khi duyệt.
The text contains control characters that are not printable. What they replaced cannot be known.	Văn bản có ký tự điều khiển không in được. Không thể biết chúng đã thay cho ký tự nào.
The text contains replacement characters (U+FFFD): the original letters were lost when the file was written.	Văn bản có ký tự thay thế (U+FFFD): chữ gốc đã mất khi tệp được ghi.
The text contains zero-width or invisible characters.	Văn bản có ký tự vô hình hoặc độ rộng bằng không.
The text has non-standard space characters.	Văn bản có ký tự khoảng trắng không chuẩn.
The text has repeated spaces.	Văn bản có khoảng trắng lặp.
The text has tabs or line breaks inside a single-line field.	Văn bản có tab hoặc xuống dòng trong trường một dòng.
The text looks like UTF-8 that was read with a Windows-1252/Latin-1 table (mojibake).	Văn bản giống UTF-8 bị đọc bằng bảng Windows-1252/Latin-1 (lỗi mã hóa).
The text starts or ends with spaces.	Văn bản bắt đầu hoặc kết thúc bằng khoảng trắng.
The two description columns hold different text. Choose which one is right.	Hai cột mô tả có nội dung khác nhau. Hãy chọn cột đúng.
The value is not a real date in DD/MM/YYYY form.	Giá trị không phải ngày thật dạng DD/MM/YYYY.
The value is not a real date in YYYYMMDD form.	Giá trị không phải ngày thật dạng YYYYMMDD.
The workbook could not be opened. It may be damaged.	Không mở được tệp Excel. Có thể tệp bị hỏng.
The workbook has no worksheets.	Tệp Excel không có sheet nào.
The workbook is read and checked inside this browser tab. It is never uploaded.	Tệp Excel được đọc và kiểm tra ngay trong thẻ trình duyệt này. Không bao giờ tải lên.
This archive is not an Excel workbook.	Tệp nén này không phải tệp Excel.
This column is not part of the mapping profile. It is kept in the workbook and not used in the JSON.	Cột này không thuộc hồ sơ ánh xạ. Nó được giữ trong tệp Excel và không dùng cho JSON.
This field never contains a question mark: a character was lost.	Trường này không bao giờ chứa dấu ?: một ký tự đã bị mất.
This file is not an .xlsx workbook.	Tệp này không phải tệp .xlsx.
This is a legacy .xls file or a password-protected workbook. Save it as an unprotected .xlsx first.	Đây là tệp .xls cũ hoặc tệp có mật khẩu. Hãy lưu thành .xlsx không mật khẩu trước.
This word appears {0} times in clean cells of this column.	Từ này xuất hiện {0} lần trong các ô sạch của cột này.
Trim spaces at the edges	Cắt khoảng trắng hai đầu
Turns several spaces in a row into one (names and codes only).	Biến nhiều khoảng trắng liên tiếp thành một (chỉ tên và mã).
Unknown column	Cột không xác định
Use one value for all {0} rows	Dùng một giá trị cho cả {0} dòng
Use suggestion	Dùng gợi ý
Value approved for {0}	Đã duyệt giá trị cho {0}
Verified	Đã xác nhận
Why is this value correct as it is?	Vì sao giá trị này đúng như hiện tại?
Words to fix	Từ cần sửa
Worksheets	Các sheet
Wrong cell type	Sai kiểu ô
Your data stays here	Dữ liệu của bạn ở lại đây
Your original file is never changed. Corrections are a separate layer until you export.	Tệp gốc không bao giờ bị đổi. Các chỉnh sửa là một lớp riêng cho đến khi bạn xuất.
issues	lỗi
not used in the JSON	không dùng cho JSON
of {0} rows	trên {0} dòng
{0} cells changed in one step. Undo restores them.	Đã đổi {0} ô trong một bước. Hoàn tác sẽ khôi phục.
{0} changes.	{0} thay đổi.
{0} has different values for rows that belong together. Nothing is dropped or merged silently: choose the right one.	{0} có giá trị khác nhau ở các dòng thuộc cùng một nhóm. Không có gì bị bỏ hay gộp âm thầm: hãy chọn giá trị đúng.
{0} issues need review, {1} of them serious.	{0} lỗi cần rà soát, trong đó {1} nghiêm trọng.
{0} serious issues	{0} lỗi nghiêm trọng
{0} serious issues must be fixed or accepted before the JSON can be exported.	Cần sửa hoặc chấp nhận {0} lỗi nghiêm trọng trước khi xuất JSON.
Mapping check	Kiểm tra ánh xạ
To review	Cần rà soát
Text copy	Bản sao dạng chữ
Mapped	Đã ánh xạ
Missing	Thiếu
Kept, not exported	Giữ lại, không xuất
Problems	Lỗi
Original value	Giá trị gốc
Rules for credit	Quy tắc về tín dụng
Choose an Excel workbook	Chọn tệp Excel
XLSX · up to 120 MB · opened on this device only	XLSX · tối đa 120 MB · chỉ mở trên thiết bị này
Report date and contact details	Ngày báo cáo và thông tin liên hệ
Loading credit…	Đang tải tín dụng…
Balance, top-ups and history	Số dư, nạp thêm và lịch sử
Approved descriptions are what the JSON holds	Mô tả đã duyệt đúng là nội dung trong JSON
As in the workbook	Như trong tệp Excel
Assets	Tài sản
Assets with conflicting values	Tài sản có giá trị mâu thuẫn
Audit report (CSV)	Báo cáo kiểm toán (CSV)
Audit report (JSON)	Báo cáo kiểm toán (JSON)
Branch, customer and asset, in the same hierarchy as the reference. Nothing is exported until every check below holds. Review notes never enter this file.	Chi nhánh, khách hàng và tài sản, cùng phân cấp với tệp tham chiếu. Không xuất gì cho đến khi mọi kiểm tra bên dưới đạt. Ghi chú rà soát không bao giờ vào tệp này.
Branches	Chi nhánh
By code (as the reference)	Theo mã (như tệp tham chiếu)
Checks	Các kiểm tra
Contracts	Hợp đồng
Customers	Khách hàng
Diagnostic · not the export	Chẩn đoán · không phải bản xuất
Download reporting-output.json	Tải reporting-output.json
Edits not used	Chỉnh sửa không dùng
Every column the JSON needs is mapped	Mọi cột mà JSON cần đều đã được ánh xạ
Every row is placed in the hierarchy	Mọi dòng đều được xếp vào phân cấp
First row only	Chỉ dòng đầu
Grouped preview	Xem trước theo nhóm
Keep every person	Giữ tất cả mọi người
Locked	Đang khóa
No serious issue is still open	Không còn lỗi nghiêm trọng chưa xử lý
Owners	Chủ sở hữu
Phone	Điện thoại
Prepared by	Người lập
Reconciliation	Đối soát
Report details	Thông tin báo cáo
Reporting date (YYYYMMDD)	Ngày báo cáo (YYYYMMDD)
Reporting date and contact details are filled in	Đã điền ngày báo cáo và thông tin liên hệ
Rows and assets differ because several rows describe one asset: {0} assets are made of more than one row. Repeated contract numbers ({1}) are listed once per asset; nothing is dropped.	Số dòng và số tài sản khác nhau vì nhiều dòng mô tả cùng một tài sản: {0} tài sản gồm nhiều hơn một dòng. Số hợp đồng lặp ({1}) chỉ liệt kê một lần cho mỗi tài sản; không có gì bị bỏ.
Rows read	Dòng đã đọc
Rows, assets and groups add up	Số dòng, tài sản và nhóm khớp nhau
The JSON is not ready: a check no longer holds.	JSON chưa sẵn sàng: có một kiểm tra không còn đạt.
The JSON matches the reporting schema	JSON khớp schema báo cáo
The audit report names issues by fingerprint and holds no cell text.	Báo cáo kiểm toán chỉ nêu lỗi bằng dấu vân tay và không chứa nội dung ô.
The file is valid UTF-8 and parses	Tệp là UTF-8 hợp lệ và đọc được
The same input gives the same bytes	Cùng đầu vào cho ra cùng từng byte
Unmatched rows	Dòng không xếp được
checking	đang kiểm tra
not passed	không đạt
passed	đạt
{0} assets	{0} tài sản
{0} branches · {1} customers · {2} assets from {3} rows. A sample is shown.	{0} chi nhánh · {1} khách hàng · {2} tài sản từ {3} dòng. Đang hiển thị một phần mẫu.
{0} contracts · {1} owners	{0} hợp đồng · {1} chủ sở hữu
{0} customers	{0} khách hàng
Owners when rows of one asset list different people	Chủ sở hữu khi các dòng của một tài sản ghi những người khác nhau
Order of branches, customers and assets	Thứ tự chi nhánh, khách hàng và tài sản
A check no longer holds	Có một kiểm tra không còn đạt
A reason is required	Cần nêu lý do
Amount is not a number	Số tiền không phải là số
Building the preview…	Đang tạo bản xem trước…
Building…	Đang tạo…
Check failed	Kiểm tra không đạt
Check failed: {0} wrong, {1} unexpected	Kiểm tra không đạt: {0} sai, {1} ngoài dự kiến
Close actions	Đóng thao tác
Close file	Đóng tệp
Code stored as a number	Mã đang lưu dạng số
Collateral	Tài sản bảo đảm
Column is not in the mapping profile	Cột không có trong hồ sơ ánh xạ
Column {0} of {1}	Cột {0} / {1}
Copy cell	Chép ô
Corrected workbook verified	Đã kiểm tra tệp Excel đã sửa
Date stored as a number	Ngày đang lưu dạng số
Download audit report (JSON)	Tải báo cáo kiểm toán (JSON)
Exact text changes only. One Undo restores them all.	Chỉ thay đổi văn bản chính xác. Một lần Hoàn tác khôi phục tất cả.
Excel formation	Chuẩn hóa Excel
Find and repair errors in a workbook	Tìm và sửa lỗi trong tệp Excel
Flag accented text	Báo văn bản có dấu
Formula has no stored result	Công thức chưa có kết quả
Go to Excel formation	Đến Chuẩn hóa Excel
Group the repaired data into the reporting JSON	Gom dữ liệu đã sửa thành JSON báo cáo
Has diacritics; the export is without diacritics	Có dấu; bản xuất là không dấu
Header appears more than once	Tiêu đề xuất hiện nhiều lần
JSON formation	Tạo JSON
Mis-decoded text (UTF-8 read as Windows-1252)	Văn bản giải mã sai (UTF-8 đọc như Windows-1252)
More downloads	Tải thêm
No changes yet	Chưa có thay đổi
No match in this column	Không có từ khớp trong cột này
No serious issue open	Không còn lỗi nghiêm trọng
No workbook open	Chưa mở tệp Excel
Not a real date (DD/MM/YYYY)	Không phải ngày thật (DD/MM/YYYY)
Not a real date (YYYYMMDD)	Không phải ngày thật (YYYYMMDD)
Only one description column is filled	Chỉ một cột mô tả có giá trị
Open a workbook in Excel formation first.	Hãy mở tệp Excel ở mục Chuẩn hóa Excel trước.
Open decisions	Quyết định còn mở
Options	Tùy chọn
Position in the file	Vị trí trong tệp
Processed on this device	Xử lý ngay trên thiết bị này
Replacement character: the original letter was lost	Ký tự thay thế: chữ gốc đã mất
Report date and contacts: entered at export	Ngày báo cáo và liên hệ: nhập khi xuất
Report date stored as a number	Ngày báo cáo đang lưu dạng số
Required value is empty	Giá trị bắt buộc đang trống
Row {0} of {1}	Dòng {0} / {1}
Separator inside a list value	Có dấu phân cách trong giá trị danh sách
Share of issues	Tỷ lệ lỗi
Still has this problem	Vẫn còn lỗi này
TS005 first row · TS006 sum of rows	TS005 dòng đầu · TS006 tổng các dòng
TS009 order: first seen	Thứ tự TS009: xuất hiện đầu tiên
The two description columns differ	Hai cột mô tả khác nhau
Verified: {0} cells match, nothing else changed	Đã xác minh: {0} ô khớp, không có gì khác đổi
{0} branches · {1} customers · {2} assets · {3} rows	{0} chi nhánh · {1} khách hàng · {2} tài sản · {3} dòng
{0} clean cells	{0} ô sạch
{0} differs between rows of the same group	{0} khác nhau giữa các dòng cùng nhóm
{0} serious open	{0} lỗi nghiêm trọng đang mở
{0} hidden rows	{0} dòng bị ẩn
Guess and check	Đoán và kiểm tra
Reading the file's own text…	Đang đọc chữ trong chính tệp…
Draft guesses {0} word ahead	Bản nháp đoán trước {0} từ
Draft guesses {0} words ahead	Bản nháp đoán trước {0} từ
Target checks all {0} in one pass	Bản đích kiểm tra cả {0} từ trong một lượt
First guess rejected, target writes its own	Từ đoán đầu bị loại, bản đích tự viết từ của mình
All {0} guesses accepted	Cả {0} từ đoán đều được nhận
accepted	được nhận
Frequency, fast	Theo tần suất, nhanh
Context, careful	Theo ngữ cảnh, kỹ
{0} words drafted, {1} accepted	{0} từ được nháp, {1} được nhận
Done in {0} pass	Xong sau {0} lượt
Done in {0} passes	Xong sau {0} lượt
{0} pass	{0} lượt
{0} passes	{0} lượt
{0} pass for {1} words	{0} lượt cho {1} từ
{0} passes for {1} words	{0} lượt cho {1} từ
Without guessing	Không đoán trước
Broken words	Các từ bị lỗi
{0} times in the file	{0} lần trong tệp
No match in this file	Không có từ khớp trong tệp này
Close call	Sát nhau
Faster	Nhanh hơn
Drafts accepted	Bản nháp được nhận
Words per pass	Từ mỗi lượt
Draft length	Độ dài bản nháp
{0} words	{0} từ
Compare without guessing	So với không đoán trước
Use this reading	Dùng cách đọc này
{0} close calls: check them	{0} từ sát nhau: hãy kiểm tra
Every answer has a clear lead	Mọi đáp án đều vượt trội rõ ràng
File preview	Xem trước tệp
Whole file	Toàn bộ tệp
Readable	Dễ đọc
reporting-output.json	reporting-output.json
validation-audit.json	validation-audit.json
validation-report.csv	validation-report.csv
Save progress	Lưu tiến độ
Save progress as a small file; the workbook is not in it	Lưu tiến độ thành một tệp nhỏ; bảng tính không nằm trong đó
Resume progress	Tiếp tục tiến độ
Resume progress from a saved file	Tiếp tục từ tệp tiến độ đã lưu
Progress file	Tệp tiến độ
Progress saved: {0} corrections. Keep the file next to your workbook.	Đã lưu tiến độ: {0} chỉnh sửa. Hãy giữ tệp này cạnh bảng tính của bạn.
Resumed {0} corrections and {1} exceptions. Undo goes back.	Đã khôi phục {0} chỉnh sửa và {1} ngoại lệ. Hoàn tác sẽ quay lại.
Resumed {0} corrections, but the counts differ from the saved file: check the review.	Đã khôi phục {0} chỉnh sửa, nhưng số liệu khác với tệp đã lưu: hãy kiểm tra lại.
This progress belongs to another workbook. Nothing was changed.	Tiến độ này thuộc về bảng tính khác. Không có gì bị thay đổi.
A cell of this workbook is not what the progress started from (row {0}). Nothing was changed.	Một ô của bảng tính này không còn như lúc lưu tiến độ (dòng {0}). Không có gì bị thay đổi.
This progress file is from another version. Nothing was changed.	Tệp tiến độ này thuộc phiên bản khác. Không có gì bị thay đổi.
This file is too large to be a progress file.	Tệp này quá lớn để là tệp tiến độ.
This is not a progress file.	Đây không phải tệp tiến độ.
This progress file is damaged. Nothing was changed.	Tệp tiến độ này bị hỏng. Không có gì bị thay đổi.
This step could not be drawn. Your workbook and your corrections are safe: nothing was lost.	Không hiển thị được bước này. Bảng tính và các chỉnh sửa của bạn vẫn an toàn, không mất gì.
Locate the issue	Xác định ô cần sửa
Review the correction	Kiểm tra và sửa nội dung
Compare the original, then choose or type a replacement.	Đối chiếu bản gốc, sau đó chọn gợi ý hoặc nhập nội dung đúng.
Original text	Nội dung gốc
Confirm the final value	Xác nhận nội dung cuối cùng
Read the full text once more. Your changes are saved only when you approve.	Đọc lại toàn bộ nội dung. Chỉ lưu thay đổi khi bạn bấm duyệt.
Some characters are still unresolved. Correct them here or review them later.	Vẫn còn ký tự chưa xác định. Sửa tại đây hoặc quay lại kiểm tra sau.
Draft only · not saved yet	Bản nháp · chưa lưu thay đổi
Choose a suggestion above or edit this text directly.	Chọn gợi ý ở trên hoặc sửa trực tiếp nội dung này.
Suggested corrections	Gợi ý sửa từ
Looking for matching words in this workbook…	Đang tìm từ phù hợp trong bảng tính…
Suggestions are unavailable. You can still type the correction below.	Chưa tải được gợi ý. Bạn vẫn có thể nhập nội dung đúng bên dưới.
Choose a word or type your own. Check uncertain words before approving.	Chọn từ đúng hoặc tự nhập. Kiểm tra các từ chưa chắc chắn trước khi duyệt.
{0} words to check	{0} từ cần kiểm tra
In the file	Trong tệp gốc
Replacement	Từ thay thế
Evidence	Cơ sở gợi ý
Keep original	Giữ nguyên
Your correction for {0}	Từ bạn muốn sửa cho {0}
Or type the correct word…	Hoặc nhập từ đúng…
Your choice	Bạn đã chọn
Supported by this file	Có cơ sở từ tệp
Needs your review	Cần bạn kiểm tra
Matches the surrounding words	Khớp với ngữ cảnh xung quanh
Based on word frequency	Dựa trên tần suất xuất hiện
Type a correction or leave it for later	Tự nhập hoặc để kiểm tra sau
{0} words still need your choice	Còn {0} từ cần bạn chọn
Ready to copy into the final value	Sẵn sàng đưa vào nội dung cuối cùng
This fills the draft. Approve below to save the change.	Chỉ điền vào bản nháp. Bấm duyệt bên dưới để lưu thay đổi.
Where do these suggestions come from?	Các gợi ý này lấy từ đâu?
Matching words and phrases in this workbook. Counts show occurrences, not accuracy. Uncertain words stay unchanged until you choose. No file content leaves this browser.	Đối chiếu từ và cụm từ trong chính bảng tính này. Số đếm là số lần xuất hiện, không phải độ chính xác. Từ chưa chắc chắn được giữ nguyên cho đến khi bạn chọn. Nội dung tệp chỉ được xử lý trong trình duyệt.
Type another word	Tự nhập từ khác
1 word to check	1 từ cần kiểm tra
Preview in file	Xem trên bảng tính
Review later →	Kiểm tra sau →
Original retained	Giữ lại nội dung gốc
Selected from workbook matches	Bạn chọn từ khớp trong bảng tính
Entered manually	Bạn đã tự nhập
Getting ready…	Đang chuẩn bị…
Draft proposes {0} word	Bản nháp đề xuất {0} từ
Draft proposes {0} words	Bản nháp đề xuất {0} từ
{0} words drafted, {1} agreed	{0} từ được nháp, {1} từ khớp với bản kiểm tra
{0} check for {1} words	{0} lượt kiểm tra cho {1} từ
{0} checks for {1} words	{0} lượt kiểm tra cho {1} từ
{0} check	{0} lượt kiểm tra
{0} checks	{0} lượt kiểm tra
{0} word	{0} từ
{0} percent	{0} phần trăm
Words per check	Từ mỗi lượt kiểm tra
One word at a time	Từng từ một
Compare with one word at a time	So với kiểm tra từng từ một
Needs your choice	Cần bạn chọn
Chosen	Đã chọn
Seen {0}× next to these words in this workbook	Xuất hiện {0} lần cạnh các từ này trong bảng tính
choose a word	chọn từ
move between words	chuyển giữa các từ
Click a word in the answer to jump to it	Bấm một từ trong kết quả để nhảy tới hàng của nó
Checks made	Số lượt kiểm tra
These numbers describe the replay: how often the quick guess matched the careful check. They do not say whether a word is right; the table and your approval do.	Các con số này mô tả lần phát lại: bản đoán nhanh khớp bản kiểm tra kỹ bao nhiêu lần. Chúng không cho biết một từ có đúng hay không; bảng bên dưới và sự duyệt của bạn mới quyết định.
Copy value	Sao chép giá trị
Copy path	Sao chép đường dẫn
Value copied	Đã sao chép giá trị
Path copied	Đã sao chép đường dẫn
Show {0} more, {1} hidden	Hiện thêm {0}, còn ẩn {1}
Show {0} more	Hiện thêm {0}
{0} item	{0} phần tử
{0} items	{0} phần tử
{0} key	{0} khóa
{0} keys	{0} khóa
Search keys and values	Tìm khóa và giá trị
Search JSON	Tìm trong JSON
Previous match	Kết quả trước
Next match	Kết quả sau
Collapse all	Thu gọn tất cả
Run checks	Chạy kiểm tra
Skipped	Bỏ qua
Checking step {0} of {1}	Đang kiểm tra bước {0} trên {1}
Every check holds · {0}	Mọi kiểm tra đều đạt · {0}
Every check holds	Mọi kiểm tra đều đạt
1 step needs attention	1 bước cần chú ý
{0} steps need attention	{0} bước cần chú ý
Running the checks	Đang chạy các kiểm tra
The checks finished	Các kiểm tra đã xong
The run was stopped	Đã dừng lần chạy
Workbook opened	Đã mở bảng tính
rows	dòng
{0} branches · {1} customers · {2} assets	{0} chi nhánh · {1} khách hàng · {2} tài sản
{0} serious issues are still open. Resolve them or accept them with a reason.	Còn {0} lỗi nghiêm trọng đang mở. Hãy sửa hoặc chấp nhận kèm lý do.
The reporting date (YYYYMMDD) and the three contact fields must be filled in.	Cần điền ngày báo cáo (YYYYMMDD) và ba trường liên hệ.
A column the JSON needs is not mapped.	Có cột mà JSON cần chưa được ánh xạ.
Rows could not all be placed in the hierarchy.	Không phải dòng nào cũng xếp được vào cấu trúc phân cấp.
Open review	Mở phần rà soát
Fill in	Điền vào
Ready to export?	Đã sẵn sàng xuất?
every check holds	mọi kiểm tra đều đạt
{0} checks do not hold	{0} kiểm tra chưa đạt
can be downloaded below	có thể tải xuống bên dưới
is locked until every check holds	bị khóa cho tới khi mọi kiểm tra đạt
Nothing blocks the export.	Không có gì chặn việc xuất.
Checks before the export	Kiểm tra trước khi xuất
Run in this tab. Nothing leaves it.	Chạy ngay trong thẻ này. Không có gì rời khỏi nó.
Reporting JSON preview	Xem trước JSON báo cáo
Map columns	Ánh xạ cột
Review issues	Rà soát lỗi
Group rows	Gom nhóm dòng
Validate the JSON	Kiểm tra JSON
the columns the JSON needs	các cột mà JSON cần
nothing serious left open	không còn lỗi nghiêm trọng
date and contacts	ngày và thông tin liên hệ
branch, customer, asset	chi nhánh, khách hàng, tài sản
schema, bytes, replay	lược đồ, byte, phát lại
Entry without its key column	Mục thiếu cột khóa
{0} is empty, but this entry has values in other columns	{0} đang trống, nhưng mục này có giá trị ở các cột khác
TCTD code (file name)	Mã TCTD (tên tệp)
Sequence, 3 characters (file name)	Số thứ tự, 3 ký tự (tên tệp)
The file name is D40 + TCTD code + report date + . + sequence + .json	Tên tệp là D40 + mã TCTD + ngày báo cáo + . + số thứ tự + .json
Assets with a project (TS014)	Tài sản có dự án (TS014)
Assets with a land title (TS015)	Tài sản có giấy chứng nhận đất (TS015)
Assets with a vehicle (TS016)	Tài sản có phương tiện (TS016)
Assets with shared collateral (TS010, TS011)	Tài sản bảo đảm chung (TS010, TS011)
The file name follows D40 + TCTD code + date + sequence	Tên tệp theo dạng D40 + mã TCTD + ngày + số thứ tự
Every key is where Mẫu số 09 puts it	Mọi khóa đúng vị trí như Mẫu số 09
date, contacts and file name	ngày, thông tin liên hệ và tên tệp
schema, template, bytes, replay	lược đồ, mẫu, byte, phát lại
The reporting date (YYYYMMDD), the three contact fields, the TCTD code and the 3-character sequence must be filled in.	Phải điền ngày báo cáo (YYYYMMDD), ba trường liên hệ, mã TCTD và số thứ tự 3 ký tự.
Example: Excel row {0}	Ví dụ: dòng Excel {0}
Rule	Quy tắc
In the example row	Ở dòng ví dụ
Entries of the JSON built from several columns	Các mục của JSON được ghép từ nhiều cột
key column {0}	cột khóa {0}
an entry without its key column is a problem to review; its values are kept	mục thiếu cột khóa là vấn đề cần rà soát; giá trị của nó vẫn được giữ
File name: TCTD code and sequence are entered at export	Tên tệp: mã TCTD và số thứ tự được nhập khi xuất
The one date of the workbook as YYYYMMDD; confirmed at export	Ngày duy nhất của sổ làm việc, dạng YYYYMMDD; xác nhận khi xuất
Groups the rows into branches	Gom các dòng thành chi nhánh
First row of the branch	Dòng đầu của chi nhánh
Groups the rows into customers of a branch	Gom các dòng thành khách hàng của chi nhánh
First row of the customer	Dòng đầu của khách hàng
Groups the rows into assets of a customer	Gom các dòng thành tài sản của khách hàng
First row of the asset	Dòng đầu của tài sản
First row of the asset (empty text when empty)	Dòng đầu của tài sản (chuỗi rỗng khi trống)
First row of the asset, as a number	Dòng đầu của tài sản, dạng số
Exact sum of every row of the asset, as a number	Tổng chính xác mọi dòng của tài sản, dạng số
First row of the asset, as a number (0 when empty)	Dòng đầu của tài sản, dạng số (0 khi trống)
Every distinct contract of the asset, first seen first; never split on /	Mọi hợp đồng khác nhau của tài sản, theo thứ tự xuất hiện; không bao giờ tách theo /
One owner per distinct person of the asset	Mỗi người khác nhau của tài sản là một chủ sở hữu
Same owner entry	Cùng mục chủ sở hữu
Every distinct value of the asset, first seen first	Mọi giá trị khác nhau của tài sản, theo thứ tự xuất hiện
Description of the land title entry (the twin of MOTABDS)	Mô tả của mục giấy chứng nhận đất (cột song sinh của MOTABDS)
One investor per distinct set of investor columns	Mỗi bộ cột chủ đầu tư khác nhau là một chủ đầu tư
Same investor entry	Cùng mục chủ đầu tư
One project per distinct set of project columns	Mỗi bộ cột dự án khác nhau là một dự án
Same project entry	Cùng mục dự án
Same project entry, as a number (0 when empty)	Cùng mục dự án, dạng số (0 khi trống)
One land title entry per distinct set of land title columns	Mỗi bộ cột giấy chứng nhận đất khác nhau là một mục
Same land title entry	Cùng mục giấy chứng nhận đất
One vehicle per distinct set of vehicle columns	Mỗi bộ cột phương tiện khác nhau là một phương tiện
Same vehicle entry	Cùng mục phương tiện
`);
