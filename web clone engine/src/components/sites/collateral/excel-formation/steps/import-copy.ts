import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";

const COPY = {
  intro: ["Start with your workbook", "Bắt đầu với tệp Excel của bạn"],
  hint: ["Open one .xlsx file to check its text and data.", "Mở một tệp .xlsx để kiểm tra ký tự và dữ liệu."],
  limits: ["XLSX · up to 120 MB", "XLSX · tối đa 120 MB"],
  selected: ["Selected workbook", "Tệp Excel đã chọn"],
  preview: ["Workbook preview", "Xem trước tệp Excel"],
  expand: ["Show workbook preview", "Mở xem trước tệp Excel"],
  collapse: ["Collapse workbook preview", "Thu gọn xem trước tệp Excel"],
  remove: ["Remove workbook", "Bỏ tệp Excel"],
  replace: ["Choose another file", "Chọn tệp khác"],
  ready: ["Workbook opened", "Đã mở tệp Excel"],
  failed: ["Could not open this workbook", "Không thể mở tệp Excel này"],
  reading: ["Worksheet details appear after the file is read.", "Thông tin trang tính xuất hiện sau khi đọc tệp."],
  detected: ["Detected columns", "Các cột đã đọc"],
  noColumns: ["No header row detected", "Chưa tìm thấy dòng tiêu đề"],
} as const;

// Kept local to Import so the parallel owner's shared dictionaries are untouched.
export function useImportCopy() {
  const { locale } = useWorkspaceI18n();
  return (key: keyof typeof COPY) => COPY[key][locale === "vi" ? 1 : 0];
}
