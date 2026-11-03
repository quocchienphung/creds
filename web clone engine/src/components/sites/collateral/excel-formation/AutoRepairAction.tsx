"use client";

import { useState } from "react";
import { Wand2 } from "lucide-react";
import { WorkspaceDialog } from "../../affectui-crm/WorkspaceDialog";
import type { CollateralEngine } from "../useCollateralEngine";
import { downloadBlob } from "../download";
import type { RepairProgress, RepairReport } from "./engine/auto-repair";
import "./auto-repair.css";

const STAGE: Record<RepairProgress["stage"], string> = { evidence_index: "Lập chỉ mục bằng chứng", candidate_generation: "Quét toàn bộ ô và tìm ứng viên", validation: "Kiểm tra các thay đổi", patch: "Vá bản sao Excel", package_verification: "Đối chiếu ô và cấu trúc XLSX", download: "Chuẩn bị tải xuống" };
type Result = { fileName: string; blob: Blob; report: RepairReport };
const OUTCOME: Record<RepairReport["status"], string> = {
  REPAIRED_VERIFIED: "Đã sửa và đối chiếu: không còn ô lỗi chưa giải quyết.",
  REPAIRED_PARTIALLY: "Đã sửa một phần — vẫn còn ô chưa giải quyết và cần rà soát.",
  NO_REPAIR_APPLIED: "Chưa sửa được ô nào. Tệp tải về là bản gốc, được gắn nhãn “chưa sửa”.",
  FAILED_VALIDATION: "Không đạt kiểm tra — không có tệp sửa nào được tạo.",
  CANCELLED: "Đã hủy.",
};
const REASON: Record<string, string> = {
  NO_CANDIDATE: "Không có ứng viên", LOW_CONFIDENCE: "Độ tin cậy chưa đủ", AMBIGUOUS: "Nhiều đáp án", PROTECTED_ROLE: "Trường được bảo vệ (tên, mã, số)", FORMULA: "Ô công thức",
  CONFLICT: "Nguồn sạch mâu thuẫn", PUNCTUATION: "Có thể là dấu câu thật", UNSUPPORTED_STRUCTURE: "Cấu trúc ô chưa hỗ trợ", EXISTING_REVIEW: "Đã được rà soát thủ công",
  CALIBRATION_UNAVAILABLE: "Chưa hiệu chuẩn được độ tin cậy", PARTIAL_WORDS: "Còn từ chưa khôi phục được trong ô đã sửa một phần",
};

