import { catalog } from './catalog';

export const orchestrator = catalog(`
Planned	Đã lên kế hoạch
Starting	Đang khởi chạy
Copy input	Chép đầu vào
Copy output	Chép đầu ra
Needs approval	Cần phê duyệt
Allow	Cho phép
6 results	6 kết quả
4 results	4 kết quả
5 results	5 kết quả
7 results	7 kết quả
Retry now	Thử lại ngay
Waiting to retry	Chờ thử lại
Thinking	Suy nghĩ
Summary	Tóm tắt
Play	Phát
Restart	Phát lại từ đầu
Show the calls of	Xem công cụ theo nhánh
Compare our pricing page with four competitors and suggest changes	So sánh trang giá với bốn đối thủ và đề xuất thay đổi
Concurrency	Chạy đồng thời
Concurrency limit	Số nhánh chạy đồng thời
Lead agent	Tác tử chính
Waiting for the plan	Chờ kế hoạch
Queued, {0}	Xếp hàng, {0}
next in line	lượt kế tiếp
2nd in line	vị trí thứ 2
3rd in line	vị trí thứ 3
4th in line	vị trí thứ 4
Failed, retrying in	Lỗi, thử lại sau
Returned without writing	Trả về, không ghi
Returned after {0} tool calls	Trả về sau {0} lượt gọi
Failed, retrying	Lỗi, đang thử lại
Returned	Đã trả về
{0}, {1}. {2}. {3} transcript	{0}, {1}. {2}. {3} nhật ký
Nothing has run yet.	Chưa chạy tác vụ nào.
{0} working	{0} đang xử lý
Dispatching	Đang giao việc
Writing summary	Đang viết tóm tắt
Merging results	Đang gộp kết quả
Merged {0} results	Đã gộp {0} kết quả
Merging {0} results	Đang gộp {0} kết quả
{0} of {1} returned	Đã trả về {0}/{1}
Waits for {0} results	Chờ {0} kết quả
Summary text	Nội dung tóm tắt
The lead merges what the subagents return here.	Tác tử chính tổng hợp kết quả của các tác tử phụ tại đây.
Wall time	Thời gian thực
{0}x faster than running in sequence	Nhanh gấp {0} lần chạy tuần tự
Copy summary	Chép tóm tắt
Tokens {0}, cost {1}, wall time {2}, {3} in sequence.	Token {0}, chi phí {1}, thời gian thực {2}, chạy tuần tự {3}.
Write findings for {0}	Ghi kết quả về {0}
Saves them to {0}	Lưu vào {0}
Notewise seat pricing	Giá mỗi chỗ Notewise
Paperlane free tier	Gói miễn phí Paperlane
Quillstack discounts	Ưu đãi Quillstack
Driftboard add-ons	Tiện ích Driftboard
Compare Notewise seat pricing and limits with our Team plan	So sánh giá mỗi chỗ và giới hạn của Notewise với gói Team của chúng ta
Check what the Paperlane free tier includes and caps	Kiểm tra quyền lợi và giới hạn gói miễn phí Paperlane
Find the Quillstack annual discount and trial terms	Tìm ưu đãi trả theo năm và điều kiện dùng thử của Quillstack
Map the Driftboard business tier and its paid add-ons	Khảo sát gói Business và tiện ích trả phí của Driftboard
The pricing page and a September changelog post are the top results	Trang giá và bài cập nhật tháng Chín đứng đầu kết quả
Team is $10 per seat on yearly billing and includes unlimited guests	Gói Team giá $10 mỗi chỗ khi trả theo năm, không giới hạn khách
Our Team plan is $12 per seat and caps guests at 5 per workspace	Gói Team của chúng ta giá $12 mỗi chỗ, tối đa 5 khách mỗi không gian
Notewise undercuts our Team plan by $2 per seat and adds unlimited guests	Gói Team của Notewise rẻ hơn $2 mỗi chỗ và không giới hạn khách
Notewise undercuts our Team plan by $2 per seat and adds unlimited guests.	Gói Team của Notewise rẻ hơn $2 mỗi chỗ và không giới hạn khách.
The free plan allows 5 members, 2 GB of storage and 30 days of history	Gói miễn phí cho phép 5 thành viên, 2 GB lưu trữ và 30 ngày lịch sử
A help article confirms the free plan has no guest seats	Bài trợ giúp xác nhận gói miễn phí không có chỗ cho khách
Our free plan stops at 3 members and 1 GB of storage	Gói miễn phí của chúng ta chỉ có 3 thành viên và 1 GB lưu trữ
Paperlane fits 5 members on its free plan where ours stops at 3	Gói miễn phí Paperlane có 5 thành viên, còn chúng ta chỉ có 3
Paperlane fits 5 members on its free plan where ours stops at 3.	Gói miễn phí Paperlane có 5 thành viên, còn chúng ta chỉ có 3.
The pricing page and a billing FAQ both cover yearly plans	Trang giá và mục hỏi đáp thanh toán đều nói về gói trả theo năm
Annual billing saves 20 percent and the trial runs for 14 days	Trả theo năm tiết kiệm 20 phần trăm, dùng thử trong 14 ngày
The page returned 503 Service Unavailable	Trang trả về lỗi 503 Service Unavailable
Quillstack leads with a 20 percent yearly saving, and we never show ours	Quillstack nêu bật mức tiết kiệm 20 phần trăm theo năm, còn chúng ta chưa hiển thị ưu đãi
Quillstack leads with a 20 percent yearly saving, and we never show ours.	Quillstack nêu bật mức tiết kiệm 20 phần trăm theo năm, còn chúng ta chưa hiển thị ưu đãi.
Found the pricing page and an add-ons comparison table	Đã tìm thấy trang giá và bảng so sánh tiện ích
Business is $18 per seat, and SSO is a $4 add-on per seat	Gói Business giá $18 mỗi chỗ, SSO thêm $4 mỗi chỗ
We include SSO only on Enterprise, which has no public price	Chúng ta chỉ có SSO ở gói Enterprise, chưa công khai giá
Driftboard sells SSO as a $4 add-on, while ours needs a sales call	Driftboard bán thêm SSO giá $4, còn chúng ta yêu cầu liên hệ bán hàng
Driftboard sells SSO as a $4 add-on, while ours needs a sales call.	Driftboard bán thêm SSO giá $4, còn chúng ta yêu cầu liên hệ bán hàng.
We charge more than	Giá của chúng ta cao hơn
Notewise and Quillstack	Notewise và Quillstack
for a smaller package, and	nhưng quyền lợi ít hơn, và
our free plan is	gói miễn phí của chúng ta
the tightest of the five.	hạn chế nhất trong năm bên.
Three changes would close the	Ba thay đổi sau sẽ thu hẹp
gap:	khoảng cách:
Cut Team to $10 per seat on yearly billing to match Notewise.	Giảm gói Team còn $10 mỗi chỗ khi trả theo năm để ngang giá Notewise.
Raise the free plan from 3 to 5 members, as Paperlane does.	Tăng gói miễn phí từ 3 lên 5 thành viên như Paperlane.
Show the yearly saving on the page and sell SSO as a paid add-on.	Hiển thị mức tiết kiệm theo năm và bán SSO dưới dạng tiện ích trả phí.
Fetch page	Đọc trang
Read file	Đọc tệp
Write findings	Ghi kết quả
Searched	Đã tìm
Fetched	Đã đọc trang
Read	Đã đọc
Wrote findings	Đã ghi kết quả
Searching {0}	Đang tìm {0}
Searched {0}	Đã tìm {0}
Fetching {0}	Đang đọc {0}
Fetched {0}	Đã đọc {0}
Reading {0}	Đang đọc {0}
Read {0}	Đã đọc {0}
Writing findings	Đang ghi kết quả
Wants to write its findings	Muốn ghi lại kết quả
Write findings denied	Đã từ chối ghi kết quả
A person said no, so nothing was saved	Người dùng từ chối nên không lưu gì
Returned to the lead	Đã trả về tác tử chính
Retried	Đã thử lại
Attempt 2	Lần thử thứ 2
{0} failed: {1}	{0} thất bại: {1}
Retried: {0}	Đã thử lại: {0}
Could not fetch {0}	Không đọc được {0}
Read 3,140 words	Đã đọc 3,140 từ
Read 2,260 words	Đã đọc 2,260 từ
Read 1,980 words	Đã đọc 1,980 từ
Read 2,710 words	Đã đọc 2,710 từ
Read 212 lines	Đã đọc 212 dòng
page read	đã đọc trang
({0} from {1})	({0} từ {1})
{0} pricing	Giá {0}
{0} plans and limits compared	So sánh gói và giới hạn của {0}
{0} changelog	Nhật ký thay đổi {0}
{0} billing FAQ	Hỏi đáp thanh toán {0}
{0} vs the alternatives	{0} và các lựa chọn khác
{0} help centre	Trung tâm trợ giúp {0}
{0} status and uptime	Trạng thái và thời gian hoạt động {0}
pricing	giá
plans	gói
news	tin tức
billing	thanh toán
compare	so sánh
help	trợ giúp
status	trạng thái
Post a summary to #pricing-review	Đăng tóm tắt vào #pricing-review
Posting to #pricing-review	Đang đăng vào #pricing-review
Posted to #pricing-review	Đã đăng vào #pricing-review
Sends as Arc agent to 12 people in #pricing-review	Gửi với tên Arc agent đến 12 người trong #pricing-review
1 message	1 tin nhắn
Used {0} tools	Đã dùng {0} công cụ
Used {0} tool	Đã dùng {0} công cụ
Using {0} tools	Đang dùng {0} công cụ
Using {0} tool	Đang dùng {0} công cụ
{0} result	{0} kết quả
{0} results	{0} kết quả
{0} row	{0} hàng
{0} rows	{0} hàng
{0} field	{0} trường
{0} fields	{0} trường
Denied, it never ran	Đã từ chối, chưa chạy
{0}. {1} input and output	{0}. {1} dữ liệu vào và ra
Done, {0}	Hoàn tất, {0}
Retry: {0}	Thử lại: {0}
Deny: {0}	Từ chối: {0}
Allow: {0}	Cho phép: {0}
Show {0} more rows	Xem thêm {0} hàng
Show {0} more lines	Xem thêm {0} dòng
Waiting for the result…	Đang chờ kết quả…
Split the goal into {0} subtasks	Chia mục tiêu thành {0} việc
Waiting on {0} subagents	Đang chờ {0} tác tử phụ
Splitting the goal into subtasks	Đang chia mục tiêu thành các việc
Merged what came back and wrote the summary	Đã tổng hợp kết quả và viết tóm tắt
Retry of the call that failed	Thử lại lần gọi công cụ bị lỗi
Web fetch	Đọc web
Handoff	Bàn giao
the call did not finish	lần gọi công cụ chưa hoàn tất
Failed: {0}	Thất bại: {0}
Finished: {0} agents, {1}.	Hoàn tất: {0} tác tử, {1}.
Replaying.	Đang phát lại.
Paused.	Đã tạm dừng.
Finished:	Hoàn tất:
{0} agent working	{0} tác tử đang xử lý
{0} agents working	{0} tác tử đang xử lý
{0} agents	{0} tác tử
{0}x faster than sequential	Nhanh gấp {0} lần chạy tuần tự
Playback speed	Tốc độ phát lại
Planning. This is a simulated run; nothing is sent.	Đang lập kế hoạch. Đây là lượt chạy mô phỏng; không gửi dữ liệu.
Plan ready. Dispatching {0} subtasks.	Kế hoạch đã sẵn sàng. Đang giao {0} việc.
{0} is waiting for approval to write.	{0} đang chờ cho phép ghi kết quả.
{0} hit an error: {1}. Retrying.	{0} gặp lỗi: {1}. Đang thử lại.
{0} is retrying	{0} đang thử lại
{0} returned. {1} of {2} done.	{0} đã trả về. Hoàn tất {1}/{2}.
Every subagent returned. Writing the summary.	Mọi tác tử phụ đã trả về. Đang viết tóm tắt.
Done. {0} tokens, {1}, {2}.	Hoàn tất. {0} token, {1}, {2}.
Stopped.	Đã dừng.
Findings not saved: the write was denied.	Chưa lưu kết quả: yêu cầu ghi đã bị từ chối.
, failed	, thất bại
{0}, {1}: {2}, {3} to {4}{5}	{0}, {1}: {2}, từ {3} đến {4}{5}
, {0} tokens	, {0} token
`);
