import assert from "node:assert/strict";
import test from "node:test";
import { previewCells, previewKey } from "./preview-model.ts";

const issue = (id, sheet = "Sheet1", row = 2) => ({ id, sheet, row, col: 1, field: "Description", originalValue: "can h?" });
const patch = (sheet, row, original = "can h?", value = "can ho") => ({ sheet, row, col: 1, original, value });

test("preview deduplicates issues by cell but retains unresolved issues and exact original/edited text", () => {
  const issues = [issue("a"), issue("b")];
  const patches = [patch("Sheet1", 2)];
  const cells = previewCells(issues, { a: { status: "verified" }, b: { status: "open" } }, patches);
  assert.equal(cells.length, 1);
  assert.equal(cells[0].before, "can h?");
  assert.equal(cells[0].after, "can ho");
  assert.equal(cells[0].needsReview, true);
  assert.equal(issues[0].originalValue, "can h?");
  assert.equal(patches[0].value, "can ho");
});

test("all sheets and patch-only cells appear, and originals survive issues introduced by an edit", () => {
  const cells = previewCells([{ ...issue("new", "Sheet2"), originalValue: "new ?" }], { new: { status: "edited" } }, [patch("Sheet2", 2, "original", "new ?"), patch("Sheet1", 2, "001", "002")]);
  assert.deepEqual(cells.map(cell => [cell.sheet, cell.before, cell.after]), [["Sheet1", "001", "002"], ["Sheet2", "original", "new ?"]]);
  assert.equal(cells[1].needsReview, true);
  assert.notEqual(previewKey(cells[0]), previewKey(cells[1]));
});

test("undo removes a patch from preview and accepted exceptions are not unresolved", () => {
  const cells = previewCells([issue("a")], { a: { status: "accepted_exception" } }, []);
  assert.equal(cells[0].after, cells[0].before);
  assert.equal(cells[0].needsReview, false);
  assert.deepEqual(previewCells([], {}, []), []);
});

test("an edit that leaves no ? is a change, not a problem; one that still holds a ? needs review", () => {
  const done = previewCells([issue("a")], { a: { status: "edited", correctedValue: "can ho" } }, [patch("Sheet1", 2)]);
  assert.equal(done[0].needsReview, false);
  const half = previewCells([issue("a")], { a: { status: "edited", correctedValue: "can h?" } }, [patch("Sheet1", 2, "can h?", "can h?")]);
  assert.equal(half[0].needsReview, true);
});
