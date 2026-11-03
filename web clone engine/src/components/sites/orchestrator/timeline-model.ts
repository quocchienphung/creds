/**
 * Agent timeline, the parts that are not React: a run (agents, spans on a shared time axis, handoffs) normalised once, the counters a playhead reads at any
 * time, the connector geometry, the keyboard's idea of "the next span", and the builder that turns an orchestrator run into such a timeline.
 * Rules and numbers come from the public preview of UIArc's Agent timeline (docs/research/orchestrator/README.md): the sample incident below reproduces its
 * header at every checked time (tokens exactly, cost within a cent). Pure, so node tests it.
 */
import { SAMPLE, TIMING } from "./orchestrator-model.ts";
import type { MarkName, Scenario, SimEvent } from "./orchestrator-model.ts";

export type SpanKind = "thinking" | "tool" | "waiting";
export interface TimelineAgent { id: string; name: string; model?: string; mark?: MarkName; /** blended USD per million tokens */ price: number }
export interface TimelineSpan {
  id?: string; agentId: string; kind: SpanKind; start: number; end?: number; label: string; detail?: string; tool?: string; tokens?: number;
  status?: "ok" | "failed"; /** a note shown on the card for a retry */ retry?: string;
}
export interface TimelineHandoff { from: string; to: string; at: number; label?: string }
export interface TimelineRun { title: string; agents: TimelineAgent[]; spans: TimelineSpan[]; handoffs: TimelineHandoff[]; duration?: number }

/** Geometry of the plot (px), as measured: rows 44 high, bars 16, 6px above the first row, a 30px axis. */
export const PLOT = { row: 44, bar: 16, pad: 6, axis: 30, labelW: 176, labelWNarrow: 132 };
export const SPEEDS = [1, 2];
export const LINK_DRAW_MS = 360;
/** the card glides between spans on the morph spring fitted to the recording (omega 51, zeta 1.8) */
export const CARD_SPRING = { type: "spring" as const, stiffness: 2600, damping: 184, mass: 1 };
export const KIND_LABEL: Record<SpanKind, string> = { thinking: "Thinking", tool: "Tool call", waiting: "Waiting" };

export interface Span extends TimelineSpan { id: string; end: number; open: boolean; row: number }
export interface Link { key: string; shape: "out" | "in"; dir: "down" | "up"; row: number; /** series index of the worker */ series: number; at: number; /** time the horizontal run starts and its width, in seconds */ left: number; width: number; top: number; height: number }
export interface Normalized { run: TimelineRun; agents: TimelineAgent[]; spans: Span[]; byRow: Span[][]; links: Link[]; duration: number; axis: number; rowsHeight: number }

const round = (value: number) => Math.round(value * 1000) / 1000;

/** Sorts the spans, closes the open ones at `now`, derives the connectors (a dispatch drops from the orchestrator into the target's next span; a result leaves the end of the target's last span and rises into the orchestrator). */
export function normalize(run: TimelineRun, now = Infinity): Normalized {
  const rowOf = new Map(run.agents.map((agent, index) => [agent.id, index]));
  const spans: Span[] = run.spans.map((span, index) => ({ ...span, id: span.id ?? `${span.agentId}-${index}`, end: span.end ?? Math.max(span.start, Math.min(now, Infinity)), open: span.end === undefined, row: rowOf.get(span.agentId) ?? 0 }))
    .sort((a, b) => a.row - b.row || a.start - b.start);
  const byRow: Span[][] = run.agents.map((_, row) => spans.filter(span => span.row === row));
  const duration = run.duration ?? round(spans.reduce((max, span) => Math.max(max, span.end), 0));
  const links: Link[] = [];
  const barBottom = PLOT.pad + (PLOT.row - PLOT.bar) / 2 + PLOT.bar;
  for (const handoff of run.handoffs) {
    const from = rowOf.get(handoff.from), to = rowOf.get(handoff.to);
    if (from === undefined || to === undefined || from === to) continue;
    const worker = from === 0 ? to : from;
    const center = PLOT.pad + worker * PLOT.row + PLOT.row / 2;
    const height = center - barBottom + 0.75;
    if (from === 0) {
      const next = byRow[to].find(span => span.start >= handoff.at - 1e-6);
      links.push({ key: `out-${to}-${handoff.at}`, shape: "out", dir: "down", row: to, series: to, at: handoff.at, left: handoff.at, width: round((next?.start ?? handoff.at + 0.3) - handoff.at), top: barBottom, height });
    } else {
      const last = [...byRow[from]].reverse().find(span => span.end <= handoff.at + 1e-6);
      links.push({ key: `in-${from}-${handoff.at}`, shape: "in", dir: "up", row: from, series: from, at: handoff.at, left: last?.end ?? handoff.at - 0.3, width: round(handoff.at - (last?.end ?? handoff.at - 0.3)), top: barBottom, height });
    }
  }
  return { run, agents: run.agents, spans, byRow, links, duration, axis: Math.max(duration, 1), rowsHeight: PLOT.pad + PLOT.row * run.agents.length - PLOT.pad + PLOT.pad };
}

