"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { normalizeStripeNavigation } from "@/lib/stripe-navigation";
import { useEffect, useRef, useState, type KeyboardEvent, type ClipboardEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { MenuSurface } from "@/components/interaction/MenuSurface";
import { ArrowDown, Check, Copy, Plus, Trash2 } from "lucide-react";
import { CrmIcon } from "./CrmIcon";
import { columns, emptyCompany, numberFormat, setCell, tones, type Company, type CrmEngine } from "./crm-engine";

type Cell = { id: string; col: number };
type Picker = { cell: Cell; left: number; top: number; width: number };

export function CrmTable({ engine, filter, defaultOwner = "", onAddRow }: { engine: CrmEngine; filter?: (row: Company) => boolean; defaultOwner?: string; onAddRow?: () => void }) {
  const { t: uiText } = useWorkspaceI18n();
  const { rows, change, undo, redo, canUndo, canRedo } = engine;
  const [sort, setSort] = useState<{ col: number; direction: 1 | -1 } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [active, setActive] = useState<Cell | null>(null);
  const [end, setEnd] = useState<Cell | null>(null);
  const [editing, setEditing] = useState<Cell | null>(null);
  const [draft, setDraft] = useState("");
  const [picker, setPicker] = useState<Picker | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const cancelBlur = useRef(false);
  const reduce = useReducedMotion();
  const filtered = filter ? rows.filter(filter) : rows;
  const visible = sort ? [...filtered].sort((a, b) => {
    const key = columns[sort.col].key;
    const av = a[key], bv = b[key];
    return (typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv))) * sort.direction;
  }) : filtered;
  const activeIndex = visible.findIndex(r => r.id === active?.id);
  const endIndex = visible.findIndex(r => r.id === (end || active)?.id);
  const minRow = Math.min(activeIndex, endIndex), maxRow = Math.max(activeIndex, endIndex);
  const minCol = Math.min(active?.col ?? 0, end?.col ?? active?.col ?? 0);
  const maxCol = Math.max(active?.col ?? 0, end?.col ?? active?.col ?? 0);

  useEffect(() => {
    const release = () => { dragging.current = false; };
    const dismiss = (event: Event) => {
      if (event.target instanceof Element && !event.target.closest('.ui-dt__picker, [data-editing]')) setPicker(null);
    };
    window.addEventListener("pointerup", release);
    document.addEventListener("pointerdown", dismiss);
    return () => { window.removeEventListener("pointerup", release); document.removeEventListener("pointerdown", dismiss); };
  }, []);

  function update(cell: Cell, value: string) {
    change(rows.map(row => row.id === cell.id ? setCell(row, columns[cell.col].key, value) : row));
  }
  function focus(cell: Cell, extend = false) {
    if (extend && active) setEnd(cell);
    else { setActive(cell); setEnd(null); }
    scrollRef.current?.focus({ preventScroll: true });
  }
  function startEdit(cell: Cell, target?: HTMLElement, first?: string) {
    cancelBlur.current = false;
    const row = rows.find(r => r.id === cell.id);
    if (!row) return;
    setActive(cell); setEnd(null);
    if (columns[cell.col].type === "tag" && target) {
      const rect = target.getBoundingClientRect();
      setPicker({ cell, left: Math.min(rect.left, window.innerWidth - 185), top: Math.min(rect.top, window.innerHeight - 250), width: Math.max(168, rect.width) });
    } else { setEditing(cell); setDraft(first ?? String(row[columns[cell.col].key])); }
  }
  function move(rowDelta: number, colDelta: number, extend = false) {
    if (!active || !visible.length) return;
    let row = visible.findIndex(r => r.id === (extend ? end || active : active).id);
    let col = (extend ? end || active : active).col + colDelta;
    if (col > 6) { col = 0; row++; }
    if (col < 0) { col = 6; row--; }
    row = Math.max(0, Math.min(visible.length - 1, row + rowDelta));
    const next = { id: visible[row].id, col };
    focus(next, extend);
    scrollRef.current?.querySelector<HTMLElement>(`[data-row-id="${next.id}"][data-col="${col}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target instanceof HTMLInputElement) return;
    const mod = event.metaKey || event.ctrlKey;
    if (mod && event.key.toLowerCase() === "z") { event.preventDefault(); if (event.shiftKey) redo(); else undo(); return; }
    if (mod && event.key.toLowerCase() === "y") { event.preventDefault(); redo(); return; }
    if (event.key === "Escape") { setPicker(null); setActive(null); setEnd(null); setSelected([]); return; }
    if (!active) return;
    if (event.key.startsWith("Arrow")) {
      event.preventDefault();
      move(event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0, event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0, event.shiftKey);
    } else if (event.key === "Tab") { event.preventDefault(); move(0, event.shiftKey ? -1 : 1); }
    else if (event.key === "Enter" || event.key === "F2") {
      event.preventDefault(); startEdit(active, scrollRef.current?.querySelector<HTMLElement>(`[data-row-id="${active.id}"][data-col="${active.col}"]`) ?? undefined);
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      change(rows.map(row => {
        const index = visible.findIndex(r => r.id === row.id);
        let next = row;
        if (index >= minRow && index <= maxRow) for (let col = minCol; col <= maxCol; col++) next = setCell(next, columns[col].key, "");
        return next;
      }));
    } else if (event.key.length === 1 && !mod && !event.altKey) { event.preventDefault(); startEdit(active, undefined, event.key); }
  }
  function copy(event: ClipboardEvent) {
    if (!active || editing || event.target instanceof HTMLInputElement) return;
    const text = visible.slice(minRow, maxRow + 1).map(row => columns.slice(minCol, maxCol + 1).map(col => row[col.key]).join("\t")).join("\n");
    event.preventDefault(); event.clipboardData.setData("text/plain", text);
  }
  function paste(event: ClipboardEvent) {
    if (!active || editing || event.target instanceof HTMLInputElement) return;
    const text = event.clipboardData.getData("text/plain");
    if (!text) return;
    event.preventDefault();
    const matrix = text.replace(/\r/g, "").replace(/\n$/, "").split("\n").map(line => line.split("\t"));
    const next = [...rows];
    matrix.forEach((line, offset) => {
      const targetIndex = activeIndex + offset;
      let row = visible[targetIndex];
      if (!row) { row = { ...emptyCompany(), owner: defaultOwner }; next.push(row); }
      const index = next.findIndex(r => r.id === row.id);
      line.slice(0, 7 - active.col).forEach((value, col) => { next[index] = setCell(next[index], columns[active.col + col].key, value); });
    });
    onAddRow?.();
    change(next);
  }
  function checkbox(id: string | null) {
    const checked = id ? selected.includes(id) : !!visible.length && visible.every(row => selected.includes(row.id));
    return <button type="button" className="ui-dt__check" role="checkbox" aria-checked={id || !selected.length || checked ? checked : "mixed"} aria-label={uiText(id ? uiText("Select {0}", [rows.find(row => row.id === id)?.company || "new company"]) : uiText("Select all rows"))} onClick={() => setSelected(id ? checked ? selected.filter(value => value !== id) : [...selected, id] : checked ? [] : visible.map(row => row.id))}><Check size={12} /></button>;
  }
  const pickedCount = rows.filter(row => selected.includes(row.id)).length;
  const pickerColumn = picker ? columns[picker.cell.col].key : null;
  const options = pickerColumn ? [...new Set([...initialTagOptions(pickerColumn), ...rows.map(r => String(r[pickerColumn]))])].filter(Boolean) : [];

  return <div className="ui-dt">
    <div className="ui-dt__head"><span className="ui-dt__title-icon"><CrmIcon name="Table title" size={18} /></span><h2 className="ui-dt__title">{uiText("Company CRM")}</h2><div className="ui-dt__tools"><button type="button" className="ui-dt__tool" aria-label={uiText("Undo (Ctrl Z)")} title={uiText("Undo · Ctrl Z")} disabled={!canUndo} onClick={undo}><CrmIcon name="Undo (Ctrl Z)" /></button><button type="button" className="ui-dt__tool" aria-label={uiText("Redo (Ctrl Shift Z)")} title={uiText("Redo · Ctrl Shift Z")} disabled={!canRedo} onClick={redo}><CrmIcon name="Redo (Ctrl Shift Z)" /></button></div></div>
    <div className="ui-dt__card"><div className="ui-dt__morph"><div className="ui-dt__scroll" tabIndex={0} ref={scrollRef} aria-label={uiText("Company CRM spreadsheet")} onKeyDown={keyDown} onCopy={copy} onPaste={paste} onScroll={() => setPicker(null)}>
      <table className="ui-dt__table"><colgroup><col className="crm-col-select" /><col className="crm-col-company" /><col className="crm-col-wide" /><col className="crm-col-wide" /><col className="crm-col-normal" /><col className="crm-col-normal" /><col className="crm-col-normal" /><col /></colgroup>
        <thead><tr><th className="ui-dt__select" scope="col">{uiText(checkbox(null))}</th>{columns.map((col, index) => <th key={col.key} scope="col" aria-sort={sort?.col === index ? sort.direction === 1 ? "ascending" : "descending" : "none"}><button type="button" className="ui-dt__th" onClick={() => { setSort(sort?.col === index ? sort.direction === 1 ? { col: index, direction: -1 } : null : { col: index, direction: 1 }); setActive(null); setEnd(null); }}><span className="ui-dt__col-icon"><CrmIcon name={col.label} size={14} /></span><span className="ui-dt__th-label">{uiText(col.label)}</span><span className="ui-dt__sort" data-dir={sort?.col === index ? sort.direction === 1 ? "asc" : "desc" : undefined}><ArrowDown size={12} /></span></button></th>)}</tr></thead>
        <tbody><AnimatePresence initial={false}>{visible.map((row, rowIndex) => <motion.tr layout="position" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:reduce ? 0 : 0.18,layout:{duration:reduce ? 0 : 0.3,ease:[0.22,1,0.36,1]}}} key={row.id} data-selected={selected.includes(row.id) ? "" : undefined}><td className="ui-dt__select">{uiText(checkbox(row.id))}</td>{columns.map((col, colIndex) => {
          const cell = { id: row.id, col: colIndex };
          const isActive = active?.id === row.id && active.col === colIndex;
          const isEditing = editing?.id === row.id && editing.col === colIndex;
          const isPicker = picker?.cell.id === row.id && picker.cell.col === colIndex;
          const value = row[col.key];
          return <td key={col.key} data-cell="" data-row-id={row.id} data-col={colIndex} data-type={col.type} data-active={isActive ? "" : undefined} data-editing={isEditing || isPicker ? "" : undefined} data-in-range={active && rowIndex >= minRow && rowIndex <= maxRow && colIndex >= minCol && colIndex <= maxCol ? "" : undefined} onPointerDown={event => {
            if ((event.target instanceof Element && event.target.closest('input, a')) || isEditing || isPicker || event.button !== 0) return;
            event.preventDefault(); dragging.current = true; focus(cell, event.shiftKey);
          }} onPointerEnter={() => { if (dragging.current && !editing) setEnd(cell); }} onDoubleClick={event => { if (!(event.target instanceof HTMLInputElement)) startEdit(cell, event.currentTarget); }}>
            {isEditing ? <input autoFocus className="ui-dt__input" aria-label={uiText("Edit {0}", [col.label])} value={draft} onFocus={event => event.currentTarget.select()} onChange={event => setDraft(event.target.value)} onBlur={() => { if (!cancelBlur.current) update(cell, draft); cancelBlur.current = false; setEditing(null); }} onKeyDown={event => {
              if (event.key === "Escape") { event.preventDefault(); cancelBlur.current = true; setEditing(null); scrollRef.current?.focus(); }
              if (event.key === "Enter" || event.key === "Tab") { event.preventDefault(); cancelBlur.current = true; update(cell, draft); setEditing(null); if (event.key === "Tab") move(0, event.shiftKey ? -1 : 1); else move(event.shiftKey ? -1 : 1, 0); }
            }} /> : col.key === "company" ? <span className="ui-dt__name"><span className="ui-dt__logo"><CrmIcon name={row.company} size={18} /></span><span className="ui-dt__name-text" data-empty={!value ? "" : undefined}>{value || uiText("Untitled")}</span></span> : col.type === "tag" ? <span className="ui-dt__tag" data-tone={tones[String(value)] || "gray"}>{uiText(value)}</span> : col.type === "url" && value ? <a className="ui-dt__link" href={normalizeStripeNavigation(`https://${String(value).replace(/^https?:\/\//, "")}`)} target="_blank" rel="noreferrer">{value}</a> : <span className="ui-dt__text">{col.type === "number" ? numberFormat.format(Number(value)) : col.key === "lastContact" ? uiText(value) : value}</span>}
          </td>;
        })}</motion.tr>)}</AnimatePresence></tbody>
      </table>{!visible.length && <p className="ui-dt__empty">{uiText(rows.length ? uiText("No companies match this view.") : uiText("No rows yet. Add your first company."))}</p>}
    </div></div></div>
    <div className="ui-dt__foot">{pickedCount ? <div className="ui-dt__bulk"><span>{uiText(pickedCount)} {uiText(" selected")}</span><button type="button" className="ui-dt__add" onClick={() => { change([...rows, ...rows.filter(r => selected.includes(r.id)).map(r => ({ ...r, id: crypto.randomUUID() }))]); setSelected([]); }}><Copy size={14} />{uiText("Duplicate")}</button><button type="button" className="ui-dt__add ui-dt__add--danger" onClick={() => { change(rows.filter(r => !selected.includes(r.id))); setSelected([]); setActive(null); setEnd(null); }}><Trash2 size={14} />{uiText("Delete")}</button></div> : <button type="button" className="ui-dt__add" onClick={() => { const row = { ...emptyCompany(), owner: defaultOwner }; cancelBlur.current = false; onAddRow?.(); change([...rows, row]); setActive({id:row.id,col:0}); setEditing({id:row.id,col:0}); setDraft(""); }}><Plus size={14} />{uiText("Add row")}</button>}<span className="ui-dt__summary">{uiText(active && activeIndex >= 0 ? uiText("{0}{1}{2}", [String.fromCharCode(65 + active.col), activeIndex + 1, end ? `:${String.fromCharCode(65 + end.col)}${endIndex + 1}` : ""]) : uiText("Double-click a cell to edit"))}</span></div>
    <AnimatePresence>{picker && <MenuSurface className="ui-dt__picker" role="listbox" aria-label={uiText("Choose {0}", [columns[picker.cell.col].label])} style={{left:picker.left,top:picker.top,width:picker.width}} onKeyDown={event => {
      if (event.key === "Escape") { event.preventDefault(); setPicker(null); scrollRef.current?.focus(); }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled):not([aria-disabled="true"])')]; const index = buttons.indexOf(document.activeElement as HTMLButtonElement); buttons[(index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus(); }
    }}>{options.map((option, index) => <button type="button" key={option} role="option" autoFocus={index === 0} aria-selected={rows.find(r=>r.id===picker.cell.id)?.[columns[picker.cell.col].key] === option} className="ui-dt__option" onClick={() => { update(picker.cell, option); setPicker(null); scrollRef.current?.focus(); }}><span className="ui-dt__tag" data-tone={tones[option] || "gray"}>{uiText(option)}</span></button>)}</MenuSurface>}</AnimatePresence>
  </div>;
}

function initialTagOptions(key: keyof Company) {
  return key === "stage" ? ["Negotiation", "Proposal", "Won", "Qualified", "New", "Lost"] : ["Productivity", "Planning", "Design", "Payments", "E-commerce", "Developer Tools", "CRM"];
}
