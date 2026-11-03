/**
 * Tool call, the parts that are not React: what a call is, the words a group's header says, when a group opens and folds itself, how long outputs fold, and how
 * the calls of an orchestrator run (and the approval after it) are made. Rules and numbers come from the public preview of UIArc's Tool call
 * (docs/research/orchestrator/README.md). Pure, so node tests it.
 */
import { SAMPLE, formatDuration } from "./orchestrator-model.ts";
import type { RunView, Scenario, SimEvent, Step } from "./orchestrator-model.ts";

export type ToolId = "github" | "linear" | "postgres" | "slack" | "gmail" | "web" | "files";
export type ToolStatus = "running" | "success" | "error" | "approval" | "denied";
export type ToolValue = string | number | boolean | null;
export type ToolOutput =
  | { type: "list"; items: { lead: string; title: string; tag?: string }[] }
  | { type: "table"; columns: string[]; rows: ToolValue[][] }
  | { type: "json"; value: unknown }
  | { type: "text"; text: string };

export interface ToolCallData {
  id: string;
  tool: ToolId;
  title: string;
  /** phrasing per status ("Searching…", "Searched…"); falls back to `title` */
  titles?: Partial<Record<ToolStatus, string>>;
  status: ToolStatus;
  input?: Record<string, ToolValue>;
  output?: ToolOutput;
  /** quiet meta before the duration; derived from the output when left out */
  summary?: string;
  /** one line under the title: the error reason, or what allowing the call will do */
  message?: string;
  durationMs?: number;
  /** the failure is still waiting to be retried: Retry skips the wait */
  retryable?: boolean;
  /** a failure that has been dealt with (the lane retried it): it stays in the transcript but no longer keeps the group open */
  handled?: boolean;
  /** which lane of an orchestrator run made the call */
  lane?: number;
}

/** springs fitted to the recordings: the row's Input/Output panel and the group's list both open and close critically damped (omega 13.5) */
export const TOOL_SPRING = { type: "spring" as const, stiffness: 182, damping: 27.5, mass: 1 };
/** the group folds itself this long after every call has finished, unless the person has opened or closed something */
export const AUTO_COLLAPSE_MS = 450;
/** rows of the open group arrive this far apart */
export const ROW_STAGGER = 0.035;
export const FOLD = { tableRows: 5, jsonLines: 10 };
export const TOOL_NAME: Record<ToolId, string> = { github: "GitHub", linear: "Linear", postgres: "PostgreSQL", slack: "Slack", gmail: "Gmail", web: "Web", files: "Files" };

export const titleOf = (call: ToolCallData) => call.titles?.[call.status] ?? call.title;

/** "4 results", "2 rows", "3 fields": what a settled call says about its output when it has no summary of its own. */
export function summaryOf(call: ToolCallData): string | undefined {
  if (call.summary !== undefined) return call.summary;
  const output = call.output;
  if (!output) return undefined;
  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  if (output.type === "list") return plural(output.items.length, "result");
  if (output.type === "table") return plural(output.rows.length, "row");
  if (output.type === "json" && output.value && typeof output.value === "object") return plural(Object.keys(output.value as object).length, "field");
  return undefined;
}

export interface GroupHeader { label: string; /** the label shimmers while the agent works */ working: boolean; meta: string; metaFailed: boolean; stack: ToolId[]; }
/** "Used 3 tools", "Using 3 tools" (shimmering) while any call runs or the agent is still working, "Waiting for approval" when a call needs a decision. */
export function groupHeader(calls: readonly ToolCallData[], active?: boolean): GroupHeader {
  const running = calls.some(call => call.status === "running");
  const waiting = calls.some(call => call.status === "approval");
  const failed = calls.filter(call => call.status === "error").length;
  const working = active ?? running;
  const noun = `${calls.length} ${calls.length === 1 ? "tool" : "tools"}`;
  const total = calls.reduce((sum, call) => sum + (call.durationMs ?? 0), 0);
  const label = waiting ? "Waiting for approval" : working ? `Using ${noun}` : `Used ${noun}`;
  const meta = failed ? `${failed} failed` : working || waiting || !total ? "" : formatDuration(total);
  const seen: ToolId[] = [];
  for (const call of calls) if (!seen.includes(call.tool)) seen.push(call.tool);
  return { label, working: working && !waiting, meta, metaFailed: failed > 0, stack: seen };
}