/** Header action and a dialog: no changes to the measured suggestion layout. */
export function AutoRepairAction({ engine }: { engine: CollateralEngine }) {
  const [open, setOpen] = useState(false), [running, setRunning] = useState(false), [cancelling, setCancelling] = useState(false);
  const [result, setResult] = useState<Result | null>(null), [failed, setFailed] = useState(false);
  const p = engine.repairProgress;
  const reportFile = (r: Result) => ({ name: r.fileName.replace(/\.repaired\.xlsx$/i, ".repair-report.json"), blob: new Blob([JSON.stringify(r.report, null, 2) + "\n"], { type: "application/json" }) });
  async function run() {
    setOpen(true); setRunning(true); setCancelling(false); setResult(null); setFailed(false);
    const made = await engine.autoRepair();
    setRunning(false);
    if (!made) { setFailed(true); return; }
    setResult(made);
    // A job that changed no cell never starts a download by itself: the person decides what to do with the untouched copy.
    if (made.report.status === "REPAIRED_PARTIALLY" || made.report.status === "REPAIRED_VERIFIED") {
      downloadBlob(made.fileName, made.blob);
      const report = reportFile(made); downloadBlob(report.name, report.blob);
    }
  }
  const close = () => { if (running) { setCancelling(true); engine.cancelRepair(); } else setOpen(false); };
  return <>
    <button type="button" className="ui-button cr-auto-trigger" data-variant="secondary" data-size="sm" disabled={engine.busy || engine.phase !== "ready" || !engine.result?.profile.primary || !!engine.result?.blockers.length} onClick={() => void run()} title="Sửa ký tự ? bằng nguồn sạch cùng tài sản hoặc dự đoán đã hiệu chuẩn từ chính tệp. Bản gốc không bị thay đổi."><Wand2 size={14} /><span className="ui-button__label">Tự động sửa Excel</span></button>
    <WorkspaceDialog open={open} title="Tự động sửa Excel" onClose={close}>
      <div className="cr-auto-result" aria-busy={running}>
        <p>Xử lý tại thiết bị, không tải dữ liệu lên mạng. Bản gốc được giữ nguyên.</p>
        {running && <div role="status" aria-live="polite">
          <p>{p ? STAGE[p.stage] : "Bắt đầu xử lý"}</p>
          {p && <><progress max={Math.max(1, p.totalRows)} value={p.processedRows} aria-label="Số dòng đã xử lý trong giai đoạn hiện tại" /><p>{p.processedRows.toLocaleString()} / {p.totalRows.toLocaleString()} dòng · {p.applied.toLocaleString()} đủ bằng chứng · {p.unresolved.toLocaleString()} cần xem lại · {(p.elapsedMs / 1000).toFixed(1)} s</p></>}
          <button type="button" className="ui-button" data-size="sm" disabled={cancelling} onClick={close}><span className="ui-button__label">{cancelling ? "Đang hủy ở điểm kiểm tra tiếp theo…" : "Hủy"}</span></button>
        </div>}
        {failed && <p role="alert">{engine.failure?.message ?? "Không tạo tệp. Bản gốc và lịch sử rà soát được giữ nguyên."}</p>}
        {result && <>
          <p role="status" data-repair-status={result.report.status}>{OUTCOME[result.report.status]}</p>
          <dl>
            <div><dt>Trang tính đã quét</dt><dd>{result.report.metrics.sheetsScanned.toLocaleString()}</dd></div>
            <div><dt>Ô chứa dấu ?</dt><dd>{result.report.metrics.cellsContainingQuestionMark.toLocaleString()}</dd></div>
            <div><dt>Ô nghi bị hỏng ký tự</dt><dd>{result.report.metrics.suspectedCorruptions.toLocaleString()}</dd></div>
            <div><dt>Sửa từ nguồn sạch (đã xác minh)</dt><dd>{result.report.metrics.sourceVerified.toLocaleString()}</dd></div>
            <div><dt>Sửa bằng dự đoán đã hiệu chuẩn (chưa xác minh)</dt><dd>{result.report.metrics.modelAutoAccepted.toLocaleString()}</dd></div>
            <div><dt>Ô thực sự thay đổi trong tệp xuất</dt><dd>{result.report.metrics.outputCellsChanged.toLocaleString()}</dd></div>
            <div><dt>Ô ngoài dự kiến bị thay đổi</dt><dd>{result.report.metrics.outputUnexpectedChanges.toLocaleString()}</dd></div>
            <div><dt>Ô chưa giải quyết</dt><dd>{result.report.unresolved.toLocaleString()}</dd></div>
            <div><dt>Ô được bảo vệ / bỏ qua</dt><dd>{result.report.protected.toLocaleString()}</dd></div>
            <div><dt>Ô đã kiểm kê</dt><dd>{result.report.cellsAccounted.toLocaleString()}</dd></div>
            <div><dt>Thời gian thực đo</dt><dd>{(result.report.timings.total / 1000).toFixed(2)} s</dd></div>
          </dl>
          {Object.keys(result.report.byReasonCode).length > 0 && <>
            <p>Vì sao một số ô chưa được sửa:</p>
            <ul>{Object.entries(result.report.byReasonCode).sort((a, b) => b[1] - a[1]).map(([code, n]) => <li key={code}>{REASON[code] ?? code}: {n.toLocaleString()} ô</li>)}</ul>
          </>}
          {result.report.metrics.modelAutoAccepted > 0 && <p>Các ô sửa bằng dự đoán là gợi ý của mô hình cục bộ (độ chính xác đo trên phần dữ liệu sạch của chính tệp: {(result.report.calibration.precision * 100).toFixed(2)}%, {result.report.calibration.heldOutWords.toLocaleString()} từ). Chúng KHÔNG được coi là đã xác minh: vẫn tính là cần rà soát trong Review and fix.</p>}
          <p>Còn {result.report.reviewBlocking.toLocaleString()} vấn đề nghiêm trọng trong rà soát. Cấu trúc XLSX và các ô đã được đối chiếu. Chưa kiểm tra tệp này bằng Excel desktop. JSON vẫn phải qua các điều kiện xuất riêng.</p>
          <p>Báo cáo chứa vị trí và lý do; không chứa nội dung ô hoặc mã định danh.</p>
          <p>Nhóm cùng tài sản có nội dung lỗi trùng trong tệp gốc: {result.report.duplicateGroups.withinAsset.groups.toLocaleString()} nhóm / {result.report.duplicateGroups.withinAsset.cells.toLocaleString()} ô. Duyệt một cách sửa trong Review and fix để áp dụng chung cho nhóm; các bản lỗi trùng nhau không tự chứng minh chữ cần điền.</p>
          <div className="ui-sb-actions"><button type="button" className="ui-button" data-size="sm" onClick={() => downloadBlob(result.fileName, result.blob)}><span className="ui-button__label">{result.report.status === "NO_REPAIR_APPLIED" ? "Tải bản gốc (chưa sửa)" : "Tải lại Excel"}</span></button><button type="button" className="ui-button" data-variant="secondary" data-size="sm" onClick={() => { const file = reportFile(result); downloadBlob(file.name, file.blob); }}><span className="ui-button__label">Tải báo cáo sửa</span></button></div>
          <p>Nếu trình duyệt chặn tải nhiều tệp, dùng hai nút trên. Undo trong Review and fix hoàn tác cả lượt sửa.</p>
        </>}
      </div>
    </WorkspaceDialog>
  </>;
}
