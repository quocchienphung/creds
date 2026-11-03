"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check } from "lucide-react";
import seed from "./analytics-seed.json";
import { AnimatedNumber } from "./AnimatedNumber";

export type ChartData = (typeof seed)[number]["charts"][number];
export function compact(value: number, currency = false) {
  return `${currency ? "$" : ""}${Math.abs(value) >= 1000 ? `${Number((value / 1000).toFixed(1))}k` : Number(value.toFixed(1)).toLocaleString("en-US")}`;
}
// A fixed sampling grid makes period-to-period path interpolation continuous.
function chartPath(values: number[], max: number) {
  return Array.from({ length: 85 }, (_, index) => {
    const position = index / 84 * (values.length - 1);
    const low = Math.floor(position), high = Math.min(values.length - 1, low + 1);
    const value = values[low] + (values[high] - values[low]) * (position - low);
    return `${index ? "L" : "M"}${index / 84 * 100},${100 - value / max * 100}`;
  }).join(" ");
}
export function AnalyticsChart({ data, days, tall = false }: { data: ChartData; days: number; tall?: boolean }) {
  const { t: uiText } = useWorkspaceI18n();
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const [legend, setLegend] = useState(false);
  const [hidden, setHidden] = useState<string[]>([]);
  const reduce = useReducedMotion();
  const id = useId();
  const plotRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => { if (event.target instanceof Node && !plotRef.current?.contains(event.target)) setOpen(false); };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);
  const count = data.series[0].values.length;
  const point = Math.min(index, count - 1), x = point / (count - 1) * 100;
  const currency = data.value.startsWith("$");
  const total = Number(data.value.replace(/[^\d.]/g, "")) * (data.value.endsWith("k") ? 1000 : 1);
  const visible = data.series.filter(series => !hidden.includes(series.label));
  const sorted = [...visible].sort((a, b) => b.values[point] - a.values[point]);

  return <section className={`ui-kpi ui-as-rev__chart${tall ? " ui-as-rev__chart--tall" : ""}`} aria-labelledby={id} data-period={days}>
    <h3 className="ui-kpi__title" id={id}>{uiText(data.title)}</h3>
    <p className="ui-kpi__value"><AnimatedNumber value={total} format={value => compact(value, currency)} /><span className="ui-kpi__delta" data-trend="up">{uiText(data.delta)}</span></p>
    <div className="ui-kpi__chart">
      <div className="ui-kpi__yaxis" aria-hidden="true">{data.labels.map(label => <span key={label}>{uiText(label)}</span>)}</div>
      <div className="ui-kpi__plot" ref={plotRef} tabIndex={0} role="group" aria-label={uiText("{0} chart – use the arrow keys to read the values per day", [data.title])}
        onPointerDown={event=>{const box=event.currentTarget.getBoundingClientRect();setIndex(Math.max(0,Math.min(count-1,Math.round((event.clientX-box.left)/box.width*(count-1)))));setOpen(true);}}
        onPointerMove={event => {
          const box = event.currentTarget.getBoundingClientRect();
          setIndex(Math.max(0, Math.min(count - 1, Math.round((event.clientX - box.left) / box.width * (count - 1)))));
          setOpen(true);
        }} onPointerLeave={event => { if(event.pointerType !== "touch") setOpen(false); }} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onKeyDown={event => {
          if (event.key === "Escape") { setOpen(false); return; }
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault(); setOpen(true);
          setIndex(current => event.key === "Home" ? 0 : event.key === "End" ? count - 1 : Math.max(0, Math.min(count - 1, current + (event.key === "ArrowRight" ? 1 : -1))));
        }}>
        {[0, 50, 100].map(top => <span className="ui-kpi__grid" style={{ top: `${top}%` }} key={top} />)}
        <svg className="ui-kpi__lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {data.series.map(series => <motion.path key={series.label} initial={false} animate={{ d: chartPath(series.values, data.max), opacity: hidden.includes(series.label) ? 0.08 : 1 }} transition={{ duration: reduce ? 0 : 0.65, ease: [0.22, 1, 0.36, 1] }} stroke={series.color} vectorEffect="non-scaling-stroke" />)}
        </svg>
        <div className="ui-kpi__marker" data-open={open ? "" : undefined} aria-hidden="true"><span className="ui-kpi__guide" style={{ left: `${x}%` }} />{visible.map(series => <span className="ui-kpi__dot" key={series.label} style={{ left: `${x}%`, top: `${100 - series.values[point] / data.max * 100}%`, background: series.color }} />)}</div>
        <div className="ui-kpi__tooltip" data-side={x > 50 ? "left" : "right"} data-open={open ? "" : undefined} role="status" aria-live={open ? "polite" : "off"} aria-hidden={!open} style={{ left: `${x}%` }}><p className="ui-kpi__date">{uiText(data.dates[point])}</p><ul>{sorted.map(series => <li key={series.label}><span className="ui-kpi__swatch" style={{ background: series.color }} /><span className="ui-kpi__label">{uiText(series.label)}</span><span className="ui-kpi__num">{uiText(compact(series.values[point], currency))}</span></li>)}</ul></div>
      </div>
      <div className="ui-kpi__xaxis" aria-hidden="true">{data.xLabels.map((label, position) => <span data-edge={position === 0 ? "start" : position === 2 ? "end" : undefined} style={{ left: `${position * 50}%` }} key={`${position}-${label}`}>{uiText(label)}</span>)}</div>
    </div>
    <div className="analytics-chart-footer"><button type="button" className="ui-kpi__footer" aria-expanded={legend} onClick={() => setLegend(!legend)}>{uiText(data.footer)}</button>
      <AnimatePresence>{legend && <motion.div className="analytics-legend" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: reduce ? 0 : 0.22 }}>
        {data.series.map(series => <button type="button" role="checkbox" aria-checked={!hidden.includes(series.label)} key={series.label} onClick={() => setHidden(current => current.includes(series.label) ? current.filter(value => value !== series.label) : current.length < data.series.length - 1 ? [...current, series.label] : current)}><span style={{ background: series.color }} />{uiText(series.label)}{!hidden.includes(series.label) && <Check size={12} />}</button>)}
      </motion.div>}</AnimatePresence>
    </div>
  </section>;
}
