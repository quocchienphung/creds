import assert from "node:assert/strict";
import test from "node:test";
import { RunSimulation, SAMPLE } from "./orchestrator-model.ts";
import { INCIDENT, PLOT, axisTicks, countFormat, costFormat, neighbour, normalize, pathOf, spanName, spanState, summaryOf, timelineFromEvents, totalsAt } from "./timeline-model.ts";

// [now, tokens, cost, agents working] read from a recording of the public preview's replay at 1x
const RECORDED = [[0.54, 518, 0, 1], [1.024, 983, 0.01, 1], [2, 1920, 0.02, 0], [3.019, 2586, 0.02, 2], [3.607, 3460, 0.02, 3], [4.528, 6670, 0.03, 3], [5.207, 9641, 0.03, 3], [6.147, 14629, 0.04, 3], [7.026, 21164, 0.06, 3], [8.432, 28112, 0.07, 3], [9.317, 31248, 0.08, 2], [10.045, 33065, 0.08, 2], [11.415, 35074, 0.09, 2], [12.615, 36514, 0.09, 1], [14.622, 37563, 0.09, 1], [15.543, 39397, 0.1, 1], [16.816, 41900, 0.12, 0], [18.029, 43910, 0.13, 1], [20.035, 45801, 0.13, 1], [22.036, 47309, 0.13, 1], [23.521, 48553, 0.14, 1], [25.218, 50954, 0.15, 1], [26.31, 51190, 0.16, 1]];

test("the header counts tokens exactly, cost within a cent, and the agents working, at every recorded time", () => {
  const model = normalize(INCIDENT);
  for (const [now, tokens, cost, working] of RECORDED) {
    const at = totalsAt(model, now);
    assert.ok(Math.abs(at.tokens - tokens) <= 2, `${now}s: ${Math.round(at.tokens)} tokens vs recorded ${tokens}`);
    assert.ok(Math.abs(at.cost - cost) <= 0.011, `${now}s: $${at.cost.toFixed(3)} vs recorded $${cost}`);
    assert.equal(at.working, working, `${now}s: agents working`);
  }
});

test("the finished summary: five agents, 26.4s, 1.5x faster than sequential, $0.16, 51,210 tokens", () => {
  const summary = summaryOf(normalize(INCIDENT));
  assert.equal(summary.agents, 5);
  assert.equal(summary.duration, 26.4);
  assert.equal(summary.speedup.toFixed(1), "1.5");
  assert.equal(costFormat(summary.cost), "$0.16");
  assert.equal(countFormat(summary.tokens), "51,210");
});

test("connectors have the recorded geometry: a dispatch drops from the orchestrator, a result rises into it", () => {
  const model = normalize(INCIDENT);
  assert.equal(model.links.length, 8);
  const analystOut = model.links.find(link => link.shape === "out" && link.row === 3);
  assert.equal(analystOut.left, 2);
  assert.equal(analystOut.width, 0.3);
  assert.equal(analystOut.top, 36);
  assert.equal(analystOut.height, 124.75);
  const writerOut = model.links.find(link => link.shape === "out" && link.row === 4);
  assert.equal(writerOut.height, 168.75);
  const checkerIn = model.links.find(link => link.shape === "in" && link.row === 1);
  assert.equal(checkerIn.left, 9.1);
  assert.equal(checkerIn.width, 0.3);
  assert.equal(PLOT.pad + 4 * PLOT.row + PLOT.row / 2 - 36 + 0.75, 168.75);
});

test("span states follow the playhead", () => {
  const model = normalize(INCIDENT);
  const failed = model.spans.find(span => span.id === "analyst-19");
  assert.equal(failed.status, "failed");
  assert.deepEqual([2.9, 3.5, 5.1].map(now => spanState(failed, now)), ["pending", "active", "done"]);
});

test("axis ticks: 5 s for the preview's run, finer for a short one", () => {
  assert.deepEqual(axisTicks(26.4), [0, 5, 10, 15, 20, 25]);
  assert.deepEqual(axisTicks(11.4), [0, 2, 4, 6, 8, 10]);
});

