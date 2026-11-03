import { CELLS, DAYS, HOURS } from "./terrain-constants.ts";
import { ACTION_IDS, DAY_NAMES, DAY_SHORT, type ActionId, type MetricData, type MetricId, type WeekData } from "./terrain-data.ts";

/**
 * The split bar under the terrain splits the shown metric three ways. Every way is a partition of the week's 168 hours (or, for actions, of what was
 * counted in them), so the parts always add up to the terrain's total, and switching one off leaves exactly those hours out of the terrain.
 */
export type GroupingId = "day" | "daypart" | "action";
export const GROUPING_LABELS: Record<GroupingId, string> = { day: "Day", daypart: "Time of day", action: "Action" };

export interface BreakdownGroup {
  id: string;
  /** legend and readout */
  label: string;
  /** on the bar */
  short: string;
  value: number;
}

const DAYPARTS = [
  { id: "night", label: "Night 00–06", short: "Night", from: 0, to: 6 },
  { id: "morning", label: "Morning 06–12", short: "Morning", from: 6, to: 12 },
  { id: "afternoon", label: "Afternoon 12–18", short: "Afternoon", from: 12, to: 18 },
  { id: "evening", label: "Evening 18–24", short: "Evening", from: 18, to: 24 },
] as const;
const ACTION_LABELS: Record<ActionId, string> = { import: "Import", save: "Save", export: "Export", transfer: "Transfer" };
const DAY_IDS = DAY_SHORT.map(name => name.toLowerCase());

/** Only the workspace's own week knows what was done; the sample week is numbers by hour. */
export const groupingsOf = (week: WeekData): GroupingId[] => (week.byAction ? ["day", "daypart", "action"] : ["day", "daypart"]);

/** The hours (cell indices) a day or part of the day covers. */
function hoursOf(grouping: "day" | "daypart", id: string): number[] {
  const cells: number[] = [];
  if (grouping === "day") {
    const day = DAY_IDS.indexOf(id);
    if (day >= 0) for (let hour = 0; hour < HOURS; hour++) cells.push(day * HOURS + hour);
  } else {
    const part = DAYPARTS.find(item => item.id === id);
    if (part) for (let day = 0; day < DAYS; day++) for (let hour = part.from; hour < part.to; hour++) cells.push(day * HOURS + hour);
  }
  return cells;
}
const sum = (values: readonly number[], cells: readonly number[]) => cells.reduce((total, cell) => total + (values[cell] ?? 0), 0);

/** Every group of the grouping with what the metric counted in it, whether or not it is switched off (that is the bar's business). */
export function breakdownGroups(grouping: GroupingId, week: WeekData, metricId: MetricId): BreakdownGroup[] {
  const metric = week.metrics[metricId];
  if (grouping === "day") return DAY_IDS.map((id, day) => ({ id, label: DAY_NAMES[day], short: DAY_SHORT[day], value: sum(metric.values, hoursOf("day", id)) }));
  if (grouping === "daypart") return DAYPARTS.map(part => ({ id: part.id, label: part.label, short: part.short, value: sum(metric.values, hoursOf("daypart", part.id)) }));
  return ACTION_IDS.map(id => ({ id, label: ACTION_LABELS[id], short: ACTION_LABELS[id], value: (week.byAction?.[id][metricId].values ?? []).reduce((a, b) => a + b, 0) }));
}

/** The hours a group lights up in the terrain (for actions: the hours where it counted something). */
export function groupCells(grouping: GroupingId, week: WeekData, metricId: MetricId, id: string): number[] {
  if (grouping !== "action") return hoursOf(grouping, id);
  const values = week.byAction?.[id as ActionId]?.[metricId].values ?? [];
  const cells: number[] = [];
  for (let cell = 0; cell < CELLS; cell++) if ((values[cell] ?? 0) > 0) cells.push(cell);
  return cells;
}

/** The group an hour belongs to (for actions, the one that counted most in it); `null` when nothing was counted there under actions. */
export function groupOfCell(grouping: GroupingId, week: WeekData, metricId: MetricId, cell: number): string | null {
  if (cell < 0 || cell >= CELLS) return null;
  const day = Math.floor(cell / HOURS), hour = cell % HOURS;
  if (grouping === "day") return DAY_IDS[day];
  if (grouping === "daypart") return DAYPARTS.find(part => hour >= part.from && hour < part.to)?.id ?? null;
  let best: string | null = null, most = 0;
  for (const id of ACTION_IDS) {
    const value = week.byAction?.[id][metricId].values[cell] ?? 0;
    if (value > most) { most = value; best = id; }
  }
  return best;
}

/** The metric with the switched-off groups left out: the terrain, its totals, peaks and busiest day all follow what the bar still shows. */
export function maskedMetric(week: WeekData, metricId: MetricId, grouping: GroupingId, hidden: ReadonlySet<string>): MetricData {
  const metric = week.metrics[metricId];
  if (hidden.size === 0) return metric;
  if (grouping === "action") {
    const values = new Array<number>(CELLS).fill(0), previous = new Array<number>(CELLS).fill(0);
    for (const id of ACTION_IDS) {
      if (hidden.has(id)) continue;
      const split = week.byAction?.[id][metricId];
      if (!split) continue;
      for (let cell = 0; cell < CELLS; cell++) { values[cell] += split.values[cell] ?? 0; previous[cell] += split.previous[cell] ?? 0; }
    }
    return { ...metric, values, previous };
  }
  const values = metric.values.slice(), previous = metric.previous.slice();
  for (const id of hidden) for (const cell of hoursOf(grouping, id)) { values[cell] = 0; previous[cell] = 0; }
  return { ...metric, values, previous };
}

/** The names of what is left out, in order ("Sat, Sun"); empty when nothing is. */
export function hiddenSummary(grouping: GroupingId, hidden: ReadonlySet<string>): string {
  if (hidden.size === 0) return "";
  return (grouping === "day" ? DAY_IDS.map((id, day) => [id, DAY_SHORT[day]]) : grouping === "daypart" ? DAYPARTS.map(part => [part.id, part.short]) : ACTION_IDS.map(id => [id, ACTION_LABELS[id]]))
    .filter(([id]) => hidden.has(id)).map(([, name]) => name).join(", ");
}
