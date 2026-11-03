import { test } from "node:test";
import assert from "node:assert/strict";
import { assignTask, busyMinutes, busyMinutesWith, clockLabel, formatMinutes, initialsOf, leastBusyAgent, queueOf, queueTotals, unassignedOf } from "./delegate-model.ts";

const agents = [
  { id: "a", name: "Planner", current: 20 },
  { id: "b", name: "Designer" },
  { id: "c", name: "Engineer", current: 24 },
  { id: "d", name: "Analyst" },
];
const tasks = [
  { id: "t1", title: "Write notes", estimate: 12 },
  { id: "t2", title: "Fix test", estimate: 20 },
  { id: "q1", title: "Roadmap", estimate: 45, agentId: "a" },
  { id: "q2", title: "Refactor", estimate: 60, agentId: "c" },
  { id: "q3", title: "Upgrade", estimate: 12, agentId: "c" },
];

test("the running task counts its remaining minutes, the queue behind it counts full estimates", () => {
  assert.equal(busyMinutes(agents[0], queueOf(tasks, "a")), 20);
  assert.equal(busyMinutes(agents[2], queueOf(tasks, "c")), 36);
  assert.equal(busyMinutes(agents[1], []), 0);
  assert.equal(busyMinutes({ id: "x", name: "X" }, [{ id: "z", title: "Z", estimate: 7 }]), 7);
  assert.equal(busyMinutes({ id: "x", name: "X", current: 9 }, []), 9);
});

test("a hand-off previews the new busy time; a task already in the queue changes nothing", () => {
  assert.equal(busyMinutesWith(agents[1], tasks, tasks[0]), 12);
  assert.equal(busyMinutesWith(agents[0], tasks, tasks[0]), 32);
  assert.equal(busyMinutesWith(agents[0], tasks, tasks[2]), 20);
});

test("assigning moves a task to the end of the queue and back to unassigned with null", () => {
  const next = assignTask(tasks, "t1", "c");
  assert.deepEqual(queueOf(next, "c").map(task => task.id), ["q2", "q3", "t1"]);
  assert.deepEqual(unassignedOf(next).map(task => task.id), ["t2"]);
  assert.equal(next.length, tasks.length);
  const back = assignTask(next, "q2", null);
  assert.deepEqual(unassignedOf(back).map(task => task.id), ["t2", "q2"]);
  assert.equal(assignTask(tasks, "q1", "a"), tasks);
  assert.equal(assignTask(tasks, "t1", null), tasks);
  assert.equal(assignTask(tasks, "missing", "a"), tasks);
  assert.equal(tasks[0].agentId, undefined);
});

test("auto routing picks whoever is free first and ties go to the first listed", () => {
  assert.equal(leastBusyAgent(agents, tasks), "b");
  assert.equal(leastBusyAgent(agents, assignTask(tasks, "t1", "b")), "d");
  assert.equal(leastBusyAgent(agents, assignTask(assignTask(tasks, "t1", "b"), "t2", "d")), "b");
  assert.equal(leastBusyAgent([], tasks), null);
});

test("queue totals are money when agents have rates and minutes otherwise", () => {
  assert.deepEqual(queueTotals(agents, tasks), { minutes: 56, cost: 0, priced: false });
  const priced = agents.map(agent => ({ ...agent, rate: agent.id === "a" ? 0.08 : agent.id === "c" ? 0.06 : 0.01 }));
  const totals = queueTotals(priced, tasks);
  assert.equal(totals.priced, true);
  assert.equal(totals.cost.toFixed(2), (20 * 0.08 + 36 * 0.06).toFixed(2));
});

test("labels", () => {
  const nine = new Date(2026, 0, 5, 9, 0).getTime();
  assert.equal(clockLabel(nine, 20), "09:20");
  assert.equal(clockLabel(nine, 36), "09:36");
  assert.equal(clockLabel(nine, 75), "10:15");
  assert.equal(formatMinutes(56), "56 min");
  assert.equal(formatMinutes(125), "2 h 5 min");
  assert.equal(formatMinutes(120), "2 h");
  assert.equal(initialsOf({ id: "x", name: "Design lead" }), "DL");
  assert.equal(initialsOf({ id: "x", name: "Planner" }), "PL");
  assert.equal(initialsOf({ id: "x", name: "Planner", initials: "P1" }), "P1");
});
