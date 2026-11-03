import test from "node:test";
import assert from "node:assert/strict";
import { MappingModel, LAYOUT } from "./mapping-model.ts";
import { createSampleData } from "./mapping-sample.ts";
import { applyCommand, emptyData, normalizeData } from "./mapping-store.ts";

const TODAY = "2026-01-15";
const sample = () => createSampleData(TODAY);
const run = (data, ...commands) => commands.reduce((current, command) => applyCommand(current, command).data, data);

test("sample data has the starter shape, generic names and no copied content", () => {
  const data = sample(), model = new MappingModel(data), stats = model.stats(0);
  assert.deepEqual([data.teams.length, model.projects.length, model.tasks.length, data.people.length], [5, 21, 151, 21]);
  assert.deepEqual(data.people.slice(0, 3).map(person => person.name), ["User 1", "User 2", "User 3"]);
  assert.equal(data.people.at(-1).name, "User 21");
  assert.deepEqual(data.seq, { person: 21, team: 5, project: 21, task: 151, item: data.seq.item });
  assert.ok(stats.progress > 0 && stats.progress < 1 && stats.open > 0 && stats.blocked > 0);
  assert.doesNotMatch(JSON.stringify(data), /Northstar|Billing v2|Jasmine/);
  assert.deepEqual(normalizeData(JSON.parse(JSON.stringify(data))), data);
});

test("layout is computed from data: nested, non-overlapping and growing with content", () => {
  const model = new MappingModel(sample());
  for (const node of model.nodes.slice(1)) {
    const parent = model.nodes[node.parent];
    assert.ok(model.nodes[node.parent].children.includes(node.id));
    assert.ok(node.x >= parent.x && node.y >= parent.y && node.x + node.w <= parent.x + parent.w + 0.001 && node.y + node.h <= parent.y + parent.h + 0.001, node.key);
  }
  const teams = model.teams.map(team => model.nodes[team.node]);
  teams.forEach((a, i) => teams.slice(i + 1).forEach(b => assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, "teams overlap")));
  const first = model.projects[0], before = model.nodes[first.node].h;
  const taller = run(sample(), ...Array.from({ length: 6 }, () => ({ type: "task.add", projectId: sample().teams[0].projects[0].id })));
  assert.ok(new MappingModel(taller).nodes[first.node].h > before);
  assert.equal(LAYOUT.minTaskRows * LAYOUT.taskPitch + LAYOUT.taskTop + LAYOUT.projectFooter, before);
  assert.deepEqual(new MappingModel(emptyData()).world, LAYOUT.emptyWorld);
});

test("new users count upward and never reuse a number", () => {
  let data = run(sample(), { type: "person.add" }, { type: "person.add" });
  assert.deepEqual(data.people.slice(-2).map(person => person.name), ["User 22", "User 23"]);
  data = run(data, { type: "person.remove", id: "person-23" }, { type: "person.add" });
  assert.equal(data.people.at(-1).name, "User 24");
  assert.equal(run(emptyData(), { type: "person.add" }).people[0].name, "User 1");
});

test("every field is editable and rollups follow the edits", () => {
  let data = sample();
  const team = data.teams[0], project = team.projects[0], task = project.tasks[0];
  data = run(data,
    { type: "workspace.update", name: "Acme studio" },
    { type: "team.update", id: team.id, patch: { name: "Platform", mission: "Keep it running" } },
    { type: "project.update", id: project.id, patch: { name: "Billing", health: "off-track", due: "2026-03-01", brief: "Invoices" } },
    { type: "task.update", id: task.id, patch: { title: "Ship it", points: 8, due: "2026-02-02", description: "Do the thing" } },
    { type: "person.update", id: "person-1", patch: { name: "Ada", role: "Lead" } });
  const model = new MappingModel(data);
  assert.deepEqual([data.name, model.teams[0].name, model.projects[0].name, model.projects[0].health, model.tasks[0].title, model.person(0).name], ["Acme studio", "Platform", "Billing", "off-track", "Ship it", "Ada"]);
  assert.equal(model.describe(0), "Do the thing");
  const open = model.stats(0).open;
  const done = run(data, { type: "task.setStatus", id: data.teams[1].projects[0].tasks.find(item => item.status === "progress").id, status: "done" });
  assert.equal(new MappingModel(done).stats(0).open, open - 1);
  data = run(data, { type: "item.add", taskId: task.id, label: "Extra" }, { type: "item.update", taskId: task.id, id: `item-${data.seq.item + 1}`, patch: { label: "Renamed" } });
  assert.equal(data.teams[0].projects[0].tasks[0].checklist.at(-1).label, "Renamed");
});

