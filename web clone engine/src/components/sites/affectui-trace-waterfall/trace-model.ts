import type { AvatarMark, ToolMark } from "../affectui-agent-tree/tree-model.ts";

/**
 * The pure rules of the Trace Waterfall: the shape of a trace, how long the axis is and where its ticks go, how times, costs and
 * tokens are written, what the six numbers in the header add up to, which rows are shown when a branch is folded, and where a bar's
 * label sits. No React and no clock of its own: every rule takes `now` (ms from the start of the run) as a number.
 *
 * Rebuilt from the public preview of affectUI's Trace Waterfall (docs/research/trace-waterfall). The axis ladder and the tick rule
 * were read off the demo's behavior and are written down as the rules they follow, not copied from any source.
 */
export type SpanKind = "agent" | "subagent" | "llm" | "tool" | "wait";
export type SpanStatus = "running" | "done" | "failed";

export interface TraceSpan {
  id: string;
  name: string;
  /** Picks the bar's tint: agents slate, model calls violet, tool calls teal, waiting for a person amber; failed spans are red. */
  kind: SpanKind;
  status: SpanStatus;
  /** Milliseconds from the start of the run. */
  start: number;
  /** Leave it out while the span runs: it grows into "now". */
  end?: number;
  /** A few muted words after the name, for example the model or the query. */
  detail?: string;
  /** A small logo in front of the name: the model maker's or the tool's. Without one the kind's color swatch is drawn. */
  mark?: AvatarMark | ToolMark;
  /** The span's own cost and tokens; agents add up their children, so these are not summed beforehand. */
  cost?: number;
  tokensIn?: number;
  tokensOut?: number;
  /** Short previews shown in the details window. */
  input?: string;
  output?: string;
  error?: string;
  children?: readonly TraceSpan[];
}

export const kindLabel: Record<SpanKind, string> = { agent: "Agent run", subagent: "Block", llm: "Model call", tool: "Tool call", wait: "Waiting for a person" };
export const statusLabel: Record<SpanStatus, string> = { running: "Running", done: "Done", failed: "Failed" };

/** Where a span ends: its own end, or "now" while it runs (never before it started). */
export const spanEnd = (span: TraceSpan, now: number) => span.end ?? Math.max(now, span.start);
export const spanDuration = (span: TraceSpan, now: number) => Math.max(0, spanEnd(span, now) - span.start);

export function flattenSpans(root: TraceSpan): TraceSpan[] {
  return [root, ...(root.children ?? []).flatMap(flattenSpans)];
}

/* ---------- writing numbers ---------- */
/** "403ms", "6.9s", "12s", "1m 22s", "1h 05m": the unit steps up as the time grows. */
export function formatDuration(ms: number): string {
  const value = Math.max(0, ms);
  if (value < 1000) return `${Math.round(value)}ms`;
  if (value < 10_000) return `${(value / 1000).toFixed(1)}s`;
  const total = Math.round(value / 1000);
  if (total < 60) return `${total}s`;
  const seconds = total % 60, minutes = Math.floor(total / 60) % 60, hours = Math.floor(total / 3600);
  if (hours) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  return seconds ? `${minutes}m ${String(seconds).padStart(2, "0")}s` : `${minutes}m`;
}
/** A tick on the axis: whole units only. */
export function formatTick(ms: number): string {
  const total = Math.round(ms / 1000);
  if (total < 60) return `${total}s`;
  const hours = Math.floor(total / 3600), minutes = Math.floor(total / 60) % 60, seconds = total % 60;
  return [hours ? `${hours}h` : "", minutes ? `${minutes}m` : "", seconds ? `${seconds}s` : ""].filter(Boolean).join(" ");
}
export const formatStarted = (ms: number) => `+${formatDuration(ms)}`;
/** 880, 4.1k, 99.7k, 1.2M. */
export function formatTokens(count: number): string {
  if (count < 1000) return String(Math.round(count));
  if (count < 1_000_000) return `${(count / 1000).toFixed(1)}k`;
  return `${(count / 1_000_000).toFixed(1)}M`;
}
/** Dollars to the thousandth, with a trailing zero dropped: $0.12, $0.02, $0.042, $0.005; from a dollar up, two decimals. */
export function formatDollars(amount: number): string {
  if (amount >= 1) return `$${amount.toFixed(2)}`;
  const text = amount.toFixed(3);
  return `$${text.endsWith("0") ? text.slice(0, -1) : text}`;
}

/* ---------- the axis ---------- */
/** How long the axis shows, from short to long: it only ever moves up this ladder, a step at a time. */
const LADDER = [10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 300, 450, 600, 900, 1200, 1800, 2700, 3600, 5400, 7200, 10_800, 14_400, 21_600, 28_800, 43_200, 86_400].map(seconds => seconds * 1000);
/** The most of the axis a run may fill before it moves up a step. */
export const FILL = 0.84;
export const MIN_RANGE = 10_000;

/** The shortest ladder step that holds `extent` with room to spare (and is at least `minRange`). */
export function axisRange(extent: number, minRange = MIN_RANGE): number {
  const need = Math.max(minRange, extent / FILL);
  const step = LADDER.find(value => value >= need);
  if (step) return step;
  const day = LADDER[LADDER.length - 1];
  return Math.ceil(need / day) * day;
}
const STEPS = [1, 2, 3, 5, 10, 15, 20, 30, 60, 120, 180, 300, 600, 900, 1800, 3600, 7200, 14_400, 28_800, 43_200, 86_400].map(seconds => seconds * 1000);
/** The gap between two ticks: the shortest round step that leaves five ticks or fewer. */
export const tickStep = (range: number) => STEPS.find(step => range / step <= 5) ?? STEPS[STEPS.length - 1];
/** The ticks inside the axis (the one at the far edge is left out): 0, step, 2·step … */
export function ticksOf(range: number): number[] {
  const step = tickStep(range), ticks: number[] = [];
  for (let at = 0; at < range - step * 0.02; at += step) ticks.push(at);
  return ticks;
}

