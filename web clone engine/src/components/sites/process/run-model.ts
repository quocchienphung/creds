import type { AgentStatus } from "../affectui-agent-tree/tree-model.ts";
import { LIMITS, flattenNodes, findNode, freeInDollars, linkKind } from "./process-model.ts";
import type { CostUnit, ProcessLink, ProcessNode, Provider } from "./process-model.ts";

/**
 * How a run looks at one moment, and the simulated engine that produces it. A real engine (a backend) reports a
 * `RunSnapshot` directly; the simulated one derives it as a pure function of the plan, the decisions made so far and
 * the clock: no timers advance state, so a page reload continues the same run and every rule can be tested with plain
 * numbers. Nothing here calls a model: durations and costs are labelled demo values (see `docs/research/process`).
 *
 * A loop (a connection back to a block that came before) is played by running the blocks from there again: the second pass
 * is a copy of those blocks whose ids end in `@<link>-<round>`. The snapshot hides that: every block has one entry under its
 * own id, holding its newest pass, with the earlier passes in `rounds`; `runId` says which pass a decision is about.
 */
export type RunAction = { type: "approve" | "reject" | "retry" | "dismiss"; id: string } | { type: "stop" };
export interface RunEvent { t: number; action: RunAction }

/** An earlier try of a task that failed and was retried; shown as its own failed card. */
export interface Attempt { cost: number; started: number; ended: number; error: string }
/**
 * One call a block made while it worked: a model call or a tool call, with when it ran and what it cost. A real engine may report
 * them (`NodeRun.calls`) so the Tracing page can show where a block's time and money went; the simulated engine reports none.
 * Times are epoch milliseconds, like `started` and `ended`; a call that has no `end` is still going.
 */
export interface Call {
  id: string;
  kind: "llm" | "tool";
  name: string;
  /** A few muted words after the name: the model, the query. */
  detail?: string;
  status: "running" | "done" | "failed";
  start: number;
  end?: number;
  tokensIn?: number;
  tokensOut?: number;
  cost?: number;
  input?: string;
  output?: string;
  error?: string;
}
/** An earlier pass of a block that a loop ran again. */
export interface Round { round: number; status: AgentStatus; cost: number; started?: number; ended?: number; waitedFrom?: number; error?: string; attempts?: Attempt[]; calls?: Call[] }
export interface NodeRun {
  status: AgentStatus;
  /** The cost of the current try only; failed tries are in `attempts`, earlier passes in `rounds`. */
  cost: number;
  started?: number;
  ended?: number;
  /** When the block began waiting for a person to approve it, if it needed that; `started` is when the person said yes. */
  waitedFrom?: number;
  ask?: string;
  error?: string;
  attempts?: Attempt[];
  /** The calls the block made, when the engine reports them (a real engine may; the simulated one does not). */
  calls?: Call[];
  /** Which pass this is (1 for a block no loop ran again) and how many passes there are in all. */
  round?: number;
  of?: number;
  /** The earlier passes of this block, oldest first. */
  rounds?: Round[];
  /** What a decision about this block must name when it is not the block's own id (a later pass of a loop). */
  runId?: string;
}
export type RunState = "running" | "waiting" | "done" | "failed" | "stopped";
export interface RunSnapshot { id: string; processId: string; startedAt: number; /** The moment this snapshot describes. */ at: number; state: RunState; nodes: Record<string, NodeRun> }

/** What the simulated engine keeps for a run: the plan as it was started, its connections and the decisions made since. */
export interface RunLog { id: string; processId: string; startedAt: number; unit: CostUnit; root: ProcessNode; links?: ProcessLink[]; events: RunEvent[] }

export const DELEGATE_MS = 700;
/** The pause before a loop goes around again. */
export const LOOP_MS = 500;
const MAX_RETRIES = 4;
const MAX_PASSES = 24;
const CLONE_BUDGET = 400;

function hash(text: string) {
  let value = 5381;
  for (let index = 0; index < text.length; index += 1) value = (value * 33 + text.charCodeAt(index)) >>> 0;
  return value;
}

