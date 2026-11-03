"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { Copy, Plus, Trash2 } from "lucide-react";
import { useRef } from "react";
import { BottomSheet, useBottomSheetClose } from "../bottom-sheet/BottomSheet";
import { ConfirmMorph } from "../skilled/ui/ConfirmMorph";
import { countNodes, templates } from "./process-model";
import type { ProcessLibrary } from "./process-model";
import "./process-sheets.css";

const when = (stamp: string) => { const date = new Date(stamp); return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }); };

function LibraryList({ library, onSwitch, onDuplicate, onDelete, onUndo, onNew }: { library: ProcessLibrary; onSwitch: (id: string) => void; onDuplicate: (id: string) => void; onDelete: (id: string) => void; onUndo: () => void; onNew: () => void }) {
  const { t: uiText } = useWorkspaceI18n();
  const close = useBottomSheetClose();
  const list = useRef<HTMLUListElement>(null);
  // the row that asked is gone once it is deleted, and the focus would go with it: the sheet keeps it (Escape still closes the sheet)
  const remove = (id: string) => { onDelete(id); requestAnimationFrame(() => list.current?.querySelector<HTMLElement>(".proc-library__open")?.focus({ preventScroll: true })); };
  return <div className="psheet">
    <ul className="proc-library" ref={list}>
      {library.processes.map(doc => <li key={doc.id} data-active={doc.id === library.activeId ? "" : undefined}>
        <button type="button" className="proc-library__open" onClick={() => { onSwitch(doc.id); close(); }} aria-current={doc.id === library.activeId ? "true" : undefined}>
          <strong>{doc.name}</strong><span>{uiText(countNodes(doc.root))} {uiText(" task")}{uiText(countNodes(doc.root) === 1 ? "" : "s")} · {uiText(when(doc.updatedAt))}</span>
        </button>
        <button type="button" className="psheet-icon" aria-label={uiText("Duplicate {0}", [doc.name])} title={uiText("Duplicate")} onClick={() => onDuplicate(doc.id)}><Copy size={15} /></button>
        <ConfirmMorph size="sm" className="psheet-delete" label={uiText("Delete")} ariaLabel={`Delete ${doc.name}`} icon={<Trash2 size={15} />} prompt="Delete?" confirmLabel={uiText("Delete")} doneLabel="Deleted" disabled={library.processes.length < 2} onConfirm={() => remove(doc.id)} onUndo={onUndo} />
      </li>)}
    </ul>
    <div className="psheet-actions"><button type="button" className="psheet-button psheet-button--primary" onClick={() => { close(); onNew(); }}><Plus size={14} />{uiText("New process")}</button></div>
  </div>;
}

/** The saved processes, in a bottom sheet instead of a dialog. */
export function LibrarySheet({ open, onClose, library, onSwitch, onDuplicate, onDelete, onUndo, onNew }: {
  open: boolean; onClose: () => void; library: ProcessLibrary; onSwitch: (id: string) => void; onDuplicate: (id: string) => void; onDelete: (id: string) => void; onUndo: () => void; onNew: () => void;
}) {
  const { t: uiText } = useWorkspaceI18n();
  return <BottomSheet open={open} onOpenChange={next => { if (!next) onClose(); }} title={uiText("Saved processes")} description={uiText("{0} in this browser", [library.processes.length])} detents={[0.5, 0.9]} closeLabel="Close saved processes">
    <LibraryList library={library} onSwitch={onSwitch} onDuplicate={onDuplicate} onDelete={onDelete} onUndo={onUndo} onNew={onNew} />
  </BottomSheet>;
}

/** Choosing how a new process starts, in a bottom sheet instead of a dialog. */
export function NewProcessSheet({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (template: string) => void }) {
  const { t: uiText } = useWorkspaceI18n();
  return <BottomSheet open={open} onOpenChange={next => { if (!next) onClose(); }} title={uiText("New process")} description={uiText("Start from a blank page or from an example. You can change everything afterwards.")} detents={[0.55, 0.92]} closeLabel="Close new process">
    <div className="psheet">
      <ul className="proc-templates">
        <li><button type="button" onClick={() => onCreate("blank")}><strong>{uiText("Blank")}</strong><span>{uiText("One main task. Add the sub-tasks and AI blocks yourself.")}</span></button></li>
        {templates.map(template => <li key={template.id}><button type="button" onClick={() => onCreate(template.id)}><strong>{uiText(template.label)}</strong><span>{uiText(template.description)}</span></button></li>)}
      </ul>
    </div>
  </BottomSheet>;
}
