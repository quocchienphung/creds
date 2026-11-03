# Sửa chung các dòng trùng nội dung lỗi

Phạm vi người dùng đã chọn ngày 2026-11-03: **cùng tài sản + cùng toàn bộ nội dung lỗi**. Khóa tài sản gồm chi nhánh, khách hàng và mã tài sản; các cột mô tả tương đương được đối chiếu theo mapping hiện có. Không gộp dữ liệu giữa các tài sản hoặc worksheet.

## Kết quả quét file thật

Quét đọc tại máy, không sửa/ghi đè hoặc gửi dữ liệu ra ngoài. File đầu vào trong Downloads có kích thước 11.119.586 byte. Báo cáo chỉ chứa số lượng, không chứa nội dung ô, mã khách hàng/tài sản hoặc hash giá trị. Script quét độc lập và chỉ mục dùng trong ứng dụng cho kết quả khớp nhau:

| Chỉ tiêu | Kết quả |
| --- | ---: |
| Dòng dữ liệu của sheet chính | 44.183 |
| Dòng có ký tự `?` | 3.773 |
| Ô văn bản đủ điều kiện có `?` | 7.464 |
| Nhóm cùng tài sản và cùng nội dung lỗi | 359 |
| Lượt dòng trong các nhóm này | 1.208 |
| Ô thuộc các nhóm này | 2.416 |
| Số dòng của nhóm lớn nhất | 75 |
| Nhóm trùng toàn bộ nội dung dòng có `?` | 5 nhóm / 10 dòng |
| Nhóm cùng nội dung lỗi nhưng có nhiều tài sản khác nhau | 9 |

Lượt dòng được cộng theo nhóm nội dung; một dòng có nhiều trường khác nhau có thể được đếm trong nhiều nhóm. Chín nhóm xuyên tài sản chỉ được thống kê, không được sửa xuyên tài sản. Không xóa dòng, hợp nhất hồ sơ hay cộng lại số tiền.

## Nguyên nhân và thay đổi

Trước thay đổi, `CONFLICTING_DUPLICATE` chỉ phát hiện các thành viên có giá trị khác nhau. Ba dòng có cùng mô tả hỏng không tạo lỗi xung đột; duyệt một ô chỉ sửa dòng đang chọn và cột mô tả song sinh nếu bật. Các bản sao hỏng còn lại vẫn giữ nguyên.

`duplicate-repairs.ts` lập chỉ mục riêng cho các bản sao lỗi giống hệt nhau. Khi duyệt một giá trị thay thế hoàn chỉnh, worker tính nhóm theo trạng thái hiện tại và hiển thị hộp xác nhận số dòng/ô, tọa độ dòng, số dòng ẩn, số ô bị bỏ qua. Chọn áp dụng cả nhóm sẽ tạo một giao dịch history; Undo/Redo tác động cả lượt sửa. Chọn chỉ dòng đang chọn giữ luồng cũ và tùy chọn cột song sinh. Hủy không sửa dữ liệu.

Chỉ sửa phần ký tự bị mất. Mọi ký tự đã biết và chuỗi chữ số phải giữ nguyên. Ô công thức, văn bản được bảo vệ, trường định danh, mapping mơ hồ và khóa tài sản thiếu/hỏng không đủ điều kiện. Ô đã chỉnh riêng, ô đã chấp nhận ngoại lệ và dòng có thành phần khóa tài sản đã được chỉnh đều bị bỏ qua. Worker tính lại nhóm trước khi commit, không tin vào kế hoạch xem trước đã cũ.

Các bản sao hỏng không chứng minh ký tự đã mất. Chức năng này lan truyền **giá trị người dùng vừa duyệt**; không bổ sung mô hình khôi phục toàn bộ dấu `?` hay tự suy đoán các chữ thiếu. Luồng auto repair vẫn chỉ tự áp dụng khi có nguồn sạch đạt chính sách xác minh hiện tại.

## Cách sử dụng

1. Nạp workbook vào Excel formation, mở Review and fix.
2. Chọn một ô có `?`, chọn gợi ý hoặc nhập giá trị đúng đầy đủ.
3. Bấm Approve value. Nếu có nhóm đủ điều kiện, hộp “Sửa chung các dòng trùng lỗi” xuất hiện.
4. Kiểm tra số dòng/ô rồi chọn “Áp dụng cho N dòng”. Có thể chọn “Chỉ dòng đang chọn” hoặc “Hủy”.
5. Xuất workbook ở bước Export. Undo/Redo có thể hoàn tác/phục hồi cả lượt sửa trước khi xuất.

Không đổi markup/CSS của phần suggestion. Hộp xác nhận là overlay; kiểm tra trình duyệt đo kích thước panel trước và trong khi mở hộp để xác nhận không thay đổi bố cục.

## Kiểm chứng

- 150/150 test trong phạm vi collateral Excel/JSON, 2.051 giây. Sáu test mới trực tiếp kiểm tra nhóm lỗi giống nhau, cột song sinh, tách chi nhánh/khách hàng, khóa tài sản đã sửa, ô ngoại lệ, dữ liệu đã chỉnh, chữ/số cố định, Undo/Redo và đọc lại XLSX xuất.
- Full suite: 650 test, 642 đạt, 8 lỗi `ENOENT` do thiếu fixture đã ghi nhận ở split bar, terrain và confirm morph. Không sửa hoặc bỏ qua các test ngoài phạm vi này.
- TypeScript và lint các file tính năng: exit 0.
- Trình duyệt dev và production trước chốt khóa tài sản bổ sung: 11/11 mỗi lượt. Bao gồm xuất và đọc lại XLSX, giữ nguyên tài sản khác, dòng ẩn, giá trị tiền gốc, Undo/Redo, hủy, kích thước suggestion, màn hình 320px và không có lỗi runtime. Lượt production cuối được ghi riêng trong `duplicate-browser-production.log`.
- Build cuối và lượt production sau chốt khóa tài sản: xem cập nhật cuối bên dưới.

Log tái hiện tại máy: `duplicate-feature-tests.log`, `duplicate-full-tests.log`, `duplicate-types.log`, `duplicate-lint.log`, `duplicate-build.log`, `local-duplicate-scan.log`, `duplicate-browser-production.log`. Các log và workbook tổng hợp dùng kiểm thử nằm trong thư mục QA bị Git ignore. Không xuất workbook riêng tư đã sửa trong lần kiểm tra này.

## Phối hợp với Claude Code

Giữ nguyên các thay đổi JSON/template/package của luồng làm việc song song. Chỉ bổ sung RPC/hook hẹp, module nhóm lỗi, hộp xác nhận và báo số nhóm trong repair report. Không có kênh trực tiếp xác nhận trạng thái phiên Claude; bằng chứng tương thích là test/build trên cây mã hiện tại, không phải cam kết rằng hai phiên không thể sửa trùng về sau.
