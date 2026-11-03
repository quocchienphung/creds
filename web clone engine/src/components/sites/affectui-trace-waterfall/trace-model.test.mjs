import { test } from "node:test";
import assert from "node:assert/strict";
import {
  axisRange, barOf, branchCost, flattenSpans, formatDollars, formatDuration, formatStarted, formatTick, formatTokens, rowsOf, runStatus,
  slowestId, spanDuration, spanEnd, tagSide, tickStep, ticksOf, totalsOf, visibleRows,
} from "./trace-model.ts";

const span = (id, kind, start, end, extra = {}) => ({ id, name: id, kind, status: end === undefined ? "running" : "done", start, ...(end !== undefined ? { end } : {}), ...extra });
const sample = () => span("run", "agent", 0, 20_000, { children: [
  span("plan", "llm", 900, 7800, { cost: 0.12, tokensIn: 3200, tokensOut: 880 }),
  span("research", "subagent", 8100, 30_000, { children: [
    span("search", "tool", 9000, 14_400, { cost: 0.005 }),
    span("read", "tool", 15_000, 27_600, { cost: 0.02 }),
    span("sum", "llm", 27_900, 37_200, { cost: 0.02, tokensIn: 5000, tokensOut: 900 }),
  ] }),
  span("test", "tool", 42_600, 51_000, { status: "failed", error: "2 of 14 fail" }),
  span("fix", "llm", 51_600, undefined, { cost: 0.04 }),
] });

test("times are written in the unit that fits: ms, one decimal under ten seconds, whole seconds, minutes", () => {
  assert.equal(formatDuration(403), "403ms");
  assert.equal(formatDuration(6900), "6.9s");
  assert.equal(formatDuration(3000), "3.0s");
  assert.equal(formatDuration(12_000), "12s");
  assert.equal(formatDuration(82_000), "1m 22s");
  assert.equal(formatDuration(64_000), "1m 04s");
  assert.equal(formatDuration(60_000), "1m");
  assert.equal(formatDuration(3_900_000), "1h 05m");
  assert.equal(formatStarted(900), "+900ms");
  assert.equal(formatStarted(43_000), "+43s");
  assert.equal(formatTick(0), "0s");
  assert.equal(formatTick(90_000), "1m 30s");
  assert.equal(formatTick(60_000), "1m");
  assert.equal(formatTick(7_200_000), "2h");
});

test("tokens and dollars: 880, 4.1k, 99.7k; $0.12, $0.02, $0.042, $0.005", () => {
  assert.deepEqual([880, 4100, 99_700, 1_200_000].map(formatTokens), ["880", "4.1k", "99.7k", "1.2M"]);
  assert.deepEqual([0.12, 0.02, 0.042, 0.005, 0.49, 0.1, 1.5, 0].map(formatDollars), ["$0.12", "$0.02", "$0.042", "$0.005", "$0.49", "$0.10", "$1.50", "$0.00"]);
});

test("the axis moves up a ladder as the run grows and never holds a run past 84% of it", () => {
  assert.equal(axisRange(0), 10_000, "never shorter than the minimum");
  assert.equal(axisRange(8100), 10_000);
  assert.equal(axisRange(9400), 15_000);
  assert.equal(axisRange(12_000), 15_000);
  assert.equal(axisRange(15_000), 20_000);
  assert.equal(axisRange(24_000), 30_000);
  assert.equal(axisRange(27_000), 45_000);
  assert.equal(axisRange(35_000), 45_000);
  assert.equal(axisRange(38_000), 60_000);
  assert.equal(axisRange(50_000), 60_000);
  assert.equal(axisRange(54_000), 90_000);
  assert.equal(axisRange(75_000), 90_000);
  assert.equal(axisRange(76_000), 120_000);
  assert.equal(axisRange(82_000), 120_000);
  assert.equal(axisRange(5000, 60_000), 60_000, "a longer minimum range is respected");
  assert.ok(axisRange(5 * 86_400_000) >= 5 * 86_400_000 / 0.85, "past the ladder it grows by whole days");
  let last = 0;
  for (let extent = 0; extent < 200_000; extent += 500) { const range = axisRange(extent); assert.ok(range >= last, "never moves down as a run grows"); last = range; }
});

test("ticks: five or fewer, round steps, the edge left out", () => {
  const cases = { 10_000: [2000, ["0s", "2s", "4s", "6s", "8s"]], 15_000: [3000, ["0s", "3s", "6s", "9s", "12s"]], 20_000: [5000, ["0s", "5s", "10s", "15s"]], 30_000: [10_000, ["0s", "10s", "20s"]],
    45_000: [10_000, ["0s", "10s", "20s", "30s", "40s"]], 60_000: [15_000, ["0s", "15s", "30s", "45s"]], 90_000: [20_000, ["0s", "20s", "40s", "1m", "1m 20s"]], 120_000: [30_000, ["0s", "30s", "1m", "1m 30s"]] };
  for (const [range, [step, labels]] of Object.entries(cases)) {
    assert.equal(tickStep(Number(range)), step, `step of ${range}`);
    assert.deepEqual(ticksOf(Number(range)).map(formatTick), labels, `ticks of ${range}`);
  }
});

