import { test } from "node:test";
import assert from "node:assert/strict";
import { columnAt, columnLefts, columnWeight, columnWidths, issueStrip, rowOfStrip, stripOfRow } from "./sheet-geometry.ts";

const columns = [1, 1, 3, 1, 3].map((weight, i) => ({ col: i, letter: "ABCDE"[i], header: "h" + i, weight }));
test("columns together fill the width exactly and long-text columns are wider", () => {
  const widths = columnWidths(columns, 900);
  assert.equal(widths.reduce((a, b) => a + b, 0), 900);
  assert.deepEqual(widths, [100, 100, 300, 100, 300]);
  assert.equal(columnWeight("MOTABDS"), 3); assert.equal(columnWeight("TENKH"), 3); assert.equal(columnWeight("MASOBD"), 1); assert.equal(columnWeight("MAKH"), 1);
});
test("a pixel finds its column, clamped at both ends", () => {
  const widths = columnWidths(columns, 900), lefts = columnLefts(widths);
  assert.deepEqual(lefts, [0, 100, 200, 500, 600]);
  assert.equal(columnAt(lefts, widths, 0), 0); assert.equal(columnAt(lefts, widths, 99.9), 0); assert.equal(columnAt(lefts, widths, 100), 1);
  assert.equal(columnAt(lefts, widths, 499), 2); assert.equal(columnAt(lefts, widths, 899), 4);
  assert.equal(columnAt(lefts, widths, -50), 0); assert.equal(columnAt(lefts, widths, 5000), 4);
});
test("the issue strip keeps the worst severity per slot and clicks map back to rows", () => {
  const strip = issueStrip([{ row: 1, level: 2 }, { row: 2, level: 4 }, { row: 500, level: 3 }, { row: 1000, level: 1 }], 1000, 10);
  assert.deepEqual([...strip], [4, 0, 0, 0, 3, 0, 0, 0, 0, 1]);
  assert.equal(rowOfStrip(0, 400, 1000), 1); assert.equal(rowOfStrip(400, 400, 1000), 1000); assert.equal(rowOfStrip(200, 400, 1000), 501);
  assert.ok(Math.abs(stripOfRow(rowOfStrip(120, 400, 1000), 400, 1000) - 120) < 1);
  assert.deepEqual([...issueStrip([], 100, 4)], [0, 0, 0, 0]);
});
