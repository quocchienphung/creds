"use client";

import { useCallback, useId, useState, useSyncExternalStore } from "react";
import { AgentLanes, type LaneAgent, type LaneTask } from "./AgentLanes";
import { minute } from "./lanes-model";
import icons from "./icons.json";
import { extraMarks, type ExtraMarkId } from "./extra-marks.generated";
import "./extra-lanes.css";

/**
 * Two more lanes for the Guide me CRM frame: Hermes Agent and Ollama, below the four of the reference. They live in this
 * file so the reference lanes (CrmAgentLanes.tsx, AgentLanes.tsx) stay exactly as observed. The marks come from
 * extra-marks.generated.ts; the tools reuse the static brand artwork already bundled in icons.json.
 *
 * The frame is a fixed 380:401 box and a lane row is 48px, so the number of lanes follows the frame's height instead of
 * scaling the card (which would move the approval popover): 6 where there is room, fewer on a short phone frame.
 * Tasks are illustrative demo content, like the reference lanes; nothing calls a service.
 */
const ROW = 48;
/** Card height without its lanes: header + time axis + padding (279px with the reference's four lanes = 87 + 4 × 48). */
const CHROME = 87;
/** The same with `.agl--tight` (extra-lanes.css): 3px less above and below the header, 4px above and 4px below the axis. */
const CHROME_TIGHT = 73;

function Mark({ id }: { id: ExtraMarkId }) {
  const mark = extraMarks[id];
  return <span className="agl__icon" aria-hidden="true" style={{ color: "var(--agl-strong, #000)" }}
    dangerouslySetInnerHTML={{ __html: `<svg viewBox="${mark.viewBox}" fill="currentColor" fill-rule="evenodd">${mark.html}</svg>` }} />;
}

/** The same unique-id treatment as the reference lanes' icons, so repeated gradients never collide. */
function Tool({ name }: { name: keyof typeof icons }) {
  const id = useId();
  let svg = icons[name];
  for (const match of icons[name].matchAll(/\bid="([^"]+)"/g)) {
    const unique = `${id}-${match[1]}`;
    svg = svg.replaceAll(`id="${match[1]}"`, `id="${unique}"`).replaceAll(`url(#${match[1]})`, `url(#${unique})`);
  }
  return <span className="agl__icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />;
}
const tools = (...names: (keyof typeof icons)[]) => names.map(name => <Tool name={name} key={name} />);

export const extraAgents: readonly LaneAgent[] = [
  { id: "hermes", name: "Hermes", model: "Hermes Agent", avatarLabel: "Hermes Agent", avatar: <Mark id="hermes" /> },
  { id: "ollama", name: "Local", model: "Ollama", avatarLabel: "Ollama", avatar: <Mark id="ollama" /> },
];

export const extraTasks: readonly LaneTask[] = [
  { id: "h1", agentId: "hermes", title: "Triage inbox", status: "done", start: -27 * minute, end: -17 * minute, tools: tools("slack", "notion"), summary: ["Read 38 new tickets", "Tagged 9 as urgent", "Left 3 notes for the Writer"] },
  { id: "h2", agentId: "hermes", title: "Draft replies", status: "running", start: -8 * minute, tools: tools("slack"), summary: ["Answering the 9 urgent tickets"] },
  { id: "l1", agentId: "ollama", title: "Index docs", status: "done", start: -29 * minute, end: -19 * minute, tools: tools("notion", "github"), summary: ["Split 212 pages into chunks", "Embedded them on this machine"] },
  { id: "l2", agentId: "ollama", title: "Local eval", status: "running", start: -12 * minute, tools: tools("github"), summary: ["Running 40 prompts on the local model"] },
];

const noSubscribe = () => () => {};
const wantsBase = () => new URLSearchParams(window.location.search).get("lanes") === "base";

/** Agent Lanes with as many of the extra lanes as the frame can hold. `?lanes=base` shows the reference's four only. */
export function FittedLanes({ agents, tasks, now, active }: { agents: readonly LaneAgent[]; tasks: readonly LaneTask[]; now: number; active: boolean }) {
  const [frame, setFrame] = useState<HTMLElement | null>(null);
  // A stable callback ref: the frame is the element this component sits in (`.crm-lanes`).
  const attach = useCallback((element: HTMLElement | null) => setFrame(element?.parentElement ?? null), []);
  const subscribe = useCallback((notify: () => void) => {
    if (!frame) return () => {};
    const observer = new ResizeObserver(notify);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [frame]);
  // The server and the first client render use 0 (the four reference lanes), so hydration never disagrees.
  const height = useSyncExternalStore(subscribe, () => frame?.clientHeight ?? 0, () => 0);
  const baseOnly = useSyncExternalStore(noSubscribe, wantsBase, () => false);
  const most = agents.length + extraAgents.length;
  const roomy = Math.min(most, Math.floor((height - CHROME) / ROW));
  const snug = Math.min(most, Math.floor((height - CHROME_TIGHT) / ROW));
  // Trim the card's padding only when that buys another lane; otherwise keep the reference's proportions.
  const tight = !baseOnly && snug > Math.max(roomy, agents.length);
  const extra = baseOnly ? 0 : Math.max(0, (tight ? snug : roomy) - agents.length);
  const shownAgents = [...agents, ...extraAgents.slice(0, extra)];
  const shown = new Set(shownAgents.map(agent => agent.id));
  const shownTasks = [...tasks, ...extraTasks].filter(task => shown.has(task.agentId));
  return <>
    <span hidden ref={attach} />
    <AgentLanes agents={shownAgents} tasks={shownTasks} now={now} active={active} className={tight ? "agl--tight" : undefined} />
  </>;
}
