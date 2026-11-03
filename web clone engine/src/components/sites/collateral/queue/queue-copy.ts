import { useWorkspaceI18n } from "../../i18n/WorkspaceI18n";

const copy = {
  subtitle: ["Your uploaded workbooks, kept until you remove them.", "Các tệp Excel đã tải lên, được giữ đến khi bạn xóa."],
  archiveHint: ["Uploaded originals are saved to Queue.", "Tệp gốc tải lên sẽ được lưu vào Queue."],
  saved: ["Original saved to Queue.", "Đã lưu tệp gốc vào Queue."],
  saving: ["Saving original to Queue…", "Đang lưu tệp gốc vào Queue…"],
  saveFailed: ["Original has not been saved to Queue.", "Chưa lưu được tệp gốc vào Queue."],
  retry: ["Retry", "Thử lại"], viewQueue: ["View Queue", "Xem Queue"],
  originals: ["Original files", "Tệp gốc"], uploaded: ["Saved", "Đã lưu"], ready: ["Scanned", "Đã quét"], failed: ["Could not scan", "Không quét được"],
  all: ["All files", "Tất cả tệp"], search: ["Search files or SHA-256", "Tìm tên tệp hoặc SHA-256"],
  refresh: ["Refresh", "Làm mới"], import: ["Upload workbook", "Tải tệp Excel lên"],
  empty: ["Your uploads will appear here", "Tệp bạn tải lên sẽ xuất hiện ở đây"],
  emptyHint: ["Open a workbook in Excel formation. Its original is saved here automatically.", "Mở tệp trong Excel formation. Tệp gốc sẽ tự động được lưu ở đây."],
  noMatches: ["No files match these filters.", "Không có tệp khớp với bộ lọc."],
  loading: ["Loading saved uploads…", "Đang đọc lịch sử tải lên…"],
  openExcel: ["Open in Excel", "Mở trong Excel"], openJson: ["Open in JSON", "Mở trong JSON"],
  opening: ["Opening…", "Đang mở…"],
  delete: ["Delete original", "Xóa tệp gốc"], deletePrompt: ["Delete this original?", "Xóa tệp gốc này?"], deleteConfirm: ["Delete", "Xóa"],
  deleting: ["Deleting", "Đang xóa"], deleted: ["Deleted", "Đã xóa"], undo: ["Undo", "Hoàn tác"], restoring: ["Restoring", "Đang khôi phục"],
  consequence: ["Removes the file and its record. You can undo for 8 seconds.", "Xóa tệp và bản ghi của nó. Bạn có thể hoàn tác trong 8 giây."],
  removedNote: ["was deleted.", "đã được xóa."], restoreError: ["Could not restore. The 8 second undo window may be over.", "Chưa khôi phục được. Có thể đã hết 8 giây hoàn tác."],
  close: ["Original", "Tệp gốc"], uploadedLabel: ["Uploaded", "Tải lên"], contentLabel: ["Contents", "Nội dung"], problemLabel: ["Problem", "Vấn đề"], fingerprintLabel: ["Fingerprint", "Dấu vân tay"], copyHash: ["Copy SHA-256", "Sao chép SHA-256"], copied: ["Copied", "Đã sao chép"], download: ["Download", "Tải xuống"],
  savedBytes: ["Stored bytes", "Dung lượng lưu"], scannedFiles: ["Scanned files", "Tệp đã quét"],
  history: ["Upload history", "Lịch sử tải lên"], selected: ["Selected original", "Tệp gốc đang chọn"],
  noSelection: ["Select an upload to inspect its saved original.", "Chọn một tệp để xem thông tin tệp gốc đã lưu."],
  integrity: ["SHA-256 verified before reopening", "Kiểm tra SHA-256 trước khi mở lại"],
  originalOnly: ["Originals only. Reopening scans the file again; export corrections or save progress before closing.", "Chỉ lưu tệp gốc. Mở lại sẽ quét lại tệp; hãy xuất bản đã sửa hoặc lưu tiến trình trước khi đóng."],
  sheets: ["sheets", "trang tính"], rows: ["data rows", "dòng dữ liệu"], sheet: ["sheet", "trang tính"], row: ["data row", "dòng dữ liệu"],
  describeReady: ["Saved and scanned. Ready to open in Excel or JSON.", "Đã lưu và quét xong. Sẵn sàng mở trong Excel hoặc JSON."], describeSaved: ["Saved. It has not been scanned yet.", "Đã lưu. Chưa quét xong."], describeFailed: ["Saved, but this workbook could not be scanned.", "Đã lưu, nhưng chưa quét được tệp này."],
  freshScan: ["Saved original · not scanned yet", "Đã lưu tệp gốc · chưa quét xong"],
  removeError: ["Could not delete. The file is still in Queue.", "Chưa xóa được. Tệp vẫn còn trong Queue."],
} as const;

export function useQueueCopy() {
  const { locale } = useWorkspaceI18n();
  return (key: keyof typeof copy) => copy[key][locale === "vi" ? 1 : 0];
}