/** Ticks of the time axis: every 5 s for a run like the preview's, finer for a short one. */
export function axisTicks(axis: number): number[] {
  const step = axis > 40 ? 10 : axis > 12 ? 5 : axis > 6 ? 2 : 1;
  const ticks: number[] = [];
  for (let t = 0; t <= axis + 1e-6; t += step) ticks.push(t);
  return ticks;
}

export type SpanState = "pending" | "active" | "done";
/** An open span (a live run has not closed it) is active for as long as it is open. */
export const spanState = (span: Span, now: number): SpanState => (now < span.start ? "pending" : span.open || now < span.end ? "active" : "done");

/** What the header counts at `now`: tokens and cost grow linearly across each span, and an agent is working while one of its spans is open. */
export function totalsAt(model: Normalized, now: number) {
  let tokens = 0, cost = 0;
  const working = new Set<string>();
  for (const span of model.spans) {
    if (now >= span.start && now < span.end && span.kind !== "waiting") working.add(span.agentId);
    if (!span.tokens || now <= span.start) continue;
    const progress = span.end > span.start ? Math.min(1, (now - span.start) / (span.end - span.start)) : 1;
    const part = span.tokens * progress;
    tokens += part;
    cost += (part * (model.agents.find(agent => agent.id === span.agentId)?.price ?? 0)) / 1e6;
  }
  return { tokens, cost, working: working.size };
}

/** The finished summary: agents, wall time, how much faster than doing every non-waiting span one after the other, and the cost. */
export function summaryOf(model: Normalized) {
  const end = totalsAt(model, model.duration + 1e-3);
  const busy = model.spans.filter(span => span.kind !== "waiting").reduce((sum, span) => sum + (span.end - span.start), 0);
  return { agents: model.agents.length, duration: model.duration, speedup: model.duration > 0 ? busy / model.duration : 1, cost: end.cost, tokens: end.tokens };
}

/** "6.4s". */
export const seconds = (value: number) => `${value.toFixed(1)}s`;
export const countFormat = (value: number) => Math.round(value).toLocaleString("en-US");
export const costFormat = (value: number) => `$${value.toFixed(2)}`;

export function spanName(span: Span, model: Normalized): string {
  const agent = model.agents[span.row];
  const kind = KIND_LABEL[span.kind] + (span.kind === "tool" && span.tool ? `, ${span.tool}` : "") + (span.status === "failed" ? ", failed" : "");
  return `${agent.name}, ${kind}: ${span.label}, ${seconds(span.start)} to ${seconds(span.end)}${span.tokens ? `, ${countFormat(span.tokens)} tokens` : ""}`;
}

/** Arrow keys: left and right inside the row, up and down to the span of the neighbouring row that overlaps in time (or starts nearest). */
export function neighbour(model: Normalized, current: Span, key: string): Span | null {
  const row = model.byRow[current.row];
  const index = row.indexOf(current);
  if (key === "ArrowRight") return row[index + 1] ?? null;
  if (key === "ArrowLeft") return row[index - 1] ?? null;
  if (key === "Home") return row[0] ?? null;
  if (key === "End") return row[row.length - 1] ?? null;
  if (key === "ArrowUp" || key === "ArrowDown") {
    const target = model.byRow[current.row + (key === "ArrowUp" ? -1 : 1)];
    if (!target?.length) return null;
    const middle = (current.start + current.end) / 2;
    const overlap = target.filter(span => span.start < current.end && span.end > current.start);
    const pool = overlap.length ? overlap : target;
    return pool.reduce((best, span) => (Math.abs((span.start + span.end) / 2 - middle) < Math.abs((best.start + best.end) / 2 - middle) ? span : best));
  }
  return null;
}

