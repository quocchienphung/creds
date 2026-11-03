"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { MenuSurface } from "@/components/interaction/MenuSurface";
import { Bookmark, Check, ChevronDown, Download, Trash2 } from "lucide-react";
import seed from "./analytics-seed.json";
import icons from "./icons.json";
import { AnalyticsChart } from "./AnalyticsChart";
import { AnimatedNumber } from "./AnimatedNumber";
import { WorkspaceDialog } from "../affectui-crm/WorkspaceDialog";
import { downloadFile, toCsv } from "../affectui-crm/workspace-state";
import "./analytics-reference.css";
import "./analytics-overrides.css";
import { conforms } from "@/lib/workspace-backend";
import { useQuery, useResource } from "@/lib/workspace-backend/react";
import { QueryNotice } from "@/lib/workspace-backend/SyncStatus";
import { resources } from "../workspace-resources";

export type AnalyticsPeriod = (typeof seed)[number];
/** What the backend's "analytics" answer must look like: the bundled sample's shape, with charts that can be drawn. */
const parsePeriod = (raw: unknown): AnalyticsPeriod | undefined => {
  if (!conforms(seed[0], raw)) return undefined;
  const period = raw as AnalyticsPeriod;
  const drawable = period.charts.length > 0 && period.charts.every(chart => chart.series.length > 0 && chart.series.every(line => line.values.length > 0 && line.values.length === chart.dates.length) && chart.xLabels.length >= 3);
  return drawable ? period : undefined;
};
export interface SavedReport { id: string; name: string; days: number; savedAt: string }
function AnalyticsIcon({ name }: { name: string }) {
  const svg = (icons as Record<string, string>)[name];
  return svg ? <span className="crm-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} /> : null;
}
const statInfo: Record<string, string> = {
  "Gross revenue": "Total revenue for the selected period, before operational expenses.",
  "Active customers": "Customers with at least one paid order during the selected period.",
  Conversion: "The percentage of sessions that resulted in a completed purchase.",
  "Refund rate": "The percentage of orders refunded during the selected period.",
  "Revenue breakdown": "A breakdown of gross sales, discounts, refunds, shipping and taxes.",
  "Top products": "Products ranked by revenue within the selected reporting period.",
};

