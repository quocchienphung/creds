import type { TreeAgent } from "../affectui-agent-tree/tree-model.ts";
import { modelLabel } from "./catalog.ts";
import { markOf } from "./process-model.ts";
import { roleOf } from "./roles.ts";
import type { ProcessNode } from "./process-model.ts";
import type { EngineInfo } from "./engine.ts";
import type { NodeRun, RunSnapshot } from "./run-model.ts";

/** A failed earlier try of a task is shown as its own card, with this suffix on the task's id. */
export const attemptId = (id: string, index: number) => `${id}~${index + 1}`;
/** The task a card belongs to (a failed try belongs to the task that was retried). */
export const taskIdOf = (cardId: string) => cardId.split("~")[0];
export const isAttemptCard = (cardId: string) => cardId.includes("~");

interface ViewOptions { snapshot: RunSnapshot | null; engines?: readonly EngineInfo[] }

function agentOf(node: ProcessNode, run: NodeRun | undefined, snapshot: RunSnapshot | null, engines: readonly EngineInfo[]): TreeAgent {
  const idle = !snapshot;
  const earlier = run?.rounds ?? [];
  // A loop that ran the block again: the card shows the newest pass, and what the block cost is what every pass cost.
  const cost = run && earlier.length ? run.cost + earlier.reduce((sum, round) => sum + round.cost, 0) : run?.cost;
  return {
    id: node.id, name: node.name, task: node.task, model: modelLabel(node.ai.provider, node.ai.model, engines), mark: markOf(node.ai.provider),
    initials: node.ai.provider === "human" ? "ME" : node.name.slice(0, 2), tools: node.tools,
    ...(node.role !== "custom" ? { badge: { label: roleOf(node.role).label, color: roleOf(node.role).color } } : {}),
    status: idle ? "idle" : run?.status ?? "idle", ask: run?.ask, error: run?.error, cost, started: run?.started, ended: run?.ended,
    ...(run?.of && run.of > 1 ? { round: { current: run.round ?? 1, of: run.of, earlier: earlier.map(round => ({ round: round.round, status: round.status, cost: round.cost, started: round.started, ended: round.ended })) } } : {}),
  };
}

/**
 * The plan as the Agent Tree draws it. Without a run every card is "ready"; with one, each card takes the status, cost
 * and times of its task. A task that was retried keeps its failed tries as cards of their own before the live one, so
 * the story of what happened stays visible (the tree's own advice).
 */
export function buildTree(root: ProcessNode, { snapshot, engines = [] }: ViewOptions): TreeAgent {
  const build = (node: ProcessNode, isRoot: boolean): TreeAgent[] => {
    const run = snapshot?.nodes[node.id];
    const tries = isRoot ? [] : (run?.attempts ?? []).map((attempt, index): TreeAgent => ({
      ...agentOf(node, undefined, snapshot, engines), id: attemptId(node.id, index), status: "failed", error: attempt.error, cost: attempt.cost, started: attempt.started, ended: attempt.ended,
    }));
    const children = node.children.flatMap(child => build(child, false));
    return [...tries, { ...agentOf(node, run, snapshot, engines), ...(children.length ? { children } : {}) }];
  };
  return build(root, true)[0];
}