/* ---------- what a trace adds up to ---------- */
export interface TraceTotals { duration: number; cost: number; tokens: number; llmCalls: number; toolCalls: number; errors: number; hasCost: boolean; hasTokens: boolean }

/** The six numbers of the header. A span's cost and tokens are its own, so the whole trace is the sum over every span. */
export function totalsOf(root: TraceSpan, now: number): TraceTotals {
  const all = flattenSpans(root);
  const sum = (pick: (span: TraceSpan) => number | undefined) => all.reduce((total, span) => total + (pick(span) ?? 0), 0);
  return {
    duration: Math.max(0, ...all.map(span => spanEnd(span, now))) - root.start,
    cost: sum(span => span.cost), tokens: sum(span => (span.tokensIn ?? 0) + (span.tokensOut ?? 0)),
    llmCalls: all.filter(span => span.kind === "llm").length, toolCalls: all.filter(span => span.kind === "tool").length,
    // A failure counts once, at the span that failed: a block whose own call failed is not another error
    errors: all.filter(span => span.status === "failed" && !(span.children ?? []).some(child => flattenSpans(child).some(item => item.status === "failed"))).length,
    hasCost: all.some(span => span.cost !== undefined), hasTokens: all.some(span => span.tokensIn !== undefined || span.tokensOut !== undefined),
  };
}
/** The state of the whole run: running while any span runs, failed when the first one failed and nothing runs, else done. */
export function runStatus(root: TraceSpan): SpanStatus {
  const all = flattenSpans(root);
  if (all.some(span => span.status === "running")) return "running";
  return root.status === "failed" ? "failed" : "done";
}

/** The slowest finished model call or tool call (the first one on a tie); the waterfall tags it. */
export function slowestId(root: TraceSpan): string | null {
  let best: TraceSpan | null = null;
  for (const span of flattenSpans(root)) {
    if ((span.kind !== "llm" && span.kind !== "tool") || span.end === undefined) continue;
    if (!best || span.end - span.start > best.end! - best.start) best = span;
  }
  return best?.id ?? null;
}

/* ---------- rows ---------- */
export interface TraceRow {
  span: TraceSpan;
  /** 1 for the root. */
  level: number;
  parentId: string | null;
  hasChildren: boolean;
  /** Its own branch is folded (it has children that are hidden). */
  folded: boolean;
  /** An ancestor is folded, so the row is closed up. */
  hidden: boolean;
  /** Everything under a span: shown as "+N" and as small marks on its bar when it is folded. */
  descendants: readonly TraceSpan[];
}

export function rowsOf(root: TraceSpan, collapsed: ReadonlySet<string>): TraceRow[] {
  const rows: TraceRow[] = [];
  const walk = (span: TraceSpan, level: number, parentId: string | null, hidden: boolean) => {
    const children = span.children ?? [];
    const folded = children.length > 0 && collapsed.has(span.id);
    rows.push({ span, level, parentId, hasChildren: children.length > 0, folded, hidden, descendants: children.flatMap(flattenSpans) });
    for (const child of children) walk(child, level + 1, span.id, hidden || folded);
  };
  walk(root, 1, null, false);
  return rows;
}
/** The rows a person can reach with the keyboard: the ones that are not closed up. */
export const visibleRows = (rows: readonly TraceRow[]) => rows.filter(row => !row.hidden);

/* ---------- a bar's label ---------- */
export type TagSide = "after" | "inside" | "before";
/**
 * Where the "6.9s · $0.12" label of a bar goes: after the bar when there is room to its right, inside the bar's end when there is
 * not but the bar is wide enough, otherwise before the bar. Positions and widths are in pixels of the track.
 */
export function tagSide(startPx: number, endPx: number, labelPx: number, trackPx: number): TagSide {
  if (endPx + 6 + labelPx <= trackPx) return "after";
  if (endPx - startPx >= labelPx + 12) return "inside";
  return startPx - 6 - labelPx >= 0 ? "before" : "inside";
}

/** The bar of a span as fractions of the axis: where it starts and how wide it is (a hair wide at least, so it can be seen). */
export function barOf(span: TraceSpan, now: number, range: number) {
  const start = Math.max(0, span.start), end = spanEnd(span, now);
  return { start: start / range, width: Math.max(0, end - start) / range };
}

/** An accessible name for a row: name, kind, status, duration and cost. */
export function rowLabel(span: TraceSpan, now: number, formatCost: (amount: number) => string): string {
  const parts = [span.name, kindLabel[span.kind], statusLabel[span.status], `${formatDuration(spanDuration(span, now))}${span.cost !== undefined ? ` · ${formatCost(span.cost)}` : ""}`];
  return parts.join(", ");
}

/** The cost and time of a whole branch as the bar's label shows them: a span with children adds up its children's cost. */
export function branchCost(span: TraceSpan): number {
  return (span.cost ?? 0) + (span.children ?? []).reduce((sum, child) => sum + branchCost(child), 0);
}
export const hasAnyCost = (span: TraceSpan): boolean => span.cost !== undefined || (span.children ?? []).some(hasAnyCost);
