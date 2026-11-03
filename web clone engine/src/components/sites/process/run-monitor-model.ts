import { flattenNodes, linkKind, parentNode, waitsFor } from "./process-model.ts";
import type { ProcessDoc, ProcessNode } from "./process-model.ts";
import type { NodeRun, Round, RunSnapshot } from "./run-model.ts";

export interface MonitorStep {
  id: string;
  node: ProcessNode;
  run: NodeRun | Round;
  round: number;
  current: boolean;
  from: ProcessNode[];
}

/** Causal edges from the plan, never guessed from which timestamp came first. */
export function incomingBlocks(doc: ProcessDoc, id: string): ProcessNode[] {
  const nodes = flattenNodes(doc.root);
  const parent = parentNode(doc.root, id);
  const index = parent?.children.findIndex(node => node.id === id) ?? -1;
  const predecessor = parent?.mode === "sequence" && index > 0 ? parent.children[index - 1] : parent;
  const ids = new Set([...(predecessor ? [predecessor.id] : []), ...waitsFor(doc, id)]);
  return nodes.filter(node => ids.has(node.id));
}

export function monitorSteps(doc: ProcessDoc, snapshot: RunSnapshot | null): MonitorStep[] {
  if (!snapshot) return [];
  return flattenNodes(doc.root).flatMap(node => {
    const run = snapshot.nodes[node.id];
    if (!run) return [];
    const from = (round: number) => {
      const loopSources = round > 1 ? (doc.links ?? []).filter(link => link.to === node.id && linkKind(doc.root, link) === 'loop').map(link => link.from) : [];
      return loopSources.length ? flattenNodes(doc.root).filter(item => loopSources.includes(item.id)) : incomingBlocks(doc, node.id);
    };
    const past: MonitorStep[] = (run.rounds ?? []).map(round => ({ id: `${node.id}:${round.round}`, node, run: round, round: round.round, current: false, from: from(round.round) }));
    if (run.started !== undefined || run.waitedFrom !== undefined || run.status === "waiting") past.push({ id: `${node.id}:${run.round ?? 1}`, node, run, round: run.round ?? 1, current: true, from: from(run.round ?? 1) });
    return past;
  }).sort((a, b) => (a.run.waitedFrom ?? a.run.started ?? snapshot.at) - (b.run.waitedFrom ?? b.run.started ?? snapshot.at));
}

export function monitorElapsed(snapshot: RunSnapshot | null): number {
  if (!snapshot) return 0;
  const active = snapshot.state === "running" || snapshot.state === "waiting";
  const end = active ? snapshot.at : Math.max(snapshot.startedAt, ...Object.values(snapshot.nodes).flatMap(run => run.ended === undefined ? [] : [run.ended]));
  return Math.max(0, end - snapshot.startedAt);
}

export const monitorTime = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
