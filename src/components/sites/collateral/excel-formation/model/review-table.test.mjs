import assert from "node:assert/strict";
import test from "node:test";
import { reviewRows } from "./review-table.ts";
import { openIssueMarks, previewMarks, problemCells } from "./sheet-marks.ts";
import { composeFromPicks } from "./compose-picks.ts";
import { defaultFilters } from "./review-filters.ts";

const issue = (id, row, severity, over = {}) => ({ id, sheet: "S", row, col: 2, column: "B", field: "f", severity, category: "WHITESPACE_ANOMALY", originalValue: `v${row}`, ...over });
const all = [issue("a", 3, "low"), issue("b", 1, "critical"), issue("c", 2, "high")];

test("reviewRows keeps sheet order, sorts on demand and hides finished issues by default", () => {
  const states = { c: { status: "verified", correctedValue: "ok" } };
  assert.deepEqual(reviewRows(all, states, defaultFilters, { key: "row", dir: "asc" }).map(r => r.issue.id), ["a", "b"]);
  assert.deepEqual(reviewRows(all, states, defaultFilters, { key: "severity", dir: "asc" }).map(r => r.issue.id), ["b", "a"]);
  const done = reviewRows(all, states, { ...defaultFilters, status: "done" }, { key: "row", dir: "asc" });
  assert.deepEqual(done.map(r => [r.issue.id, r.current, r.edited]), [["c", "ok", true]]);
  assert.deepEqual(reviewRows(all, states, { ...defaultFilters, query: "b1" }, { key: "row", dir: "asc" }).map(r => r.issue.id), ["b"]);
});

test("sheet marks: open issues tint cells by severity; the preview marks changes and problems", () => {
  const marks = openIssueMarks(all, { c: { status: "verified" } });
  assert.equal(marks.S.open, 2);
  assert.equal(marks.S.issueCells.get(1).get(2), 4);
  assert.equal(marks.S.issueCells.has(2), false);
  const cells = [{ key: "k1", sheet: "S", row: 1, col: 1, before: "a", after: "b", field: "", needsReview: true }, { key: "k2", sheet: "S", row: 2, col: 1, before: "x", after: "x", field: "", needsReview: false }];
  const problems = problemCells(cells, [{ sheet: "S", row: 9, col: 1 }]);
  assert.deepEqual(problems.map(p => p.row), [1, 9]);
  const preview = previewMarks(cells, problems);
  assert.deepEqual([...preview.S.changes.get(1)], [1]);
  assert.equal(preview.S.open, 2);
});

test("composeFromPicks replaces only the words that were picked", () => {
  assert.equal(composeFromPicks("a b? c?", [{ start: 2, end: 4 }, { start: 5, end: 7 }], { 1: "cd" }), "a b? cd");
});
