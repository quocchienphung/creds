"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AlertTriangle, ArrowDownToLine, ArrowUpRight, Check, Copy, FileSpreadsheet, HardDrive, RefreshCw, Search, Trash2, Upload } from "lucide-react";
import { useWorkspaceI18n } from "../../i18n/WorkspaceI18n";
import { useWorkspaceRoute } from "../../affectui-crm/workspace-state";
import { WorkspaceLink } from "../../guide-navigation/WorkspaceLink";
import { useCollateral } from "../CollateralProvider";
import { SectionHeader } from "../shell";
import { downloadBlob } from "../download";
import { listQueue, readQueueFile } from "./queue-client";
import { filterQueue, queueBytes, type QueueDeleteReceipt, type QueueEntry } from "./queue-model";
import { useQueueCopy } from "./queue-copy";
import { QueuePopup } from "./QueuePopup";
import { ConfirmMorph, type ConfirmPhase } from "../../skilled/ui/ConfirmMorph";
import "../../affectui-settings/settings-reference.css";
import "../../affectui-settings/settings-overrides.css";
import "../collateral.css";
import "./queue.css";

const ease = [.22, 1, .36, 1] as const;
type Popup = { entry: QueueEntry; open: boolean };
type Removal = { entry: QueueEntry; receipt: QueueDeleteReceipt };
const tone = (entry: QueueEntry) => entry.status === "ready" ? "scanned" : entry.status === "failed" ? "failed" : "saved";

