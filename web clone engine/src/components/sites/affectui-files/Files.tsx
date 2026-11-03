"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowDownUp, ArrowLeft, Check, ChevronDown, ChevronRight, FileUp, Filter, Grid2X2, List, LoaderCircle, LockKeyhole, MoreHorizontal, Plus, Search, Share2, Upload, Users, X } from "lucide-react";
import { useResource, useWorkspaceBackend } from "@/lib/workspace-backend/react";
import { resources } from "../workspace-resources";
import { WorkspaceDialog } from "../affectui-crm/WorkspaceDialog";
import { AssistantMenu } from "../affectui-assistant/AssistantMenu";
import { subscribeLocation } from "../guide-navigation/navigation-model";
import { FileArtwork, FolderArtwork } from "./FileArtwork";
import { FileEditor, FolderForm, TemplateForm } from "./FilesDialogs";
import { defaultFolders, emptyLibrary, fileKind, kindLabels, seedFileLibrary } from "./files-model";
import type { FileAccess, FileKind, LibraryFile } from "./files-model";
import { downloadLibraryFile, uploadLibraryFile } from "./file-transfer";
import "./files.css";

type FolderDialog = { kind: "create" } | { kind: "edit" | "share"; name: string };
interface PendingUpload { id: string; file: File; folder: string | null; template: boolean; error?: string }
function AccessIcon({ access }: { access: FileAccess }) { return access === "shared" ? <Users size={12} /> : <LockKeyhole size={12} />; }
function Tabs({ label, values, value, onChange }: { label: string; values: string[]; value: string; onChange: (value: string) => void }) {
  const { t: uiText } = useWorkspaceI18n();
  return <div className="files-tabs" role="tablist" aria-label={uiText(label)}>{values.map((item, i) => <button type="button" role="tab" aria-selected={value === item} tabIndex={value === item ? 0 : -1} key={item} onClick={() => onChange(item)} onKeyDown={event => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault(); const next = event.key === "Home" ? 0 : event.key === "End" ? values.length - 1 : (i + (event.key === "ArrowRight" ? 1 : -1) + values.length) % values.length;
    onChange(values[next]); event.currentTarget.parentElement?.querySelectorAll("button")[next]?.focus();
  }}>{uiText(item)}</button>)}</div>;
}
function SearchField({ target, value, onChange }: { target: string; value: string; onChange: (value: string) => void }) {
  const { t: uiText } = useWorkspaceI18n();
  return <label className="files-search"><Search size={15} /><input type="search" aria-label={uiText("Search {0}", [target])} placeholder={uiText("Search {0}...", [target])} value={value} onChange={event => onChange(event.target.value)} /></label>;
}