/** A group opens by itself while any call runs, waits for a decision or has failed; a finished transcript starts folded. */
export const groupStartsOpen = (calls: readonly ToolCallData[]) => calls.some(call => call.status === "running" || call.status === "approval" || (call.status === "error" && !call.handled));
export const needsDecision = (calls: readonly ToolCallData[]) => calls.some(call => call.status === "approval");
/** True once nothing is running or waiting, for the auto-collapse (a failed call is not "running" but it keeps the list open until it is dealt with). */
export const allSettled = (calls: readonly ToolCallData[]) => calls.length > 0 && calls.every(call => call.status === "success" || call.status === "denied" || (call.status === "error" && call.handled === true));

// ---- outputs

export function jsonLines(value: unknown): string[] { return JSON.stringify(value, null, 2).split("\n"); }
export function copyText(output: ToolOutput | undefined, input?: Record<string, ToolValue>): string {
  if (!output) return input ? JSON.stringify(input, null, 2) : "";
  if (output.type === "text") return output.text;
  if (output.type === "json") return JSON.stringify(output.value, null, 2);
  if (output.type === "list") return output.items.map(item => [item.lead, item.title, item.tag].filter(Boolean).join(" ")).join("\n");
  return [output.columns.join("\t"), ...output.rows.map(row => row.join("\t"))].join("\n");
}
/** How many lines/rows are folded behind "Show N more lines". */
export const foldedCount = (output: ToolOutput | undefined): number => {
  if (!output) return 0;
  if (output.type === "table") return Math.max(0, output.rows.length - FOLD.tableRows);
  if (output.type === "json") return Math.max(0, jsonLines(output.value).length - FOLD.jsonLines);
  return 0;
};

// ---- the calls of an orchestrator run

