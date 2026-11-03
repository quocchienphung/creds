import { catalog } from './catalog';
export const process = catalog(`
Needs input	Cần thông tin
Approval recorded for this simulated run	Đã ghi nhận phê duyệt cho lượt mô phỏng
Step denied – run stopped	Đã từ chối bước – lượt chạy đã dừng
Run link copied	Đã chép liên kết lượt chạy
Run snapshot downloaded	Đã tải ảnh chụp dữ liệu lượt chạy
Done in {0}s	Xong trong {0} giây
Run stopped	Đã dừng lượt chạy
Stop run	Dừng chạy
Run options	Tùy chọn lượt chạy
Copy run link	Chép liên kết lượt chạy
View in Chat	Xem trong Chat
Finish editing	Sửa xong
Edit plan	Sửa kế hoạch
Hide side panel	Ẩn bảng bên
Show side panel	Hiện bảng bên
Run details and approvals	Chi tiết và phê duyệt lượt chạy
Needs your input	Cần thông tin từ bạn
Close side panel	Đóng bảng bên
Nothing needs you yet	Chưa có yêu cầu cho bạn
The agent asks here before it sends or books anything.	Agent sẽ hỏi tại đây trước khi gửi hoặc đặt lịch.
Agent	Agent
Board prep	Chuẩn bị họp hội đồng
Triggered by	Khởi chạy bởi
Share run	Chia sẻ lượt chạy
The link opens this workflow. Its progress and draft are stored in this browser. Download a snapshot to share the current results.	Liên kết mở quy trình này. Tiến độ và bản nháp lưu trong trình duyệt. Tải bản dữ liệu để chia sẻ kết quả hiện tại.
Run link	Liên kết lượt chạy
Download snapshot	Tải bản dữ liệu
Run conversation	Hội thoại lượt chạy
Local simulation transcript · no external tools or messages are sent.	Bản ghi mô phỏng cục bộ · không gọi công cụ ngoài hoặc gửi tin nhắn.
Board prep ·	Chuẩn bị họp ·
Waiting for your approval	Đang chờ bạn duyệt
Download transcript	Tải bản ghi
In progress	Đang thực hiện
Waiting for approval	Chờ phê duyệt
Stopped{0}	Đã dừng{0}
· step {0} failed	· bước {0} thất bại
Move {0}	Di chuyển {0}
Drag to reorder · Alt + arrow keys	Kéo để sắp xếp · Alt + mũi tên
Step name	Tên bước
You denied this step	Bạn đã từ chối bước này
Stopped by you	Bạn đã dừng
Edit the plan, then restart the run	Sửa kế hoạch rồi chạy lại
Editing plan	Đang sửa kế hoạch
Plan completed	Kế hoạch hoàn tất
Running plan	Đang chạy kế hoạch
Clipboard unavailable	Không dùng được bộ nhớ tạm
{0} copied	Đã chép {0}
Clipboard unavailable. Select the payload text to copy it.	Không dùng được bộ nhớ tạm. Chọn văn bản dữ liệu để chép.
Copy {0}	Chép {0}
Show less	Thu gọn
Arguments	Tham số
Waiting for result…	Đang chờ kết quả…
Using tools…	Đang dùng công cụ…
Used {0} tool{1}	Đã dùng {0} công cụ
Working on your plan	Đang xử lý kế hoạch
You approved this step	Bạn đã duyệt bước này
Denied	Đã từ chối
· just now	· vừa xong
Previous suggestion	Gợi ý trước
Next suggestion	Gợi ý sau
All changes reviewed	Đã xem mọi thay đổi
Review suggestion	Xem gợi ý
Accept suggestion	Chấp nhận gợi ý
Reject suggestion	Từ chối gợi ý
All changes reviewed.	Đã xem mọi thay đổi.
All draft changes reviewed	Đã xem mọi thay đổi bản nháp
Draft reset. 9 suggestions left.	Đã đặt lại bản nháp. Còn 9 gợi ý.
{0} suggestions	{0} gợi ý
{0} suggestions left.	Còn {0} gợi ý.
Undone. {0} suggestions left.	Đã hoàn tác. Còn {0} gợi ý.
Suggestion {0} of 9: {1}. Press Y to accept, N to reject	Gợi ý {0}/9: {1}. Nhấn Y để nhận, N để từ chối
replace “{0}” with “{1}”	thay “{0}” bằng “{1}”
remove “{0}”	xóa “{0}”
add “{0}”	thêm “{0}”
Zoom out	Thu nhỏ
Zoom in	Phóng to
Untitled task	Tác vụ chưa có tên
Delete task	Xóa tác vụ
Optional	Tùy chọn
The saved processes are invalid. Your stored copy has been kept.	Quy trình đã lưu không hợp lệ. Bản lưu của bạn vẫn được giữ.
Browser storage is unavailable or full. Export your process before leaving this page.	Bộ nhớ trình duyệt không dùng được hoặc đã đầy. Xuất quy trình trước khi rời trang.
The saved runs are invalid.	Lượt chạy đã lưu không hợp lệ.
New block	Khối mới
Describe what this task should get done	Mô tả việc tác vụ cần hoàn thành
Untitled process	Quy trình chưa có tên
Coordinator	Điều phối
Planner	Lập kế hoạch
Creator	Sáng tạo
Writer	Viết nội dung
Coder	Lập trình
Researcher	Nghiên cứu
Reviewer	Đánh giá
Fixer	Sửa lỗi
Tester	Kiểm thử
Approver	Người duyệt
Deployer	Triển khai
Scraper	Thu thập dữ liệu
Analyst	Phân tích
Drafter	Soạn nháp
Reverter	Hoàn nguyên
Revoker	Thu hồi quyền
Instructor	Hướng dẫn
Helper	Hỗ trợ
Processor	Xử lý
Person	Người thực hiện
No role	Chưa có vai trò
A block you define yourself.	Khối do bạn tự định nghĩa.
Describe the goal of this process	Mô tả mục tiêu quy trình
{0} (copy)	{0} (bản sao)
That block is not on the map.	Khối không có trên bản đồ.
A block cannot connect to itself.	Khối không thể nối với chính nó.
{0} is already connected to {1}.	{0} đã nối với {1}.
{0} is already a sub-block of {1}.	{0} đã là khối con của {1}.
A map can have up to {0} connections.	Bản đồ có tối đa {0} kết nối.
{0} already loops back somewhere. A block loops back to one place.	{0} đã có vòng lặp. Mỗi khối chỉ lặp về một vị trí.
{0} is already part of {1}.	{0} đã thuộc {1}.
{0} already has to wait for {1}, so this would make them wait for each other.	{0} đang chờ {1}; kết nối này sẽ làm hai khối chờ lẫn nhau.
Dollars	Đô la
Credits	Tín dụng
Tokens	Token
No cost	Không tính phí
Pricing page launch	Ra mắt trang giá
Several AI blocks, one approval, one task that fails once	Nhiều khối AI, một lượt duyệt, một tác vụ lỗi một lần
Local model reply	Trả lời bằng mô hình cục bộ
Hermes Agent and Ollama on this machine, a person approves	Hermes Agent và Ollama trên máy này, có người duyệt
Closed loop: ship to production	Vòng kín: đưa lên môi trường thật
Planner, Creator, Coder, QA, Reviewer, Fixer and Deployer go round and round; a person approves each deploy	Lập kế hoạch, Sáng tạo, Lập trình, QA, Đánh giá, Sửa lỗi và Triển khai lặp lại; người dùng duyệt mỗi lần triển khai
Run “{0}”? {1}	Chạy “{0}”? {1}
Rejected by you	Bạn đã từ chối
Simulated failure: the task could not finish.	Lỗi mô phỏng: tác vụ chưa hoàn tất.
Cost limit reached ({0}).	Đã đạt giới hạn chi phí ({0}).
Could not load the run.	Không thể tải lượt chạy.
Loading the trace…	Đang tải dấu vết…
Where the time and money of a run go, as it happens. Start and decide on the Process page; this page watches.	Theo dõi thời gian và chi phí của lượt chạy. Khởi chạy và quyết định ở trang Quy trình; trang này chỉ theo dõi.
Nothing is sent to a model; the calls inside a block are demo values.	Không gửi dữ liệu đến mô hình; lượt gọi trong khối là dữ liệu mẫu.
A server runs the tasks and reports them.	Máy chủ chạy tác vụ và báo cáo kết quả.
Simulated	Mô phỏng
Connected (server)	Đã nối máy chủ
Open in Process	Mở trong Quy trình
No run yet	Chưa có lượt chạy
No run of “	Chưa có lượt chạy “
” yet	”
Open the Process page and press	Mở trang Quy trình rồi nhấn
Open the Process page	Mở trang Quy trình
A block is waiting for you.	Một khối đang chờ bạn.
The run holds until you decide on the Process page.	Lượt chạy tạm dừng đến khi bạn quyết định ở trang Quy trình.
Decide	Quyết định
Simulated run: block times, costs and statuses come from the plan; the calls inside a block are derived from its model and tools.	Lượt mô phỏng: thời gian, chi phí và trạng thái khối lấy từ kế hoạch; lượt gọi trong khối được suy ra từ mô hình và công cụ.
Spans are what the connected engine reported.	Các nhịp xử lý do bộ máy đã kết nối báo cáo.
Fold finished	Gộp phần đã xong
Trace	Dấu vết
Performance	Hiệu suất
Parallelism	Mức song song
How many blocks worked at once, on average	Số khối chạy cùng lúc trung bình
Waiting on people	Chờ người duyệt
{0} approval{1}	{0} lượt phê duyệt
Rounds	Số vòng
The first block ran again (a loop)	Khối đầu đã chạy lại (vòng lặp)
No loop ran the plan again	Chưa có vòng lặp chạy lại kế hoạch
Cost per minute	Chi phí mỗi phút
This process counts no costs	Quy trình không tính chi phí
At the pace of this run	Theo nhịp lượt chạy này
Where the time went	Thời gian dành cho đâu
Time a block spent itself (its calls and waits), not counting the blocks under it. Click a row to open it.	Thời gian riêng của khối (gọi và chờ), không tính khối con. Nhấp dòng để mở.
Open {0}: {1}, {2} percent	Mở {0}: {1}, {2} phần trăm
Critical path	Đường găng
The chain of blocks that decided when the run ended. Speed these up to make the run shorter.	Chuỗi khối quyết định thời điểm hoàn tất. Tăng tốc chuỗi này để rút ngắn lượt chạy.
By AI engine	Theo bộ máy AI
Which engines did the work, and what it cost.	Bộ máy đã thực hiện và chi phí tương ứng.
A person	Người thực hiện
The run is live	Lượt chạy đang hoạt động
The run is {0}	Trạng thái lượt chạy: {0}
spans, longest	nhịp xử lý, dài nhất
LLM calls	Lượt gọi LLM
{0} hidden	Đã ẩn {0}
{0} details	Chi tiết {0}
Close details	Đóng chi tiết
Agent run	Lượt chạy agent
Block	Khối
Model call	Lượt gọi mô hình
Tool call	Lượt gọi công cụ
Waiting for a person	Chờ người thực hiện
That task is not in this process any more.	Tác vụ không còn trong quy trình.
This run belongs to another engine.	Lượt chạy thuộc bộ máy khác.
That is not possible at this moment: the run has moved on.	Không thể thực hiện lúc này: lượt chạy đã chuyển bước.
The engine answered {0}.	Bộ máy trả về {0}.
The engine took too long to answer.	Bộ máy phản hồi quá thời hạn.
Could not reach the engine.	Không thể kết nối bộ máy.
The engine sent something that is not JSON.	Bộ máy gửi dữ liệu không phải JSON.
The engine's answer is not a valid run. The previous state is kept.	Phản hồi của bộ máy không phải lượt chạy hợp lệ. Giữ trạng thái trước.
The engine list is not a list.	Danh sách bộ máy có định dạng không hợp lệ.
Split the goal	Chia nhỏ mục tiêu
Write the report	Viết báo cáo
Plan the steps	Lập các bước
Write the plan	Viết kế hoạch
Draft it	Soạn bản nháp
Finish the draft	Hoàn tất bản nháp
Read the step	Đọc bước
Write the change	Viết thay đổi
Read the result	Đọc kết quả
Write the verdict	Viết kết luận
Write the review	Viết đánh giá
Write the fix	Viết bản sửa
Write the rollback	Viết bản hoàn nguyên
Write what was revoked	Ghi quyền đã thu hồi
Write the explanation	Viết giải thích
Write the answer	Viết câu trả lời
Read the input	Đọc đầu vào
Write the output	Viết đầu ra
Run the task	Chạy tác vụ
Write the result	Viết kết quả
A person does this	Người thực hiện việc này
a person	người thực hiện
needs you	cần bạn
{0} (try {1})	{0} (lần thử {1})
tool call	lượt gọi công cụ
· round {0}	· vòng {0}
· stopped	· đã dừng
Other	Khác
Pick a Claude model	Chọn mô hình Claude
Anthropic's coding agent	Agent lập trình của Anthropic
Optional: a Claude model	Tùy chọn: mô hình Claude
Pick a ChatGPT model	Chọn mô hình ChatGPT
OpenAI's coding agent	Agent lập trình của OpenAI
Optional: a GPT model	Tùy chọn: mô hình GPT
Pick a Gemini model	Chọn mô hình Gemini
Optional: the Kimi model to use	Tùy chọn: mô hình Kimi sử dụng
Optional: the model it uses	Tùy chọn: mô hình sử dụng
Type a model installed in Ollama	Nhập mô hình đã cài trong Ollama
Open models, Alibaba	Mô hình mở của Alibaba
Optional: the Qwen model to use	Tùy chọn: mô hình Qwen sử dụng
Optional: the DeepSeek model to use	Tùy chọn: mô hình DeepSeek sử dụng
Optional: the Mistral model to use	Tùy chọn: mô hình Mistral sử dụng
Optional: the {0} model or setup to use	Tùy chọn: mô hình hoặc cấu hình {0} sử dụng
Decides or writes it themselves	Tự quyết định hoặc viết nội dung
Custom engine	Bộ máy tùy chỉnh
Your own chat bot or agent	Chatbot hoặc agent của bạn
The engine's id	ID bộ máy
Installed here	Đã cài tại đây
Describe the task.	Mô tả tác vụ.
Choose a model for {0}.	Chọn mô hình cho {0}.
Give the custom engine an id.	Đặt ID cho bộ máy tùy chỉnh.
A person's task waits for them: turn on approval so they are asked.	Tác vụ của người thực hiện phải chờ họ: bật phê duyệt để họ nhận yêu cầu.
Could not load your processes.	Không thể tải quy trình của bạn.
Loading processes…	Đang tải quy trình…
Lost contact	Mất kết nối
Lost contact with the engine. Trying again…	Mất kết nối với bộ máy. Đang thử lại…
The run could not start.	Không thể bắt đầu lượt chạy.
That did not work.	Thao tác chưa thành công.
A process holds up to {0} blocks, {1} levels deep.	Quy trình có tối đa {0} khối, sâu {1} cấp.
Stop the run to change the structure.	Dừng lượt chạy để đổi cấu trúc.
The first block cannot be deleted.	Không thể xóa khối đầu tiên.
{0} now loops back to {1}.	{0} hiện lặp về {1}.
{0} now waits for {1}.	{0} hiện chờ {1}.
A process holds up to {0} tasks.	Quy trình có tối đa {0} tác vụ.
{0} shortcuts	Phím tắt của {0}
Close shortcuts for {0}	Đóng phím tắt của {0}
Approval removed	Đã bỏ yêu cầu duyệt
Approval required	Cần phê duyệt
The run could not start. See the process message for details.	Không thể chạy. Xem thông báo quy trình để biết chi tiết.
The block could not be retried. See the process message for details.	Không thể thử lại khối. Xem thông báo quy trình để biết chi tiết.
That shortcut could not complete.	Không thể hoàn tất thao tác phím tắt.
You can keep up to {0} processes.	Bạn có thể lưu tối đa {0} quy trình.
Duplicated	Đã nhân bản
Exported	Đã xuất
That file is too large to be a process.	Tệp quá lớn để nhập thành quy trình.
That file is not a process this page can read.	Trang này không đọc được tệp dưới dạng quy trình.
Imported “{0}” with {1} tasks.	Đã nhập “{0}” với {1} tác vụ.
Imported	Đã nhập
That file could not be imported.	Không thể nhập tệp.
Not saved	Chưa lưu
Unsaved	Chưa lưu
Starting...	Đang bắt đầu...
Asks you before it runs	Hỏi bạn trước khi chạy
Approval	Phê duyệt
When it has finished, the blocks from {0} down to here run again	Khi hoàn tất, các khối từ {0} đến đây chạy lại
back to	lặp về
Starts only after these blocks have finished	Chỉ bắt đầu khi các khối này hoàn tất
waits for	chờ
Add a sub-task to {0}	Thêm tác vụ con cho {0}
Add a sub-task	Thêm tác vụ con
Process name	Tên quy trình
Simulated engine. Connect an engine	Bộ máy mô phỏng. Kết nối bộ máy thật
Connected engine	Bộ máy đã kết nối
Nothing is sent to a model. Click to connect an engine.	Không gửi dữ liệu đến mô hình. Nhấp để kết nối bộ máy.
A server runs the tasks.	Máy chủ chạy tác vụ.
New process	Tạo quy trình
More process actions	Thao tác quy trình khác
Saved processes ({0})	Quy trình đã lưu ({0})
Duplicate this process	Nhân bản quy trình
Export as JSON	Xuất JSON
Import from a file…	Nhập từ tệp…
Delete this process	Xóa quy trình này
Delete?	Xóa?
Blocks	Khối
Run notifications	Thông báo lượt chạy
Selected blocks	Khối đã chọn
blocks selected	khối đã chọn
This process was changed somewhere else, so your latest edit was not saved. Reload to see the stored copy.	Quy trình đã đổi ở nơi khác nên chưa lưu sửa đổi mới nhất. Tải lại để xem bản đã lưu.
{0} Your edits are kept on this page.	{0} Chỉnh sửa vẫn được giữ trên trang này.
The run could not be saved on this browser, so it will not survive a reload.	Không lưu được lượt chạy trong trình duyệt nên tiến độ sẽ mất khi tải lại.
This is the first block. Select it and use the + around it to connect more blocks, or choose a role under “Add block”.	Đây là khối đầu tiên. Chọn khối rồi dùng dấu + xung quanh để nối thêm, hoặc chọn vai trò trong “Thêm khối”.
Block settings	Cài đặt khối
Close block settings	Đóng cài đặt khối
Map tools	Công cụ bản đồ
Add block	Thêm khối
Add a block connected to {0}	Thêm khối nối với {0}
Connect a new block to	Nối khối mới với
Undo (Ctrl+Z)	Hoàn tác (Ctrl+Z)
Redo (Ctrl+Shift+Z)	Làm lại (Ctrl+Shift+Z)
View	Chế độ xem
Tidy up the map	Sắp xếp bản đồ
Tidy up: let the map place every block again	Sắp xếp: tự đặt lại vị trí mọi khối
Process settings	Cài đặt quy trình
Block settings panel	Bảng cài đặt khối
Task settings	Cài đặt tác vụ
Delete “{0}”{1}? You can undo this.	Xóa “{0}”{1}? Bạn có thể hoàn tác.
and its {0} sub-task{1}	và {0} tác vụ con
Delete this task?	Xóa tác vụ này?
Delete blocks	Xóa khối
and {0} more	và {0} khối khác
Delete {0} block{1} ({2}){3}? {4}You can undo this.	Xóa {0} khối ({2}){3}? {4}Bạn có thể hoàn tác.
and what hangs under {0}, {1} blocks in all	và các khối thuộc {0}, tổng cộng {1} khối
The first block stays.	Giữ khối đầu tiên.
Delete these blocks?	Xóa các khối này?
block selected:	khối đã chọn:
Actions	Thao tác
Action failed	Thao tác thất bại
{0} unavailable	Không dùng được {0}
Release to cancel	Thả để hủy
Stop the current run before changing its blocks.	Dừng lượt chạy hiện tại trước khi đổi khối.
Review request	Xem yêu cầu
Read this block’s actual request before approving or rejecting it.	Đọc yêu cầu thực tế của khối trước khi duyệt hoặc từ chối.
Retry block	Thử lại khối
Retry the failed attempt using its saved run settings.	Thử lại lần lỗi bằng cài đặt lượt chạy đã lưu.
Open run trace	Mở dấu vết lượt chạy
Inspect the current process run in Tracing.	Kiểm tra lượt chạy hiện tại trong Theo dõi.
Run from here	Chạy từ đây
A run is already starting.	Một lượt chạy đang bắt đầu.
Run this block{0}.	Chạy khối này{0}.
and its {0} connected sub-blocks	và {0} khối con đã nối
Open the existing block settings panel.	Mở bảng cài đặt khối hiện có.
Add sub-block	Thêm khối con
The process block or depth limit has been reached.	Đã đạt giới hạn số khối hoặc độ sâu quy trình.
Connect a new block below this one, then configure its task.	Nối khối mới bên dưới rồi cấu hình tác vụ.
Duplicate branch	Nhân bản nhánh
The first block cannot be duplicated here. Duplicate the process from the library instead.	Không thể nhân bản khối đầu tại đây. Hãy nhân bản cả quy trình trong thư viện.
The copy would exceed the process block limit.	Bản sao sẽ vượt giới hạn số khối.
Copy this block and its descendants with fresh IDs; keep the original unchanged.	Sao chép khối và các khối con với ID mới; giữ nguyên bản gốc.
Remove approval	Bỏ yêu cầu duyệt
Require approval	Yêu cầu phê duyệt
A person’s block must keep its approval rule.	Khối do người thực hiện phải giữ quy tắc phê duyệt.
Change whether a person reviews this block before it runs.	Đổi yêu cầu người dùng duyệt khối trước khi chạy.
Delete block	Xóa khối
Review a confirmation before deleting this block and its descendants.	Xem xác nhận trước khi xóa khối và các khối con.
Needs you	Cần bạn
This {0} is waiting for your decision.	{0} đang chờ bạn quyết định.
This {0} failed.	{0} đã thất bại.
Pass {0} of {1} of a loop	Lượt {0}/{1} của vòng lặp
Round	Vòng
{0} failed	{0} thất bại
The block could not finish.	Khối chưa thể hoàn tất.
{0} finished	{0} hoàn tất
Show on the map	Hiện trên bản đồ
{0} blocks finished	{0} khối hoàn tất
{0} and {1} more	{0} và {1} mục khác
Show the first	Hiện khối đầu
Run finished	Lượt chạy hoàn tất
Run failed	Lượt chạy thất bại
{0} is done	{0} đã xong
{0} did not finish	{0} chưa hoàn tất
{0} was stopped	{0} đã dừng
{0} block{1}	{0} khối
Open the trace	Mở dấu vết
Untitled block	Khối chưa có tên
loops back	lặp về
waits for this block	chờ khối này
not possible	không thể thực hiện
Settings for {0}	Cài đặt cho {0}
First block	Khối đầu tiên
Connected to {0}	Nối với {0}
the first block	khối đầu tiên
This run	Lượt chạy này
About the	Về vai trò
Use it	Khi dùng
Give it	Cung cấp
It passes on	Chuyển tiếp
Watch out	Cần chú ý
Sub-blocks to add	Khối con có thể thêm
Add a sub-block	Thêm khối con
Usually next	Thường tiếp theo
What this task should get done, in your words.	Mô tả bằng lời của bạn việc tác vụ cần hoàn thành.
AI block	Khối AI
Who does it	Người thực hiện
Engine id	ID bộ máy
Use “{0}”	Dùng “{0}”
Type the name of a model installed in Ollama	Nhập tên mô hình đã cài trong Ollama
Type a model name	Nhập tên mô hình
Told to this AI block before it starts. Leave empty to use only the task.	Chỉ dẫn cho khối AI trước khi bắt đầu. Để trống nếu chỉ dùng mô tả tác vụ.
Tools it may use	Công cụ được phép dùng
Ask me before it runs	Hỏi tôi trước khi chạy
The task waits until you approve it.	Tác vụ chờ bạn phê duyệt.
Question	Câu hỏi
Run “{0}”?	Chạy “{0}”?
Its sub-tasks run	Cách chạy tác vụ con
All at once	Đồng thời
One after another	Lần lượt
Stop at ({0})	Dừng tại ({0})
The task fails when its own cost reaches this. Empty means no limit.	Tác vụ thất bại khi chi phí riêng đạt mức này. Để trống để không giới hạn.
No limit	Không giới hạn
Simulation	Mô phỏng
Only used by the simulated engine, to try the screens without a model. A connected engine ignores these.	Chỉ dùng để thử giao diện bằng bộ máy mô phỏng, không cần mô hình. Bộ máy kết nối bỏ qua các giá trị này.
Takes (seconds)	Thời lượng (giây)
Automatic	Tự động
Fail once	Lỗi một lần
Fails part-way so you can try Retry.	Lỗi giữa chừng để bạn thử chức năng Thử lại.
Blocks hang under the block that hands them work. Connect this block to any other: back to an earlier block it makes a loop, to any other it makes that block wait for this one.	Khối nằm dưới khối giao việc cho nó. Nối về khối trước để tạo vòng lặp; nối tới khối khác để khối đó chờ khối này.
Loops back to	Lặp về
loops back here	lặp về đây
Waits for	Chờ
Rounds of the loop to {0}	Số vòng lặp đến {0}
Fewer rounds	Giảm số vòng
More rounds	Tăng số vòng
Remove the connection {0} to {1}	Gỡ kết nối {0} đến {1}
Connect this block to	Nối khối này với
Choose a block	Chọn khối
No other block	Không có khối khác
Stop the run to change connections.	Dừng lượt chạy để đổi kết nối.
Organize	Sắp xếp
Move under	Chuyển xuống dưới
Move up	Đưa lên
Move down	Đưa xuống
Deleting, moving or copying this task takes its	Xóa, di chuyển hoặc sao chép tác vụ sẽ áp dụng cả
along.	đi kèm.
Run {0}	Chạy {0}
Tool labels	Nhãn công cụ
No tools assigned	Chưa gán công cụ
This block’s cost limit	Giới hạn chi phí của khối
{0} connected sub-task{1} can follow. Each keeps its own approval rule.	{0} tác vụ con đã nối có thể chạy tiếp. Mỗi tác vụ giữ quy tắc phê duyệt riêng.
Run “{0}”? You decide before this block starts.	Chạy “{0}”? Bạn quyết định trước khi khối bắt đầu.
Preview permission request	Xem thử yêu cầu quyền
Interactive preview	Bản xem thử tương tác
The decision was not confirmed. Review the current request and try again.	Chưa xác nhận được quyết định. Kiểm tra yêu cầu hiện tại rồi thử lại.
Could not send your decision. Try again.	Không gửi được quyết định. Hãy thử lại.
permission request	yêu cầu quyền
Your decision	Quyết định của bạn
Permission request	Yêu cầu quyền
Dismiss decision	Đóng quyết định
Minimize permission requests	Thu gọn yêu cầu quyền
Allowed for this run. Future runs will ask again.	Đã cho phép lượt chạy này. Lượt sau sẽ hỏi lại.
This block and its sub-tasks will not run.	Khối và tác vụ con sẽ không chạy.
Next request	Yêu cầu tiếp
Pending permission requests	Yêu cầu quyền đang chờ
Previous request	Yêu cầu trước
No permission requests waiting.	Không có yêu cầu quyền đang chờ.
Allowed just once	Chỉ cho phép một lần
wants to	muốn
run this block	chạy khối này
Ask first	Hỏi trước
What will happen	Việc sẽ thực hiện
Just once	Một lần
Ask again next run	Hỏi lại lượt sau
Preview only. These buttons won’t start a run.	Chỉ xem thử. Các nút không bắt đầu lượt chạy.
Simulation only. No model or external tool is called.	Chỉ mô phỏng. Không gọi mô hình hoặc công cụ ngoài.
Allows this block in this run. Other blocks keep their own rules.	Cho phép khối trong lượt này. Khối khác giữ quy tắc riêng.
Allow once	Cho phép một lần
Connect an engine	Kết nối bộ máy
This page is running a simulation.	Trang đang chạy mô phỏng.
Tasks move through their statuses on a timer and the costs are demo values; no model is called and nothing leaves your browser. Connect an engine to run the tasks for real.	Tác vụ đổi trạng thái theo bộ đếm và chi phí là số mẫu; không gọi mô hình hoặc gửi dữ liệu khỏi trình duyệt. Kết nối bộ máy để chạy thật.
A server runs your tasks.	Máy chủ chạy tác vụ của bạn.
The page sends the plan and your decisions and shows what the server reports.	Trang gửi kế hoạch, quyết định của bạn và hiển thị báo cáo từ máy chủ.
It lists {0} AI block{1} you can choose.	Có {0} khối AI để chọn.
It does not list its AI blocks, so model names are typed.	Bộ máy không cung cấp danh sách khối AI; hãy nhập tên mô hình.
How to connect	Cách kết nối
Point the workspace at your API and turn on	Trỏ không gian đến API của bạn và bật
before the workspace loads:	trước khi tải không gian:
Your server implements these routes under	Máy chủ cần cung cấp các route này bên dưới
the AI blocks it can run (for example the models installed in a local Ollama)	các khối AI có thể chạy (ví dụ mô hình trong Ollama cục bộ)
start a run from the plan	bắt đầu lượt chạy từ kế hoạch
the run's newest state (polled while it is active)	trạng thái mới nhất của lượt chạy (thăm dò khi còn hoạt động)
approve, reject, retry, dismiss or stop	phê duyệt, từ chối, thử lại, đóng hoặc dừng
Your server can forward each task to a local model server, a chat bot or an agent framework. The page never talks to a model itself. The full contract, with the JSON shapes, is in	Máy chủ có thể chuyển tác vụ đến mô hình cục bộ, chatbot hoặc framework agent. Trang không tự gọi mô hình. Hợp đồng đầy đủ, gồm cấu trúc JSON, nằm trong
under “Process (engine)”.	ở mục “Process (engine)”.
Goal	Mục tiêu
What should this process get done?	Quy trình cần hoàn thành việc gì?
Show costs in	Đơn vị chi phí
No costs	Không tính chi phí
Simulated: tasks move through their statuses on a timer. Nothing is sent to a model.	Mô phỏng: tác vụ đổi trạng thái theo bộ đếm. Không gửi dữ liệu đến mô hình.
Connected: a server runs the tasks.	Đã kết nối: máy chủ chạy tác vụ.
About the engine	Về bộ máy
Lets the map place every block again. Blocks you moved by hand go back to their automatic place.	Tự đặt lại vị trí mọi khối. Khối bạn di chuyển thủ công sẽ về vị trí tự động.
Backup	Sao lưu
Import a process	Nhập quy trình
Saved to your workspace's server.	Đã lưu vào máy chủ không gian.
Saved processes	Quy trình đã lưu
{0} in this browser	{0} trong trình duyệt này
Close saved processes	Đóng quy trình đã lưu
Start from a blank page or from an example. You can change everything afterwards.	Bắt đầu từ trang trống hoặc ví dụ. Bạn có thể sửa mọi thứ sau đó.
Close new process	Đóng tạo quy trình
Blank	Trống
One main task. Add the sub-tasks and AI blocks yourself.	Một tác vụ chính. Tự thêm tác vụ con và khối AI.
to the right of	bên phải
to the left of	bên trái
Process map. Drag a block to move it, right-click a block for its shortcuts, drag the background to pan, press plus or minus to zoom, zero to fit.	Bản đồ quy trình. Kéo để di chuyển khối, nhấp phải để mở thao tác, kéo nền để dịch bản đồ, cộng/trừ để thu phóng, 0 để vừa khung.
Earlier tries of {0}	Lần thử trước của {0}
Try	Lần thử
Earlier rounds of {0}	Vòng trước của {0}
Add a block {0} {1}. Drag onto another block to connect it.	Thêm khối {0} {1}. Kéo lên khối khác để nối.
Click to add a block. Drag onto another block to connect it, or onto empty space for a new one.	Nhấp để thêm khối. Kéo lên khối khác để nối, hoặc ra vùng trống để tạo khối mới.
Loop from {0} back to {1}, up to {2} rounds. Edit	Lặp từ {0} về {1}, tối đa {2} vòng. Sửa
{0} waits for {1}. Edit	{0} chờ {1}. Sửa
Loop back to {0}	Lặp về {0}
{0} will wait for {1}	{0} sẽ chờ {1}
Drop to add a new block here	Thả để thêm khối mới tại đây
Map view	Chế độ bản đồ
Fit the whole map	Vừa toàn bản đồ
Connection from {0} to {1}	Kết nối từ {0} đến {1}
Close connection	Đóng kết nối
When	Khi
has finished, the blocks from	hoàn tất, các khối từ
down to	đến
run again. It stops after the round limit, or when a block fails or is stopped.	chạy lại. Dừng khi đạt giới hạn vòng, có khối lỗi hoặc bị dừng.
starts only after	chỉ bắt đầu sau khi
has finished, as well as after the block it hangs under.	hoàn tất, đồng thời khối giao việc cũng đã hoàn tất.
Go around at most	Số vòng tối đa
Label	Nhãn
For example: until it ships	Ví dụ: đến khi phát hành
Remove connection	Gỡ kết nối
{0} notification{1} about {2}: {3}	{0} thông báo về {2}: {3}
Notifications for {0}	Thông báo cho {0}
Working	Đang xử lý
· Round	· Vòng
Configured tools	Công cụ đã cấu hình
Cost limit	Giới hạn chi phí
Sub-tasks	Tác vụ con
In parallel	Song song
In sequence	Tuần tự
Attempt	Lần thử
The engine has not supplied input or output for this call.	Bộ máy chưa cung cấp đầu vào hoặc đầu ra cho lượt gọi này.
Simulated block activity. No model or tool is called.	Hoạt động khối mô phỏng. Không gọi mô hình hoặc công cụ.
The engine has not reported individual calls for this block.	Bộ máy chưa báo cáo từng lượt gọi của khối.
Approve {0} before it starts.	Duyệt {0} trước khi bắt đầu.
Nothing starts until you approve.	Chỉ bắt đầu khi bạn phê duyệt.
Show block on map	Hiện khối trên bản đồ
Full permission details	Chi tiết quyền đầy đủ
Hide process activity	Ẩn hoạt động quy trình
Show process activity{0}	Hiện hoạt động quy trình{0}
Process activity	Hoạt động quy trình
{0} activity	Hoạt động {0}
Elapsed time, including approval waits	Thời gian đã qua, gồm chờ phê duyệt
{0} of {1} blocks complete	Đã xong {0}/{1} khối
{0} blocks ready	{0} khối sẵn sàng
Current block connections	Kết nối khối hiện tại
Show {0} on map	Hiện {0} trên bản đồ
steps ·	bước ·
Steps	Các bước
Follow every block, its connections and the calls reported by your engine.	Theo dõi từng khối, kết nối và lượt gọi do bộ máy báo cáo.
Starting…	Đang bắt đầu…
Start run	Bắt đầu chạy
Completed {0} blocks in {1}.	Hoàn tất {0} khối trong {1}.
The run needs attention. Open the steps to inspect failures and retry a block.	Lượt chạy cần kiểm tra. Mở các bước để xem lỗi và thử lại khối.
Run stopped. {0} of {1} blocks completed.	Đã dừng chạy. Hoàn tất {0}/{1} khối.
View trace	Xem dấu vết
Simulation · no model or external tool is called.	Mô phỏng · không gọi mô hình hoặc công cụ ngoài.
Activity reported by your connected engine.	Hoạt động do bộ máy đã kết nối báo cáo.
{0} blocks completed.	{0} khối hoàn tất.
Could not save.	Không thể lưu.
`);