export function Analytics({ workspaceId, notify }: { workspaceId: string; notify: (message: string) => void }) {
  const { t: uiText } = useWorkspaceI18n();
  const [days, setDays] = useResource(resources.reportPeriod, workspaceId,  7);
  const [saved, setSaved] = useResource(resources.reports, workspaceId,  []);
  const [periodMenu, setPeriodMenu] = useState(false);
  const [savedMenu, setSavedMenu] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [product, setProduct] = useState<string | null>(null);
  const reduce = useReducedMotion();
  const periodRef = useRef<HTMLDivElement>(null);
  const savedRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!periodMenu && !savedMenu) return;
    const outside = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (!periodRef.current?.contains(event.target)) setPeriodMenu(false);
      if (!savedRef.current?.contains(event.target)) setSavedMenu(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [periodMenu, savedMenu]);
  // The backend computes the report for the chosen period; the bundled sample is used when it has none.
  const report = useQuery("analytics", workspaceId, { days }, seed.find(period => period.days === days) || seed[0], parsePeriod);
  const data = report.data;
  const cap = (label: string) => <button type="button" className="ui-as-rev__cap" onClick={() => setInfo(info === label ? null : label)} aria-label={uiText("About {0}", [label.toLowerCase()])}>{uiText(label)}</button>;

  function exportReport() {
    setExporting(true);
    const rows: (string | number)[][] = [["Revenue report", `Last ${days} days`], ["Metric", "Value", "Change"], ...data.stats.map(stat => [stat.label, stat.value, stat.delta]), [], ["Breakdown", "Amount"], ...data.breakdown.map(item => [item.label, item.value]), [], ["Product", "Revenue"], ...data.products.map(item => [item.name, item.value])];
    for (const chart of data.charts) {
      rows.push([], [chart.title, ...chart.dates]);
      chart.series.forEach(series => rows.push([series.label, ...series.values]));
    }
    downloadFile(`revenue-last-${days}-days.csv`, toCsv(rows), "text/csv;charset=utf-8");
    window.setTimeout(() => { setExporting(false); notify("Revenue report exported"); }, 600);
  }

  return <div className="ui-as-rev" onKeyDown={event => { if (event.key === "Escape") { if (periodMenu) periodRef.current?.querySelector('button')?.focus(); else if (savedMenu) savedRef.current?.querySelector('button')?.focus(); setPeriodMenu(false); setSavedMenu(false); setInfo(null); } }}>
    <header className="ui-as-rev__head"><h1><AnalyticsIcon name="Revenue" />{uiText("Revenue")}</h1><div className="ui-as-rev__actions">
      <div className="ui-as-anchor" ref={periodRef} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setPeriodMenu(false); }} onKeyDown={event=>{
        if(!["ArrowDown","ArrowUp","Home","End"].includes(event.key))return;
        event.preventDefault();
        if(!periodMenu){setPeriodMenu(true);requestAnimationFrame(()=>periodRef.current?.querySelector<HTMLButtonElement>('[role="menuitemradio"]')?.focus());return;}
        const buttons=[...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]:not(:disabled):not([aria-disabled="true"])')];
        const index=buttons.indexOf(document.activeElement as HTMLButtonElement);
        buttons[event.key==="Home" ? 0 : event.key==="End" ? buttons.length-1 : (index+(event.key==="ArrowDown" ? 1 : -1)+buttons.length)%buttons.length]?.focus();
      }}><button type="button" className="ui-as-tool ui-as-tool--label ui-as-rev__period" aria-expanded={periodMenu} aria-haspopup="menu" onClick={() => setPeriodMenu(!periodMenu)}><AnalyticsIcon name="Last 7 days" />{uiText("Last ")}{uiText(days)} {uiText(" days")}<ChevronDown size={12} /></button>
        <AnimatePresence>{periodMenu && <MenuSurface role="menu" aria-label={uiText("Reporting period")} className="ui-as-popover ui-as-menu">{[7, 30, 90].map(value => <button type="button" className="ui-as-menu__item" role="menuitemradio" aria-checked={days === value} key={value} onClick={() => { setDays(value); setPeriodMenu(false); periodRef.current?.querySelector('button')?.focus(); }}>{uiText("Last ")}{uiText(value)} {uiText(" days")}{days === value && <Check size={13} />}</button>)}</MenuSurface>}</AnimatePresence>
      </div>
      <button type="button" className="ui-button" data-variant="secondary" data-size="sm" aria-busy={exporting} disabled={exporting} onClick={exportReport}><span className="ui-button__icon"><Download size={16} /></span><span className="ui-button__label">{uiText(exporting ? uiText("Exporting…") : uiText("Export"))}</span></button>
      {saved.length > 0 && <div className="ui-as-anchor" ref={savedRef} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setSavedMenu(false); }} onKeyDown={event => {
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        if (!savedMenu) { setSavedMenu(true); requestAnimationFrame(() => savedRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled):not([aria-disabled="true"])')?.focus()); return; }
        const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled):not([aria-disabled="true"])')];
        const index = items.indexOf(document.activeElement as HTMLButtonElement);
        items[event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
      }}><button type="button" className="ui-as-tool" aria-label={uiText("Saved reports")} aria-expanded={savedMenu} aria-haspopup="menu" onClick={() => setSavedMenu(!savedMenu)}><Bookmark size={15} /></button><AnimatePresence>{savedMenu && <MenuSurface className="ui-as-popover ui-as-menu analytics-saved" role="menu" aria-label={uiText("Saved reports")}><span className="ui-as-menu__title">{uiText("Saved reports")}</span>{saved.map(report => <div className="analytics-saved-row" key={report.id}><button type="button" role="menuitem" className="ui-as-menu__item" onClick={() => { setDays(report.days); setSavedMenu(false); savedRef.current?.querySelector('button')?.focus(); notify(`Opened ${report.name}`); }}>{uiText(report.name)}<small>{uiText("Last ")}{uiText(report.days)} {uiText(" days")}</small></button><button type="button" role="menuitem" className="ui-as-icon-btn" aria-label={uiText("Delete {0}", [report.name])} onClick={() => setSaved(saved.filter(item => item.id !== report.id))}><Trash2 size={13} /></button></div>)}</MenuSurface>}</AnimatePresence></div>}
      <button type="button" className="ui-button" data-variant="primary" data-size="sm" onClick={() => setSaveOpen(true)}><span className="ui-button__label">{uiText("Save as report")}</span></button>
    </div></header>
    <div className="ui-as-rev__content">
      <QueryNotice query={report} what="revenue report" />
      {report.phase === "ready" && <>
      <div className="ui-as-rev__stats">{data.stats.map((stat, index) => <motion.section className="ui-as-rev__card ui-as-rev__stat" key={stat.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduce ? 0 : 0.38, delay: reduce ? 0 : index * 0.035 }}>
        {uiText(cap(stat.label))}<div className="ui-as-rev__stat-row"><strong><AnimatedNumber value={stat.value} format={value => index === 0 ? `$${Math.round(value).toLocaleString("en-US")}` : index === 1 ? Math.round(value).toLocaleString("en-US") : `${value.toFixed(index === 2 ? 2 : 1)}%`} /><em>{uiText(stat.delta)}</em></strong><span className="ui-as-rev__minibars" aria-hidden="true">{stat.bars.map((height, bar) => <motion.i key={bar} animate={{ height }} transition={{ duration: reduce ? 0 : 0.7, delay: reduce ? 0 : bar * 0.025 }} />)}</span></div>
      </motion.section>)}</div>
      <div className="ui-as-rev__row ui-as-rev__row--main"><AnalyticsChart data={data.charts[0]} days={days} tall /><section className="ui-as-rev__card ui-as-rev__breakdown">{uiText(cap("Revenue breakdown"))}<ul>{data.breakdown.map(item => <li key={item.label}><span>{uiText(item.label)}</span><b><AnimatedNumber value={item.value} format={value => `${value < 0 ? "−" : ""}$${Math.round(Math.abs(value)).toLocaleString("en-US")}`} /></b><svg className="ui-as-rev__spark" data-tone={item.tone} viewBox="0 0 40 14" aria-hidden="true"><polyline points={item.points} /></svg></li>)}</ul></section></div>
      <div className="ui-as-rev__row ui-as-rev__row--3"><section className="ui-as-rev__card ui-as-rev__products">{uiText(cap("Top products"))}{data.products.map(item => <button type="button" className="ui-as-rev__product" key={item.name} onClick={() => setProduct(item.name)}><span>{item.name}<b><AnimatedNumber value={item.value} format={value => `$${Math.round(value).toLocaleString("en-US")}`} /></b></span><motion.i animate={{ width: item.width }} transition={{ duration: reduce ? 0 : 0.7 }} /></button>)}</section><AnalyticsChart data={data.charts[1]} days={days} /><AnalyticsChart data={data.charts[2]} days={days} /></div>
      </>}
    </div>
    <WorkspaceDialog open={saveOpen} title={uiText("Save report")} onClose={() => setSaveOpen(false)}><form onSubmit={event => { event.preventDefault(); const name = String(new FormData(event.currentTarget).get("name")).trim(); if (!name) return; setSaved(current => [...current, { id: crypto.randomUUID(), name, days, savedAt: new Date().toISOString() }]); setSaveOpen(false); notify("Saved to Reports"); }}><label className="crm-field">{uiText("Report name")}<input key={days} name="name" defaultValue={`Revenue · Last ${days} days`} required autoFocus maxLength={100} /></label><p>{uiText("Includes the selected reporting period and all revenue charts.")}</p><div className="workspace-form-actions"><button type="button" className="ui-as-tool ui-as-tool--label" onClick={() => setSaveOpen(false)}>{uiText("Cancel")}</button><button type="submit" className="ui-button" data-variant="primary" data-size="sm">{uiText("Save report")}</button></div></form></WorkspaceDialog>
    <WorkspaceDialog open={info !== null} title={uiText(info || uiText("Metric information"))} onClose={() => setInfo(null)}><p>{uiText(info ? statInfo[info] : "")}</p><p>{uiText("Reporting period: last ")}{uiText(days)} {uiText(" days.")}</p></WorkspaceDialog>
    <WorkspaceDialog open={product !== null} title={uiText(product || uiText("Product details"))} onClose={() => setProduct(null)}><p>{uiText("Revenue in the last ")}{uiText(days)} {uiText(" days")}</p><strong className="analytics-product-total">${data.products.find(item => item.name === product)?.value.toLocaleString("en-US")}</strong><p>{uiText("Share of reported gross revenue: ")}{((data.products.find(item => item.name === product)?.value || 0) / data.stats[0].value * 100).toFixed(1)}%</p><button type="button" className="ui-as-tool ui-as-tool--label" onClick={exportReport}><Download size={14} />{uiText("Export report")}</button></WorkspaceDialog>
  </div>;
}
