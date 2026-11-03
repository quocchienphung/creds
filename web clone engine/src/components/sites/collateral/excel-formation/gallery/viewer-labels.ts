import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";

// Keep viewer labels separate from the translation inventory being edited in parallel.
const vi: Record<string, string> = {
  "Worksheet": "Trang tính", "Go to cell": "Đi tới ô", "Back to issue": "Về ô lỗi", "Expand file": "Mở rộng tệp",
  "Preview · not applied": "Xem thử · chưa áp dụng",
  "Full cell value": "Giá trị đầy đủ của ô", "Show full cell value": "Xem toàn bộ nội dung ô",
  "Zoom out magnifier": "Giảm độ phóng kính lúp", "Zoom in magnifier": "Tăng độ phóng kính lúp",
  "Could not load this part of the file.": "Không tải được vùng dữ liệu này.", "Loading worksheet…": "Đang đọc trang tính…",
  "Drag down to close": "Kéo xuống để đóng", "Double-click the file to expand": "Nhấp đúp vào bảng để mở rộng",
};

export function useViewerText() {
  const workspace = useWorkspaceI18n();
  return { ...workspace, t: (key: string, values?: readonly unknown[]) => workspace.t(workspace.locale === "vi" ? vi[key] ?? key : key, values) };
}
