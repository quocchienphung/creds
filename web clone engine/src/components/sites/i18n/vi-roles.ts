import { catalog } from './catalog';
export const roles = catalog(`
About the {0} role	Về vai trò {0}
Splits the goal, hands each part to the right block and reports when everything is done.	Chia mục tiêu, giao từng phần cho đúng khối và báo cáo khi hoàn tất.
The block in the middle. It owns the goal and decides which block goes next. One per map is enough.	Khối trung tâm, giữ mục tiêu và quyết định khối chạy tiếp. Mỗi bản đồ chỉ cần một khối.
The goal, in your words, and any limit (time, cost, what it must not touch).	Mục tiêu theo lời bạn và các giới hạn về thời gian, chi phí, phạm vi không được tác động.
To the Planner first, then to the blocks that do the work. It takes the final report back; connect the last block to it to close a loop.	Giao cho khối Lập kế hoạch trước, rồi đến khối thực hiện. Nhận lại báo cáo cuối; nối khối cuối về đây để khép vòng.
It should coordinate, not work. If it starts writing code or copy, give that to a Coder or Creator block.	Khối chỉ điều phối. Nếu bắt đầu viết mã hoặc nội dung, hãy giao việc đó cho khối Lập trình hoặc Sáng tạo.
Plan the work	Lập kế hoạch công việc
Turn the goal into steps and say who does each one	Chuyển mục tiêu thành các bước và chỉ rõ người thực hiện
Report	Báo cáo
Collect what every block produced and write the final report	Tổng hợp kết quả từng khối và viết báo cáo cuối
Breaks a goal into small ordered steps and says who should do each one.	Chia mục tiêu thành các bước nhỏ có thứ tự và xác định người thực hiện.
Right after the Coordinator, before anyone builds. Use it again when a loop starts a new round and the plan may have to change.	Ngay sau khối Điều phối, trước khi thực hiện. Dùng lại khi bắt đầu vòng mới và có thể cần đổi kế hoạch.
The goal and what is already known (research from a Helper, the last round's findings).	Mục tiêu và thông tin đã biết: nghiên cứu từ khối Hỗ trợ, kết quả vòng trước.
A numbered list of small steps, each with its owner and what “done” means, to the Creator or Coder.	Danh sách bước nhỏ có số thứ tự, người phụ trách và tiêu chí hoàn tất, chuyển cho khối Sáng tạo hoặc Lập trình.
Steps that are too big for one block. If a step needs more than one kind of work, split it.	Tránh bước quá lớn cho một khối. Nếu có nhiều loại công việc, hãy chia nhỏ.
List the steps	Liệt kê các bước
Write the steps in order, each small enough for one block	Viết các bước theo thứ tự, mỗi bước vừa với một khối
Define done	Định nghĩa hoàn tất
Say what must be true when each step is finished	Nêu điều kiện phải đạt khi hoàn tất từng bước
Research first	Nghiên cứu trước
Look up what the plan depends on before it is final	Tra cứu các thông tin kế hoạch phụ thuộc trước khi chốt
Makes the first version of what is needed: copy, a design brief, a draft or a spec.	Tạo phiên bản đầu của nội dung, tóm tắt thiết kế, bản nháp hoặc đặc tả cần dùng.
When something has to exist before it can be built or checked: the words on a page, a design brief, a data model, a test plan.	Khi cần đầu vào trước khi triển khai hoặc kiểm tra: nội dung trang, tóm tắt thiết kế, mô hình dữ liệu, kế hoạch kiểm thử.
One step from the Planner, with its “done” rule, plus any brand or style notes.	Một bước từ khối Lập kế hoạch cùng tiêu chí hoàn tất và ghi chú thương hiệu, phong cách.
One finished deliverable to the Coder (to build it) or the Reviewer (to judge it).	Một sản phẩm hoàn chỉnh cho khối Lập trình để triển khai hoặc khối Đánh giá để thẩm định.
Several deliverables in one block. Give each its own Creator so each can be reviewed and redone alone.	Tránh gom nhiều sản phẩm vào một khối. Mỗi sản phẩm nên có khối Sáng tạo riêng để đánh giá và sửa độc lập.
First draft	Bản nháp đầu
Write the first complete version	Viết phiên bản hoàn chỉnh đầu tiên
Alternatives	Phương án khác
Make two different versions so one can be chosen	Tạo hai phiên bản khác nhau để lựa chọn
Review the draft	Đánh giá bản nháp
Judge the draft against the brief and say what to change	Đối chiếu bản nháp với yêu cầu và nêu phần cần sửa
Writes or changes code for the step it is given and explains what it changed.	Viết hoặc sửa mã cho bước được giao và giải thích thay đổi.
For every step that changes code or configuration.	Cho mọi bước thay đổi mã hoặc cấu hình.
One step, the Creator's spec or brief, and where the code lives.	Một bước, đặc tả hoặc yêu cầu từ khối Sáng tạo và vị trí mã nguồn.
The change and a short note of what changed and why, to QA.	Thay đổi cùng ghi chú ngắn về nội dung, lý do, chuyển cho QA.
Big changes in one go. Small steps are easier to check and to undo.	Tránh thay đổi lớn trong một lần. Bước nhỏ dễ kiểm tra và hoàn tác hơn.
Make the change	Thực hiện thay đổi
Implement the step in small commits	Triển khai bước bằng các commit nhỏ
Test it	Kiểm thử
Run the checks and report pass or fail with evidence	Chạy kiểm tra, báo đạt hay không đạt kèm bằng chứng
Fix what fails	Sửa phần bị lỗi
Fix whatever the tests found	Sửa lỗi phát hiện qua kiểm thử
Checks that the result works: runs the tests, tries the flow, reports pass or fail with evidence.	Kiểm tra kết quả bằng kiểm thử và trải nghiệm luồng, báo đạt hay không đạt kèm bằng chứng.
After every Coder or Creator block whose result can be tested.	Sau mỗi khối Lập trình hoặc Sáng tạo có kết quả kiểm thử được.
The result to check, the plan's “done” rule for it, and how to run the checks.	Kết quả cần kiểm tra, tiêu chí hoàn tất trong kế hoạch và cách chạy kiểm tra.
A pass or fail report with evidence. Pass goes to the Reviewer; fail goes to the Fixer, and the Fixer goes back to QA (a loop).	Báo cáo đạt hoặc không đạt kèm bằng chứng. Đạt chuyển sang Đánh giá; lỗi chuyển sang Sửa lỗi rồi quay lại QA thành vòng lặp.
A vague bar. Say exactly what passing means, or QA will approve anything. Give the loop a round limit.	Tránh tiêu chí mơ hồ. Nêu rõ điều kiện đạt để QA kiểm tra đúng. Đặt giới hạn số vòng lặp.
Write the checks	Viết kiểm thử
Turn the plan's “done” rules into test cases	Chuyển tiêu chí hoàn tất của kế hoạch thành ca kiểm thử
Run the checks	Chạy kiểm tra
Run every check and record the result	Chạy từng kiểm tra và ghi kết quả
Try it as a user	Thử như người dùng
Go through the main flow by hand and note anything odd	Tự đi qua luồng chính và ghi lại điểm bất thường
Judges the result against the goal for quality, safety and completeness, then approves it or sends it back.	Đánh giá kết quả theo mục tiêu về chất lượng, an toàn, đầy đủ rồi phê duyệt hoặc trả lại.
Before anything goes out: after QA passes, before a deploy, a send or a publish.	Trước khi đưa ra ngoài: sau khi QA đạt, trước khi triển khai, gửi hoặc phát hành.
The result, QA's evidence and the goal.	Kết quả, bằng chứng QA và mục tiêu.
An approval, or a list of reasons it goes back. On approval it hands to whatever ships; if not, back to the Creator or Coder.	Phê duyệt hoặc danh sách lý do trả lại. Đạt thì chuyển khối bàn giao; chưa đạt thì quay lại Sáng tạo hoặc Lập trình.
Turn on “Ask me before it runs” on the step after the Reviewer for anything that cannot be undone. A Reviewer is an AI's opinion, not a person's decision.	Bật “Hỏi tôi trước khi chạy” ở bước sau khối Đánh giá cho thao tác không thể hoàn tác. Đánh giá của AI không thay cho quyết định của con người.
Review the change	Đánh giá thay đổi
Read the result and judge it against the goal	Đọc kết quả và đối chiếu với mục tiêu
Approve or send back	Duyệt hoặc trả lại
Say yes, or list the reasons it goes back	Phê duyệt hoặc liệt kê lý do trả lại
Finds why something fails, fixes the smallest part that is wrong and checks it works again.	Tìm nguyên nhân lỗi, sửa phần nhỏ nhất bị sai và kiểm tra lại.
When QA or a Reviewer reports a failure.	Khi QA hoặc khối Đánh giá báo lỗi.
The failure report with its evidence, and the code or text it is about.	Báo cáo lỗi kèm bằng chứng và mã hoặc nội dung liên quan.
The fix and what was wrong. Connect it back to QA so the fix is checked, and set the loop's rounds so it cannot go on forever.	Bản sửa và nguyên nhân sai. Nối lại QA để kiểm tra, đặt giới hạn vòng để tránh lặp vô tận.
A Fixer that rewrites everything. Ask for the smallest change that fixes the cause.	Tránh khối Sửa lỗi viết lại mọi thứ. Yêu cầu thay đổi nhỏ nhất xử lý đúng nguyên nhân.
Find the cause	Tìm nguyên nhân
Reproduce the failure and find why it happens	Tái hiện lỗi và tìm nguyên nhân
Fix it	Sửa lỗi
Change the smallest part that is wrong	Sửa phần nhỏ nhất bị sai
Check again	Kiểm tra lại
Run the failing check again	Chạy lại kiểm tra đã thất bại
Undoes a change that went wrong and puts things back as they were.	Hoàn tác thay đổi sai và đưa mọi thứ về trạng thái trước.
As the safety net: connect it to the block that ships, so a bad release can be rolled back.	Dùng làm lớp dự phòng: nối với khối phát hành để hoàn nguyên khi bản phát hành lỗi.
What went wrong and the last version known to be good.	Sự cố và phiên bản tốt gần nhất đã xác nhận.
A confirmation that things are back as they were, to the Coordinator or the Revoker.	Xác nhận đã khôi phục trạng thái trước, chuyển cho Điều phối hoặc Thu hồi quyền.
No clear “last good”. Say what to go back to, or it will guess.	Phải chỉ rõ phiên bản tốt gần nhất để tránh khối tự đoán.
Find the last good version	Tìm phiên bản tốt gần nhất
Say which version everything should go back to	Nêu phiên bản cần khôi phục
Roll back	Hoàn nguyên
Put it back exactly as it was and check it	Khôi phục đúng trạng thái trước rồi kiểm tra
Withdraws access, keys or permissions that are no longer needed or are no longer safe.	Thu hồi quyền truy cập, khóa hoặc quyền hạn không còn cần thiết hay an toàn.
At the end of a run, or after a failure, to close what the blocks opened: temporary keys, tokens, shared links.	Cuối lượt chạy hoặc sau sự cố, đóng những gì các khối đã mở: khóa tạm, token, liên kết chia sẻ.
The list of what was opened, or the incident.	Danh sách quyền đã mở hoặc thông tin sự cố.
A list of what was revoked and confirmed gone, to the Coordinator.	Danh sách quyền đã thu hồi và xác nhận gỡ bỏ, chuyển cho Điều phối.
Revoking without a list. Have a Helper or the Coordinator write down what was opened first, and ask for approval before it runs.	Không thu hồi khi thiếu danh sách. Nhờ Hỗ trợ hoặc Điều phối ghi quyền đã mở và yêu cầu duyệt trước khi chạy.
List what is open	Liệt kê quyền đang mở
List the keys, tokens and permissions in use	Liệt kê khóa, token và quyền đang dùng
Revoke each one that is no longer needed and confirm it is gone	Thu hồi từng quyền không cần nữa và xác nhận đã gỡ
Explains the result step by step, in plain words, for whoever has to follow it.	Giải thích kết quả từng bước bằng lời dễ hiểu cho người cần làm theo.
At the end, so a person can follow what happened, or where a step needs a how-to.	Ở cuối để người dùng hiểu diễn biến, hoặc tại bước cần hướng dẫn.
The results of the blocks before it.	Kết quả các khối trước đó.
A summary or how-to written for a person.	Bản tóm tắt hoặc hướng dẫn dành cho người dùng.
Jargon. Say who it is written for.	Tránh thuật ngữ khó. Chỉ rõ người đọc hướng dẫn.
Summarize	Tóm tắt
Write what happened in plain words	Viết diễn biến bằng lời dễ hiểu
How to	Cách thực hiện
Write the steps someone follows to use the result	Viết các bước để sử dụng kết quả
Looks things up and answers the other blocks so they can keep working.	Tra cứu và trả lời các khối khác để công việc tiếp tục.
Wherever a block needs a fact it does not have: prices, docs, examples, a comparison.	Khi khối cần thông tin chưa có: giá, tài liệu, ví dụ hoặc so sánh.
A question from another block.	Câu hỏi từ khối khác.
A short answer with how sure it is, back to the block that asked.	Trả lời ngắn kèm mức chắc chắn cho khối đã hỏi.
A Helper that starts doing the asking block's job.	Tránh khối Hỗ trợ làm thay công việc của khối đã hỏi.
Look it up	Tra cứu
Find the answer and say how sure you are	Tìm câu trả lời và nêu mức chắc chắn
Compare options	So sánh phương án
Compare the options in a short table	So sánh các phương án trong bảng ngắn
Takes in data or files, cleans and transforms them and passes the result on. Also the place for repeatable steps like build and deploy.	Nhận dữ liệu hoặc tệp, làm sạch, biến đổi và chuyển kết quả. Cũng dùng cho bước lặp được như dựng và triển khai.
For repeatable, mechanical steps: cleaning data, converting files, running the build, publishing or deploying.	Cho bước thao tác lặp lại được: làm sạch dữ liệu, chuyển tệp, dựng, phát hành hoặc triển khai.
The data, files or build to work on, and the format wanted.	Dữ liệu, tệp hoặc bản dựng cần xử lý và định dạng mong muốn.
The result in the same shape every time.	Kết quả có cùng cấu trúc mỗi lần.
A deploy or publish with nobody asked. Turn on “Ask me before it runs” for it, and put a Reviewer and a Reverter around it.	Không tự triển khai hay phát hành khi chưa hỏi. Bật “Hỏi tôi trước khi chạy”, đặt khối Đánh giá trước và Hoàn nguyên sau.
Clean the data	Làm sạch dữ liệu
Remove what is wrong or duplicated	Loại phần sai hoặc trùng
Convert it	Chuyển đổi
Turn it into the format the next block needs	Chuyển sang định dạng khối tiếp theo cần
Deploy	Triển khai
Build and publish the approved result	Dựng và phát hành kết quả đã duyệt
`);