/** The handoff path of a pinned span: its own row, and the orchestrator spans the dispatch and the result enter, and the connectors between. */
export function pathOf(model: Normalized, pinned: Span) {
  const lit = new Set<string>(), links = new Set<string>();
  if (pinned.row === 0) return { spans: new Set([pinned.id]), links, any: true };
  for (const span of model.byRow[pinned.row]) lit.add(span.id);
  for (const link of model.links) {
    if (link.row !== pinned.row) continue;
    links.add(link.key);
    // a dispatch enters the orchestrator's span that starts at the handoff; a result enters the first span starting at or after it
    const lead = model.byRow[0].find(span => (link.shape === "out" ? Math.abs(span.start - link.at) < 0.06 : span.start >= link.at - 0.06 && span.start > pinned.end - 1e-6));
    if (lead) lit.add(lead.id);
  }
  return { spans: lit, links, any: true };
}

// ------------------------------------------------------------ the preview's sample incident (the data the header numbers were checked against)

const A = (id: string, name: string, model: string, mark: MarkName, price: number): TimelineAgent => ({ id, name, model, mark, price });
const S = (id: string, agentId: string, kind: SpanKind, start: number, end: number, label: string, tokens?: number, extra: Partial<TimelineSpan> = {}): TimelineSpan => ({ id, agentId, kind, start, end, label, tokens, ...extra });
export const INCIDENT: TimelineRun = {
  title: "Checkout conversion drop on Oct 14",
  agents: [A("lead", "Orchestrator", "Claude Opus 5.5", "claude", 8), A("checker", "Checker", "GPT-6 Luna", "openai", 0.7), A("researcher", "Researcher", "Claude Sonnet 5.5", "claude", 4), A("analyst", "Analyst", "Claude Haiku 5.5", "claude", 0.2), A("writer", "Writer", "Gemini 3.8 Flash", "gemini", 1.2)],
  spans: [
    S("lead-0", "lead", "thinking", 0, 2, "Split the investigation into three tracks", 1920),
    S("lead-1", "lead", "waiting", 2, 14.6, "Waiting on the analyst, researcher and checker"),
    S("lead-2", "lead", "thinking", 14.6, 16.8, "Merged findings: PR #4812 broke address autofill in Safari", 4380),
    S("lead-3", "lead", "waiting", 16.8, 23, "Waiting on the writer"),
    S("lead-4", "lead", "thinking", 23, 25.2, "Reviewed the draft and tightened the timeline", 3140),
    S("lead-5", "lead", "tool", 25.2, 26.4, "Published the summary to the incidents page", 260, { tool: "Notion" }),
    S("checker-6", "checker", "thinking", 3.5, 4.1, "Listed outside causes to rule out", 480),
    S("checker-7", "checker", "tool", 4.1, 5.6, "Searched for payment provider incidents on Oct 14", 3920, { tool: "Web search" }),
    S("checker-8", "checker", "thinking", 5.6, 6.3, "Checked browser releases next", 610),
    S("checker-9", "checker", "tool", 6.3, 7.7, "Searched browser release notes for autofill changes", 4460, { tool: "Web search" }),
    S("checker-10", "checker", "thinking", 7.7, 9.1, "Ruled out causes outside the codebase", 1180),
    S("researcher-11", "researcher", "thinking", 2.9, 3.5, "Planned the code search", 620),
    S("researcher-12", "researcher", "tool", 3.5, 4.8, "Listed 14 merged PRs touching checkout since Oct 10", 2140, { tool: "GitHub" }),
    S("researcher-13", "researcher", "thinking", 4.8, 5.5, "Narrowed to 3 PRs shipped Oct 13 and 14", 980),
    S("researcher-14", "researcher", "tool", 5.5, 7.5, "Read the diff of PR #4812, an address autofill refactor", 6850, { tool: "GitHub" }),
    S("researcher-15", "researcher", "thinking", 7.5, 8.5, "Traced the change to the Safari autofill path", 1410),
    S("researcher-16", "researcher", "tool", 8.5, 9.7, "Checked deploys: #4812 shipped Oct 13 at 21:40", 1760, { tool: "GitHub" }),
    S("researcher-17", "researcher", "thinking", 9.7, 11.9, "Wrote up the suspect change with evidence", 2230),
    S("analyst-18", "analyst", "thinking", 2.3, 3, "Wrote a conversion query for Oct 7 to 15", 540),
    S("analyst-19", "analyst", "tool", 3, 5.1, "Conversion query timed out", 410, { tool: "PostgreSQL", status: "failed", detail: "Hit the 2s statement timeout on a full scan of orders" }),
    S("analyst-20", "analyst", "thinking", 5.1, 5.7, "Rewrote the query to use the date index", 380),
    S("analyst-21", "analyst", "tool", 5.7, 7.3, "Retried: conversion by day and platform", 1960, { tool: "PostgreSQL", retry: "Retry of the query that timed out" }),
    S("analyst-22", "analyst", "thinking", 7.3, 8.3, "Found the drop is Safari only, down 9.2%", 720),
    S("analyst-23", "analyst", "tool", 8.3, 9.9, "Pulled checkout errors by step for Safari", 2310, { tool: "PostgreSQL" }),
    S("analyst-24", "analyst", "thinking", 9.9, 11.8, "Traced the failures to the address step", 860),
    S("analyst-25", "analyst", "tool", 11.8, 13, "Counted affected orders: 1,284", 1140, { tool: "PostgreSQL" }),
    S("analyst-26", "analyst", "thinking", 13, 14.3, "Summarized the numbers", 640),
    S("writer-27", "writer", "thinking", 17.1, 17.9, "Read the merged findings", 1850),
    S("writer-28", "writer", "tool", 17.9, 18.8, "Pulled the PR #4812 description for context", 1120, { tool: "GitHub" }),
    S("writer-29", "writer", "thinking", 18.8, 22.7, "Drafted the incident summary, 412 words", 2940),
  ],
  handoffs: [
    { from: "lead", to: "analyst", at: 2 }, { from: "lead", to: "researcher", at: 2.6 }, { from: "lead", to: "checker", at: 3.2 },
    { from: "checker", to: "lead", at: 9.4 }, { from: "researcher", to: "lead", at: 12.2 }, { from: "analyst", to: "lead", at: 14.6 },
    { from: "lead", to: "writer", at: 16.8 }, { from: "writer", to: "lead", at: 23 },
  ],
  duration: 26.4,
};

