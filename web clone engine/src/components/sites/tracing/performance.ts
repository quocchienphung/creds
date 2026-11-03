import { flattenSpans, spanEnd } from "../affectui-trace-waterfall/trace-model.ts";
import type { TraceSpan } from "../affectui-trace-waterfall/trace-model.ts";
import type { AvatarMark, ToolMark } from "../affectui-agent-tree/tree-model.ts";

/**
 * How a run performed, read from its trace: the longest chain of blocks (the critical path), which blocks took the most time of their
 * own, how much of the time went to waiting for a person, which engines did the work and at what cost, and how parallel the run was.
 * Pure functions of the trace; nothing here knows about the Process page.
 */
export interface BlockTime { id: string; name: string; mark?: AvatarMark | ToolMark; /** ms the block itself worked or waited, without the blocks under it. */ own: number; /** Its share of all such time, 0..1. */ share: number; cost: number }
export interface EngineTime { mark: AvatarMark | ToolMark | null; own: number; cost: number; calls: number; blocks: number }
export interface PathStep { id: string; name: string; ms: number }
export interface Performance {
  /** Wall-clock length of the run. */
  duration: number;
  /** All the time blocks spent working or waiting, added up: more than `duration` when blocks ran side by side. */
  busy: number;
  /** busy / duration: 1 when one block worked at a time, 2.4 when about two and a half ran together. */
  parallelism: number;
  /** Time spent waiting for a person to approve, and how many times. */
  waiting: { ms: number; count: number };
  /** The chain of blocks, first to last, that ended the run: what to speed up to make it shorter. */
  critical: PathStep[];
  /** Blocks by the time they took themselves, longest first. */
  blocks: BlockTime[];
  engines: EngineTime[];
  /** Passes of the first block: more than 1 when a loop ran the plan again. */
  rounds: number;
  failed: number;
}

const isBlock = (span: TraceSpan) => span.kind === "agent" || span.kind === "subagent";

/** The length of the union of intervals: calls inside a block may overlap, and overlapping time counts once. */
function unionLength(intervals: readonly [number, number][]): number {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  let total = 0, end = -Infinity, start = 0;
  for (const [from, to] of sorted) {
    if (from > end) { if (end > -Infinity) total += end - start; start = from; end = to; }
    else end = Math.max(end, to);
  }
  return end > -Infinity ? total + (end - start) : 0;
}

export function performanceOf(root: TraceSpan, now: number): Performance {
  const all = flattenSpans(root);
  const duration = Math.max(0, Math.max(...all.map(span => spanEnd(span, now))) - root.start);

  // The time of a block itself: what its direct calls and waits cover (or, with none reported, the block's own bar)
  const timeOf = (block: TraceSpan): { own: number; cost: number; calls: number } => {
    const direct = (block.children ?? []).filter(child => !isBlock(child));
    const cost = direct.reduce((sum, child) => sum + (child.cost ?? 0), 0) + (block.cost ?? 0);
    const calls = direct.filter(child => child.kind === "llm" || child.kind === "tool").length;
    if (direct.length) return { own: unionLength(direct.map((child): [number, number] => [child.start, spanEnd(child, now)])), cost, calls };
    // No calls known (an engine that reports none): the block's own bar, without the time the blocks under it cover
    const from = block.start, to = spanEnd(block, now);
    const under = (block.children ?? []).filter(isBlock).map((child): [number, number] => [Math.max(from, child.start), Math.min(to, spanEnd(child, now))]).filter(([a, b]) => b > a);
    return { own: Math.max(0, unionLength([[from, to]]) - unionLength(under)), cost, calls };
  };

  const blocks = all.filter(isBlock).map(block => ({ block, ...timeOf(block) }));
  const busy = blocks.reduce((sum, item) => sum + item.own, 0);
  const waits = all.filter(span => span.kind === "wait" && span.detail !== undefined && /person|needs you/.test(span.detail));
  const byBlock: BlockTime[] = blocks.map(({ block, own, cost }) => ({ id: block.id, name: block.name, mark: block.mark, own, share: busy ? own / busy : 0, cost })).sort((a, b) => b.own - a.own);

  const engines = new Map<string, EngineTime>();
  for (const { block, own, cost, calls } of blocks) {
    const key = block.mark ?? "person";
    const entry = engines.get(key) ?? { mark: block.mark ?? null, own: 0, cost: 0, calls: 0, blocks: 0 };
    entry.own += own; entry.cost += cost; entry.calls += calls; entry.blocks += 1;
    engines.set(key, entry);
  }

  // The chain that ended the run: from the first block, always into the block that ended last
  const critical: PathStep[] = [];
  let at: TraceSpan | undefined = root;
  while (at) {
    const kids: TraceSpan[] = (at.children ?? []).filter(isBlock);
    const next: TraceSpan | undefined = kids.sort((a, b) => spanEnd(b, now) - spanEnd(a, now) || b.start - a.start)[0];
    critical.push({ id: at.id, name: at.name, ms: Math.max(0, spanEnd(at, now) - at.start) });
    at = next && spanEnd(next, now) >= spanEnd(at, now) - 1 ? next : kids.length ? next : undefined;
    if (at && critical.some(step => step.id === at!.id)) break;
  }

  const rootPasses = root.id.endsWith(":run") ? (root.children ?? []).length : 1;
  return {
    duration, busy, parallelism: duration ? busy / duration : 0,
    waiting: { ms: waits.reduce((sum, span) => sum + Math.max(0, spanEnd(span, now) - span.start), 0), count: waits.length },
    critical, blocks: byBlock, engines: [...engines.values()].sort((a, b) => b.own - a.own), rounds: rootPasses,
    failed: all.filter(span => span.status === "failed").length,
  };
}