export function Files({ workspaceId, userName, notify }: { workspaceId: string; userName: string; notify: (text: string) => void }) {
  const { t: uiText } = useWorkspaceI18n();
  const backend = useWorkspaceBackend();
  const [folders, setFolders, folderSync] = useResource(resources.folders, workspaceId, backend.remote ? [] : workspaceId === "acme" ? defaultFolders : []);
  const [library, setLibrary, sync] = useResource(resources.fileLibrary, workspaceId, backend.remote ? emptyLibrary : seedFileLibrary(workspaceId));
  const folder = useSyncExternalStore(subscribeLocation, () => new URLSearchParams(window.location.search).get("folder"), () => null);
  const [folderTab, setFolderTab] = useState("All"), [fileTab, setFileTab] = useState("All");
  const [folderSearch, setFolderSearch] = useState(""), [fileSearch, setFileSearch] = useState("");
  const [folderDesc, setFolderDesc] = useState(false), [fileDesc, setFileDesc] = useState(false), [list, setList] = useState(false);
  const [types, setTypes] = useState<FileKind[]>([]);
  const [folderDialog, setFolderDialog] = useState<FolderDialog | null>(null), [newTemplate, setNewTemplate] = useState(false), [fileId, setFileId] = useState<string | null>(null);
  const [remove, setRemove] = useState<{ kind: "folder" | "file"; id: string } | null>(null), [help, setHelp] = useState(false), [dragging, setDragging] = useState(false);
  const [uploads, setUploads] = useState<PendingUpload[]>([]);
  const fileInput = useRef<HTMLInputElement>(null), controllers = useRef(new Map<string, AbortController>()), alive = useRef(true), dragDepth = useRef(0);

  useEffect(() => { alive.current = true; const active = controllers.current; return () => { alive.current = false; active.forEach(controller => controller.abort()); }; }, []);
  const loading = sync.phase === "loading" || folderSync.phase === "loading";
  const unavailable = loading || !!sync.error || !!folderSync.error;
  const editing = library.items.find(item => item.id === fileId);
  const selectedFolderExists = !folder || folders.includes(folder);
  const accessOf = (name: string): FileAccess => Object.hasOwn(library.folderAccess, name) ? library.folderAccess[name] : "private";
  const sortedFolders = folders.filter(name => name.toLowerCase().includes(folderSearch.toLowerCase()) && (folderTab === "All" || accessOf(name) === folderTab.toLowerCase())).slice().sort((a, b) => (folderDesc ? -1 : 1) * a.localeCompare(b));
  const visibleFiles = library.items.filter(item => (folder ? item.folder === folder : item.template) && item.name.toLowerCase().includes(fileSearch.toLowerCase()) && (fileTab === "All" || (fileTab === "Mine" ? item.mine : !item.mine && item.access === "shared")) && (!types.length || types.includes(item.kind))).slice().sort((a, b) => (fileDesc ? -1 : 1) * a.name.localeCompare(b.name));

  function openFolder(name: string | null) {
    const url = new URL(window.location.href); if (name) url.searchParams.set("folder", name); else url.searchParams.delete("folder");
    window.history.pushState({}, "", url); window.dispatchEvent(new PopStateEvent("popstate")); setFileSearch(""); setFileTab("All"); setTypes([]);
  }
  function saveFolder(name: string, access: FileAccess) {
    const previous = folderDialog && "name" in folderDialog ? folderDialog.name : null;
    setFolders(current => previous ? current.map(value => value === previous ? name : value) : [...current, name]);
    setLibrary(current => {
      const folderAccess = { ...current.folderAccess, [name]: access }; if (previous && previous !== name) delete folderAccess[previous];
      return { folderAccess, items: current.items.map(item => item.folder === (previous || name) ? { ...item, folder: name, access } : item) };
    });
    if (previous && folder === previous && name !== previous) openFolder(name);
    setFolderDialog(null); notify(previous ? "Folder updated" : "Folder created");
  }
  function saveFile(file: LibraryFile) {
    setLibrary(current => ({ ...current, items: current.items.map(item => item.id === file.id ? { ...file, access: file.folder ? accessOf(file.folder) : file.access } : item) }));
    setFileId(null); notify("File updated");
  }
  function confirmDelete() {
    if (!remove) return;
    if (remove.kind === "folder") {
      setFolders(current => current.filter(name => name !== remove.id));
      // Keep files as unfiled items instead of losing uploaded binaries when a folder is removed.
      setLibrary(current => { const folderAccess = { ...current.folderAccess }; delete folderAccess[remove.id]; return { folderAccess, items: current.items.map(item => item.folder === remove.id ? { ...item, folder: null, template: true, access: "private" } : item) }; });
      if (folder === remove.id) openFolder(null);
    } else { setLibrary(current => ({ ...current, items: current.items.filter(item => item.id !== remove.id) })); setFileId(null); }
    notify(remove.kind === "folder" ? "Folder removed. Its files are now private templates." : "File deleted"); setRemove(null);
  }
  async function download(file: LibraryFile) { try { await downloadLibraryFile(file); } catch (error) { notify(error instanceof Error ? error.message : "Could not download this file."); } }
  async function copyFolderLink(name: string) {
    try { const url = new URL(window.location.href); url.searchParams.set("section", "files"); url.searchParams.set("folder", name); await navigator.clipboard.writeText(url.href); notify("Folder link copied. Access follows your saved sharing setting."); }
    catch { notify("Could not copy the link. You can copy this page’s URL from your browser."); }
  }
  async function performUpload(entry: PendingUpload) {
    const controller = new AbortController(); controllers.current.set(entry.id, controller);
    setUploads(current => current.map(item => item.id === entry.id ? { ...item, error: undefined } : item));
    try {
      const stored = await uploadLibraryFile(backend, workspaceId, entry.file, controller.signal);
      if (!alive.current || controller.signal.aborted) return;
      const file: LibraryFile = { id: entry.id, name: entry.file.name, kind: fileKind(entry.file.name, entry.file.type), owner: userName, mine: true, access: entry.folder ? accessOf(entry.folder) : "private", folder: entry.folder, template: entry.template, size: entry.file.size, mime: entry.file.type || "application/octet-stream", createdAt: new Date().toISOString(), ...stored };
      setLibrary(current => ({ ...current, items: [...current.items.filter(item => item.id !== file.id), file] }));
      setUploads(current => current.filter(item => item.id !== entry.id)); notify(`${entry.file.name} uploaded`);
    } catch (error) {
      if (!alive.current || controller.signal.aborted) return;
      setUploads(current => current.map(item => item.id === entry.id ? { ...item, error: error instanceof Error ? error.message : "Upload failed. Try again." } : item));
    } finally { controllers.current.delete(entry.id); }
  }
  function queueFiles(files: File[], target = { folder, template: !folder }) {
    if (unavailable) { notify("Wait for the file library to load, or retry the connection."); return; }
    if (files.length > 10) { notify("Upload up to 10 files at a time."); return; }
    const entries = files.map(file => ({ id: crypto.randomUUID(), file, ...target }));
    setUploads(current => [...current, ...entries]); for (const entry of entries) void performUpload(entry);
  }
  function chooseFiles() { fileInput.current?.click(); }
  const typeMenu = <AssistantMenu title={uiText("File type")} className="files-tool files-tool--label" active={!!types.length} label={uiText(<><Filter size={15} />{types.length ? uiText("Type · {0}", [types.length]) : uiText("Type")}<ChevronDown size={12} /></>)}>{close => <>
    <button type="button" role="menuitem" className="ui-as-menu__item" onClick={() => { setTypes([]); close(); }}>{uiText("Clear all")}</button>
    {(["document", "pdf", "spreadsheet", "image", "other"] as FileKind[]).map(type => <button type="button" role="menuitemcheckbox" aria-checked={types.includes(type)} className="ui-as-menu__item" key={type} onClick={() => setTypes(current => current.includes(type) ? current.filter(item => item !== type) : [...current, type])}><span className="ui-as-menu__label">{uiText(kindLabels[type])}</span>{types.includes(type) && <Check size={14} />}</button>)}
  </>}</AssistantMenu>;

  return <div className="files-page" data-dragging={dragging || undefined} aria-busy={loading} onDragEnter={event => { if (!event.dataTransfer.types.includes("Files")) return; event.preventDefault(); dragDepth.current++; setDragging(true); }} onDragOver={event => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); }} onDragLeave={() => { if (--dragDepth.current <= 0) { dragDepth.current = 0; setDragging(false); } }} onDrop={event => { event.preventDefault(); dragDepth.current = 0; setDragging(false); if (event.dataTransfer.files.length) queueFiles([...event.dataTransfer.files]); }}>
    <input ref={fileInput} type="file" multiple hidden onChange={event => { queueFiles([...event.target.files || []]); event.target.value = ""; }} />
    {dragging && <div className="files-drop"><Upload size={32} /><strong>{uiText("Drop files to upload")}</strong><span>{uiText(folder || uiText("Add to file templates"))}</span></div>}
    {folder ? <><nav className="files-breadcrumb" aria-label={uiText("Breadcrumb")}><button type="button" onClick={() => openFolder(null)}>{uiText("Files")}</button><ChevronRight size={12} /><span>{folder}</span></nav><div className="files-folder-heading"><FolderArtwork /><h1>{folder}</h1><div className="files-heading-actions"><AssistantMenu title={uiText("Folder actions")} className="files-tool" label={uiText(<><MoreHorizontal size={17} /><span className="sr-only">{uiText("Folder actions")}</span></>)} end>{close => <><button type="button" role="menuitem" className="ui-as-menu__item" disabled={!selectedFolderExists || unavailable} onClick={() => { close(); setFolderDialog({ kind: "edit", name: folder }); }}>{uiText("Edit folder")}</button><button type="button" role="menuitem" className="ui-as-menu__item" disabled={!selectedFolderExists || unavailable} onClick={() => { close(); setRemove({ kind: "folder", id: folder }); }}>{uiText("Delete folder")}</button></>}</AssistantMenu><button type="button" className="files-button" disabled={!selectedFolderExists || unavailable} onClick={() => setFolderDialog({ kind: "share", name: folder })}><Share2 size={14} />{uiText("Share")}</button><button type="button" className="files-button files-button--primary" disabled={!selectedFolderExists || unavailable} onClick={() => chooseFiles()}><Plus size={15} />{uiText("Upload files")}</button></div></div></> : <><h1 className="files-title">{uiText("Files")}</h1><p className="files-subtitle">{uiText("See files you recently used in chats and manage files saved in folders. ")}<button type="button" onClick={() => setHelp(true)}>{uiText("Learn more")}</button></p></>}
    {(sync.error || folderSync.error) && <div className="files-error-banner" role="alert"><span>{uiText(sync.error?.message || folderSync.error?.message)}</span><button type="button" onClick={() => { sync.retry(); folderSync.retry(); }}>{uiText("Retry")}</button></div>}
    {loading && <p className="files-hint" role="status"><LoaderCircle size={14} className="files-spin" />{uiText("Loading your files…")}</p>}
    {!folder && <section className="files-section" aria-labelledby="files-folders-title"><h2 id="files-folders-title">{uiText("Folders")}</h2><div className="files-toolbar"><Tabs label={uiText("Folder visibility")} values={["All", "Shared", "Private"]} value={folderTab} onChange={setFolderTab} /><div className="files-toolbar-right"><button type="button" className="files-tool" aria-label={uiText(folderDesc ? uiText("Sort folders A to Z") : uiText("Sort folders Z to A"))} onClick={() => setFolderDesc(!folderDesc)}><ArrowDownUp size={15} /></button><div className="files-view" role="group" aria-label={uiText("Folder view")}><button type="button" aria-label={uiText("Grid view")} aria-pressed={!list} onClick={() => setList(false)}><Grid2X2 size={15} /></button><button type="button" aria-label={uiText("List view")} aria-pressed={list} onClick={() => setList(true)}><List size={15} /></button></div><SearchField target="folders" value={folderSearch} onChange={setFolderSearch} /><button type="button" className="files-button files-button--primary" disabled={unavailable} onClick={() => setFolderDialog({ kind: "create" })}><Plus size={15} />{uiText("Create folder")}</button></div></div>
      <div className="files-folders" data-view={list ? "list" : "grid"}>{sortedFolders.map(name => <div className="files-folder-card" key={name}><button type="button" className="files-folder-open" onClick={() => openFolder(name)}><FolderArtwork /><span><b>{name}</b><span className="files-meta"><AccessIcon access={accessOf(name)} />{uiText(accessOf(name) === "shared" ? uiText("Shared") : uiText("Private"))} · {uiText(library.items.filter(item => item.folder === name).length)} {uiText(" files")}</span></span></button></div>)}</div>
      {!loading && !sortedFolders.length && <div className="files-empty"><FolderArtwork /><strong>{uiText(folders.length ? uiText("No matching folders") : uiText("Your folders live here"))}</strong><p>{uiText(folders.length ? uiText("Try another search or visibility filter.") : uiText("Create a folder to keep files and chats together."))}</p>{!!folders.length && <button type="button" onClick={() => { setFolderSearch(""); setFolderTab("All"); }}>{uiText("Clear filters")}</button>}</div>}
    </section>}
    {folder && !selectedFolderExists && !loading ? <div className="files-empty"><strong>{uiText("Folder not found")}</strong><p>{uiText("It may have been renamed or removed from this workspace.")}</p><button type="button" onClick={() => openFolder(null)}><ArrowLeft size={14} />{uiText("Back to files")}</button></div> : <section className={`files-section${folder ? " files-section--contents" : ""}`} aria-label={uiText(folder ? uiText("Folder files") : uiText("File templates"))}>
      {!folder && <h2>{uiText("File templates")}</h2>}<div className="files-toolbar"><Tabs label={uiText("File ownership")} values={["All", "Mine", "Shared with me"]} value={fileTab} onChange={setFileTab} /><div className="files-toolbar-right">{uiText(typeMenu)}<button type="button" className="files-tool" aria-label={uiText(fileDesc ? uiText("Sort files A to Z") : uiText("Sort files Z to A"))} onClick={() => setFileDesc(!fileDesc)}><ArrowDownUp size={15} /></button><SearchField target={folder ? "files" : "templates"} value={fileSearch} onChange={setFileSearch} />{!folder && <AssistantMenu title={uiText("Add template")} className="files-button" end label={uiText(<><Plus size={15} />{uiText("Add template")}</>)}>{close => <><button type="button" role="menuitem" className="ui-as-menu__item" disabled={unavailable} onClick={() => { close(); setNewTemplate(true); }}><Plus size={14} />{uiText("Create template")}</button><button type="button" role="menuitem" className="ui-as-menu__item" disabled={unavailable} onClick={() => { close(); chooseFiles(); }}><FileUp size={14} />{uiText("Upload template")}</button></>}</AssistantMenu>}</div></div>
      <div className="files-grid">{visibleFiles.map(file => <button type="button" className="files-template" key={file.id} onClick={() => setFileId(file.id)}><span className="files-template-preview"><FileArtwork kind={file.kind} /></span><b>{file.name}</b><span className="files-meta">{uiText(kindLabels[file.kind])} · {uiText(file.owner)} · <AccessIcon access={file.access} />{uiText(file.access === "shared" ? uiText("Shared") : uiText("Private"))}</span></button>)}</div>
      {!loading && !visibleFiles.length && <div className="files-empty"><FileUp size={28} /><strong>{uiText(fileSearch || types.length || fileTab !== "All" ? uiText("No matching files") : uiText("A home for your files"))}</strong><p>{uiText(fileSearch || types.length || fileTab !== "All" ? uiText("Try another search or clear the filters.") : uiText("Drop files here or upload from your device."))}</p><button type="button" disabled={unavailable} onClick={() => { if (fileSearch || types.length || fileTab !== "All") { setFileSearch(""); setTypes([]); setFileTab("All"); } else chooseFiles(); }}>{uiText(fileSearch || types.length || fileTab !== "All" ? uiText("Clear filters") : uiText("Upload files"))}</button></div>}
    </section>}
    {!!uploads.length && <div className="files-uploads" aria-live="polite">{uploads.map(entry => <div key={entry.id}>{entry.error ? <FileUp size={16} /> : <LoaderCircle size={16} className="files-spin" />}<span><b>{entry.file.name}</b><small role={entry.error ? "alert" : undefined}>{uiText(entry.error || uiText("Uploading…"))}</small></span>{entry.error && <button type="button" onClick={() => void performUpload(entry)}>{uiText("Retry")}</button>}<button type="button" aria-label={uiText("Cancel upload {0}", [entry.file.name])} onClick={() => { controllers.current.get(entry.id)?.abort(); setUploads(current => current.filter(item => item.id !== entry.id)); }}><X size={15} /></button></div>)}</div>}
    <WorkspaceDialog open={!!folderDialog} title={uiText(folderDialog?.kind === "share" ? uiText("Share folder") : folderDialog?.kind === "edit" ? uiText("Edit folder") : uiText("Create folder"))} onClose={() => setFolderDialog(null)}>{folderDialog && <FolderForm key={"name" in folderDialog ? folderDialog.name : "create"} name={"name" in folderDialog ? folderDialog.name : ""} access={"name" in folderDialog ? accessOf(folderDialog.name) : "private"} names={folders} onSave={saveFolder} onCancel={() => setFolderDialog(null)} sharing={folderDialog.kind === "share"} onCopy={"name" in folderDialog ? () => void copyFolderLink(folderDialog.name) : undefined} />}</WorkspaceDialog>
    <WorkspaceDialog open={newTemplate} title={uiText("Create template")} onClose={() => setNewTemplate(false)}>{newTemplate && <TemplateForm onCancel={() => setNewTemplate(false)} onSave={(name, kind, text) => { setLibrary(current => ({ ...current, items: [...current.items, { id: crypto.randomUUID(), name, kind, owner: userName, mine: true, access: "private", folder: null, template: true, size: new Blob([text]).size, mime: "text/plain", text, createdAt: new Date().toISOString() }] })); setNewTemplate(false); notify("Template created"); }} />}</WorkspaceDialog>
    <WorkspaceDialog open={!!editing} title={uiText("File details")} onClose={() => setFileId(null)}>{editing && <FileEditor key={editing.id} file={editing} folders={folders} folderAccess={library.folderAccess} onSave={saveFile} onDownload={() => void download(editing)} onDelete={() => setRemove({ kind: "file", id: editing.id })} />}</WorkspaceDialog>
    <WorkspaceDialog open={!!remove} title={uiText(remove?.kind === "folder" ? uiText("Delete folder?") : uiText("Delete file?"))} onClose={() => setRemove(null)}><p>{uiText(remove?.kind === "folder" ? uiText("The folder will be removed. Its files will be kept as private file templates.") : uiText("This file will be removed from your library. This action cannot be undone."))}</p><div className="files-actions"><button type="button" className="files-button" onClick={() => setRemove(null)}>{uiText("Cancel")}</button><button type="button" className="files-button files-button--danger" onClick={confirmDelete}>{uiText("Delete ")}{uiText(remove?.kind)}</button></div></WorkspaceDialog>
    <WorkspaceDialog open={help} title={uiText("Files in your workspace")} onClose={() => setHelp(false)}><p>{uiText("Organize documents in folders, reuse file templates, and choose the same folders when starting a chat. Search, filter, or switch to list view to find what you need.")}</p><p>{uiText("Upload up to 10 files at a time, 20 MB each. Private items are personal; shared items belong to your workspace. Your backend controls access when connected.")}</p><p>{uiText(backend.remote ? uiText("Your workspace backend stores files and changes.") : uiText("Files are stored in this browser on this device. Connect your workspace backend to sync across devices."))}</p></WorkspaceDialog>
  </div>;
}
