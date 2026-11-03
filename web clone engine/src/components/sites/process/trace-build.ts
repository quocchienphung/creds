import type { SpanKind, SpanStatus, TraceSpan } from "../affectui-trace-waterfall/trace-model.ts";
import type { AvatarMark, ToolMark } from "../affectui-agent-tree/tree-model.ts";
import { modelLabel } from "./catalog.ts";
import { markOf, toolIds } from "./process-model.ts";
import { durationOf } from "./run-model.ts";
import type { CostUnit, ProcessDoc, ProcessNode } from "./process-model.ts";
import type { EngineInfo } from "./engine.ts";
import type { Attempt, Call, NodeRun, Round, RunSnapshot } from "./run-model.ts";
import type { Role } from "./roles.ts";

/**
 * A run of the Process page as a trace: every block is a span (the first block the agent run, the others sub-agents), and inside a
 * block its model calls, tool calls and the time it waited for a person. What a run really tells is a block's status, cost and times;
 * a real engine may also report the calls inside a block (`NodeRun.calls`) and then those are shown as reported. The simulated
 * engine reports none, so for it the calls inside a block are *derived* from the block's own settings (its model, its tool labels and
 * how long it works) and are demo values, like the rest of the simulation. Failed tries and earlier passes of a loop stay as spans of
 * their own, because a retry is a new span and the failed one tells the story.
 */
export interface TraceBuildOptions {
  /** The simulated engine produced the snapshot: blocks that report no calls get derived ones. */
  simulated: boolean;
  engines?: readonly EngineInfo[];
}

/** One pass of a block: the earlier passes of a loop, then the current one. */
type Pass = Round & { ask?: string; round: number };
function passesOf(run: NodeRun): Pass[] {
  const current: Pass = { round: run.round ?? 1, status: run.status, cost: run.cost, started: run.started, ended: run.ended, waitedFrom: run.waitedFrom, error: run.error, attempts: run.attempts, calls: run.calls, ask: run.ask };
  return [...(run.rounds ?? []), current].filter(pass => pass.started !== undefined);
}

/** What a block's first model call is called, by the block's role: demo wording for the simulated engine. */
const callNames: Record<Role, [string, string]> = {
  coordinator: ["Split the goal", "Write the report"], planner: ["Plan the steps", "Write the plan"], creator: ["Draft it", "Finish the draft"], coder: ["Read the step", "Write the change"],
  qa: ["Read the result", "Write the verdict"], reviewer: ["Read the result", "Write the review"], fixer: ["Find the cause", "Write the fix"], reverter: ["Find the last good version", "Write the rollback"],
  revoker: ["List what is open", "Write what was revoked"], instructor: ["Read the result", "Write the explanation"], helper: ["Look it up", "Write the answer"],
  processor: ["Read the input", "Write the output"], custom: ["Run the task", "Write the result"],
};

const spanStatus = (status: NodeRun["status"]): SpanStatus => status === "failed" ? "failed" : status === "done" || status === "stopped" ? "done" : "running";
const toolMark = (name: string): ToolMark | undefined => toolIds.find(id => id === name.toLowerCase());
const toolNames: Record<ToolMark, string> = { notion: "Notion", github: "GitHub", slack: "Slack", figma: "Figma", hubspot: "HubSpot", stripe: "Stripe" };

/** Calls a block made: as reported, or (simulated engine only) derived from the block's settings. Times are epoch ms. */
function callsOf(node: ProcessNode, pass: Pass, now: number, options: TraceBuildOptions): Call[] {
  if (pass.calls?.length) return pass.calls;
  if (!options.simulated || pass.started === undefined) return [];
  const planned = Math.max(1, durationOf(node));
  const workStart = pass.started;
  const stopAt = pass.ended !== undefined && pass.status !== "done" ? pass.ended : Infinity;
  const names = callNames[node.role];
  const plan: { kind: "llm" | "tool"; name: string; detail?: string; from: number; to: number }[] = [];
  if (node.ai.provider === "human") plan.push({ kind: "llm", name: "A person does this", from: 0, to: 1 });
  else if (!node.tools.length) plan.push({ kind: "llm", name: names[0], from: 0, to: 1 });
  else {
    plan.push({ kind: "llm", name: names[0], from: 0, to: 0.28 });
    const share = 0.44 / node.tools.length;
    node.tools.forEach((tool, index) => plan.push({ kind: "tool", name: tool, from: 0.28 + share * index, to: 0.28 + share * (index + 1) - 0.02 }));
    plan.push({ kind: "llm", name: names[1], from: 0.74, to: 1 });
  }
  const calls: Call[] = [];
  plan.forEach((item, index) => {
    const start = workStart + item.from * planned, end = workStart + item.to * planned;
    if (start > now || start >= stopAt) return;
    const clipped = Math.min(end, stopAt);
    const running = clipped > now && pass.status !== "done";
    const failed = stopAt !== Infinity && end > stopAt && pass.status === "failed";
    calls.push({
      id: `${index}`, kind: item.kind, name: item.kind === "tool" ? toolNames[item.name as ToolMark] ?? item.name : item.name, status: failed ? "failed" : running ? "running" : "done", start, ...(running ? {} : { end: clipped }),
      ...(failed ? { error: pass.error } : {}),
    });
  });
  return calls;
}

/** Demo tokens: about 520 in and 140 out for every second a model call runs (or, when costs are counted in tokens, the cost itself). */
function tokensFor(unit: CostUnit, seconds: number, cost: number): { tokensIn: number; tokensOut: number } {
  if (unit === "tokens") return { tokensIn: Math.round(cost * 0.8), tokensOut: Math.round(cost * 0.2) };
  return { tokensIn: Math.round(seconds * 520), tokensOut: Math.round(seconds * 140) };
}

