import { catalog } from './catalog';
/** Display copy for the app's own sample runs. Stored instructions and actual service output are preserved. */
export const examples = catalog(`
Prepare the Q3 board update	Chuẩn bị báo cáo hội đồng Q3
Pull Q3 revenue and churn	Lấy doanh thu và tỷ lệ khách rời bỏ Q3
From Stripe, July to September	Từ Stripe, tháng 7 đến tháng 9
Revenue by month, Q3	Doanh thu từng tháng Q3
Customer churn, Q3	Khách hàng rời bỏ Q3
Read last quarter's board memo	Đọc bản ghi họp quý trước
Keeps the structure the board knows	Giữ cấu trúc quen thuộc với hội đồng
Drive: “board memo Q2”	Drive: “board memo Q2”
6 sections · 1,240 words	6 mục · 1.240 từ
Update the memo draft	Cập nhật bản nháp ghi nhớ
Revenue, churn and the Q4 outlook	Doanh thu, khách rời bỏ và triển vọng Q4
Rewrote the revenue paragraph	Đã viết lại đoạn doanh thu
Added the churn chart	Đã thêm biểu đồ khách rời bỏ
Send the draft to Maya	Gửi bản nháp cho Maya
Needs your approval first	Cần bạn duyệt trước
Sent to maya@logio.com	Đã gửi đến maya@logio.com
Q3 board update – draft	Báo cáo hội đồng Q3 – bản nháp
Emails the Q3 board memo draft for review before Friday.	Gửi bản nháp ghi nhớ hội đồng Q3 qua email để đánh giá trước thứ Sáu.
Attachment	Tệp đính kèm
Book a review with Maya	Đặt lịch đánh giá với Maya
30 minutes before the board meeting	30 phút trước cuộc họp hội đồng
Q3 board memo review	Đánh giá bản ghi họp hội đồng Q3
Launch the pricing page	Ra mắt trang giá
Launch the new pricing page by Friday	Ra mắt trang giá mới trước thứ Sáu
Break the launch into steps and say who does each one	Chia việc ra mắt thành các bước, giao rõ người thực hiện
Compare the pricing of five competitors	So sánh giá của năm đối thủ
Read the pricing pages of Linear, Notion and three more	Đọc trang giá của Linear, Notion và ba đối thủ khác
Summarize 120 G2 reviews that mention price	Tổng hợp 120 đánh giá G2 có nhắc đến giá
Write the copy for the three plans	Viết nội dung cho ba gói
Formal or friendly for the plan names? Both drafts are in Notion.	Tên gói trang trọng hay thân thiện? Cả hai bản nháp đều ở Notion.
Build the page and wire up checkout	Dựng trang và nối luồng thanh toán
Write and run the checkout tests	Viết và chạy kiểm thử thanh toán
Fix whatever the tests found	Sửa lỗi phát hiện qua kiểm thử
Reply to a customer (local model)	Trả lời khách hàng (mô hình cục bộ)
Draft a reply to the customer's question without sending it anywhere	Soạn trả lời câu hỏi của khách hàng, chưa gửi đi
Read the question, ask for a draft and hand it over for approval	Đọc câu hỏi, yêu cầu bản nháp rồi chuyển để phê duyệt
Draft a short, friendly reply that answers the question	Soạn trả lời ngắn, thân thiện, đúng câu hỏi
Check the draft against the refund policy	Đối chiếu bản nháp với chính sách hoàn tiền
Approve the reply before it is sent	Duyệt câu trả lời trước khi gửi
Send this reply to the customer?	Gửi câu trả lời này cho khách hàng?
Ship to production, round and round	Lặp quy trình phát hành lên môi trường thật
Plan, build, check, review and deploy the change, then go round again for the next one	Lập kế hoạch, xây dựng, kiểm tra, đánh giá và triển khai, rồi lặp cho thay đổi tiếp theo
Own the goal, hand each part to the right block and decide whether to go another round	Giữ mục tiêu, giao từng phần đúng khối và quyết định có lặp vòng nữa không
Break the change into small steps and say who does each one	Chia thay đổi thành bước nhỏ và xác định người thực hiện
Write the spec and the copy the change needs	Viết đặc tả và nội dung cần cho thay đổi
Build the change in small commits	Triển khai thay đổi bằng commit nhỏ
Run the checks and try the main flow; report pass or fail with evidence	Chạy kiểm tra, thử luồng chính; báo đạt hoặc không đạt kèm bằng chứng
Fix whatever QA found, then hand back to QA	Sửa lỗi QA phát hiện rồi chuyển lại QA
Judge the result against the goal and approve it or send it back	Đánh giá kết quả theo mục tiêu rồi duyệt hoặc trả lại
Build and publish the approved change	Dựng và phát hành thay đổi đã duyệt
Deploy this change to production?	Triển khai thay đổi lên môi trường thật?
until it passes	đến khi kiểm tra đạt
next release	bản phát hành tiếp
March 4, 2026	4 tháng 3, 2026
Chrome 129 · San Francisco, US · Active now	Chrome 129 · San Francisco, US · Đang hoạt động
Fieldnote for iOS · San Francisco, US · 2 hours ago	Fieldnote cho iOS · San Francisco, US · 2 giờ trước
Edge 128 · Austin, US · Yesterday at 4:12 PM	Edge 128 · Austin, US · Hôm qua lúc 16:12
Safari 18 · Lisbon, PT · Sep 14	Safari 18 · Lisbon, PT · 14 tháng 9
Firefox 130 · Berlin, DE · Sep 9	Firefox 130 · Berlin, DE · 9 tháng 9
File	Tệp
Spreadsheet	Bảng tính
Image	Ảnh
Plan	Kế hoạch
`);
