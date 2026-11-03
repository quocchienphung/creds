"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export function WorkspaceDialog({ open, title, onClose, children, wide = false }: {
  open: boolean; title: string; onClose: () => void; children: ReactNode; wide?: boolean;
}) {
  const { t: uiText } = useWorkspaceI18n();
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    if (open && !ref.current?.open) ref.current?.showModal();
    if (!open && ref.current?.open) ref.current?.close();
  }, [open]);
  return <dialog ref={ref} className={`crm-dialog${wide ? " crm-dialog--wide" : ""}`} aria-labelledby={id} aria-modal="true" onCancel={onClose} onClose={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="crm-dialog__head"><h2 id={id}>{title}</h2><button type="button" aria-label={uiText("Close {0}", [title])} onClick={onClose}><X size={18} /></button></div>
    {children}
  </dialog>;
}
