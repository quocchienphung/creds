import { catalog } from './catalog';
export const previews = catalog(`
Moved “{0}” to position {1} of {2}	Đã chuyển “{0}” đến vị trí {1}/{2}
Removed “{0}”	Đã gỡ “{0}”
Added “{0}” as step {1}	Đã thêm “{0}” ở bước {1}
Renamed step {0} to “{1}”	Đã đổi tên bước {0} thành “{1}”
Plan done in {0}	Kế hoạch xong trong {0}
Step {0} failed: {1}. {2}	Bước {0} thất bại: {1}. {2}
Step {0} done: {1}	Bước {0} hoàn tất: {1}
Plan ·	Kế hoạch ·
Estimated time	Thời gian dự kiến
Press Enter to rename, Alt plus arrow keys to move, Delete to remove.	Enter đổi tên, Alt + mũi tên di chuyển, Delete xóa.
Plan: {0}	Kế hoạch: {0}
Drag to reorder	Kéo để sắp xếp
Rename step {0}	Đổi tên bước {0}
, In progress	, đang thực hiện
, Done	, hoàn tất
, Failed	, thất bại
, Pending	, đang chờ
Remove step {0}: {1}	Xóa bước {0}: {1}
Add step	Thêm bước
Add a step at the end	Thêm bước ở cuối
Drag to reorder · double-click to rename	Kéo để sắp xếp · nhấp đúp để đổi tên
Run plan	Chạy kế hoạch
Running · {0} of {1}	Đang chạy · {0}/{1}
Running ·	Đang chạy ·
Stopped · step {0} failed	Đã dừng · bước {0} thất bại
Stopped · step	Đã dừng · bước
Done in {0}	Xong trong {0}
Done in	Xong trong
Run again	Chạy lại
~{0} min	~{0} phút
Unpaid	Chưa thanh toán
Invoice from draft to paid	Hóa đơn từ nháp đến thanh toán
Draft the invoice	Soạn hóa đơn
Client, line items and due date	Khách hàng, dòng hàng và hạn thanh toán
Review totals and tax	Kiểm tra tổng tiền và thuế
Subtotal, tax and amount due	Tạm tính, thuế và tiền phải trả
Send it to the client	Gửi cho khách hàng
Deliver the invoice and mark it unpaid	Gửi hóa đơn và đánh dấu chưa thanh toán
Delivery failed: the client's mailbox did not accept it	Gửi thất bại: hộp thư khách hàng từ chối nhận
Wait for payment	Chờ thanh toán
Track the due date until the money arrives	Theo dõi hạn thanh toán đến khi nhận tiền
Record the payment	Ghi nhận thanh toán
Mark the invoice paid and close it	Đánh dấu đã thanh toán và đóng hóa đơn
The step failed	Bước đã thất bại
Write release notes	Viết ghi chú phát hành
Fix checkout test	Sửa kiểm thử thanh toán
Summarize churn calls	Tổng hợp cuộc gọi về khách rời bỏ
Update pricing page	Cập nhật trang giá
Review roadmap	Đánh giá lộ trình
Refactor auth	Cải tiến mã xác thực
Upgrade SDK	Nâng cấp SDK
Delegate	Giao việc
Agents	Agent
{0} handed to {1}	Đã giao {0} cho {1}
{0} is unassigned	{0} chưa được phân công
{0} put back	Đã trả lại {0}
{0} picked up. Choose with the arrow keys, Enter to hand over, Escape to put back.	Đã chọn {0}. Phím mũi tên chọn người, Enter giao việc, Escape trả lại.
↑ ↓ to choose, Enter to hand over	↑ ↓ để chọn, Enter để giao
Drag a task onto {0} {1}	Kéo tác vụ lên {0} {1}
Unassigned tasks	Tác vụ chưa phân công
All handed over	Đã giao tất cả
in queues	trong hàng chờ
Free	Đang rảnh
+{0}m until {1}	+{0} phút đến {1}
Busy until {0}	Bận đến {0}
{0} queue	Hàng chờ {0}
{0} more tasks in {1}'s queue	Thêm {0} tác vụ trong hàng chờ của {1}
Drag onto	Kéo lên
, or press Enter, choose with the arrow keys and press Enter again. Number keys hand it over at once.	, hoặc nhấn Enter, chọn bằng mũi tên rồi nhấn Enter lần nữa. Phím số giao việc ngay.
{0} min	{0} phút
{0} h {1} min	{0} giờ {1} phút
Competitor pricing	Giá đối thủ
Checked 6 competitors	Đã xem 6 đối thủ
Collected plans and prices	Đã thu thập gói và giá
Handed the table to the Writer	Đã chuyển bảng cho người viết
Customer interviews	Phỏng vấn khách hàng
Read 14 interview notes	Đã đọc 14 ghi chú phỏng vấn
Grouping quotes by theme	Đang nhóm trích dẫn theo chủ đề
Draft pricing page	Soạn trang giá
Outlined the page	Đã lập dàn ý trang
Wrote plan copy and FAQ	Đã viết mô tả gói và câu hỏi thường gặp
PR #482 billing	PR #482 thanh toán
Read 12 changed files	Đã đọc 12 tệp thay đổi
214 tests passed	214 kiểm thử đã qua
Left 3 comments	Đã để lại 3 bình luận
Sync CRM	Đồng bộ CRM
Loaded 18,240 contacts	Đã tải 18.240 liên hệ
Stopped at the API rate limit	Đã dừng do giới hạn tần suất API
Rotate API keys	Thay khóa API
Rotate the production Stripe and OpenAI keys? Jobs reconnect in ~30 s.	Thay khóa Stripe và OpenAI trên môi trường thật? Tác vụ kết nối lại sau khoảng 30 giây.
Review pricing copy	Đánh giá nội dung trang giá
need you	cần bạn
Last	Gần nhất
Idle	Đang rảnh
{0}'s tasks	Tác vụ của {0}
Decide: {0}	Quyết định: {0}
task needs	tác vụ cần
tasks need	tác vụ cần
{0} running	{0} đang chạy
Local	Cục bộ
Triage inbox	Phân loại hộp thư
Read 38 new tickets	Đã đọc 38 yêu cầu mới
Tagged 9 as urgent	Đã gắn nhãn khẩn cho 9 yêu cầu
Left 3 notes for the Writer	Đã để lại 3 ghi chú cho người viết
Draft replies	Soạn trả lời
Answering the 9 urgent tickets	Đang trả lời 9 yêu cầu khẩn
Index docs	Lập chỉ mục tài liệu
Split 212 pages into chunks	Đã chia 212 trang thành đoạn
Embedded them on this machine	Đã tạo dữ liệu nhúng trên máy này
Local eval	Đánh giá cục bộ
Running 40 prompts on the local model	Đang chạy 40 câu lệnh với mô hình cục bộ
Compacting…	Đang rút gọn…
{0} · {1}% of the window	{0} · {1}% cửa sổ
Saved {0} tokens	Tiết kiệm {0} token
{0} left	Còn {0}
Room to keep going	Còn chỗ để tiếp tục
Context window	Cửa sổ ngữ cảnh
of 200K tokens	trên 200K token
of 200.0K tokens used,	trên 200,0K token đã dùng,
Conversation is compacted	Cuộc hội thoại đã rút gọn
Compact Conversation	Rút gọn hội thoại
Compacting	Đang rút gọn
Compacted	Đã rút gọn
No files attached	Chưa đính kèm tệp
System prompt	Chỉ dẫn hệ thống
Conversation	Hội thoại
Memory	Bộ nhớ
`);
