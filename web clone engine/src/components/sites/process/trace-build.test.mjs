import { test } from "node:test";
import assert from "node:assert/strict";
import { buildProcessTrace } from "./trace-build.ts";
import { addLink, createLoopProcess, createSampleProcess } from "./process-model.ts";
import { applyAction, replay, startLog } from "./run-model.ts";
import { flattenSpans, totalsOf } from "../affectui-trace-waterfall/trace-model.ts";

const T0 = 7_000_000;
const doc = () => createSampleProcess(new Date("2026-10-21T09:00:00Z"));
const trace = (d, log, ms, simulated = true) => buildProcessTrace(d, replay(log, T0 + ms), T0 + ms, { simulated });
const ids = span => flattenSpans(span).map(item => item.id);
const byId = (span, id) => flattenSpans(span).find(item => item.id === id);

test("a block that has not started has no span; blocks appear as they start and the first block is the agent run", () => {
  const d = doc(), log = startLog(d.root, d.id, d.unit, T0, "r", d.links);
  const early = trace(d, log, 300);
  assert.equal(early.kind, "agent");
  assert.equal(early.id, "launch");
  assert.equal(early.status, "running");
  assert.equal(early.end, undefined, "the run is still going");
  assert.ok(!ids(early).includes("planner"), "queued blocks have no span yet");
  const later = trace(d, log, 1000);
  assert.ok(ids(later).includes("planner") && ids(later).includes("research") && ids(later).includes("coder"));
  assert.equal(byId(later, "planner").kind, "subagent");
  assert.ok(!ids(later).includes("scraper"), "the researcher's own blocks start after its delegate pause");
  assert.equal(byId(later, "planner").start, 700, "times are ms from the start of the run");
});

test("inside a block: model calls and tool calls derived from its settings (simulated engine only), tools in between", () => {
  const d = doc(), log = startLog(d.root, d.id, d.unit, T0, "r", d.links);
  const done = trace(d, log, 120_000);
  const coder = byId(done, "coder");
  const calls = (coder.children ?? []).filter(child => child.kind !== "subagent");
  assert.deepEqual(calls.map(child => child.kind), ["llm", "tool", "tool", "tool", "llm"], "coder has three tool labels");
  assert.deepEqual(calls.filter(child => child.kind === "tool").map(child => child.name), ["GitHub", "Stripe", "Figma"]);
  assert.ok(calls.every(child => child.start >= coder.start && child.end <= coder.end), "calls sit inside their block");
  const remote = buildProcessTrace(d, replay(log, T0 + 120_000), T0 + 120_000, { simulated: false });
  assert.equal(flattenSpans(remote).filter(span => span.kind === "llm" || span.kind === "tool").length, 0, "a real engine that reports no calls gets none invented");
  assert.ok(byId(remote, "coder").cost > 0, "its block carries the cost instead");
});

test("what the header adds up: costs sit on the model calls, once, and match the run's total", () => {
  const d = doc();
  let log = startLog(d.root, d.id, d.unit, T0, "r", d.links);
  log = applyAction(log, { type: "approve", id: "writer" }, T0 + 4000) ?? log;
  const snapshot = replay(log, T0 + 120_000);
  const span = buildProcessTrace(d, snapshot, T0 + 120_000, { simulated: true });
  const total = Object.values(snapshot.nodes).reduce((sum, run) => sum + run.cost + (run.attempts ?? []).reduce((a, attempt) => a + attempt.cost, 0), 0);
  assert.ok(Math.abs(totalsOf(span, 120_000).cost - total) < 1e-9, `${totalsOf(span, 120_000).cost} vs ${total}`);
  assert.equal(totalsOf(span, 120_000).hasTokens, true);
});

