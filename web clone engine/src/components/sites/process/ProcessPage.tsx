"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { MenuSurface } from "@/components/interaction/MenuSurface";
import type { Reducer } from "react";
import { AlertTriangle, Check, Copy, Download, FolderOpen, Upload, Hourglass, Trash2, LayoutGrid, LoaderCircle, PanelRight, Play, Plug, Plus, Redo2, Repeat, Settings2, ShieldCheck, Square, Undo2, Waypoints, X } from "lucide-react";
import { OrbitMenu } from "../orbit-menu/OrbitMenu";
import type { OrbitBoundary, OrbitPoint } from "../orbit-menu/orbit-geometry";
import { blockShortcuts, menuAnchor } from "./block-shortcuts";
import type { BlockShortcutId } from "./block-shortcuts";
import type { SnapshotSource } from "@/lib/workspace-backend";
import { downloadFile } from "../affectui-crm/workspace-state";
import { AgentTree } from "../affectui-agent-tree/AgentTree";
import { useWidth } from "../affectui-agent-tree/use-width";
import type { TreeAgent } from "../affectui-agent-tree/tree-model";
import { durationLabel } from "../affectui-agent-tree/tree-model";
import { NotificationStack } from "../affectui-notification-stack/NotificationStack";
import { groupByBlock, outlastsReading } from "./notice-spark-model";
import { enqueue } from "../affectui-notification-stack/stack-model";
import type { Notice } from "../affectui-notification-stack/stack-model";
import { useWorkspaceRoute } from "../affectui-crm/workspace-state";
import { diffRun } from "./run-notices";
import type { NoticeIntent, ProcessNotice } from "./run-notices";
import { WorkspaceDialog } from "../affectui-crm/WorkspaceDialog";
import { NodeInspector } from "./NodeInspector";
import { ConfirmDialog, ConnectDialog, SettingsDialog } from "./ProcessDialogs";
import { LibrarySheet, NewProcessSheet } from "./ProcessSheets";
import { SplitButton } from "../split-button/SplitButton";
import { MORPH } from "../split-button/split-button-model";
import { ProcessMap } from "./ProcessMap";
import { ProcessPermissions } from "./ProcessPermissions";
import { ProcessRunBar } from "./ProcessRunMonitor";
import { roles } from "./roles";
import type { Role, RoleStep } from "./roles";
import type { Point } from "./map-layout";
import { problemsOf, providerOf } from "./catalog";
import { configuredEngine, handleNow, simulatedHandle } from "./engine";
import type { EngineInfo, ProcessEngine, RunHandle } from "./engine";
import { createHistory, historyReducer } from "./history";
import type { History, HistoryAction } from "./history";
import {
  addChild, addLink, checkLink, costFormatter, createBlankProcess, createLibrary, createNode, createSampleProcess, DEFAULT_ROUNDS, duplicateNode, findNode, flattenNodes, instantiate, LIMITS, loopFrom, moveNode, 
  normalizeProcess, parentNode, pruneLinks, removeLink, removeNode, removeNodes, reparentNode, setPosition, clearPositions, templates, touch, uid, updateLink, updateNode, countNodes, waitsFor,
} from "./process-model";
import type { CostUnit, ProcessDoc, ProcessLibrary, ProcessNode } from "./process-model";
import { decisionId, emptyRunStore, isActive } from "./run-model";
import type { RunAction, RunStore } from "./run-model";
import { buildTree, taskIdOf } from "./run-view";
import { createLocalProcessSource, createLocalRunSource } from "./local-sources";
import { SectionSkeleton } from "../shimmer-loader/SectionSkeleton";
import { useAutosave } from "./use-autosave";
import { peekTick, useTicker } from "./use-ticker";
import "./process.css";

export { createLocalProcessSource, createLocalRunSource } from "./local-sources";

export interface ProcessProps {
  workspaceId: string;
  dataSource?: SnapshotSource<ProcessLibrary>;
  /** Where the simulated engine keeps its runs. Not used with an engine that runs elsewhere. */
  runSource?: SnapshotSource<RunStore>;
  /** What runs the tasks. Defaults to the simulated engine, or the REST engine when the host turns on `serverProcess`. */
  engine?: ProcessEngine;
  /** Data leaves this browser (a REST backend): the saved state is shared, so say so. */
  remote?: boolean;
}

interface Loaded { source: SnapshotSource<ProcessLibrary>; library: ProcessLibrary; runs: RunStore }

export function Process({ workspaceId, dataSource, runSource, engine: suppliedEngine, remote = false }: ProcessProps) {
  const { t: uiText } = useWorkspaceI18n();
  const source = useMemo(() => dataSource ?? createLocalProcessSource(`affectui:${workspaceId}:process`), [dataSource, workspaceId]);
  const runs = useMemo(() => runSource ?? createLocalRunSource(`affectui:${workspaceId}:process-run`), [runSource, workspaceId]);
  const engine = useMemo(() => suppliedEngine ?? configuredEngine(), [suppliedEngine]);
  const [result, setResult] = useState<{ source: SnapshotSource<ProcessLibrary>; loaded?: Loaded; error?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([source.load(controller.signal), engine.kind === "simulated" ? runs.load(controller.signal).catch(() => null) : Promise.resolve(null)]).then(([library, store]) => {
      if (controller.signal.aborted) return;
      const base = library && library.processes.length ? library : createLibrary([createSampleProcess()]);
      setResult({ source, loaded: { source, library: base, runs: store ?? emptyRunStore() } });
    }).catch(error => { if (!controller.signal.aborted) setResult({ source, error: error instanceof Error ? error.message : "Could not load your processes." }); });
    return () => controller.abort();
  }, [source, runs, engine, attempt]);
  const reload = () => { setResult(null); setAttempt(value => value + 1); };
  if (!result || result.source !== source) return <SectionSkeleton section="Process" label={uiText("Loading processes…")} />;
  if (!result.loaded) return <div className="proc-workspace proc-loading" role="alert"><p>{uiText(result.error)}</p><button className="proc-button" type="button" onClick={reload}>{uiText("Retry loading")}</button></div>;
  return <ProcessStudio key={`${workspaceId}-${attempt}`} workspaceId={workspaceId} source={source} runs={runs} engine={engine} initial={result.loaded} remote={remote} onReload={reload} />;
}

