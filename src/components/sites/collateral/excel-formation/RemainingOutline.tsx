"use client";

import { useMemo, useState } from "react";
import { CircleCheck, RefreshCw, Search } from "lucide-react";
import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { columnLetters } from "./engine/text";
import { RESIDUAL_KINDS, type ResidualItem, type ResidualKind, type ResidualReport } from "./engine/residual";
import { previewKey } from "./preview-model";
import "./remaining-outline.css";

const KIND_LABEL: Record<ResidualKind, string> = { question_mark: "Missing characters (?)", mojibake: "Garbled encoding", accented: "Accented text", locked: "Locked cells (formula, merged, rich text)", strange: "Unusual characters", spacing: "Extra spaces", invisible: "Hidden characters", other: "Other" };
const PAGE = 100;
const ref = (item: ResidualItem) => `${columnLetters(item.col)}${item.row}`;

/** The cell text with every damaged spot marked, so the problem can be read at a glance. */
function Snippet({ text }: { text: string }) {
  return <>{text.split(/([?�]+)/).map((part, i) => i % 2 ? <mark key={i}>{part}</mark> : part)}</>;
}

/** What is still wrong in the workbook as it would be exported, grouped by worksheet; a click opens the cell in the preview. */
export function RemainingOutline({ report, scanning, error, activeKey, disabled, onPick, onScan, onReview, onFill }: {
  report: ResidualReport | null; scanning: boolean; error: string; activeKey: string; disabled: boolean;
  onPick: (item: ResidualItem) => void; onScan: () => void; onReview: () => void; onFill: () => void;
}) {
  const { t } = useWorkspaceI18n();
  const [query, setQuery] = useState(""), [kind, setKind] = useState<ResidualKind | "all">("all"), [shown, setShown] = useState<Record<string, number>>({});
  const totals = useMemo(() => { const out: Record<ResidualKind, number> = { question_mark: 0, mojibake: 0, accented: 0, locked: 0, strange: 0, spacing: 0, invisible: 0, other: 0 }; for (const sheet of report?.bySheet ?? []) for (const k of RESIDUAL_KINDS) out[k] += sheet.counts[k]; return out; }, [report]);
  const groups = useMemo(() => {
    const text = query.trim().toLocaleLowerCase(), out = new Map<string, ResidualItem[]>();
    for (const item of report?.items ?? []) {
      if (kind !== "all" && item.kind !== kind) continue;
      if (text && !`${ref(item)} ${item.sheet} ${item.snippet}`.toLocaleLowerCase().includes(text)) continue;
      const list = out.get(item.sheet); if (list) list.push(item); else out.set(item.sheet, [item]);
    }
    return [...out];
  }, [report, query, kind]);
  const matches = groups.reduce((n, [, list]) => n + list.length, 0);

  return <aside className="ro" aria-label={t("Remaining issues")} aria-busy={scanning}>
    <header className="ro-top">
      <span className="ro-title">{t("Remaining issues")}<span className="fp-pill" data-warning={(report?.total ?? 0) > 0 || undefined}>{(report?.total ?? 0).toLocaleString()}</span></span>
      <button type="button" className="ro-icon" aria-label={t("Scan again")} title={t("Scan again")} disabled={disabled || scanning} onClick={onScan}><RefreshCw size={14} aria-hidden="true" data-spin={scanning || undefined} /></button>
    </header>
    <label className="ro-search"><Search size={13} aria-hidden="true" /><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t("Search cell, sheet or text")} aria-label={t("Search cell, sheet or text")} /></label>
    <div className="ro-kinds" role="group" aria-label={t("Issue type")}>
      <button type="button" aria-pressed={kind === "all"} onClick={() => setKind("all")}>{t("All")}</button>
      {RESIDUAL_KINDS.filter(k => totals[k] > 0).map(k => <button type="button" key={k} aria-pressed={kind === k} onClick={() => setKind(k)}>{t(KIND_LABEL[k])}<span>{totals[k].toLocaleString()}</span></button>)}
    </div>
    <div className="ro-body">
      {error ? <p className="ro-note" role="alert">{error}<button type="button" onClick={onScan}>{t("Retry")}</button></p>
        : !report ? <p className="ro-note" role="status">{t("Scanning the workbook for remaining issues…")}</p>
        : report.total === 0 ? <p className="ro-note" data-ok role="status"><CircleCheck size={14} aria-hidden="true" />{t("No issues found in the workbook as it will be exported.")}</p>
        : !matches ? <p className="ro-note" role="status">{t("No match")}</p>
        : groups.map(([sheet, items]) => {
          const limit = shown[sheet] ?? PAGE;
          return <details key={sheet} className="ro-group" open>
            <summary><span>{sheet}</span><span className="fp-pill">{items.length.toLocaleString()}</span></summary>
            <ul>{items.slice(0, limit).map(item => {
              const key = previewKey(item);
              return <li key={key}><button type="button" className="ro-item" data-kind={item.kind} aria-current={key === activeKey || undefined} disabled={disabled} onClick={() => onPick(item)}>
                <span className="ro-ref">{ref(item)}</span><span className="ro-snippet"><Snippet text={item.snippet} /></span>
              </button></li>;
            })}</ul>
            {items.length > limit && <button type="button" className="ro-more" onClick={() => setShown(current => ({ ...current, [sheet]: limit + PAGE }))}>{t("Show more")} ({(items.length - limit).toLocaleString()})</button>}
          </details>;
        })}
    </div>
    {report?.truncated && <p className="ro-foot">{t("Showing the first {0} of {1}. Fix some and scan again to see the rest.", [report.items.length.toLocaleString(), report.total.toLocaleString()])}</p>}
    {totals.question_mark > 0 && <button type="button" className="ro-fill" disabled={disabled || scanning} onClick={onFill} title={t("Last step, when the automatic repair cannot predict any further. Every ? still left in a text cell, code columns included, becomes the letter a. Undo takes it back.")}>{t("Fill the remaining ? with a")} ({totals.question_mark.toLocaleString()})</button>}
    <button type="button" className="ro-link" onClick={onReview}>{t("Open the Review step")}</button>
  </aside>;
}