// ------------------------------------------------------------ from an orchestrator run

const TOOL_NAME: Record<string, string> = { search: "Web search", fetch: "Web fetch", read: "Files", write: "Files" };
const past: Record<string, string> = { "Web search": "Searched", "Fetch page": "Fetched", "Read file": "Read", "Write findings": "Wrote findings" };

/**
 * The timeline of an orchestrator run, from its events: the lead plans, waits while the subagents work, then merges; each subagent's tool calls are tool spans
 * (a failed call is a failed span, the wait before the retry a waiting span, the findings a thinking span), tokens come from the lane's usage events.
 * `now` (seconds) closes the spans that are still open, for a run in progress.
 */
export function timelineFromEvents(events: readonly SimEvent[], scenario: Scenario = SAMPLE, now?: number): TimelineRun {
  const agents: TimelineAgent[] = [{ id: "lead", name: "Orchestrator", model: scenario.lead.name, mark: scenario.lead.mark, price: scenario.lead.price }];
  scenario.lanes.forEach((lane, index) => { const worker = scenario.workers.find(item => item.id === lane.workerId) ?? scenario.workers[index]; agents.push({ id: lane.id, name: lane.title, model: worker.name, mark: worker.mark, price: worker.price }); });
  const spans: TimelineSpan[] = [], handoffs: TimelineHandoff[] = [];
  const secs = (ms: number) => Math.round(ms) / 1000;
  const first = (type: SimEvent["type"], lane?: number) => events.find(event => event.type === type && (lane === undefined || ("lane" in event && event.lane === lane)));
  const doneTimes = events.filter(event => event.type === "done").map(event => event.at);
  const planReady = first("planReady"), merge = first("merge"), finish = first("finish");
  if (planReady) {
    spans.push({ id: "lead-plan", agentId: "lead", kind: "thinking", start: 0, end: secs(planReady.at), label: `Split the goal into ${scenario.lanes.length} subtasks`, tokens: scenario.summary.lead.planningTokens });
    spans.push({ id: "lead-wait", agentId: "lead", kind: "waiting", start: secs(planReady.at), end: merge ? secs(Math.max(...doneTimes)) : undefined, label: `Waiting on ${scenario.lanes.length} subagents` });
  } else if (events.length) spans.push({ id: "lead-plan", agentId: "lead", kind: "thinking", start: 0, label: "Splitting the goal into subtasks", tokens: scenario.summary.lead.planningTokens });
  if (merge) spans.push({ id: "lead-merge", agentId: "lead", kind: "thinking", start: secs(Math.max(...doneTimes)), end: finish ? secs(finish.at + TIMING.wallPad) : undefined, label: "Merged what came back and wrote the summary", tokens: scenario.summary.lead.summaryTokens });
  scenario.lanes.forEach((lane, index) => {
    const dispatch = first("dispatch", index), arrive = first("arrive", index), done = events.find(event => event.type === "done" && event.lane === index);
    if (!dispatch || !arrive) return;
    handoffs.push({ from: "lead", to: lane.id, at: secs(dispatch.at) });
    const usage = events.filter(event => event.type === "usage" && event.lane === index) as Extract<SimEvent, { type: "usage" }>[];
    const tokensIn = (from: number, to: number) => usage.filter(event => event.at > from && event.at <= to).reduce((sum, event) => sum + event.tokens, 0);
    // a span exists once it has started; it is closed only once its end has passed (everything is closed when the lane has returned)
    const add = (span: Omit<TimelineSpan, "id" | "agentId" | "start" | "end">, startMs: number, endMs: number) => {
      if (!done && now !== undefined && secs(startMs) > now) return;
      const closed = done || now === undefined || secs(endMs) <= now;
      spans.push({ ...span, id: `${lane.id}-${spans.length}`, agentId: lane.id, start: secs(startMs), end: closed ? secs(endMs) : undefined });
    };
    let cursor = arrive.at;
    lane.steps.forEach(step => {
      const label = step.target ? `${past[step.label] ?? step.label} ${step.target}` : (past[step.label] ?? step.label);
      const kind: SpanKind = step.tool === "write" ? "thinking" : "tool";
      const tool = TOOL_NAME[step.tool];
      const begin = cursor, end = begin + step.ms;
      if (step.fail) {
        add({ kind: "tool", tool, label: `${step.label} failed: ${step.target ?? ""}`.trim(), detail: step.fail.message, status: "failed", tokens: tokensIn(begin, end) }, begin, end);
        const retryAt = end + step.fail.retryMs, retryEnd = retryAt + step.fail.retry.ms;
        add({ kind: "waiting", label: "Waiting to retry" }, end, retryAt);
        add({ kind: "tool", tool, label: `Retried: ${label.charAt(0).toLowerCase()}${label.slice(1)}`, retry: "Retry of the call that failed", tokens: tokensIn(retryAt, retryEnd) }, retryAt, retryEnd);
        cursor = retryEnd;
      } else {
        add({ kind, tool: kind === "tool" ? tool : undefined, label, detail: step.detail, tokens: tokensIn(begin, end) }, begin, end);
        cursor = end;
      }
    });
    if (done) handoffs.push({ from: lane.id, to: "lead", at: secs(done.at - TIMING.settle + 300) });
  });
  return { title: scenario.goal, agents, spans, handoffs, duration: finish ? secs(finish.at + TIMING.wallPad) : undefined };
}