const brand = (target: string | undefined) => { const word = (target ?? "").replace(/^[a-z]+:\/\//, "").split(/[.\s/]/)[0] ?? ""; return word.charAt(0).toUpperCase() + word.slice(1); };
const VERB: Record<Step["tool"], { running: string; done: string }> = {
  search: { running: "Searching", done: "Searched" }, fetch: { running: "Fetching", done: "Fetched" }, read: { running: "Reading", done: "Read" }, write: { running: "Writing findings", done: "Wrote findings" },
};
const toolOf = (step: Step): ToolId => (step.tool === "search" || step.tool === "fetch" ? "web" : "files");

/** The sample results of a search (fictional, like the rest of the sample). */
function resultsFor(step: Step): ToolOutput {
  const name = brand(step.target) || "Results";
  const count = Number(step.detail?.match(/\d+/)?.[0] ?? 4);
  const titles = [`${name} pricing`, `${name} plans and limits compared`, `${name} changelog`, `${name} billing FAQ`, `${name} vs the alternatives`, `${name} help centre`, `${name} status and uptime`];
  const tags = ["pricing", "plans", "news", "billing", "compare", "help", "status"];
  return { type: "list", items: titles.slice(0, count).map((title, index) => ({ lead: `#${index + 1}`, title, tag: tags[index] })) };
}
function outputFor(step: Step, lane: { id: string; title: string }, result: string): ToolOutput {
  if (step.tool === "search") return resultsFor(step);
  if (step.tool === "fetch") return { type: "text", text: `${step.line}.\n\n(${step.detail ?? "page read"} from ${step.target})` };
  if (step.tool === "read") return { type: "json", value: { path: step.target, lines: Number(step.detail?.match(/\d+/)?.[0] ?? 0), excerpt: step.line } };
  return { type: "text", text: result };
}
function inputFor(step: Step, lane: { id: string; title: string }): Record<string, ToolValue> {
  if (step.tool === "search") return { query: step.target ?? "", limit: 10 };
  if (step.tool === "fetch") return { url: `https://${step.target ?? ""}`, format: "markdown" };
  if (step.tool === "read") return { path: step.target ?? "", range: "all" };
  return { file: `findings/${lane.id}.md`, mode: "write" };
}

/**
 * The tool calls an orchestrator run has made so far, in the order they started: a step that is running, one that finished, one that failed (it stays an error
 * row; while its lane waits to retry, Retry skips the wait), and a retried step as its own row. `now` is the run's clock in ms.
 */
export function callsFromRun(events: readonly SimEvent[], view: RunView, scenario: Scenario = SAMPLE, laneFilter?: number): ToolCallData[] {
  const steps = events.filter((event): event is Extract<SimEvent, { type: "step" }> => event.type === "step" && (laneFilter === undefined || event.lane === laneFilter));
  const calls: ToolCallData[] = [];
  for (const event of steps) {
    const script = scenario.lanes[event.lane], step = script.steps[event.step], laneView = view.lanes[event.lane];
    const failedAttempt = !!step.fail && event.attempt === 1;
    const hasFailed = failedAttempt && events.some(other => other.type === "fail" && other.lane === event.lane && other.step === event.step);
    const isLatest = !steps.some(other => other.lane === event.lane && other !== event && (other.at > event.at || (other.at === event.at && other.attempt > event.attempt)));
    const stillRunning = isLatest && laneView.phase !== "done" && laneView.phase !== "stopped" && !hasFailed;
    const status: ToolStatus = hasFailed ? "error" : stillRunning ? "running" : "success";
    const who = brand(script.title), target = step.target, verb = VERB[step.tool];
    const noun = step.tool === "write" ? "" : ` ${target ?? ""}`;
    const retried = event.attempt === 2 && !!step.fail;
    const detail = retried ? step.fail?.retry.detail : step.detail;
    const settled = status !== "running";
    calls.push({
      id: `${script.id}:${event.step}:${event.attempt}`, tool: toolOf(step),
      title: failedAttempt ? `Could not fetch ${target}` : `${verb.done}${noun}`.trim(),
      titles: { running: `${verb.running}${noun}`.trim() },
      status,
      input: inputFor(step, script),
      output: settled && !failedAttempt ? outputFor(step, script, script.result) : undefined,
      summary: settled && !failedAttempt ? `${who} · ${detail ?? "saved"}` : undefined,
      message: hasFailed ? step.fail?.message : undefined,
      durationMs: settled ? (failedAttempt ? step.ms : retried ? step.fail?.retry.ms : step.ms) : undefined,
      retryable: hasFailed && laneView.phase === "error",
      handled: hasFailed && laneView.phase !== "error",
      lane: event.lane,
    });
  }
  return calls;
}

/** The call that comes after the run: the lead wants to post the summary, and waits for a decision. */
export function postSummaryCall(status: ToolStatus, durationMs?: number): ToolCallData {
  return {
    id: "post-summary", tool: "slack", title: "Post a summary to #pricing-review", status,
    titles: { running: "Posting to #pricing-review", success: "Posted to #pricing-review", approval: "Post a summary to #pricing-review", denied: "Post a summary to #pricing-review" },
    input: { channel: "#pricing-review", text: "Pricing review: three changes would close the gap…" },
    output: status === "success" ? { type: "json", value: { ok: true, channel: "#pricing-review", messages: 1 } } : undefined,
    summary: status === "success" ? "1 message" : undefined,
    message: status === "approval" ? "Sends as Arc agent to 12 people in #pricing-review" : undefined,
    durationMs: status === "success" ? durationMs : undefined,
  };
}
