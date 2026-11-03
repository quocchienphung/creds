export const minute = 60_000;
export type LaneStatus = "done" | "running" | "waiting" | "failed";
export type TimedTask = {
  id: string;
  agentId: string;
  title: string;
  status: LaneStatus;
  start: number;
  end?: number;
  /** The next task's id, rather than the next agent's id. */
  handoffTo?: string;
  ask?: string;
  summary?: readonly string[];
};

export const statusLabel: Record<LaneStatus, string> = { done: "Done", running: "Running", waiting: "Needs you", failed: "Failed" };
export const durationLabel = (task: TimedTask, now: number) => `${Math.max(0, Math.round(((task.end ?? now) - task.start) / minute))}m`;

/** Unclamped coordinates let finished blocks slide off the left edge, under the fade mask. */
export function taskGeometry(task: TimedTask, now: number, span: number) {
  if (!Number.isFinite(span) || span <= 0 || task.start > now) return null;
  const end = Math.min(task.end ?? now, now);
  if (end <= now - span || end < task.start) return null;
  return { left: (task.start - (now - span)) / span * 100, width: (end - task.start) / span * 100 };
}

export function stateOfAgent(agentId: string, tasks: readonly TimedTask[], now: number, span: number) {
  const live = tasks.filter(task => task.agentId === agentId && taskGeometry(task, now, span));
  return live.some(task => task.status === "waiting") ? "waiting" : live.some(task => task.status === "running") ? "running" : "idle";
}

export function handoffPath(from: TimedTask, to: TimedTask, rows: readonly string[], now: number, span: number, rowHeight = 48) {
  const fromRow = rows.indexOf(from.agentId), toRow = rows.indexOf(to.agentId);
  if (fromRow < 0 || toRow < 0 || !taskGeometry(from, now, span) || !taskGeometry(to, now, span)) return null;
  const x1 = ((from.end ?? now) - (now - span)) / span * 1000;
  const x2 = (to.start - (now - span)) / span * 1000;
  const y1 = (fromRow + .5) * rowHeight, y2 = (toRow + .5) * rowHeight;
  return `M ${x1} ${y1} C ${x1 + 24} ${y1}, ${x2 - 24} ${y2}, ${x2} ${y2}`;
}

/** A local approval changes the display only. Controlled callers supply their own event handlers. */
export function resolveWaiting(task: TimedTask, approved: boolean, now: number): TimedTask {
  if (task.status !== "waiting") return task;
  return approved ? { ...task, status: "running", end: undefined } : { ...task, status: "failed", end: now };
}
