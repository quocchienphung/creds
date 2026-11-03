"use client";

import { useMemo } from "react";
import { Boxes, ClipboardList, Columns3, FileJson, FileSpreadsheet, ShieldCheck } from "lucide-react";
import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { Workflow, type WorkflowLabels, type WorkflowStep } from "../../../json-pipeline/Workflow";
import { WorkspaceLink } from "../../../guide-navigation/WorkspaceLink";
import type { CollateralEngine } from "../../useCollateralEngine";
import type { JsonPlanState } from "../useJsonPlan";
import type { JsonPlan } from "../engine/json-session";

export const CHECK: Record<string, string> = {
  "serious-issues": "No serious issue is still open",
  mapping: "Every column the JSON needs is mapped",
  metadata: "Reporting date and contact details are filled in",
  grouping: "Every row is placed in the hierarchy",
  "file-name": "The file name follows D40 + TCTD code + date + sequence",
  schema: "The JSON matches the reporting schema",
  template: "Every key is where Mẫu số 09 puts it",
  utf8: "The file is valid UTF-8 and parses",
  replay: "The same input gives the same bytes",
  counts: "Rows, assets and groups add up",
  ts013: "Approved descriptions are what the JSON holds",
};
const GROUPS: { id: string; title: string; detail: string; checks: string[]; mark: typeof Columns3 }[] = [
  { id: "mapping", title: "Map columns", detail: "the columns the JSON needs", checks: ["mapping"], mark: Columns3 },
  { id: "review", title: "Review issues", detail: "nothing serious left open", checks: ["serious-issues"], mark: ShieldCheck },
  { id: "details", title: "Report details", detail: "date, contacts and file name", checks: ["metadata", "file-name"], mark: ClipboardList },
  { id: "group", title: "Group rows", detail: "branch, customer, asset", checks: ["grouping", "counts"], mark: Boxes },
  { id: "validate", title: "Validate the JSON", detail: "schema, template, bytes, replay", checks: ["schema", "template", "utf8", "replay", "ts013"], mark: FileJson },
];

/**
 * The nine checks of the export as a workflow: each step is the real result of its checks, and its time is how long the worker really took (the
 * steps that were not timed say "Done"). Run checks asks the worker again, then replays the result one step at a time.
 */
