import { test } from "node:test";
import assert from "node:assert/strict";
import { DELEGATE_MS, applyAction, isRunLog, isRunSnapshot, isActive, replay, startLog, totalCost } from "./run-model.ts";
import { createNode } from "./process-model.ts";

const T0 = 1_000_000;
const ai = provider => ({ provider, model: "", instructions: "" });
const task = (id, extra = {}) => createNode({ id, name: id, task: `do ${id}`, ai: ai("anthropic"), sim: { durationMs: 2000 }, ...extra });

// root (2 s) delegates to a (3 s, with a child a1 of 1 s), b (needs approval, 2 s) and c (fails once at 60% of 4 s)
const plan = () => task("root", { children: [
  task("a", { sim: { durationMs: 3000 }, children: [task("a1", { sim: { durationMs: 1000 } })] }),
  task("b", { approval: true, askText: "Ship it?" }),
  task("c", { sim: { durationMs: 4000, failOnce: true } }),
] });
const log = (extra = {}, unit = "usd") => ({ ...startLog(plan(), "p", unit, T0, "r1"), ...extra });
const at = (l, ms) => replay(l, T0 + ms);
const statuses = snap => Object.fromEntries(Object.entries(snap.nodes).map(([id, run]) => [id, run.status]));

test("children start after the parent delegates, and everything is queued before that", () => {
  const first = at(log(), 0);
  assert.deepEqual(statuses(first), { root: "running", a: "queued", a1: "queued", b: "queued", c: "queued" });
  assert.equal(first.state, "running");
  const later = at(log(), DELEGATE_MS + 100);
  assert.deepEqual(statuses(later), { root: "running", a: "running", a1: "queued", b: "waiting", c: "running" });
  assert.equal(later.state, "waiting");
  assert.equal(later.nodes.b.ask, "Ship it?");
  assert.equal(later.nodes.a1.status, "queued");
});

test("a waiting task holds only itself; the rest of the run carries on", () => {
  const snap = at(log(), 4500);
  assert.equal(snap.nodes.b.status, "waiting");
  assert.equal(snap.nodes.a.status, "done");
  assert.equal(snap.nodes.a1.status, "done");
  assert.equal(snap.nodes.root.status, "running", "the parent waits for its sub-tasks");
  assert.equal(snap.state, "waiting");
});

test("approving starts the task at the moment of the decision and the run can finish", () => {
  const approved = { ...log(), events: [{ t: T0 + 5000, action: { type: "approve", id: "b" } }] };
  assert.equal(at(approved, 4999).nodes.b.status, "waiting");
  const running = at(approved, 5500);
  assert.equal(running.nodes.b.status, "running");
  assert.equal(running.nodes.b.started, T0 + 5000);
  assert.equal(at(approved, 5000 + 2000).nodes.b.status, "done");
  const failedC = { ...approved, events: [...approved.events, { t: T0 + 5200, action: { type: "dismiss", id: "c" } }] };
  const end = at(failedC, 20_000);
  assert.equal(end.state, "done");
  assert.deepEqual(statuses(end), { root: "done", a: "done", a1: "done", b: "done", c: "stopped" });
  assert.equal(at(approved, 20_000).nodes.c.status, "failed", "a failure nobody answered stays failed");
  assert.equal(at(approved, 20_000).state, "done", "a failed sub-task does not fail the parent");
});

test("rejecting stops the task and what is under it", () => {
  const withKid = { ...startLog(task("root", { children: [task("b", { approval: true, children: [task("b1")] })] }), "p", "usd", T0, "r2") };
  const rejected = { ...withKid, events: [{ t: T0 + 1500, action: { type: "reject", id: "b" } }] };
  const snap = replay(rejected, T0 + 9000);
  assert.deepEqual(statuses(snap), { root: "done", b: "stopped", b1: "stopped" });
  assert.equal(snap.nodes.b.error, "Rejected by you");
});

test("a failed task keeps its failed try, restarts on retry and then succeeds", () => {
  const failed = at(log(), 2400 + DELEGATE_MS + 100);
  assert.equal(failed.nodes.c.status, "failed");
  assert.equal(failed.nodes.c.ended, T0 + DELEGATE_MS + 2400);
  assert.match(failed.nodes.c.error, /Simulated failure/);
  const retried = { ...log(), events: [{ t: T0 + 4000, action: { type: "retry", id: "c" } }] };
  const mid = at(retried, 5000);
  assert.equal(mid.nodes.c.status, "running");
  assert.equal(mid.nodes.c.started, T0 + 4000);
  assert.equal(mid.nodes.c.attempts.length, 1);
  assert.equal(mid.nodes.c.attempts[0].error.startsWith("Simulated failure"), true);
  assert.equal(at(retried, 4000 + 4000).nodes.c.status, "done");
});

test("costs grow while a task works and stop when it ends", () => {
  const usd = totalCost(task("x", { sim: { durationMs: 10_000 } }), "usd");
  assert.equal(usd, 0.12);
  const half = replay({ ...startLog(task("x", { sim: { durationMs: 10_000 } }), "p", "usd", T0), unit: "usd" }, T0 + 5000);
  assert.equal(Number(half.nodes.x.cost.toFixed(3)), 0.06);
  const done = replay({ ...startLog(task("x", { sim: { durationMs: 10_000 } }), "p", "usd", T0) }, T0 + 60_000);
  assert.equal(Number(done.nodes.x.cost.toFixed(3)), 0.12);
  assert.equal(totalCost(task("o", { ai: ai("ollama"), sim: { durationMs: 1000 } }), "usd"), 0, "a local model costs no dollars");
  assert.equal(totalCost(task("h", { ai: ai("human"), sim: { durationMs: 1000 } }), "tokens"), 0, "a person costs no tokens");
  assert.equal(totalCost(task("t", { sim: { durationMs: 2000 } }), "tokens"), 80);
  assert.equal(totalCost(task("n", { sim: { durationMs: 2000 } }), "none"), 0);
  assert.equal(totalCost(task("s", { sim: { durationMs: 2000, cost: 7 } }), "usd"), 7);
});

