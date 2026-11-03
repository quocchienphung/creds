import { catalog } from './catalog';
export const assistant = catalog(`
Message	Tin nhắn
Send	Gửi
Listening…	Đang nghe…
Stop dictation	Dừng nhập giọng nói
Dictate	Nhập giọng nói
Writing…	Đang viết…
Couldn’t write that – try again.	Chưa viết được – hãy thử lại.
Couldn’t write that. Try again.	Chưa viết được. Hãy thử lại.
Your writing companion.	Bạn đồng hành viết lách.
What should we write?	Mình viết gì hôm nay?
Ask anything…	Hỏi bất cứ điều gì…
Polish my email	Trau chuốt email
Make it shorter	Viết ngắn hơn
Fix the tone	Chỉnh giọng văn
Draft a reply	Soạn trả lời
Microphone unavailable	Không dùng được micrô
Deepest reasoning	Suy luận chuyên sâu
Hardest problems	Bài toán khó nhất
Everyday work	Công việc hằng ngày
Quick and light	Nhanh và nhẹ
Flagship reasoning	Suy luận cao cấp
Balanced all-rounder	Cân bằng, đa dụng
Fast and cheap	Nhanh, tiết kiệm
Long documents	Tài liệu dài
Picks per message	Tự chọn theo tin nhắn
to the first token	đến token đầu tiên
per million tokens	mỗi triệu token
, quality	, chất lượng
, cost	, chi phí
Look things up while answering	Tra cứu khi trả lời
Write and edit side by side	Viết và sửa song song
Image generation	Tạo ảnh
Create images from a prompt	Tạo ảnh từ mô tả
Company knowledge	Kiến thức công ty
Create document	Tạo tài liệu
Create presentation	Tạo bài trình bày
Create table	Tạo bảng
Generate image	Tạo ảnh
Deep research	Nghiên cứu chuyên sâu
Visualize data	Trực quan dữ liệu
Connect the workspace backend to upload this file.	Kết nối backend để tải tệp này lên.
{0} exceeds the 10 MB file limit.	{0} vượt giới hạn 10 MB mỗi tệp.
Attach up to 5 files per message.	Mỗi tin nhắn đính kèm tối đa 5 tệp.
Connect the workspace backend to manage apps.	Kết nối backend để quản lý ứng dụng.
Allow popups, then try connecting this app again.	Cho phép cửa sổ bật lên rồi thử kết nối ứng dụng lại.
Dictation is unavailable in this browser. You can type your message.	Trình duyệt không hỗ trợ nhập giọng nói. Bạn có thể gõ tin nhắn.
Microphone permission is required for dictation.	Cần quyền micrô để nhập giọng nói.
Dictation stopped. You can try again or type your message.	Đã dừng nhập giọng nói. Bạn có thể thử lại hoặc gõ tin nhắn.
Could not start dictation. Please try again.	Không thể bắt đầu nhập giọng nói. Hãy thử lại.
Retry upload {0}	Thử tải {0} lên lại
Help me brainstorm ideas for...	Giúp tôi lên ý tưởng cho...
Add file	Thêm tệp
Attach files	Đính kèm tệp
Stop response	Dừng trả lời
Work in a folder	Làm việc trong thư mục
No folders yet.	Chưa có thư mục.
A folder with this name already exists.	Đã có thư mục trùng tên.
New folder name	Tên thư mục mới
New conversation	Cuộc chat mới
Recent chats	Chat gần đây
Assistant	Trợ lý
Copy {0} message	Chép tin nhắn {0}
Message copied	Đã chép tin nhắn
Copy is unavailable. Select the message text to copy it.	Không sao chép được. Chọn nội dung tin nhắn để chép.
Assistant is thinking	Trợ lý đang suy nghĩ
Good afternoon! What's next on your list?	Chào bạn! Tiếp theo mình làm gì nào?
Retry message	Gửi lại tin nhắn
Loading conversation…	Đang tải cuộc chat…
No conversations yet.	Chưa có cuộc chat.
Untitled chat	Chat chưa có tên
Delete conversation	Xóa cuộc chat
Delete this conversation and its messages?	Xóa cuộc chat cùng các tin nhắn?
Connect the tools your team already uses and work with them right in the chat.	Kết nối công cụ nhóm đang dùng để làm việc ngay trong chat.
Loading apps…	Đang tải ứng dụng…
No apps are available for this workspace.	Không gian này chưa có ứng dụng.
Not connected	Chưa kết nối
Opening…	Đang mở…
Connect	Kết nối
Refresh connection status	Làm mới trạng thái kết nối
Answers from what it already knows	Trả lời từ kiến thức sẵn có
Looks things up on the web when it helps	Tra cứu web khi cần
Model: {0}{1}	Mô hình: {0}{1}
, extended thinking	, suy luận mở rộng
Model settings	Cài đặt mô hình
Extended thinking	Suy luận mở rộng
first token	token đầu tiên
The assistant server returned invalid data.	Máy chủ trợ lý trả dữ liệu không hợp lệ.
Enter a message or attach a file before sending.	Nhập tin nhắn hoặc đính kèm tệp trước khi gửi.
The assistant server answered {0}.	Máy chủ trợ lý trả về {0}.
An assistant API base URL is required.	Cần URL gốc API trợ lý.
A workspace, conversation or request ID is missing.	Thiếu ID không gian, cuộc chat hoặc yêu cầu.
The assistant server took too long to answer.	Máy chủ trợ lý phản hồi quá thời hạn.
The assistant request was cancelled.	Đã hủy yêu cầu trợ lý.
The assistant server sent something that is not JSON.	Máy chủ trợ lý gửi dữ liệu không phải JSON.
The assistant server's answer has no data field.	Phản hồi máy chủ trợ lý thiếu trường data.
Could not reach the assistant server.	Không thể kết nối máy chủ trợ lý.
The integration did not return a valid authorization URL.	Tích hợp chưa trả URL cấp quyền hợp lệ.
The request could not be completed. Please try again.	Không thể hoàn tất yêu cầu. Hãy thử lại.
Connect your workspace backend to load conversations.	Kết nối backend để tải các cuộc chat.
Your message is saved as a draft. Connect the workspace backend to send it.	Tin nhắn đã lưu nháp. Kết nối backend để gửi.
Attached files	Tệp đính kèm
Response stopped. You can retry this message.	Đã dừng trả lời. Bạn có thể gửi lại tin nhắn.
Stopped waiting. {0}	Đã dừng chờ. {0}
Search {0}	Tìm {0}
Search {0}...	Tìm {0}...
Mine	Của tôi
Folder updated	Đã cập nhật thư mục
Folder created	Đã tạo thư mục
File updated	Đã cập nhật tệp
Folder removed. Its files are now private templates.	Đã gỡ thư mục. Các tệp chuyển thành mẫu riêng tư.
File deleted	Đã xóa tệp
Could not download this file.	Không thể tải tệp này.
Folder link copied. Access follows your saved sharing setting.	Đã chép liên kết thư mục. Quyền truy cập theo cài đặt chia sẻ đã lưu.
Could not copy the link. You can copy this page’s URL from your browser.	Không chép được liên kết. Bạn có thể chép URL trang từ trình duyệt.
{0} uploaded	Đã tải {0} lên
Upload failed. Try again.	Tải lên thất bại. Hãy thử lại.
Wait for the file library to load, or retry the connection.	Chờ thư viện tệp tải xong hoặc thử kết nối lại.
Upload up to 10 files at a time.	Mỗi lần tải lên tối đa 10 tệp.
File type	Loại tệp
Type · {0}	Loại · {0}
Drop files to upload	Thả tệp để tải lên
Add to file templates	Thêm vào mẫu tệp
Breadcrumb	Đường dẫn
Folder actions	Thao tác thư mục
Edit folder	Sửa thư mục
Delete folder	Xóa thư mục
Upload files	Tải tệp lên
See files you recently used in chats and manage files saved in folders.	Xem tệp dùng gần đây trong chat và quản lý tệp trong thư mục.
Loading your files…	Đang tải tệp…
Folder visibility	Quyền xem thư mục
Shared	Dùng chung
Private	Riêng tư
Sort folders A to Z	Sắp xếp thư mục A–Z
Sort folders Z to A	Sắp xếp thư mục Z–A
Folder view	Chế độ xem thư mục
Grid view	Dạng lưới
List view	Dạng danh sách
No matching folders	Không có thư mục phù hợp
Your folders live here	Thư mục của bạn ở đây
Try another search or visibility filter.	Thử tìm từ khác hoặc đổi bộ lọc quyền xem.
Create a folder to keep files and chats together.	Tạo thư mục để tập trung tệp và cuộc chat.
Folder not found	Không tìm thấy thư mục
It may have been renamed or removed from this workspace.	Thư mục có thể đã đổi tên hoặc bị gỡ khỏi không gian.
Back to files	Về Tệp
Folder files	Tệp trong thư mục
File templates	Mẫu tệp
File ownership	Chủ sở hữu tệp
Shared with me	Chia sẻ với tôi
Sort files A to Z	Sắp xếp tệp A–Z
Sort files Z to A	Sắp xếp tệp Z–A
Add template	Thêm mẫu
Create template	Tạo mẫu
Upload template	Tải mẫu lên
No matching files	Không có tệp phù hợp
A home for your files	Nơi lưu tệp của bạn
Try another search or clear the filters.	Thử tìm từ khác hoặc xóa bộ lọc.
Drop files here or upload from your device.	Thả tệp vào đây hoặc tải lên từ thiết bị.
Cancel upload {0}	Hủy tải {0} lên
Share folder	Chia sẻ thư mục
Template created	Đã tạo mẫu
File details	Thông tin tệp
Delete folder?	Xóa thư mục?
Delete file?	Xóa tệp?
The folder will be removed. Its files will be kept as private file templates.	Thư mục sẽ bị gỡ. Các tệp được giữ dưới dạng mẫu riêng tư.
This file will be removed from your library. This action cannot be undone.	Tệp sẽ bị xóa khỏi thư viện. Không thể hoàn tác.
Files in your workspace	Tệp trong không gian
Organize documents in folders, reuse file templates, and choose the same folders when starting a chat. Search, filter, or switch to list view to find what you need.	Sắp xếp tài liệu trong thư mục, dùng lại mẫu tệp và chọn cùng thư mục khi bắt đầu chat. Tìm kiếm, lọc hoặc xem danh sách để tìm nội dung cần dùng.
Upload up to 10 files at a time, 20 MB each. Private items are personal; shared items belong to your workspace. Your backend controls access when connected.	Mỗi lần tải tối đa 10 tệp, 20 MB/tệp. Mục riêng tư thuộc cá nhân; mục dùng chung thuộc không gian. Backend kiểm soát truy cập khi kết nối.
Your workspace backend stores files and changes.	Backend không gian lưu tệp và thay đổi.
Files are stored in this browser on this device. Connect your workspace backend to sync across devices.	Tệp lưu trong trình duyệt trên thiết bị này. Kết nối backend để đồng bộ nhiều thiết bị.
Only you can access	Chỉ bạn truy cập được
Available to this workspace	Khả dụng cho không gian này
Enter a folder name.	Nhập tên thư mục.
Folder name	Tên thư mục
Who can access	Ai được truy cập
People in this workspace can access this folder and its files.	Người trong không gian có thể truy cập thư mục và tệp bên trong.
This folder and its files are private to you.	Chỉ bạn được truy cập thư mục và tệp bên trong.
Template name	Tên mẫu
e.g. Project brief	Ví dụ: Tóm tắt dự án
Start writing your template…	Bắt đầu viết mẫu…
Editable text template. Upload an existing file to keep its original format.	Mẫu văn bản sửa được. Tải tệp có sẵn lên để giữ định dạng gốc.
Editable sample	Mẫu sửa được
Added by	Người thêm
File name	Tên tệp
Visibility	Quyền xem
Files in a folder inherit its sharing setting.	Tệp trong thư mục dùng cùng cài đặt chia sẻ.
Your original file is stored intact. Download to open it in your preferred app.	Tệp gốc được giữ nguyên. Tải xuống để mở bằng ứng dụng bạn muốn.
This is independently authored sample text. Download exports a .txt file; upload a PDF for the original PDF format.	Đây là văn bản mẫu tự viết. Tải xuống xuất tệp .txt; tải PDF lên nếu cần giữ định dạng PDF gốc.
Delete file	Xóa tệp
File storage is unavailable. Please try again or connect your workspace backend.	Không dùng được bộ nhớ tệp. Thử lại hoặc kết nối backend.
Could not store this file. Your device may be out of space.	Không thể lưu tệp. Thiết bị có thể đã hết dung lượng.
Choose a file smaller than 20 MB.	Chọn tệp nhỏ hơn 20 MB.
Cancelled	Đã hủy
This backend does not support file uploads yet.	Backend chưa hỗ trợ tải tệp lên.
The upload server returned an invalid file URL.	Máy chủ tải lên trả URL tệp không hợp lệ.
This file URL is invalid.	URL tệp không hợp lệ.
This file is no longer available on this device. Upload it again.	Tệp không còn trên thiết bị. Hãy tải lên lại.
No results	Không có kết quả
Close command palette	Đóng bảng điều hướng
Pages	Trang
Create and manage invoices	Tạo và quản lý hóa đơn
Talk with your assistant	Trò chuyện với trợ lý
Workspace files	Tệp của không gian
Agent plans and activity	Kế hoạch và hoạt động agent
Plans, members and API keys	Gói, thành viên và khóa API
Your workspace overview	Tổng quan không gian
People and contact details	Nhân sự và thông tin liên hệ
Your sales pipeline	Quy trình bán hàng
Analytics and reports	Phân tích và báo cáo
New business pipeline	Quy trình khách hàng mới
Renewal pipeline	Quy trình gia hạn
Partnership pipeline	Quy trình đối tác
Projects, teams and tasks	Dự án, nhóm và tác vụ
Build and run your process	Xây dựng và chạy quy trình
Inspect process runs	Kiểm tra lượt chạy quy trình
Your skill library	Thư viện kỹ năng
Workspace activity	Hoạt động không gian
Document knowledge library	Thư viện tài liệu kiến thức
General settings	Cài đặt chung
Workspace and regional defaults	Tùy chọn không gian và vùng
Theme, text and interface motion	Giao diện, chữ và chuyển động
Email and desktop preferences	Tùy chọn email và thông báo máy tính
Workspace security policy	Chính sách bảo mật không gian
Account sign-in and sessions	Đăng nhập và phiên tài khoản
Workspace access and roles	Quyền truy cập và vai trò
Billing settings	Cài đặt thanh toán
Invoice and currency preferences	Tùy chọn hóa đơn và tiền tệ
Usage · {0}	Sử dụng · {0}
Agent usage and plan management	Mức sử dụng agent và quản lý gói
Company CRM view	Chế độ CRM công ty
`);
