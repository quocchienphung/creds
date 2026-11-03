import type { AiMarkId } from "./ai-marks.generated.ts";

/**
 * The pure rules of the Agent Tree: statuses, what a branch costs, the totals in the bar, how long an agent has
 * been busy, and what a folded tree shows. No React, no clock of its own: every rule takes `now` as a number.
 */
export type AgentStatus = "idle" | "queued" | "running" | "waiting" | "done" | "failed" | "stopped";

/** The marks an avatar can show (the AI engines the plan offers); without one it shows initials. The three logos from the Delegate Board preview, and every logo in `ai-marks.generated.ts`. */
export type AvatarMark = "anthropic" | "openai" | "gemini" | AiMarkId;
/** The apps a task touches, drawn as their logos. */
export type ToolMark = "notion" | "github" | "slack" | "figma" | "hubspot" | "stripe";

export interface TreeAgent {
  id: string;
  name: string;
  task: string;
  /** The line under the name: a model, an engine, a person. */
  model?: string;
  mark?: AvatarMark;
  initials?: string;
  tools?: readonly ToolMark[];
  /** A small label with a color dot on the card, for example the block's role. */
  badge?: { label: string; color?: string };
  status: AgentStatus;
  /** What a waiting agent needs you to decide. */
  ask?: string;
  /** What went wrong for a failed agent. */
  error?: string;
  /** This agent's own cost; a card with children shows the whole branch. */
  cost?: number;
  /** Epoch milliseconds. */
  started?: number;
  ended?: number;
  /** Set when a loop ran this agent more than once: which pass the card shows, how many there are, and what the earlier passes did. */
  round?: { current: number; of: number; earlier: readonly { round: number; status: AgentStatus; cost: number; started?: number; ended?: number }[] };
  children?: readonly TreeAgent[];
}

export const statusLabel: Record<AgentStatus, string> = {
  idle: "Ready", queued: "Queued", running: "Running", waiting: "Needs you", done: "Done", failed: "Failed", stopped: "Stopped",
};

/** Queued and stopped agents (and the connectors leading to them) are drawn muted. */
export const isMuted = (status: AgentStatus) => status === "queued" || status === "stopped";

export function flatten(root: TreeAgent): TreeAgent[] {
  return [root, ...(root.children ?? []).flatMap(flatten)];
}

export const findAgent = (root: TreeAgent, id: string) => flatten(root).find(agent => agent.id === id);

/** The agent's own cost plus every sub-agent's: the number a card with children shows. */
export function branchCost(agent: TreeAgent): number {
  return (agent.cost ?? 0) + (agent.children ?? []).reduce((sum, child) => sum + branchCost(child), 0);
}

/** A cost still climbs while the agent, or anything below it, is running. */
export const branchLive = (agent: TreeAgent): boolean => agent.status === "running" || (agent.children ?? []).some(branchLive);

export interface Totals { agents: number; running: number; waiting: number; failed: number; cost: number; live: boolean }

export function totalsOf(root: TreeAgent): Totals {
  const all = flatten(root);
  return {
    agents: all.length, running: all.filter(agent => agent.status === "running").length,
    waiting: all.filter(agent => agent.status === "waiting").length, failed: all.filter(agent => agent.status === "failed").length,
    cost: branchCost(root), live: branchLive(root),
  };
}

/** The agents behind the "needs you" and "failed" windows, in tree order. */
export const agentsWith = (root: TreeAgent, status: AgentStatus) => flatten(root).filter(agent => agent.status === status);

/** How long the agent has been busy: running and waiting agents count up to `now`, finished ones stop at `ended`. */
export function busyMs(agent: TreeAgent, now: number): number | undefined {
  if (agent.started === undefined) return undefined;
  if (agent.ended !== undefined) return Math.max(0, agent.ended - agent.started);
  return agent.status === "running" || agent.status === "waiting" ? Math.max(0, now - agent.started) : undefined;
}

/** "4s", "45s", "1m 05s", "12m 00s", "1h 02m". */
export function durationLabel(ms: number): string {
  const total = Math.floor(ms / 1000);
  if (total < 60) return `${total}s`;
  if (total < 3600) return `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, "0")}s`;
  return `${Math.floor(total / 3600)}h ${String(Math.floor(total / 60) % 60).padStart(2, "0")}m`;
}

export const dollars = (amount: number) => `$${amount.toFixed(2)}`;

/** The tree as it is shown: a folded agent keeps itself and drops everything below. */
export function visibleTree(root: TreeAgent, collapsed: ReadonlySet<string>): TreeAgent {
  if (!root.children?.length) return root;
  return collapsed.has(root.id) ? { ...root, children: [] } : { ...root, children: root.children.map(child => visibleTree(child, collapsed)) };
}

/** Ids of the agents that have sub-agents, so a stale folded id (an agent that is gone) can be dropped. */
export const branchIds = (root: TreeAgent) => flatten(root).filter(agent => agent.children?.length).map(agent => agent.id);

export function depthOf(root: TreeAgent, id: string, depth = 0): number {
  if (root.id === id) return depth;
  for (const child of root.children ?? []) { const found = depthOf(child, id, depth + 1); if (found >= 0) return found; }
  return -1;
}

export function parentOf(root: TreeAgent, id: string): TreeAgent | undefined {
  return flatten(root).find(agent => agent.children?.some(child => child.id === id));
}

/** Ids present in `next` and absent from `previous`: the agents that grow in. */
export function addedIds(previous: ReadonlySet<string>, next: readonly TreeAgent[]) {
  return next.filter(agent => !previous.has(agent.id)).map(agent => agent.id);
}

/** A subtree that was in the tree a moment ago and is not any more: where it hung and what it was. */
export interface Ghost { parentId: string; index: number; agent: TreeAgent }

/** The top-level subtrees in `before` that `after` no longer has (a folded branch, removed data), under the parent they had. */
export function goneNodes(before: TreeAgent | undefined, after: TreeAgent): Ghost[] {
  if (!before) return [];
  const here = new Map((after.children ?? []).map(child => [child.id, child]));
  const ghosts: Ghost[] = [];
  (before.children ?? []).forEach((child, index) => {
    const kept = here.get(child.id);
    if (kept) ghosts.push(...goneNodes(child, kept));
    else ghosts.push({ parentId: before.id, index, agent: child });
  });
  return ghosts;
}

/** The tree with its ghosts put back in place (flagged in `leaving`), so they can fade out while the rest has moved on. */
export function withGhosts(tree: TreeAgent, ghosts: readonly Ghost[], leaving: Set<string>): TreeAgent {
  const own = ghosts.filter(ghost => ghost.parentId === tree.id);
  const children = (tree.children ?? []).map(child => withGhosts(child, ghosts, leaving));
  for (const ghost of [...own].sort((x, y) => x.index - y.index)) {
    for (const agent of flatten(ghost.agent)) leaving.add(agent.id);
    children.splice(Math.min(ghost.index, children.length), 0, ghost.agent);
  }
  return own.length || tree.children ? { ...tree, children } : tree;
}
