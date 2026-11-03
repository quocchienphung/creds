import { test } from "node:test";
import assert from "node:assert/strict";
import { BLOCK, GAP, anchorOf, blockAt, boundsOf, boxOf, clampScale, edgeBetween, facingSide, fitView, freeSpot, layoutMap, zoomAt } from "./map-layout.ts";
import { createNode, createSampleProcess, flattenNodes, setPosition, clearPositions, addChild } from "./process-model.ts";

const sample = () => createSampleProcess(new Date("2026-10-21T09:00:00Z")).root;
const boxes = (root, centers) => flattenNodes(root).map(node => ({ id: node.id, ...boxOf(centers.get(node.id), BLOCK) }));
const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

test("the first block is in the middle and every other block has its own place", () => {
  const root = sample();
  const centers = layoutMap(root);
  assert.deepEqual(centers.get("launch"), { x: 0, y: 0 });
  assert.equal(centers.size, 9);
  const list = boxes(root, centers);
  for (let i = 0; i < list.length; i += 1) for (let j = i + 1; j < list.length; j += 1) assert.equal(overlaps(list[i], list[j]), false, `${list[i].id} overlaps ${list[j].id}`);
});

test("the branches fan out around the middle: the first goes up, then clockwise, each taking a slice as wide as its blocks", () => {
  const centers = layoutMap(sample());
  const [planner, research, writer, coder] = ["planner", "research", "writer", "coder"].map(id => centers.get(id));
  assert.ok(planner.y < 0 && Math.abs(planner.x) < 200, "top");
  assert.ok(research.x > 0, "right");
  assert.ok(writer.y > 0, "bottom");
  assert.ok(coder.x < 0, "left");
  const distance = point => Math.round(Math.hypot(point.x / 1.25, point.y / 0.84));
  assert.ok(Math.abs(planner.y) >= 220, "the first ring is clear of the middle block");
  assert.ok(distance(planner) >= 290 - 2);
  // grandchildren sit further out than their parent, on the same side
  assert.ok(Math.hypot(centers.get("scraper").x, centers.get("scraper").y) > distance(research));
  assert.ok(centers.get("scraper").x > 0 && centers.get("analyst").x > 0);
  assert.ok(centers.get("tester").x < 0 && centers.get("fixer").x < 0);
});

test("one branch goes to the right and two go left and right", () => {
  const one = { ...createNode({ id: "r" }), children: [createNode({ id: "a" })] };
  assert.ok(layoutMap(one).get("a").x > 0 && Math.abs(layoutMap(one).get("a").y) < 5);
  const two = { ...one, children: [createNode({ id: "a" }), createNode({ id: "b" })] };
  const centers = layoutMap(two);
  assert.ok(centers.get("a").x > 0 && centers.get("b").x < 0);
});

test("the layout is the same every time and does not change the plan", () => {
  const root = sample();
  const before = JSON.stringify(root);
  assert.deepEqual([...layoutMap(root)], [...layoutMap(root)]);
  assert.equal(JSON.stringify(root), before);
});

test("a block the person placed keeps its place and the others make way for it", () => {
  const root = sample();
  const auto = layoutMap(root);
  const dragged = setPosition(root, "planner", { x: auto.get("research").x, y: auto.get("research").y });
  const centers = layoutMap(dragged);
  assert.deepEqual(centers.get("planner"), auto.get("research"));
  const list = boxes(dragged, centers);
  const planner = list.find(item => item.id === "planner");
  for (const other of list.filter(item => item.id !== "planner")) assert.equal(overlaps(planner, other), false, `${other.id} was not moved off the dragged block`);
  assert.deepEqual([...layoutMap(clearPositions(dragged))], [...auto]);
  assert.equal(clearPositions(root), root, "nothing pinned, nothing to clear");
});

test("measured sizes are used; a tall block pushes its neighbours away", () => {
  const root = sample();
  const sizes = new Map(flattenNodes(root).map(node => [node.id, { w: BLOCK.w, h: 300 }]));
  const centers = layoutMap(root, sizes);
  const list = flattenNodes(root).map(node => ({ id: node.id, ...boxOf(centers.get(node.id), sizes.get(node.id)) }));
  for (let i = 0; i < list.length; i += 1) for (let j = i + 1; j < list.length; j += 1) assert.equal(overlaps(list[i], list[j]), false);
});

test("a wide plan with many blocks in one branch still has no overlaps", () => {
  let root = createNode({ id: "r" });
  for (let index = 0; index < 12; index += 1) root = addChild(root, "r", createNode({ id: `c${index}` }));
  for (let index = 0; index < 6; index += 1) root = addChild(root, "c3", createNode({ id: `g${index}` }));
  const centers = layoutMap(root);
  const list = boxes(root, centers);
  for (let i = 0; i < list.length; i += 1) for (let j = i + 1; j < list.length; j += 1) assert.equal(overlaps(list[i], list[j]), false, `${list[i].id}/${list[j].id}`);
});

test("edges leave the side that faces the other block and arrive on the side that faces back", () => {
  const a = { x: 0, y: 0, w: 200, h: 100 };
  assert.equal(facingSide(a, { x: 500, y: 0, w: 200, h: 100 }), "right");
  assert.equal(facingSide(a, { x: -500, y: 20, w: 200, h: 100 }), "left");
  assert.equal(facingSide(a, { x: 0, y: 400, w: 200, h: 100 }), "bottom");
  assert.equal(facingSide(a, { x: 20, y: -400, w: 200, h: 100 }), "top");
  const edge = edgeBetween(a, { x: 500, y: 0, w: 200, h: 100 });
  assert.deepEqual([edge.fromSide, edge.toSide], ["right", "left"]);
  assert.deepEqual([edge.from, edge.to], [{ x: 200, y: 50 }, { x: 500, y: 50 }]);
  assert.match(edge.d, /^M 200 50 C /);
  assert.ok(edge.length > 0);
});

