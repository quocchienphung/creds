"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { AnimatedNumber } from "./AnimatedNumber";
import { Segmented } from "./Segmented";
import { SplitBar } from "../split-bar/SplitBar";
import { SAMPLE_WEEK } from "./sample-week.ts";
import { GROUPING_LABELS, breakdownGroups, groupCells, groupOfCell, groupingsOf, hiddenSummary, maskedMetric, type GroupingId } from "./terrain-breakdown.ts";
import { TerrainEngine, type HighlightSource } from "./terrain-engine.ts";
import { rampColors } from "./terrain-colors.ts";
import { HOURS } from "./terrain-constants.ts";
import {
  DAY_NAMES, METRIC_IDS, buildWorkspaceWeek, cellDetail, describeCell, describeWeek, formatCount, formatDelta, hourLabel, summarize, unitOf,
  type MetricId, type TerrainEvent, type WeekData,
} from "./terrain-data.ts";
import type { Mode } from "./terrain-camera.ts";
import "./activity-terrain.css";

type Source = "workspace" | "sample";
const METRIC_OPTIONS = METRIC_IDS.map(id => ({ value: id, label: id === "operations" ? "Operations" : id === "deliveries" ? "Deliveries" : "Errors" }));
const MODE_OPTIONS = [{ value: "perspective", label: "Perspective" }, { value: "top", label: "Top view" }] as const satisfies readonly { value: Mode; label: string }[];
const SOURCE_OPTIONS = [{ value: "workspace", label: "Your activity" }, { value: "sample", label: "Sample week" }] as const satisfies readonly { value: Source; label: string }[];

const shortDay = (day: number) => DAY_NAMES[day].slice(0, 3);
const percent = (value: number) => `${(Math.round(value * 10) / 10).toFixed(1)}%`;

/**
 * The shape of the workspace's week: operations, deliveries and errors by hour as a 3D terrain you can orbit, zoom, fly into and flatten into a heatmap.
 * Rebuilt from the public UIArc "Activity terrain" preview (see docs/research/uiarc-terrain); the numbers are this workspace's own recorded operations,
 * or, while there are none (or when asked), a sample week that is always labelled as one.
 */
