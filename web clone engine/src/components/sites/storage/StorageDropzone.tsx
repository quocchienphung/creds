"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useEffect, useId, useRef, useState, type CSSProperties, type DragEvent } from "react";
import "./storage-dropzone.css";

export interface StorageDropzoneEntry {
  id: string;
  name: string;
  size: number;
  status: "pending" | "processing" | "ready" | "error";
  /** Actual processing progress, from 0 to 100. */
  progress: number;
  error?: string;
}

export interface StorageDropzoneProps {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  entries?: StorageDropzoneEntry[];
  onRemove?: (id: string) => void;
  onRetry?: (id: string) => void;
  /** Reuse of the same Dropzone by other sections. Every option defaults to what Storage has always shown. */
  accept?: string;
  hint?: string;
  inputLabel?: string;
  multiple?: boolean;
  badges?: readonly [string, string];
}

const extensions = ".pdf,.docx,.txt,.md,.csv,.tsv,.sql,.json,.xlsx";

function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileGlyph({ name }: { name: string }) {
  const ext = name.split(".").pop()?.toLowerCase();
  const type = ext === "pdf" ? "pdf" : ext === "xlsx" || ext === "csv" || ext === "tsv" ? "data" : ext === "sql" || ext === "json" ? "code" : "text";
  return <svg viewBox="0 0 16 16" className="storage-dropzone__file" data-type={type} aria-hidden="true">
    <path d="M4 1.75h5L12.25 5v8A1.25 1.25 0 0 1 11 14.25H4A1.25 1.25 0 0 1 2.75 13V3A1.25 1.25 0 0 1 4 1.75Z" />
    <path d="M9 1.75V4a1 1 0 0 0 1 1h2.25" />
    <rect x="1" y="8.5" width="9" height="4.5" rx="1.25" />
  </svg>;
}