/** The block a pass belongs to: the id without its `@link-round` suffix. */
export const baseId = (id: string) => id.split("@")[0];
const isLaterPass = (id: string) => id.includes("@");
const escaped = (text: string) => text.replace(/[^\w-]/g, "\\$&");

/** How long the simulated task works on its own: the node's `sim.durationMs`, else a steady 4-9 s derived from its id. */
export const durationOf = (node: ProcessNode) => node.sim?.durationMs ?? 4000 + hash(baseId(node.id)) % 5000;

/** Demo prices: a person is free, tokens and credits are flat rates, dollars are free on a local model. */
export function ratePerSecond(unit: CostUnit, provider: Provider): number {
  if (unit === "none" || provider === "human") return 0;
  if (unit === "tokens") return 40;
  if (unit === "credits") return 0.4;
  return freeInDollars.has(provider) ? 0 : 0.012;
}
/** The cost of the whole task when it runs to the end. */
export const totalCost = (node: ProcessNode, unit: CostUnit) => node.sim?.cost !== undefined && unit !== "none" && node.ai.provider !== "human" ? node.sim.cost : ratePerSecond(unit, node.ai.provider) * durationOf(node) / 1000;

const defaultAsk = (node: ProcessNode) => node.askText || `Run “${node.name}”? ${node.task}`.slice(0, LIMITS.askText);

interface Context {
  now: number; events: RunEvent[]; stopAt: number; unit: CostUnit; nodes: Record<string, NodeRun>;
  root: ProcessNode;
  /** When each block's first pass ended in this sweep and in the one before: what a "wait for me" link waits for. */
  ends: Record<string, number>; previous: Record<string, number>;
  /** When each pass ended without the loops that start under it: what an earlier pass of a loop shows as its end. */
  passEnds: Record<string, number>;
  needs: Map<string, string[]>; loops: Map<string, ProcessLink>;
  budget: { left: number };
}
interface Span {
  /** When everything under the block has ended, loops included. */
  end: number;
  /** The same without the loops that start under it. */
  passEnd: number;
}
const same = (end: number): Span => ({ end, passEnd: end });

function markSubtree(node: ProcessNode, ctx: Context, status: "queued" | "stopped") {
  for (const item of flattenNodes(node)) ctx.nodes[item.id] = status === "stopped" ? { status, cost: 0, ...(Number.isFinite(ctx.stopAt) ? { ended: ctx.stopAt } : {}) } : { status, cost: 0 };
}

/** The blocks under `target` again, as another pass of the loop `link`, with ids that stay the same every time the run is played. */
function roundCopy(target: ProcessNode, link: ProcessLink, round: number, rest: string): ProcessNode {
  const copy = (node: ProcessNode): ProcessNode => ({
    ...node, id: `${baseId(node.id)}${rest}@${link.id}-${round}`,
    sim: node.sim ? { ...node.sim, failOnce: undefined } : undefined, children: node.children.map(copy),
  });
  return copy(target);
}
/** Which pass of `link` a block is in (1 when it is in none). */
const roundOf = (id: string, link: ProcessLink) => Number(id.match(new RegExp(`@${escaped(link.id)}-(\\d+)`))?.[1] ?? 1);

