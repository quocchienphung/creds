import assert from "node:assert/strict";
import test from "node:test";
import { CONCURRENCY, RunSimulation, SAMPLE, TIMING, applyEvent, emptyRun, formatCost, formatDuration, formatSeconds, formatTokens, liveLog, ordinal, sideBySide } from "./orchestrator-model.ts";

// Recorded from the public preview (docs/research/orchestrator/source/agent-orchestrator/run-events.txt), ms after Run
const near = (actual, expected, tolerance, what) => assert.ok(Math.abs(actual - expected) <= tolerance, `${what}: ${actual} vs recorded ${expected} (±${tolerance})`);
const at = (events, type, lane) => events.find(event => event.type === type && (lane === undefined || event.lane === lane))?.at;
const all = (events, type) => events.filter(event => event.type === type);
const play = events => { let view = emptyRun(); for (const event of events) view = applyEvent(view, event); return view; };

test("the plan streams in one item at a time and is ready 1465 ms after Run", () => {
  const events = new RunSimulation(SAMPLE, 4).runToEnd();
  assert.deepEqual(all(events, "plan").map(event => event.at), [410, 641, 872, 1103]);
  assert.equal(at(events, "planReady"), 1465);
});

test("lanes are dispatched 110 ms apart and start working when the packet lands, 460 ms later", () => {
  const events = new RunSimulation(SAMPLE, 4).runToEnd();
  [1465, 1575, 1685, 1795].forEach((expected, lane) => {
    near(at(events, "dispatch", lane), expected, 15, `dispatch ${lane + 1}`);
    assert.equal(at(events, "arrive", lane) - at(events, "dispatch", lane), TIMING.pulse);
  });
});

test("lanes return when they did in the recording (Haiku, GPT, Sonnet, Gemini) and the lead merges 608 ms after the last", () => {
  const events = new RunSimulation(SAMPLE, 4).runToEnd();
  const done = all(events, "done").map(event => [event.lane, event.at]);
  assert.deepEqual(done.map(item => item[0]), [1, 3, 0, 2]);
  [[1, 8376], [3, 8909], [0, 9273], [2, 10048]].forEach(([lane, expected]) => near(done.find(item => item[0] === lane)[1], expected, 60, `lane ${lane + 1} returns`));
  near(at(events, "merge"), 10656, 40, "merge");
  near(at(events, "finish"), 11243, 60, "finish");
  near(at(events, "totals"), 11318, 80, "totals");
});

test("the Quillstack fetch fails after 1.3 s with a 503, waits 2 s and retries; the lane returns after four tool calls", () => {
  const events = new RunSimulation(SAMPLE, 4).runToEnd();
  const fail = events.find(event => event.type === "fail");
  assert.equal(fail.lane, 2);
  assert.equal(fail.message, "The page returned 503 Service Unavailable");
  assert.equal(fail.retryMs, 2000);
  const retry = events.find(event => event.type === "retry");
  assert.equal(retry.at - fail.at, 2000);
  near(fail.at, 4834, 50, "failure");
  const view = play(events);
  assert.equal(view.lanes[2].toolCalls, 4);
  assert.deepEqual(view.lanes[2].log.map(row => row.title), ["Web search", "Fetch page failed", "Retried", "Fetch page", "Write findings", "Returned to the lead"]);
  assert.equal(view.lanes[0].log.length, 5);
});

test("tokens and cost add up to the recorded lane totals and the totals row", () => {
  const view = play(new RunSimulation(SAMPLE, 4).runToEnd());
  assert.deepEqual(view.lanes.map(lane => formatTokens(lane.tokens)), ["31.2k", "19.5k", "28.9k", "24.7k"]);
  assert.equal(formatTokens(view.totals.tokens), "119.7k");
  assert.equal(formatCost(view.totals.cost, 2), "$0.19");
  assert.equal(formatSeconds(view.totals.wall), "11.4s");
  near(view.totals.sequential, 32800, 150, "in sequence");
  assert.ok(view.totals.speedup > 2.8 && view.totals.speedup < 3.0, `speedup ${view.totals.speedup}`);
  assert.deepEqual(view.lanes.map(lane => formatSeconds(lane.ms)), ["7.8s", "6.8s", "8.4s", "7.1s"]);
  assert.equal(view.status, "done");
  assert.equal(view.returned, 4);
});

test("concurrency 2: two lanes start, the others queue, the next starts the moment one returns", () => {
  const events = new RunSimulation(SAMPLE, 2).runToEnd();
  near(at(events, "dispatch", 1) - at(events, "dispatch", 0), 110, 15, "second dispatch");
  const queued = all(events, "queued");
  assert.deepEqual(queued.slice(0, 2).map(event => [event.lane, event.place]), [[2, 0], [3, 1]]);
  assert.equal(at(events, "dispatch", 2), at(events, "done", 1), "lane 3 starts when lane 2 returns");
  assert.equal(at(events, "dispatch", 3), at(events, "done", 0), "lane 4 starts when lane 1 returns");
  const view = play(events);
  near(view.totals.wall, 18100, 100, "wall time at concurrency 2");
  assert.ok(Math.abs(view.totals.sequential - 32800) < 200);
});

