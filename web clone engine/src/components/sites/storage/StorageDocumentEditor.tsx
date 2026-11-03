"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useId, useState } from "react";
import { ActionButton } from "../skilled/ui/ActionButton";
import { StorageButton } from "./StorageControls";
import { StorageCategorySelect } from "./StorageCategorySelect";
import { draftOfDocument, inspectDocumentDraft, isDocumentDirty, splitName, type DocumentDraft } from "./storage-edit";
import type { StorageDocument } from "./storage-model";

/**
 * Name and knowledge area of one document, with Save changes (the Action button: it stays on Saving until the library metadata is stored and verified).
 * Keyed by the document, so opening another one starts from its stored values.
 */
export function StorageDocumentEditor({ document, disabled = false, onSave }: { document: StorageDocument; disabled?: boolean; onSave: (draft: DocumentDraft) => Promise<void> }) {
  const { t: uiText } = useWorkspaceI18n();
  const [draft, setDraft] = useState<DocumentDraft>(() => draftOfDocument(document));
  const [failure, setFailure] = useState("");
  const nameId = useId(), hintId = useId();
  const { ext } = splitName(document.name);
  const inspected = inspectDocumentDraft(document, draft);
  const dirty = isDocumentDirty(document, draft);
  const canSave = !disabled && dirty && inspected.ok;
  function change(next: DocumentDraft) { setDraft(next); setFailure(""); }
  return <section className="stg-edit" aria-label={uiText("Edit document details")} data-dirty={dirty || undefined}>
    <div className="stg-edit-fields">
      <div className="stg-edit-field"><label htmlFor={nameId}>{uiText("Name")}</label>
        <div className="stg-edit-name" data-invalid={!inspected.ok || undefined}>
          <input id={nameId} value={draft.base} maxLength={240} disabled={disabled} spellCheck={false} autoComplete="off" aria-invalid={!inspected.ok || undefined} aria-describedby={hintId} onChange={event => change({ ...draft, base: event.target.value })}/>
          {ext && <span className="stg-edit-ext" aria-hidden="true">{uiText(ext)}</span>}
        </div>
      </div>
      <label className="stg-category-field">{uiText("Knowledge area")}<StorageCategorySelect label={uiText("Document knowledge area")} value={draft.category} disabled={disabled} onChange={category => change({ ...draft, category })}/></label>
    </div>
    <p id={hintId} className="stg-edit-hint" role={inspected.ok && !failure ? undefined : "alert"} data-error={!inspected.ok || !!failure || undefined}>{uiText(failure || (inspected.ok ? (ext ? `The file stays ${ext.slice(1).toUpperCase()}; only its name and area change here.` : "Only the name and area change here.") : inspected.error))}</p>
    <div className="stg-edit-actions">
      <span aria-live="polite">{uiText(dirty ? uiText("Unsaved changes") : "")}</span>
      {dirty && <StorageButton variant="ghost" size="sm" disabled={disabled} onClick={() => change(draftOfDocument(document))}>{uiText("Discard")}</StorageButton>}
      <ActionButton size="sm" label={uiText("Save changes")} disabled={!canSave} onAction={() => onSave(draft)} onActionError={error => setFailure(error instanceof Error ? error.message : "Couldn’t save. Please retry.")}/>
    </div>
  </section>;
}