/** Places one task (and what is under it) on the timeline. */
function simulate(node: ProcessNode, readyAt: number, ctx: Context): Span {
  const { now, events, stopAt } = ctx;
  const later = isLaterPass(node.id);
  if (!later) for (const dep of ctx.needs.get(node.id) ?? []) readyAt = Math.max(readyAt, ctx.previous[dep] ?? 0);
  if (Number.isFinite(stopAt) && readyAt >= stopAt) { markSubtree(node, ctx, "stopped"); return same(stopAt); }
  if (readyAt === Infinity) { markSubtree(node, ctx, "queued"); return same(Infinity); }

  let start = readyAt, waitedFrom: number | undefined;
  if (node.approval) {
    const decision = events.find(event => event.t >= readyAt && event.action.type !== "stop" && event.action.id === node.id && (event.action.type === "approve" || event.action.type === "reject"));
    if (!decision) {
      if (readyAt > now) { markSubtree(node, ctx, "queued"); return same(Infinity); }
      if (Number.isFinite(stopAt)) {
        // Stopped while it was waiting for the decision.
        ctx.nodes[node.id] = { status: "stopped", cost: 0, started: readyAt, ended: stopAt };
        for (const child of node.children) markSubtree(child, ctx, "stopped");
        return same(stopAt);
      }
      ctx.nodes[node.id] = { status: "waiting", cost: 0, started: readyAt, ask: defaultAsk(node) };
      for (const child of node.children) markSubtree(child, ctx, "queued");
      return same(Infinity);
    }
    if (decision.action.type === "reject") {
      ctx.nodes[node.id] = { status: "stopped", cost: 0, started: readyAt, ended: decision.t, error: "Rejected by you" };
      for (const child of node.children) markSubtree(child, { ...ctx, stopAt: decision.t }, "stopped");
      return same(decision.t);
    }
    start = decision.t;
    waitedFrom = readyAt;
  }

  const dur = durationOf(node), total = totalCost(node, ctx.unit), perMs = dur > 0 ? total / dur : 0;
  const attempts: Attempt[] = [];
  let workStart = start, ownEnd = start + dur, failed = false, error = "";
  for (let attempt = 0; ; attempt += 1) {
    const limitMs = node.limit !== undefined && total > node.limit ? dur * node.limit / total : undefined;
    const onceMs = attempt === 0 && node.sim?.failOnce ? Math.round(dur * 0.6) : undefined;
    let fail: { ms: number; text: string } | undefined = onceMs !== undefined ? { ms: onceMs, text: "Simulated failure: the task could not finish." } : undefined;
    if (limitMs !== undefined && (!fail || limitMs < fail.ms)) fail = { ms: limitMs, text: `Cost limit reached (${node.limit}).` };
    if (!fail) { ownEnd = workStart + dur; failed = false; break; }
    const failAt = workStart + fail.ms;
    const retry = failAt <= now && failAt <= stopAt ? events.find(event => event.action.type === "retry" && event.action.id === node.id && event.t >= failAt) : undefined;
    if (retry && attempt < MAX_RETRIES) { attempts.push({ cost: perMs * fail.ms, started: workStart, ended: failAt, error: fail.text }); workStart = retry.t; continue; }
    ownEnd = failAt; failed = true; error = fail.text; break;
  }

  const stoppedHere = Number.isFinite(stopAt) && stopAt <= now && stopAt < ownEnd;
  if (stoppedHere) ownEnd = stopAt;
  const kidsAt = start + DELEGATE_MS;
  const spans: Span[] = [];
  if (node.mode === "sequence") {
    let ready = kidsAt;
    for (const child of node.children) { const span = simulate(child, ready, ctx); spans.push(span); ready = span.end; }
  } else for (const child of node.children) spans.push(simulate(child, kidsAt, ctx));
  const passEnd = Math.max(ownEnd, ...spans.map(span => span.passEnd));
  let end = Math.max(ownEnd, ...spans.map(span => span.end));

  // A loop closes here: when this block and everything under it have finished, the blocks it loops back to run again.
  const loop = ctx.loops.get(baseId(node.id));
  if (loop && !failed && !stoppedHere) {
    const round = roundOf(node.id, loop), target = findNode(ctx.root, loop.to);
    if (target && round < (loop.rounds ?? 2) && ctx.budget.left >= flattenNodes(target).length) {
      const rest = node.id.slice(baseId(node.id).length).replace(new RegExp(`@${escaped(loop.id)}-\\d+`), "");
      ctx.budget.left -= flattenNodes(target).length;
      const again = simulate(roundCopy(target, loop, round + 1, rest), Number.isFinite(end) ? end + LOOP_MS : Infinity, ctx);
      end = Math.max(end, again.end);
    }
  }

  const dismissed = failed && now >= ownEnd && events.some(event => event.action.type === "dismiss" && event.action.id === node.id && event.t >= ownEnd);
  const cost = perMs * Math.max(0, Math.min(now, ownEnd) - workStart);
  const run: NodeRun = { status: "queued", cost, ...(attempts.length ? { attempts } : {}) };
  if (waitedFrom !== undefined && waitedFrom < start && now >= start) run.waitedFrom = waitedFrom;
  if (now < start) { run.status = "queued"; run.cost = 0; }
  else {
    run.started = workStart;
    if (stoppedHere) { run.status = "stopped"; run.ended = stopAt; }
    else if (failed && now >= ownEnd) { run.status = dismissed ? "stopped" : "failed"; run.ended = ownEnd; run.error = error; }
    else if (Number.isFinite(end) && now >= end) { run.status = "done"; run.ended = end; }
    else run.status = "running";
  }
  ctx.nodes[node.id] = run;
  ctx.passEnds[node.id] = passEnd;

  if (!later) ctx.ends[node.id] = end;
  return { end, passEnd };
}

