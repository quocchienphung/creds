import { test } from "node:test";
import assert from "node:assert/strict";
import { DONE_EXPIRES_MS, diffRun, statusesOf } from "./run-notices.ts";
import { createLoopProcess, createSampleProcess } from "./process-model.ts";
import { applyAction, replay, startLog } from "./run-model.ts";

const T0 = 9_000_000;
const doc = createSampleProcess(new Date("2026-10-21T09:00:00Z"));
const context = { doc, formatCost: amount => `$${amount.toFixed(2)}`, showCost: true, formatDuration: ms => `${Math.round(ms / 1000)}s` };
const at = (log, ms) => replay(log, T0 + ms);

/** Runs `diffRun` over snapshots taken at each of the given times, collecting every notice in order. */
function watch(log, times, ctx = context) {
  let known = null;
  const all = [], retired = [];
  for (const ms of times) {
    const step = diffRun(known, at(log, ms), ctx);
    known = step.known; all.push(...step.notices); retired.push(...step.retire);
  }
  return { all, retired, known };
}

test("a page that opens in the middle of a run says nothing about what happened before", () => {
  const log = startLog(doc.root, doc.id, doc.unit, T0, "r");
  const first = diffRun(null, at(log, 20_000), context);
  assert.deepEqual(first.notices, []);
  assert.equal(first.known[""], "waiting", "the run state is remembered");
  assert.ok(Object.keys(first.known).some(key => key.startsWith("planner@")));
});

test("a block that finishes is announced once, with its engine, cost and time and a way to find it; the first block is the run, not a block", () => {
  const log = startLog(doc.root, doc.id, doc.unit, T0, "r");
  const { all } = watch(log, [500, 3000, 5800, 6200]);
  const done = all.filter(item => item.badge === "Done");
  assert.ok(done.length >= 1);
  const planner = done.find(item => item.blockId === "planner");
  assert.equal(planner.title, "Planner finished");
  assert.match(planner.text, /^Sonnet 5\.5 · \$\d+\.\d\d · 5s$/);
  assert.equal(planner.tone, "success");
  assert.deepEqual(planner.intent, { kind: "locate", blockId: "planner" });
  assert.equal(planner.expireMs, DONE_EXPIRES_MS);
  assert.ok(!all.some(item => item.title === "Coordinator finished"), "the first block finishing is the run finishing");
  assert.equal(new Set(all.map(item => item.id)).size, all.length, "no notice twice");
});

test("blocks that finish together are one notice", () => {
  const log = startLog(doc.root, doc.id, doc.unit, T0, "r");
  const { all } = watch(log, [500, 700 + 6500]);
  const together = all.filter(item => /blocks finished/.test(item.title));
  assert.equal(together.length, 1);
  assert.match(together[0].title, /^\d+ blocks finished$/);
  assert.ok(together[0].text.includes("Planner"));
});

test("a failure carries its reason and a retry; when the block is retried the failure notice is retired", () => {
  let log = startLog(doc.root, doc.id, doc.unit, T0, "r");
  const failing = watch(log, [500, 11_000, 12_500]);
  const failed = failing.all.find(item => item.badge === "Failed");
  assert.equal(failed.title, "Tester failed");
  assert.match(failed.text, /Simulated failure/);
  assert.equal(failed.tone, "error");
  assert.equal(failed.expireMs, undefined, "a failure stays until it is dealt with");
  assert.deepEqual(failed.intent, { kind: "retry", blockId: "tester" });
  assert.equal(failed.actionLabel, "Retry");
  log = applyAction(log, { type: "retry", id: "tester" }, T0 + 13_000);
  let known = failing.known;
  const retired = [];
  for (const ms of [13_500, 14_500]) { const step = diffRun(known, at(log, ms), context); known = step.known; retired.push(...step.retire); }
  assert.deepEqual(retired, [failed.id]);
});

test("the end of the run is announced once: done with cost and time, or failed or stopped; the trace is the way on", () => {
  let log = startLog(doc.root, doc.id, doc.unit, T0, "r");
  log = applyAction(log, { type: "stop" }, T0 + 3000);
  const stopped = watch(log, [500, 2000, 10_000]);
  const run = stopped.all.filter(item => item.badge.startsWith("Run"));
  assert.equal(run.length, 1);
  assert.equal(run[0].badge, "Run stopped");
  assert.equal(run[0].tone, "neutral");
  assert.deepEqual(run[0].intent, { kind: "trace" });
  assert.equal(run[0].actionLabel, "Open the trace");
  // a short plan that runs to its end
  const small = { ...doc, root: { ...doc.root, approval: false, children: [{ ...doc.root.children[0] }] } };
  const log2 = startLog(small.root, small.id, small.unit, T0, "r2");
  const done = watch(log2, [300, 3000, 20_000], { ...context, doc: small }).all.filter(item => item.badge.startsWith("Run"));
  assert.equal(done.length, 1);
  assert.equal(done[0].badge, "Run finished");
  assert.equal(done[0].tone, "success");
  assert.match(done[0].text, /^2 blocks · \$\d+\.\d\d · \d+s$/);
  assert.equal(done[0].expireMs, DONE_EXPIRES_MS * 2);
});

test("costs can be left out, and a loop's later round is announced again", () => {
  const quiet = watch(startLog(doc.root, doc.id, doc.unit, T0, "r"), [500, 7000], { ...context, showCost: false }).all.find(item => item.badge === "Done");
  assert.ok(!/\$/.test(quiet.text));
  const loop = createLoopProcess(new Date("2026-10-21T09:00:00Z"));
  let log = startLog(loop.root, loop.id, loop.unit, T0, "loop", loop.links);
  log = applyAction(log, { type: "approve", id: "loop-deployer" }, T0 + 40_000) ?? log;
  const { all } = watch(log, Array.from({ length: 700 }, (_, index) => 500 + index * 300), { ...context, doc: loop });
  const qa = all.filter(item => item.blockId === "loop-qa" && item.badge === "Done");
  assert.ok(qa.length >= 2, `QA was announced ${qa.length} times, once per round`);
  assert.ok(qa.some(item => /round 2/.test(item.text)));
  assert.equal(new Set(all.map(item => item.id)).size, all.length);
});

test("statusesOf remembers every block's status per round and the run's state", () => {
  const log = startLog(doc.root, doc.id, doc.unit, T0, "r");
  const known = statusesOf(at(log, 1500));
  assert.equal(known[""], "waiting");
  assert.equal(known["launch@1"], "running");
  assert.equal(known["writer@1"], "waiting");
});
