"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ChevronDown } from "lucide-react";
import type { Issue, IssueStatus } from "./engine/types";
import { CATEGORY_LABEL, SEVERITY_LABEL, STATUS_LABEL, cellRef, severityTone, statusTone } from "../labels";

const ROW = 44; // the data table's row height (affectui-crm/reference.css): the virtual window below depends on it
const OVERSCAN = 6;

export interface TableRow { issue: Issue; status: IssueStatus; /** What the cell holds now (original or approved value). */ current: string; edited: boolean }
export type SortKey = "row" | "field" | "severity" | "problem" | "status";
export interface SortState { key: SortKey; dir: "asc" | "desc" }
const COLUMNS: { key: SortKey | null; label: string; width: string }[] = [
  { key: "row", label: "Row", width: "92px" }, { key: null, label: "Cell", width: "80px" }, { key: "field", label: "Field", width: "128px" },
  { key: "problem", label: "Problem", width: "248px" }, { key: null, label: "Original", width: "" }, { key: null, label: "New", width: "" }, { key: "status", label: "Status", width: "108px" },
];

/**
 * The issue list, on the same table the CRM uses (`.ui-dt`): 44 px rows, column heads that sort, a tinted selected row, the card and its
 * header. Only the rows in view are in the DOM, so a workbook with tens of thousands of findings stays smooth. Arrow keys move the
 * selection, Enter hands focus to the editor. Cell text is rendered as text and cut to one line; the full text is on the file face above.
 */
export function IssueTable({ rows, selected, onSelect, onActivate, sort, onSort, onMenu }: { rows: TableRow[]; selected: number; onSelect: (index: number) => void; onActivate: () => void; sort: SortState; onSort: (key: SortKey) => void; /** Right click (or the Menu key) on a row: the Orbit menu of that issue. */ onMenu?: (index: number, at: { x: number; y: number }, element: HTMLElement) => void }) {
  const { t: uiText } = useWorkspaceI18n();
  const scroller = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ top: 0, height: 360 });

  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    const measure = () => setView(current => ({ ...current, height: node.clientHeight }));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  // Keep the selected row in view, whichever way the selection was changed (gallery, keyboard, filters, sorting).
  useEffect(() => {
    const node = scroller.current;
    if (!node || selected < 0) return;
    const top = selected * ROW, head = 44;
    if (top < node.scrollTop) node.scrollTop = top;
    else if (top + ROW + head > node.scrollTop + node.clientHeight) node.scrollTop = top + ROW + head - node.clientHeight;
  }, [selected, rows.length]);

  const first = Math.max(0, Math.floor(view.top / ROW) - OVERSCAN);
  const last = Math.min(rows.length, Math.ceil((view.top + view.height) / ROW) + OVERSCAN);
  function keys(event: KeyboardEvent) {
    const move = (to: number) => { event.preventDefault(); onSelect(Math.max(0, Math.min(rows.length - 1, to))); };
    if (event.key === "ArrowDown") move(selected + 1); else if (event.key === "ArrowUp") move(selected - 1);
    else if (event.key === "PageDown") move(selected + 8); else if (event.key === "PageUp") move(selected - 8);
    else if (event.key === "Home") move(0); else if (event.key === "End") move(rows.length - 1);
    else if (event.key === "Enter") { event.preventDefault(); onActivate(); }
    else if (onMenu && (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10"))) { event.preventDefault(); const holder = event.currentTarget as HTMLElement; const row = holder.querySelector<HTMLElement>("tr[data-selected]"); const box = (row ?? holder).getBoundingClientRect(); onMenu(selected, { x: box.left + 120, y: box.top + box.height / 2 }, row ?? holder); }
  }
  const spacer = (height: number, key: string) => height > 0 ? <tr key={key} aria-hidden="true"><td colSpan={COLUMNS.length} style={{ height, padding: 0, border: 0 }} /></tr> : null;
  return <div className="ui-dt ci-dt">
    <div className="ui-dt__head"><h2 className="ui-dt__title">{uiText("Issues")} <span className="ci-count">{rows.length}</span></h2></div>
    <div className="ui-dt__card"><div className="ui-dt__scroll ci-scroll" ref={scroller} tabIndex={0} aria-label={uiText("Issues")} onScroll={event => setView({ top: event.currentTarget.scrollTop, height: event.currentTarget.clientHeight })} onKeyDown={keys}>
      <table className="ui-dt__table" role="grid" aria-rowcount={rows.length + 1} aria-colcount={COLUMNS.length}>
        <colgroup>{COLUMNS.map(column => <col key={column.label} style={column.width ? { width: column.width } : undefined} />)}</colgroup>
        <thead><tr>{COLUMNS.map(column => <th key={column.label} scope="col" aria-sort={column.key && sort.key === column.key ? sort.dir === "asc" ? "ascending" : "descending" : "none"}>
          {column.key ? <button type="button" className="ui-dt__th" onClick={() => onSort(column.key!)}><span className="ui-dt__th-label">{uiText(column.label)}</span><span className="ui-dt__sort" data-dir={sort.key === column.key ? (sort.dir === "asc" ? "asc" : "desc") : undefined} aria-hidden="true"><ChevronDown size={14} /></span></button>
            : <span className="ui-dt__th ci-th-plain"><span className="ui-dt__th-label">{uiText(column.label)}</span></span>}
        </th>)}</tr></thead>
        <tbody aria-live="polite">
          {spacer(first * ROW, "top")}
          {rows.slice(first, last).map((row, offset) => {
            const at = first + offset, issue = row.issue;
            return <tr key={issue.id} aria-rowindex={at + 2} aria-selected={at === selected} data-selected={at === selected || undefined} onClick={() => onSelect(at)} onDoubleClick={onActivate} onContextMenu={event => { if (!onMenu) return; event.preventDefault(); onMenu(at, { x: event.clientX, y: event.clientY }, event.currentTarget); }}>
              <td className="ci-num">{issue.row}</td>
              <td className="ci-ref">{cellRef(issue)}</td>
              <td title={issue.field}>{issue.field}</td>
              <td><span className="ci-problem"><span className="ui-sb-pill" data-tone={severityTone(issue.severity)}>{uiText(SEVERITY_LABEL[issue.severity])}</span><span className="ci-cat">{uiText(CATEGORY_LABEL[issue.category])}</span></span></td>
              <td title={issue.originalValue}>{visible(issue.originalValue) || <i className="ci-dash">{uiText("(empty)")}</i>}</td>
              <td className="ci-new" data-edited={row.edited || undefined} title={row.edited ? row.current : undefined}>{row.edited ? visible(row.current) || <i className="ci-dash">{uiText("(empty)")}</i> : <span className="ci-dash">—</span>}</td>
              <td><span className="ui-sb-pill" data-tone={statusTone(row.status)}>{uiText(STATUS_LABEL[row.status])}</span></td>
            </tr>;
          })}
          {spacer((rows.length - last) * ROW, "bottom")}
        </tbody>
      </table>
      {rows.length === 0 && <p className="ui-dt__empty" role="status">{uiText("No issue matches the filters.")}</p>}
    </div></div>
    <div className="ui-dt__foot" aria-live="polite"><span>{rows.length ? uiText("{0} of {1}", [Math.max(0, selected) + 1, rows.length]) : uiText("0 issues")}</span></div>
  </div>;
}

/** Make characters that cannot be seen visible in a one-line preview. */
function visible(text: string): string {
  return text.replace(/[\t]/g, "⇥").replace(/[\r\n]/g, "↵").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u200b-‏\u2028\u2029‪-‮⁠-⁤\u00ad\ufeff]/g, () => "·").slice(0, 160);
}
