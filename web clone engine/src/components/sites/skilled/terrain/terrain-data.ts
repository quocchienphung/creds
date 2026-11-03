import { CELLS, DAYS, HOURS } from "./terrain-constants.ts";

export type MetricId = "operations" | "deliveries" | "errors";
export type WeekSource = "workspace" | "sample";
export interface MetricData {
  id: MetricId; label: string;
  /** "operations" in "4,745 operations"; `unit(1)` gives the singular */
  plural: string; singular: string;
  /** Errors are red, and an increase is bad news. */
  tone: "neutral" | "danger";
  values: number[]; previous: number[];
}
export interface TerrainEvent { t: number; kind: "import" | "save" | "export" | "transfer"; outcome: "success" | "error" }
export type ActionId = TerrainEvent["kind"];
export const ACTION_IDS: readonly ActionId[] = ["import", "save", "export", "transfer"];
export type ActionCells = Record<ActionId, Record<MetricId, { values: number[]; previous: number[] }>>;
/** `byAction` is the same counts split by what was done; only the workspace's own week has it (the sample week is just numbers). */
export interface WeekData { source: WeekSource; start: number; rangeLabel: string; metrics: Record<MetricId, MetricData>; byAction?: ActionCells }

export const METRIC_IDS: readonly MetricId[] = ["operations", "deliveries", "errors"];
export const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
export const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
/** The workspace's clock, as in the rest of the Skilled page (Vietnam has no daylight saving). */
export const WORKSPACE_OFFSET_MS = 7 * 3600_000;
const DAY_MS = 86_400_000;
const WORKING_FROM = 9, WORKING_TO = 18;

const numberFormat = new Intl.NumberFormat("en-US");
export const formatCount = (value: number) => numberFormat.format(value);
/** "+8.6%" or "−3.2%" (a real minus sign), `null` when there is nothing to compare with. */
export function formatDelta(percent: number | null) {
  if (percent === null) return "—";
  const rounded = Math.round(Math.abs(percent) * 10) / 10;
  return `${percent < 0 && rounded !== 0 ? "−" : "+"}${rounded.toFixed(1)}%`;
}
export const hourLabel = (hour: number) => `${String(hour).padStart(2, "0")}:00`;
export const hourRange = (hour: number) => `${hourLabel(hour)} to ${hourLabel((hour + 1) % 24)}`;
export const unitOf = (metric: Pick<MetricData, "plural" | "singular">, value: number) => (value === 1 ? metric.singular : metric.plural);

/** Monday 00:00 of the workspace week that contains `now`, as a UTC timestamp. */
export function weekStartOf(now: number) {
  const local = now + WORKSPACE_OFFSET_MS, dayIndex = (new Date(local).getUTCDay() + 6) % 7;
  return Math.floor(local / DAY_MS) * DAY_MS - dayIndex * DAY_MS - WORKSPACE_OFFSET_MS;
}
export function rangeLabel(start: number) {
  const first = new Date(start + WORKSPACE_OFFSET_MS), last = new Date(start + 6 * DAY_MS + WORKSPACE_OFFSET_MS);
  const a = `${MONTHS[first.getUTCMonth()]} ${first.getUTCDate()}`;
  const b = first.getUTCMonth() === last.getUTCMonth() ? `${last.getUTCDate()}` : `${MONTHS[last.getUTCMonth()]} ${last.getUTCDate()}`;
  return `${a} to ${b}, ${last.getUTCFullYear()}`;
}

const emptyMetric = (id: MetricId): MetricData => ({
  id,
  label: id === "operations" ? "Operations" : id === "deliveries" ? "Deliveries" : "Errors",
  plural: id, singular: id === "operations" ? "operation" : id === "deliveries" ? "delivery" : "error",
  tone: id === "errors" ? "danger" : "neutral",
  values: new Array<number>(CELLS).fill(0), previous: new Array<number>(CELLS).fill(0),
});

/** Count what actually happened, by hour of the workspace week and of the week before. Nothing is invented. */
export function buildWorkspaceWeek(events: readonly TerrainEvent[], now: number): WeekData {
  const start = weekStartOf(now);
  const metrics: Record<MetricId, MetricData> = { operations: emptyMetric("operations"), deliveries: emptyMetric("deliveries"), errors: emptyMetric("errors") };
  const zeros = () => ({ values: new Array<number>(CELLS).fill(0), previous: new Array<number>(CELLS).fill(0) });
  const byAction = Object.fromEntries(ACTION_IDS.map(id => [id, { operations: zeros(), deliveries: zeros(), errors: zeros() }])) as ActionCells;
  for (const event of events) {
    if (!Number.isFinite(event.t)) continue;
    for (const [offset, key] of [[0, "values"], [-7 * DAY_MS, "previous"]] as const) {
      const local = event.t - (start + offset);
      if (local < 0 || local >= 7 * DAY_MS) continue;
      const wall = new Date(event.t + WORKSPACE_OFFSET_MS), day = Math.floor(local / DAY_MS), hour = wall.getUTCHours();
      const cell = day * HOURS + hour;
      const split = byAction[event.kind] as ActionCells[ActionId] | undefined;   // an unknown kind still counts in the totals, just not in a split
      metrics.operations[key][cell] += 1;
      if (split) split.operations[key][cell] += 1;
      if (event.outcome === "error") { metrics.errors[key][cell] += 1; if (split) split.errors[key][cell] += 1; }
      else if (event.kind === "export" || event.kind === "transfer") { metrics.deliveries[key][cell] += 1; if (split) split.deliveries[key][cell] += 1; }
    }
  }
  return { source: "workspace", start, rangeLabel: rangeLabel(start), metrics, byAction };
}

