import { test } from "node:test";
import assert from "node:assert/strict";
import { addLink, countNodes, createNode, findNode, flattenNodes, pruneLinks, removeNodes } from "./process-model.ts";

const node = (id, children = []) => createNode({ id, name: id, task: id, children });
// root -> a -> (a1, a2) ; root -> b -> b1 ; root -> c
const root = () => node("root", [node("a", [node("a1"), node("a2")]), node("b", [node("b1")]), node("c")]);

test("several blocks are removed at once, each with what hangs under it", () => {
  const next = removeNodes(root(), ["a1", "b", "c"]);
  assert.deepEqual(flattenNodes(next).map(item => item.id), ["root", "a", "a2"]);
  assert.equal(countNodes(next), 3);
});

test("a block that went with its parent does not matter, a missing id is ignored, and the first block is never removed", () => {
  assert.deepEqual(flattenNodes(removeNodes(root(), ["a", "a1", "ghost"])).map(item => item.id), ["root", "b", "b1", "c"]);
  const keep = removeNodes(root(), ["root"]);
  assert.equal(findNode(keep, "a").id, "a");
  assert.equal(countNodes(keep), 7);
  const same = root();
  assert.equal(removeNodes(same, []), same, "nothing to remove gives the same tree back");
  assert.equal(removeNodes(same, ["ghost"]), same);
});

test("connections of removed blocks go with them when the document is pruned", () => {
  const doc = { id: "p", name: "p", goal: "", unit: "usd", createdAt: "", updatedAt: "", root: root() };
  const linked = addLink(addLink(doc, "a2", "root"), "b", "c");
  assert.equal(linked.links.length, 2);
  const pruned = pruneLinks({ ...linked, root: removeNodes(linked.root, ["a", "c"]) });
  assert.equal(pruned.links, undefined, "the loop from a2 and the wait for c are both gone");
  const half = pruneLinks({ ...linked, root: removeNodes(linked.root, ["a"]) });
  assert.deepEqual(half.links.map(link => [link.from, link.to]), [["b", "c"]]);
});