/** Prompt cache's public visual grammar applied to real upload history, never simulated cache/token/cost data. */
export function Queue({ workspaceId }: { workspaceId: string }) {
  const copy = useQueueCopy();
  const { locale } = useWorkspaceI18n();
  const reduce = useReducedMotion();
  const { navigate } = useWorkspaceRoute();
  const { openSaved, deleteSaved, restoreSaved, engine } = useCollateral();
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [loaded, setLoaded] = useState(false), [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState(""), [status, setStatus] = useState("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [popup, setPopup] = useState<Popup | null>(null), [removal, setRemoval] = useState<Removal | null>(null);
  const sawResult = useRef(false), removalRef = useRef<Removal | null>(null);
  const [morphEpoch, setMorphEpoch] = useState(0);
  const [bulk, setBulk] = useState<{ entries: QueueEntry[]; open: boolean } | null>(null), [bulkRemoval, setBulkRemoval] = useState<Removal[] | null>(null), [bulkPhase, setBulkPhase] = useState<ConfirmPhase>("idle");
  const bulkDone = useRef<Removal[]>([]), bulkSaw = useRef(false);
  const generation = useRef(0), mounted = useRef(true);
  const abort = useRef<AbortController | null>(null);
  const refresh = useCallback(async (visible = false) => {
    const run = ++generation.current;
    abort.current?.abort(); abort.current = new AbortController();
    if (visible) { setRefreshing(true); setError(""); }
    try {
      const data = await listQueue(workspaceId, abort.current.signal);
      if (run !== generation.current || !mounted.current) return;
      setEntries(data); setLoaded(true); setLoadError("");
    } catch (failure) {
      if (run === generation.current && mounted.current && !(failure instanceof Error && failure.name === "AbortError")) {
        setLoadError(failure instanceof Error ? failure.message : "Queue could not be loaded."); setLoaded(true);
      }
    } finally { if (run === generation.current && mounted.current) setRefreshing(false); }
  }, [workspaceId]);
  useEffect(() => {
    mounted.current = true;
    const update = () => { void refresh(); };
    const focus = () => { if (!document.hidden) update(); };
    update();
    window.addEventListener("collateral-queue-changed", update); window.addEventListener("focus", focus);
    const interval = setInterval(focus, 5000);
    return () => { mounted.current = false; abort.current?.abort(); clearInterval(interval); window.removeEventListener("collateral-queue-changed", update); window.removeEventListener("focus", focus); };
  }, [refresh]);

  const visible = filterQueue(entries, search, status);
  // The pop-up keeps showing a file the moment it is deleted, so its Undo has something to bring back.
  const selected = popup ? entries.find(entry => entry.id === popup.entry.id) ?? popup.entry : null;
  const removed = !!selected && removal?.entry.id === selected.id;
  const total = entries.reduce((sum, entry) => sum + entry.size, 0);
  const largest = Math.max(1, ...entries.map(entry => entry.size));
  const groups = ["ready", "uploaded", "failed"] as const;
  const totals = groups.map(value => ({ status: value, bytes: entries.filter(entry => entry.status === value).reduce((sum, entry) => sum + entry.size, 0), count: entries.filter(entry => entry.status === value).length }));
  const date = (value: string) => new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  const fullDate = (value: string) => new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  const summary = (entry: QueueEntry) => copy(entry.status === "ready" ? "describeReady" : entry.status === "failed" ? "describeFailed" : "describeSaved");
  const counted = (entry: QueueEntry) => `${entry.sheets} ${copy(entry.sheets === 1 ? "sheet" : "sheets")} · ${entry.rows} ${copy(entry.rows === 1 ? "row" : "rows")}`;
  const choose = (entry: QueueEntry) => { if (!busy) setPopup({ entry, open: true }); };
  const closePopup = () => setPopup(current => current && { ...current, open: false });
  const reopen = async (entry: QueueEntry, section: "Excel formation" | "JSON formation") => {
    if (busy) return;
    if (engine.unsaved && !window.confirm(locale === "vi" ? "Mở lại tệp gốc sẽ bỏ các thay đổi chưa xuất. Tiếp tục?" : "Reopening the original discards unexported corrections. Continue?")) return;
    setBusy(entry.id); setError("");
    try { await openSaved(entry); if (mounted.current) { closePopup(); navigate(section); } }
    catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : "The original could not be opened."); }
    finally { if (mounted.current) setBusy(null); }
  };
  const download = async (entry: QueueEntry) => {
    if (busy) return;
    setBusy(entry.id); setError("");
    try { const file = await readQueueFile(workspaceId, entry); downloadBlob(entry.name, file); }
    catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : "The original could not be downloaded."); }
    finally { if (mounted.current) setBusy(null); }
  };
  // The server moves the original aside and answers with an undo token; the file is gone for good once its window (8 s) has passed.
  const remove = async (entry: QueueEntry) => {
    const receipt = await deleteSaved(entry);
    removalRef.current = { entry, receipt }; setRemoval(removalRef.current); setEntries(current => current.filter(item => item.id !== entry.id));
  };
  // Bulk delete reuses the per-file server receipts, so "Undo" restores every file for as long as the 8 s window lasts.
  const openBulk = () => { if (busy || !entries.length) return; bulkDone.current = []; setBulkRemoval(null); setBulkPhase("idle"); setBulk({ entries, open: true }); };
  const closeBulk = () => setBulk(current => current && { ...current, open: false });
  const removeAll = async () => {
    const pending = (bulk?.entries ?? []).filter(entry => !bulkDone.current.some(item => item.entry.id === entry.id));
    const results = await Promise.allSettled(pending.map(async entry => ({ entry, receipt: await deleteSaved(entry) })));
    const done = results.flatMap(result => result.status === "fulfilled" ? [result.value] : []);
    bulkDone.current = [...bulkDone.current, ...done];
    if (mounted.current) { setEntries(current => current.filter(entry => !done.some(item => item.entry.id === entry.id))); if (bulkDone.current.length) setBulkRemoval(bulkDone.current); }
    if (done.length < pending.length) throw new Error(copy("deleteAllError")); // Retry only repeats the files that are left
  };
  const restoreAll = async (items: Removal[]) => {
    const results = await Promise.allSettled(items.map(item => restoreSaved(item.entry, item.receipt)));
    const failed = items.filter((_, index) => results[index].status === "rejected");
    bulkDone.current = failed;
    if (mounted.current) { setBulkRemoval(failed.length ? failed : null); if (!failed.length) setError(""); void refresh(); }
    if (failed.length) throw new Error(copy("restoreError"));
  };
  const bulkPhaseChange = (phase: ConfirmPhase) => {
    setBulkPhase(phase);
    if (phase === "done") bulkSaw.current = true;
    else if (phase === "idle") { if (bulkSaw.current) { bulkSaw.current = false; closeBulk(); } }
    else bulkSaw.current = false;
  };
  const restore = async (item: Removal) => {
    await restoreSaved(item.entry, item.receipt);
    if (!mounted.current) return;
    setRemoval(current => current?.entry.id === item.entry.id ? null : current); setError(""); void refresh();
  };
  const removalPhase = (phase: ConfirmPhase) => {
    if (phase === "done") sawResult.current = true;
    else if (phase === "idle") { if (sawResult.current) { sawResult.current = false; closePopup(); } }
    else sawResult.current = false;
  };
  useEffect(() => {
    if (!removal) return;
    const timer = setTimeout(() => setRemoval(current => current === removal ? null : current), Math.max(0, new Date(removal.receipt.expiresAt).getTime() - Date.now()));
    return () => clearTimeout(timer);
  }, [removal]);
  useEffect(() => {
    if (!bulkRemoval) return;
    const expiry = Math.min(...bulkRemoval.map(item => new Date(item.receipt.expiresAt).getTime()));
    const timer = setTimeout(() => setBulkRemoval(current => current === bulkRemoval ? null : current), Math.max(0, expiry - Date.now()));
    return () => clearTimeout(timer);
  }, [bulkRemoval]);
  const bulkBytes = bulk ? bulk.entries.reduce((sum, entry) => sum + entry.size, 0) : 0;
  const fill = (text: string, n: number) => text.replace("{n}", String(n)).replace("{size}", queueBytes(bulkBytes));
  return <div className="ui-sb collateral queue-page">
    <SectionHeader title="Queue" trail={["Collateral", "Queue"]} />
    <p className="queue-page__intro">{copy("subtitle")}</p>
    <div className="queue-card">
      <header className="queue-card__header"><div><h2>{copy("history")}</h2><p><HardDrive size={14} />{copy("originals")}<span>·</span>{entries.length}</p></div>
        <div className="queue-card__controls"><button type="button" className="queue-pill queue-pill--danger" data-queue-delete-all disabled={!entries.length || !!busy} onClick={openBulk}><Trash2 size={15} />{copy("deleteAll")}</button><button type="button" className="queue-icon" disabled={refreshing || !!busy} aria-label={copy("refresh")} onClick={() => { void refresh(true); }}><RefreshCw size={16} className={refreshing ? "queue-spin" : undefined} /></button><WorkspaceLink href="/personalize?section=excel-formation" className="queue-icon" aria-label={copy("import")}><Upload size={16} /></WorkspaceLink></div>
      </header>
      <ul className="queue-legend">{totals.map(item => <li key={item.status}><span className="queue-swatch" data-tone={item.status === "ready" ? "scanned" : item.status === "failed" ? "failed" : "saved"} />{copy(item.status)}<span>{item.count}</span></li>)}</ul>
      <section className="queue-summary" aria-label={copy("savedBytes")}><div className="queue-summary__head"><span className="queue-ring"><HardDrive size={18} /></span><div><strong>{copy("originals")}</strong><span>{queueBytes(total)} · {entries.length} {locale === "vi" ? "tệp" : "files"}</span></div></div>
        <div className="queue-summary__bar">{totals.filter(item => item.bytes).map((item, index) => <motion.span key={item.status} data-tone={item.status === "ready" ? "scanned" : item.status === "failed" ? "failed" : "saved"} style={{ flexGrow: item.bytes }} initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: .18, delay: reduce ? 0 : index * .03 }} title={`${copy(item.status)} · ${queueBytes(item.bytes)}`} />)}</div>
        <p>{copy("originalOnly")}</p>
      </section>
      <div className="queue-filters"><label className="queue-search"><Search size={15} /><input type="search" aria-label={copy("search")} placeholder={copy("search")} value={search} onChange={event => setSearch(event.target.value)} /></label><select aria-label={locale === "vi" ? "Lọc trạng thái" : "Filter status"} value={status} onChange={event => setStatus(event.target.value)}><option value="all">{copy("all")}</option>{groups.map(value => <option key={value} value={value}>{copy(value)}</option>)}</select></div>
      {(error || loadError) && <div className="queue-error" role="alert"><span>{error || loadError}</span><button type="button" onClick={() => { void refresh(true); }}>{copy("retry")}</button></div>}
      {removal && !popup?.open && <div className="queue-undo" role="status"><span><strong>{removal.entry.name}</strong> {copy("removedNote")}</span><button type="button" onClick={() => { void restore(removal).then(() => setMorphEpoch(epoch => epoch + 1)).catch(failure => setError(failure instanceof Error ? failure.message : copy("restoreError"))); }}>{copy("undo")}</button></div>}
      {bulkRemoval && !bulk?.open && <div className="queue-undo" role="status"><span>{fill(copy("deleteAllDone"), bulkRemoval.length)}</span><button type="button" onClick={() => { void restoreAll(bulkRemoval).then(() => setMorphEpoch(epoch => epoch + 1)).catch(failure => setError(failure instanceof Error ? failure.message : copy("restoreError"))); }}>{copy("undo")}</button></div>}
      {!loaded ? <p role="status">{copy("loading")}</p> : !entries.length && !loadError ? <div className="queue-empty"><FileSpreadsheet size={30} strokeWidth={1.3} /><h3>{copy("empty")}</h3><p>{copy("emptyHint")}</p><WorkspaceLink href="/personalize?section=excel-formation"><Upload size={14} />{copy("import")}</WorkspaceLink></div> : <div className="queue-main">
        <div className="queue-list"><div className="queue-list__head"><span>{copy("originals")}</span><span>{locale === "vi" ? "Dung lượng" : "Size"}</span><span>{locale === "vi" ? "Đã tải lên" : "Uploaded"}</span></div>
          {visible.length === 0 && <p>{copy("noMatches")}</p>}
          <div className="queue-rows" role="list"><AnimatePresence initial={false}>{visible.map((entry, index) => <motion.div className="queue-row" role="listitem" key={entry.id} initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0, marginBottom: 0, filter: reduce ? "none" : "blur(2px)" }} transition={{ duration: .24, delay: reduce ? 0 : Math.min(index, 5) * .03, ease }}>
            <button type="button" className="queue-row__button" data-queue-id={entry.id} disabled={!!busy } aria-label={`${entry.name} · ${copy(entry.status)}`} onClick={() => choose(entry)}>
              <span className="queue-row__head"><span className="queue-row__name" title={entry.name}>{entry.name}</span><span className="queue-row__status" data-tone={tone(entry)}>{entry.status === "ready" && <Check size={13} />}{copy(entry.status)}</span></span>
              <span className="queue-row__bar" title={locale === "vi" ? "Dung lượng so với tệp lớn nhất" : "File size relative to the largest upload"}><span className="queue-row__fill" data-tone={tone(entry)} style={{ width: `${entry.size / largest * 100}%` } as CSSProperties} /></span>
              <span className="queue-row__size">{queueBytes(entry.size)}</span><time className="queue-row__date" dateTime={entry.uploadedAt}>{date(entry.uploadedAt)}</time>
            </button>
          </motion.div>)}</AnimatePresence></div>
          {visible.length > 0 && <p className="queue-caption">{locale === "vi" ? "Độ dài thanh biểu thị dung lượng so với tệp lớn nhất." : "Bar lengths show file size relative to the largest upload."}</p>}
        </div>
      </div>}
      <footer className="queue-footer"><div><strong>{entries.length}</strong><span>{copy("originals")}</span></div><div><strong>{queueBytes(total)}</strong><span>{copy("savedBytes")}</span></div><div><strong>{totals[0].count}</strong><span>{copy("scannedFiles")}</span></div></footer>
    </div>
    {selected && <QueuePopup open={popup?.open ?? false} onClose={closePopup} label={copy("close")} title={selected.name} getOrigin={() => document.querySelector(`[data-queue-id="${selected.id}"]`)}>
      <div className="queue-pop__media" data-tone={tone(selected)}><FileSpreadsheet size={40} strokeWidth={1.25} /><span>.xlsx</span></div>
      <div className="queue-pop__main">
        <h3 className="queue-pop__title" aria-hidden="true">{selected.name}</h3>
        <p className="queue-pop__description">{summary(selected)}</p>
        <div className="queue-pop__footer">
          <div className="queue-pop__byline" inert={removed || undefined}><span className="queue-pop__avatar" data-tone={tone(selected)}>{selected.status === "ready" ? <Check size={16} /> : selected.status === "failed" ? <AlertTriangle size={16} /> : <HardDrive size={16} />}</span>
            <span className="queue-pop__bytext"><span className="queue-pop__meta">{queueBytes(selected.size)}</span><span className="queue-pop__status">{copy(selected.status)}</span></span></div>
          <button type="button" className="queue-pop__primary" disabled={!!busy || removed} onClick={() => { void reopen(selected, "Excel formation"); }}>{busy === selected.id ? copy("opening") : copy("openExcel")}</button>
        </div>
        <div className="queue-pop__details">
          <div className="queue-pop__live" inert={removed || undefined}>
            <dl className="queue-pop__facts">
              <dt>{copy("uploadedLabel")}</dt><dd><time dateTime={selected.uploadedAt}>{fullDate(selected.uploadedAt)}</time></dd>
              {selected.status === "ready" && <><dt>{copy("contentLabel")}</dt><dd>{counted(selected)}</dd></>}
              {selected.error && <><dt>{copy("problemLabel")}</dt><dd data-problem="">{selected.error}</dd></>}
              <dt>{copy("fingerprintLabel")}</dt><dd><span className="queue-pop__hash" title={selected.sha256}>{selected.sha256.slice(0, 16)}…<button type="button" className="queue-pop__copy" aria-label={copy("copyHash")} onClick={() => { void navigator.clipboard?.writeText(selected.sha256); }}><Copy size={14} /></button></span></dd>
            </dl>
            <div className="queue-pop__secondary"><button type="button" disabled={!!busy || selected.status === "failed"} onClick={() => { void reopen(selected, "JSON formation"); }}>{copy("openJson")}<ArrowUpRight size={14} /></button><button type="button" disabled={!!busy} onClick={() => { void download(selected); }}>{copy("download")}<ArrowDownToLine size={14} /></button></div>
          </div>
          <div className="queue-pop__delete"><p>{copy("consequence")}</p>
            <ConfirmMorph key={`${selected.id}:${morphEpoch}`} label={copy("delete")} icon={<Trash2 size={14} />} prompt={copy("deletePrompt")} confirmMode="hold" confirmLabel={copy("deleteConfirm")} pendingLabel={copy("deleting")} doneLabel={copy("deleted")} undoLabel={copy("undo")} undoingLabel={copy("restoring")} errorLabel={copy("removeError")}
              resultTimeout={8000} disabled={!!busy} onConfirm={() => remove(selected)} onUndo={() => removalRef.current ? restore(removalRef.current) : undefined} onStateChange={removalPhase} /></div>
        </div>
      </div>
    </QueuePopup>}
    {bulk && <QueuePopup open={bulk.open} onClose={closeBulk} label={copy("deleteAllTitle")} title={copy("deleteAllTitle")} getOrigin={() => document.querySelector("[data-queue-delete-all]")}>
      <div className="queue-pop__media" data-tone="danger"><Trash2 size={40} strokeWidth={1.25} /><span>{bulk.entries.length} {locale === "vi" ? "tệp" : "files"} · {queueBytes(bulkBytes)}</span></div>
      <div className="queue-pop__main">
        <h3 className="queue-pop__title" aria-hidden="true">{copy("deleteAllTitle")}</h3>
        <p className="queue-pop__description">{fill(copy("deleteAllBody"), bulk.entries.length)}</p>
        <ul className="queue-pop__files" data-gone={bulkPhase === "pending" || bulkPhase === "done" || undefined} aria-label={copy("originals")}>
          {bulk.entries.slice(0, 5).map((entry, index) => <li key={entry.id} style={{ "--i": index } as CSSProperties}><FileSpreadsheet size={14} /><span title={entry.name}>{entry.name}</span><em>{queueBytes(entry.size)}</em></li>)}
          {bulk.entries.length > 5 && <li className="queue-pop__more" style={{ "--i": 5 } as CSSProperties}>{fill(copy("moreFiles"), bulk.entries.length - 5)}</li>}
        </ul>
        <div className="queue-pop__details"><div className="queue-pop__delete queue-pop__delete--solo"><p>{copy("deleteAllConsequence")}</p>
          <ConfirmMorph key={`bulk:${morphEpoch}`} label={copy("deleteAll")} icon={<Trash2 size={14} />} prompt={fill(copy("deleteAllPrompt"), bulk.entries.length)} confirmMode="hold" confirmLabel={copy("deleteConfirm")} pendingLabel={copy("deleting")} doneLabel={copy("deleted")} undoLabel={copy("undo")} undoingLabel={copy("restoring")} errorLabel={copy("deleteAllError")}
            resultTimeout={8000} onConfirm={removeAll} onUndo={() => restoreAll(bulkDone.current)} onStateChange={bulkPhaseChange} /></div></div>
      </div>
    </QueuePopup>}
  </div>;
}
