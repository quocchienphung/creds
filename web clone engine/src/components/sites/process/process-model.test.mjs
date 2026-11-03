import { test } from "node:test";
import assert from "node:assert/strict";
import { LIMITS, addChild, clearPositions, setPosition, costFormatter, countNodes, createBlankProcess, createLibrary, createLocalProcess, createNode, createSampleProcess, depthOfNode, duplicateNode, findNode, flattenNodes, instantiate, markOf, moveNode, normalizeLibrary, normalizeProcess, parentNode, removeNode, reparentNode, updateNode, validParents } from "./process-model.ts";

const sample = () => createSampleProcess(new Date("2026-10-21T09:00:00Z"));

test("the sample and the local template are valid and use the provider kinds the page offers", () => {
  const doc = sample();
  assert.equal(countNodes(doc.root), 9);
  assert.deepEqual(flattenNodes(doc.root).map(node => node.id), ["launch", "planner", "research", "scraper", "analyst", "writer", "coder", "tester", "fixer"]);
  assert.deepEqual(flattenNodes(doc.root).map(node => node.role), ["coordinator", "planner", "helper", "processor", "processor", "instructor", "coder", "helper", "fixer"]);
  assert.notEqual(normalizeLibrary(createLibrary([doc, createLocalProcess()])), null);
  const local = createLocalProcess();
  assert.deepEqual(flattenNodes(local.root).map(node => node.ai.provider), ["hermes", "ollama", "ollama", "human"]);
  assert.equal(markOf("human"), undefined);
  assert.equal(markOf("ollama"), "ollama");
});

test("tree edits are immutable and leave untouched branches as the same objects", () => {
  const doc = sample();
  const before = doc.root;
  const renamed = updateNode(before, "writer", node => ({ ...node, name: "Copywriter" }));
  assert.equal(findNode(renamed, "writer").name, "Copywriter");
  assert.equal(findNode(before, "writer").name, "Writer");
  assert.equal(renamed.children[0], before.children[0]);
  assert.equal(updateNode(before, "missing", node => ({ ...node, name: "x" })), before);
});

test("adding, duplicating, removing and moving tasks", () => {
  const { root } = sample();
  const added = addChild(root, "writer", createNode({ id: "proof", name: "Proofreader" }));
  assert.equal(parentNode(added, "proof").id, "writer");
  assert.equal(addChild(root, "nope", createNode()), root);
  const { root: copied, copyId } = duplicateNode(root, "research");
  assert.equal(countNodes(copied), countNodes(root) + 3);
  assert.equal(findNode(copied, copyId).name, "Researcher (copy)");
  assert.equal(parentNode(copied, copyId).id, "launch");
  assert.equal(parentNode(copied, "launch"), undefined);
  assert.equal(new Set(flattenNodes(copied).map(node => node.id)).size, countNodes(copied));
  assert.equal(duplicateNode(root, "launch").copyId, null, "the root has no place for a copy");
  const removed = removeNode(root, "research");
  assert.equal(countNodes(removed), 6);
  assert.equal(removeNode(root, "launch"), root);
  assert.deepEqual(moveNode(root, "writer", -1).children.map(node => node.id), ["planner", "writer", "research", "coder"]);
  assert.equal(moveNode(root, "planner", -1), root);
  assert.equal(moveNode(root, "coder", 1), root);
  assert.equal(moveNode(root, "launch", 1), root);
});

test("a task can move under another one, but never under itself or its own sub-tasks", () => {
  const { root } = sample();
  const moved = reparentNode(root, "writer", "analyst");
  assert.equal(parentNode(moved, "writer").id, "analyst");
  assert.equal(countNodes(moved), countNodes(root));
  assert.equal(reparentNode(root, "research", "scraper"), root);
  assert.equal(reparentNode(root, "research", "research"), root);
  assert.equal(reparentNode(root, "launch", "writer"), root);
  assert.equal(reparentNode(root, "writer", "launch"), root, "already there");
  assert.deepEqual(validParents(root, "research").map(node => node.id), ["launch", "planner", "writer", "coder", "tester", "fixer"]);
  assert.deepEqual(validParents(root, "launch"), []);
});

test("depth and size limits refuse an edit and return the same tree", () => {
  let root = createNode({ id: "r" });
  let last = "r";
  for (let level = 1; level < LIMITS.depth; level += 1) { root = addChild(root, last, createNode({ id: `d${level}` })); last = `d${level}`; }
  assert.equal(depthOfNode(root, last), LIMITS.depth - 1);
  assert.equal(addChild(root, last, createNode({ id: "too-deep" })), root);
  let wide = createNode({ id: "w" });
  for (let index = 1; index < LIMITS.nodes; index += 1) wide = addChild(wide, "w", createNode({ id: `c${index}` }));
  assert.equal(countNodes(wide), LIMITS.nodes);
  assert.equal(addChild(wide, "w", createNode({ id: "one-more" })), wide);
});