export function JsonPipeline({ engine, state, plan }: { engine: CollateralEngine; state: JsonPlanState; plan: JsonPlan }) {
  const { t, locale } = useWorkspaceI18n();
  const n = (value: number) => new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US").format(value);
  const labels: WorkflowLabels = useMemo(() => ({
    done: t("Done"), run: t("Run checks"), runAgain: t("Run again"), stop: t("Stop"), running: t("Running"), failed: t("Failed"), skipped: t("Skipped"),
    step: (title, status) => `${title}, ${status}`,
    runningStep: (index, total) => t("Checking step {0} of {1}", [index, total]),
    passed: ms => ms ? t("Every check holds · {0}", [ms]) : t("Every check holds"),
    blocked: count => count === 1 ? t("1 step needs attention") : t("{0} steps need attention", [count]),
    announce: { start: t("Running the checks"), step: (title, status) => `${title}: ${status}`, done: t("The checks finished"), stopped: t("The run was stopped") },
  }), [t]);

  const stepsFrom = (p: JsonPlan): WorkflowStep[] => {
    const byId = new Map(p.checks.map(check => [check.id, check]));
    const r = p.reconciliation, timings = p.timings;
    const list = (ids: string[]) => <ul className="cr-checks" aria-label={t("Checks")}>{ids.map(id => { const check = byId.get(id); return <li key={id} data-ok={check ? check.ok : undefined} className="wf-outLine"><span className={"wf-labelDot"} data-tone={check ? (check.ok ? undefined : "bad") : "idle"} aria-hidden="true" /><span className={check?.ok ? "" : "wf-name"}>{t(CHECK[id])}</span></li>; })}</ul>;
    const gate = (ids: string[]) => ids.every(id => byId.get(id)?.ok);
    const reason = (ids: string[]) => ids.map(id => byId.get(id)).find(check => check && !check.ok);
    const open = engine.view?.summary.blocking ?? 0;
    const steps: WorkflowStep[] = [
      { id: "workbook", mark: <FileSpreadsheet size={16} strokeWidth={1.75} />, title: t("Workbook opened"), detail: engine.result ? `${engine.result.fileName} · ${n(r.rowsInSheet)} ${t("rows")}` : undefined, result: "ok", durationMs: engine.openMs || undefined, output: <div className="wf-outLine"><span className="wf-name">{engine.result?.fileName}</span><span className="wf-mono wf-tabular">{n(r.rowsInSheet)} {t("rows")}</span></div> },
    ];
    for (const group of GROUPS) {
      const ok = gate(group.checks), bad = reason(group.checks);
      const Mark = group.mark;
      const timing = group.id === "group" ? timings?.build : group.id === "validate" && timings ? timings.verify + timings.replay : undefined;
      const detail = group.id === "review" ? t("{0} serious open", [open]) : group.id === "group" ? t("{0} branches · {1} customers · {2} assets", [n(r.branches), n(r.customers), n(r.assets)]) : t(group.detail);
      const why = ok ? undefined : group.id === "review" ? t("{0} serious issues are still open. Resolve them or accept them with a reason.", [open])
        : group.id === "details" ? t("The reporting date (YYYYMMDD), the three contact fields, the TCTD code and the 3-character sequence must be filled in.")
        : group.id === "mapping" ? t("A column the JSON needs is not mapped.")
        : group.id === "group" ? (p.problems[0] ?? t("Rows could not all be placed in the hierarchy."))
        : (bad?.detail ?? t("A check no longer holds"));
      steps.push({
        id: group.id, mark: <Mark size={16} strokeWidth={1.75} />, title: t(group.title), detail, activity: t("Checking…"), result: ok ? "ok" : "error", durationMs: timing, output: list(group.checks), error: why,
        action: ok ? undefined : group.id === "review" ? <WorkspaceLink className="wf-retry" href="/personalize?section=excel-formation">{t("Open review")}</WorkspaceLink>
          : group.id === "details" ? <button type="button" className="wf-retry" onClick={() => document.querySelector<HTMLInputElement>(".cr-meta input")?.focus()}>{t("Fill in")}</button> : undefined,
      });
    }
    const failing = p.checks.filter(check => !check.ok);
    steps.push({
      id: "export", mark: <FileJson size={16} strokeWidth={1.75} />, title: t("Ready to export?"), detail: p.ready ? t("every check holds") : t("{0} checks do not hold", [failing.length]), result: p.ready ? "ok" : "error",
      taken: p.ready ? "ready" : "blocked",
      paths: [
        { id: "ready", label: t("Ready"), body: <div className="wf-outLine"><span className="wf-label"><span className="wf-labelDot" />{p.fileName ?? "D40…json"}</span><span className="wf-muted">{p.ready ? t("can be downloaded below") : t("is locked until every check holds")}</span></div> },
        { id: "blocked", label: t("Blocked"), body: failing.length ? <ul className="cr-checks" aria-label={t("Checks")}>{failing.map(check => <li key={check.id} className="wf-outLine"><span className="wf-labelDot" data-tone="bad" aria-hidden="true" /><span className="wf-name">{t(CHECK[check.id])}</span></li>)}</ul> : <span className="wf-muted">{t("Nothing blocks the export.")}</span> },
      ],
    });
    return steps;
  };
  const steps = stepsFrom(plan);
  const onRun = async () => { const result = await engine.jsonPlan(state.meta, state.options); return result ? stepsFrom(result.plan) : undefined; };
  return <Workflow title={t("Checks before the export")} description={t("Run in this tab. Nothing leaves it.")} steps={steps} labels={labels} onRun={onRun} />;
}
