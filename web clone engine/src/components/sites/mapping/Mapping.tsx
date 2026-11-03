"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronRight, Maximize2, Minus, Pause, Play, Plus } from "lucide-react";
import { createLocalDataSource } from "./mapping-data-source";
import { SectionSkeleton } from "../shimmer-loader/SectionSkeleton";
import type { MappingDataSource } from "./mapping-data-source";
import { MappingEngine } from "./mapping-engine";
import { formatDue, healthLabels, MappingModel, statusLabels } from "./mapping-model";
import type { Palette } from "./mapping-painter";
import { createSampleData } from "./mapping-sample";
import { applyCommand } from "./mapping-store";
import type { MappingCommand, MappingData } from "./mapping-types";
import { DataPanel, EditPanel, PeoplePanel } from "./MappingEditor";
import "./mapping.css";

type Panel = "overview" | "edit" | "people" | "data";
type SaveState = "saved" | "saving" | "error";
const PANELS: { id: Panel; label: string }[] = [{ id: "overview", label: "Overview" }, { id: "edit", label: "Edit" }, { id: "people", label: "People" }, { id: "data", label: "Data" }];

function RollingNumber({ text }: { text: string }) {
  const { t: uiText } = useWorkspaceI18n();
  return <span className="mapping-roll"><span className="mapping-srOnly">{uiText(text)}</span><span className="mapping-rollVisual" aria-hidden="true">{[...text].map((char, index) => /\d/.test(char) ? <span key={`digit-${text.length - index}`} className="mapping-wheel"><span className="mapping-strip" style={{ "--d": Number(char), "--i": index } as CSSProperties}>{Array.from({ length: 10 }, (_, value) => <span key={value}>{uiText(value)}</span>)}</span></span> : <span className="mapping-sym" key={`symbol-${text.length - index}-${char}`}>{char}</span>)}</span></span>;
}
function Face({ model, person, size = 28 }: { model: MappingModel; person: number; size?: number }) {
  const data = model.person(person);
  return <span className="mapping-face" style={{ width: size, height: size }}>{data.avatarUrl
    ? <img src={data.avatarUrl} alt="" width={size} height={size} className="mapping-faceImg" referrerPolicy="no-referrer" loading="lazy" />
    : <span className="mapping-initials" style={{ fontSize: size * .38 }}>{data.initials}</span>}</span>;
}
function CardRow({ label, children }: { label: string; children: ReactNode }) {
  const { t: uiText } = useWorkspaceI18n(); return <div className="mapping-cardRow"><dt>{uiText(label)}</dt><dd>{children}</dd></div>; }
function Who({ model, person, size = 18 }: { model: MappingModel; person: number; size?: number }) {
  const { t: uiText } = useWorkspaceI18n(); return <span className="mapping-who"><Face model={model} person={person} size={size} />{uiText(model.person(person).name)}</span>; }
