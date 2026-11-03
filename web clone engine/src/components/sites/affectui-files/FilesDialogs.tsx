"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useState } from "react";
import { Download, Copy, Save, Trash2 } from "lucide-react";
import { Combobox } from "../affectui-combobox/Combobox";
import { FileArtwork } from "./FileArtwork";
import { kindLabels } from "./files-model";
import type { FileAccess, FileKind, LibraryFile } from "./files-model";

const accessOptions = [{ value: "private", label: "Private", description: "Only you can access" }, { value: "shared", label: "Shared", description: "Available to this workspace" }];
export function FolderForm({ name = "", access = "private", names, onSave, onCancel, sharing = false, onCopy }: {
  name?: string; access?: FileAccess; names: string[]; onSave: (name: string, access: FileAccess) => void; onCancel: () => void; sharing?: boolean; onCopy?: () => void;
}) {
  const { t: uiText } = useWorkspaceI18n();
  const [visibility, setVisibility] = useState(access), [error, setError] = useState("");
  return <form className="files-form" onSubmit={event => {
    event.preventDefault(); const value = String(new FormData(event.currentTarget).get("name")).trim();
    if (!value) { setError("Enter a folder name."); return; }
    if (names.some(item => item !== name && item.toLowerCase() === value.toLowerCase())) { setError("A folder with this name already exists."); return; }
    onSave(value, visibility);
  }}>
    <label>{uiText("Folder name")}<input autoFocus name="name" defaultValue={name} required maxLength={80} readOnly={sharing} /></label>
    <Combobox label={uiText("Who can access")} value={visibility} onChange={value => setVisibility(value as FileAccess)} options={accessOptions} searchable={false} />
    <p className="files-hint">{uiText(visibility === "shared" ? uiText("People in this workspace can access this folder and its files.") : uiText("This folder and its files are private to you."))}</p>
    {error && <p className="files-error" role="alert">{uiText(error)}</p>}
    <div className="files-actions">{sharing && onCopy && <button type="button" className="files-button" onClick={onCopy}><Copy size={14} />{uiText("Copy link")}</button>}<button type="button" className="files-button" onClick={onCancel}>{uiText("Cancel")}</button><button type="submit" className="files-button files-button--primary">{uiText(name ? uiText("Save changes") : uiText("Create folder"))}</button></div>
  </form>;
}
export function TemplateForm({ onSave, onCancel }: { onSave: (name: string, kind: FileKind, text: string) => void; onCancel: () => void }) {
  const { t: uiText } = useWorkspaceI18n();
  const [kind, setKind] = useState<FileKind>("document");
  return <form className="files-form" onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget), name = String(data.get("name")).trim(); if (name) onSave(name, kind, String(data.get("content"))); }}>
    <label>{uiText("Template name")}<input name="name" autoFocus required maxLength={200} placeholder={uiText("e.g. Project brief")} /></label>
    <Combobox label={uiText("Type")} value={kind} onChange={value => setKind(value as FileKind)} options={["document", "spreadsheet"].map(value => ({ value, label: kindLabels[value as FileKind] }))} searchable={false} />
    <label>{uiText("Content")}<textarea name="content" rows={7} placeholder={uiText(kind === "spreadsheet" ? uiText("Name,Status,Owner") : uiText("Start writing your template…"))} /></label>
    <p className="files-hint">{uiText("Editable text template. Upload an existing file to keep its original format.")}</p>
    <div className="files-actions"><button type="button" className="files-button" onClick={onCancel}>{uiText("Cancel")}</button><button type="submit" className="files-button files-button--primary">{uiText("Create template")}</button></div>
  </form>;
}
export function FileEditor({ file, folders, folderAccess, onSave, onDownload, onDelete }: { file: LibraryFile; folders: string[]; folderAccess: Record<string, FileAccess>; onSave: (file: LibraryFile) => void; onDownload: () => void; onDelete: () => void }) {
  const { t: uiText } = useWorkspaceI18n();
  const [folder, setFolder] = useState(file.folder || ""), [visibility, setVisibility] = useState(file.access);
  return <form className="files-form" onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget), name = String(data.get("name")).trim(); if (name) onSave({ ...file, name, folder: folder || null, access: visibility, ...(file.text !== undefined ? { text: String(data.get("content")) } : {}) }); }}>
    <div className="files-detail-art"><FileArtwork kind={file.kind} /><span>{uiText(kindLabels[file.kind])} · {uiText(file.size ? uiText("{0} KB", [(file.size / 1024).toFixed(1)]) : uiText("Editable sample"))}<small>{uiText("Added by ")}{uiText(file.owner)}</small></span></div>
    <label>{uiText("File name")}<input name="name" defaultValue={file.name} required maxLength={200} /></label>
    <div className="files-form-columns"><Combobox label={uiText("Folder")} value={folder} onChange={setFolder} options={[{ value: "", label: "No folder" }, ...folders.map(value => ({ value, label: value }))]} /><Combobox label={uiText("Visibility")} value={folder ? Object.hasOwn(folderAccess, folder) ? folderAccess[folder] : "private" : visibility} disabled={!!folder} onChange={value => setVisibility(value as FileAccess)} options={accessOptions} searchable={false} /></div>
    {folder && <p className="files-hint">{uiText("Files in a folder inherit its sharing setting.")}</p>}
    {file.text !== undefined ? <label>{uiText("Content")}<textarea name="content" defaultValue={file.text} rows={9} /></label> : <p className="files-hint">{uiText("Your original file is stored intact. Download to open it in your preferred app.")}</p>}
    {file.text !== undefined && file.kind === "pdf" && <p className="files-hint">{uiText("This is independently authored sample text. Download exports a .txt file; upload a PDF for the original PDF format.")}</p>}
    <div className="files-actions"><button type="button" className="files-button files-button--danger" aria-label={uiText("Delete file")} onClick={onDelete}><Trash2 size={14} /></button><button type="button" className="files-button" onClick={onDownload}><Download size={14} />{uiText("Download")}</button><button type="submit" className="files-button files-button--primary"><Save size={14} />{uiText("Save changes")}</button></div>
  </form>;
}
