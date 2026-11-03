"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { AgentTimeline } from "./AgentTimeline";
import { OrchestratorBlock } from "./OrchestratorBlock";
import { ToolCallGroup } from "./ToolCall";
import { SegmentedControl } from "./parts";
import { timelineFromEvents } from "./timeline-model.ts";
import type { TimelineRun } from "./timeline-model.ts";
import { callsFromRun, postSummaryCall } from "./tool-call-model.ts";
import type { ToolCallData, ToolStatus } from "./tool-call-model.ts";
import { useOrchestratorRun } from "./use-orchestrator-run";
import { OrchestratorI18n } from "./OrchestratorI18n";
import "./orchestrator.css";

/** Closes the spans a stopped run left open at the moment it was stopped. */
function closeAt(run: TimelineRun, seconds: number): TimelineRun {
  return { ...run, spans: run.spans.map(span => (span.end === undefined ? { ...span, end: Math.max(span.start, seconds) } : span)), duration: Math.max(...run.spans.map(span => span.end ?? seconds), seconds) };
}

/**
 * The Orchestrator page: a lead agent plans a goal, fans the subtasks out to parallel worker lanes and merges what returns (the Agent orchestrator block); the same
 * run as time on a shared axis, live and then replayable (the Agent timeline); and every tool call the lanes made, with input, output, retry and the approval after
 * the run (the Tool call group). One simulated run feeds all three. Nothing is sent anywhere.
 */
export function Orchestrator({ workspaceId }: { workspaceId: string }) {
  const { t } = useWorkspaceI18n();
  const run = useOrchestratorRun(workspaceId);
  const { view, events, scenario, runs } = run;
  // what the person chose, for the run it was chosen in: a new run starts from "All" and from the post proposed afresh
  const [laneChoice, setLaneChoice] = useState({ run: 0, lane: 0 });
  const [postChoice, setPostChoice] = useState<{ run: number; status: ToolStatus } | null>(null);
  const lane = laneChoice.run === run.runs ? laneChoice.lane : 0;
  const setLane = (next: number) => setLaneChoice({ run: run.runs, lane: next });
  const openLane = useCallback((index: number) => setLaneChoice({ run: runs, lane: index + 1 }), [runs]);
  const post: ToolStatus | null = view.status === "done" ? (postChoice?.run === run.runs ? postChoice.status : "approval") : null;
  const setPost = (status: ToolStatus) => setPostChoice({ run: run.runs, status });
  const postTimer = useRef(0);

  useEffect(() => () => window.clearTimeout(postTimer.current), []);

  // the timeline asks for the run at its own pace (about every tenth of a second while live), so this page does not re-render to feed it
  const timelineRun = useMemo(() => (now: number) => {
    const live = run.active || view.status === "stopped";
    const built = timelineFromEvents(events, scenario, live ? now : undefined);
    return view.status === "stopped" && view.endedAt !== null ? closeAt(built, view.endedAt / 1000) : built;
  }, [events, scenario, run.active, view.status, view.endedAt]);

  const calls: ToolCallData[] = useMemo(() => {
    const own = callsFromRun(events, view, scenario, lane === 0 ? undefined : lane - 1);
    const asking = view.lanes.flatMap((item, index): ToolCallData[] => (item.phase === "approval" && (lane === 0 || lane === index + 1)
      ? [{ id: `${scenario.lanes[index].id}:approval`, tool: "files", title: `Write findings for ${item.title ?? scenario.lanes[index].title}`, status: "approval", message: `Saves them to findings/${scenario.lanes[index].id}.md`, lane: index }] : []));
    const after: ToolCallData[] = post && lane === 0 ? [postSummaryCall(post, 610)] : [];
    return [...own, ...asking, ...after];
  }, [events, view, scenario, lane, post]);

  const approve = (call: ToolCallData) => {
    if (call.id === "post-summary") { setPost("running"); window.clearTimeout(postTimer.current); postTimer.current = window.setTimeout(() => setPost("success"), 610); return; }
    if (call.lane !== undefined) run.resolve(call.lane, true);
  };
  const deny = (call: ToolCallData) => { if (call.id === "post-summary") setPost("denied"); else if (call.lane !== undefined) run.resolve(call.lane, false); };
  const retry = (call: ToolCallData) => { if (call.lane !== undefined) run.retryNow(call.lane); };

  const laneOptions = [{ value: 0, label: "All" }, ...scenario.lanes.map((item, index) => ({ value: index + 1, label: item.title.split(" ")[0] }))];
  const live = run.active;

  return <OrchestratorI18n scenario={scenario}><div className="orch">
    <div className="orch__head">
      <div>
        <h1>{t("Orchestrator")}</h1>
        <p>{t("A lead agent splits a goal into a plan, fans the subtasks out to parallel worker lanes and merges what comes back. The same run is shown as time on a shared axis and as every tool call it made.")}</p>
      </div>
      <span className="orch__note">{t("A simulated run: nothing is sent anywhere.")}</span>
    </div>

    <OrchestratorBlock run={run} onLaneOpen={openLane} />

    <div className="orch__pair">
      <div>
        <AgentTimeline key={run.runs} run={timelineRun} live={live} liveNow={run.clock} speedup={view.totals?.speedup} title={t("Timeline of this run")} onSpanSelect={span => setLane(span && span.row > 0 ? span.row : 0)} />
      </div>
      <section className="orch__card" aria-label={t("Tool calls")}>
        <div className="orch__cardhead">
          <h2>{t("Tool calls")}</h2>
          <SegmentedControl label="Show the calls of" value={lane} onChange={setLane} options={laneOptions} />
          <label className="orch__switch">
            <input type="checkbox" checked={run.approvals} onChange={event => run.setApprovals(event.target.checked)} />
            <span className="orch__track" aria-hidden="true" />
            {t("Ask before a worker writes")}
          </label>
        </div>
        <div className="orch__cardbody tc">
          {calls.length
            ? <ToolCallGroup key={`${run.runs}:${lane}`} calls={calls} active={live ? true : undefined} handlers={{ onApprove: approve, onDeny: deny, onRetry: retry }} />
            : <p className="orch__empty">{t("The calls the lanes make appear here as the run goes.")}</p>}
        </div>
      </section>
    </div>
  </div></OrchestratorI18n>;
}
