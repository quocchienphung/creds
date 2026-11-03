import test from "node:test";
import assert from "node:assert/strict";
import { breakdownGroups, groupCells, groupOfCell, groupingsOf, hiddenSummary, maskedMetric } from "./terrain-breakdown.ts";
import { buildWorkspaceWeek, summarize, weekStartOf } from "./terrain-data.ts";
import { SAMPLE_WEEK } from "./sample-week.ts";

const now = Date.UTC(2026, 9, 22, 5), start = weekStartOf(now), HOUR = 3600_000, DAY = 24 * HOUR;
const at = (day, hour) => start + day * DAY + hour * HOUR + 600_000;
const events = [
  { t: at(0, 3), kind: "import", outcome: "success" }, { t: at(0, 9), kind: "save", outcome: "success" }, { t: at(2, 9), kind: "save", outcome: "success" },
  { t: at(3, 9), kind: "export", outcome: "success" }, { t: at(3, 9), kind: "export", outcome: "success" }, { t: at(3, 14), kind: "transfer", outcome: "error" },
  { t: at(5, 20), kind: "import", outcome: "error" }, { t: at(6, 23), kind: "transfer", outcome: "success" },
  { t: at(-7 + 3, 9), kind: "save", outcome: "success" },   // the week before
];
const week = buildWorkspaceWeek(events, now);
const total = id => breakdownGroups("day", week, id).reduce((a, g) => a + g.value, 0);

test("every grouping adds up to the terrain's own total for every metric", () => {
  for (const metricId of ["operations", "deliveries", "errors"]) {
    const expected = week.metrics[metricId].values.reduce((a, b) => a + b, 0);
    for (const grouping of ["day", "daypart", "action"]) assert.equal(breakdownGroups(grouping, week, metricId).reduce((a, g) => a + g.value, 0), expected, `${grouping} / ${metricId}`);
  }
  assert.equal(total("operations"), 8);
  assert.equal(total("errors"), 2);
  assert.equal(total("deliveries"), 3);
});

test("days, parts of the day and actions are counted where they happened", () => {
  const byDay = Object.fromEntries(breakdownGroups("day", week, "operations").map(g => [g.id, g.value]));
  assert.deepEqual(byDay, { mon: 2, tue: 0, wed: 1, thu: 3, fri: 0, sat: 1, sun: 1 });
  const byPart = Object.fromEntries(breakdownGroups("daypart", week, "operations").map(g => [g.id, g.value]));
  assert.deepEqual(byPart, { night: 1, morning: 4, afternoon: 1, evening: 2 });
  const byAction = Object.fromEntries(breakdownGroups("action", week, "operations").map(g => [g.id, g.value]));
  assert.deepEqual(byAction, { import: 2, save: 2, export: 2, transfer: 2 });
  assert.equal(breakdownGroups("action", week, "deliveries").find(g => g.id === "transfer")?.value, 1, "the failed transfer is not a delivery");
});

test("the sample week has days and parts of the day but no actions", () => {
  assert.deepEqual(groupingsOf(SAMPLE_WEEK), ["day", "daypart"]);
  assert.deepEqual(groupingsOf(week), ["day", "daypart", "action"]);
  assert.equal(breakdownGroups("day", SAMPLE_WEEK, "operations").reduce((a, g) => a + g.value, 0), summarize(SAMPLE_WEEK.metrics.operations).total);
});

test("switching groups off leaves exactly their hours out, in the totals, the peaks and last week", () => {
  const without = maskedMetric(week, "operations", "day", new Set(["thu"]));
  assert.equal(without.values.reduce((a, b) => a + b, 0), 5);
  assert.equal(without.previous.reduce((a, b) => a + b, 0), 0, "last week's Thursday is left out too");
  assert.equal(summarize(without).busiest?.day, 0, "Monday is busiest once Thursday is out");
  assert.equal(maskedMetric(week, "operations", "day", new Set()), week.metrics.operations, "nothing hidden: the very same object");
  const noMorning = maskedMetric(week, "operations", "daypart", new Set(["morning"]));
  assert.equal(noMorning.values.reduce((a, b) => a + b, 0), 4);
  const noImports = maskedMetric(week, "errors", "action", new Set(["import"]));
  assert.equal(noImports.values.reduce((a, b) => a + b, 0), 1, "only the failed transfer is left");
  assert.equal(week.metrics.operations.values.reduce((a, b) => a + b, 0), 8, "the source numbers are never changed");
});

test("hours know their group, and a group knows its hours", () => {
  assert.equal(groupOfCell("day", week, "operations", 3 * 24 + 9), "thu");
  assert.equal(groupOfCell("daypart", week, "operations", 3 * 24 + 9), "morning");
  assert.equal(groupOfCell("daypart", week, "operations", 23), "evening");
  assert.equal(groupOfCell("action", week, "operations", 3 * 24 + 9), "export");
  assert.equal(groupOfCell("action", week, "operations", 4 * 24 + 1), null, "an hour with nothing counted");
  assert.equal(groupOfCell("day", week, "operations", 999), null);
  assert.equal(groupCells("day", week, "operations", "thu").length, 24);
  assert.equal(groupCells("daypart", week, "operations", "night").length, 7 * 6);
  assert.deepEqual(groupCells("action", week, "operations", "export"), [3 * 24 + 9]);
});

test("what is left out is named, in the grouping's own order", () => {
  assert.equal(hiddenSummary("day", new Set()), "");
  assert.equal(hiddenSummary("day", new Set(["sun", "sat"])), "Sat, Sun");
  assert.equal(hiddenSummary("daypart", new Set(["night"])), "Night");
  assert.equal(hiddenSummary("action", new Set(["transfer", "import"])), "Import, Transfer");
  assert.equal(hiddenSummary("day", new Set(["nope"])), "", "an id this grouping does not have names nothing");
});

test("columns outside a focused group recede toward the platform colour, whichever way the browser writes it", async () => {
  const { parseRgb, rgbFaded } = await import("./terrain-colors.ts");
  assert.deepEqual(parseRgb("#f9f9f9"), [249, 249, 249]);
  assert.deepEqual(parseRgb("#fff"), [255, 255, 255]);
  assert.deepEqual(parseRgb("rgb(33 33 33)"), [33, 33, 33]);
  assert.deepEqual(parseRgb("rgb(33, 34, 35)"), [33, 34, 35]);
  assert.deepEqual(parseRgb("oklch(0.5 0 0)"), [249, 249, 249], "unknown notation: the light platform");
  assert.equal(rgbFaded([64, 64, 64], 1, [249, 249, 249], 0), "rgb(64 64 64)");
  assert.equal(rgbFaded([64, 64, 64], 1, [249, 249, 249], 1), "rgb(249 249 249)");
  const half = rgbFaded([64, 64, 64], 1, [249, 249, 249], 0.5).match(/\d+/g).map(Number);
  assert.ok(half.every(v => v > 64 && v < 249), "halfway between");
});