export function buildProcessTrace(doc: ProcessDoc, snapshot: RunSnapshot, now: number, options: TraceBuildOptions): TraceSpan {
  const t0 = snapshot.startedAt;
  const rel = (at: number) => Math.max(0, at - t0);
  const engines = options.engines ?? [];

  const blockSpans = (node: ProcessNode, isRoot: boolean): TraceSpan[] => {
    const run = snapshot.nodes[node.id];
    if (!run) return [];
    const passes = passesOf(run);
    const model = modelLabel(node.ai.provider, node.ai.model, engines);
    const mark = markOf(node.ai.provider) as AvatarMark | undefined;
    const childSpans = node.children.map(child => blockSpans(child, false));
    return passes.map((pass, index): TraceSpan => {
      const last = index === passes.length - 1;
      const id = last ? node.id : `${node.id}#${pass.round}`;
      const status = spanStatus(pass.status);
      const begin = pass.waitedFrom ?? pass.started!;
      const end = pass.status === "running" || pass.status === "waiting" || pass.status === "queued" ? undefined : pass.ended;
      const children: TraceSpan[] = [];

      // The time the block waited for a person to say yes
      if (pass.waitedFrom !== undefined && pass.started !== undefined) children.push({ id: `${id}:wait`, name: "Waiting for approval", kind: "wait", status: "done", start: rel(pass.waitedFrom), end: rel(pass.started), detail: "a person", input: pass.ask });
      else if (pass.status === "waiting") children.push({ id: `${id}:wait`, name: "Waiting for approval", kind: "wait", status: "running", start: rel(pass.started!), detail: "needs you", input: pass.ask });

      // Failed tries first, then the calls of the try that counts
      const attempts: Attempt[] = pass.attempts ?? [];
      const names = callNames[node.role];
      attempts.forEach((attempt, tryIndex) => {
        const seconds = Math.max(0, attempt.ended - attempt.started) / 1000;
        children.push({ id: `${id}:try${tryIndex + 1}`, name: `${names[1]} (try ${tryIndex + 1})`, kind: "llm", status: "failed", start: rel(attempt.started), end: rel(attempt.ended), mark, detail: model, cost: attempt.cost, error: attempt.error, ...tokensFor(doc.unit, seconds, attempt.cost) });
      });
      const calls = callsOf(node, pass, now, options);
      const modelSeconds = calls.filter(call => call.kind === "llm").reduce((sum, call) => sum + Math.max(0, (call.end ?? now) - call.start) / 1000, 0) || 1;
      for (const call of calls) {
        const seconds = Math.max(0, (call.end ?? now) - call.start) / 1000;
        const reported = !!pass.calls?.length;
        const share = call.kind === "llm" && !reported ? seconds / modelSeconds : 0;
        const cost = reported ? call.cost : call.kind === "llm" ? pass.cost * share : undefined;
        children.push({
          id: `${id}:call:${call.id}`, name: call.name, kind: call.kind === "tool" ? "tool" : node.ai.provider === "human" ? "wait" : "llm", status: call.status, start: rel(call.start), ...(call.end !== undefined ? { end: rel(call.end) } : {}),
          detail: call.detail ?? (call.kind === "tool" ? "tool call" : model), mark: call.kind === "tool" ? toolMark(call.name) : mark,
          ...(cost !== undefined ? { cost } : {}),
          ...(reported ? { ...(call.tokensIn !== undefined ? { tokensIn: call.tokensIn } : {}), ...(call.tokensOut !== undefined ? { tokensOut: call.tokensOut } : {}) } : call.kind === "llm" && node.ai.provider !== "human" ? tokensFor(doc.unit, seconds, cost ?? 0) : {}),
          ...(call.input ? { input: call.input } : call.kind === "llm" && index === passes.length - 1 ? { input: node.task } : {}), ...(call.output ? { output: call.output } : {}), ...(call.error ? { error: call.error } : {}),
        });
      }
      // No calls known (a real engine that reports none): the block itself carries its cost
      const own = !calls.length && !attempts.length ? { cost: pass.cost } : {};

      // The blocks under this one: a pass of a child belongs to the pass of this block that was running when the child's pass started
      const from = index === 0 ? -Infinity : rel(passes[index].waitedFrom ?? passes[index].started!), until = last ? Infinity : rel(passes[index + 1].waitedFrom ?? passes[index + 1].started!);
      for (const spans of childSpans) children.push(...spans.filter(span => span.start >= from && span.start < until));
      children.sort((a, b) => a.start - b.start);

      const stopped = pass.status === "stopped";
      return {
        id, name: node.name, kind: (isRoot ? "agent" : "subagent") as SpanKind, status, start: rel(begin), ...(end !== undefined ? { end: rel(end) } : {}),
        detail: `${model}${passes.length > 1 ? ` · round ${pass.round}` : ""}${stopped ? " · stopped" : ""}`, mark,
        input: node.task, ...(pass.error ? { error: pass.error } : {}),
        ...own, ...(children.length ? { children } : {}),
      };
    });
  };

  const rootSpans = blockSpans(doc.root, true);
  if (!rootSpans.length) return { id: doc.root.id, name: doc.root.name, kind: "agent", status: "running", start: 0 };
  if (rootSpans.length === 1) return { ...rootSpans[0], input: doc.goal || rootSpans[0].input };
  // The first block ran more than once (a loop back to it): the run holds each pass.
  return { id: `${doc.root.id}:run`, name: doc.root.name, kind: "agent", status: rootSpans.some(span => span.status === "running") ? "running" : rootSpans[rootSpans.length - 1].status, start: rootSpans[0].start, input: doc.goal, children: rootSpans.map(span => ({ ...span, kind: "subagent" as const })) };
}
