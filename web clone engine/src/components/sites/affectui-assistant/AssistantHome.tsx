"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useEffect, useRef, useState } from "react";
import { Check, Copy, File, History, LoaderCircle, MessageSquarePlus, RefreshCw, Square, Trash2, X } from "lucide-react";
import { useResource } from "@/lib/workspace-backend/react";
import { resources } from "../workspace-resources";
import { WorkspaceDialog } from "../affectui-crm/WorkspaceDialog";
import { AssistantMenu } from "./AssistantMenu";
import { ModelPicker } from "../affectui-model-picker/ModelPicker";
import { assistantModels } from "./assistant-models";
import type { AssistantProvider } from "./assistant-models";
import { createConfiguredAssistantApi } from "./assistant-api";
import type { AssistantAttachment, AssistantChatApi, AssistantIntegration } from "./assistant-types";
import { assistantError, useAssistantChat } from "./useAssistantChat";
import { folderMark } from "./folder-mark";
import icons from "./icons.json";
import "./assistant-reference.css";
import "./assistant-overrides.css";

const plugins = [{ id: "web-search", name: "Web search", description: "Look things up while answering" }, { id: "canvas", name: "Canvas", description: "Write and edit side by side" }, { id: "image-generation", name: "Image generation", description: "Create images from a prompt" }];
const suggestions = [["Company knowledge", "Create document", "Create presentation", "Create table"], ["Generate image", "Deep research", "Visualize data"]];
const sampleFolders = ["Q3 Campaign", "Brand assets", "Hiring", "Research"];
interface PendingFile { id: string; file: File; uploaded?: AssistantAttachment; error?: string }
interface RecognitionResult { isFinal: boolean; 0: { transcript: string } }
interface Recognition { lang: string; continuous: boolean; interimResults: boolean; onresult: ((event: { resultIndex: number; results: ArrayLike<RecognitionResult> }) => void) | null; onend: (() => void) | null; onerror: ((event: { error: string }) => void) | null; start(): void; stop(): void; abort(): void }
type RecognitionConstructor = new () => Recognition;
function Icon({ name, size = 15 }: { name: string; size?: number }) {
  const svg = (icons as Record<string, string>)[name];
  return svg ? <span className="assistant-icon" style={{ width: size, height: size }} aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} /> : null;
}

const providerIcon: Record<AssistantProvider, string> = { auto: "Auto", claude: "Claude-model", chatgpt: "ChatGPT-model", gemini: "Gemini-model" };
const pickerModels = assistantModels.map(model => ({ ...model, icon: <Icon name={providerIcon[model.provider]} size={12} /> }));