test("untrusted data is clamped, de-duplicated and rejected when it is not a library", () => {
  assert.equal(normalizeLibrary(null), null);
  assert.equal(normalizeLibrary({ version: 2, processes: [] }), null);
  assert.equal(normalizeLibrary({ version: 1, processes: [{ id: "a", root: "nope" }] }), null);
  assert.equal(normalizeProcess([]), null);
  const messy = normalizeProcess({
    id: "p", name: "x".repeat(500), unit: "euros", goal: 7, createdAt: "not a date",
    root: { id: "r", name: "Root", task: "t", ai: { provider: "skynet", model: 4, instructions: "i".repeat(9000) }, tools: ["notion", "notion", "nope", "github"], mode: "weird", limit: -3, sim: { durationMs: 5, cost: -2, failOnce: "yes" },
      children: [{ id: "r", name: "Twin" }, 5, { id: "ok", approval: true, askText: "Ready?", limit: 2.5, children: [] }] },
  });
  assert.equal(messy.name.length, LIMITS.name);
  assert.equal(messy.unit, "usd");
  assert.equal(messy.goal, "");
  assert.equal(Number.isNaN(Date.parse(messy.createdAt)), false);
  assert.equal(messy.root.ai.provider, "anthropic");
  assert.equal(messy.root.ai.model, "");
  assert.equal(messy.root.ai.instructions.length, LIMITS.instructions);
  assert.deepEqual(messy.root.tools, ["notion", "github"]);
  assert.equal(messy.root.mode, "parallel");
  assert.equal(messy.root.limit, undefined);
  assert.deepEqual(messy.root.sim, { durationMs: 200, cost: 0 });
  assert.equal(messy.root.children.length, 2);
  assert.notEqual(messy.root.children[0].id, "r", "a repeated id gets a new one");
  assert.deepEqual([messy.root.children[1].approval, messy.root.children[1].askText, messy.root.children[1].limit], [true, "Ready?", 2.5]);
});

test("normalizing keeps a valid library intact and repairs the active id", () => {
  const library = createLibrary([sample()]);
  const again = normalizeLibrary(JSON.parse(JSON.stringify(library)));
  assert.deepEqual(again.processes[0].root, library.processes[0].root);
  assert.equal(normalizeLibrary({ ...library, activeId: "gone" }).activeId, "proc-launch");
  const twice = normalizeLibrary({ version: 1, activeId: "", processes: [sample(), sample()] });
  assert.equal(new Set(twice.processes.map(doc => doc.id)).size, 2);
});

test("templates become new processes with fresh ids", () => {
  const copy = instantiate(sample());
  assert.notEqual(copy.id, "proc-launch");
  assert.equal(flattenNodes(copy.root).some(node => node.id === "writer"), false);
  assert.equal(countNodes(copy.root), 9);
  assert.equal(copy.root.children[2].approval, true);
  assert.equal(createBlankProcess("Mine").name, "Mine");
});

test("cost formatting per unit", () => {
  assert.equal(costFormatter("usd")(0.5), "$0.50");
  assert.equal(costFormatter("credits")(3.25), "3.3 cr");
  assert.equal(costFormatter("credits")(12), "12 cr");
  assert.equal(costFormatter("tokens")(950), "950 tok");
  assert.equal(costFormatter("tokens")(12_400), "12.4K tok");
});

test("roles and positions are part of a block and survive a save", () => {
  const doc = sample();
  assert.equal(findNode(doc.root, "fixer").role, "fixer");
  assert.equal(createNode().role, "custom");
  const pinned = setPosition(doc.root, "coder", { x: -420, y: 130 });
  assert.deepEqual(findNode(pinned, "coder").pos, { x: -420, y: 130 });
  assert.equal(setPosition(pinned, "coder", { x: -420, y: 130 }), pinned, "the same place is not a change");
  assert.equal(findNode(doc.root, "coder").pos, undefined, "the original is not changed");
  const again = normalizeProcess(JSON.parse(JSON.stringify({ ...doc, root: pinned })));
  assert.deepEqual(findNode(again.root, "coder").pos, { x: -420, y: 130 });
  assert.equal(findNode(again.root, "coder").role, "coder");
  assert.equal(findNode(clearPositions(pinned), "coder").pos, undefined);
  const odd = normalizeProcess({ id: "p", root: { id: "r", role: "overlord", pos: { x: 1e9, y: "no" }, children: [{ id: "a", role: "reverter", pos: { x: -1e9, y: 12.6 } }] } });
  assert.equal(odd.root.role, "custom");
  assert.equal(odd.root.pos, undefined, "half a position is no position");
  assert.deepEqual(odd.root.children[0].pos, { x: -50_000, y: 13 });
  assert.equal(odd.root.children[0].role, "reverter");
});
