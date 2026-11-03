"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import type { CSSProperties, ReactNode } from "react";
import { durationLabel, handoffPath, minute, resolveWaiting, stateOfAgent, statusLabel, taskGeometry, type TimedTask } from "./lanes-model";
import "../affectui-fonts.css";
import "./agent-lanes.css";

export type LaneAgent = { id: string; name: string; model?: string; avatar?: ReactNode; avatarLabel?: string };
export type LaneTask = TimedTask & { tools?: readonly ReactNode[] };
export type AgentLanesProps = {
  agents: readonly LaneAgent[];
  tasks: readonly LaneTask[];
  span?: number;
  now?: number;
  onApprove?: (task: LaneTask) => void;
  onReject?: (task: LaneTask) => void;
  onOpen?: (task: LaneTask) => void;
  title?: string;
  className?: string;
  /** Guide me keeps its frames mounted. Inactive frames must not leave a decision open. */
  active?: boolean;
};

let clockNow = 0;
let clockTimer: ReturnType<typeof setInterval> | undefined;
const clockListeners = new Set<() => void>();
function subscribeClock(listener: () => void) {
  clockNow = Date.now();
  clockListeners.add(listener);
  clockTimer ??= setInterval(() => { clockNow = Date.now(); clockListeners.forEach(notify => notify()); }, 1000);
  return () => {
    clockListeners.delete(listener);
    if (!clockListeners.size) { clearInterval(clockTimer); clockTimer = undefined; }
  };
}
const readClock = () => clockNow;
const serverClock = () => 0;
const noClock = () => () => {};

const Spark = () => <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 1.2c.4 2.9 1.9 4.4 4.8 4.8-2.9.4-4.4 1.9-4.8 4.8C6.6 7.9 5.1 6.4 2.2 6 5.1 5.6 6.6 4.1 7 1.2Z" fill="currentColor" /><circle cx="11.6" cy="11.4" r="1.1" fill="currentColor" opacity=".55" /></svg>;
const Flag = () => <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1.8 10.8 10H1.2L6 1.8Z" fill="currentColor" /></svg>;