test("accessible names read the agent, the kind, the tool, a failure, what it did, its time range and tokens", () => {
  const model = normalize(INCIDENT);
  assert.equal(spanName(model.spans.find(span => span.id === "analyst-19"), model), "Analyst, Tool call, PostgreSQL, failed: Conversion query timed out, 3.0s to 5.1s, 410 tokens");
  assert.equal(spanName(model.spans.find(span => span.id === "lead-1"), model), "Orchestrator, Waiting: Waiting on the analyst, researcher and checker, 2.0s to 14.6s");
});

test("arrow keys move along a row, to the overlapping span of the next row, and to the ends (as recorded)", () => {
  const model = normalize(INCIDENT);
  const byId = id => model.spans.find(span => span.id === id);
  assert.equal(neighbour(model, byId("checker-7"), "ArrowRight").id, "checker-8");
  assert.equal(neighbour(model, byId("checker-8"), "ArrowDown").id, "researcher-14");
  assert.equal(neighbour(model, byId("researcher-14"), "ArrowLeft").id, "researcher-13");
  assert.equal(neighbour(model, byId("researcher-13"), "ArrowUp").id, "checker-7");
  assert.equal(neighbour(model, byId("checker-7"), "End").id, "checker-10");
  assert.equal(neighbour(model, byId("checker-7"), "Home").id, "checker-6");
  assert.equal(neighbour(model, byId("checker-6"), "ArrowLeft"), null);
});

test("pinning a span lights its row, the orchestrator spans its handoffs enter, and the two connectors (as recorded for the analyst)", () => {
  const model = normalize(INCIDENT);
  const path = pathOf(model, model.spans.find(span => span.id === "analyst-21"));
  const dim = model.spans.filter(span => !path.spans.has(span.id)).map(span => span.id);
  assert.deepEqual(dim.filter(id => id.startsWith("lead")), ["lead-0", "lead-3", "lead-4", "lead-5"]);
  assert.ok(!dim.some(id => id.startsWith("analyst")));
  assert.equal(path.links.size, 2);
});

test("an orchestrator run becomes a timeline: the lead plans, waits, merges; a failed call, its wait and its retry are three spans", () => {
  const events = new RunSimulation(SAMPLE, 4).runToEnd();
  const run = timelineFromEvents(events, SAMPLE);
  assert.equal(run.agents.length, 5);
  assert.equal(run.handoffs.filter(handoff => handoff.from === "lead").length, 4);
  assert.equal(run.handoffs.filter(handoff => handoff.to === "lead").length, 4);
  const model = normalize(run);
  const lead = model.byRow[0].map(span => span.kind);
  assert.deepEqual(lead, ["thinking", "waiting", "thinking"]);
  const gemini = model.byRow[3].map(span => `${span.kind}${span.status === "failed" ? "!" : ""}`);
  assert.deepEqual(gemini, ["tool", "tool!", "waiting", "tool", "thinking"]);
  const summary = summaryOf(model);
  assert.ok(summary.speedup > 2 && summary.speedup < 4, `speedup ${summary.speedup}`);
  assert.ok(Math.abs(model.duration - 11.35) < 0.05, `duration ${model.duration}`);
});

test("an open span of a live run is active while it is open", () => {
  const model = normalize(timelineFromEvents(new RunSimulation(SAMPLE, 4).advance(5000), SAMPLE, 5), 5);
  const open = model.spans.filter(span => span.open);
  assert.ok(open.length >= 3);
  assert.ok(open.every(span => spanState(span, 5) === "active"));
});

test("a run in progress closes only the spans that have finished", () => {
  const events = new RunSimulation(SAMPLE, 4);
  const early = events.advance(5000);
  const run = timelineFromEvents(early, SAMPLE, 5);
  const model = normalize(run, 5);
  assert.ok(model.spans.some(span => span.open));
  assert.ok(model.spans.every(span => span.end <= 5.001));
});
