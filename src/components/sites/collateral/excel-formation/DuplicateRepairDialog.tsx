"use client";
import { useState } from "react";
import { WorkspaceDialog } from "../../affectui-crm/WorkspaceDialog";
import type { DuplicatePlan } from "./engine/duplicate-repairs";
import "./auto-repair.css";

/** A confirmation overlay only: the existing suggestion panel does not change its geometry. */
export function DuplicateRepairDialog({ plan, busy, onClose, onSingle, onAll }: { plan: DuplicatePlan; busy: boolean; onClose: () => void; onSingle: () => Promise<boolean>; onAll: () => Promise<boolean> }) {
  const [failed, setFailed] = useState(false);
  async function apply(all: boolean) {
    setFailed(false);
    try { if (!(await (all ? onAll() : onSingle()))) setFailed(true); } catch { setFailed(true); }
  }
  return <WorkspaceDialog open title="Sửa chung các dòng trùng lỗi" onClose={() => { if (!busy) onClose(); }}>
    <div className="cr-auto-result" aria-busy={busy}>
      <p>Phát hiện <strong>{plan.rows.length} dòng / {plan.cells} ô</strong> cùng chi nhánh, khách hàng và mã tài sản, có nội dung lỗi giống hệt nhau.</p>
      <p>Dòng Excel: {plan.rows.slice(0, 16).join(", ")}{plan.rows.length > 16 ? `… (tổng ${plan.rows.length} dòng)` : ""}. {plan.hiddenRows > 0 ? `Bao gồm ${plan.hiddenRows} dòng ẩn.` : ""}</p>
      <p>Áp dụng giá trị bạn vừa duyệt cho cả nhóm. Các tài sản khác và nội dung khác sẽ giữ nguyên. Undo hoàn tác cả lượt sửa.</p>
      {(plan.skippedEdited > 0 || plan.skippedExceptions > 0) && <p>Bỏ qua {plan.skippedEdited} ô đã chỉnh riêng và {plan.skippedExceptions} ô đã được chấp nhận ngoại lệ.</p>}
      {failed && <p role="alert">Không áp dụng được nhóm. Kiểm tra thông báo lỗi và xem lại nhóm; không có thay đổi một phần.</p>}
      <div className="ui-sb-actions">
        <button type="button" className="ui-button" data-variant="primary" data-size="sm" disabled={busy} onClick={() => void apply(true)}><span className="ui-button__label">Áp dụng cho {plan.rows.length} dòng</span></button>
        <button type="button" className="ui-button" data-variant="secondary" data-size="sm" disabled={busy} onClick={() => void apply(false)}><span className="ui-button__label">Chỉ dòng đang chọn</span></button>
        <button type="button" className="ui-button" data-variant="ghost" data-size="sm" disabled={busy} onClick={onClose}><span className="ui-button__label">Hủy</span></button>
      </div>
    </div>
  </WorkspaceDialog>;
}
