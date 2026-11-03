import { test } from "node:test";
import assert from "node:assert/strict";
import { sheetStatuses } from "./sheet-status.ts";

const scan = (name, over = {}) => ({ name, part: "p", status: "clean", rowsSeen: 1, hiddenRows: 0, hiddenColumns: 0, textCellsSeen: 1, formulaCells: 0, protectedCells: 0, questionMarkCells: 0, confirmedCells: 0, possibleCells: 0, mojibakeCells: 0, unrepairableQuestionMarks: 0, ms: 0, ...over });
const issue = (sheet, id) => ({ id, sheet });

test("green needs a finished scan and nothing left to settle; grey and red never turn green", () => {
  const status = new Map([["a", "verified"], ["b", "edited"], ["c", "accepted_exception"]]);
  const of = item => status.get(item.id) ?? "open";
  const states = sheetStatuses(["S1", "S2", "S3", "S4", "S5", "S6"], [scan("S1"), scan("S2", { status: "issues" }), scan("S3", { status: "issues" }), scan("S4", { status: "error" }), scan("S5", { status: "issues", unrepairableQuestionMarks: 1 })],
    [issue("S2", "a"), issue("S2", "c"), issue("S3", "a"), issue("S3", "b")], of);
  assert.deepEqual(states.map(item => item.state), ["clean", "clean", "issues", "error", "issues", "unscanned"]);
  assert.equal(states[2].open, 1, "an edit that is not verified yet still counts as open");
  assert.equal(states[1].total, 2);
});

test("no scan result at all means every sheet is unscanned, never clean", () => {
  assert.deepEqual(sheetStatuses(["A", "B"], undefined, [], () => "open").map(item => item.state), ["unscanned", "unscanned"]);
});
