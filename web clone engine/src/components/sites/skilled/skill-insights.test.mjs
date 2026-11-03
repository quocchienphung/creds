import assert from "node:assert/strict";
import { test } from "node:test";
import { bucketSeries, changeLabel, cumulativeSeries, lifecycleSteps, periodCounts, sizeParts, timelineEntries } from "./skill-insights.ts";

const DAY = 86_400_000, now = Date.parse("2026-10-22T12:00:00Z");
const ev = (extra = {}) => ({ id: "e1", kind: "import", label: "Import", t: now, durationMs: 12.34, bytes: 2048, outcome: "success", ...extra });

test("buckets count times inside the window, oldest first", () => {
  assert.deepEqual(bucketSeries([now - 1000, now - DAY, now - 6.5 * DAY, now - 8 * DAY, now + 5], now, 7, 7), [1, 0, 0, 0, 0, 0, 2]);
  assert.deepEqual(bucketSeries([], now, 30, 15), new Array(15).fill(0));
});

test("cumulative series starts from what is older than the window", () => {
  assert.deepEqual(cumulativeSeries([now - 40 * DAY, now - 1000], now, 7, 7), [1, 1, 1, 1, 1, 1, 2]);
});

test("period counts compare with the period before", () => {
  const counts = periodCounts([now - DAY, now - 2 * DAY, now - 9 * DAY, now - 20 * DAY], now, 7);
  assert.deepEqual(counts, { current: 2, previous: 1 });
  assert.equal(changeLabel(counts), "+1");
  assert.equal(changeLabel({ current: 1, previous: 3 }), "-2");
  assert.equal(changeLabel({ current: 2, previous: 2 }), undefined);
  assert.equal(changeLabel({ current: 0, previous: 0 }), undefined);
});

test("sizes use the unit that reads best", () => {
  assert.deepEqual(sizeParts(512), { value: 512, suffix: " B", decimals: 0 });
  assert.deepEqual(sizeParts(2048), { value: 2, suffix: " KB", decimals: 1 });
  assert.deepEqual(sizeParts(5 * 1024 * 1024), { value: 5, suffix: " MB", decimals: 1 });
});

test("lifecycle steps follow what exists", () => {
  assert.deepEqual(lifecycleSteps([], []).map(step => step.done), [false, false, false, false]);
  const skills = [{ sourceUrl: "https://github.com/a/b/blob/c/SKILL.md", status: "ready" }];
  assert.deepEqual(lifecycleSteps(skills, [ev({ kind: "export" })]).map(step => step.done), [true, true, true, false]);
  assert.deepEqual(lifecycleSteps(skills, [ev({ kind: "transfer", label: "Receipt · agent" })]).map(step => step.done), [true, true, true, true]);
  assert.equal(lifecycleSteps([], [ev({ kind: "export", outcome: "error" })])[2].done, false);
});

test("timeline entries skip storage writes and name what happened", () => {
  const skills = [{ id: "s1", name: "web-testing", description: "d", target: "Local AI" }];
  const rows = timelineEntries([ev({ id: "a", kind: "save" }), ev({ id: "b", skillId: "s1" }), ev({ id: "c", kind: "import", outcome: "error", detail: "Not found" }), ev({ id: "d", kind: "transfer", label: "Receipt · research" })], skills);
  assert.deepEqual(rows.map(row => row.id), ["b", "c", "d"]);
  assert.equal(rows[0].actor, "web-testing");
  assert.equal(rows[0].meta, "2.0 KB · 12 ms");
  assert.equal(rows[1].tone, "danger");
  assert.equal(rows[1].meta, "Not found");
  assert.equal(rows[2].title, "Delivery confirmed by research");
  assert.equal(timelineEntries([ev({ id: "x" }), ev({ id: "y", label: "Repo scan" })], skills, event => event.label.startsWith("Repo")).length, 1);
});
