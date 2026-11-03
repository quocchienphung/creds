import { catalog } from './catalog';
export const errors = catalog(`
The server answered {0}.	Máy chủ trả về {0}.
The server took too long to answer.	Máy chủ phản hồi quá thời hạn.
The request was cancelled.	Đã hủy yêu cầu.
Could not reach the server.	Không thể kết nối máy chủ.
The server sent something that is not JSON.	Máy chủ gửi dữ liệu không phải JSON.
The server's answer has no data field.	Phản hồi máy chủ thiếu trường data.
The document index is invalid.	Chỉ mục tài liệu không hợp lệ.
The document upload receipt does not match the original.	Biên nhận tải lên không khớp bản gốc.
The server returned an invalid document index.	Máy chủ trả chỉ mục tài liệu không hợp lệ.
The server returned invalid document search results.	Máy chủ trả kết quả tìm tài liệu không hợp lệ.
The upload answer has no url.	Phản hồi tải lên thiếu URL.
The server's "{0}" answer is not in the expected format.	Phản hồi “{0}” của máy chủ không đúng định dạng.
Invalid base64 skill file.	Tệp kỹ năng có mã base64 không hợp lệ.
Non-canonical base64 skill file.	Mã base64 của tệp kỹ năng không đúng dạng chuẩn.
SKILL.md must start with YAML frontmatter (---).	SKILL.md phải bắt đầu bằng phần đầu YAML (---).
SKILL.md frontmatter must end with --- on its own line.	Phần đầu SKILL.md phải kết thúc bằng --- trên một dòng riêng.
Duplicate {0} in SKILL.md frontmatter.	Trùng {0} trong phần đầu SKILL.md.
Use a valid JSON quoted string for {0}.	Dùng chuỗi có dấu ngoặc kép đúng chuẩn JSON cho {0}.
Unsupported quoted {0}.	Không hỗ trợ cách đặt dấu ngoặc cho {0}.
Use a quoted string for {0}.	Dùng chuỗi đặt trong dấu ngoặc kép cho {0}.
Skill name must be 1–64 lowercase letters, numbers and single hyphens.	Tên kỹ năng phải dài 1–64 ký tự, gồm chữ thường, số và dấu gạch ngang đơn.
Skill description is required (maximum 2048 characters).	Cần mô tả kỹ năng, tối đa 2.048 ký tự.
Invalid skill bundle or workspace.	Gói kỹ năng hoặc không gian không hợp lệ.
Duplicate bundle folder: {0}. Rename one skill before exporting.	Trùng thư mục gói: {0}. Đổi tên một kỹ năng trước khi xuất.
Checksum mismatch for {0}. Save the skill again before exporting.	Mã kiểm tra của {0} không khớp. Lưu kỹ năng lại trước khi xuất.
Checksum mismatch for {0}/{1}. Import the skill again before exporting.	Mã kiểm tra của {0}/{1} không khớp. Nhập lại kỹ năng trước khi xuất.
GitHub URL is too long.	Đường dẫn GitHub quá dài.
Enter a complete HTTPS GitHub URL.	Nhập đường dẫn GitHub HTTPS đầy đủ.
Only public HTTPS github.com or raw.githubusercontent.com skill links are supported.	Chỉ hỗ trợ liên kết kỹ năng HTTPS công khai từ github.com hoặc raw.githubusercontent.com.
GitHub URL contains an invalid path.	Đường dẫn GitHub chứa phần đường dẫn không hợp lệ.
GitHub URL contains invalid escaping.	Đường dẫn GitHub chứa ký tự mã hóa không hợp lệ.
A GitHub owner and repository are required.	Cần tên chủ sở hữu và kho GitHub.
Use a repository URL or a GitHub file/folder link with a branch, tag or commit.	Dùng URL kho hoặc liên kết tệp/thư mục GitHub có nhánh, thẻ hoặc commit.
The link must point to a SKILL.md file (or its GitHub tree folder).	Liên kết phải trỏ đến SKILL.md hoặc thư mục GitHub chứa tệp đó.
Unsupported Git reference. Use a commit-pinned SKILL.md URL.	Tham chiếu Git chưa được hỗ trợ. Dùng URL SKILL.md gắn với commit cụ thể.
SKILL.md was not found. Check the public path and branch (use an encoded slash for branch names containing /).	Không tìm thấy SKILL.md. Kiểm tra đường dẫn công khai và nhánh; mã hóa dấu / nếu tên nhánh có ký tự này.
GitHub returned HTTP {0}.	GitHub trả HTTP {0}.
GitHub returned HTML instead of a SKILL.md text file.	GitHub trả HTML thay vì tệp văn bản SKILL.md.
SKILL.md exceeds the 256 KiB limit.	SKILL.md vượt giới hạn 256 KiB.
GitHub returned an empty file.	GitHub trả tệp trống.
SKILL.md must be valid UTF-8 text.	SKILL.md phải là văn bản UTF-8 hợp lệ.
SKILL.md contains invalid null characters.	SKILL.md chứa ký tự null không hợp lệ.
Invalid SKILL.md frontmatter.	Phần đầu SKILL.md không hợp lệ.
GitHub import timed out after 15 seconds.	Nhập từ GitHub quá thời hạn 15 giây.
Could not read the public GitHub file. Redirects, private repositories and network failures are not supported.	Không đọc được tệp GitHub công khai. Chưa hỗ trợ chuyển hướng, kho riêng tư hoặc lỗi mạng.
Invalid GitHub archive.	Gói lưu trữ GitHub không hợp lệ.
Unsupported GitHub archive format.	Định dạng gói GitHub chưa được hỗ trợ.
GitHub archive is missing its commit identity.	Gói GitHub thiếu thông tin nhận dạng commit.
Repository archive is too large to inspect.	Gói kho mã quá lớn để kiểm tra.
Invalid archive directory.	Thư mục trong gói không hợp lệ.
Invalid archive entry.	Mục trong gói không hợp lệ.
Archive entry names must be valid UTF-8.	Tên mục trong gói phải là UTF-8 hợp lệ.
Repository archive exceeds 20 MiB or is invalid.	Gói kho mã vượt 20 MiB hoặc không hợp lệ.
Archive has inconsistent repository roots or duplicate entries.	Gói có thư mục gốc không nhất quán hoặc mục bị trùng.
This repository folder does not contain SKILL.md.	Thư mục trong kho không có SKILL.md.
Skill folder exceeds 256 supporting files or 4 MiB.	Thư mục kỹ năng vượt 256 tệp hỗ trợ hoặc 4 MiB.
Skill contains an oversized file, symbolic link or unsupported entry.	Kỹ năng chứa tệp quá lớn, liên kết tượng trưng hoặc mục chưa được hỗ trợ.
Could not decode this GitHub archive.	Không thể giải mã gói GitHub.
SKILL.md is empty or exceeds 256 KiB.	SKILL.md trống hoặc vượt 256 KiB.
SKILL.md must be valid UTF-8.	SKILL.md phải là UTF-8 hợp lệ.
Skill file size does not match its archive entry.	Dung lượng tệp kỹ năng không khớp thông tin trong gói.
Skill contains unsafe, duplicate or unsupported file paths.	Kỹ năng chứa đường dẫn không an toàn, trùng hoặc chưa được hỗ trợ.
Could not download the public repository archive. Check its branch and path.	Không tải được gói kho công khai. Kiểm tra nhánh và đường dẫn.
Repository archive exceeds 20 MiB.	Gói kho mã vượt 20 MiB.
Repository scan timed out after 25 seconds.	Quét kho mã quá thời hạn 25 giây.
Could not scan the skill folder.	Không thể quét thư mục kỹ năng.
This source contains more than 100 skill documents. Choose a narrower GitHub folder to scan.	Nguồn có hơn 100 tài liệu kỹ năng. Chọn thư mục GitHub nhỏ hơn để quét.
Skill discovery exceeds 4 MiB of instruction documents. Choose a narrower GitHub folder.	Tổng tài liệu chỉ dẫn vượt 4 MiB. Chọn thư mục GitHub nhỏ hơn.
Skill document size does not match its archive entry.	Dung lượng tài liệu kỹ năng không khớp thông tin trong gói.
This repository path does not contain SKILL.md.	Đường dẫn trong kho không có SKILL.md.
No valid skills were found. SKILL.md files need a valid name and description in YAML frontmatter.	Không tìm thấy kỹ năng hợp lệ. SKILL.md cần tên và mô tả hợp lệ trong phần đầu YAML.
No SKILL.md files were found in this repository or folder.	Không tìm thấy SKILL.md trong kho hoặc thư mục này.
Choose a workspace	Chọn không gian
Your interactive introduction	Phần giới thiệu tương tác
`);