function HoverContent({ id, model }: { id: number; model: MappingModel }) {
  const { t: uiText } = useWorkspaceI18n();
  const node = model.nodes[id];
  if (!node) return null;
  const stats = model.stats(id), percent = `${Math.round(stats.progress * 100)}%`;
  if (node.kind === "team") {
    const team = model.teams[node.ref];
    return <><div className="mapping-cardName">{team.name}</div>{team.mission && <div className="mapping-cardMeta">{team.mission}</div>}<dl className="mapping-cardRows"><CardRow label={uiText("Lead")}><Who model={model} person={team.lead} /></CardRow><CardRow label={uiText("Projects")}>{uiText(stats.projects)}{stats.atRisk > 0 && <span className="mapping-soft"> · {uiText(stats.atRisk)} {uiText(" need attention")}</span>}</CardRow><CardRow label={uiText("Open tasks")}>{uiText(stats.open)}</CardRow><CardRow label={uiText("Progress")}>{uiText(percent)}</CardRow></dl><p className="mapping-cardHint">{uiText("Click to zoom into the team")}</p></>;
  }
  if (node.kind === "project") {
    const project = model.projects[node.ref];
    return <><div className="mapping-cardName">{project.name}</div><div className="mapping-cardMeta"><i className="mapping-dot" data-tone={project.health} />{uiText(healthLabels[project.health])} {uiText(" · Due ")}{uiText(formatDue(project.due))}</div><dl className="mapping-cardRows"><CardRow label={uiText("Lead")}><Who model={model} person={project.lead} /></CardRow><CardRow label={uiText("Progress")}>{uiText(percent)}</CardRow><CardRow label={uiText("Open tasks")}>{uiText(stats.open)}</CardRow><CardRow label={uiText("Blocked")}>{uiText(stats.blocked)}</CardRow></dl><p className="mapping-cardHint">{uiText("Click to zoom into the project")}</p></>;
  }
  if (node.kind === "task") {
    const task = model.tasks[node.ref], status = model.status(node.ref);
    return <><div className="mapping-cardName">{task.title}</div><div className="mapping-cardMeta"><i className="mapping-status" data-status={status} />{uiText(statusLabels[status])} {uiText(" · Due ")}{uiText(formatDue(task.due))}</div><dl className="mapping-cardRows"><CardRow label={uiText("Assignee")}><Who model={model} person={task.assignee} /></CardRow><CardRow label={uiText("Checklist")}>{uiText(model.done(node.ref))} {uiText(" of ")}{uiText(task.checklist.length)}</CardRow><CardRow label={uiText("Points")}>{uiText(task.points)}</CardRow></dl><p className="mapping-cardHint">{uiText("Click to zoom into the task")}</p></>;
  }
  const person = model.person(node.ref);
  return <><div className="mapping-person"><Face model={model} person={node.ref} size={36} /><div><div className="mapping-cardName">{person.name}</div><div className="mapping-cardMeta">{uiText(person.role || uiText("Member"))}</div></div></div><dl className="mapping-cardRows"><CardRow label={uiText("Open tasks")}>{uiText(stats.open)}</CardRow><CardRow label={uiText("Progress")}>{uiText(percent)}</CardRow></dl><p className="mapping-cardHint">{uiText("Click to fly to their next task")}</p></>;
}

interface MappingProps {
  /** Keys the default browser storage; also remounts the map when it changes. */
  workspaceId: string;
  /** Where the map loads from and saves to. Defaults to this browser's local storage. See mapping-data-source.ts. */
  dataSource?: MappingDataSource;
  /** Used when the data source has nothing saved yet. Defaults to the generic sample. */
  initialData?: MappingData;
}

export function Mapping({ workspaceId, dataSource, initialData }: MappingProps) {
  const { t: uiText } = useWorkspaceI18n();
  const source = useMemo(() => dataSource ?? createLocalDataSource(`affectui:${workspaceId}:mapping-data`), [dataSource, workspaceId]);
  const [loaded, setLoaded] = useState<{ source: MappingDataSource; data: MappingData; failed: boolean } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    source.load(controller.signal)
      .then(data => { if (!controller.signal.aborted) setLoaded({ source, data: data ?? initialData ?? createSampleData(), failed: false }); })
      .catch(() => { if (!controller.signal.aborted) setLoaded({ source, data: initialData ?? createSampleData(), failed: true }); });
    return () => controller.abort();
  }, [source, initialData]);
  if (!loaded || loaded.source !== source) return <SectionSkeleton section="Mapping" label={uiText("Loading map…")} />;
  return <MappingWorkspace key={workspaceId} source={source} initial={loaded.data} loadFailed={loaded.failed} />;
}