export function ActivityTerrain({ events }: { events: readonly TerrainEvent[] }) {
  const { t: uiText } = useWorkspaceI18n();
  const titleId = useId(), hintId = useId();
  const [now] = useState(() => Date.now());
  const [choice, setChoice] = useState<Source | null>(null);
  const [metricId, setMetricId] = useState<MetricId>("operations");
  const [mode, setMode] = useState<Mode>("perspective");
  const [highlight, setHighlight] = useState<{ index: number; source: HighlightSource } | null>(null);
  const [panelIndex, setPanelIndex] = useState<number | null>(null);
  const [flyIndex, setFlyIndex] = useState<number | null>(null);
  const [live, setLive] = useState("");
  // the split bar under the terrain: how the week is split, what is switched off (it leaves the terrain), and the part the bar's own pointer lit
  const [groupingChoice, setGroupingChoice] = useState<GroupingId>("day");
  const [hidden, setHidden] = useState<string[]>([]);
  const [focusId, setFocusId] = useState<string | null>(null);
  const plotRef = useRef<HTMLDivElement>(null), canvasRef = useRef<HTMLCanvasElement>(null), panelRef = useRef<HTMLDivElement>(null), engineRef = useRef<TerrainEngine | null>(null);
  const shown = useRef(false), dataKey = useRef("");

  const workspace = useMemo<WeekData>(() => buildWorkspaceWeek(events, now), [events, now]);
  const hasOwn = workspace.metrics.operations.values.some(v => v > 0) || workspace.metrics.operations.previous.some(v => v > 0);
  const source: Source = choice ?? (hasOwn ? "workspace" : "sample");
  const week = source === "sample" ? SAMPLE_WEEK : workspace;
  const groupings = useMemo(() => groupingsOf(week), [week]);
  const grouping: GroupingId = groupings.includes(groupingChoice) ? groupingChoice : "day";
  const hiddenSet = useMemo(() => new Set(hidden), [hidden]);
  const metric = useMemo(() => maskedMetric(week, metricId, grouping, hiddenSet), [week, metricId, grouping, hiddenSet]);
  const splitSegments = useMemo(() => breakdownGroups(grouping, week, metricId).map(segment => ({ ...segment, label: uiText(segment.label), short: uiText(segment.short) })), [grouping, week, metricId, uiText]);
  const leftOut = hiddenSummary(grouping, hiddenSet);
  const summary = useMemo(() => summarize(metric), [metric]);
  const peakIndex = summary.peak?.index ?? null;
  const empty = source === "workspace" && !summary.hasData;
  const detail = useMemo(() => (panelIndex === null ? null : cellDetail(metric, panelIndex)), [metric, panelIndex]);
  const ramp = useMemo(() => rampColors(metric.tone === "danger" ? "danger" : "neutral", false), [metric.tone]);
  const darkRamp = useMemo(() => rampColors(metric.tone === "danger" ? "danger" : "neutral", true), [metric.tone]);

  // the engine lives as long as the block does
  useEffect(() => {
    const canvas = canvasRef.current, plot = plotRef.current;
    if (!canvas || !plot) return;
    const engine = new TerrainEngine({
      canvas, plot, panel: panelRef.current,
      handlers: {
        onHighlight: (index, how) => {
          setHighlight(index === null ? null : { index, source: how });
          if (index !== null) setPanelIndex(index);
          if (index !== null && how !== "pointer") setLive(`${index}:${how}`);
        },
        onFly: index => setFlyIndex(index),
        onAnnounce: message => setLive(message),
      },
    });
    engineRef.current = engine;
    return () => { engine.destroy(); engineRef.current = null; shown.current = false; dataKey.current = ""; };
  }, []);

  // numbers -> columns: the first time they rise from nothing, afterwards as a quicker wave
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const key = `${source}:${metricId}:${metric.values.join(",")}`;
    if (key === dataKey.current) return;
    dataKey.current = key;
    engine.setData(metric.values, metric.tone === "danger" ? "danger" : "neutral", shown.current ? "metric" : "intro");
    shown.current = true;
  }, [metric, metricId, source]);
  useEffect(() => { engineRef.current?.setMode(mode); }, [mode]);
  useEffect(() => { engineRef.current?.setLocalize(uiText); }, [uiText]);
  useEffect(() => { engineRef.current?.setPeak(peakIndex); }, [peakIndex]);
  // the part of the split bar under the pointer lights its hours up: every other column fades back
  useEffect(() => {
    const known = focusId !== null && splitSegments.some(segment => segment.id === focusId);
    engineRef.current?.setFocus(known ? groupCells(grouping, week, metricId, focusId) : null);
  }, [focusId, splitSegments, grouping, week, metricId]);
  const changeGrouping = (value: GroupingId) => { setGroupingChoice(value); setHidden([]); setFocusId(null); };
  const barHighlight = highlight ? groupOfCell(grouping, week, metricId, highlight.index) : null;

  // the sentence a screen reader hears for the highlighted hour (kept out of the engine: it knows only numbers)
  const spoken = useMemo(() => {
    if (!live) return "";
    if (!/^\d+:/.test(live)) return live;
    const [index, how] = live.split(":");
    return describeCell(metric, cellDetail(metric, Number(index)), how === "fly");
  }, [live, metric]);

  const unit = metric.plural;
  const busiest = summary.busiest;
  const delta = summary.delta;
  const tone = delta === null ? undefined : (delta >= 0) === (metric.tone !== "danger") ? "good" : "bad";
  const detailTone = detail && detail.change !== null ? ((detail.change >= 0) === (metric.tone !== "danger") ? "good" : "bad") : undefined;

  return <section className="sk-terrain" aria-labelledby={titleId}>
    <div className="at" data-metric={metricId} data-source={source}>
      <div className="at__inner">
        <header className="at__header">
          <div>
            <h2 id={titleId}>{uiText("The shape of your week")}</h2>
            <p>{uiText("Hourly ")}{uiText(METRIC_OPTIONS.map(option => option.label.toLowerCase()).join(", ").replace(/, ([^,]*)$/, " and $1"))} {uiText(" for ")}{uiText(week.rangeLabel)}{uiText(", in workspace time.")}</p>
          </div>
          <Segmented label={uiText("Data")} value={source} options={SOURCE_OPTIONS} onChange={value => { setChoice(value); setFlyIndex(null); setHidden([]); setFocusId(null); }} />
        </header>
        <div className="at__toolbar">
          <Segmented label={uiText("Metric")} value={metricId} options={METRIC_OPTIONS} onChange={setMetricId} />
          <Segmented label={uiText("Camera")} value={mode} options={MODE_OPTIONS} onChange={setMode} />
        </div>
        <div className="at__body">
          <div className="at__stage">
            <div className="at__viewport">
              <div ref={plotRef} className="at__plot" tabIndex={0} role="group" aria-label={uiText("{0} terrain", [metric.label])} aria-describedby={hintId}>
                <canvas ref={canvasRef} className="at__canvas" role="img" aria-label={uiText(describeWeek(metric, week, summary))} />
                <div ref={panelRef} className="at__panel" aria-hidden="true" data-show={highlight ? "" : undefined}>
                  {detail && <>
                    <p className="at__panelHead"><span>{uiText(DAY_NAMES[detail.day])}</span><span>{uiText(hourLabel(detail.hour))} {uiText(" to ")}{uiText(hourLabel((detail.hour + 1) % HOURS))}</span></p>
                    <p className="at__panelValue">{uiText(formatCount(detail.value))} <span>{uiText(unitOf(metric, detail.value))}</span></p>
                    <dl className="at__panelRows">
                      <div><dt>{uiText("Last week")}</dt><dd>{uiText(formatCount(detail.previous))}</dd></div>
                      <div><dt>{uiText("Change")}</dt><dd data-tone={detailTone}>{uiText(formatDelta(detail.change))}</dd></div>
                      <div><dt>{uiText("Share of ")}{uiText(shortDay(detail.day))}</dt><dd>{uiText(percent(detail.share))}</dd></div>
                    </dl>
                    <span className="at__spark" aria-hidden="true">{detail.spark.map((value, hour) => <span key={hour} style={{ "--v": value } as React.CSSProperties} data-on={hour === detail.hour ? "" : undefined} />)}</span>
                  </>}
                </div>
                {empty && <div className="at__empty" role="status">
                  <p><strong>{uiText("Nothing recorded this week yet")}</strong>{uiText("Import, save or deliver a skill and its hour shows up here.")}</p>
                  <button type="button" onClick={() => setChoice("sample")}>{uiText("Preview a sample week")}</button>
                </div>}
              </div>
              <button type="button" className="at__reset" data-hidden={flyIndex === null ? "" : undefined} aria-hidden={flyIndex === null || undefined} tabIndex={flyIndex === null ? -1 : 0} onClick={() => engineRef.current?.resetView()}><RotateCcw size={16} aria-hidden="true" />{uiText("Reset view")}</button>
            </div>
            <div className="at__legend">
              <span className="at__scale" aria-hidden="true">{uiText("Fewer")}<span className="at__ramp">{ramp.map((color, index) => <span key={index} style={{ "--light": color, "--dark": darkRamp[index] } as React.CSSProperties} />)}</span>{uiText("More")}</span>
              <p id={hintId} className="at__hint">
                <span className="at__hintFine">{uiText("Drag to orbit, pinch to zoom, click a bar to fly in.")}</span>
                <span className="at__hintTouch">{uiText("Swipe sideways to orbit, tap a bar to fly in.")}</span>
                <span className="at__sr"> {uiText(" Arrow keys move between hours and days, Enter focuses a bar, Shift with arrow keys orbits, plus and minus zoom, Escape clears.")}</span>
              </p>
            </div>
          </div>
          <aside className="at__stats" aria-label={uiText("Week summary")}>
            <div className="at__stat">
              <p className="at__label">{uiText(metric.label)} {uiText(leftOut ? uiText("in view") : uiText("this week"))}</p>
              <p className="at__big"><AnimatedNumber text={formatCount(summary.total)} /></p>
              <span className="at__delta" data-tone={tone}>
                <span className="at__deltaIcon" aria-hidden="true">{uiText(delta === null ? "–" : delta >= 0 ? "↗" : "↘")}</span>
                <span className="at__deltaValue">{uiText(formatDelta(delta))}</span>
                <span>{uiText(delta === null ? uiText("no earlier week to compare") : uiText("vs last week"))}</span>
              </span>
            </div>
            <div className="at__stat">
              <p className="at__label">{uiText("Peak hours")}</p>
              <ul className="at__peaks">
                {summary.peaks.length === 0 && <li className="at__none">{uiText("No busy hours yet")}</li>}
                {summary.peaks.map(peak => <li key={peak.index}>
                  <button type="button" className="at__peak" aria-pressed={flyIndex === peak.index} aria-label={uiText("{0} {1}, {2} {3}. Fly to this hour", [DAY_NAMES[peak.day], hourLabel(peak.hour), formatCount(peak.value), unitOf(metric, peak.value)])} onClick={() => (flyIndex === peak.index ? engineRef.current?.exitFly() : engineRef.current?.flyTo(peak.index))}>
                    <span>{uiText(shortDay(peak.day))} {uiText(hourLabel(peak.hour))}</span>
                    <span className="at__peakValue"><AnimatedNumber text={formatCount(peak.value)} /></span>
                  </button>
                </li>)}
              </ul>
            </div>
            <div className="at__stat">
              <p className="at__label">{uiText("Busiest day")}</p>
              <p className="at__mid">{uiText(busiest ? DAY_NAMES[busiest.day] : "—")}</p>
              <p className="at__sub">{busiest ? <><AnimatedNumber text={formatCount(busiest.total)} /> {uiText(unitOf(metric, busiest.total))}, <AnimatedNumber text={percent(busiest.workingShare)} /> {uiText(" in working hours")}</> : uiText("No {0} yet", [unit])}</p>
            </div>
          </aside>
        </div>
        <div className="at__split">
          <div className="at__splitTop">
            <Segmented label={uiText("Split the week by")} value={grouping} options={groupings.map(id => ({ value: id, label: GROUPING_LABELS[id] }))} onChange={changeGrouping} />
            {leftOut && <p className="at__splitNote"><span>{uiText("Left out of the terrain: ")}{uiText(leftOut)}.</span><button type="button" onClick={() => { setHidden([]); setFocusId(null); }}>{uiText("Show all")}</button></p>}
          </div>
          <SplitBar
            title={uiText("Where the week went")} tone={metric.tone === "danger" ? "danger" : "neutral"}
            description={uiText("{0} by {1}, {2}. Switch a part off to leave it out of the terrain.", [uiText(metric.label), uiText(GROUPING_LABELS[grouping]), week.rangeLabel])}
            segments={splitSegments} unit={metric.plural} totalLabel={leftOut ? "In view" : "This week"} emptyLabel="Nothing recorded this week yet"
            hidden={hidden} onHiddenChange={setHidden} highlightId={barHighlight} onHighlightChange={setFocusId} />
        </div>
        <p className="at__sr" aria-live="polite">{uiText(spoken)}</p>
        <div className="at__sr">
          <table>
            <caption>{uiText(metric.label)} {uiText(" per hour, ")}{uiText(week.rangeLabel)}{uiText(", workspace time")}{uiText(source === "sample" ? uiText(" (sample week)") : "")}</caption>
            <thead><tr><th scope="col">{uiText("Day")}</th>{Array.from({ length: HOURS }, (_, hour) => <th scope="col" key={hour}>{uiText(hourLabel(hour))}</th>)}</tr></thead>
            <tbody>{DAY_NAMES.map((name, day) => <tr key={name}><th scope="row">{name}</th>{metric.values.slice(day * HOURS, (day + 1) * HOURS).map((value, hour) => <td key={hour}>{uiText(formatCount(value))}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </div>
      {source === "sample" && <p className="at__note">{uiText(hasOwn ? uiText("Showing a sample week, not your operations.") : uiText("A sample week, so there is something to explore. Your own operations replace it as soon as you import, save or deliver a skill."))}</p>}
    </div>
  </section>;
}