export function AgentLanes({ agents, tasks, span = 30 * minute, now: suppliedNow, onApprove, onReject, onOpen, title = "Agents", className, active = true }: AgentLanesProps) {
  const { t: uiText } = useWorkspaceI18n();
  const wallNow = useSyncExternalStore(suppliedNow === undefined && active ? subscribeClock : noClock, readClock, serverClock);
  const now = suppliedNow ?? wallNow;
  const root = useRef<HTMLDivElement>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const popover = useRef<HTMLDivElement>(null);
  const approve = useRef<HTMLButtonElement>(null);
  const popId = useId();
  const [opened, setOpened] = useState<string | null>(null);
  const [position, setPosition] = useState({ left: 0, top: 0, up: false });
  const [overrides, setOverrides] = useState<Record<string, { original: LaneTask; value: LaneTask }>>({});
  const resolved = tasks.map(task => {
    const override = overrides[task.id];
    return override && override.original.start === task.start && override.original.status === task.status
      ? { ...task, status: override.value.status, end: override.value.end } : task;
  });
  const shown = resolved.filter(task => taskGeometry(task, now, span));
  const selected = active ? shown.find(task => task.id === opened) : undefined;
  const running = shown.filter(task => task.status === "running").length;
  const waiting = shown.filter(task => task.status === "waiting").length;
  const rowIds = agents.map(agent => agent.id);
  const taskKey = selected?.id;
  const selectedWaiting = selected?.status === "waiting";

  function close(restoreFocus = false) {
    if (restoreFocus && opened) buttons.current.get(opened)?.focus({ preventScroll: true });
    setOpened(null);
  }

  const measurePopover = useCallback(() => {
    if (!taskKey) return;
    const r = root.current?.getBoundingClientRect(), b = buttons.current.get(taskKey)?.getBoundingClientRect(), p = popover.current?.getBoundingClientRect();
    if (!r || !b || !p) return;
    // Keep popovers inside the fixed Guide me frame and the viewport, including after rotation.
    const up = b.bottom + 4 + p.height > Math.min(r.bottom, window.innerHeight - 8);
    const desired = selectedWaiting ? b.right - p.width : b.left + b.width / 2 - p.width / 2;
    const left = Math.max(4, Math.min(r.width - p.width - 4, desired - r.left));
    const top = up ? b.top - r.top - 4 : b.bottom - r.top + 4;
    setPosition(current => current.left === left && current.top === top && current.up === up ? current : { left, top, up });
  }, [taskKey, selectedWaiting]);
  useLayoutEffect(() => {
    if (!taskKey) return;
    const observer = new ResizeObserver(measurePopover);
    if (root.current) observer.observe(root.current);
    if (popover.current) observer.observe(popover.current);
    window.addEventListener("resize", measurePopover);
    return () => { observer.disconnect(); window.removeEventListener("resize", measurePopover); };
  }, [taskKey, measurePopover]);
  useLayoutEffect(() => { measurePopover(); }, [now, measurePopover]);
  useLayoutEffect(() => { if (taskKey && selectedWaiting) approve.current?.focus({ preventScroll: true }); }, [taskKey, selectedWaiting]);

  useEffect(() => {
    if (!taskKey) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!popover.current?.contains(target) && !buttons.current.get(taskKey)?.contains(target)) setOpened(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      buttons.current.get(taskKey)?.focus({ preventScroll: true });
      setOpened(null);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape, true);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape, true); };
  }, [taskKey]);

  function decide(approved: boolean) {
    if (!selected || selected.status !== "waiting") return;
    const callback = approved ? onApprove : onReject;
    if (callback) callback(selected);
    else {
      const original = tasks.find(task => task.id === selected.id);
      if (original) setOverrides(current => ({ ...current, [original.id]: { original, value: { ...selected, ...resolveWaiting(selected, approved, now) } } }));
    }
    close(true);
  }

  return <div className={`agl${className ? ` ${className}` : ""}`} ref={root} data-active={active ? "" : undefined}>
    <div className="agl__card">
      <header className="agl__bar"><span className="agl__spark"><Spark /></span><span className="agl__title">{uiText(title)}</span>
        <span className="agl__summary">{running > 0 && <span data-kind="running">{uiText(running)} {uiText(" running")}</span>}{waiting > 0 && <span data-kind="needs">{uiText(waiting)} {uiText(" need you")}</span>}</span>
        <span className="agl__window">{uiText("Last ")}{uiText(Math.round(span / minute))}m</span>
      </header>
      <div className="agl__body" style={{ "--rows": agents.length } as CSSProperties}>
        <ul className="agl__agents" aria-label={uiText("Agents")}>
          {agents.map(agent => {
            const state = stateOfAgent(agent.id, shown, now, span);
            return <li className="agl__agent" key={agent.id} title={uiText("{0}{1}{2}", [agent.name, agent.avatarLabel ? ` · ${agent.avatarLabel}` : "", agent.model ? ` · ${agent.model}` : ""])}>
              <span className="agl__avatar" data-logo={agent.avatar ? "" : undefined} role="img" aria-label={uiText(agent.avatarLabel ?? agent.name)}>{agent.avatar ?? agent.name.split(/\s+/).map(word => word[0]).slice(0, 2).join("")}</span>
              <span className="agl__who" data-state={state}><span className="agl__name-line"><span className="agl__name">{uiText(agent.name)}</span><span className="agl__state" data-show={state !== "running" ? "" : undefined} aria-hidden={state === "running"}><span>{uiText(state === "waiting" ? uiText("Needs you") : uiText("Idle"))}</span></span></span>{agent.model && <span className="agl__model">{uiText(agent.model)}</span>}</span>
            </li>;
          })}
        </ul>
        <div className="agl__track">
          <div className="agl__grid" aria-hidden="true">{[5, 10, 15, 20, 25].filter(value => value < span / minute).map(value => <span className="agl__tick" key={value} style={{ left: `${100 - value * minute / span * 100}%` }}><span>−{uiText(value)}m</span></span>)}</div>
          <div className="agl__clip">
            <svg className="agl__curves" viewBox={`0 0 1000 ${agents.length * 48}`} preserveAspectRatio="none" aria-hidden="true">
              {shown.map(task => {
                const next = task.handoffTo ? shown.find(candidate => candidate.id === task.handoffTo) : undefined;
                const path = next ? handoffPath(task, next, rowIds, now, span) : null;
                return path && <path key={task.id} d={path} vectorEffect="non-scaling-stroke" data-live={next?.status === "running" ? "" : undefined} />;
              })}
            </svg>
            {agents.map((agent, index) => <ul className="agl__lane" key={agent.id} style={{ top: `${index * 48}px` }} aria-label={uiText("{0}'s tasks", [agent.name])}>
              {shown.filter(task => task.agentId === agent.id).map(task => {
                const geometry = taskGeometry(task, now, span)!;
                const label = `${agent.name}: ${task.title} – ${statusLabel[task.status]}, ${task.status === "done" ? "took " : ""}${durationLabel(task, now)}`;
                return <li className="agl__slot" key={task.id} style={{ left: `${geometry.left}%`, width: `${geometry.width}%` }} data-status={task.status}>
                  <button type="button" className="agl__block" ref={element => { if (element) buttons.current.set(task.id, element); else buttons.current.delete(task.id); }}
                    data-status={task.status} data-task-id={task.id} data-open={task.id === selected?.id ? "" : undefined}
                    aria-label={uiText(label)} aria-expanded={task.id === selected?.id} aria-controls={task.id === selected?.id ? popId : undefined} aria-describedby={task.id === selected?.id && !selectedWaiting ? popId : undefined} aria-haspopup={task.status === "waiting" ? "dialog" : undefined}
                    onClick={() => setOpened(current => current === task.id ? null : task.id)}>
                    {!!task.tools?.length && <span className="agl__tools" aria-hidden="true">{task.tools.slice(0, 3).map((tool, toolIndex) => <span className="agl__tool" key={toolIndex}>{uiText(tool)}</span>)}</span>}<span className="agl__label">{task.title}</span>
                  </button>
                  {task.status === "waiting" && <span className="agl__flag" aria-hidden="true"><Flag />{uiText("Needs you")}</span>}
                </li>;
              })}
            </ul>)}
          </div>
          <span className="agl__now" aria-hidden="true"><span>{uiText("now")}</span></span>
        </div>
      </div>
    </div>
    {selected && <div className={`agl__pop ${selectedWaiting ? "agl__ask" : "agl__tip"}`} ref={popover} id={popId} role={selectedWaiting ? "dialog" : "tooltip"} aria-label={selectedWaiting ? uiText("Decide: {0}", [selected.title]) : undefined} data-up={position.up ? "" : undefined} style={{ left: position.left, top: position.top }}>
      {selectedWaiting ? <><span className="agl__ask-title">{selected.title}</span><span className="agl__ask-text">{selected.ask ?? selected.title}</span><span className="agl__ask-actions"><button type="button" className="agl__btn" onClick={() => decide(false)}>{uiText("Reject")}</button><button type="button" className="agl__btn agl__btn--primary" ref={approve} onClick={() => decide(true)}>{uiText("Approve")}</button></span></>
        : <><span className="agl__tip-head">{uiText(agents.find(agent => agent.id === selected.agentId)?.name)} · {uiText(statusLabel[selected.status])} · {uiText(durationLabel(selected, now))}</span>{selected.summary?.length ? <ul className="agl__tip-list">{selected.summary.map(point => <li key={point}>{uiText(point)}</li>)}</ul> : <span className="agl__tip-title">{selected.title}</span>}{onOpen && <button type="button" className="agl__tip-open" onClick={() => onOpen(selected)}>{uiText("Open")}</button>}</>}
    </div>}
    <span className="agl__sr" role="status" aria-live="polite">{uiText(waiting ? uiText("{0} {1} you", [waiting, waiting === 1 ? "task needs" : "tasks need"]) : uiText("{0} running", [running]))}</span>
  </div>;
}