function MappingWorkspace({ source, initial, loadFailed }: { source: MappingDataSource; initial: MappingData; loadFailed: boolean }) {
  const { t: uiText } = useWorkspaceI18n();
  const [data, setData] = useState(initial);
  const model = useMemo(() => new MappingModel(data), [data]);
  const [currentKey, setCurrentKey] = useState("company"), [hover, setHover] = useState(-1), [zoomed, setZoomed] = useState(false), [tour, setTour] = useState(false), [interacted, setInteracted] = useState(false), [announcement, setAnnouncement] = useState("");
  const [panel, setPanel] = useState<Panel>("overview"), [saveState, setSaveState] = useState<SaveState>(loadFailed ? "error" : "saved"), [focus, setFocus] = useState<string | null>(null);
  const root = useRef<HTMLElement>(null), stage = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null), mini = useRef<HTMLCanvasElement>(null), readout = useRef<HTMLSpanElement>(null), tooltip = useRef<HTMLDivElement>(null), engine = useRef<MappingEngine | null>(null);
  const dataRef = useRef(data), unsaved = useRef<MappingCommand[]>([]), saving = useRef(false), timer = useRef<ReturnType<typeof setTimeout>>(undefined), dispatchRef = useRef<(command: MappingCommand) => void>(() => {});
  const reduce = useReducedMotion(), id = useId(), hintId = `${id}-hint`, tabId = `${id}-tab`, panelId = `${id}-panel`;

  // Saving is batched: commands since the last successful save travel together with the latest snapshot.
  const flush = useCallback(async () => {
    if (saving.current) return;
    saving.current = true;
    try {
      while (unsaved.current.length) {
        setSaveState("saving");
        const batch = unsaved.current; unsaved.current = [];
        try { await source.save(dataRef.current, batch); }
        catch { unsaved.current = [...batch, ...unsaved.current]; setSaveState("error"); return; }
      }
      setSaveState("saved");
    } finally { saving.current = false; }
  }, [source]);
  const dispatch = useCallback((command: MappingCommand) => {
    const result = applyCommand(dataRef.current, command);
    if (result.data === dataRef.current) return;
    dataRef.current = result.data; setData(result.data);
    unsaved.current.push(command); setSaveState("saving");
    clearTimeout(timer.current); timer.current = setTimeout(() => void flush(), 350);
    if (result.created) setFocus(`${result.created.kind}:${result.created.id}`);
  }, [flush]);
  useEffect(() => { dispatchRef.current = dispatch; }, [dispatch]);
  useEffect(() => {
    const unsubscribe = source.subscribe?.(remote => { dataRef.current = remote; setData(remote); });
    const leave = () => { clearTimeout(timer.current); void flush(); };
    window.addEventListener("pagehide", leave);
    return () => { unsubscribe?.(); window.removeEventListener("pagehide", leave); leave(); };
  }, [source, flush]);

  useEffect(() => {
    if (!canvas.current || !mini.current || !stage.current || !readout.current || !tooltip.current) return;
    const controller = new MappingEngine(canvas.current, mini.current, stage.current, new MappingModel(dataRef.current), {
      path: node => setCurrentKey(controller.model.nodes[node]?.key ?? "company"), hover: setHover, zoom: setZoomed, tour: setTour, announce: setAnnouncement, interact: () => setInteracted(true),
      command: command => dispatchRef.current(command),
    }, readout.current, tooltip.current);
    engine.current = controller;
    controller.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const palette = () => {
      if (!root.current) return;
      const styles = getComputedStyle(root.current);
      const keys: Record<keyof Palette, string> = { surface: "--surface", muted: "--surface-muted", fg: "--foreground", secondary: "--text-secondary", faint: "--text-muted", border: "--border", subtle: "--border-subtle", strong: "--border-strong", accent: "--accent", success: "--success", warning: "--warning", danger: "--danger" };
      controller.palette = Object.fromEntries(Object.entries(keys).map(([key, token]) => [key, styles.getPropertyValue(token).trim()])) as unknown as Palette;
      controller.wake();
    };
    palette();
    const theme = new MutationObserver(palette); const themeRoot = root.current?.closest(".crm-page"); if (themeRoot) theme.observe(themeRoot, { attributes: true, attributeFilter: ["data-theme"] });
    const resize = new ResizeObserver(([entry]) => controller.resize(entry.contentRect.width, entry.contentRect.height, Math.min(2, devicePixelRatio || 1))); resize.observe(stage.current);
    const visibility = new IntersectionObserver(([entry]) => controller.setVisible(entry.isIntersecting), { threshold: .15 }); visibility.observe(stage.current);
    const hidden = () => controller.setHidden(document.hidden); hidden(); document.addEventListener("visibilitychange", hidden);
    const element = stage.current; element.addEventListener("wheel", controller.wheel, { passive: false });
    document.fonts.load('400 13px "Mapping Inter"').then(() => controller.wake());
    document.fonts.load('500 16px "Mapping Geist"').then(() => controller.wake());
    return () => { controller.destroy(); engine.current = null; resize.disconnect(); visibility.disconnect(); theme.disconnect(); document.removeEventListener("visibilitychange", hidden); element.removeEventListener("wheel", controller.wheel); };
  }, []);
  useEffect(() => { if (engine.current && engine.current.model.data !== model.data) engine.current.setModel(model); }, [model]);
  useEffect(() => { if (focus && engine.current?.model.data === model.data) { engine.current.focusKey(focus); queueMicrotask(() => setFocus(null)); } }, [focus, model]);
  useEffect(() => { engine.current?.setReduced(!!reduce); }, [reduce]);
  useEffect(() => { engine.current?.setEditing(panel === "edit"); }, [panel]);
  useEffect(() => { if (engine.current) { engine.current.localize = uiText; engine.current.wake(); } }, [uiText]);
  useEffect(() => { engine.current?.wake(); }, [currentKey, hover]);

  function pointer(event: ReactPointerEvent<HTMLDivElement>) {
    if ((event.target as Element).closest("[data-overlay],button")) return;
    if (event.type === "pointerdown") { event.currentTarget.focus({ preventScroll: true }); event.currentTarget.setPointerCapture(event.pointerId); engine.current?.pointerDown(event.nativeEvent); }
    else if (event.type === "pointermove") engine.current?.pointerMove(event.nativeEvent);
    else engine.current?.pointerUp(event.nativeEvent, event.type === "pointercancel");
  }
  function miniPointer(event: ReactPointerEvent<HTMLCanvasElement>) { event.stopPropagation(); if (event.type === "pointerdown") event.currentTarget.setPointerCapture(event.pointerId); if (event.type === "pointerdown" || event.currentTarget.hasPointerCapture(event.pointerId)) engine.current?.miniPointer(event.nativeEvent); }
  function selectPanel(event: React.KeyboardEvent, index: number) {
    const next = event.key === "ArrowRight" ? (index + 1) % PANELS.length : event.key === "ArrowLeft" ? (index + PANELS.length - 1) % PANELS.length : event.key === "Home" ? 0 : event.key === "End" ? PANELS.length - 1 : -1;
    if (next < 0) return;
    event.preventDefault(); setPanel(PANELS[next].id); document.getElementById(`${tabId}-${PANELS[next].id}`)?.focus();
  }

  const current = model.byKey.get(currentKey) ?? 0, node = model.nodes[current], stats = model.stats(current), path = model.nodePath(current), percent = Math.round(stats.progress * 100), selectedTask = node.kind === "task" ? model.tasks[node.ref] : null;
  const empty = !data.teams.length, projectCount = model.projects.length;
  return <div className="mapping-page"><section className="mapping-root" ref={root} aria-label={uiText("Map")}>
    <div className="mapping-body">
      <div ref={stage} className="mapping-stage" data-zoomed={zoomed} data-editing={panel === "edit" || undefined} tabIndex={0} role="application" aria-roledescription="zoomable map" aria-label={uiText("Map of {0}: {1} teams, {2} projects and {3} tasks. Currently viewing {4}. Zoom in to reveal projects, tasks and people.", [data.name || "your workspace", data.teams.length, projectCount, model.tasks.length, node.name])} aria-describedby={hintId} onPointerDown={pointer} onPointerMove={pointer} onPointerUp={pointer} onPointerCancel={pointer} onPointerLeave={() => engine.current?.pointerLeave()} onKeyDown={event => {
        if (event.target !== event.currentTarget) return;
        const directions: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
        if (directions[event.key]) engine.current?.moveCursor(...directions[event.key]);
        else if (event.key === "Enter" || event.key === " ") engine.current?.activateCursor();
        else if (event.key === "Escape" || event.key === "Backspace") engine.current?.flyOut();
        else if (event.key === "+" || event.key === "=") engine.current?.zoomBy(1.5);
        else if (event.key === "-" || event.key === "_") engine.current?.zoomBy(1 / 1.5);
        else if (event.key === "0" || event.key === "Home") engine.current?.fitAll();
        else return;
        event.preventDefault();
      }}>
        <canvas ref={canvas} className="mapping-canvas" aria-hidden="true" />
        <nav className="mapping-crumbs" aria-label={uiText("Map location")} data-overlay=""><ol className="mapping-crumbList"><AnimatePresence initial={false} mode="popLayout">{path.map((part, index) => <motion.li layout={!reduce ? "position" : false} className="mapping-crumb" key={model.nodes[part].key} initial={reduce ? false : { opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : .24, ease: [.22, 1, .36, 1] }}>{index > 0 && <ChevronRight className="mapping-sep" size={14} strokeWidth={1.75} />}{index < path.length - 1 ? <button type="button" className="mapping-crumbBtn" onClick={() => engine.current?.goTo(part)}>{model.nodes[part].name}</button> : <span className="mapping-crumbHere" aria-current="location">{model.nodes[part].name}</span>}</motion.li>)}</AnimatePresence></ol></nav>
        <button type="button" className="mapping-tour" aria-pressed={tour} aria-label={uiText(tour ? uiText("Stop tour") : uiText("Take the tour"))} disabled={empty} onClick={() => engine.current?.toggleTour()}><span className="mapping-tourIcon" aria-hidden="true">{tour ? <Pause size={16} strokeWidth={1.75} /> : <Play size={16} strokeWidth={1.75} />}</span><span className="mapping-tourLabels"><span data-on={!tour}>{uiText("Take the tour")}</span><span data-on={tour}>{uiText("Stop tour")}</span></span></button>
        <div className="mapping-card" ref={tooltip} data-open={hover >= 0} aria-hidden="true"><HoverContent id={hover} model={model} /></div>
        <div className="mapping-mini" data-visible={zoomed} data-overlay="" aria-hidden="true"><canvas ref={mini} className="mapping-miniCanvas" onPointerDown={miniPointer} onPointerMove={miniPointer} /></div>
        <p className="mapping-hint" data-hidden={interacted || zoomed || empty} aria-hidden="true"><span className="mapping-hintFine">{uiText(panel === "edit" ? uiText("Drag a team or project to rearrange, click to zoom in and edit") : uiText("Scroll to zoom, drag to pan, click anything to fly in"))}</span><span className="mapping-hintCoarse">{uiText("Pinch to zoom, tap anything to fly in")}</span></p>
        <div className="mapping-zoom" data-overlay=""><button type="button" aria-label={uiText("Zoom out")} onClick={() => engine.current?.zoomBy(.625)}><Minus size={16} strokeWidth={1.75} /></button><span className="mapping-readout" ref={readout} aria-hidden="true">1.0×</span><button type="button" aria-label={uiText("Zoom in")} onClick={() => engine.current?.zoomBy(1.6)}><Plus size={16} strokeWidth={1.75} /></button><button type="button" aria-label={uiText("Show the whole map")} disabled={!zoomed && current === 0} onClick={() => engine.current?.fitAll()}><Maximize2 size={15} strokeWidth={1.75} /></button></div>
        {empty && <div className="mapping-empty" data-overlay=""><p>{uiText("This map is empty.")}</p><div><button type="button" className="mapping-btn" onClick={() => { dispatch({ type: "team.add" }); setPanel("edit"); }}><Plus size={14} strokeWidth={1.75} />{uiText("Add a team")}</button><button type="button" className="mapping-btn" onClick={() => dispatch({ type: "data.replace", data: createSampleData() })}>{uiText("Load sample data")}</button></div></div>}
      </div>
      <p className="mapping-srOnly" id={hintId}>{uiText("Use the arrow keys to move between items in view, Enter to zoom in or tick a checklist item, Escape to zoom out, plus and minus to zoom, and 0 to see the whole map.")}</p>
      <aside className="mapping-panel" aria-label={uiText("Map details and editing")}>
        <div className="mapping-tabs" role="tablist" aria-label={uiText("Panel")}>{PANELS.map((item, index) => <button type="button" role="tab" key={item.id} id={`${tabId}-${item.id}`} aria-selected={panel === item.id} aria-controls={panelId} tabIndex={panel === item.id ? 0 : -1} onClick={() => setPanel(item.id)} onKeyDown={event => selectPanel(event, index)}>{panel === item.id && <motion.span className="mapping-tabInd" layoutId={`${tabId}-indicator`} transition={{ duration: reduce ? 0 : .32, ease: [.22, 1, .36, 1] }} />}<span>{uiText(item.label)}</span></button>)}</div>
        <div className="mapping-panelBody" role="tabpanel" id={panelId} aria-labelledby={`${tabId}-${panel}`}>
          {panel === "overview" && <div className="mapping-overview">
            <div className="mapping-scope"><AnimatePresence mode="popLayout" initial={false}><motion.div key={node.key} className="mapping-scopeInner" initial={reduce ? false : { opacity: 0, y: 4, filter: "blur(3px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : .24 }}><span className="mapping-scopeKind">{uiText(node.kind === "company" ? uiText("Workspace") : node.kind[0].toUpperCase() + node.kind.slice(1))}</span><span className="mapping-scopeName">{node.name}</span></motion.div></AnimatePresence></div>
            <div className="mapping-kpiMain"><span className="mapping-kpiLabel">{uiText(selectedTask ? uiText("Checklist complete") : uiText("Progress"))}</span><span className="mapping-kpiValue"><RollingNumber text={`${percent}%`} /></span><span className="mapping-track" aria-hidden="true"><span className="mapping-fill" style={{ width: `${Math.max(2, percent)}%` }} /></span></div>
            <dl className="mapping-kpis"><div><dt>{uiText("Open tasks")}</dt><dd><RollingNumber text={String(stats.open)} /></dd></div><div><dt>{uiText("Blocked")}</dt><dd data-alert={stats.blocked > 0}><RollingNumber text={String(stats.blocked)} /></dd></div><div><dt>{uiText("Next due")}</dt><dd><RollingNumber text={stats.nextDue === null ? "None" : formatDue(stats.nextDue)} /></dd></div></dl>
            <div className="mapping-people"><div className="mapping-peopleHead"><span>{uiText("People")}</span><span className="mapping-peopleCount"><RollingNumber text={String(stats.people.length)} /></span></div><ul className="mapping-stack" aria-label={uiText("{0} people: {1}", [stats.people.length, stats.people.map(person => model.person(person).name).join(", ")])}><AnimatePresence initial={false} mode="popLayout">{stats.people.slice(0, 6).map(person => <motion.li layout={!reduce ? "position" : false} key={model.person(person).id} title={uiText(model.person(person).name)} initial={reduce ? false : { opacity: 0, scale: .9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: .9 }} transition={{ duration: reduce ? 0 : .24 }}><Face model={model} person={person} /></motion.li>)}{stats.people.length > 6 && <li className="mapping-more">+{uiText(stats.people.length - 6)}</li>}</AnimatePresence></ul><p className="mapping-peopleNote">{uiText(selectedTask ? uiText("Assigned to {0}", [model.person(selectedTask.assignee).name]) : stats.projects ? uiText("{0} projects, {1} need attention", [stats.projects, stats.atRisk]) : node.kind === "project" ? uiText("Led by {0}", [model.person(model.projects[node.ref].lead).name]) : "")}</p></div>
          </div>}
          {panel === "edit" && <EditPanel model={model} view={current} dispatch={dispatch} />}
          {panel === "people" && <PeoplePanel data={data} dispatch={dispatch} />}
          {panel === "data" && <DataPanel data={data} dispatch={dispatch} />}
        </div>
        <p className="mapping-save" data-state={saveState} role="status">{saveState === "saving" ? uiText("Saving…") : saveState === "error" ? <>{uiText("Couldn’t save. ")}<button type="button" onClick={() => void flush()}>{uiText("Try again")}</button></> : uiText("All changes saved")}</p>
      </aside>
    </div>
    <div className="mapping-srOnly"><table><caption>{uiText("Projects by team")}</caption><thead><tr>{["Team", "Project", "Health", "Progress", "Open tasks", "Blocked", "Due"].map(label => <th key={label} scope="col">{uiText(label)}</th>)}</tr></thead><tbody>{model.projects.map(project => { const stat = model.stats(project.node); return <tr key={project.id}><td>{uiText(model.teams[project.team].name)}</td><th scope="row">{project.name}</th><td>{uiText(healthLabels[project.health])}</td><td>{uiText(Math.round(stat.progress * 100))}%</td><td>{uiText(stat.open)}</td><td>{uiText(stat.blocked)}</td><td>{uiText(formatDue(project.due))}</td></tr>; })}</tbody></table></div>
    {selectedTask && <fieldset className="mapping-srOnly"><legend>{selectedTask.title} {uiText(" checklist")}</legend>{selectedTask.checklist.map((item, index) => <label key={item.id}><input type="checkbox" checked={item.done} onChange={() => engine.current?.toggle(node.ref, index)} />{uiText(item.label)}</label>)}</fieldset>}
    <p className="mapping-srOnly" aria-live="polite">{uiText(announcement)}</p>
  </section></div>;
}