test("the header numbers add up every span's own cost and tokens, count the calls and the errors", () => {
  const totals = totalsOf(sample(), 60_000);
  assert.equal(totals.llmCalls, 3);
  assert.equal(totals.toolCalls, 3);
  assert.equal(totals.errors, 1);
  assert.equal(Math.round(totals.cost * 1000) / 1000, 0.205);
  assert.equal(totals.tokens, 3200 + 880 + 5000 + 900);
  assert.equal(totals.duration, 60_000, "a running span grows into now, so the run lasts until then");
  assert.equal(totalsOf(sample(), 40_000).duration, 51_600, "a running span is never before its start");
  assert.equal(totalsOf(span("x", "agent", 0, 5000), 9000).hasCost, false);
  assert.equal(branchCost(sample()), totals.cost);
});

test("an error is counted once, at the span that failed, not again at the blocks that hold it", () => {
  const failed = span("run", "agent", 0, 5000, { status: "failed", children: [span("block", "subagent", 0, 4000, { status: "failed", children: [span("call", "llm", 0, 3000, { status: "failed" }), span("other", "tool", 0, 1000, { status: "failed" })] })] });
  assert.equal(totalsOf(failed, 5000).errors, 2, "the two failed calls");
  assert.equal(totalsOf(span("run", "agent", 0, 5000, { status: "failed" }), 5000).errors, 1, "a block with no calls is the failure itself");
});

test("the state of a run: running while anything runs, then failed or done by the first span", () => {
  assert.equal(runStatus(sample()), "running");
  const done = span("run", "agent", 0, 5000, { children: [span("a", "tool", 0, 1000, { status: "failed" })] });
  assert.equal(runStatus(done), "done", "a failed call does not fail the run");
  assert.equal(runStatus({ ...done, status: "failed" }), "failed");
});

test("the slowest finished model or tool call is marked, running calls and agents are not", () => {
  assert.equal(slowestId(sample()), "read", "12.6 s beats 9.3 s and 8.4 s");
  const tie = span("run", "agent", 0, 9000, { children: [span("a", "tool", 0, 2000), span("b", "llm", 3000, 5000)] });
  assert.equal(slowestId(tie), "a", "the first on a tie");
  assert.equal(slowestId(span("run", "agent", 0, 1000)), null);
});

test("rows: folding closes up the rows below and counts what is hidden; leaves have no chevron", () => {
  const rows = rowsOf(sample(), new Set(["research"]));
  assert.deepEqual(rows.map(row => [row.span.id, row.level]), [["run", 1], ["plan", 2], ["research", 2], ["search", 3], ["read", 3], ["sum", 3], ["test", 2], ["fix", 2]]);
  assert.deepEqual(rows.filter(row => row.hidden).map(row => row.span.id), ["search", "read", "sum"]);
  const research = rows.find(row => row.span.id === "research");
  assert.equal(research.folded, true);
  assert.equal(research.descendants.length, 3, "+3 shown on the folded row");
  assert.equal(rows.find(row => row.span.id === "plan").hasChildren, false);
  assert.equal(visibleRows(rows).length, 5);
  assert.equal(visibleRows(rowsOf(sample(), new Set())).length, 8);
  assert.equal(rowsOf(sample(), new Set(["plan"])).find(row => row.span.id === "plan").folded, false, "a leaf cannot be folded");
  const deep = span("a", "agent", 0, 10, { children: [span("b", "subagent", 0, 10, { children: [span("c", "llm", 0, 5)] })] });
  assert.deepEqual(rowsOf(deep, new Set(["a"])).map(row => row.hidden), [false, true, true]);
});

test("a bar's place on the axis, and a label goes after the bar, inside it or before it", () => {
  assert.deepEqual(barOf(span("a", "llm", 5000, 15_000), 0, 20_000), { start: 0.25, width: 0.5 });
  assert.deepEqual(barOf(span("a", "llm", 5000, undefined), 8000, 20_000), { start: 0.25, width: 0.15 }, "a running span reaches now");
  assert.equal(spanEnd(span("a", "llm", 5000), 3000), 5000);
  assert.equal(spanDuration(span("a", "llm", 5000, 7500), 0), 2500);
  assert.equal(tagSide(100, 300, 80, 800), "after");
  assert.equal(tagSide(100, 760, 80, 800), "inside", "no room after, the bar is wide");
  assert.equal(tagSide(700, 760, 80, 800), "before", "no room after, the bar is short");
  assert.equal(tagSide(20, 60, 80, 100), "inside", "no room anywhere: inside, clipped");
});

test("flattenSpans lists a trace parent first", () => {
  assert.deepEqual(flattenSpans(sample()).map(item => item.id), ["run", "plan", "research", "search", "read", "sum", "test", "fix"]);
});