test("fitting shows every block, never zoomed in past 1, and zooming keeps the point under the pointer", () => {
  const list = [{ x: -400, y: -300, w: 232, h: 132 }, { x: 600, y: 400, w: 232, h: 132 }];
  const view = fitView(list, { w: 1000, h: 700 });
  const bounds = boundsOf(list);
  assert.ok(view.scale < 1 && view.scale >= 0.25);
  assert.ok(bounds.x * view.scale + view.x >= 0 && (bounds.x + bounds.w) * view.scale + view.x <= 1000);
  assert.ok(bounds.y * view.scale + view.y >= 0 && (bounds.y + bounds.h) * view.scale + view.y <= 700);
  assert.equal(fitView([{ x: 0, y: 0, w: 100, h: 100 }], { w: 1000, h: 700 }).scale, 1);
  const inset = fitView(list, { w: 1000, h: 700 }, 48, { right: 340 });
  assert.ok((bounds.x + bounds.w) * inset.scale + inset.x <= 1000 - 340);
  const zoomed = zoomAt({ x: 10, y: 20, scale: 1 }, 2, { x: 300, y: 200 });
  assert.deepEqual([zoomed.scale, (300 - zoomed.x) / zoomed.scale, (200 - zoomed.y) / zoomed.scale], [2, 290, 180]);
  assert.equal(clampScale(10), 2);
  assert.equal(clampScale(0.01), 0.25);
});

test("a new block goes next to its parent on the chosen side and steps away from blocks that are there", () => {
  const parent = { x: 0, y: 0, w: BLOCK.w, h: BLOCK.h };
  const first = freeSpot([parent], parent, "right");
  assert.ok(first.x > parent.w / 2 && first.y === parent.h / 2);
  const second = freeSpot([parent, boxOf(first, BLOCK)], parent, "right");
  assert.notDeepEqual(second, first);
  assert.ok(!(Math.abs(second.x - first.x) < BLOCK.w + GAP / 2 && Math.abs(second.y - first.y) < BLOCK.h + GAP / 2));
  assert.ok(freeSpot([parent], parent, "left").x < 0);
  assert.ok(freeSpot([parent], parent, "top").y < 0);
  assert.ok(freeSpot([parent], parent, "bottom").y > parent.h);
});

test("a tall screen gets rings taller than wide, and fitView never goes below its floor", () => {
  const root = sample();
  const wide = layoutMap(root), tall = layoutMap(root, new Map(), "tall");
  const span = centers => { const xs = [...centers.values()].map(p => p.x), ys = [...centers.values()].map(p => p.y); return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }; };
  assert.ok(span(tall).h > span(tall).w, "tall map is taller than wide");
  assert.ok(span(wide).w > span(wide).h, "wide map is wider than tall");
  const boxes = [...tall.values()].map(point => boxOf(point, BLOCK));
  assert.ok(fitView(boxes, { w: 390, h: 700 }, 56, {}, 0.55).scale >= 0.55);
});

test("a bent edge leaves the same sides and bulges to the right of its way; its middle is where a label can sit", () => {
  const a = { x: 0, y: 0, w: 200, h: 100 }, b = { x: 500, y: 0, w: 200, h: 100 };
  const straight = edgeBetween(a, b), right = edgeBetween(a, b, 60), left = edgeBetween(a, b, -60);
  assert.deepEqual([right.from, right.to, right.fromSide, right.toSide], [straight.from, straight.to, straight.fromSide, straight.toSide]);
  assert.equal(straight.mid.y, straight.from.y, "a level straight edge has its middle level");
  assert.ok(right.mid.y > straight.mid.y, "bending right of an eastward edge goes south");
  assert.ok(left.mid.y < straight.mid.y);
  assert.ok(Math.abs(right.mid.y - straight.mid.y - 45) < 3, "the middle moves by three quarters of the bend");
  const down = edgeBetween({ x: 0, y: 0, w: 200, h: 100 }, { x: 0, y: 400, w: 200, h: 100 }, 60);
  assert.ok(down.mid.x < 0 + 100, "bending right of a southward edge goes west");
});

test("anchors sit exactly on the sides of the box, and blockAt finds the block under a point", () => {
  const box = { x: 100, y: 50, w: 232, h: 96 };
  assert.deepEqual(anchorOf(box, "bottom"), { x: 216, y: 146 });
  assert.deepEqual(anchorOf(box, "right"), { x: 332, y: 98 });
  const edge = edgeBetween(box, { x: 100, y: 400, w: 232, h: 96 });
  assert.deepEqual(edge.from, { x: 216, y: 146 }, "the edge leaves at the bottom side of the block, with no gap");
  assert.deepEqual(edge.to, { x: 216, y: 400 });
  const boxes = new Map([["a", box], ["b", { x: 150, y: 80, w: 100, h: 100 }]]);
  assert.equal(blockAt({ x: 160, y: 100 }, boxes), "b", "the later block is on top");
  assert.equal(blockAt({ x: 160, y: 100 }, boxes, "b"), "a");
  assert.equal(blockAt({ x: 900, y: 900 }, boxes), null);
});
