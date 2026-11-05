// The scan of the workbook as it is now: it reads patched values, honours accepted exceptions and agrees with an independent parse of the export.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildXlsx } from "./xlsx-builder.mjs";
import { openSession } from "./session.ts";
import { acceptException, applyEdits, emptyReview } from "./review.ts";
import { autoRepair } from "./auto-repair.ts";
import { findResidual } from "./residual.ts";
import { corruptionSpans } from "./corruption-span.ts";
import { cellMap } from "./ooxml-independent.mjs";
import { HEADERS, CLEAN } from "./zero-patch-fixture.mjs";

const row = (n, a, b = a) => ["00001", `K${1000 + n}`, `A${n}`, "303", { n: "1234.5599999999999" }, a, b, "Synthetic Person"];
const bytesWith = extra => buildXlsx([{ name: "S", rows: [HEADERS, ...CLEAN.map((text, i) => row(i, text)), ...extra] }]);
const at = report => report.items.map(item => `${item.sheet}!${item.row}:${item.col}:${item.kind}`);

test("a damaged cell is found, a clean one is not, and the counts are exact", async () => {
  const bytes = bytesWith([row(2000, "nha pho duong l?n va gan truong hoc so 3"), row(2001, "  hai   khoang trang  ")]);
  const session = await openSession(bytes, "r.xlsx"), report = findResidual(session, emptyReview());
  const last = CLEAN.length + 1;
  assert.ok(at(report).includes(`S!${last + 1}:5:question_mark`));
  assert.ok(report.items.some(item => item.row === last + 2 && item.kind === "spacing"));
  assert.equal(report.total, report.bySheet[0].counts.question_mark * 1 + report.bySheet[0].counts.spacing + report.bySheet[0].counts.mojibake + report.bySheet[0].counts.invisible + report.bySheet[0].counts.other);
  assert.equal(report.items.filter(item => item.row <= CLEAN.length).length, 0, "the clean rows are not reported");
});

test("the scan reads the value as it is now: a fixed cell leaves the list, a cell still holding a ? stays", async () => {
  const bytes = bytesWith([row(2000, "nha pho duong l?n va gan truong hoc so 3"), row(2001, "may moc tang ba va c? so do so 5")]);
  const session = await openSession(bytes, "r.xlsx"), last = CLEAN.length + 1;
  const state = applyEdits(emptyReview(), session.ctx, [
    { sheet: "S", row: last + 1, col: 5, value: "nha pho duong lon va gan truong hoc so 3", source: "typed" },
    { sheet: "S", row: last + 2, col: 5, value: "may moc tang ba va c? so do so 6", source: "typed" },
  ]);
  const report = findResidual(session, state);
  assert.ok(!report.items.some(item => item.row === last + 1 && item.col === 5), "fixed by hand: gone");
  assert.ok(report.items.some(item => item.row === last + 2 && item.col === 5 && item.kind === "question_mark"), "still has a ?: still listed");
});

test("an accepted exception is a decision, not a leftover", async () => {
  const bytes = bytesWith([row(2000, "nha pho duong l?n va gan truong hoc so 3")]);
  const session = await openSession(bytes, "r.xlsx"), last = CLEAN.length + 1;
  const issue = session.scan.issues.find(item => item.row === last + 1 && item.col === 5 && item.category === "QUESTION_MARK_IN_WORD");
  assert.ok(issue, "the review found the cell");
  const accepted = acceptException(emptyReview(), issue.id, "Ten rieng dung nhu vay, da doi chieu ho so");
  assert.ok(accepted.ok);
  assert.ok(!findResidual(session, accepted.state).items.some(item => item.row === last + 1 && item.col === 5));
});

test("after the automatic repair, every damaged cell of the exported file is in the list (checked against the independent parser)", async () => {
  const bytes = bytesWith([row(2000, "may moc tang ba va c? so do so 5"), row(2001, "Nguy?n Van A ? ? ?"), row(2002, "x? tang ba?  gan cho")]);
  const session = await openSession(bytes, "r.xlsx"), out = await autoRepair(session, emptyReview());
  const report = findResidual(session, out.state), listed = new Set(report.items.map(item => `${item.row}:${item.col}`));
  const cells = cellMap(out.bytes).S.cells;
  let damaged = 0;
  for (const [ref, cell] of cells) {
    if (!corruptionSpans(cell.value).some(span => span.kind !== "suspected_punctuation")) continue;
    damaged++;
    assert.ok(listed.has(`${Number(ref.slice(1))}:${"ABCDEFGH".indexOf(ref[0])}`), `${ref} is damaged in the export and must be listed: ${cell.value}`);
  }
  assert.ok(damaged > 0, "the fixture leaves something damaged, so the check is not empty");
});

test("the display snippet is short but the real length is reported", async () => {
  const long = "dia chi " + "rat dai ".repeat(80) + "l?n " + "tiep tuc ".repeat(40);
  const session = await openSession(bytesWith([row(2000, long)]), "r.xlsx"), item = findResidual(session, emptyReview()).items.find(i => i.length === long.length);
  assert.ok(item && item.snippet.length <= 162 && item.snippet.includes("l?n"));
});
