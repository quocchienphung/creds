/**
 * Pure rules of the Delegate Board: who is busy until when, where a task would go, and the automatic routing.
 * No React and no clock of its own, so every rule can be tested with plain numbers.
 */
import type { BrandIconId } from "./brand-icons.generated.ts";

/** The apps a task touches, drawn as their logos. */
export type ToolId = Exclude<BrandIconId, "anthropic" | "openai" | "gemini">;
/** The makers whose mark can stand in for an agent's avatar. */
export type ProviderId = Extract<BrandIconId, "anthropic" | "openai" | "gemini">;
export type DelegateMode = "auto" | "manual";

export type DelegateAgent = {
  id: string;
  name: string;
  /** The line under the name: a model, a team, a role. */
  model?: string;
  /** The maker's mark in the avatar. Without one the avatar shows letters. */
  logo?: ProviderId;
  /** Letters in the avatar; derived from the name when omitted. */
  initials?: string;
  /** Minutes left on the task it runs right now (the first task of its queue). */
  current?: number;
  /** Cost per minute of work. Without any rate the board totals time instead of money. */
  rate?: number;
};

export type DelegateTask = {
  id: string;
  title: string;
  /** Minutes the task takes. */
  estimate: number;
  tools?: readonly ToolId[];
  /** The agent whose queue holds the task; null or missing means it is unassigned. */
  agentId?: string | null;
};

export type Suggestion = { taskId: string; agentId: string };

/** Tasks in a queue keep the order they were handed over in; the first one is the running one. */
export const queueOf = <T extends DelegateTask>(tasks: readonly T[], agentId: string) => tasks.filter(task => task.agentId === agentId);
export const unassignedOf = <T extends DelegateTask>(tasks: readonly T[]) => tasks.filter(task => !task.agentId);

/** Minutes until the agent is free: the running task's remaining time (or its estimate), plus every task behind it. */
export function busyMinutes(agent: DelegateAgent, queue: readonly DelegateTask[]) {
  if (!queue.length) return Math.max(0, agent.current ?? 0);
  const [first, ...rest] = queue;
  const running = Math.max(0, agent.current ?? first.estimate);
  return running + rest.reduce((sum, task) => sum + task.estimate, 0);
}

/** The busy time the agent would have after taking `task`. A task already in this queue changes nothing. */
export function busyMinutesWith(agent: DelegateAgent, tasks: readonly DelegateTask[], task: DelegateTask) {
  const queue = queueOf(tasks, agent.id).filter(item => item.id !== task.id);
  return busyMinutes(agent, [...queue, task]);
}

/** Hands a task over (or back, with null). It joins the end of the queue; an unchanged hand-off returns the same array. */
export function assignTask<T extends DelegateTask>(tasks: readonly T[], taskId: string, agentId: string | null): T[] {
  const index = tasks.findIndex(task => task.id === taskId);
  if (index < 0 || (tasks[index].agentId ?? null) === agentId) return tasks as T[];
  const moved = { ...tasks[index], agentId };
  return [...tasks.slice(0, index), ...tasks.slice(index + 1), moved];
}

/** The agent who is free first; ties go to the one listed first. */
export function leastBusyAgent(agents: readonly DelegateAgent[], tasks: readonly DelegateTask[]) {
  let best: DelegateAgent | undefined;
  let bestMinutes = Infinity;
  for (const agent of agents) {
    const minutes = busyMinutes(agent, queueOf(tasks, agent.id));
    if (minutes < bestMinutes) { best = agent; bestMinutes = minutes; }
  }
  return best?.id ?? null;
}

/** What waits in the queues: money when any agent has a rate, otherwise minutes. */
export function queueTotals(agents: readonly DelegateAgent[], tasks: readonly DelegateTask[]) {
  let minutes = 0;
  let cost = 0;
  for (const agent of agents) {
    const busy = busyMinutes(agent, queueOf(tasks, agent.id));
    minutes += busy;
    cost += busy * (agent.rate ?? 0);
  }
  return { minutes, cost, priced: agents.some(agent => agent.rate !== undefined) };
}

/** "09:20": the wall-clock time `minutes` after `now` (24-hour, local). */
export function clockLabel(now: number, minutes: number) {
  const date = new Date(now + minutes * 60_000);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function formatMinutes(minutes: number) {
  const whole = Math.round(minutes);
  if (whole < 60) return `${whole} min`;
  return whole % 60 ? `${Math.floor(whole / 60)} h ${whole % 60} min` : `${whole / 60} h`;
}

export const defaultFormatCost = (amount: number) => `$${amount.toFixed(2)}`;

export function initialsOf(agent: DelegateAgent) {
  if (agent.initials) return agent.initials;
  const words = agent.name.trim().split(/\s+/);
  return (words.length > 1 ? words[0][0] + words[1][0] : agent.name.slice(0, 2)).toUpperCase();
}
