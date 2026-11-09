import { test } from "node:test";
import assert from "node:assert/strict";
import { applyEditToBlocks, csvLineDisplay, flipDoc, flipFacts, naiveLine, quoteReason, rowId, workbookText } from "./flip-plan.ts";
import { delimitedText } from "./flip-model.ts";
import { SAMPLE_ASSETS, SAMPLE_LOOKUPS } from "./flip-sample.ts";

const labels = { join: row => `Joining row ${row}`, quote: reason => `Quoting ${reason}`, summary: "Summary", summaryLabel: "Adding a summary" };
const rows = SAMPLE_ASSETS.rows;
const expectedText = delimiter => rows.slice(0, 5).map(row => csvLineDisplay(row, delimiter)).join("↵");

test("a cell is quoted for the delimiter, a quote or a line break, and the reason is the one a person would look at first", () => {
  assert.equal(quoteReason("Kho A, 12 Lê Lợi", ","), "delimiter"); assert.equal(quoteReason("Kho A, 12 Lê Lợi", "\t"), null);
  assert.equal(quoteReason("Laptop 14\" x", ","), "quote"); assert.equal(quoteReason("a\nb", ","), "break"); assert.equal(quoteReason("00101", ","), null);
  assert.equal(quoteReason("a;b", ";"), "delimiter");
});

test("workbook text leaves trailing empty cells out and draws a line break as a mark; the naive line keeps every column", () => {
  assert.equal(workbookText(["a", "b", "", ""]), "a │ b");
  assert.equal(naiveLine(["a", "", ""], ","), "a,,"); assert.equal(naiveLine(["a\nb", "c"], ","), "a↵b,c");
  assert.equal(csvLineDisplay(["a,b", "c"], ","), "\"a,b\",c");
});

test("facts name the first row they come from and change with the delimiter", () => {
  const comma = flipFacts(rows, ",");
  assert.deepEqual(comma.map(fact => fact.id), ["header", "delimiter", "quote", "break", "zeros", "empty", "accents"]);
  const delimiter = comma.find(fact => fact.id === "delimiter");
  assert.deepEqual(delimiter.params, [3, 2]); assert.equal(delimiter.source, "r2"); assert.equal(delimiter.column, "Địa chỉ");
  assert.equal(comma.find(fact => fact.id === "break").source, "r5");
  assert.equal(comma.find(fact => fact.id === "quote").source, "r4"); assert.deepEqual(comma.find(fact => fact.id === "quote").params, [2, 4]);
  assert.equal(comma.find(fact => fact.id === "zeros").params[0], 12);
  const tab = flipFacts(rows, "\t");
  assert.equal(tab[1].id, "none"); assert.equal(tab[1].source, "r1");
  assert.equal(flipFacts(SAMPLE_LOOKUPS.rows, ",")[1].id, "delimiter");
});

test("the Agent cursor's edits end on exactly the lines Flip writes", () => {
  for (const delimiter of [",", ";", "\t", "|"]) {
    const doc = flipDoc(rows, delimiter, { title: "T", fileName: "f.csv", labels });
    let blocks = doc.blocks;
    for (const edit of doc.edits) blocks = applyEditToBlocks(blocks, edit);
    // the real text keeps its line break inside a quoted field; the document draws it as a mark
    assert.equal(delimitedText(rows.slice(0, 5), delimiter).replaceAll("\n", "↵"), expectedText(delimiter));
    const expected = rows.slice(0, 5).map(row => csvLineDisplay(row, delimiter));
    assert.deepEqual(blocks.filter(block => /^r\d+$/.test(block.id)).map(block => block.text), expected, `delimiter ${JSON.stringify(delimiter)}`);
    assert.equal(blocks.at(-1).id, "summary");
  }
});

test("one rewrite per row, then one fix per cell that needs quotes, in that order, and the quotes counted", () => {
  const doc = flipDoc(rows, ",", { title: "T", fileName: "f.csv", labels });
  assert.equal(doc.shown, 5);
  assert.deepEqual(doc.edits.map(edit => edit.type), ["rewrite", "rewrite", "fix", "rewrite", "rewrite", "fix", "rewrite", "fix", "fix", "insert"]);
  assert.equal(doc.quoted, 4);
  assert.equal(doc.edits[0].label, "Joining row 1"); assert.equal(doc.edits[2].label, "Quoting delimiter"); assert.equal(doc.edits[5].label, "Quoting quote"); assert.equal(doc.edits[8].label, "Quoting break"); assert.equal(doc.edits[9].label, "Adding a summary");
});

test("a repeated cell text is fixed at its own place", () => {
  const repeated = [["id", "a", "b"], ["x", "p,q", "p,q"]];
  const doc = flipDoc(repeated, ",", { title: "T", fileName: "f", labels });
  let blocks = doc.blocks;
  for (const edit of doc.edits) blocks = applyEditToBlocks(blocks, edit);
  assert.equal(blocks.find(block => block.id === "r2").text, "x,\"p,q\",\"p,q\"");
  assert.equal(rowId(2), "r2");
});