test("raising the limit mid-run releases queued lanes at once", () => {
  const sim = new RunSimulation(SAMPLE, 1);
  const first = sim.advance(3000);
  assert.equal(first.filter(event => event.type === "dispatch").length, 1);
  sim.setConcurrency(4, 3000);
  const more = sim.advance(3500);
  assert.equal(more.filter(event => event.type === "dispatch").length, 3);
  assert.equal(sim.concurrency, 4);
  const events = [...first, ...more, ...sim.runToEnd()];
  assert.equal(all(events, "done").length, 4);
});

test("stopping ends the simulation with no further events", () => {
  const sim = new RunSimulation(SAMPLE, 4);
  sim.advance(2000);
  sim.stop(2000);
  assert.equal(sim.nextAt(), null);
  assert.deepEqual(sim.advance(20000), []);
});

test("the limit is kept inside 1 to 4", () => {
  const sim = new RunSimulation(SAMPLE, 9);
  assert.equal(sim.concurrency, CONCURRENCY.max);
  sim.setConcurrency(0, 0);
  assert.equal(sim.concurrency, CONCURRENCY.min);
});

test("formatting and layout rules", () => {
  assert.equal(formatTokens(518), "518");
  assert.equal(formatTokens(1700), "1.7k");
  assert.equal(formatTokens(119700), "119.7k");
  assert.equal(formatCost(0.0262), "$0.026");
  assert.equal(formatCost(0.19, 2), "$0.19");
  assert.equal(formatDuration(760), "760ms");
  assert.equal(formatDuration(1180), "1.2s");
  assert.equal(ordinal(0), "next in line");
  assert.equal(ordinal(1), "2nd in line");
  assert.equal(ordinal(2), "3rd in line");
  assert.equal(sideBySide(719, 4), false);
  assert.equal(sideBySide(720, 4), true);
  assert.equal(sideBySide(900, 1), false);
});

test("Retry now skips what is left of the wait: the lane carries on at once and finishes that much earlier", () => {
  const plain = new RunSimulation(SAMPLE, 4).runToEnd();
  const sim = new RunSimulation(SAMPLE, 4);
  const events = [...sim.advance(5000)];
  const fail = events.find(event => event.type === "fail");
  assert.ok(fail);
  assert.equal(sim.retryNow(2, 5400), true);
  assert.equal(sim.retryNow(2, 5400), false, "only once");
  events.push(...sim.runToEnd());
  const retry = events.find(event => event.type === "retry");
  assert.equal(retry.at, 5400);
  const saved = fail.at + 2000 - 5400;
  assert.equal(events.find(event => event.type === "done" && event.lane === 2).at, plain.find(event => event.type === "done" && event.lane === 2).at - saved);
});

test("with approvals on a lane waits before writing; Allow carries on from there, Deny returns without writing", () => {
  const allow = new RunSimulation(SAMPLE, 4);
  allow.setApprovals(true);
  const early = allow.advance(9000);
  const asked = early.filter(event => event.type === "approval");
  assert.ok(asked.length >= 2);
  const lane = asked[0].lane;
  assert.deepEqual(allow.pendingApprovals().sort(), asked.map(event => event.lane).sort());
  assert.equal(early.some(event => event.type === "done" && event.lane === lane), false, "the lane has not returned");
  allow.resolveApproval(lane, true, 12000);
  for (const other of allow.pendingApprovals()) allow.resolveApproval(other, true, 12000);
  const rest = allow.runToEnd();
  const done = rest.find(event => event.type === "done" && event.lane === lane);
  assert.ok(done.at >= 12000 + 1500 && !done.denied);

  const deny = new RunSimulation(SAMPLE, 4);
  deny.setApprovals(true);
  const first = deny.advance(9000);
  const target = first.find(event => event.type === "approval").lane;
  for (const other of deny.pendingApprovals()) deny.resolveApproval(other, other !== target, 9000);
  const events = [...first, ...deny.runToEnd()];
  const view = play(events);
  assert.equal(view.lanes[target].denied, true);
  assert.equal(view.lanes[target].log.at(-2).title, "Write findings denied");
  assert.equal(view.status, "done");
  assert.equal(view.returned, 4);
});

test("a lane's transcript grows with the run: the running step is a row, a failure stays, the retry follows it", () => {
  const sim = new RunSimulation(SAMPLE, 4);
  let view = emptyRun();
  const at = until => { for (const event of sim.advance(until)) view = applyEvent(view, event); return liveLog(SAMPLE, 2, view.lanes[2]).map(row => `${row.title}${row.ms === undefined && row.tool !== "retry" && row.tool !== "return" ? "…" : ""}`); };
  assert.deepEqual(at(2500), ["Web search…"]);
  assert.deepEqual(at(4000), ["Web search", "Fetch page…"]);
  assert.deepEqual(at(5500), ["Web search", "Fetch page failed"]);
  assert.deepEqual(at(7000), ["Web search", "Fetch page failed", "Retried", "Fetch page…"]);
  assert.deepEqual(at(Infinity), ["Web search", "Fetch page failed", "Retried", "Fetch page", "Write findings", "Returned to the lead"]);
});