type Dialog = "library" | "new" | "connect" | "inspector" | "settings" | { kind: "delete-task"; id: string } | { kind: "delete-tasks"; ids: string[] } | null;
const POLL_MS = 2000;
/** The settings panel is docked: it takes this much width (panel 348 + its 12px margins) and the page is pushed aside by the same amount. */
const PANEL_RESERVE = 372;
/** Fitted to frames recorded from the public AI side panel preview (docs/research/ai-side-panel): a critically damped spring, about 0.5s to settle, no overshoot. */
const PANEL_SPRING = { type: "spring", stiffness: 300, damping: 37, mass: 1 } as const;
const shortcutIcons: Record<BlockShortcutId, typeof Play> = { run: Play, review: ShieldCheck, retry: Redo2, trace: Waypoints, settings: Settings2, add: Plus, duplicate: Copy, approval: ShieldCheck, delete: Trash2 };
const historyOf = historyReducer as Reducer<History<ProcessLibrary>, HistoryAction<ProcessLibrary>>;
const stateLabel = { running: "Running", waiting: "Needs you", done: "Done", failed: "Failed", stopped: "Stopped" } as const;
const isField = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.closest("[role=combobox], [role=listbox]") !== null);

function ProcessStudio({ workspaceId, source, runs, engine, initial, remote, onReload }: { workspaceId: string; source: SnapshotSource<ProcessLibrary>; runs: SnapshotSource<RunStore>; engine: ProcessEngine; initial: Loaded; remote: boolean; onReload: () => void }) {
  const { t: uiText } = useWorkspaceI18n();
  const [history, dispatch] = useReducer(historyOf, initial.library, createHistory);
  const library = history.present;
  const doc = library.processes.find(item => item.id === library.activeId) ?? library.processes[0];
  const [selectedId, setSelectedId] = useState(doc.root.id);
  // Blocks chosen together with Ctrl / Cmd + click: they are moved and deleted as a group
  const [multi, setMulti] = useState<string[]>([]);
  const selected = findNode(doc.root, selectedId) ?? doc.root;
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [notice, setNotice] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const [engines, setEngines] = useState<EngineInfo[]>([]);
  const [handles, setHandles] = useState<Record<string, RunHandle>>(() => Object.fromEntries(Object.entries(initial.runs.runs).flatMap(([id, log]) => { const handle = simulatedHandle(log); return handle ? [[id, handle]] : []; })));
  const handle = handles[doc.id];
  const simulated = engine.kind === "simulated";
  const [setPage, pageWidth] = useWidth();
  const narrow = pageWidth > 0 && pageWidth < 940;
  const importRef = useRef<HTMLInputElement>(null);
  // What the split button's main label says for a moment after an action it started has finished ("Created", "Exported"…)
  const [flashed, setFlashed] = useState<string | null>(null);
  const flashTimer = useRef<number | undefined>(undefined);
  const flash = useCallback((text: string) => { setFlashed(text); window.clearTimeout(flashTimer.current); flashTimer.current = window.setTimeout(() => setFlashed(null), MORPH.resultMs); }, []);
  useEffect(() => () => window.clearTimeout(flashTimer.current), []);
  const focusName = useRef(false);
  const [view, setView] = useState<"map" | "tree">("map");
  // The settings panel opens when a block is clicked or added, so the map has the whole page until then.
  const [panel, setPanel] = useState(false);
  // How much room the docked panel has taken, animated: the panel slides in by the same amount the page is pushed over.
  const reserve = useMotionValue(0);
  const panelX = useTransform(reserve, value => PANEL_RESERVE - value);
  const treePadding = useTransform(reserve, value => Math.max(24, value));
  const [panelLeaving, setPanelLeaving] = useState(false);
  const reducedMotion = useReducedMotion();
  const docked = !narrow && panel;
  useEffect(() => {
    const target = docked ? PANEL_RESERVE : 0;
    if (reserve.get() === target) return;
    if (reducedMotion || document.querySelector('.proc-workspace')?.closest('[data-ui-motion="off"]')) { reserve.set(target); setPanelLeaving(false); return; }
    if (!docked) setPanelLeaving(true);
    // The spring starts once the panel's content has been laid out: mounting the settings costs one slow frame, and a spring that is
    // already running when it arrives would skip the start of the motion. Three normal frames in a row mean it is over (waits 250ms at most).
    let controls: ReturnType<typeof animate> | undefined;
    const begun = performance.now();
    let last = begun, steady = 0, frame = 0;
    const poll = (now: number) => {
      steady = now - last < 24 ? steady + 1 : 0;
      last = now;
      if (steady >= 3 || now - begun > 250) controls = animate(reserve, target, { ...PANEL_SPRING, onComplete: () => { if (!docked) setPanelLeaving(false); } });
      else frame = requestAnimationFrame(poll);
    };
    frame = requestAnimationFrame(poll);
    return () => { cancelAnimationFrame(frame); controls?.stop(); };
  }, [docked, reducedMotion, reserve]);
  const [palette, setPalette] = useState(false);
  const [revealId, setRevealId] = useState<string | null>(null);
  const [pickedLinkId, setPickedLinkId] = useState<string | null>(null);
  const [tidied, setTidied] = useState(0);
  const [permissionReview, setPermissionReview] = useState<{ id?: string; revision: number }>({ revision: 0 });
  const actionPending = useRef(false);
  const startPending = useRef(false);
  const [runStarting, setRunStarting] = useState(false);
  /** The shortcut menu of a block (right click, Menu key or long press). It stays mounted after it closes so it can fold away. */
  const [blockMenu, setBlockMenu] = useState<{ id: string; at: OrbitPoint; boundary: OrbitBoundary; theme?: string; motionOff: boolean; keyboard: boolean; open: boolean } | null>(null);
  const treeHold = useRef<number | undefined>(undefined);
  const treeSwallowClick = useRef(false);
  const treeTouchMenuAt = useRef(0);
  const runRevision = useRef(0);
  function reviewPermission(id?: string) {
    setDialog(null);
    setPermissionReview(current => ({ id, revision: current.revision + 1 }));
  }

  // ----- running -----
  // The clock only ticks while a run is going: the last tick tells whether it still is.
  const stillGoing = (() => { if (!handle) return false; try { return isActive(engine.read(handle, handleNow(handle, peekTick()))); } catch { return false; } })();
  const readNow = useTicker(stillGoing);
  const clock = handle ? handleNow(handle, readNow) : readNow;
  const snapshot = (() => { if (!handle) return null; try { return engine.read(handle, clock); } catch { return null; } })();
  const active = !!snapshot && isActive(snapshot);
  const unit: CostUnit = doc.unit;
  const format = costFormatter(unit);
  const tree = buildTree(doc.root, { snapshot, engines });
  const { navigate: goTo } = useWorkspaceRoute();

  // Notices: a block finished, a block failed, the run is over. Worked out from how each snapshot differs from the one before.
  const [alerts, setAlerts] = useState<{ key: string; run: string; known: Record<string, string> | null; notices: ProcessNotice[] }>({ key: "", run: "", known: null, notices: [] });
  const alertKey = snapshot ? `${doc.id}|${snapshot.id}|${snapshot.state}|${Object.entries(snapshot.nodes).map(([id, run]) => `${id}:${run.status}:${run.round ?? 1}:${run.rounds?.length ?? 0}`).join(",")}` : "";
  if (alertKey !== alerts.key) {
    if (!snapshot) setAlerts({ key: alertKey, run: "", known: null, notices: [] });
    else {
      const run = `${doc.id}|${snapshot.id}`, same = alerts.run === run;
      const step = diffRun(same ? alerts.known : null, snapshot, { doc, formatCost: format, showCost: unit !== "none", formatDuration: durationLabel });
      setAlerts({ key: alertKey, run, known: step.known, notices: same ? enqueue(alerts.notices.filter(item => !step.retire.includes(item.id)), step.notices) : [] });
    }
  }

  // The simulated engine's runs are saved with the process; a server keeps its own.
  const runStore: RunStore = useMemo(() => ({ version: 1, runs: Object.fromEntries(Object.entries(handles).flatMap(([id, item]) => item.kind === "simulated" ? [[id, item.log]] : [])) }), [handles]);
  const runSave = useAutosave(runStore, initial.runs, useCallback(value => engine.kind === "simulated" ? runs.save(value) : Promise.resolve(), [engine, runs]), 300);
  const save = useAutosave(library, initial.library, useCallback(value => source.save(value), [source]), 600);

  useEffect(() => {
    if (!engine.catalog) return;
    const controller = new AbortController();
    engine.catalog(workspaceId, controller.signal).then(list => { if (!controller.signal.aborted) setEngines(list); }).catch(() => {});
    return () => controller.abort();
  }, [engine, workspaceId]);
  const hasHandle = !!handle;
  useEffect(() => {
    if (!engine.latest || hasHandle) return;
    const controller = new AbortController();
    engine.latest(workspaceId, doc.id, controller.signal).then(found => { if (found && !controller.signal.aborted) setHandles(current => current[doc.id] ? current : { ...current, [doc.id]: found }); }).catch(() => {});
    return () => controller.abort();
  }, [engine, workspaceId, doc.id, hasHandle]);
  const handleRef = useRef(handle);
  useEffect(() => { handleRef.current = handle; });
  useEffect(() => {
    if (!engine.refresh || !active) return;
    const timer = setInterval(() => {
      const current = handleRef.current;
      if (!current || engine.kind === "simulated" || actionPending.current) return;
      const revision = runRevision.current;
      engine.refresh!(workspaceId, current).then(next => { if (revision !== runRevision.current) return; if (next !== current) setHandles(all => all[doc.id] === current ? { ...all, [doc.id]: next } : all); setNotice(note => note?.text.startsWith("Lost contact") ? null : note); })
        .catch(() => { if (revision === runRevision.current) setNotice({ kind: "error", text: "Lost contact with the engine. Trying again…" }); });
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [engine, workspaceId, doc.id, active]);

  const fail = (error: unknown, fallback: string) => setNotice({ kind: "error", text: error instanceof Error && error.message ? error.message : fallback });
  async function start(from?: string) {
    if (startPending.current || active) return false;
    startPending.current = true;
    setRunStarting(true);
    runRevision.current += 1;
    setNotice(null);
    try {
      const next = await engine.start(workspaceId, doc, from, Date.now());
      setHandles(current => ({ ...current, [doc.id]: next }));
      return true;
    } catch (error) { fail(error, "The run could not start."); return false; }
    finally { startPending.current = false; setRunStarting(false); }
  }
  async function act(action: RunAction) {
    if (!handle || actionPending.current) return false;
    // A block in a later pass of a loop has its own name for the engine; the screen only knows the block.
    const sent: RunAction = action.type === "stop" ? action : { ...action, id: decisionId(snapshot, action.id) };
    actionPending.current = true;
    runRevision.current += 1;
    setNotice(null);
    try {
      const next = await engine.act(workspaceId, handle, sent, Date.now());
      setHandles(current => current[doc.id] === handle ? { ...current, [doc.id]: next } : current);
      return true;
    } catch (error) { fail(error, "That did not work."); return false; }
    finally { actionPending.current = false; }
  }
  const resolve = (agent: TreeAgent, action: "approve" | "reject" | "retry" | "dismiss") => {
    if (action === "approve" || action === "reject") reviewPermission(taskIdOf(agent.id));
    else void act({ type: action, id: taskIdOf(agent.id) });
  };
  const clearRun = () => setHandles(current => { const next = { ...current }; delete next[doc.id]; return next; });

  // ----- editing -----
  const edit = useCallback((change: (doc: ProcessDoc) => ProcessDoc, key?: string) => dispatch({ type: "edit", key, at: Date.now(), next: current => {
    const index = current.processes.findIndex(item => item.id === current.activeId);
    if (index < 0) return current;
    const before = current.processes[index], after = pruneLinks(change(before));
    if (after === before) return current;
    const processes = [...current.processes];
    processes[index] = touch(after);
    return { ...current, processes };
  } }), []);
  const editRoot = (change: (root: ProcessNode) => ProcessNode, key?: string) => edit(item => { const root = change(item.root); return root === item.root ? item : { ...item, root }; }, key);
  const editNode = (id: string, change: (node: ProcessNode) => ProcessNode, field?: string) => editRoot(root => updateNode(root, id, change), field ? `node:${id}:${field}` : undefined);
  const locked = active || runStarting;

  /** Connects a new block to `parentId`. With a role the block starts as that role (its name, task text and instructions); with a position it goes there. */
  function addBlock(parentId: string, options: { role?: Role; pos?: Point; name?: string; task?: string } = {}) {
    const parent = findNode(doc.root, parentId);
    if (!parent) return;
    const info = options.role ? roles.find(item => item.id === options.role) : undefined;
    const node = createNode({
      name: options.name ?? info?.label ?? "New block", role: options.role ?? "custom", ...(options.task ? { task: options.task } : info ? { task: info.description } : {}),
      ai: { ...parent.ai, instructions: info?.instructions ?? "" }, ...(options.pos ? { pos: options.pos } : {}),
    });
    const next = addChild(doc.root, parentId, node);
    if (next === doc.root) { setNotice({ kind: "error", text: `A process holds up to ${LIMITS.nodes} blocks, ${LIMITS.depth} levels deep.` }); return; }
    editRoot(() => next);
    setCollapsed(current => current.filter(id => id !== parentId));
    setSelectedId(node.id);
    setRevealId(node.id);
    setPalette(false);
    focusName.current = true;
    if (narrow) setDialog("inspector"); else setPanel(true);
  }
  const moveBlock = (id: string, pos: Point) => editRoot(root => setPosition(root, id, pos), `pos:${id}`);
  const moveBlocks = (moves: { id: string; pos: Point }[]) => editRoot(root => moves.reduce((current, move) => setPosition(current, move.id, move.pos), root), "pos:group");
  const group = multi.filter(id => !!findNode(doc.root, id));
  const groupIds = group.length > 1 ? group : [];
  /** Ctrl / Cmd (or Shift) + click adds a block to the group or takes it out; the block clicked becomes the one the settings panel shows. */
  function toggleMulti(id: string) {
    const base = groupIds.length ? groupIds : [selected.id];
    const next = base.includes(id) ? base.filter(item => item !== id) : [...base, id];
    setPickedLinkId(null); setRevealId(null);
    if (next.length < 2) { setMulti([]); setSelectedId(next[0] ?? id); return; }
    setMulti(next);
    setSelectedId(next.includes(id) ? id : next[next.length - 1]);
  }
  const selectAll = () => { const all = flattenNodes(doc.root).map(node => node.id); setMulti(all.length > 1 ? all : []); };
  /** Delete asks first: the whole group when the block is in one, else the block alone. */
  function requestDelete(id: string) {
    if (locked) { setNotice({ kind: "error", text: "Stop the run to change the structure." }); return; }
    if (groupIds.length > 1 && groupIds.includes(id)) setDialog({ kind: "delete-tasks", ids: groupIds });
    else setDialog({ kind: "delete-task", id });
  }
  function deleteTasks(ids: string[]) {
    const removable = ids.filter(id => id !== doc.root.id);
    setDialog(null);
    if (!removable.length) { setNotice({ kind: "error", text: "The first block cannot be deleted." }); return; }
    editRoot(root => removeNodes(root, removable));
    setSelectedId(doc.root.id);
    setMulti([]);
  }
  function runIntent(intent: NoticeIntent) {
    if (intent.kind === "retry") void act({ type: "retry", id: intent.blockId });
    else if (intent.kind === "locate") { setView("map"); setMulti([]); setSelectedId(intent.blockId); setRevealId(intent.blockId); }
    else goTo("Tracing");
  }
  const stackNotices: Notice[] = alerts.notices.map(item => ({ ...item, ...(item.intent && item.actionLabel ? { action: { label: item.actionLabel, onClick: () => runIntent(item.intent!) } } : {}) }));
  const dropAlert = (id: string) => setAlerts(current => ({ ...current, notices: current.notices.filter(item => item.id !== id) }));
  // On the map each block with something to say carries a star. A star's notices stay until they are opened (a quiet "done" is gone once it
  // has been read; a failure stays until the block runs again), so they do not expire by themselves.
  const [seen, setSeen] = useState<readonly string[]>([]);
  const seenSet = useMemo(() => new Set(seen), [seen]);
  const sparkGroups = useMemo(() => groupByBlock(stackNotices.map(item => ({ ...item, expireMs: undefined })), doc.root.id, id => !!findNode(doc.root, id)), [stackNotices, doc.root]);
  const markSeen = (ids: string[]) => {
    if (!ids.length) return;
    setSeen(current => [...current, ...ids]);
    setAlerts(current => ({ ...current, notices: current.notices.filter(item => !ids.includes(item.id) || outlastsReading(item)) }));
  };
  /** The person drew a connection: from any block to any other. A loop (back to an earlier block) opens its card to set the rounds. */
  function connectBlocks(from: string, to: string) {
    const check = checkLink(doc, from, to);
    if (!check.ok) { setNotice({ kind: "error", text: check.reason }); return; }
    const id = uid("link");
    edit(item => addLink(item, from, to, DEFAULT_ROUNDS, id));
    setNotice(null);
    if (view === "map") setPickedLinkId(id);
    else setNotice({ kind: "info", text: check.kind === "loop" ? `${findNode(doc.root, from)?.name} now loops back to ${findNode(doc.root, to)?.name}.` : `${findNode(doc.root, to)?.name} now waits for ${findNode(doc.root, from)?.name}.` });
  }
  const changeLink = (id: string, change: Parameters<typeof updateLink>[2]) => edit(item => updateLink(item, id, change), `link:${id}:${Object.keys(change).join(",")}`);
  const dropLink = (id: string) => { edit(item => removeLink(item, id)); setPickedLinkId(null); };
  const pickedLink = doc.links?.some(link => link.id === pickedLinkId) ? pickedLinkId : null;
  const addStep = (step: RoleStep) => addBlock(selected.id, { role: step.role, name: step.name, task: step.task });
  function tidyUp() { editRoot(clearPositions); setTidied(count => count + 1); }
  function deleteTask(id: string) {
    const parent = parentNode(doc.root, id);
    editRoot(root => removeNode(root, id));
    setSelectedId(parent?.id ?? doc.root.id);
    setDialog(null);
  }
  function duplicateTask(id: string) {
    const result = duplicateNode(doc.root, id);
    if (!result.copyId) { setNotice({ kind: "error", text: `A process holds up to ${LIMITS.nodes} tasks.` }); return; }
    editRoot(() => result.root);
    setSelectedId(result.copyId);
    setRevealId(result.copyId);
  }
  function selectShortcutBlock(id: string) {
    setSelectedId(id); setMulti([]); setPickedLinkId(null); setPalette(false);
  }
  function openBlockMenu({ id, at, keyboard, element }: { id: string; at: OrbitPoint; keyboard: boolean; element: HTMLElement }) {
    selectShortcutBlock(id);
    // The fan keeps inside the map (or the task list) and out from under the settings panel.
    const area = element.closest(".pmap, .proc-treewrap")?.getBoundingClientRect();
    const boundary: OrbitBoundary = {
      left: Math.max(8, area?.left ?? 0) + 4, top: Math.max(8, area?.top ?? 0) + 4,
      right: Math.min(window.innerWidth, area?.right ?? window.innerWidth) - (!narrow && panel ? 372 : 0) - 8, bottom: Math.min(window.innerHeight, area?.bottom ?? window.innerHeight) - 8,
    };
    setBlockMenu({ id, at, boundary, theme: element.closest("[data-theme]")?.getAttribute("data-theme") ?? document.documentElement.getAttribute("data-theme") ?? undefined, motionOff: element.closest('[data-ui-motion="off"]') !== null, keyboard, open: true });
  }
  function renderBlockMenu(menu: NonNullable<typeof blockMenu>) {
    const node = findNode(doc.root, menu.id);
    if (!node) return null;
    const shortcuts = blockShortcuts(doc, node, { active, starting: runStarting, run: snapshot?.nodes[node.id] });
    return <OrbitMenu
      key="block-menu" anchor={menu.at} boundary={menu.boundary} theme={menu.theme} motionOff={menu.motionOff} open={menu.open}
      label={uiText("{0} shortcuts", [node.name])} triggerLabel={`Close shortcuts for ${node.name}`} className={menu.keyboard ? "proc-block-orbit is-keyboard" : "proc-block-orbit"} triggerSize={narrow ? 44 : 48}
      onOpenChange={open => {
        setBlockMenu(current => current && current.id === menu.id ? { ...current, open } : current);
        // Opened from the keyboard: the focus goes back to the block, unless an action has moved it into a dialog.
        if (!open && menu.keyboard) requestAnimationFrame(() => {
          const now = document.activeElement;
          if (!now || now === document.body || now.closest(".orbit-menu, .orbit-menu-portal")) document.querySelector<HTMLElement>(`[data-block="${CSS.escape(menu.id)}"]`)?.focus({ preventScroll: true });
        });
      }}
      actions={shortcuts.map(shortcut => {
        const Icon = shortcutIcons[shortcut.id];
        return { ...shortcut, icon: <Icon size={21} strokeWidth={1.8} />, tone: shortcut.danger ? "danger" : "neutral", done: shortcut.id === "approval" ? (node.approval ? "Approval removed" : "Approval required") : undefined };
      })}
      onAction={async id => {
        // Check again at activation: the engine may have advanced while the menu was open.
        const shortcut = blockShortcuts(doc, node, { active, starting: startPending.current, run: snapshot?.nodes[node.id] }).find(item => item.id === id);
        if (!shortcut || shortcut.disabled) return;
        if (id === "run") { if (!await start(node.id)) throw new Error("The run could not start. See the process message for details."); }
        else if (id === "retry") { if (!await act({ type: "retry", id: node.id })) throw new Error("The block could not be retried. See the process message for details."); }
        else if (id === "review") reviewPermission(node.id);
        else if (id === "trace") goTo("Tracing");
        else if (id === "settings") { setRevealId(node.id); if (narrow) setDialog("inspector"); else setPanel(true); }
        else if (id === "add") addBlock(node.id);
        else if (id === "duplicate") duplicateTask(node.id);
        else if (id === "approval") editNode(node.id, current => ({ ...current, approval: !current.approval }));
        else if (id === "delete") setDialog({ kind: "delete-task", id: node.id });
      }}
      onError={error => fail(error, "That shortcut could not complete.")}
    />;
  }
  /** The task list has no hook for it, so each card carries a hidden marker with its block id and the list asks the DOM. */
  function treeBlockAt(target: EventTarget | null) {
    const card = target instanceof Element ? target.closest<HTMLElement>(".agt__node") : null;
    const id = card?.querySelector<HTMLElement>("[data-block-menu]")?.dataset.blockMenu;
    return card && id ? { card, id } : null;
  }
  const treeMenuHandlers = {
    onContextMenu: (event: React.MouseEvent<HTMLDivElement>) => {
      const hit = treeBlockAt(event.target);
      if (!hit) return;
      event.preventDefault();
      if (performance.now() - treeTouchMenuAt.current < 1500) return;
      const at = menuAnchor(event, hit.card.getBoundingClientRect());
      openBlockMenu({ id: hit.id, at: { x: at.x, y: at.y }, keyboard: at.keyboard, element: hit.card });
    },
    onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => {
      treeSwallowClick.current = false;
      window.clearTimeout(treeHold.current);
      const hit = event.pointerType === "touch" ? treeBlockAt(event.target) : null;
      if (!hit) return;
      const at = { x: event.clientX, y: event.clientY };
      treeHold.current = window.setTimeout(() => { treeSwallowClick.current = true; treeTouchMenuAt.current = performance.now(); openBlockMenu({ id: hit.id, at, keyboard: false, element: hit.card }); }, 480);
    },
    // Scrolling the list ends the press (the browser cancels the pointer), so a swipe never opens a menu.
    onPointerUp: () => window.clearTimeout(treeHold.current),
    onPointerCancel: () => window.clearTimeout(treeHold.current),
    onClickCapture: (event: React.MouseEvent<HTMLDivElement>) => { if (treeSwallowClick.current) { treeSwallowClick.current = false; event.preventDefault(); event.stopPropagation(); } },
  };
  function switchTo(id: string) { dispatch({ type: "edit", at: Date.now(), next: current => current.activeId === id ? current : { ...current, activeId: id } }); setSelectedId(library.processes.find(item => item.id === id)?.root.id ?? ""); setCollapsed([]); }
  function addProcess(created: ProcessDoc) {
    if (library.processes.length >= LIMITS.processes) { setNotice({ kind: "error", text: `You can keep up to ${LIMITS.processes} processes.` }); return; }
    dispatch({ type: "edit", at: Date.now(), next: current => ({ ...current, activeId: created.id, processes: [...current.processes, created] }) });
    setSelectedId(created.root.id); setCollapsed([]);
  }
  function createProcess(template: string) {
    const found = templates.find(item => item.id === template);
    addProcess(found ? instantiate(found.create()) : createBlankProcess("Untitled process"));
    setDialog(null); flash("Created");
  }
  function duplicateProcess(id: string) {
    const original = library.processes.find(item => item.id === id);
    if (original) { addProcess({ ...instantiate(original), name: `${original.name} (copy)`.slice(0, LIMITS.name) }); flash("Duplicated"); }
  }
  function deleteProcess(id: string) {
    const rest = library.processes.filter(item => item.id !== id);
    if (!rest.length) return;
    dispatch({ type: "edit", at: Date.now(), next: current => ({ ...current, activeId: current.activeId === id ? rest[0].id : current.activeId, processes: rest }) });
    setHandles(current => { const next = { ...current }; delete next[id]; return next; });
    setSelectedId(rest[0].root.id); flash("Deleted");
  }
  function exportProcess() { downloadFile(`${doc.name.replace(/[^\w-]+/g, "-").toLowerCase() || "process"}.json`, JSON.stringify({ format: "logio-process", version: 1, process: doc }, null, 2), "application/json"); flash("Exported"); }
  async function importFile(file: File) {
    try {
      if (file.size > 2_000_000) throw new Error("That file is too large to be a process.");
      const raw = JSON.parse(await file.text()) as { process?: unknown };
      const imported = normalizeProcess(raw?.process ?? raw);
      if (!imported) throw new Error("That file is not a process this page can read.");
      addProcess({ ...instantiate(imported), name: imported.name });
      setNotice({ kind: "info", text: `Imported “${imported.name}” with ${countNodes(imported.root)} tasks.` }); flash("Imported");
    } catch (error) { fail(error, "That file could not be imported."); }
  }

  useLayoutEffect(() => {
    if (!focusName.current) return;
    focusName.current = false;
    const field = document.querySelector<HTMLInputElement>(".proc-inspector input.proc-input");
    field?.focus({ preventScroll: true }); field?.select();
  });
  // Keys for a group of blocks: Delete asks to delete it, Escape lets it go, Ctrl / Cmd + A chooses every block
  const keys = useRef({ group: [] as string[], view: "map" as "map" | "tree", ask: requestDelete, all: selectAll, clear: () => {} });
  useEffect(() => { keys.current = { group: groupIds, view, ask: requestDelete, all: selectAll, clear: () => setMulti([]) }; });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (isField(event.target) || document.querySelector("dialog[open]") || event.defaultPrevented) return;
      const { group: chosen, view: shownView, ask, all, clear } = keys.current;
      if (event.key === "Escape" && chosen.length) clear();
      else if ((event.key === "Delete" || event.key === "Backspace") && chosen.length > 1) { event.preventDefault(); ask(chosen[0]); }
      else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a" && shownView === "map") { event.preventDefault(); all(); }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || isField(event.target) || event.defaultPrevented) return;
      const key = event.key.toLowerCase();
      if (key === "z") { event.preventDefault(); dispatch({ type: event.shiftKey ? "redo" : "undo" }); }
      else if (key === "y") { event.preventDefault(); dispatch({ type: "redo" }); }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  const problems = flattenNodes(doc.root).filter(node => problemsOf(node).length);
  const state = snapshot ? stateLabel[snapshot.state] : "Draft";
  const open = dialog && typeof dialog === "object" ? null : dialog;
  // A dialog's own `close` event arrives after the next dialog was chosen, so each one only closes while it is still the current one.
  const closeIf = (match: (current: Dialog) => boolean) => () => setDialog(current => match(current) ? null : current);
  const isKind = (current: Dialog, kind: string) => !!current && typeof current === "object" && current.kind === kind;
  const saveText = save.error ? "Not saved" : save.saving ? "Saving…" : save.dirty ? "Unsaved" : "Saved";

  const inspector = <NodeInspector
    doc={doc} node={selected} engines={engines} simulated={simulated} run={snapshot?.nodes[selected.id]} locked={locked} now={clock}
    onChange={(change, field) => editNode(selected.id, change, field)} onAddChild={() => addBlock(selected.id)} onDuplicate={() => duplicateTask(selected.id)}
    onDelete={() => requestDelete(selected.id)} onMove={delta => editRoot(root => moveNode(root, selected.id, delta))}
    onReparent={parentId => editRoot(root => reparentNode(root, selected.id, parentId))} onRunBranch={() => void start(selected.id)}
    onResolve={action => void act({ type: action, id: selected.id })} onReviewPermission={() => reviewPermission(selected.id)}
    onConnect={to => connectBlocks(selected.id, to)} onLinkChange={changeLink} onLinkRemove={dropLink} onAddStep={addStep} onAddNext={role => addBlock(selected.id, { role })} />;

  const runControls = active
    ? <button type="button" className="proc-button proc-button--small" onClick={() => void act({ type: "stop" })}><Square size={12} />{uiText("Stop")}</button>
    : <>
      <button type="button" className="proc-button proc-button--dark proc-button--small" disabled={runStarting} onClick={() => void start()}>{runStarting ? <LoaderCircle className="proc-spin" size={12} /> : <Play size={12} />}{uiText(runStarting ? uiText("Starting...") : snapshot ? uiText("Run again") : uiText("Run"))}</button>
      {snapshot && <button type="button" className="proc-button proc-button--small" onClick={clearRun}>{uiText("Clear")}</button>}
    </>;

  const stateChip = <span className="proc-state" data-state={snapshot?.state ?? "draft"}>{uiText(state)}</span>;
  const saveChip = <span className="proc-save" data-state={save.error ? "error" : save.saving || save.dirty ? "busy" : "ok"} role="status">{save.error ? <AlertTriangle size={13} /> : save.saving ? <LoaderCircle className="proc-spin" size={13} /> : save.dirty ? null : <Check size={13} />}<span>{uiText(saveText)}</span></span>;
  const mapInset = { right: !narrow && panel ? 372 : 0, top: narrow ? 164 : 72, bottom: 72 };

  return <div className="proc-workspace" ref={setPage} data-narrow={narrow ? "" : undefined} data-view={view}>
    <div className="proc-stage">
      {view === "map"
        ? <ProcessMap
          root={doc.root} tree={tree} selectedId={selected.id} now={clock} formatCost={format} showCost={unit !== "none"} locked={locked} inset={mapInset} fitKey={`${doc.id}:${tidied}`} revealId={revealId}
          links={doc.links ?? []} selectedLinkId={pickedLink} onSelectLink={setPickedLinkId} check={(from, to) => checkLink(doc, from, to)} onConnect={connectBlocks} onLinkChange={changeLink} onLinkRemove={dropLink}
          multiIds={groupIds} onToggle={toggleMulti} onMoveMany={moveBlocks} notices={{ groups: sparkGroups, seen: seenSet, onSeen: markSeen, onDismiss: dropAlert }}
          onBlockMenu={openBlockMenu} push={reserve}
          onSelect={id => { setSelectedId(id); setRevealId(null); setPickedLinkId(null); setMulti([]); }} onOpen={id => { setSelectedId(id); if (narrow) setDialog("inspector"); else { setPanel(true); setRevealId(id); } }} onMove={moveBlock} onAdd={(parentId, pos) => addBlock(parentId, { pos })} onDelete={requestDelete} />
        : <motion.div className="proc-treewrap" style={{ paddingRight: treePadding }} {...treeMenuHandlers}>
          <AgentTree
            root={tree} title={uiText("Tasks")} noun={["task", "tasks"]} now={clock} formatCost={format} showCost={unit !== "none"} collapsed={collapsed} onCollapsedChange={setCollapsed}
            onSelect={agent => { setSelectedId(taskIdOf(agent.id)); setMulti([]); if (narrow) setDialog("inspector"); }} selectedId={selected.id} onResolve={resolve}
            renderCardActions={agent => {
              const node = findNode(doc.root, agent.id);
              if (!node) return null;
              return <>
                {node.approval && <span className="proc-tag" title={uiText("Asks you before it runs")}>{uiText("Approval")}</span>}
                {(() => { const loop = loopFrom(doc, node.id); return loop ? <span className="proc-tag" title={uiText("When it has finished, the blocks from {0} down to here run again", [findNode(doc.root, loop.to)?.name])}><Repeat size={10} /> {uiText(" back to ")}{uiText(findNode(doc.root, loop.to)?.name)} ×{uiText(loop.rounds ?? 2)}</span> : null; })()}
                {waitsFor(doc, node.id).length > 0 && <span className="proc-tag" title={uiText("Starts only after these blocks have finished")}><Hourglass size={10} /> {uiText(" waits for ")}{uiText(waitsFor(doc, node.id).map(from => findNode(doc.root, from)?.name).join(", "))}</span>}
                <button type="button" className="proc-add" aria-label={uiText("Add a sub-task to {0}", [node.name])} title={uiText("Add a sub-task")} disabled={locked} onClick={() => addBlock(node.id)}><Plus size={12} /></button>
                <span hidden data-block-menu={node.id} />
              </>;
            }}
          />
        </motion.div>}
    </div>
    {uiText(blockMenu && renderBlockMenu(blockMenu))}

    <div className="proc-top">
      <div className="proc-pill proc-pill--name">
        <h1 className="proc-name"><input aria-label={uiText("Process name")} value={doc.name} maxLength={LIMITS.name} onChange={event => edit(item => ({ ...item, name: event.target.value }), "name")} onBlur={() => { if (!doc.name.trim()) edit(item => ({ ...item, name: "Untitled process" })); }} /></h1>
        {uiText(stateChip)}
        <button type="button" className="proc-chip" data-kind={simulated ? "simulated" : "connected"} onClick={() => setDialog("connect")} aria-label={uiText(simulated ? uiText("Simulated engine. Connect an engine") : uiText("Connected engine"))} title={uiText(simulated ? uiText("Nothing is sent to a model. Click to connect an engine.") : uiText("A server runs the tasks."))}><Plug size={13} /><span>{uiText(simulated ? uiText("Simulated") : uiText("Connected"))}</span></button>
        <SplitButton className="proc-split" matchColors variant="secondary" size="compact" label={uiText(flashed ?? uiText("New process"))} icon={flashed ? <Check size={14} strokeWidth={2} /> : <Plus size={14} strokeWidth={2} />} menuLabel="More process actions" onClick={() => setDialog("new")}
          actions={[
            { id: "saved", label: `Saved processes (${library.processes.length})`, icon: <FolderOpen size={15} />, onSelect: () => setDialog("library") },
            { id: "duplicate", label: "Duplicate this process", icon: <Copy size={15} />, disabled: library.processes.length >= LIMITS.processes, onSelect: () => duplicateProcess(doc.id) },
            { id: "export", label: "Export as JSON", icon: <Download size={15} />, onSelect: exportProcess },
            { id: "import", label: "Import from a file…", icon: <Upload size={15} />, onSelect: () => importRef.current?.click() },
            { id: "delete", label: "Delete this process", icon: <Trash2 size={15} />, destructive: true, disabled: library.processes.length < 2, confirm: { prompt: "Delete?", confirmLabel: "Delete", doneLabel: "Deleted", onConfirm: () => deleteProcess(doc.id), onUndo: () => dispatch({ type: "undo" }) } },
          ]} />
      </div>
      <ProcessRunBar key={doc.id} tree={tree} title={uiText(view === "map" ? uiText("Blocks") : uiText("Tasks"))} noun={view === "map" ? ["block", "blocks"] : ["task", "tasks"]} formatCost={format} showCost={unit !== "none"} onResolve={resolve} onReviewWaiting={() => reviewPermission()} extra={runControls}
        doc={handle?.kind === "simulated" ? { ...doc, root: handle.log.root, links: handle.log.links, unit: handle.log.unit } : doc}
        snapshot={snapshot} simulated={simulated} engines={engines} starting={runStarting} onStart={() => start()} onAction={act}
        onLocate={id => { setView("map"); setMulti([]); setSelectedId(id); setRevealId(id); }} onReview={reviewPermission} onTrace={() => goTo("Tracing")} />
    </div>

    {view === "tree" && <div className="proc-notices" data-narrow={narrow ? "" : undefined}>
      <NotificationStack notices={stackNotices} onDismiss={item => dropAlert(item.id)} onDismissAll={() => setAlerts(current => ({ ...current, notices: [] }))} label={uiText("Run notifications")} />
    </div>}

    {groupIds.length > 1 && view === "map" && <div className="proc-multi proc-pill" role="toolbar" aria-label={uiText("Selected blocks")}>
      <span className="proc-multi__count" role="status">{uiText(groupIds.length)} {uiText(" blocks selected")}</span>
      <button type="button" className="proc-button proc-button--small proc-button--danger" disabled={locked} onClick={() => requestDelete(groupIds[0])}><Trash2 size={13} />{uiText("Delete")}</button>
      <button type="button" className="proc-button proc-button--small" onClick={() => setMulti([])}>{uiText("Clear")}</button>
    </div>}

    <div className="proc-toasts">
      {notice && <div className="proc-notice" data-kind={notice.kind} role={notice.kind === "error" ? "alert" : "status"}><span>{uiText(notice.text)}</span><button type="button" className="proc-icon-button" aria-label={uiText("Dismiss")} onClick={() => setNotice(null)}><X size={14} /></button></div>}
      {save.error && <div className="proc-notice" data-kind="error" role="alert"><span>{save.error.code === "conflict" ? uiText("This process was changed somewhere else, so your latest edit was not saved. Reload to see the stored copy.") : uiText("{0} Your edits are kept on this page.", [save.error.message])}</span>{save.error.code === "conflict" ? <button type="button" className="proc-button proc-button--small" onClick={onReload}>{uiText("Reload")}</button> : <button type="button" className="proc-button proc-button--small" onClick={save.retry}>{uiText("Retry")}</button>}</div>}
      {runSave.error && simulated && <div className="proc-notice" data-kind="error" role="alert"><span>{uiText("The run could not be saved on this browser, so it will not survive a reload.")}</span><button type="button" className="proc-button proc-button--small" onClick={runSave.retry}>{uiText("Retry")}</button></div>}
    </div>

    {view === "map" && doc.root.children.length === 0 && <p className="proc-hint">{uiText("This is the first block. Select it and use the + around it to connect more blocks, or choose a role under “Add block”.")}</p>}

    {!narrow && (panel || panelLeaving) && <motion.aside className="proc-side" aria-label={uiText("Block settings")} style={{ x: panelX }} inert={!panel}>
      <button type="button" className="proc-icon-button proc-side__close" aria-label={uiText("Close block settings")} onClick={() => setPanel(false)}><X size={15} /></button>
      {uiText(inspector)}
    </motion.aside>}

    {snapshot && <ProcessPermissions key={snapshot.id} doc={handle?.kind === "simulated" ? { ...doc, unit: handle.log.unit } : doc}
      root={handle?.kind === "simulated" ? handle.log.root : doc.root} snapshot={snapshot} simulated={simulated} engines={engines}
      preferredId={permissionReview.id} focusOnOpen={permissionReview.revision > 0} reviewRevision={permissionReview.revision}
      onDecide={(id, decision) => act({ type: decision, id })}
      onLocate={id => { setView("map"); setSelectedId(id); setRevealId(id); }} />}

    <div className="proc-dock proc-pill" role="toolbar" aria-label={uiText("Map tools")}>
      <div className="proc-dock__add">
        <button type="button" className="proc-button proc-button--dark proc-button--small" aria-haspopup="menu" aria-expanded={palette} disabled={locked} onClick={() => setPalette(value => !value)}><Plus size={13} />{uiText("Add block")}</button>
        <AnimatePresence>{palette && <MenuSurface className="proc-menu" side="top" role="menu" aria-label={uiText("Add a block connected to {0}", [selected.name])}>
          <p className="proc-menu__title">{uiText("Connect a new block to ")}<strong>{selected.name}</strong> {uiText(" as")}</p>
          {roles.map(role => <button key={role.id} type="button" role="menuitem" className="proc-menu__item" onClick={() => addBlock(selected.id, { role: role.id === "custom" ? undefined : role.id })}>
            <span className="proc-menu__dot" style={{ background: role.color }} /><span><strong>{uiText(role.label)}</strong><small>{uiText(role.description)}</small></span>
          </button>)}
        </MenuSurface>}</AnimatePresence>
      </div>
      <span className="proc-sep" />
      <button type="button" className="proc-icon-button" aria-label={uiText("Undo")} title={uiText("Undo (Ctrl+Z)")} disabled={!history.past.length} onClick={() => dispatch({ type: "undo" })}><Undo2 size={15} /></button>
      <button type="button" className="proc-icon-button" aria-label={uiText("Redo")} title={uiText("Redo (Ctrl+Shift+Z)")} disabled={!history.future.length} onClick={() => dispatch({ type: "redo" })}><Redo2 size={15} /></button>
      <span className="proc-sep" />
      <div className="proc-seg" role="group" aria-label={uiText("View")}>
        <button type="button" aria-pressed={view === "map"} onClick={() => setView("map")}>{uiText("Map")}</button>
        <button type="button" aria-pressed={view === "tree"} onClick={() => setView("tree")}>{uiText("Tree")}</button>
      </div>
      {view === "map" && <button type="button" className="proc-icon-button" aria-label={uiText("Tidy up the map")} title={uiText("Tidy up: let the map place every block again")} onClick={tidyUp}><LayoutGrid size={15} /></button>}
      <button type="button" className="proc-icon-button" aria-label={uiText("Process settings")} title={uiText("Process settings")} onClick={() => setDialog("settings")}><Settings2 size={15} /></button>
      {!narrow && <button type="button" className="proc-icon-button" aria-label={uiText("Block settings panel")} aria-pressed={panel} title={uiText("Block settings")} onClick={() => setPanel(value => !value)}><PanelRight size={15} /></button>}
      {problems.length > 0 && <button type="button" className="proc-chip" data-kind="warn" onClick={() => { setSelectedId(problems[0].id); setRevealId(problems[0].id); if (narrow) setDialog("inspector"); else setPanel(true); }}><AlertTriangle size={13} />{uiText(problems.length)} {uiText(" need")}{uiText(problems.length === 1 ? "s" : "")} {uiText(" attention")}</button>}
      <span className="proc-sep" />
      {uiText(saveChip)}
    </div>

    {narrow && <WorkspaceDialog open={open === "inspector"} title={uiText("Task settings")} onClose={closeIf(current => current === "inspector")} wide><div className="proc-dialog proc-dialog--inspector">{uiText(inspector)}</div></WorkspaceDialog>}
    <LibrarySheet open={open === "library"} onClose={closeIf(current => current === "library")} library={library} onSwitch={switchTo} onDuplicate={duplicateProcess} onDelete={deleteProcess} onUndo={() => dispatch({ type: "undo" })} onNew={() => setDialog("new")} />
    <SettingsDialog open={open === "settings"} onClose={closeIf(current => current === "settings")} doc={doc} simulated={simulated} remote={remote}
      onGoal={goal => edit(item => ({ ...item, goal }), "goal")} onUnit={value => edit(item => ({ ...item, unit: value }))} onConnect={() => setDialog("connect")}
      onExport={exportProcess} onImport={() => importRef.current?.click()} onTidy={() => { setDialog(null); tidyUp(); }} />
    <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void importFile(file); }} />
    <NewProcessSheet open={open === "new"} onClose={closeIf(current => current === "new")} onCreate={createProcess} />
    <ConnectDialog open={open === "connect"} onClose={closeIf(current => current === "connect")} simulated={simulated} engineCount={engines.length} />
    <ConfirmDialog
      open={isKind(dialog, "delete-task")} onClose={closeIf(current => isKind(current, "delete-task"))} title={uiText("Delete task")} confirmLabel={uiText("Delete")}
      message={(() => { const target = dialog && typeof dialog === "object" && dialog.kind === "delete-task" ? findNode(doc.root, dialog.id) : undefined; const count = target ? countNodes(target) - 1 : 0; return target ? `Delete “${target.name}”${count ? ` and its ${count} sub-task${count === 1 ? "" : "s"}` : ""}? You can undo this.` : "Delete this task?"; })()}
      onConfirm={() => { if (dialog && typeof dialog === "object" && dialog.kind === "delete-task") deleteTask(dialog.id); }} />
    <ConfirmDialog
      open={isKind(dialog, "delete-tasks")} onClose={closeIf(current => isKind(current, "delete-tasks"))} title={uiText("Delete blocks")} confirmLabel={uiText("Delete")}
      message={(() => {
        const ids = dialog && typeof dialog === "object" && dialog.kind === "delete-tasks" ? dialog.ids.filter(id => id !== doc.root.id) : [];
        const gone = new Set(ids.flatMap(id => { const target = findNode(doc.root, id); return target ? flattenNodes(target).map(node => node.id) : []; }));
        const named = ids.slice(0, 3).map(id => `“${findNode(doc.root, id)?.name ?? "Block"}”`).join(", ") + (ids.length > 3 ? ` and ${ids.length - 3} more` : "");
        return ids.length ? `Delete ${ids.length} block${ids.length === 1 ? "" : "s"} (${named})${gone.size > ids.length ? ` and what hangs under ${ids.length === 1 ? "it" : "them"}, ${gone.size} blocks in all` : ""}? ${dialog && typeof dialog === "object" && dialog.kind === "delete-tasks" && dialog.ids.includes(doc.root.id) ? "The first block stays. " : ""}You can undo this.` : "Delete these blocks?";
      })()}
      onConfirm={() => { if (dialog && typeof dialog === "object" && dialog.kind === "delete-tasks") deleteTasks(dialog.ids); }} />
    <p className="proc-sr" role="status">{uiText(providerOf(selected.ai.provider).label)} {uiText(" block selected: ")}{selected.name}</p>
  </div>;
}