/** One entry per block: its newest pass that has started, with the earlier passes listed in `rounds`. */
function foldPasses(raw: Record<string, NodeRun>, passEnds: Record<string, number>, now: number): Record<string, NodeRun> {
  const passes = new Map<string, [string, NodeRun][]>();
  for (const [id, run] of Object.entries(raw)) passes.set(baseId(id), [...(passes.get(baseId(id)) ?? []), [id, run]]);
  const nodes: Record<string, NodeRun> = {};
  for (const [id, list] of passes) {
    if (list.length === 1) { nodes[id] = list[0][1]; continue; }
    const started = list.filter(([, run]) => run.started !== undefined).sort((a, b) => a[1].started! - b[1].started! || a[0].length - b[0].length);
    const base = list.find(([key]) => key === id) ?? list[0];
    const current = started.length ? started[started.length - 1] : base;
    const earlier = started.filter(([key]) => key !== current[0]);
    // An earlier pass ended when its own blocks did, not when the later passes of the loop did.
    const summary = ([key, run]: [string, NodeRun], index: number): Round => {
      const ended = run.status === "failed" || run.status === "stopped" ? run.ended : passEnds[key] !== undefined && Number.isFinite(passEnds[key]) ? passEnds[key] : run.ended;
      const status: AgentStatus = run.status === "failed" || run.status === "stopped" ? run.status : ended !== undefined && now >= ended ? "done" : run.status;
      return { round: index + 1, status, cost: run.cost, ...(run.started !== undefined ? { started: run.started } : {}), ...(ended !== undefined ? { ended } : {}), ...(run.waitedFrom !== undefined ? { waitedFrom: run.waitedFrom } : {}), ...(run.error ? { error: run.error } : {}), ...(run.attempts ? { attempts: run.attempts } : {}), ...(run.calls ? { calls: run.calls } : {}) };
    };
    nodes[id] = {
      ...current[1], round: earlier.length + 1, of: list.length,
      ...(earlier.length ? { rounds: earlier.map(summary) } : {}),
      ...(current[0] !== id ? { runId: current[0] } : {}),
    };
  }
  return nodes;
}

/** The connections a run of `root` follows: waits for blocks inside it, and loops between blocks inside it. */
function connections(root: ProcessNode, links: readonly ProcessLink[] | undefined) {
  const ids = new Set(flattenNodes(root).map(node => node.id));
  const needs = new Map<string, string[]>(), loops = new Map<string, ProcessLink>();
  for (const link of links ?? []) {
    if (!ids.has(link.from) || !ids.has(link.to)) continue;
    if (linkKind(root, link) === "loop") { if (!loops.has(link.from)) loops.set(link.from, link); }
    else needs.set(link.to, [...(needs.get(link.to) ?? []), link.from]);
  }
  return { needs, loops };
}

