import type { Translate } from "../i18n/translate";
import { SAMPLE, formatCost, formatSeconds, formatTokens } from "./orchestrator-model.ts";
import type { RunView, Scenario } from "./orchestrator-model.ts";
import { KIND_LABEL, countFormat, seconds } from "./timeline-model.ts";
import type { Normalized, Span } from "./timeline-model.ts";

/** Explicit presentation phrases derived from the sample's structured fields, never a parser of arbitrary sentences. */
export function orchestratorCopy(t: Translate, scenario: Scenario = SAMPLE): Translate {
  const phrases = new Map<string, string>();
  const put = (source: string, template: string, values: readonly unknown[]) => phrases.set(source, t(template, values));
  const past: Record<string, string> = { "Web search": "Searched", "Fetch page": "Fetched", "Read file": "Read", "Write findings": "Wrote findings" };
  const verbs = { search: ["Searching", "Searched"], fetch: ["Fetching", "Fetched"], read: ["Reading", "Read"], write: ["Writing findings", "Wrote findings"] } as const;
  put(`Split the goal into ${scenario.lanes.length} subtasks`, "Split the goal into {0} subtasks", [scenario.lanes.length]);
  put(`Waiting on ${scenario.lanes.length} subagents`, "Waiting on {0} subagents", [scenario.lanes.length]);
  put(`Plan ready. Dispatching ${scenario.lanes.length} subtasks.`, "Plan ready. Dispatching {0} subtasks.", [scenario.lanes.length]);
  scenario.lanes.forEach((lane, index) => {
    const worker = scenario.workers.find(item => item.id === lane.workerId) ?? scenario.workers[index];
    put(`Write findings for ${lane.title}`, "Write findings for {0}", [t(lane.title)]);
    put(`Saves them to findings/${lane.id}.md`, "Saves them to {0}", [`findings/${lane.id}.md`]);
    put(`${worker.name} is waiting for approval to write.`, "{0} is waiting for approval to write.", [worker.name]);
    put(`${worker.name} is retrying`, "{0} is retrying", [worker.name]);
    for (let n = 1; n <= scenario.lanes.length; n++) put(`${worker.name} returned. ${n} of ${scenario.lanes.length} done.`, "{0} returned. {1} of {2} done.", [worker.name, n, scenario.lanes.length]);
    lane.steps.forEach(step => {
      if (step.target) for (const verb of verbs[step.tool]) put(`${verb} ${step.target}`, `${verb} {0}`, [step.target]);
      put(`${step.label} failed`, "{0} failed", [t(step.label)]);
      const label = step.target ? `${past[step.label] ?? step.label} ${step.target}` : past[step.label] ?? step.label;
      const localized = `${t(past[step.label] ?? step.label)}${step.target ? ` ${step.target}` : ""}`;
      phrases.set(label, localized);
      put(`Retried: ${label.charAt(0).toLowerCase()}${label.slice(1)}`, "Retried: {0}", [`${localized.charAt(0).toLowerCase()}${localized.slice(1)}`]);
      put(`${step.label} failed: ${step.target ?? ""}`.trim(), "{0} failed: {1}", [t(step.label), step.target ?? ""]);
      if (step.fail) {
        put(`Could not fetch ${step.target}`, "Could not fetch {0}", [step.target]);
        put(`${worker.name} hit an error: ${step.fail.message}. Retrying.`, "{0} hit an error: {1}. Retrying.", [worker.name, t(step.fail.message)]);
      }
      const brand = lane.title.split(" ")[0];
      for (const detail of [step.detail, step.fail?.retry.detail, "saved"]) {
        if (!detail) continue;
        phrases.set(`${brand} · ${detail}`, `${brand} · ${t(detail)}`);
      }
      if (step.tool === "fetch") phrases.set(`${step.line}.\n\n(${step.detail ?? "page read"} from ${step.target})`, `${t(step.line)}.\n\n${t("({0} from {1})", [t(step.detail ?? "page read"), step.target])}`);
      if (step.tool === "search") {
        const brand = (step.target ?? "").split(" ")[0];
        const name = brand.charAt(0).toUpperCase() + brand.slice(1);
        for (const suffix of ["pricing", "plans and limits compared", "changelog", "billing FAQ", "vs the alternatives", "help centre", "status and uptime"]) put(`${name} ${suffix}`, `{0} ${suffix}`, [name]);
      }
    });
  });
  return <T,>(message: T, values?: readonly unknown[]): T => typeof message === "string" && !values && phrases.has(message) ? phrases.get(message) as T : t(message, values);
}

/** Announcements keep the engine's original events and numbers; only the spoken presentation changes. */
export function runAnnouncement(view: RunView, t: Translate): string {
  if (view.status === "done" && view.totals) return t("Done. {0} tokens, {1}, {2}.", [formatTokens(view.totals.tokens), formatCost(view.totals.cost, 2), formatSeconds(view.totals.wall)]);
  return t(view.announce);
}

export function timelineSpanName(span: Span, model: Normalized, t: Translate): string {
  const kind = t(KIND_LABEL[span.kind]) + (span.kind === "tool" && span.tool ? `, ${t(span.tool)}` : "") + (span.status === "failed" ? t(", failed") : "");
  return t("{0}, {1}: {2}, {3} to {4}{5}", [t(model.agents[span.row].name), kind, t(span.label), seconds(span.start), seconds(span.end), span.tokens ? t(", {0} tokens", [countFormat(span.tokens)]) : ""]);
}