function Glyph({ kind }: { kind: "upload" | "check" | "remove" | "retry" }) {
  return <svg className="storage-dropzone__glyph" viewBox="0 0 24 24" aria-hidden="true">
    {kind === "upload" && <path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 15v3.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V15" />}
    {kind === "check" && <><circle cx="12" cy="12" r="9" className="storage-dropzone__check-circle" /><path className="storage-dropzone__check-mark" d="m8.5 12 2.3 2.3 4.7-4.8" /></>}
    {kind === "remove" && <path d="m7 7 10 10M17 7 7 17" />}
    {kind === "retry" && <path d="M20 11a8 8 0 1 0-1.5 5M20 4v7h-7" />}
  </svg>;
}

function DocumentBadge({ type, first }: { type: string; first: boolean }) {
  return <svg viewBox="0 0 30 36" className="storage-dropzone__badge" data-type={type.toLowerCase()} aria-hidden="true">
    <path className="storage-dropzone__badge-sheet" d="M5 1h14l10 10v20a4 4 0 0 1-4 4H5a4 4 0 0 1-4-4V5a4 4 0 0 1 4-4Z" />
    <path className="storage-dropzone__badge-fold" d="M19 1v6a4 4 0 0 0 4 4h6" />
    <rect x={first ? 0 : 6.4} y="19" width="23.6" height="11" rx="3" />
    <text x={first ? 4 : 10.4} y="27.2">{type}</text>
  </svg>;
}

/** Independent reconstruction of affectUI's publicly rendered Dropzone. */
export function StorageDropzone({ onFiles, disabled = false, entries = [], onRemove, onRetry, accept = extensions, hint = "PDF, DOCX, TXT, MD, CSV, TSV, SQL, JSON, XLSX · up to 20 MB each", inputLabel = "Choose storage documents", multiple = true, badges = ["PDF", "SQL"] }: StorageDropzoneProps) {
  const { t: uiText } = useWorkspaceI18n();
  const input = useRef<HTMLInputElement>(null);
  const depth = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const removal = useRef({ disabled, onRemove });
  const [dragCount, setDragCount] = useState(0);
  const [removing, setRemoving] = useState<Set<string>>(new Set());
  const hintId = useId();
  const complete = entries.filter(item => item.status === "ready").length;
  const processing = entries.filter(item => item.status === "processing").length;
  const queued = entries.filter(item => item.status === "pending").length;
  const failed = entries.filter(item => item.status === "error").length;
  const totalSize = entries.reduce((total, item) => total + item.size, 0);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useEffect(() => { removal.current = { disabled, onRemove }; }, [disabled, onRemove]);

  function resetDrag() {
    depth.current = 0;
    setDragCount(0);
  }

  function receive(files: File[]) {
    resetDrag();
    if (!disabled && files.length) onFiles(files);
  }

  function dragEnter(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    if (disabled || !Array.from(event.dataTransfer.types).includes("Files")) return;
    depth.current += 1;
    setDragCount(Math.max(1, event.dataTransfer.items.length));
  }

  function remove(id: string) {
    if (!onRemove || disabled || removing.has(id)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onRemove(id);
      return;
    }
    setRemoving(previous => new Set(previous).add(id));
    timers.current.push(setTimeout(() => {
      // The parent may lock the queue during this brief exit animation.
      if (!removal.current.disabled) removal.current.onRemove?.(id);
      setRemoving(previous => { const next = new Set(previous); next.delete(id); return next; });
    }, 280));
  }

  const summary = entries.length === 0 ? "No files yet" : processing
    ? `Processing ${processing} of ${entries.length} · ${fileSize(totalSize)}`
    : queued ? `${queued} queued · ${fileSize(totalSize)}`
    : `${complete} of ${entries.length} ready${failed ? ` · ${failed} need attention` : ""}`;

  return <div className="storage-dropzone" data-disabled={disabled || undefined}>
    <div className="storage-dropzone__card">
      <div className="storage-dropzone__body">
        <input ref={input} className="storage-dropzone__input" type="file" multiple={multiple} accept={accept} disabled={disabled} tabIndex={-1} aria-label={uiText(inputLabel)} onChange={event => {
          receive(Array.from(event.currentTarget.files ?? []));
          event.currentTarget.value = "";
        }} />
        <button type="button" className="storage-dropzone__area" disabled={disabled} data-dragging={dragCount > 0 || undefined} aria-describedby={hintId}
          onClick={() => input.current?.click()} onDragEnter={dragEnter}
          onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = disabled ? "none" : "copy"; }}
          onDragLeave={event => { event.preventDefault(); depth.current = Math.max(0, depth.current - 1); if (!depth.current) setDragCount(0); }}
          onDrop={event => { event.preventDefault(); receive(Array.from(event.dataTransfer.files)); }}>
          <span className="storage-dropzone__stack" aria-hidden="true">
            <span className="storage-dropzone__sheet storage-dropzone__sheet--left"><DocumentBadge type={badges[0]} first /></span>
            <span className="storage-dropzone__sheet storage-dropzone__sheet--right"><DocumentBadge type={badges[1]} first={false} /></span>
            <span className="storage-dropzone__sheet storage-dropzone__sheet--middle"><Glyph kind="upload" /></span>
          </span>
          <span className="storage-dropzone__title">{dragCount > 0 ? uiText("Release to add {0} {1}", [dragCount, dragCount === 1 ? "file" : "files"]) : <>
            <span className="storage-dropzone__mouse">{uiText("Drop files here or ")}<span className="storage-dropzone__browse">{uiText("browse")}</span></span>
            <span className="storage-dropzone__touch">{uiText("Tap to ")}<span className="storage-dropzone__browse">{uiText("choose files")}</span></span>
          </>}</span>
          <span className="storage-dropzone__hint" id={hintId}>{uiText(hint)}</span>
        </button>
        <ul className="storage-dropzone__list" aria-label={uiText("Document processing")}>
          {entries.map(item => {
            const progress = Math.round(Math.max(0, Math.min(100, Number.isFinite(item.progress) ? item.progress : 0)));
            const busy = item.status === "pending" || item.status === "processing";
            return <li key={item.id} className="storage-dropzone__row" data-status={item.status} data-removing={removing.has(item.id) || undefined}>
              <div className="storage-dropzone__row-clip"><div className="storage-dropzone__row-inner">
                <FileGlyph name={item.name} />
                <div className="storage-dropzone__info">
                  <div className="storage-dropzone__line"><span className="storage-dropzone__name" title={item.name}>{item.name}</span>{item.status === "ready" && <span className="storage-dropzone__done" aria-label={uiText("Ready")}><Glyph kind="check" /></span>}</div>
                  <div className="storage-dropzone__meta">{item.status === "error" ? <span className="storage-dropzone__error">{uiText(item.error || uiText("Could not process this document"))}</span> : <>{uiText(fileSize(item.size))}{busy && <><span className="storage-dropzone__dot">·</span>{uiText(item.status === "pending" ? uiText("Queued") : uiText("{0}% processed", [progress]))}</>}</>}</div>
                  {(busy || item.status === "error") && <div className="storage-dropzone__bar" role="progressbar" aria-label={uiText("Processing {0}", [item.name])} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-valuetext={uiText(item.status === "error" ? item.error || uiText("Processing failed") : uiText("{0}%", [progress]))}><span style={{ "--storage-progress": progress / 100 } as CSSProperties} /></div>}
                </div>
                <div className="storage-dropzone__actions">
                  {item.status === "error" && onRetry && <button type="button" className="storage-dropzone__icon-button storage-dropzone__retry" disabled={disabled || removing.has(item.id)} aria-label={uiText("Retry {0}", [item.name])} title={uiText("Retry")} onClick={() => onRetry(item.id)}><Glyph kind="retry" /></button>}
                  {onRemove && <button type="button" className="storage-dropzone__icon-button" disabled={disabled || removing.has(item.id)} aria-label={uiText("Remove {0}", [item.name])} title={uiText("Remove")} onClick={() => remove(item.id)}><Glyph kind="remove" /></button>}
                </div>
              </div></div>
            </li>;
          })}
        </ul>
      </div>
      <div className="storage-dropzone__footer"><span className={processing ? "storage-dropzone__summary storage-dropzone__summary--busy" : "storage-dropzone__summary"}>{uiText(summary)}</span>{entries.length > 0 && !processing && onRemove && <button type="button" className="storage-dropzone__clear" disabled={disabled} onClick={() => entries.forEach(item => remove(item.id))}>{uiText("Clear")}</button>}</div>
    </div>
    <span className="storage-dropzone__live" role="status" aria-live="polite" aria-atomic="true">{uiText(complete)} {uiText(" documents ready.")}{failed > 0 ? uiText(" {0} documents need attention. {1}", [failed, entries.filter(item => item.status === "error").map(item => `${item.name}: ${item.error || "Processing failed"}`).join(". ")]) : ""}</span>
  </div>;
}