test("checklist completion drives status and ancestors; setStatus keeps them consistent", () => {
  const data = sample(), blocked = data.teams.flatMap(t => t.projects.flatMap(p => p.tasks)).find(item => item.status === "blocked");
  const before = new MappingModel(data).stats(0);
  const completed = blocked.checklist.reduce((current, item) => item.done ? current : applyCommand(current, { type: "item.toggle", taskId: blocked.id, id: item.id }).data, data);
  const model = new MappingModel(completed), index = model.tasks.findIndex(item => item.id === blocked.id);
  assert.equal(model.status(index), "done");
  assert.equal(model.stats(0).open, before.open - 1);
  assert.equal(model.stats(0).blocked, before.blocked - 1);
  const reopened = new MappingModel(run(completed, { type: "task.setStatus", id: blocked.id, status: "progress" }));
  assert.equal(reopened.status(index), "progress");
  assert.equal(new MappingModel(run(data, { type: "task.setStatus", id: blocked.id, status: "done" })).status(index), "done");
});

test("add, move, rearrange and delete keep the structure valid", () => {
  let data = run(emptyData("W"), { type: "team.add" }, { type: "team.add" }, { type: "person.add" });
  assert.deepEqual(data.teams.map(team => team.name), ["Team 1", "Team 2"]);
  data = run(data, { type: "project.add", teamId: "team-1" }, { type: "project.add", teamId: "team-1" }, { type: "task.add", projectId: "project-1" });
  assert.deepEqual(data.teams[0].projects.map(project => project.name), ["Project 1", "Project 2"]);
  assert.equal(data.teams[0].projects[0].tasks[0].title, "Task 1");
  data = run(data, { type: "project.move", id: "project-2", toTeamId: "team-2", toIndex: 0 });
  assert.deepEqual([data.teams[0].projects.length, data.teams[1].projects[0].id], [1, "project-2"]);
  data = run(data, { type: "team.move", id: "team-2", toIndex: 0 });
  assert.deepEqual(data.teams.map(team => team.id), ["team-2", "team-1"]);
  data = run(data, { type: "task.update", id: "task-1", patch: { assigneeId: "person-1" } }, { type: "team.update", id: "team-1", patch: { leadId: "person-1", memberIds: ["person-1", "ghost"] } });
  assert.deepEqual(data.teams[1].memberIds, ["person-1"]);
  data = run(data, { type: "person.remove", id: "person-1" });
  assert.equal(data.teams[1].leadId, null);
  assert.equal(data.teams[1].projects[0].tasks[0].assigneeId, null);
  assert.equal(new MappingModel(data).person(-1).name, "Unassigned");
  data = run(data, { type: "team.remove", id: "team-1" });
  assert.equal(new MappingModel(data).tasks.length, 0);
  assert.equal(applyCommand(data, { type: "task.add", projectId: "missing" }).data, data);
});

test("imports are validated: bad references dropped, junk rejected, counters stay ahead", () => {
  assert.equal(normalizeData(null), null);
  assert.equal(normalizeData({ version: 2, people: [], teams: [] }), null);
  assert.equal(normalizeData({ version: 1, people: [{ id: "a" }, { id: "a" }], teams: [] }), null);
  const data = normalizeData({ version: 1, name: "X", people: [{ id: "person-9", name: "N", avatarUrl: "javascript:alert(1)" }], teams: [{ id: "team-3", name: "T", leadId: "nobody", memberIds: ["person-9", "zzz"], projects: [{ id: "project-4", name: "P", health: "bogus", due: "not-a-date", tasks: [{ id: "task-5", title: "K", status: "bogus", assigneeId: "zzz", points: 9999, checklist: [{ id: "item-6", label: "S", done: 1 }] }] }] }] });
  assert.equal(data.people[0].avatarUrl, undefined);
  assert.deepEqual([data.teams[0].leadId, data.teams[0].memberIds, data.teams[0].projects[0].health, data.teams[0].projects[0].due], [null, ["person-9"], "on-track", null]);
  const task = data.teams[0].projects[0].tasks[0];
  assert.deepEqual([task.status, task.assigneeId, task.points, task.checklist[0].done], ["todo", null, 99, true]);
  assert.deepEqual(data.seq, { person: 9, team: 3, project: 4, task: 5, item: 6 });
  assert.equal(run(data, { type: "person.add" }).people.at(-1).name, "User 10");
});