export interface Peak { index: number; value: number; day: number; hour: number }
export interface Summary {
  total: number; previousTotal: number; delta: number | null;
  peaks: Peak[]; busiest: { day: number; total: number; workingShare: number } | null;
  max: number; peak: Peak | null; hasData: boolean;
}
const peakOf = (index: number, value: number): Peak => ({ index, value, day: Math.floor(index / HOURS), hour: index % HOURS });
export function summarize(metric: MetricData): Summary {
  const { values, previous } = metric;
  const total = values.reduce((a, b) => a + b, 0), previousTotal = previous.reduce((a, b) => a + b, 0);
  const ranked = values.map((value, index) => ({ value, index })).filter(entry => entry.value > 0).sort((a, b) => b.value - a.value || a.index - b.index);
  const peaks = ranked.slice(0, 3).map(entry => peakOf(entry.index, entry.value));
  let best = -1, bestTotal = 0;
  for (let day = 0; day < DAYS; day++) {
    const sum = values.slice(day * HOURS, (day + 1) * HOURS).reduce((a, b) => a + b, 0);
    if (sum > bestTotal) { bestTotal = sum; best = day; }
  }
  const working = best < 0 ? 0 : values.slice(best * HOURS + WORKING_FROM, best * HOURS + WORKING_TO).reduce((a, b) => a + b, 0);
  return {
    total, previousTotal, delta: previousTotal > 0 ? (total - previousTotal) / previousTotal * 100 : null,
    peaks, peak: peaks[0] ?? null, max: peaks[0]?.value ?? 0, hasData: total > 0,
    busiest: best < 0 ? null : { day: best, total: bestTotal, workingShare: working / bestTotal * 100 },
  };
}

export interface CellDetail {
  index: number; day: number; hour: number; value: number; previous: number; change: number | null; share: number;
  /** Each hour of the day relative to its busiest hour, never below 6 % so a quiet hour still shows. */
  spark: number[];
}
export function cellDetail(metric: MetricData, index: number): CellDetail {
  const day = Math.floor(index / HOURS), hour = index % HOURS, row = metric.values.slice(day * HOURS, (day + 1) * HOURS);
  const dayTotal = row.reduce((a, b) => a + b, 0), dayMax = Math.max(...row, 0);
  const value = metric.values[index] ?? 0, previous = metric.previous[index] ?? 0;
  return {
    index, day, hour, value, previous, change: previous > 0 ? (value - previous) / previous * 100 : null,
    share: dayTotal > 0 ? value / dayTotal * 100 : 0, spark: row.map(v => (dayMax > 0 ? Math.max(0.06, v / dayMax) : 0.06)),
  };
}

export const cellName = (detail: Pick<CellDetail, "day" | "hour">) => `${DAY_NAMES[detail.day]} ${hourRange(detail.hour)}`;
/** The sentence read out when a column is highlighted from the keyboard. */
export function describeCell(metric: MetricData, detail: CellDetail, focused = false) {
  const change = detail.change === null ? "" : `, ${formatDelta(detail.change)} on last week`;
  return `${focused ? "Focused on " : ""}${cellName(detail)}: ${formatCount(detail.value)} ${unitOf(metric, detail.value)}${change}.`;
}
export function describeWeek(metric: MetricData, week: WeekData, summary: Summary) {
  const base = `3D bar chart of ${metric.plural} by day and hour for ${week.rangeLabel}.`;
  if (!summary.peak || !summary.busiest) return `${base} No ${metric.plural} were recorded in this week. Every value is listed in the table that follows.`;
  const change = summary.delta === null ? "" : `, ${formatDelta(summary.delta)} on last week`;
  return `${base} ${formatCount(summary.total)} ${metric.plural} in total${change}. Peak on ${DAY_NAMES[summary.peak.day]} at ${hourLabel(summary.peak.hour)} with ${formatCount(summary.peak.value)}. ${DAY_NAMES[summary.busiest.day]} is the busiest day. Every value is listed in the table that follows.`;
}

/** Column heights as a share of the busiest hour (0..1). */
export function normalized(values: readonly number[]) {
  const max = Math.max(...values, 0);
  return values.map(value => (max > 0 ? value / max : 0));
}

/** Map the next cell for a keyboard move. */
export function moveCell(index: number, key: "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown" | "Home" | "End") {
  const day = Math.floor(index / HOURS), hour = index % HOURS;
  switch (key) {
    case "ArrowLeft": return day * HOURS + Math.max(0, hour - 1);
    case "ArrowRight": return day * HOURS + Math.min(HOURS - 1, hour + 1);
    case "ArrowUp": return Math.max(0, day - 1) * HOURS + hour;
    case "ArrowDown": return Math.min(DAYS - 1, day + 1) * HOURS + hour;
    case "Home": return day * HOURS;
    default: return day * HOURS + HOURS - 1;
  }
}
