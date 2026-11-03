import { test } from "node:test";
import assert from "node:assert/strict";
import { performanceOf } from "./performance.ts";

const span = (id, kind, start, end, extra = {}) => ({ id, name: id, kind, status: end === undefined ? "running" : "done", start, ...(end !== undefined ? { end } : {}), ...extra });
// run 0-30 s: a (0-10 s, llm 0-10), b (5-25 s, llm 5-12, wait 12-20, tool 20-25) and c (10-30 s, llm 10-30), c is the last to end
const trace = () => span("run", "agent", 0, 30_000, { mark: "anthropic", children: [
  span("a", "subagent", 0, 10_000, { mark: "gemini", children: [span("a:llm", "llm", 0, 10_000, { cost: 0.1 })] }),
  span("b", "subagent", 5000, 25_000, { mark: "openai", children: [span("b:llm", "llm", 5000, 12_000, { cost: 0.2 }), span("b:wait", "wait", 12_000, 20_000, { detail: "a person" }), span("b:tool", "tool", 20_000, 25_000)] }),
  span("c", "subagent", 10_000, 30_000, { mark: "gemini", children: [span("c:llm", "llm", 10_000, 30_000, { cost: 0.4, status: "failed" })] }),
] });

test("a block's own time is what its calls and waits cover, not what is under it; shares add up to one", () => {
  const p = performanceOf(trace(), 30_000);
  assert.equal(p.duration, 30_000);
  const own = Object.fromEntries(p.blocks.map(block => [block.id, block.own]));
  assert.equal(own.a, 10_000);
  assert.equal(own.b, 7000 + 8000 + 5000);
  assert.equal(own.c, 20_000);
  assert.equal(own.run, 0, "a block with no calls of its own is its bar minus the blocks under it");
  assert.ok(Math.abs(p.blocks.reduce((sum, block) => sum + block.share, 0) - 1) < 1e-9);
  assert.deepEqual(p.blocks.map(block => block.id), ["b", "c", "a", "run"], "longest first");
});

test("parallelism says how many blocks worked at once, and waiting for a person is counted apart", () => {
  const p = performanceOf(trace(), 30_000);
  assert.equal(p.busy, 50_000);
  assert.ok(Math.abs(p.parallelism - 50 / 30) < 1e-9);
  assert.deepEqual(p.waiting, { ms: 8000, count: 1 });
  assert.equal(p.failed, 1);
});

test("the critical path goes from the first block into the block that ended last", () => {
  assert.deepEqual(performanceOf(trace(), 30_000).critical.map(step => step.name), ["run", "c"]);
  const deep = span("run", "agent", 0, 20_000, { children: [span("x", "subagent", 0, 20_000, { children: [span("y", "subagent", 2000, 20_000)] })] });
  assert.deepEqual(performanceOf(deep, 20_000).critical.map(step => step.name), ["run", "x", "y"]);
});

test("engines add up their blocks: time, cost and calls", () => {
  const p = performanceOf(trace(), 30_000);
  const gemini = p.engines.find(engine => engine.mark === "gemini");
  assert.equal(gemini.blocks, 2);
  assert.equal(gemini.own, 30_000);
  assert.ok(Math.abs(gemini.cost - 0.5) < 1e-9);
  assert.equal(gemini.calls, 2);
  assert.equal(p.engines.find(engine => engine.mark === "openai").calls, 2, "the llm call and the tool call");
});

test("a running trace is measured up to now, and a run of several rounds says how many", () => {
  const live = span("run", "agent", 0, undefined, { children: [span("a", "subagent", 0, undefined, { children: [span("a:llm", "llm", 0, undefined)] })] });
  assert.equal(performanceOf(live, 7000).duration, 7000);
  assert.equal(performanceOf(live, 7000).blocks.find(block => block.id === "a").own, 7000);
  const rounds = span("run:run", "agent", 0, 20_000, { children: [span("r1", "subagent", 0, 9000), span("r2", "subagent", 10_000, 20_000)] });
  assert.equal(performanceOf(rounds, 20_000).rounds, 2);
  assert.equal(performanceOf(span("only", "agent", 0, 1000), 1000).rounds, 1);
});