test("a cost limit fails the task at the moment the limit is reached", () => {
  const limited = startLog(task("x", { sim: { durationMs: 10_000 }, limit: 0.03 }), "p", "usd", T0);
  assert.equal(replay(limited, T0 + 1000).nodes.x.status, "running");
  const after = replay(limited, T0 + 9000);
  assert.equal(after.nodes.x.status, "failed");
  assert.equal(after.nodes.x.ended, T0 + 2500);
  assert.equal(Number(after.nodes.x.cost.toFixed(3)), 0.03);
  assert.match(after.nodes.x.error, /Cost limit/);
  assert.equal(after.state, "failed");
});

test("sub-tasks in sequence mode wait for the one before", () => {
  const sequence = startLog(task("root", { mode: "sequence", children: [task("one", { sim: { durationMs: 1000 } }), task("two", { sim: { durationMs: 1000 } }), task("three", { sim: { durationMs: 1000 } })] }), "p", "usd", T0);
  assert.deepEqual(statuses(replay(sequence, T0 + DELEGATE_MS + 200)), { root: "running", one: "running", two: "queued", three: "queued" });
  const second = replay(sequence, T0 + DELEGATE_MS + 1000 + 200);
  assert.equal(second.nodes.one.status, "done");
  assert.equal(second.nodes.two.status, "running");
  assert.equal(second.nodes.three.status, "queued");
  assert.equal(replay(sequence, T0 + 20_000).state, "done");
});

test("stop ends everything that is not finished and a stopped run is not active", () => {
  const l = { ...log(), events: [{ t: T0 + 1200, action: { type: "stop" } }] };
  const snap = replay(l, T0 + 9000);
  assert.equal(snap.state, "stopped");
  assert.equal(snap.nodes.root.status, "stopped");
  assert.equal(snap.nodes.b.status, "stopped", "a task that was waiting for approval");
  assert.equal(snap.nodes.a1.status, "stopped");
  assert.equal(isActive(snap), false);
  assert.equal(snap.nodes.root.cost, replay(l, T0 + 99_000).nodes.root.cost, "cost stops with the run");
});

test("actions are only recorded when they make sense at that moment", () => {
  const l = log();
  const t = T0 + DELEGATE_MS + 100;
  assert.equal(applyAction(l, { type: "approve", id: "a" }, t), null, "a running task cannot be approved");
  assert.equal(applyAction(l, { type: "retry", id: "c" }, t), null, "a running task cannot be retried");
  const approved = applyAction(l, { type: "approve", id: "b" }, t);
  assert.equal(approved.events.length, 1);
  assert.equal(applyAction(approved, { type: "approve", id: "b" }, t + 50), null, "already approved");
  assert.equal(replay(approved, t + 50).nodes.b.status, "running");
  assert.equal(applyAction(l, { type: "stop" }, t).events[0].action.type, "stop");
  assert.notEqual(applyAction(l, { type: "stop" }, T0 + 99_000), null, "a run still waiting for you can be stopped");
  const settled = { ...l, events: [{ t: T0 + 3000, action: { type: "approve", id: "b" } }, { t: T0 + 4000, action: { type: "dismiss", id: "c" } }] };
  assert.equal(replay(settled, T0 + 99_000).state, "done");
  assert.equal(applyAction(settled, { type: "stop" }, T0 + 99_000), null, "a finished run cannot be stopped");
  assert.equal(l.events.length, 0, "the log is not changed");
});

test("snapshots and logs that come from outside are validated", () => {
  const snap = at(log(), 5000);
  assert.equal(isRunSnapshot(JSON.parse(JSON.stringify(snap))), true);
  assert.equal(isRunSnapshot({ ...snap, state: "exploded" }), false);
  assert.equal(isRunSnapshot({ ...snap, nodes: { x: { status: "done", cost: "free" } } }), false);
  assert.equal(isRunSnapshot({ ...snap, nodes: [] }), false);
  assert.equal(isRunSnapshot(null), false);
  assert.equal(isRunSnapshot({ ...snap, nodes: { x: { status: "failed", cost: 1, attempts: [{ cost: 1 }] } } }), false);
  assert.equal(isRunLog(JSON.parse(JSON.stringify(log()))), true);
  assert.equal(isRunLog({ ...log(), events: [{ t: 1, action: { type: "explode" } }] }), false);
  assert.equal(isRunLog({ ...log(), unit: "gold" }), false);
});

test("a saved run store keeps the valid runs and drops the rest", async () => {
  const { normalizeRunStore, emptyRunStore } = await import("./run-model.ts");
  const good = log();
  const store = { version: 1, runs: { p: good, other: { ...good, processId: "p" }, broken: { nope: 1 } } };
  assert.deepEqual(Object.keys(normalizeRunStore(store).runs), ["p"]);
  assert.equal(normalizeRunStore(null), null);
  assert.equal(normalizeRunStore({ version: 2, runs: {} }), null);
  assert.deepEqual(normalizeRunStore(emptyRunStore()), { version: 1, runs: {} });
});