export function AssistantHome({ workspaceId, userName, onInvite, notify, startFresh = false, api: suppliedApi }: {
  workspaceId: string; userName: string; onInvite: () => void; notify: (text: string) => void; startFresh?: boolean; api?: AssistantChatApi | null;
}) {
  const { t: uiText } = useWorkspaceI18n();
  const [api] = useState(() => suppliedApi === undefined ? createConfiguredAssistantApi() : suppliedApi);
  const chat = useAssistantChat(workspaceId, api, startFresh);
  const [folders, setFolders, folderSync] = useResource(resources.folders, workspaceId, workspaceId === "acme" ? sampleFolders : []);
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [fileError, setFileError] = useState("");
  const [dialog, setDialog] = useState<"history" | "apps" | null>(null);
  const [integrations, setIntegrations] = useState<AssistantIntegration[]>([]);
  const [appsLoading, setAppsLoading] = useState(false);
  const [appsError, setAppsError] = useState("");
  const [connecting, setConnecting] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [phase, setPhase] = useState<"home" | "leaving" | "chat">("home");
  const input = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const threadEnd = useRef<HTMLDivElement>(null);
  const recognition = useRef<Recognition | null>(null);
  const uploads = useRef(new Map<string, AbortController>());
  const appRequest = useRef<AbortController | null>(null);
  const alive = useRef(true);
  const hasThread = !!chat.thread?.messages.length;
  const uploading = files.some(item => !item.uploaded && !item.error);
  const showThread = phase === "chat";

  useEffect(() => {
    let disposed = false;
    const timer = window.setTimeout(() => { if (!disposed) setPhase(hasThread ? "chat" : "home"); }, hasThread && !window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 180 : 0);
    if (hasThread) queueMicrotask(() => { if (!disposed) setPhase(current => current === "chat" ? current : "leaving"); });
    return () => { disposed = true; clearTimeout(timer); };
  }, [hasThread]);

  useEffect(() => {
    const node = input.current;
    if (node) { node.style.height = "20px"; node.style.height = `${Math.min(180, node.scrollHeight)}px`; }
  }, [chat.session.draft]);
  useEffect(() => { threadEnd.current?.scrollIntoView({ behavior: "instant", block: "end" }); }, [chat.thread?.messages.length, chat.busy, phase]);
  useEffect(() => {
    alive.current = true;
    const activeUploads = uploads.current;
    return () => { alive.current = false; recognition.current?.abort(); appRequest.current?.abort(); for (const controller of activeUploads.values()) controller.abort(); };
  }, []);

  async function upload(item: PendingFile) {
    if (!api) { setFiles(current => current.map(file => file.id === item.id ? { ...file, error: "Connect the workspace backend to upload this file." } : file)); return; }
    const controller = new AbortController(); uploads.current.set(item.id, controller);
    setFiles(current => current.map(file => file.id === item.id ? { ...file, error: undefined } : file));
    try {
      const attachment = await api.upload(workspaceId, item.file, controller.signal);
      if (!controller.signal.aborted && alive.current) setFiles(current => current.map(file => file.id === item.id ? { ...file, uploaded: attachment } : file));
    } catch (error) { if (!controller.signal.aborted && alive.current) setFiles(current => current.map(file => file.id === item.id ? { ...file, error: assistantError(error) } : file)); }
    finally { uploads.current.delete(item.id); }
  }
  function addFiles(selected: FileList | null) {
    if (!selected) return;
    const accepted: PendingFile[] = [];
    const count = Math.max(0, 5 - files.length);
    for (const file of Array.from(selected).slice(0, count)) {
      if (file.size > 10 * 1024 * 1024) { setFileError(`${file.name} exceeds the 10 MB file limit.`); continue; }
      accepted.push({ id: crypto.randomUUID(), file });
    }
    if (selected.length > count) setFileError("Attach up to 5 files per message.");
    setFiles(current => [...current, ...accepted]);
    for (const item of accepted) void upload(item);
    if (fileInput.current) fileInput.current.value = "";
  }
  async function submit(text = chat.session.draft) {
    if (chat.busy || uploading || files.some(item => item.error)) return;
    const sent = await chat.send(text, files.flatMap(item => item.uploaded ? [item.uploaded] : []));
    if (sent) setFiles([]);
  }
  async function openApps() {
    setDialog("apps"); setAppsError("");
    if (!api) { setAppsError("Connect the workspace backend to manage apps."); return; }
    appRequest.current?.abort(); const controller = new AbortController(); appRequest.current = controller;
    setAppsLoading(true);
    try { const items = await api.integrations(workspaceId, controller.signal); if (!controller.signal.aborted) setIntegrations(items); }
    catch (error) { if (!controller.signal.aborted) setAppsError(assistantError(error)); }
    finally { if (!controller.signal.aborted) setAppsLoading(false); }
  }
  async function connect(id: string) {
    if (!api) return;
    setConnecting(id); setAppsError("");
    // Reserve the new tab during the click, so asynchronous authentication does not get popup-blocked.
    const popup = window.open("about:blank", "_blank"); if (popup) popup.opener = null;
    try {
      const result = await api.connect(workspaceId, id);
      if (popup) popup.location.href = result.authorizationUrl;
      else setAppsError("Allow popups, then try connecting this app again.");
    } catch (error) { popup?.close(); if (alive.current) setAppsError(assistantError(error)); }
    finally { if (alive.current) setConnecting(null); }
  }
  function dictate() {
    if (listening) { recognition.current?.stop(); return; }
    const host = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
    const Constructor = host.SpeechRecognition || host.webkitSpeechRecognition;
    if (!Constructor) { notify("Dictation is unavailable in this browser. You can type your message."); return; }
    const instance = new Constructor(); recognition.current = instance;
    instance.lang = navigator.language; instance.continuous = false; instance.interimResults = false;
    instance.onresult = event => {
      const text = Array.from(event.results).slice(event.resultIndex).filter(result => result.isFinal).map(result => result[0].transcript).join(" ");
      chat.updateSession({ draft: [chat.session.draft, text].filter(Boolean).join(" ") });
    };
    instance.onend = () => { if (alive.current) setListening(false); };
    instance.onerror = event => { if (alive.current) { setListening(false); notify(event.error === "not-allowed" ? "Microphone permission is required for dictation." : "Dictation stopped. You can try again or type your message."); } };
    try { instance.start(); setListening(true); } catch { notify("Could not start dictation. Please try again."); }
  }
  const composer = <div className="ui-as-composer">
    <form className="ui-as-composer__card" onSubmit={event => { event.preventDefault(); void submit(); }}>
      {!!files.length && <div className="ui-as-attachments">{files.map(item => <span className="ui-as-attachment" key={item.id} data-error={!!item.error || undefined} title={item.error || item.file.name}><File size={13} /><span>{item.file.name}</span>{!item.uploaded && !item.error && <LoaderCircle size={12} className="assistant-spin" />}{item.error && <button type="button" aria-label={uiText("Retry upload {0}", [item.file.name])} onClick={() => void upload(item)}><RefreshCw size={12} /></button>}<button type="button" aria-label={uiText("Remove {0}", [item.file.name])} onClick={() => { uploads.current.get(item.id)?.abort(); setFiles(current => current.filter(file => file.id !== item.id)); }}><X size={12} /></button></span>)}</div>}
      <textarea ref={input} className="ui-as-composer__field" rows={1} placeholder={uiText("Help me brainstorm ideas for...")} aria-label={uiText("Message")} value={chat.session.draft} maxLength={30000} disabled={!chat.ready} onChange={event => chat.updateSession({ draft: event.target.value })} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void submit(); } }} />
      <div className="ui-as-composer__bar">
        <button type="button" className="ui-as-icon-btn" aria-label={uiText("Add file")} disabled={chat.busy} onClick={() => fileInput.current?.click()}><Icon name="Add file" /></button>
        <input ref={fileInput} type="file" hidden multiple aria-label={uiText("Attach files")} onChange={event => { setFileError(""); addFiles(event.target.files); }} />
        <AssistantMenu title={uiText("Plugins")} label={uiText(<><Icon name="Plugins" size={14} />{uiText("Plugins")}</>)} active={!!chat.session.plugins.length}>{() => plugins.map(item => <button type="button" role="menuitemcheckbox" aria-checked={chat.session.plugins.includes(item.id)} className="ui-as-menu__item" data-rich="" key={item.id} onClick={() => chat.updateSession({ plugins: chat.session.plugins.includes(item.id) ? chat.session.plugins.filter(id => id !== item.id) : [...chat.session.plugins, item.id] })}><Icon name={`${item.name}-plugin`} /><span className="ui-as-menu__label">{item.name}<small>{uiText(item.description)}</small></span>{chat.session.plugins.includes(item.id) && <Check size={14} />}</button>)}</AssistantMenu>
        <span className="ui-as-composer__end">
          <ModelPicker className="ui-as-composer__model" models={pickerModels} align="end" value={chat.session.model} onChange={id => chat.updateSession({ model: id })}
            thinking={chat.session.thinking} onThinkingChange={on => chat.updateSession({ thinking: on })} effort={chat.session.effort} onEffortChange={effort => chat.updateSession({ effort })}
            webSearch={chat.session.plugins.includes("web-search")} onWebSearchChange={on => chat.updateSession({ plugins: on ? [...chat.session.plugins.filter(id => id !== "web-search"), "web-search"] : chat.session.plugins.filter(id => id !== "web-search") })} />
          <button type="button" className="ui-as-icon-btn ui-as-mic" aria-label={uiText("Dictate")} aria-pressed={listening} disabled={chat.busy} onClick={dictate}><Icon name="Dictate" /></button>
          <button type={chat.busy ? "button" : "submit"} className="ui-as-send" aria-label={uiText(chat.busy ? uiText("Stop response") : uiText("Send"))} disabled={!chat.busy && (!chat.ready || (!chat.session.draft.trim() && !files.length) || uploading || files.some(item => !!item.error))} onClick={chat.busy ? event => { event.preventDefault(); chat.stop(); } : undefined}>{chat.busy ? <Square size={11} fill="currentColor" /> : <Icon name="Send" />}</button>
        </span>
      </div>
    </form>
    <div className="ui-as-composer__tray">
      <AssistantMenu title={uiText("Work in a folder")} className="ui-as-tray-link" label={uiText(<><span className="ui-as-tray-link__folder" aria-hidden="true" dangerouslySetInnerHTML={{ __html: folderMark }} /><span>{chat.session.folderId || uiText("Work in a folder")}</span></>)}>{close => <>
        {chat.session.folderId && <button type="button" role="menuitemradio" aria-checked="false" className="ui-as-menu__item" onClick={() => { chat.updateSession({ folderId: undefined }); close(); }}>{uiText("No folder")}</button>}
        {folders.map(folder => <button type="button" role="menuitemradio" aria-checked={chat.session.folderId === folder} className="ui-as-menu__item" key={folder} onClick={() => { chat.updateSession({ folderId: folder }); close(); }}><Icon name="Q3 Campaign" /><span className="ui-as-menu__label">{folder}</span>{chat.session.folderId === folder && <Check size={14} />}</button>)}
        {!folders.length && <p className="assistant-menu-note">{uiText("No folders yet.")}</p>}
        <form className="assistant-folder-form" onSubmit={event => { event.preventDefault(); const name = String(new FormData(event.currentTarget).get("folder")).trim(); if (!name) return; if (folders.some(folder => folder.toLowerCase() === name.toLowerCase())) { notify("A folder with this name already exists."); return; } setFolders([...folders, name]); chat.updateSession({ folderId: name }); event.currentTarget.reset(); close(); }}><input aria-label={uiText("New folder name")} name="folder" placeholder={uiText("New folder name")} required maxLength={80} /><button type="submit" aria-label={uiText("Create folder")}>+</button></form>
        {folderSync.error && <p role="alert" className="assistant-menu-note">{uiText(folderSync.error.message)}<button type="button" onClick={folderSync.retry}>{uiText("Retry saving")}</button></p>}
      </>}</AssistantMenu>
      <button type="button" className="ui-as-tray-link ui-as-tray-link--apps" onClick={() => void openApps()}>{uiText("Connect apps")}<span className="ui-as-apps"><Icon name="app-0" size={13} /><Icon name="app-1" size={13} /><Icon name="app-2" size={13} /></span></button>
    </div>
  </div>;

  return <div className="assistant-home">
    <button type="button" className="ui-as-invite" onClick={onInvite}><Icon name="Invite people" size={14} />{uiText("Invite people")}</button>
    {(hasThread || chat.threads.length > 0 || chat.historyError) && <div className="assistant-thread-tools"><button type="button" aria-label={uiText("New conversation")} onClick={() => { chat.newChat(); setFiles([]); input.current?.focus(); }}><MessageSquarePlus size={15} />{uiText(hasThread && uiText("New chat"))}</button><button type="button" aria-label={uiText("Recent chats")} onClick={() => { setDialog("history"); void chat.refreshHistory(); }}><History size={15} /></button></div>}
    <div className="ui-as-start" data-phase={phase === "home" ? undefined : phase} aria-busy={chat.loading || chat.busy}>
      {showThread ? <div className="ui-as-start__thread"><div className="ui-as-start__column" role="log" aria-label={uiText("Conversation")} aria-live="polite">{chat.thread?.messages.map(message => <article className="assistant-message" data-role={message.role} key={message.id}><span className="assistant-message-author">{message.role === "assistant" ? uiText("Assistant") : userName}</span><div className="assistant-message-content">{message.content}</div>{!!message.attachments?.length && <div className="assistant-message-files">{message.attachments.map(file => <span key={file.id}><File size={13} />{file.name}</span>)}</div>}<button type="button" className="assistant-copy" aria-label={uiText("Copy {0} message", [message.role])} onClick={async () => { try { await navigator.clipboard.writeText(message.content); notify("Message copied"); } catch { notify("Copy is unavailable. Select the message text to copy it."); } }}><Copy size={12} /></button></article>)}{chat.busy && <div className="assistant-thinking" role="status"><LoaderCircle size={14} className="assistant-spin" />{uiText("Assistant is thinking")}</div>}<div ref={threadEnd} /></div></div> : <h1 className="ui-as-start__title">{uiText("Good afternoon! What's next on your list?")}</h1>}
      <div className="ui-as-start__composer">{uiText(composer)}{(chat.error || fileError) && <div className="assistant-error" role="alert"><span>{uiText(chat.error || fileError)}</span>{chat.failed && <button type="button" disabled={chat.busy} onClick={async () => { if (await chat.retry()) setFiles([]); }}>{uiText("Retry message")}</button>}</div>}</div>
      {!showThread && <div className="ui-as-chips">{suggestions.map((row, index) => <div className="ui-as-chips__row" key={index}>{row.map(label => <button type="button" className="ui-as-chip" key={label} disabled={chat.busy || !chat.ready} onClick={() => { chat.updateSession({ draft: label }); void submit(label); }}><Icon name={label} size={15} />{uiText(label)}</button>)}</div>)}</div>}
      {chat.loading && <div className="assistant-load" role="status"><LoaderCircle size={15} className="assistant-spin" />{uiText("Loading conversation…")}</div>}
    </div>
    <WorkspaceDialog open={dialog === "history"} title={uiText("Recent chats")} onClose={() => setDialog(null)}><div className="assistant-history">{chat.historyError && <p role="alert">{uiText(chat.historyError)}<button type="button" onClick={() => void chat.refreshHistory()}>{uiText("Try again")}</button></p>}{!chat.threads.length && <p>{uiText("No conversations yet.")}</p>}{chat.threads.map(item => <div className="assistant-history-row" key={item.id}><button type="button" onClick={() => { void chat.openThread(item.id); setDialog(null); setFiles([]); }}><strong>{item.title || uiText("Untitled chat")}</strong><small>{uiText(new Date(item.updatedAt).toLocaleDateString())}</small></button><button type="button" aria-label={uiText("Delete {0}", [item.title])} onClick={() => setDeleteId(item.id)}><Trash2 size={14} /></button></div>)}</div></WorkspaceDialog>
    <WorkspaceDialog open={!!deleteId} title={uiText("Delete conversation")} onClose={() => setDeleteId(null)}><p>{uiText("Delete this conversation and its messages?")}</p><div className="workspace-form-actions"><button type="button" onClick={() => setDeleteId(null)}>{uiText("Cancel")}</button><button type="button" className="workspace-danger" onClick={() => { if (deleteId) void chat.removeThread(deleteId); setDeleteId(null); }}>{uiText("Delete conversation")}</button></div></WorkspaceDialog>
    <WorkspaceDialog open={dialog === "apps"} title={uiText("Connect apps")} onClose={() => { setDialog(null); appRequest.current?.abort(); }}><p>{uiText("Connect the tools your team already uses and work with them right in the chat.")}</p><div className="assistant-integrations">{appsLoading && <p role="status">{uiText("Loading apps…")}</p>}{appsError && <p role="alert">{uiText(appsError)}{api && <button type="button" onClick={() => void openApps()}>{uiText("Try again")}</button>}</p>}{!appsLoading && !appsError && !integrations.length && <p>{uiText("No apps are available for this workspace.")}</p>}{integrations.map(item => <div key={item.id}><span>{item.name}<small>{uiText(item.connected ? uiText("Connected") : uiText("Not connected"))}</small></span>{item.connected ? <Check size={15} /> : <button type="button" disabled={connecting !== null} onClick={() => void connect(item.id)}>{uiText(connecting === item.id ? uiText("Opening…") : uiText("Connect"))}</button>}</div>)}{api && <button type="button" onClick={() => void openApps()}>{uiText("Refresh connection status")}</button>}</div></WorkspaceDialog>
  </div>;
}
