import { test } from "node:test";
import assert from "node:assert/strict";
import { addedIds, agentsWith, branchCost, branchIds, branchLive, busyMs, depthOf, dollars, durationLabel, findAgent, flatten, goneNodes, isMuted, parentOf, totalsOf, visibleTree, withGhosts } from "./tree-model.ts";

const leaf = (id, status, extra = {}) => ({ id, name: id, task: `task ${id}`, status, ...extra });
const tree = {
  ...leaf("root", "running", { cost: 0.1, started: 1000 }),
  children: [
    { ...leaf("research", "done", { cost: 0.29, started: 1000, ended: 46_000 }), children: [leaf("scrape", "done", { cost: 0.03 }), leaf("analyze", "failed", { cost: 0.08, error: "rate limit" })] },
    leaf("write", "waiting", { cost: 0.12, started: 5000, ask: "Formal or friendly?" }),
    { ...leaf("code", "running", { cost: 0.2, started: 2000 }), children: [leaf("test", "queued")] },
  ],
};

test("a card with children shows the whole branch and the bar adds everything up once", () => {
  assert.equal(branchCost(findAgent(tree, "research")).toFixed(2), "0.40");
  assert.equal(branchCost(tree).toFixed(2), "0.82");
  assert.deepEqual({ ...totalsOf(tree), cost: Number(totalsOf(tree).cost.toFixed(2)) }, { agents: 7, running: 2, waiting: 1, failed: 1, cost: 0.82, live: true });
  assert.equal(branchLive(findAgent(tree, "research")), false);
  assert.equal(branchLive(findAgent(tree, "code")), true);
});

test("the windows list waiting and failed agents in tree order", () => {
  assert.deepEqual(agentsWith(tree, "waiting").map(agent => agent.id), ["write"]);
  assert.deepEqual(agentsWith(tree, "failed").map(agent => agent.id), ["analyze"]);
});

test("running and waiting agents count up to now, finished ones stop", () => {
  assert.equal(busyMs(tree, 9000), 8000);
  assert.equal(busyMs(findAgent(tree, "write"), 9000), 4000);
  assert.equal(busyMs(findAgent(tree, "research"), 99_000), 45_000);
  assert.equal(busyMs(findAgent(tree, "test"), 9000), undefined);
  assert.equal(busyMs(findAgent(tree, "scrape"), 9000), undefined);
});

test("labels", () => {
  assert.deepEqual([4000, 45_000, 65_000, 725_000, 3_720_000].map(durationLabel), ["4s", "45s", "1m 05s", "12m 05s", "1h 02m"]);
  assert.equal(dollars(1.496), "$1.50");
  assert.equal(dollars(0), "$0.00");
  assert.equal(isMuted("queued") && isMuted("stopped"), true);
  assert.equal(isMuted("idle") || isMuted("running"), false);
});

test("folding keeps the agent and drops what is below it; branch ids ignore leaves", () => {
  const folded = visibleTree(tree, new Set(["research", "code"]));
  assert.deepEqual(flatten(folded).map(agent => agent.id), ["root", "research", "write", "code"]);
  assert.equal(findAgent(folded, "research").children.length, 0);
  assert.deepEqual(flatten(visibleTree(tree, new Set())).map(agent => agent.id), flatten(tree).map(agent => agent.id));
  assert.equal(tree.children[0].children.length, 2, "the input tree is not changed");
  assert.deepEqual(branchIds(tree), ["root", "research", "code"]);
  assert.equal(depthOf(tree, "analyze"), 2);
  assert.equal(depthOf(tree, "nope"), -1);
  assert.equal(parentOf(tree, "scrape").id, "research");
  assert.equal(parentOf(tree, "root"), undefined);
});

test("agents that leave are remembered with their place and can be put back, flagged", () => {
  const next = visibleTree(tree, new Set(["research"]));
  const ghosts = goneNodes(tree, next);
  assert.deepEqual(ghosts.map(ghost => [ghost.parentId, ghost.index, ghost.agent.id]), [["research", 0, "scrape"], ["research", 1, "analyze"]]);
  const leaving = new Set();
  const merged = withGhosts(next, ghosts, leaving);
  assert.deepEqual([...leaving].sort(), ["analyze", "scrape"]);
  assert.deepEqual(flatten(merged).map(agent => agent.id), flatten(tree).map(agent => agent.id));
  const removed = { ...tree, children: tree.children.filter(child => child.id !== "write") };
  const more = new Set();
  const again = withGhosts(removed, goneNodes(tree, removed), more);
  assert.deepEqual(again.children.map(child => child.id), ["research", "write", "code"]);
  assert.deepEqual([...more], ["write"]);
  assert.deepEqual(goneNodes(tree, tree), []);
  assert.deepEqual(goneNodes(undefined, tree), []);
  // a ghost shows the newest data of the tree around it, not a stale copy of it
  const changed = { ...removed, cost: 9 };
  assert.equal(withGhosts(changed, goneNodes(tree, removed), new Set()).cost, 9);
});

test("new agents are the ids not seen before", () => {
  assert.deepEqual(addedIds(new Set(["root", "write"]), flatten(tree)), ["research", "scrape", "analyze", "code", "test"]);
});
