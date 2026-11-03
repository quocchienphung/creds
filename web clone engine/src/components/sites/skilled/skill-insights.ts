import type { SkillEvent, SkillRecord } from "./skill-model.ts";

/** Pure arithmetic behind the Skilled overview and timeline: every number comes from saved skills and measured operations. */
export type Period = "7d" | "30d" | "90d";
export const periods: readonly { value: Period; label: string; days: number; buckets: number }[] = [
  { value: "7d", label: "7D", days: 7, buckets: 7 },
  { value: "30d", label: "30D", days: 30, buckets: 15 },
  { value: "90d", label: "90D", days: 90, buckets: 18 },
];
const DAY = 86_400_000;

/** How many times fall in each of `buckets` equal slices of the `days` ending at `now`, oldest first. */
export function bucketSeries(times: readonly number[], now: number, days: number, buckets: number): number[] {
  const span = days * DAY, size = span / buckets, start = now - span, out = new Array<number>(buckets).fill(0);
  for (const time of times) {
    if (time <= start || time > now) continue;
    out[Math.min(buckets - 1, Math.floor((time - start) / size))]++;
  }
  return out;
}
/** The running total at the end of each slice, starting from everything older than the window. */
export function cumulativeSeries(times: readonly number[], now: number, days: number, buckets: number): number[] {
  const base = times.filter(time => time <= now - days * DAY).length;
  let total = base;
  return bucketSeries(times, now, days, buckets).map(count => (total += count));
}
/** Times in the last `days` against the `days` before them. */
export function periodCounts(times: readonly number[], now: number, days: number): { current: number; previous: number } {
  const span = days * DAY;
  return { current: times.filter(time => time > now - span && time <= now).length, previous: times.filter(time => time > now - 2 * span && time <= now - span).length };
}
/** "+3" / "-1"; nothing when it did not change. With nothing before, the count itself is the change. */
export function changeLabel({ current, previous }: { current: number; previous: number }): string | undefined {
  const delta = current - previous;
  return delta === 0 ? undefined : delta > 0 ? `+${delta}` : `${delta}`;
}
export function sizeParts(bytes: number): { value: number; suffix: string; decimals: number } {
  if (bytes < 1024) return { value: bytes, suffix: " B", decimals: 0 };
  if (bytes < 1024 * 1024) return { value: Math.round(bytes / 102.4) / 10, suffix: " KB", decimals: 1 };
  return { value: Math.round(bytes / 104857.6) / 10, suffix: " MB", decimals: 1 };
}

export const isDelivery = (event: SkillEvent) => event.outcome === "success" && (event.kind === "export" || event.kind === "transfer");

export interface LifecycleStep { id: "source" | "skill" | "deliver" | "receipt"; label: string; done: boolean }
/** Where the person is in setup, read from what actually exists: a source, a skill, a delivery, a receipt. */
export function lifecycleSteps(skills: readonly Pick<SkillRecord, "sourceUrl" | "status">[], events: readonly SkillEvent[]): LifecycleStep[] {
  const ok = events.filter(event => event.outcome === "success");
  return [
    { id: "source", label: "Add a source", done: skills.some(skill => skill.sourceUrl !== "") },
    { id: "skill", label: "Add a skill", done: skills.some(skill => skill.status === "ready") },
    { id: "deliver", label: "Deliver to an agent", done: ok.some(event => event.kind === "export" || event.kind === "transfer") },
    { id: "receipt", label: "Confirm a receipt", done: ok.some(event => event.kind === "transfer" && /receipt/i.test(event.label)) },
  ];
}

export interface TimelineEntry { id: string; at: number; actor?: string; title: string; meta: string; tone: "neutral" | "success" | "danger"; rows: [string, string][] }
const bytesText = (value: number) => { const { value: amount, suffix, decimals } = sizeParts(value); return `${amount.toFixed(decimals)}${suffix}`; };
const msText = (value: number) => `${value < 10 ? value.toFixed(1) : Math.round(value)} ms`;

/** One timeline row per lifecycle operation. Storage writes are left to the Activity list. */
export function timelineEntries(events: readonly SkillEvent[], skills: readonly Pick<SkillRecord, "id" | "name" | "description" | "target">[], keep: (event: SkillEvent) => boolean = () => true): TimelineEntry[] {
  return events.filter(event => event.kind !== "save" && keep(event)).map(event => {
    const skill = event.skillId ? skills.find(item => item.id === event.skillId) : undefined;
    const failed = event.outcome === "error";
    let title: string, actor: string | undefined;
    if (failed) title = `${event.label} failed`;
    else if (event.kind === "import" && skill) { actor = skill.name; title = "imported into your library"; }
    else if (event.kind === "export") title = "Skill bundle exported";
    else if (event.kind === "transfer" && /^Receipt . /.test(event.label)) title = `Delivery confirmed by ${event.label.replace(/^Receipt . /, "")}`;
    else title = event.label;
    const rows: [string, string][] = [["Operation", event.label], ["Took", msText(event.durationMs)]];
    if (event.bytes) rows.push(["Size", bytesText(event.bytes)]);
    if (skill) rows.push(["Target", skill.target]);
    if (event.detail) rows.push([failed ? "Reason" : "Note", event.detail]);
    return { id: event.id, at: event.t, actor, title, meta: failed ? (event.detail ?? "") : [event.bytes ? bytesText(event.bytes) : "", msText(event.durationMs)].filter(Boolean).join(" · "), tone: failed ? "danger" : event.kind === "import" && !skill ? "neutral" : "success", rows };
  });
}
