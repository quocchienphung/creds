import { test } from "node:test";
import assert from "node:assert/strict";
import { LOOP_MS, DELEGATE_MS, applyAction, baseId, decisionId, isRunLog, isRunSnapshot, replay, startLog } from "./run-model.ts";
import { createNode } from "./process-model.ts";

const T0 = 1_000_000;
const ai = { provider: "anthropic", model: "", instructions: "" };
const task = (id, extra = {}) => createNode({ id, name: id, task: `do ${id}`, ai, sim: { durationMs: 1000 }, ...extra });
const at = (log, ms) => replay(log, T0 + ms);
const statuses = snapshot => Object.fromEntries(Object.entries(snapshot.nodes).map(([id, run]) => [id, run.status]));

// root -> build -> check: "check" loops back to "build", for at most 3 passes
const loopPlan = () => task("root", { children: [task("build", { children: [task("check", { sim: { durationMs: 2000 } })] })] });
const loopLog = (rounds = 3, extra = {}) => ({ ...startLog(loopPlan(), "p", "usd", T0, "r1", [{ id: "L", from: "check", to: "build", rounds }]), ...extra });

test("a loop runs the blocks from its target to its source again, up to its rounds, then the run is done", () => {
  // pass 1: root 0-1000, build 1700-2700 (kids 2400), check 2400+... build ends 1700+1000=2700; check starts at 1700+700=2400 for 2000ms -> ends 4400
  const log = loopLog(3);
  const end = at(log, 60_000);
  assert.equal(end.state, "done");
  assert.equal(end.nodes.build.round, 3);
  assert.equal(end.nodes.build.of, 3);
  assert.equal(end.nodes.build.rounds.length, 2);
  assert.equal(end.nodes.check.round, 3);
  assert.deepEqual(end.nodes.build.rounds.map(round => round.round), [1, 2]);
  assert.equal(end.nodes.root.round, undefined, "a block no loop runs again has one pass");
  assert.equal(end.nodes.build.runId, "build@L-3");
  assert.ok(Object.keys(end.nodes).every(id => !id.includes("@")), "the snapshot has one entry per block");
  assert.ok(end.nodes.build.rounds.every(round => round.status === "done"));
  const passes = [...end.nodes.build.rounds, { started: end.nodes.build.started }];
  for (let index = 1; index < passes.length; index += 1) assert.ok(passes[index].started > passes[index - 1].started, "each pass starts after the one before");
});

test("rounds: 2 goes around twice; the pause between passes is LOOP_MS and no pass overlaps the one before", () => {
  const log = loopLog(2);
  const end = at(log, 60_000);
  assert.equal(end.nodes.check.of, 2);
  const first = end.nodes.check.rounds[0];
  assert.equal(end.nodes.check.started >= first.ended + LOOP_MS, true);
});

test("mid-run the newest pass is shown running and the later passes are queued without having started", () => {
  const log = loopLog(3);
  const early = at(log, DELEGATE_MS + 800);
  assert.equal(early.nodes.build.round, 1);
  assert.equal(early.nodes.build.of, 3, "three passes are planned");
  assert.equal(early.nodes.build.runId, undefined);
  assert.equal(early.state, "running");
  const second = at(log, 7000);
  assert.equal(second.nodes.build.round, 2);
  assert.equal(second.nodes.build.runId, "build@L-2");
  assert.equal(second.nodes.build.rounds.length, 1);
  assert.equal(second.nodes.root.status, "running", "the first block keeps running while its loop goes on");
});

test("a failure in a loop ends it: a block that failed is not run again", () => {
  const plan = task("root", { children: [task("build", { children: [task("check", { sim: { durationMs: 2000, failOnce: true } })] })] });
  const log = startLog(plan, "p", "usd", T0, "r1", [{ id: "L", from: "check", to: "build", rounds: 3 }]);
  const snapshot = at(log, 60_000);
  assert.equal(snapshot.nodes.check.status, "failed");
  assert.equal(snapshot.nodes.check.round, undefined, "nothing went around again");
  assert.equal(snapshot.nodes.check.of, undefined);
});

test("a simulated failure happens in the first pass only; later passes do not fail", () => {
  const plan = task("root", { children: [task("build", { children: [task("check", { sim: { durationMs: 2000, failOnce: true } })] })] });
  let log = startLog(plan, "p", "usd", T0, "r1", [{ id: "L", from: "check", to: "build", rounds: 2 }]);
  const failing = at(log, 4000);
  assert.equal(failing.nodes.check.status, "failed");
  log = applyAction(log, { type: "retry", id: "check" }, T0 + 4000);
  const end = at(log, 60_000);
  assert.equal(end.state, "done");
  assert.equal(end.nodes.check.round, 2);
  assert.equal(end.nodes.check.status, "done");
});

