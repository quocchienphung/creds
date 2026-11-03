import { catalog } from './catalog';
/** Excel formation: the per-sheet text scan and the replay of a confirmed fix. */
export const excel = catalog(`
Text scan	Quét chữ
Text cells	Ô chữ
Cells with ?	Ô có ?
Clean	Sạch
{0} to review	{0} cần rà soát
Scan failed	Quét lỗi
Not scanned	Chưa quét
Some worksheets were not scanned, so nothing can be said about them yet.	Một số sheet chưa được quét nên chưa thể kết luận gì về chúng.
No worksheet matches the mapping profile, so the JSON conversion is unavailable. Corrupted text is still checked on every worksheet.	Không sheet nào khớp hồ sơ ánh xạ nên chưa chuyển được sang JSON. Chữ bị hỏng vẫn được kiểm tra trên mọi sheet.
Change applied	Đã áp dụng thay đổi
About the JSON conversion	Về việc chuyển sang JSON
In the file	Trong tệp
Before your fix	Trước khi bạn sửa
Confirmed	Đã xác nhận
What you approved	Điều bạn đã duyệt
Words kept	Từ giữ nguyên
Applied: {0} word fixed	Đã áp dụng: sửa {0} từ
Applied: {0} words fixed	Đã áp dụng: sửa {0} từ
The file has {0} word here	Tệp có {0} từ ở đây
The file has {0} words here	Tệp có {0} từ ở đây
Checking each word against your fix	Đối chiếu từng từ với bản sửa của bạn
A word changed: your fix is written in its place	Một từ đã đổi: bản sửa của bạn được ghi vào chỗ đó
Every word already matched	Mọi từ đã khớp
This replays the change you approved: words the file already had right stay, the others are replaced by your fix. You can undo it.	Đây là phần phát lại thay đổi bạn vừa duyệt: từ nào tệp đã đúng thì giữ, từ còn lại được thay bằng bản sửa của bạn. Bạn có thể hoàn tác.
{0} of {1} words stayed as they were	{0}/{1} từ được giữ nguyên
{0} word replaced by your fix	{0} từ được thay bằng bản sửa của bạn
{0} words replaced by your fix	{0} từ được thay bằng bản sửa của bạn
`);
