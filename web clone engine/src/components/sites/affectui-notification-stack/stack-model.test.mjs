import { test } from "node:test";
import assert from "node:assert/strict";
import { announcement, depthCss, depthTransform, drawn, enqueue, stackHeight } from "./stack-model.ts";

const notice = (id, extra = {}) => ({ id, badge: "Done", title: `Notice ${id}`, ...extra });

test("cards sit behind each other: 12 px lower and 5% smaller each, three visible, the rest where the third is", () => {
  assert.deepEqual([0, 1, 2, 3, 7].map(depthTransform), [{ y: 0, scale: 1 }, { y: 12, scale: 0.95 }, { y: 24, scale: 0.9 }, { y: 24, scale: 0.9 }, { y: 24, scale: 0.9 }]);
  assert.equal(depthCss(1), "translateY(12px) scale(0.95)");
});

test("the stack is as tall as its front card plus the strips that show behind it", () => {
  assert.equal(stackHeight(170, 1), 170);
  assert.equal(stackHeight(170, 2), 182);
  assert.equal(stackHeight(170, 3), 194, "the observed demo: a 170 px card with two behind it is 194 px");
  assert.equal(stackHeight(170, 9), 194);
  assert.equal(stackHeight(170, 0), 170);
});

test("a dismissed card is drawn leaving, once, and not at all when it is back", () => {
  const a = notice("a"), b = notice("b");
  assert.deepEqual(drawn([b], [a]).map(item => [item.notice.id, item.depth, item.leaving]), [["b", 0, false], ["a", 0, true]]);
  assert.deepEqual(drawn([a, b], [a]).map(item => [item.notice.id, item.leaving]), [["a", false], ["b", false]]);
});

test("new notices go in front; failures and ones that need the person go before the quiet ones; the oldest quiet ones are dropped first", () => {
  const quiet = id => notice(id), loud = id => notice(id, { tone: "error" });
  assert.deepEqual(enqueue([quiet("a")], [quiet("b")]).map(item => item.id), ["b", "a"]);
  assert.deepEqual(enqueue([quiet("a")], [loud("e")]).map(item => item.id), ["e", "a"]);
  assert.deepEqual(enqueue([loud("e1"), quiet("a")], [quiet("b"), loud("e2")]).map(item => item.id), ["e2", "e1", "b", "a"]);
  assert.deepEqual(enqueue([quiet("a")], [quiet("a")]).map(item => item.id), ["a"], "the same id is not added twice");
  const many = Array.from({ length: 14 }, (_, index) => quiet(`q${index}`));
  const capped = enqueue([], many, 6);
  assert.equal(capped.length, 6);
  const withError = enqueue([loud("e")], many, 4);
  assert.ok(withError.some(item => item.id === "e"), "an error is not dropped for quiet ones");
  assert.equal(withError.length, 4);
});

test("a card is announced with its badge, title and text", () => {
  assert.equal(announcement(notice("a", { badge: "Failed", title: "Tester failed", text: "Simulated failure" })), "Failed: Tester failed. Simulated failure");
  assert.equal(announcement(notice("a")), "Done: Notice a.");
});