test("an approval inside a loop asks again every pass, and a decision must name the pass it is about", () => {
  const plan = task("root", { children: [task("build", { approval: true, children: [task("check")] })] });
  let log = startLog(plan, "p", "usd", T0, "r1", [{ id: "L", from: "check", to: "build", rounds: 2 }]);
  const first = at(log, 3000);
  assert.equal(first.nodes.build.status, "waiting");
  assert.equal(decisionId(first, "build"), "build");
  log = applyAction(log, { type: "approve", id: "build" }, T0 + 3000);
  assert.ok(log);
  const second = at(log, 9000);
  assert.equal(second.nodes.build.round, 2);
  assert.equal(second.nodes.build.status, "waiting", "the second pass asks again");
  assert.equal(decisionId(second, "build"), "build@L-2");
  assert.equal(applyAction(log, { type: "approve", id: "build" }, T0 + 9000), null, "the first pass's name no longer works");
  const decided = applyAction(log, { type: "approve", id: "build@L-2" }, T0 + 9000);
  assert.ok(decided);
  assert.equal(at(decided, 60_000).state, "done");
});

test("Stop ends a loop, during a pass or between passes", () => {
  const during = applyAction(loopLog(4), { type: "stop" }, T0 + 3000);
  const first = at(during, 60_000);
  assert.equal(first.state, "stopped");
  assert.equal(first.nodes.check.status, "stopped");
  assert.equal(first.nodes.check.round, undefined, "a pass that was stopped does not go around again");
  const between = applyAction(loopLog(4), { type: "stop" }, T0 + 4700);
  const second = at(between, 60_000);
  assert.equal(second.state, "stopped");
  assert.equal(second.nodes.build.round, 2);
  assert.equal(second.nodes.build.status, "stopped");
  assert.equal(second.nodes.build.rounds[0].status, "done", "the pass that finished stays done");
  assert.equal(Object.values(second.nodes).filter(run => run.status === "running").length, 0);
});

test("a loop back to the first block runs the whole plan again", () => {
  const plan = task("root", { children: [task("a"), task("b", { children: [task("c")] })] });
  const log = startLog(plan, "p", "usd", T0, "r1", [{ id: "L", from: "c", to: "root", rounds: 3 }]);
  const end = at(log, 120_000);
  assert.equal(end.state, "done");
  for (const id of ["root", "a", "b", "c"]) { assert.equal(end.nodes[id].of, 3, id); assert.equal(end.nodes[id].round, 3, id); }
  assert.equal(end.nodes.root.runId, "root@L-3");
});

test("a block waits for the block it is connected from, even when that block comes later in the plan", () => {
  const plan = task("root", { children: [task("x", { sim: { durationMs: 1000 } }), task("y", { sim: { durationMs: 3000 } })] });
  // x needs y: x would start with y at 700 ms, but waits for y to finish at 3700 ms
  const log = startLog(plan, "p", "usd", T0, "r1", [{ id: "N", from: "y", to: "x" }]);
  const early = at(log, 2000);
  assert.equal(early.nodes.y.status, "running");
  assert.equal(early.nodes.x.status, "queued");
  const later = at(log, 4000);
  assert.equal(later.nodes.x.status, "running");
  assert.ok(later.nodes.x.started >= later.nodes.y.ended, "x started after y ended");
  assert.equal(at(log, 60_000).state, "done");
});

test("without connections the plan is played as before", () => {
  const plan = task("root", { children: [task("x"), task("y")] });
  const log = startLog(plan, "p", "usd", T0, "r1");
  assert.equal(log.links, undefined);
  const snapshot = at(log, DELEGATE_MS + 100);
  assert.deepEqual(statuses(snapshot), { root: "running", x: "running", y: "running" });
});

test("startLog keeps only the connections inside the part that is run; baseId strips a pass suffix", () => {
  const plan = task("root", { children: [task("x"), task("y")] });
  const log = startLog(plan.children[0], "p", "usd", T0, "r1", [{ id: "N", from: "y", to: "x" }, { id: "M", from: "x", to: "y" }]);
  assert.equal(log.links, undefined);
  assert.equal(baseId("build@L-2@M-3"), "build");
  assert.equal(baseId("build"), "build");
});

test("saved runs and reported snapshots with rounds and connections validate; broken ones do not", () => {
  assert.equal(isRunLog(loopLog()), true);
  assert.equal(isRunLog({ ...loopLog(), links: [{ id: 1 }] }), false);
  const snapshot = at(loopLog(), 60_000);
  assert.equal(isRunSnapshot(snapshot), true);
  assert.equal(isRunSnapshot({ ...snapshot, nodes: { build: { ...snapshot.nodes.build, rounds: [{ round: "x" }] } } }), false);
  assert.equal(isRunSnapshot({ ...snapshot, nodes: { build: { ...snapshot.nodes.build, runId: 5 } } }), false);
});
