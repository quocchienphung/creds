// Regression for the "zero patch" bug: the repaired workbook was only re-compressed, no cell changed.
// Synthetic data only. The damaged descriptions have NO clean twin of the same asset, so only evidence from the rest of the
// workbook (the file's own clean text) can restore them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { openSession } from "./session.ts";
import { emptyReview } from "./review.ts";
import { autoRepair } from "./auto-repair.ts";
import { comparePackages, diffCells } from "./ooxml-independent.mjs";

import { zeroPatchWorkbook } from "./zero-patch-fixture.mjs";

test("zero-patch regression: a repaired workbook must change cells, proved by an independent parser", async () => {
  const input = zeroPatchWorkbook(), original = input.slice();
  const session = await openSession(input, "synthetic.xlsx");
  const result = await autoRepair(session, emptyReview());
  assert.deepEqual(input, original, "the input buffer is immutable");
  const pkg = comparePackages(original, result.bytes);
  const { changed, structural } = diffCells(original, result.bytes);
  assert.ok(Object.keys(result.state.patches).length > 0, "at least one safely supported cell is repaired (patches)");
  assert.equal(pkg.verdict, "CONTENT_CHANGED", `uncompressed parts must differ, got ${pkg.verdict}`);
  assert.ok(changed.length > 0, "independent parser sees changed cells");
  assert.deepEqual(structural, [], "no style/formula/hidden-row/sheet change");
  assert.equal(changed.length, Object.keys(result.state.patches).length, "every committed patch is exactly one independently confirmed changed cell");
});
