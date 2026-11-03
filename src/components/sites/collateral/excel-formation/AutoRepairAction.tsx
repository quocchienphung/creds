"use client";

import { useState } from "react";
import { Wand2 } from "lucide-react";
import { WorkspaceDialog } from "../../affectui-crm/WorkspaceDialog";
import { Button } from "../../uiarc/button/Button";
import type { CollateralEngine } from "../useCollateralEngine";
import { downloadBlob } from "../download";
import type { GeoAuditEntry, RepairProgress, RepairReport } from "./engine/auto-repair";
import type { GeoStatus, RepairPolicy } from "./engine/geo/address-recovery";
import "./auto-repair.css";

const STAGE: Record<RepairProgress["stage"], string> = { evidence_index: "Lập chỉ mục bằng chứng", candidate_generation: "Quét toàn bộ ô và tìm ứng viên", validation: "Kiểm tra các thay đổi", patch: "Vá bản sao Excel", package_verification: "Đối chiếu ô và cấu trúc XLSX", download: "Chuẩn bị tải xuống" };
type Result = { fileName: string; blob: Blob; report: RepairReport; geoAudit: GeoAuditEntry[]; geoUnavailable?: string };
const GEO_STATUS: Record<GeoStatus, string> = {
  verified_official: "Khớp đơn vị hành chính chính thức", verified_internal_match: "Khớp bản ghi sạch trong tệp", high_confidence_auto: "Độ tin cậy cao", contextual_auto: "Khớp tên trong dữ liệu địa lý theo ngữ cảnh",
  forced_guess: "Đoán buộc (không còn dấu ?)", fallback_lossy: "Bỏ ký tự (không tìm được âm tiết phù hợp)", needs_review: "Cần rà soát", unchanged_legitimate_punctuation: "Dấu hỏi thật, giữ nguyên", rejected_numeric_anchor_conflict: "Số có dấu ?, không sửa",
};
const GEO_FINAL: Record<NonNullable<RepairReport["geo"]>["finalStatus"], string> = {
  ADDRESS_SPANS_COMPLETED: "Đã khôi phục các đoạn địa chỉ.", ADDRESS_SPANS_COMPLETED_WITH_FORCED_GUESSES: "Đã khôi phục các đoạn địa chỉ, trong đó có từ được đoán buộc — chưa phải đã xác minh.",
  ADDRESS_SPANS_COMPLETED_WITH_LOSSY_FALLBACKS: "Đã khôi phục các đoạn địa chỉ, nhưng có chỗ phải bỏ ký tự vì không tìm được âm tiết phù hợp.", ADDRESS_SPANS_PARTIAL: "Còn từ trong địa chỉ chưa được khôi phục.", NO_ADDRESS_SPAN_REPAIRED: "Không có đoạn địa chỉ nào được khôi phục.",
};
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
export function AutoRepairAction({ engine, onPreview, disabled = false }: { engine: CollateralEngine; onPreview: () => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false), [running, setRunning] = useState(false), [cancelling, setCancelling] = useState(false);
  const [result, setResult] = useState<Result | null>(null), [failed, setFailed] = useState(false), [policy, setPolicy] = useState<RepairPolicy>("FORCE_NO_QUESTION_MARK");
  const p = engine.repairProgress;
  const reportFile = (r: Result) => ({ name: r.fileName.replace(/\.repaired\.xlsx$/i, ".repair-report.json"), blob: new Blob([JSON.stringify(r.report, null, 2) + "\n"], { type: "application/json" }) });
  async function run() {
    setOpen(true); setRunning(true); setCancelling(false); setResult(null); setFailed(false);
    const made = await engine.autoRepair(policy);
    setRunning(false);
    if (!made) { setFailed(true); return; }
    setResult(made);
    if (["REPAIRED_PARTIALLY", "REPAIRED_VERIFIED", "NO_REPAIR_APPLIED"].includes(made.report.status)) {
      setOpen(false); onPreview();
    }
  }
  const close = () => { if (running) { setCancelling(true); engine.cancelRepair(); } else setOpen(false); };
  return <>
    <Button variant="secondary" size="sm" className="cr-auto-trigger" loading={running} disabled={disabled || engine.busy && !running || engine.phase !== "ready" || !engine.result} onClick={() => { if (!running) { setResult(null); setFailed(false); } setOpen(true); }} title="Quét mọi trang tính và chuẩn bị bản sửa để bạn xem trước, xác nhận rồi xuất. Bản gốc được giữ nguyên."><Wand2 size={15} aria-hidden="true" />Tự động sửa Excel</Button>
    {result && <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>Kết quả lượt sửa</Button>}
    <WorkspaceDialog open={open} title="Tự động sửa Excel" onClose={close}>
      <div className="cr-auto-result" aria-busy={running}>
        <p>Xử lý tại thiết bị, không tải dữ liệu lên mạng. Bản gốc được giữ nguyên.</p>
        {!running && !result && <fieldset className="cr-auto-policy"><legend>Với đoạn địa chỉ bị mất ký tự</legend>
          <label><input type="radio" name="repair-policy" checked={policy === "FORCE_NO_QUESTION_MARK"} onChange={() => setPolicy("FORCE_NO_QUESTION_MARK")} /> Không để lại dấu ? — chọn phương án tốt nhất và ghi lại mọi chỗ đoán</label>
          <label><input type="radio" name="repair-policy" checked={policy === "SAFE_AUTO"} onChange={() => setPolicy("SAFE_AUTO")} /> An toàn — chỉ sửa chỗ đủ tin cậy, phần còn lại giữ nguyên dấu ?</label>
          <Button variant="primary" size="sm" onClick={() => void run()}>Bắt đầu sửa</Button>
        </fieldset>}
        {running && <div role="status" aria-live="polite">
          <p>{p ? STAGE[p.stage] : "Bắt đầu xử lý"}</p>
          {p && <><progress max={Math.max(1, p.totalRows)} value={p.processedRows} aria-label="Số dòng đã xử lý trong giai đoạn hiện tại" /><p>{p.processedRows.toLocaleString()} / {p.totalRows.toLocaleString()} dòng · {p.applied.toLocaleString()} đủ bằng chứng · {p.unresolved.toLocaleString()} cần xem lại · {(p.elapsedMs / 1000).toFixed(1)} s</p></>}
          <Button variant="secondary" size="sm" disabled={cancelling} onClick={close}>{cancelling ? "Đang hủy ở điểm kiểm tra tiếp theo…" : "Hủy"}</Button>
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
          <table className="ui-sb-table" aria-label="Kết quả theo trang tính"><thead><tr><th scope="col">Trang tính</th><th scope="col">Ô văn bản</th><th scope="col">Ô có ?</th><th scope="col">Ứng viên</th><th scope="col">Đã sửa</th><th scope="col">Cần rà soát</th><th scope="col">Đã xác minh trong tệp</th></tr></thead>
            <tbody>{result.report.sheets.map((sheet, i) => <tr key={sheet.sheetId}><td>{engine.result?.sheetScans[i]?.name ?? sheet.sheetId}</td><td>{sheet.metrics.textCellsScanned.toLocaleString()}</td><td>{sheet.metrics.cellsContainingQuestionMark.toLocaleString()}</td><td>{sheet.metrics.candidatesGenerated.toLocaleString()}</td><td>{(sheet.metrics.sourceVerified + sheet.metrics.modelAutoAccepted).toLocaleString()}</td><td>{sheet.metrics.unresolved.toLocaleString()}</td><td>{sheet.verifiedChanges.toLocaleString()}</td></tr>)}</tbody></table>
          {Object.keys(result.report.byReasonCode).length > 0 && <>
            <p>Vì sao một số ô chưa được sửa:</p>
            <ul>{Object.entries(result.report.byReasonCode).sort((a, b) => b[1] - a[1]).map(([code, n]) => <li key={code}>{REASON[code] ?? code}: {n.toLocaleString()} ô</li>)}</ul>
          </>}
          {result.report.metrics.modelAutoAccepted > 0 && <p>Các ô sửa bằng dự đoán là gợi ý của mô hình cục bộ (độ chính xác đo trên phần dữ liệu sạch của chính tệp: {(result.report.calibration.precision * 100).toFixed(2)}%, {result.report.calibration.heldOutWords.toLocaleString()} từ). Chúng KHÔNG được coi là đã xác minh: vẫn tính là cần rà soát trong Review and fix.</p>}
          <p>Còn {result.report.reviewBlocking.toLocaleString()} vấn đề nghiêm trọng trong rà soát. Cấu trúc XLSX và các ô đã được đối chiếu. Chưa kiểm tra tệp này bằng Excel desktop. JSON vẫn phải qua các điều kiện xuất riêng.</p>
          {result.report.geo && <div role="status" data-geo-status={result.report.geo.finalStatus}>
            <p>{GEO_FINAL[result.report.geo.finalStatus]} Chế độ: {result.report.geo.policy === "FORCE_NO_QUESTION_MARK" ? "không để lại dấu ?" : "an toàn"} · dữ liệu địa lý {result.report.geo.datasetVersion}.</p>
            <dl>
              <div><dt>Ô địa chỉ đã khôi phục</dt><dd>{result.report.geo.cellsRecovered.toLocaleString()}</dd></div>
              <div><dt>Từ được đoán buộc</dt><dd>{result.report.geo.forcedGuesses.toLocaleString()}</dd></div>
              <div><dt>Chỗ phải bỏ ký tự</dt><dd>{result.report.geo.lossyFallbacks.toLocaleString()}</dd></div>
              <div><dt>Từ trong địa chỉ chưa khôi phục</dt><dd>{result.report.geo.unresolvedInAddresses.toLocaleString()}</dd></div>
            </dl>
            <ul>{Object.entries(result.report.geo.byStatus).map(([status, n]) => <li key={status}>{GEO_STATUS[status as GeoStatus]}: {n.toLocaleString()} từ</li>)}</ul>
          </div>}
          {!result.report.geo && <p role="status">{result.geoUnavailable ? `Không nạp được dữ liệu địa lý (${result.geoUnavailable}); chỉ sửa theo bằng chứng trong tệp.` : "Dữ liệu địa lý không được dùng."}</p>}
          <p>Báo cáo chứa vị trí và lý do; không chứa nội dung ô hoặc mã định danh. Bản ghi kiểm tra địa chỉ (có nội dung ô) là tệp riêng, chỉ lưu trên máy này.</p>
          <p>Nhóm cùng tài sản có nội dung lỗi trùng trong tệp gốc: {result.report.duplicateGroups.withinAsset.groups.toLocaleString()} nhóm / {result.report.duplicateGroups.withinAsset.cells.toLocaleString()} ô. Duyệt một cách sửa trong Review and fix để áp dụng chung cho nhóm; các bản lỗi trùng nhau không tự chứng minh chữ cần điền.</p>
          <div className="ui-sb-actions"><Button variant="primary" size="sm" onClick={() => { setOpen(false); onPreview(); }}>Xem trước & xác nhận xuất</Button><Button variant="secondary" size="sm" onClick={() => { const file = reportFile(result); downloadBlob(file.name, file.blob); }}>Tải báo cáo lượt sửa</Button>{result.geoAudit.length > 0 && <Button variant="secondary" size="sm" onClick={() => downloadBlob(result.fileName.replace(/\.repaired\.xlsx$/i, ".address-audit.json"), new Blob([JSON.stringify(result.geoAudit, null, 2) + "\n"], { type: "application/json" }))}>Tải bản ghi kiểm tra địa chỉ</Button>}</div>
          <p>Chưa tự động tải Excel. Xem trước, sửa thêm nếu cần, rồi xác nhận xuất. Báo cáo và bản ghi địa chỉ phản ánh lượt tự động sửa ban đầu. Undo trong Review and fix hoàn tác cả lượt sửa.</p>
        </>}
      </div>
    </WorkspaceDialog>
  </>;
}
