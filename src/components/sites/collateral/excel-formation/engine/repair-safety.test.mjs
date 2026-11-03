import { test } from "node:test";
import assert from "node:assert/strict";
import { buildXlsx } from "./xlsx-builder.mjs";
import { analyzeValue, Corpus } from "./detect.ts";
import { openSession } from "./session.ts";
import { acceptException, emptyReview, summarize } from "./review.ts";
import { patchWorkbookBytes } from "./xlsx-patcher.ts";
import { readWorkbook } from "./xlsx-reader.ts";
import { planJson } from "../../json-formation/engine/json-session.ts";

test("frequent trailing syllables mid-sentence stay high severity", () => {
  const corpus = new Corpus();
  for (let i = 0; i < 5; i++) corpus.add("can ho ba tang");
  assert.equal(analyzeValue("can ho ba? tang 3", { role: "freeText" }, { corpus })[0].severity, "high");
  assert.equal(acceptException(emptyReview(), "opaque", "abc").ok, false);
});

test("formula writes and numeric XML injection are rejected", () => {
  const bytes = buildXlsx([{ name: "Test", rows: [[{ f: "1+1", v: "2" }, { n: "1234.5599999999999" }]] }]);
  const wb = readWorkbook(bytes, { fileName: "synthetic.xlsx", fileHash: "test" });
  assert.throws(() => patchWorkbookBytes(bytes, wb, [{ sheet: "Test", row: 1, col: 0, value: "2", asNumber: false }]), /Formula/);
  assert.throws(() => patchWorkbookBytes(bytes, wb, [{ sheet: "Test", row: 1, col: 1, value: "1</v><f>EVIL()</f><v>1", asNumber: true }]), /numeric/);
  assert.equal(wb.sheets[0].rows[0].cells[1].v, "1234.5599999999999");
});

test("conflicting duplicate values block JSON even when caller supplies zero blockers", async () => {
  const headers = ["MACNTCTD", "MAKH", "MASOBD", "MALOAIBD", "GIATRI", "MOTABDS", "MOTABD"];
  const bytes = buildXlsx([{ name: "Test", rows: [headers, ["B", "C", "A", "303", { n: "1" }, "text", "text"], ["B", "C", "A", "303", { n: "2" }, "text", "text"]] }]);
  const session = await openSession(bytes, "synthetic.xlsx");
  const conflict = session.scan.issues.find(item => item.category === "CONFLICTING_DUPLICATE");
  assert.equal(conflict.severity, "high");
  assert.ok(summarize(emptyReview(), session.ctx).blocking > 0);
  const plan = planJson(session, emptyReview(), { KB001: "20261103", KB002: "Synthetic", KB003: "Test", KB004: "Fixture" }, undefined, { blocking: 0 });
  assert.equal(plan.ready, false);
  assert.equal(plan.bytes, null);
  assert.equal(plan.checks.find(item => item.id === "grouping").ok, false);
});
