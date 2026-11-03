import { catalog } from './catalog';
export const library = catalog(String.raw`
Queued	Trong hàng chờ
Live	Trực tiếp
Deleted	Đã xóa
Deleting	Đang xóa
Couldn’t finish	Chưa hoàn tất
Restoring	Đang khôi phục
Hold a little longer to confirm.	Giữ thêm một chút để xác nhận.
Are you sure?	Bạn chắc chứ?
Press and hold to confirm.	Nhấn giữ để xác nhận.
Undo is available.	Có thể hoàn tác.
Waiting for you	Đang chờ bạn
Needs attention	Cần kiểm tra
Check this GitHub URL.	Kiểm tra đường dẫn GitHub này.
Add a lowercase-with-hyphens name, a description and the skill instructions.	Thêm tên viết thường, nối bằng gạch ngang, mô tả và chỉ dẫn kỹ năng.
Could not read this GitHub skill.	Không thể đọc kỹ năng từ GitHub.
Source scan · {0} skills found	Quét nguồn · Tìm thấy {0} kỹ năng
This skill already has WORKSPACE-INSTRUCTIONS.md. Import it first, or clear the additional instructions to preserve its source file.	Kỹ năng đã có WORKSPACE-INSTRUCTIONS.md. Nhập kỹ năng trước hoặc xóa chỉ dẫn bổ sung để giữ tệp nguồn.
Give the skill a name in lowercase-with-hyphens (up to 64 characters).	Đặt tên kỹ năng bằng chữ thường nối bằng gạch ngang, tối đa 64 ký tự.
Add a description and the instructions your agent should follow.	Thêm mô tả và chỉ dẫn mà agent cần tuân theo.
The name and description must match the SKILL.md frontmatter. Edit the file header to change them.	Tên và mô tả phải khớp phần đầu SKILL.md. Sửa phần đầu tệp để đổi chúng.
This skill already exists. Archive the old version before adding a new one.	Kỹ năng đã tồn tại. Lưu trữ phiên bản cũ trước khi thêm phiên bản mới.
This workspace holds up to 200 skills.	Không gian này chứa tối đa 200 kỹ năng.
Skill data or checksum is invalid. Check the source and file size.	Dữ liệu hoặc mã kiểm tra kỹ năng không hợp lệ. Kiểm tra nguồn và dung lượng tệp.
GitHub skill folder scan	Quét thư mục kỹ năng GitHub
Authored instruction	Chỉ dẫn tự viết
{0} added. The save status confirms when it is persisted.	Đã thêm {0}. Trạng thái lưu sẽ xác nhận khi dữ liệu được ghi xong.
Import cancelled.	Đã hủy nhập.
Could not add this skill.	Không thể thêm kỹ năng này.
Skill import	Nhập kỹ năng
Wait for the skill library to finish saving before delivery.	Chờ thư viện kỹ năng lưu xong trước khi chuyển giao.
Connect a workspace backend to transfer to an agent.	Kết nối backend không gian để chuyển cho agent.
Enter the agent ID configured in your backend.	Nhập ID agent đã cấu hình trong backend.
The backend did not return a matching agent receipt. Delivery is unconfirmed.	Backend chưa trả biên nhận agent khớp dữ liệu. Chưa xác nhận chuyển giao.
Receipt confirmed by {0}. {1} skill(s) received; this does not verify model behavior.	{0} đã xác nhận biên nhận. Đã nhận {1} kỹ năng; điều này không xác minh hành vi mô hình.
Bundle prepared for download. Run the local installer, then load the instructions in your agent.	Gói đã sẵn sàng tải. Chạy trình cài cục bộ, rồi nạp chỉ dẫn vào agent.
Receipt · {0}	Biên nhận · {0}
Bundle serialization	Đóng gói dữ liệu
Delivery failed.	Chuyển giao thất bại.
Agent transfer	Chuyển cho agent
Bundle export	Xuất gói
Receipt file is too large.	Tệp biên nhận quá lớn.
Invalid receipt file.	Tệp biên nhận không hợp lệ.
Receipt does not match this workspace’s skill IDs and checksums.	Biên nhận không khớp ID và mã kiểm tra kỹ năng của không gian này.
Offline file receipt	Biên nhận tệp ngoại tuyến
Receipt verification only; original delivery duration unavailable. {0}	Chỉ xác minh biên nhận; không có thời lượng chuyển giao gốc. {0}
Receipt imported for {0} instruction file(s). Agent loading and execution remain unverified.	Đã nhập biên nhận cho {0} tệp chỉ dẫn. Chưa xác minh việc agent nạp và thực thi.
Could not read receipt.	Không thể đọc biên nhận.
{0} archived.	Đã lưu trữ {0}.
Archive the active version before restoring this one.	Lưu trữ phiên bản đang dùng trước khi khôi phục phiên bản này.
Choose a SKILL.md smaller than 200 KB.	Chọn tệp SKILL.md nhỏ hơn 200 KB.
Invalid SKILL.md.	SKILL.md không hợp lệ.
Skilled workspace	Không gian kỹ năng
Skill library	Thư viện kỹ năng
Add a skill	Thêm kỹ năng
Skill instructions	Chỉ dẫn kỹ năng
Additional instructions for this skill (optional)	Chỉ dẫn bổ sung cho kỹ năng (tùy chọn)
What should your agent know how to do?	Agent của bạn cần biết làm gì?
Skill source	Nguồn kỹ năng
GitHub source	Nguồn GitHub
Local file	Tệp trên thiết bị
Custom skill	Kỹ năng tự tạo
Add source	Thêm nguồn
GitHub repository	Kho GitHub
Scan a repository or a skill folder	Quét kho mã hoặc thư mục kỹ năng
Local SKILL.md	SKILL.md trên thiết bị
Read an instruction file from your device	Đọc tệp chỉ dẫn từ thiết bị
Write instructions	Viết chỉ dẫn
Create a skill in this workspace	Tạo kỹ năng trong không gian này
Skill target	Nơi chạy kỹ năng
AI Agent	Agent AI
Attributes	Thuộc tính
Scanning...	Đang quét...
Add skill	Thêm kỹ năng
GitHub repository or skill URL	Đường dẫn kho GitHub hoặc kỹ năng
Skill name	Tên kỹ năng
When should the agent use this skill?	Khi nào agent nên dùng kỹ năng này?
Cite sources	Trích dẫn nguồn
Verify before answering	Xác minh trước khi trả lời
Ask when uncertain	Hỏi khi chưa chắc
Read a local SKILL.md	Đọc SKILL.md trên thiết bị
Dismiss import error	Đóng lỗi nhập
Filter skills	Lọc kỹ năng
All skills	Mọi kỹ năng
Saving...	Đang lưu...
Save failed	Lưu thất bại
Deliver skills	Chuyển kỹ năng
Search skills	Tìm kỹ năng
Find a skill...	Tìm kỹ năng...
No skills in this view	Không có kỹ năng phù hợp
No skills yet	Chưa có kỹ năng
Try a different filter or search.	Thử bộ lọc hoặc từ tìm kiếm khác.
Import from GitHub or add your own instructions.	Nhập từ GitHub hoặc thêm chỉ dẫn của bạn.
Add from GitHub	Thêm từ GitHub
Skill operations measurement	Đo thao tác kỹ năng
Realtime stream	Dòng dữ liệu trực tiếp
Measured	Đã đo
Measurement type	Loại phép đo
All operations	Mọi thao tác
Storage writes	Lần ghi dữ liệu
Imports	Lần nhập
Bundle exports	Lần xuất gói
Agent transfers	Lần chuyển agent
Operation duration	Thời lượng thao tác
Add a skill to see your first measurement	Thêm kỹ năng để xem phép đo đầu tiên
Operations	Thao tác
p95 duration	Thời lượng p95
Configured REST backend	Backend REST đã cấu hình
This browser only	Chỉ trình duyệt này
Latest 200	200 lượt gần nhất
Waiting for your first operation.	Đang chờ thao tác đầu tiên.
Retry activity save	Thử lưu hoạt động lại
Dismiss error	Đóng lỗi
Archive the active version before undoing.	Lưu trữ phiên bản đang dùng trước khi hoàn tác.
Archive undone.	Đã hoàn tác lưu trữ.
Dismiss notice	Đóng thông báo
Choose a skill	Chọn kỹ năng
Search discovered skills	Tìm kỹ năng đã phát hiện
Find a skill in this repository...	Tìm kỹ năng trong kho này...
Import skill	Nhập kỹ năng
No matching skills.	Không có kỹ năng phù hợp.
Choose the instructions to include. Agent delivery is confirmed by a matching receipt.	Chọn chỉ dẫn để đưa vào gói. Chuyển giao cho agent được xác nhận bằng biên nhận khớp dữ liệu.
Local AI / portable bundle	AI cục bộ / gói chuyển được
Includes SKILL.md, supporting files, source metadata, checksums and guardrails.	Gồm SKILL.md, tệp hỗ trợ, thông tin nguồn, mã kiểm tra và quy tắc an toàn.
Your agent must load SKILL.md and LOGIO.md to use them.	Agent phải nạp SKILL.md và LOGIO.md để sử dụng.
Import installer receipt	Nhập biên nhận cài đặt
Connected AI agent	Agent AI đã kết nối
Agent ID	ID agent
A receipt confirms delivery, not model execution.	Biên nhận xác nhận chuyển giao, không xác nhận mô hình thực thi.
Configure a workspace backend to enable agent delivery.	Cấu hình backend để bật chuyển giao cho agent.
Transfer & verify receipt	Chuyển và xác minh biên nhận
Waiting for measurements	Đang chờ phép đo
Paused{0}	Đã tạm dừng{0}
, {0} new	, {0} mới
, resume	, tiếp tục
, pause	, tạm dừng
live chart	biểu đồ trực tiếp
{0}, last {1} seconds	{0}, {1} giây qua
Focus holds the view. Arrow keys read points; Home and End jump to the first and last point; Page Up and Page Down move ten points. Space pauses or resumes. Escape resumes the live view.	Khi có tiêu điểm, góc nhìn được giữ. Phím mũi tên đọc điểm; Home/End đến đầu/cuối; Page Up/Down chuyển 10 điểm. Space tạm dừng hoặc tiếp tục. Escape trở về trực tiếp.
, latest 20 readings	, 20 giá trị gần nhất
Your workspace	Không gian của bạn
Ready to deliver	Sẵn sàng chuyển
Deliver	Chuyển giao
Archive {0}	Lưu trữ {0}
Delete this skill?	Xóa kỹ năng này?
{0} captured files · external tools may still be required.	{0} tệp đã thu thập · có thể vẫn cần công cụ bên ngoài.
Instruction file only · supporting files may be required.	Chỉ có tệp chỉ dẫn · có thể cần tệp hỗ trợ.
Inspect original source	Xem nguồn gốc
Supporting files	Tệp hỗ trợ
{0} supporting files	{0} tệp hỗ trợ
Revision	Phiên bản
Authored locally	Viết trên thiết bị
Agent instructions	Chỉ dẫn agent
No additional guardrails	Không có quy tắc an toàn bổ sung
The instructions can’t be empty.	Chỉ dẫn không được để trống.
SKILL.md is {0} KB; the limit is {1} KB.	SKILL.md có dung lượng {0} KB; giới hạn là {1} KB.
Check the SKILL.md header.	Kiểm tra phần đầu SKILL.md.
Another skill is already named {0}. Change the name in the header, or archive the other one first.	Đã có kỹ năng tên {0}. Đổi tên trong phần đầu tệp hoặc lưu trữ kỹ năng kia trước.
These changes would make the skill invalid. Check the header and the size.	Thay đổi làm kỹ năng không hợp lệ. Kiểm tra phần đầu tệp và dung lượng.
A skill named {0} exists now. Archive it before restoring this one.	Hiện đã có kỹ năng tên {0}. Lưu trữ kỹ năng đó trước khi khôi phục bản này.
the header gives the name and description	phần đầu tệp xác định tên và mô tả
· the checksum is recalculated when you save	· mã kiểm tra được tính lại khi lưu
Where the skill runs	Nơi chạy kỹ năng
Everything is saved	Đã lưu tất cả
Could not save the changes.	Không thể lưu thay đổi.
Changes stay in this workspace	Thay đổi lưu trong không gian này
; the original source is not touched	; nguồn gốc được giữ nguyên
Saving	Đang lưu
Database save	Lưu cơ sở dữ liệu
Browser save	Lưu trình duyệt
vs previous {0} days	so với {0} ngày trước
Library overview	Tổng quan thư viện
Ready skills	Kỹ năng sẵn sàng
{0} archived	{0} đã lưu trữ
In your library	Trong thư viện
Skills added	Kỹ năng đã thêm
Deliveries	Lần chuyển giao
Nothing delivered yet	Chưa có lượt chuyển giao
Instruction data	Dữ liệu chỉ dẫn
{0} in {1}	{0} trong {1}
{0} trend	Xu hướng {0}
no data	chưa có dữ liệu
Add a source	Thêm nguồn
Deliver to an agent	Chuyển cho agent
Confirm a receipt	Xác nhận biên nhận
imported into your library	đã nhập vào thư viện
Skill bundle exported	Đã xuất gói kỹ năng
Delivery confirmed by {0}	{0} đã xác nhận chuyển giao
Operation	Thao tác
Took	Thời lượng
Target	Đích
Reason	Lý do
Your timeline starts with the first skill you add or deliver.	Dòng thời gian bắt đầu khi bạn thêm hoặc chuyển kỹ năng đầu tiên.
Skill timeline	Dòng thời gian kỹ năng
Timeline	Dòng thời gian
{0} update{1}	{0} cập nhật
No updates yet	Chưa có cập nhật
Setup, {0} of {1} done	Thiết lập, đã xong {0}/{1}
Skill operations, newest first	Thao tác kỹ năng, mới nhất trước
Saving failed.	Lưu thất bại.
Saving is taking longer than expected. Your change is kept and will be retried.	Lưu lâu hơn dự kiến. Thay đổi vẫn được giữ và sẽ thử lưu lại.
Receive documents	Nhận tài liệu
Files stay in the review queue until you choose to process them.	Tệp nằm trong hàng chờ kiểm tra đến khi bạn chọn xử lý.
Validate & fingerprint	Kiểm tra và tạo mã băm
Check file size and format, calculate SHA-256, and find exact duplicates in this workspace.	Kiểm tra dung lượng, định dạng, tính SHA-256 và tìm bản trùng khớp hoàn toàn trong không gian này.
Read document content	Đọc nội dung tài liệu
Extract text from PDF, DOCX, spreadsheets and text files locally. Scanned PDFs are retained as originals without an OCR index.	Trích văn bản từ PDF, DOCX, bảng tính và tệp văn bản ngay trên thiết bị. PDF quét được giữ bản gốc, chưa có chỉ mục OCR.
Organize & refine	Sắp xếp và chuẩn hóa
Keep your chosen subject, normalize whitespace and identify recurring keywords. Original content is never rewritten.	Giữ chủ đề bạn chọn, chuẩn hóa khoảng trắng và tìm từ khóa lặp lại. Không viết lại nội dung gốc.
Build searchable index	Tạo chỉ mục tìm kiếm
Split extracted text into overlapping passages and retain its source fingerprint. This is lexical indexing; no AI is invoked.	Chia văn bản thành các đoạn chồng lấn và giữ mã băm nguồn. Đây là lập chỉ mục từ vựng, không gọi AI.
Review & store	Kiểm tra và lưu
Review the extracted content, then approve saving the original and its index to your workspace.	Kiểm tra nội dung trích xuất rồi duyệt lưu bản gốc và chỉ mục vào không gian.
Something went wrong. Please retry.	Đã xảy ra lỗi. Vui lòng thử lại.
Finance	Tài chính
Banking	Ngân hàng
SQL & Data	SQL và dữ liệu
Full-text search is unavailable: {0}	Không tìm toàn văn được: {0}
Keep each batch under 100 MB. Process this batch before adding more.	Mỗi đợt tối đa 100 MB. Xử lý đợt này trước khi thêm tệp.
Add up to 25 files per batch. Process this batch before adding more.	Mỗi đợt tối đa 25 tệp. Xử lý đợt này trước khi thêm tệp.
{0} document{1} added to the review queue.	Đã thêm {0} tài liệu vào hàng chờ kiểm tra.
{0} original files received from your device.	Đã nhận {0} tệp gốc từ thiết bị.
An identical document is already stored or included in this batch.	Đã có tài liệu trùng khớp trong thư viện hoặc đợt này.
No new valid documents to process. Review the file errors below.	Không có tài liệu mới hợp lệ. Kiểm tra lỗi tệp bên dưới.
{0} valid files fingerprinted. Exact duplicates were excluded.	Đã tạo mã băm cho {0} tệp hợp lệ. Đã loại các bản trùng hoàn toàn.
{0} checked	Đã kiểm tra {0}
Text could not be extracted: {0} The original can still be stored after your review.	Không thể trích văn bản: {0} Bạn vẫn có thể lưu bản gốc sau khi kiểm tra.
{0} documents yielded text. Originals without readable text are clearly marked in your review.	Đã trích văn bản từ {0} tài liệu. Bản gốc không đọc được văn bản đã được đánh dấu trong phần kiểm tra.
{0} read	Đã đọc {0}
Whitespace normalized and frequent keywords counted. Your chosen knowledge area is retained; no content or financial claims are invented.	Đã chuẩn hóa khoảng trắng và đếm từ khóa phổ biến. Giữ nguyên lĩnh vực bạn chọn; không tạo thêm nội dung hoặc nhận định tài chính.
No readable text. Only the original will be stored.	Không có văn bản đọc được. Chỉ lưu bản gốc.
{0} overlapping source passages prepared. Search uses original text and frequent keywords.	Đã chuẩn bị {0} đoạn nguồn chồng lấn. Tìm kiếm dùng văn bản gốc và từ khóa phổ biến.
Review the actual extracted text and knowledge areas below. Nothing is saved to your library until you approve.	Kiểm tra văn bản trích xuất và lĩnh vực bên dưới. Chỉ lưu vào thư viện sau khi bạn duyệt.
Your review	Bạn kiểm tra
Processing stopped. No unapproved document was saved.	Đã dừng xử lý. Không lưu tài liệu chưa được duyệt.
Processing did not finish. Retry this document.	Xử lý chưa hoàn tất. Thử lại tài liệu này.
This document was already added to the library.	Tài liệu đã có trong thư viện.
{0} saved; {1} need attention. Review the file error, then retry.	Đã lưu {0}; {1} cần kiểm tra. Xem lỗi tệp rồi thử lại.
Some documents could not be stored. Review the file errors and retry.	Một số tài liệu chưa lưu được. Kiểm tra lỗi tệp rồi thử lại.
{0} originals and their indexes stored. Open a document to review its text and download its original.	Đã lưu {0} bản gốc cùng chỉ mục. Mở tài liệu để xem văn bản và tải bản gốc.
{0} saved	Đã lưu {0}
{0} document{1} stored in your knowledge library.	Đã lưu {0} tài liệu vào thư viện kiến thức.
Storage stopped. Committed originals are retained; retry to finish the batch and verify metadata.	Đã dừng lưu. Bản gốc đã ghi vẫn được giữ; thử lại để hoàn tất và xác minh thông tin.
Review discarded. Your files remain queued.	Đã bỏ phần kiểm tra. Tệp vẫn trong hàng chờ.
The workspace metadata has been saved and verified.	Đã lưu và xác minh thông tin không gian.
Download up to 100 MB at a time. Select fewer documents for this ZIP.	Mỗi lần tải tối đa 100 MB. Chọn ít tài liệu hơn cho tệp ZIP này.
{0} document{1} removed from this library.	Đã gỡ {0} tài liệu khỏi thư viện.
It’s too late to undo: these documents were already removed for good.	Không thể hoàn tác: tài liệu đã bị xóa vĩnh viễn.
{0} document{1} restored.	Đã khôi phục {0} tài liệu.
Document manifest exported. Original files are downloaded separately.	Đã xuất danh mục tài liệu. Bản gốc được tải riêng.
Storage workspace	Không gian tài liệu
Your knowledge library	Thư viện kiến thức của bạn
A little more knowledge. A clearer picture.	Thêm kiến thức. Hiểu rõ hơn.
Storage guide	Hướng dẫn tài liệu
Guide	Hướng dẫn
Upload documents	Tải tài liệu lên
Write a knowledge note	Viết ghi chú kiến thức
Export document manifest	Xuất danh mục tài liệu
Add documents	Thêm tài liệu
Library summary	Tổng quan thư viện
Original files in your library	Tệp gốc trong thư viện
Stored data	Dữ liệu đã lưu
Originals on your connected backend	Bản gốc trên backend đã kết nối
Originals saved on this device	Bản gốc lưu trên thiết bị này
Searchable	Tìm được
{0} original-only · {1} passages	{0} chỉ có bản gốc · {1} đoạn
Knowledge areas	Lĩnh vực kiến thức
Finance, Banking, SQL & Data	Tài chính, Ngân hàng, SQL và dữ liệu
Verifying document metadata save?	Đang xác minh thông tin tài liệu đã lưu?
Dismiss storage error	Đóng lỗi lưu tài liệu
removed document	tài liệu đã gỡ
could not be deleted from storage yet.	chưa thể xóa khỏi bộ nhớ.
It is	Tài liệu này
They are	Các tài liệu này
no longer in your library.	không còn trong thư viện.
Retry delete	Thử xóa lại
Filename and metadata search still work.	Vẫn tìm được theo tên tệp và thông tin tài liệu.
Retry search	Thử tìm lại
removed.	đã gỡ.
Document library	Thư viện tài liệu
Your sources, ready when you need them.	Nguồn tài liệu luôn sẵn khi bạn cần.
Search stored documents	Tìm tài liệu đã lưu
Search your knowledge…	Tìm trong thư viện…
Clear document search	Xóa tìm kiếm tài liệu
Filter documents by knowledge area	Lọc tài liệu theo lĩnh vực
Save needs attention	Cần kiểm tra việc lưu
Select all visible documents	Chọn mọi tài liệu đang hiện
Knowledge area	Lĩnh vực
{0} words · Indexed	{0} từ · Đã lập chỉ mục
Original only	Chỉ bản gốc
· Review note	· Ghi chú kiểm tra
Actions for {0}	Thao tác với {0}
No documents in this view	Không có tài liệu phù hợp
Make room for what you know	Dành chỗ cho kiến thức của bạn
Try a different subject or search term.	Thử lĩnh vực hoặc từ tìm kiếm khác.
Drop in your first source. We’ll help you keep it organized.	Thêm nguồn đầu tiên. Chúng tôi sẽ giúp bạn sắp xếp.
Add your first document	Thêm tài liệu đầu tiên
Add and process documents	Thêm và xử lý tài liệu
Grow your library	Mở rộng thư viện
01 — Import	01 — Nhập tài liệu
Bring the sources you want to build on.	Thêm những nguồn bạn muốn sử dụng.
Upload knowledge area	Lĩnh vực tài liệu tải lên
{0} waiting to process	{0} đang chờ xử lý
Add a file or write a note	Thêm tệp hoặc viết ghi chú
Process files	Xử lý tệp
Processing	Đang xử lý
Review ready	Sẵn sàng kiểm tra
Review the file errors before retrying.	Kiểm tra lỗi tệp trước khi thử lại.
Your review, before storage	Kiểm tra trước khi lưu
Check the content and subject. These are extracts from your files, not generated summaries.	Kiểm tra nội dung và lĩnh vực. Đây là trích xuất từ tệp của bạn, không phải bản tóm tắt được tạo ra.
Knowledge area for {0}	Lĩnh vực của {0}
words ·	từ ·
passages ·	đoạn ·
Approve & store	Duyệt và lưu
Storing	Đang lưu
Stored	Đã lưu
Storage needs attention.	Cần kiểm tra việc lưu trữ.
Originals and searchable text are stored on your connected backend.	Bản gốc và văn bản tìm kiếm được lưu trên backend đã kết nối.
Stored in this browser · No documents sent to an AI service	Lưu trong trình duyệt · Không gửi tài liệu đến dịch vụ AI
How Storage works	Cách thư viện hoạt động
Selected document actions	Thao tác với tài liệu đã chọn
Download ZIP	Tải ZIP
Retry text load	Thử tải văn bản lại
Source text	Văn bản nguồn
Copy text	Chép văn bản
{0} Full text is unavailable. Showing the saved excerpt.	{0} Không có toàn văn. Đang hiện đoạn trích đã lưu.
No text index is available. Download the original to review this document.	Chưa có chỉ mục văn bản. Tải bản gốc để xem tài liệu.
Copy fingerprint	Chép mã băm
Delete document	Xóa tài liệu
Remove this document?	Gỡ tài liệu này?
Removing	Đang gỡ
Removed	Đã gỡ
Download original	Tải bản gốc
Preparing	Đang chuẩn bị
Download ready	Sẵn sàng tải
What is this note about?	Ghi chú này nói về điều gì?
Write or paste the knowledge you want to keep…	Viết hoặc dán kiến thức bạn muốn lưu…
Added to your queue as a Markdown document in	Được thêm vào hàng chờ dưới dạng tài liệu Markdown trong
Add to review queue	Thêm vào hàng chờ
Remove documents	Gỡ tài liệu
searchable index from this workspace?	chỉ mục tìm kiếm khỏi không gian này?
Downloaded copies remain available separately. Workspace originals and indexes are deleted for good after a short window in which you can undo.	Bản đã tải xuống vẫn còn riêng. Bản gốc và chỉ mục trong không gian sẽ bị xóa vĩnh viễn sau một khoảng ngắn cho phép hoàn tác.
Remove {0} document{1}	Gỡ {0} tài liệu
Confirm removal?	Xác nhận gỡ?
A home for everything you know	Nơi lưu mọi điều bạn biết
Keep your finance, banking, SQL and data documents together. Your knowledge library starts with the files you already have.	Tập trung tài liệu tài chính, ngân hàng, SQL và dữ liệu. Thư viện bắt đầu từ những tệp bạn đã có.
An open folder ready to receive documents	Thư mục mở sẵn sàng nhận tài liệu
Bring your documents, keep the context	Thêm tài liệu, giữ ngữ cảnh
Drop in files, choose a knowledge area, and follow each processing step. Originals stay available to download whenever you need them.	Thêm tệp, chọn lĩnh vực và theo dõi từng bước xử lý. Bản gốc luôn có thể tải xuống khi cần.
Documents stacking inside an open folder	Tài liệu xếp trong thư mục mở
See your knowledge take shape	Nhìn kiến thức thành hình
Your storage map grows with every document. Explore each area, search your library, and review what was stored before moving on.	Bản đồ mở rộng theo từng tài liệu. Khám phá lĩnh vực, tìm trong thư viện và kiểm tra nội dung đã lưu.
A completed badge with a check mark	Huy hiệu hoàn tất có dấu kiểm
Skip	Bỏ qua
of 3	trên 3
Storage introduction steps	Các bước giới thiệu thư viện
Step {0}: {1}	Bước {0}: {1}
Previous step	Bước trước
No files yet	Chưa có tệp
Processing {0} of {1} · {2}	Đang xử lý {0}/{1} · {2}
{0} queued · {1}	{0} trong hàng chờ · {1}
{0} of {1} ready{2}	{0}/{1} sẵn sàng{2}
· {0} need attention	· {0} cần kiểm tra
Choose storage documents	Chọn tài liệu lưu trữ
Release to add {0} {1}	Thả để thêm {0} {1}
Drop files here or	Thả tệp vào đây hoặc
Tap to	Chạm để
choose files	chọn tệp
PDF, DOCX, TXT, MD, CSV, TSV, SQL, JSON, XLSX · up to 20 MB each	PDF, DOCX, TXT, MD, CSV, TSV, SQL, JSON, XLSX · tối đa 20 MB/tệp
Document processing	Xử lý tài liệu
Could not process this document	Không thể xử lý tài liệu
{0}% processed	Đã xử lý {0}%
Processing {0}	Đang xử lý {0}
Processing failed	Xử lý thất bại
Retry {0}	Thử lại {0}
documents ready.	tài liệu sẵn sàng.
{0} documents need attention. {1}	{0} tài liệu cần kiểm tra. {1}
Complete	Hoàn tất
Review extracted content before storing your originals.	Kiểm tra nội dung trích xuất trước khi lưu bản gốc.
Documents stored. Ready to explore.	Đã lưu tài liệu. Sẵn sàng khám phá.
Processing stopped. You can retry this batch.	Đã dừng xử lý. Bạn có thể thử lại đợt này.
Add documents to start a processing run.	Thêm tài liệu để bắt đầu xử lý.
{0} of {1} steps complete	Đã xong {0}/{1} bước
Process {0} document{1}	Xử lý {0} tài liệu
Stop document processing	Dừng xử lý tài liệu
Stop processing	Dừng xử lý
Local document engine	Bộ xử lý tài liệu cục bộ
Document processing progress	Tiến độ xử lý tài liệu
Knowledge distribution	Phân bố kiến thức
Knowledge map	Bản đồ kiến thức
Every document, in its place.	Mỗi tài liệu, đúng vị trí.
Treemap size	Kích thước bản đồ ô
Treemap shading	Màu bản đồ ô
Indexed	Có chỉ mục
Recent	Gần đây
Knowledge map breadcrumb	Đường dẫn bản đồ kiến thức
All knowledge	Mọi lĩnh vực
Arrow keys move between regions. Enter opens a region or document. Escape goes back. Size represents	Phím mũi tên chuyển vùng. Enter mở vùng hoặc tài liệu. Escape quay lại. Kích thước biểu thị
document count	số tài liệu
original file bytes	dung lượng tệp gốc
the proportion of searchable documents	tỷ lệ tài liệu tìm được
uploads in the last 30 days	số lượt tải lên trong 30 ngày qua
, open region	, mở vùng
, open document	, mở tài liệu
% of this view	% chế độ xem này
Uploaded within 30 days	Tải lên trong 30 ngày
0 files	0 tệp
Your knowledge starts here	Kiến thức bắt đầu từ đây
Upload a document to bring your map to life.	Tải tài liệu lên để hình thành bản đồ.
Back one level	Lên một cấp
Last 30 days	30 ngày qua
Select a region to explore · Esc to go back	Chọn vùng để khám phá · Esc quay lại
The map shows real uploads. No sample documents.	Bản đồ hiển thị tệp đã tải lên thật. Không có tài liệu mẫu.
Uploaded documents by subject	Tài liệu tải lên theo lĩnh vực
Yes	Có
No	Không
Use a file name between 1 and 240 characters.	Tên tệp phải dài từ 1 đến 240 ký tự.
This file is empty. Choose a document with content.	Tệp trống. Chọn tài liệu có nội dung.
This file exceeds the 20 MB limit.	Tệp vượt giới hạn 20 MB.
Choose PDF, DOCX, TXT, MD, CSV, TSV, SQL, JSON or XLSX.	Chọn PDF, DOCX, TXT, MD, CSV, TSV, SQL, JSON hoặc XLSX.
More upload actions	Thao tác tải lên khác
Upload actions	Thao tác tải lên
{0}: Copied	{0}: Đã chép
{0}: Copy failed	{0}: Chép thất bại
Copy failed	Chép thất bại
Copy failed. Check clipboard permission and try again.	Sao chép thất bại. Kiểm tra quyền bộ nhớ tạm rồi thử lại.
Edit document details	Sửa thông tin tài liệu
Document knowledge area	Lĩnh vực tài liệu
The file stays {0}; only its name and area change here.	Tệp vẫn là {0}; chỉ đổi tên và lĩnh vực tại đây.
Only the name and area change here.	Chỉ đổi tên và lĩnh vực tại đây.
Couldn’t save. Please retry.	Không thể lưu. Vui lòng thử lại.
Give the document a name.	Đặt tên cho tài liệu.
A name can’t contain / or \.	Tên không được chứa dấu gạch chéo.
A name can’t contain line breaks or control characters.	Tên không được chứa xuống dòng hoặc ký tự điều khiển.
The name is {0} characters; the limit is 240.	Tên có {0} ký tự; giới hạn là 240.
Choose one of the knowledge areas.	Chọn một lĩnh vực kiến thức.
This document is no longer in the library.	Tài liệu không còn trong thư viện.
An identical copy of {0} was added meanwhile, so it can’t be restored.	Một bản trùng khớp của {0} vừa được thêm, nên không thể khôi phục.
This document contains invalid XML.	Tài liệu chứa XML không hợp lệ.
Expanded document content is too large to index on this device.	Nội dung sau giải nén quá lớn để lập chỉ mục trên thiết bị này.
This is not a readable DOCX document.	Không thể đọc tệp này dưới dạng DOCX.
No readable worksheets found in this XLSX file.	Không có trang tính đọc được trong tệp XLSX.
Text index limited to the first 1,000,000 characters. The complete original is preserved.	Chỉ lập chỉ mục 1.000.000 ký tự đầu. Bản gốc được giữ đầy đủ.
Text index limited to 300 PDF pages. The complete original is preserved.	Chỉ lập chỉ mục 300 trang PDF đầu. Bản gốc được giữ đầy đủ.
No selectable text found. The original is stored; scanned PDFs need OCR before they can be indexed.	Không có văn bản chọn được. Bản gốc vẫn được lưu; PDF quét cần OCR trước khi lập chỉ mục.
This file contains binary data. Choose a valid text document.	Tệp chứa dữ liệu nhị phân. Chọn tài liệu văn bản hợp lệ.
Document storage is unavailable on this device.	Thiết bị không hỗ trợ lưu tài liệu.
Close older Storage tabs and try again.	Đóng các tab Tài liệu cũ rồi thử lại.
Could not save this document. Check available device storage and retry.	Không thể lưu tài liệu. Kiểm tra dung lượng thiết bị rồi thử lại.
This backend needs the Storage document API. See the Storage API contract to connect it.	Backend cần API tài liệu Storage. Xem hợp đồng API Storage để kết nối.
The backend document receipt does not match this file.	Biên nhận tài liệu từ backend không khớp tệp.
The original is unavailable on this device. Restore your browser data or upload the document again.	Không có bản gốc trên thiết bị này. Khôi phục dữ liệu trình duyệt hoặc tải lại tài liệu lên.
The downloaded original has an unexpected file size.	Dung lượng bản gốc tải về không khớp dự kiến.
The downloaded original failed its fingerprint check.	Mã băm bản gốc tải về không khớp.
The document metadata save is still pending. Originals are kept on this device; retry the save before leaving.	Thông tin tài liệu vẫn chờ lưu. Bản gốc còn trên thiết bị; thử lưu lại trước khi rời trang.
The original and index are safe on this device, but the library metadata could not be verified. Retry save before leaving this page.	Bản gốc và chỉ mục đã an toàn trên thiết bị, nhưng chưa xác minh được thông tin thư viện. Thử lưu lại trước khi rời trang.
Repo workspace	Không gian hoạt động
Perspective	Phối cảnh
Top view	Nhìn từ trên
Your activity	Hoạt động của bạn
Sample week	Tuần mẫu
The shape of your week	Một tuần của bạn
, in workspace time.	, theo giờ không gian.
Camera	Góc nhìn
{0} terrain	Địa hình {0}
Share of	Tỷ trọng
Nothing recorded this week yet	Tuần này chưa có hoạt động
Import, save or deliver a skill and its hour shows up here.	Nhập, lưu hoặc chuyển kỹ năng để giờ hoạt động hiện tại đây.
Preview a sample week	Xem thử tuần mẫu
Drag to orbit, pinch to zoom, click a bar to fly in.	Kéo để xoay, chụm để thu phóng, nhấp cột để đến gần.
Swipe sideways to orbit, tap a bar to fly in.	Vuốt ngang để xoay, chạm cột để đến gần.
Arrow keys move between hours and days, Enter focuses a bar, Shift with arrow keys orbits, plus and minus zoom, Escape clears.	Phím mũi tên chuyển giờ/ngày; Enter chọn cột; Shift + mũi tên xoay; cộng/trừ thu phóng; Escape bỏ chọn.
Week summary	Tổng quan tuần
in view	đang xem
this week	tuần này
no earlier week to compare	chưa có tuần trước để so sánh
vs last week	so với tuần trước
Peak hours	Giờ cao điểm
No busy hours yet	Chưa có giờ cao điểm
{0} {1}, {2} {3}. Fly to this hour	{0} {1}, {2} {3}. Đến giờ này
Busiest day	Ngày bận nhất
in working hours	trong giờ làm việc
No {0} yet	Chưa có {0}
Split the week by	Chia tuần theo
Left out of the terrain:	Đã ẩn khỏi địa hình:
Where the week went	Tuần qua dành cho đâu
{0} by {1}, {2}. Switch a part off to leave it out of the terrain.	{0} theo {1}, {2}. Tắt một phần để ẩn khỏi địa hình.
time of day	buổi trong ngày
In view	Đang xem
per hour,	mỗi giờ,
, workspace time	, giờ không gian
(sample week)	(tuần mẫu)
Showing a sample week, not your operations.	Đang hiện tuần mẫu, không phải hoạt động của bạn.
A sample week, so there is something to explore. Your own operations replace it as soon as you import, save or deliver a skill.	Tuần mẫu để bạn khám phá. Hoạt động thật thay thế ngay khi bạn nhập, lưu hoặc chuyển kỹ năng.
Nothing to show	Chưa có dữ liệu
{0} is the only share shown, so it stays on.	{0} là phần duy nhất đang hiện nên không thể tắt.
{0}: {1}. Use the arrow keys to read each share.	{0}: {1}. Dùng phím mũi tên để đọc từng phần.
split bar	thanh tỷ trọng
{0} segments	{0} phần
{0}, hidden	{0}, đã ẩn
{0} to {1}	{0} đến {1}
{0} to {1}, {2}	{0} đến {1}, {2}
, {0} on last week	, {0} so với tuần trước
Focused on	Đang tập trung vào
Time of day	Buổi trong ngày
Action	Thao tác
Night 00–06	Đêm 00–06
Night	Đêm
Morning 06–12	Sáng 06–12
Morning	Sáng
Afternoon 12–18	Chiều 12–18
Afternoon	Chiều
Evening 18–24	Tối 18–24
Evening	Tối
Transfer	Chuyển giao
Canvas 2D is not available.	Không hỗ trợ Canvas 2D.
Returned to the whole week.	Đã trở về toàn tuần.
`);