/** The run as it is at `now`: the plan played forward with every decision made up to then. */
export function replay(log: RunLog, now: number): RunSnapshot {
  const events = log.events.filter(event => event.t <= now).sort((a, b) => a.t - b.t);
  const stopAt = events.find(event => event.action.type === "stop")?.t ?? Infinity;
  const { needs, loops } = connections(log.root, log.links);
  // A block that waits for another may sit earlier in the plan than the block it waits for, so the plan is played again with
  // what each block's end turned out to be, until nothing moves (the connections never make blocks wait for each other).
  let previous: Record<string, number> = {};
  let ctx!: Context, span!: Span;
  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    ctx = { now, events, stopAt, unit: log.unit, nodes: {}, root: log.root, ends: {}, passEnds: {}, previous, needs, loops, budget: { left: CLONE_BUDGET } };
    span = simulate(log.root, log.startedAt, ctx);
    if (!needs.size || Object.keys(ctx.ends).every(id => ctx.ends[id] === previous[id])) break;
    previous = ctx.ends;
  }
  const all = Object.values(ctx.nodes);
  const rootRuns = Object.entries(ctx.nodes).filter(([id]) => baseId(id) === log.root.id).map(([, run]) => run);
  const state: RunState = all.some(node => node.status === "waiting") ? "waiting"
    : Number.isFinite(span.end) && now >= span.end ? (Number.isFinite(stopAt) ? "stopped" : rootRuns.some(run => run.status === "failed") ? "failed" : "done")
    : "running";
  return { id: log.id, processId: log.processId, startedAt: log.startedAt, at: now, state, nodes: foldPasses(ctx.nodes, ctx.passEnds, now) };
}

/** A new run of a plan (or of one task and what is under it). */
export function startLog(root: ProcessNode, processId: string, unit: CostUnit, now: number, id = `run-${now.toString(36)}`, links?: readonly ProcessLink[]): RunLog {
  const ids = new Set(flattenNodes(root).map(node => node.id));
  const inside = links?.filter(link => ids.has(link.from) && ids.has(link.to)).map(link => ({ ...link }));
  return { id, processId, startedAt: now, unit, root: structuredClone(root), ...(inside?.length ? { links: inside } : {}), events: [] };
}

/** Whether the run still needs the clock: something is running or waiting for you. */
export const isActive = (snapshot: RunSnapshot) => snapshot.state === "running" || snapshot.state === "waiting";

/** The id a decision about this block has to carry (a block in a later pass of a loop has its own). */
export const decisionId = (snapshot: RunSnapshot | null | undefined, id: string) => snapshot?.nodes[id]?.runId ?? id;

/** Records a person's decision if it makes sense at that moment (approve a waiting task, retry a failed one, stop an active run). */
export function applyAction(log: RunLog, action: RunAction, now: number): RunLog | null {
  const snapshot = replay(log, now);
  const node = action.type === "stop" ? undefined : snapshot.nodes[baseId(action.id)];
  const named = action.type === "stop" || (node !== undefined && (node.runId ?? baseId(action.id)) === action.id);
  const valid = action.type === "stop" ? isActive(snapshot)
    : !named ? false
    : action.type === "approve" || action.type === "reject" ? node?.status === "waiting"
    : node?.status === "failed";
  if (!valid) return null;
  const last = log.events.at(-1)?.t ?? log.startedAt;
  return { ...log, events: [...log.events, { t: Math.max(now, last), action }] };
}

