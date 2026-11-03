import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LIMITS, addLink, checkLink, createNode, createSampleProcess, instantiate, linkKind, loopFrom, normalizeLibrary, normalizeProcess,
  pathToRoot, pruneLinks, removeLink, removeNode, updateLink, waitsFor, reparentNode,
} from "./process-model.ts";

const node = (id, children = [], extra = {}) => createNode({ id, name: id, task: id, children, ...extra });
// root -> a -> a1, a2 ; root -> b -> b1 ; root -> c
const doc = (extra = {}) => ({
  id: "p", name: "p", goal: "", unit: "usd", createdAt: "2026-10-21T00:00:00.000Z", updatedAt: "2026-10-21T00:00:00.000Z",
  root: node("root", [node("a", [node("a1"), node("a2")]), node("b", [node("b1")]), node("c")]), ...extra,
});

test("a link back to a block that came before is a loop; any other link means waiting", () => {
  const d = doc();
  assert.deepEqual(pathToRoot(d.root, "a2"), ["a2", "a", "root"]);
  assert.equal(linkKind(d.root, { from: "a2", to: "root" }), "loop", "back to the first block");
  assert.equal(linkKind(d.root, { from: "a2", to: "a" }), "loop", "back to the block it hangs under");
  assert.equal(linkKind(d.root, { from: "a1", to: "b1" }), "needs", "across branches");
  assert.equal(linkKind(d.root, { from: "c", to: "a" }), "needs");
});

test("connecting blocks: any block to any other, with a reason when it is not allowed", () => {
  const d = doc();
  assert.deepEqual(checkLink(d, "a2", "root"), { ok: true, kind: "loop" });
  assert.deepEqual(checkLink(d, "b1", "a1"), { ok: true, kind: "needs" });
  assert.equal(checkLink(d, "a", "a").ok, false);
  assert.match(checkLink(d, "a", "a").reason, /itself/);
  assert.match(checkLink(d, "root", "a").reason, /already a sub-block/);
  assert.match(checkLink(d, "a", "ghost").reason, /not on the map/);
  assert.match(checkLink(d, "root", "a1").reason, /already part of|sub-block/, "a block below is already reached through the tree");
  const withLoop = addLink(d, "a2", "root", 3);
  assert.equal(withLoop.links.length, 1);
  assert.equal(withLoop.links[0].rounds, 3);
  assert.match(checkLink(withLoop, "a2", "a").reason, /already loops back/, "one loop out of a block");
  assert.match(checkLink(withLoop, "a2", "root").reason, /already connected/);
  assert.equal(addLink(withLoop, "a2", "a"), withLoop, "a refused connection returns the same document");
});

test("waiting links never make two blocks wait for each other", () => {
  let d = addLink(doc(), "a", "b");
  assert.equal(d.links.length, 1);
  assert.equal(d.links[0].rounds, undefined, "only loops have rounds");
  assert.match(checkLink(d, "b", "a").reason, /wait for each other/);
  assert.match(checkLink(d, "b1", "a1").reason ?? "", /wait for each other/, "a block under b waits for b, which waits for a");
  d = addLink(d, "c", "a");
  assert.equal(d.links.length, 2);
  assert.match(checkLink(d, "b", "c").reason, /wait for each other/, "c -> a -> b makes b -> c a cycle");
  assert.deepEqual(waitsFor(d, "b"), ["a"]);
});

test("a sequence is a chain of waiting too: a later block cannot be waited for by an earlier one", () => {
  const d = doc({ root: node("root", [node("x"), node("y"), node("z")], { mode: "sequence" }) });
  assert.match(checkLink(d, "z", "x").reason, /wait for each other/);
  assert.equal(checkLink(d, "x", "z").ok, true, "forward is fine");
});

test("rounds are limited to 2..10 and only loops have them", () => {
  const d = addLink(doc(), "a2", "root", 50);
  assert.equal(d.links[0].rounds, LIMITS.rounds);
  assert.equal(updateLink(d, d.links[0].id, { rounds: 1 }).links[0].rounds, 2);
  assert.equal(updateLink(d, d.links[0].id, { rounds: 4 }).links[0].rounds, 4);
  const waiting = addLink(doc(), "a", "b");
  assert.equal(updateLink(waiting, waiting.links[0].id, { rounds: 5 }).links[0].rounds, undefined);
  assert.equal(updateLink(d, d.links[0].id, { label: "until it ships" }).links[0].label, "until it ships");
  assert.equal(updateLink(updateLink(d, d.links[0].id, { label: "x" }), d.links[0].id, { label: "  " }).links[0].label, undefined);
  assert.equal(loopFrom(d, "a2").to, "root");
  assert.equal(loopFrom(d, "a1"), undefined);
});

test("removing a connection, and a block takes its connections with it", () => {
  let d = addLink(addLink(doc(), "a2", "root"), "b", "c");
  const id = d.links[1].id;
  assert.equal(removeLink(d, id).links.length, 1);
  assert.equal(removeLink(removeLink(d, id), d.links[0].id).links, undefined, "no links field when there are none");
  assert.equal(removeLink(d, "nope"), d);
  const gone = pruneLinks({ ...d, root: removeNode(d.root, "a") });
  assert.deepEqual(gone.links.map(link => [link.from, link.to]), [["b", "c"]], "the loop from a2 went with a2");
  assert.equal(pruneLinks(d), d, "nothing to drop returns the same document");
});