test("a task that waited for a person has a wait span from the moment it was ready to the moment of the decision", () => {
  const d = doc();
  let log = startLog(d.root, d.id, d.unit, T0, "r", d.links);
  const waiting = trace(d, log, 3000);
  const wait = byId(waiting, "writer:wait");
  assert.equal(wait.kind, "wait");
  assert.equal(wait.status, "running");
  assert.equal(wait.end, undefined);
  assert.equal(byId(waiting, "writer").status, "running");
  log = applyAction(log, { type: "approve", id: "writer" }, T0 + 6000);
  const after = trace(d, log, 7000);
  const done = byId(after, "writer:wait");
  assert.equal(done.status, "done");
  assert.equal(done.end - done.start, 6000 - 700, "from when it was ready (700 ms in) to the decision");
  assert.ok(byId(after, "writer").start <= done.start);
});

test("a failed try stays as its own failed span and the retry is a new one", () => {
  const d = doc();
  let log = startLog(d.root, d.id, d.unit, T0, "r", d.links);
  const failing = trace(d, log, 12_000);
  const tester = byId(failing, "tester");
  assert.equal(tester.status, "failed");
  assert.match(tester.error, /Simulated failure/);
  log = applyAction(log, { type: "retry", id: "tester" }, T0 + 12_000);
  const retried = trace(d, log, 30_000);
  const tries = flattenSpans(byId(retried, "tester")).filter(item => item.status === "failed");
  assert.equal(tries.length, 1);
  assert.match(tries[0].id, /:try1$/);
  assert.equal(byId(retried, "tester").status, "done");
  assert.ok(totalsOf(retried, 30_000).errors >= 1, "the failed try is counted");
});

test("a loop shows each pass as a span of its own: passes of a block and of what is under it line up", () => {
  const d = createLoopProcess(new Date("2026-10-21T09:00:00Z"));
  let log = startLog(d.root, d.id, d.unit, T0, "r", d.links);
  log = applyAction(log, { type: "approve", id: "loop-deployer" }, T0 + 40_000) ?? log;
  const span = buildProcessTrace(d, replay(log, T0 + 300_000), T0 + 300_000, { simulated: true });
  assert.equal(span.id, "loop-coordinator:run", "the first block ran twice, so the run holds both passes");
  assert.equal(span.children.length, 2);
  assert.match(span.children[0].detail, /round 1/);
  assert.match(span.children[1].detail, /round 2/);
  assert.ok(span.children[1].start > span.children[0].start);
  const qaPasses = flattenSpans(span).filter(item => item.name === "QA" && item.kind === "subagent");
  assert.ok(qaPasses.length >= 4, `QA ran in each pass of each round (${qaPasses.length})`);
  assert.equal(new Set(ids(span)).size, ids(span).length, "ids are unique across passes");
});

test("stopped blocks end where the run was stopped and say so; a person's block shows a wait, not a model call", () => {
  const d = doc();
  let log = startLog(d.root, d.id, d.unit, T0, "r", d.links);
  log = applyAction(log, { type: "stop" }, T0 + 2000);
  const stopped = trace(d, log, 10_000);
  assert.ok(stopped.end !== undefined && stopped.end <= 2000);
  assert.match(byId(stopped, "planner").detail, /stopped/);
  const person = { ...doc() };
  person.root = { ...person.root, children: [{ ...person.root.children[0], ai: { provider: "human", model: "", instructions: "" } }] };
  const humanTrace = buildProcessTrace(person, replay(startLog(person.root, "p", "usd", T0, "r"), T0 + 3000), T0 + 3000, { simulated: true });
  assert.equal(byId(humanTrace, "planner").children.at(-1).kind, "wait");
  assert.equal(byId(humanTrace, "planner").mark, undefined);
});

test("connections that make blocks wait are respected in the trace; ids are stable between ticks", () => {
  const d = addLink(doc(), "tester", "writer");
  const log = startLog(d.root, d.id, d.unit, T0, "r", d.links);
  const a = ids(trace(d, log, 20_000)), b = ids(trace(d, log, 20_000));
  assert.deepEqual(a, b);
  const waited = trace(d, log, 60_000);
  assert.ok(byId(waited, "writer").start >= byId(waited, "tester").end, "the writer started after the tester ended");
});
