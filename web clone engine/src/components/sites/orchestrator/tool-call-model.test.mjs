import assert from "node:assert/strict";
import test from "node:test";
import { RunSimulation, SAMPLE, applyEvent, emptyRun } from "./orchestrator-model.ts";
import { AUTO_COLLAPSE_MS, allSettled, callsFromRun, copyText, foldedCount, groupHeader, groupStartsOpen, jsonLines, postSummaryCall, summaryOf, titleOf } from "./tool-call-model.ts";

const call = (status, durationMs, extra = {}) => ({ id: `${status}${durationMs}`, tool: "web", title: "x", status, durationMs, ...extra });

// The wording of the group header, as recorded from the public preview's scripted turn (Retry, then the Slack approval, then Allow or Deny)
test("the header reads Used / Using / Waiting for approval with the failed count or the total time", () => {
  assert.deepEqual(groupHeader([call("success", 1180), call("success", 760), call("error")]), { label: "Used 3 tools", working: false, meta: "1 failed", metaFailed: true, stack: ["web"] });
  assert.equal(groupHeader([call("success", 1180), call("success", 760), call("running")], true).label, "Using 3 tools");
  assert.equal(groupHeader([call("success", 1180), call("success", 760), call("running")], true).working, true);
  assert.equal(groupHeader([call("success", 1180), call("success", 760), call("success", 420), call("approval")]).label, "Waiting for approval");
  assert.equal(groupHeader([call("success", 1180), call("success", 760), call("success", 420), call("running")]).label, "Using 4 tools");
  const done = groupHeader([call("success", 1180), call("success", 760), call("success", 420), call("success", 610)]);
  assert.equal(done.label, "Used 4 tools");
  assert.equal(done.meta, "3.0s");
  assert.equal(groupHeader([call("success", 1180), call("success", 760), call("success", 420), call("denied")]).meta, "2.4s");
  assert.equal(groupHeader([call("success", 100)]).label, "Used 1 tool");
});

test("a group opens by itself while a call runs, waits or has failed; a finished one starts folded and folds itself 450 ms after", () => {
  assert.equal(groupStartsOpen([call("success", 1)]), false);
  assert.equal(groupStartsOpen([call("success", 1), call("error")]), true);
  assert.equal(groupStartsOpen([call("approval")]), true);
  assert.equal(allSettled([call("success", 1), call("denied")]), true);
  assert.equal(allSettled([call("success", 1), call("error")]), false);
  assert.equal(allSettled([call("success", 1), call("error", 1, { handled: true })]), true, "a failure the lane retried no longer keeps the group open");
  assert.equal(groupStartsOpen([call("success", 1), call("error", 1, { handled: true })]), false);
  assert.equal(AUTO_COLLAPSE_MS, 450);
});

test("titles follow the status; the summary is derived from the output when left out", () => {
  assert.equal(titleOf({ title: "Searched", titles: { running: "Searching" }, status: "running" }), "Searching");
  assert.equal(titleOf({ title: "Searched", titles: { running: "Searching" }, status: "success" }), "Searched");
  assert.equal(summaryOf({ output: { type: "list", items: [1, 2, 3, 4].map(n => ({ lead: `#${n}`, title: "t" })) } }), "4 results");
  assert.equal(summaryOf({ output: { type: "table", columns: ["a"], rows: [[1], [2]] } }), "2 rows");
  assert.equal(summaryOf({ output: { type: "json", value: { a: 1, b: 2, c: 3 } } }), "3 fields");
  assert.equal(summaryOf({ summary: "2 blocked", output: { type: "text", text: "x" } }), "2 blocked");
});

test("tables fold after five rows and JSON after ten lines, behind \"Show N more lines\"", () => {
  const table = { type: "table", columns: ["id"], rows: Array.from({ length: 9 }, (_, i) => [i]) };
  assert.equal(foldedCount(table), 4);
  const json = { type: "json", value: { a: Array.from({ length: 20 }, (_, i) => i) } };
  assert.equal(foldedCount(json), jsonLines(json.value).length - 10);
  assert.equal(foldedCount({ type: "text", text: "x" }), 0);
  assert.equal(copyText({ type: "table", columns: ["a", "b"], rows: [[1, 2]] }), "a\tb\n1\t2");
  assert.equal(copyText({ type: "list", items: [{ lead: "#1", title: "T", tag: "x" }] }), "#1 T x");
});

test("the calls of a run: running rows, a failed row that can be retried while the lane waits, the retried row, then all settled", () => {
  const sim = new RunSimulation(SAMPLE, 4);
  const events = [];
  let view = emptyRun();
  const play = until => { for (const event of sim.advance(until)) { events.push(event); view = applyEvent(view, event); } };
  play(3000);
  let calls = callsFromRun(events, view);
  assert.equal(calls.length, 4);
  assert.ok(calls.every(item => item.status === "running"));
  assert.equal(calls[0].titles.running, "Searching notewise pricing per seat 2026");
  play(5200);
  calls = callsFromRun(events, view);
  const failed = calls.find(item => item.status === "error");
  assert.equal(failed.title, "Could not fetch quillstack.dev/pricing");
  assert.equal(failed.message, "The page returned 503 Service Unavailable");
  assert.equal(failed.retryable, true);
  play(7000);
  calls = callsFromRun(events, view);
  assert.equal(calls.find(item => item.id === "l3:1:1").retryable, false);
  assert.ok(calls.some(item => item.id === "l3:1:2"));
  play(Infinity);
  calls = callsFromRun(events, view);
  assert.equal(calls.length, 16);
  assert.ok(calls.every(item => item.status === "success" || item.status === "error"));
  assert.equal(calls.filter(item => item.status === "error").length, 1);
  assert.equal(callsFromRun(events, view, SAMPLE, 2).length, 4);
});

test("the approval after the run: Post a summary asks, then runs, then posted", () => {
  assert.equal(postSummaryCall("approval").message, "Sends as Arc agent to 12 people in #pricing-review");
  assert.equal(titleOf(postSummaryCall("running")), "Posting to #pricing-review");
  assert.equal(titleOf(postSummaryCall("success", 610)), "Posted to #pricing-review");
  assert.equal(summaryOf(postSummaryCall("success", 610)), "1 message");
});