/* ---------- validating a snapshot that comes from somewhere else (a backend) ---------- */
const statuses: readonly AgentStatus[] = ["idle", "queued", "running", "waiting", "done", "failed", "stopped"];
const states: readonly RunState[] = ["running", "waiting", "done", "failed", "stopped"];
const num = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const optNum = (value: unknown) => value === undefined || num(value);
const optText = (value: unknown) => value === undefined || (typeof value === "string" && value.length <= 2000);
const validAttempts = (raw: unknown) => raw === undefined || (Array.isArray(raw) && raw.length <= 20 && raw.every(attempt => !!attempt && typeof attempt === "object" && num((attempt as Attempt).cost) && num((attempt as Attempt).started) && num((attempt as Attempt).ended) && typeof (attempt as Attempt).error === "string"));
const validCalls = (raw: unknown) => raw === undefined || (Array.isArray(raw) && raw.length <= 60 && raw.every(item => {
  if (!item || typeof item !== "object") return false;
  const call = item as Record<string, unknown>;
  return typeof call.id === "string" && (call.kind === "llm" || call.kind === "tool") && typeof call.name === "string" && call.name.length <= 200 && (call.status === "running" || call.status === "done" || call.status === "failed")
    && num(call.start) && optNum(call.end) && optNum(call.tokensIn) && optNum(call.tokensOut) && optNum(call.cost) && optText(call.detail) && optText(call.input) && optText(call.output) && optText(call.error);
}));
const validRounds = (raw: unknown) => raw === undefined || (Array.isArray(raw) && raw.length <= LIMITS.rounds * 4 && raw.every(item => {
  if (!item || typeof item !== "object") return false;
  const round = item as Record<string, unknown>;
  return num(round.round) && statuses.includes(round.status as AgentStatus) && num(round.cost) && optNum(round.started) && optNum(round.ended) && optNum(round.waitedFrom) && optText(round.error) && validAttempts(round.attempts) && validCalls(round.calls);
}));

export function isRunSnapshot(raw: unknown): raw is RunSnapshot {
  if (!raw || typeof raw !== "object") return false;
  const value = raw as Record<string, unknown>;
  if (typeof value.id !== "string" || typeof value.processId !== "string" || !num(value.startedAt) || !num(value.at) || !states.includes(value.state as RunState)) return false;
  if (!value.nodes || typeof value.nodes !== "object" || Array.isArray(value.nodes)) return false;
  const entries = Object.entries(value.nodes as Record<string, unknown>);
  if (entries.length > LIMITS.nodes) return false;
  return entries.every(([, item]) => {
    if (!item || typeof item !== "object") return false;
    const node = item as Record<string, unknown>;
    if (!statuses.includes(node.status as AgentStatus) || !num(node.cost) || !optNum(node.started) || !optNum(node.ended) || !optText(node.ask) || !optText(node.error)) return false;
    if (!optNum(node.round) || !optNum(node.of) || !optNum(node.waitedFrom) || !optText(node.runId)) return false;
    return validAttempts(node.attempts) && validCalls(node.calls) && validRounds(node.rounds);
  });
}

/** A saved simulated run, or null when it is not one. */
export function isRunLog(raw: unknown): raw is RunLog {
  if (!raw || typeof raw !== "object") return false;
  const value = raw as Record<string, unknown>;
  const linkOk = (link: unknown) => !!link && typeof link === "object" && typeof (link as ProcessLink).id === "string" && typeof (link as ProcessLink).from === "string" && typeof (link as ProcessLink).to === "string";
  return typeof value.id === "string" && typeof value.processId === "string" && num(value.startedAt) && ["usd", "credits", "tokens", "none"].includes(value.unit as string)
    && !!value.root && typeof value.root === "object" && Array.isArray(value.events) && value.events.length <= 500
    && (value.links === undefined || (Array.isArray(value.links) && value.links.length <= LIMITS.links && value.links.every(linkOk)))
    && value.events.every(event => !!event && typeof event === "object" && num((event as RunEvent).t) && !!(event as RunEvent).action && typeof (event as RunEvent).action === "object" && ["approve", "reject", "retry", "dismiss", "stop"].includes((event as RunEvent).action.type));
}

/** What the simulated engine saves: the newest run of each process. */
export interface RunStore { version: 1; runs: Record<string, RunLog> }
export const emptyRunStore = (): RunStore => ({ version: 1, runs: {} });

/** A saved run store. Runs that are not valid are dropped (a stale or edited copy must not break the page); null when it is not a store at all. */
export function normalizeRunStore(raw: unknown): RunStore | null {
  if (!raw || typeof raw !== "object" || (raw as RunStore).version !== 1 || !(raw as RunStore).runs || typeof (raw as RunStore).runs !== "object") return null;
  const runs: Record<string, RunLog> = {};
  for (const [id, log] of Object.entries((raw as RunStore).runs).slice(0, 50)) if (isRunLog(log) && log.processId === id) runs[id] = log;
  return { version: 1, runs };
}