test("moving a block under another can make a connection invalid; pruning drops it, and a waiting link that became a loop gets rounds", () => {
  let d = addLink(doc(), "c", "a1");
  assert.equal(d.links[0].rounds, undefined);
  // a1 moves under c: c -> a1 is now a link to a block c already holds
  const moved = pruneLinks({ ...d, root: reparentNode(d.root, "a1", "c") });
  assert.equal(moved.links, undefined);
  d = addLink(doc(), "b1", "a");
  const flipped = pruneLinks({ ...d, root: reparentNode(d.root, "b", "a1") });
  assert.equal(flipped.links.length, 1);
  assert.equal(flipped.links[0].rounds, 2, "a1 -> ... b1 -> a is now a loop back to an ancestor and gets the default rounds");
});

test("a saved document keeps its connections; broken ones are dropped", () => {
  const d = addLink(addLink(doc(), "a2", "root", 3), "b", "c");
  const normalized = normalizeProcess(JSON.parse(JSON.stringify(d)));
  assert.equal(normalized.links.length, 2);
  assert.equal(normalized.links[0].rounds, 3);
  const dirty = normalizeProcess({ ...JSON.parse(JSON.stringify(doc())), links: [
    { id: "ok", from: "a", to: "b" }, { id: "ok", from: "c", to: "b" }, { id: "x", from: "ghost", to: "b" }, { id: "y", from: "a", to: "a" },
    { id: "z", from: "b", to: "a" }, "text", null, { from: 5, to: "b" }, { id: "rounds", from: "a1", to: "root", rounds: 99, label: " go " },
  ] });
  assert.deepEqual(dirty.links.map(link => [link.from, link.to]), [["a", "b"], ["c", "b"], ["a1", "root"]], "self, missing, cyclic and malformed links are dropped");
  assert.equal(new Set(dirty.links.map(link => link.id)).size, 3, "ids are unique");
  assert.equal(dirty.links[2].rounds, LIMITS.rounds);
  assert.equal(dirty.links[2].label, "go");
  const library = normalizeLibrary({ version: 1, activeId: "p", processes: [d] });
  assert.equal(library.processes[0].links.length, 2);
  assert.equal(normalizeProcess(JSON.parse(JSON.stringify(doc()))).links, undefined);
});

test("a copy of a process from a template keeps its connections between the new ids", () => {
  const d = addLink(doc(), "a2", "root");
  const copy = instantiate(d);
  assert.equal(copy.links.length, 1);
  assert.notEqual(copy.links[0].id, d.links[0].id);
  assert.notEqual(copy.links[0].from, "a2");
  assert.equal(linkKind(copy.root, copy.links[0]), "loop");
  assert.equal(instantiate(createSampleProcess()).links, undefined);
});

test("the closed-loop template is a valid plan: every connection is allowed, one loop closes it and a person approves the deploy", async () => {
  const { templates } = await import("./process-model.ts");
  const { replay, startLog } = await import("./run-model.ts");
  const loop = templates.find(item => item.id === "loop").create(new Date("2026-10-21T09:00:00Z"));
  const normalized = normalizeProcess(JSON.parse(JSON.stringify(loop)));
  assert.equal(normalized.links.length, loop.links.length, "no connection of the template is dropped");
  assert.deepEqual(normalized.links.filter(link => linkKind(normalized.root, link) === "loop").map(link => link.id).sort(), ["loop-fix-again", "loop-next-round"]);
  const names = [];
  const walk = item => { names.push(item.name); item.children.forEach(walk); };
  walk(loop.root);
  for (const role of ["Coordinator", "Planner", "Creator", "Coder", "QA", "Reviewer", "Fixer", "Deployer"]) assert.ok(names.includes(role), role);
  assert.equal(findNodeById(loop.root, "loop-deployer").approval, true);
  // played: the deploy asks, and after the person approves the loop goes round once more and asks again
  const T0 = 5_000_000;
  let log = startLog(loop.root, loop.id, loop.unit, T0, "r", loop.links);
  let snapshot = replay(log, T0 + 40_000);
  assert.equal(snapshot.nodes["loop-deployer"].status, "waiting", "the deployer waits for the reviewer, then for the person");
  assert.ok(["done", "waiting", "running"].includes(snapshot.nodes["loop-reviewer"].status));
  assert.ok(snapshot.nodes["loop-reviewer"].started >= snapshot.nodes["loop-qa"].ended, "the reviewer waited for QA");
  assert.ok(snapshot.nodes["loop-creator"].started >= snapshot.nodes["loop-planner"].ended, "the creator waited for the planner");
  const { applyAction } = await import("./run-model.ts");
  log = applyAction(log, { type: "approve", id: "loop-deployer" }, T0 + 40_000);
  assert.ok(log);
  snapshot = replay(log, T0 + 200_000);
  assert.equal(snapshot.nodes["loop-deployer"].round, 2, "the second round of the loop reached the deployer");
  assert.equal(snapshot.nodes["loop-deployer"].status, "waiting", "and it asks again");
  assert.equal(snapshot.nodes["loop-qa"].of >= 2, true);
  assert.equal(snapshot.state, "waiting");
});
const findNodeById = (root, id) => { if (root.id === id) return root; for (const child of root.children) { const found = findNodeById(child, id); if (found) return found; } return null; };
