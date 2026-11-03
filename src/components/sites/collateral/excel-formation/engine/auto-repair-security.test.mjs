import { test } from "node:test";
import assert from "node:assert/strict";
import { buildXlsx } from "./xlsx-builder.mjs";
import { openSession } from "./session.ts";
import { applyEdits, emptyReview } from "./review.ts";
import { autoRepair } from "./auto-repair.ts";
import { fingerprintBytes } from "./text.ts";
import { scanXml } from "./xml-scan.ts";
import { unzipBounded } from "./xlsx-zip.ts";
import { planJson } from "../../json-formation/engine/json-session.ts";
const headers = ["MACNTCTD", "MAKH", "MASOBD", "MALOAIBD", "GIATRI", "MOTABDS", "MOTABD"];

test("secondary-sheet critical corruption cannot bypass JSON gate with a fake zero summary", async () => {
  const s = await openSession(buildXlsx([{ name: 'Main', rows: [headers, ['001', '002', '003', '303', { n: '1' }, 'clean', 'clean']] }, { name: 'Extra', rows: [['dam?ged', '�']] }]), 'synthetic.xlsx');
  const plan = planJson(s, emptyReview(), { KB001: '20261103', KB002: 'Person', KB003: 'Role', KB004: 'Test' }, undefined, { blocking: 0 });
  assert.equal(plan.checks.find(c => c.id === 'serious-issues').ok, false);
  assert.equal(plan.bytes, null);
});
test("ambiguous headers block the JSON conversion; the text repair needs no mapping and still changes nothing without evidence", async () => {
  const s = await openSession(buildXlsx([{ name: 'Test', rows: [headers, headers, ['001', '002', '003', '303', { n: '1' }, 'm?y', 'may']] }]), 'synthetic.xlsx');
  assert.ok(s.scan.blockers.some(b => /header/.test(b)));
  const r = await autoRepair(s, emptyReview());
  assert.equal(r.report.status, "NO_REPAIR_APPLIED");
  assert.equal(r.report.metrics.outputCellsChanged, 0);
});
test("secure context is mandatory and has no fp53 fallback", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  try {
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: undefined });
    await assert.rejects(fingerprintBytes(new Uint8Array([1])), /Web Crypto/);
  } finally { Object.defineProperty(globalThis, 'crypto', descriptor); }
});
test("bad XML scalar entities and ZIP CRC mismatches are rejected", () => {
  for (const value of ['&#0;', '&#xD800;', '&#1114112;', '&unknown;', '\u0001']) assert.throws(() => [...scanXml(`<x>${value}</x>`)], /XML/);
  const bytes = buildXlsx([{ name: 'Test', rows: [['clean']] }]);
  const corrupted = bytes.slice();
  for (let i = 0; i < corrupted.length - 46; i++) if (corrupted[i] === 0x50 && corrupted[i + 1] === 0x4b && corrupted[i + 2] === 1 && corrupted[i + 3] === 2) { corrupted[i + 16] ^= 1; break; }
  assert.throws(() => unzipBounded(corrupted), /CRC/);
});
test("reversible mojibake requires a same-entity clean source and never touches protected code", async () => {
  const s = await openSession(buildXlsx([{ name: 'Test', rows: [headers, ['001', '002', '003', '303', { n: '1' }, 'CÃ´ng ty', 'Công ty'], ['001', '002', '?id', '303', { n: '1' }, 'CÃ´ng ty', 'Công ty']] }]), 'synthetic.xlsx');
  const result = await autoRepair(s, emptyReview());
  assert.equal(result.report.applied, 1);
  assert.equal(result.report.locations.find(d => d.status === 'source_verified').reasonCode, 'reversible_encoding_with_same_entity_source');
  assert.ok(result.report.locations.some(d => d.reasonCode === 'protected_or_unmapped_role'));
});
test("a manually edited original is excluded from clean source evidence", async () => {
  const s = await openSession(buildXlsx([{ name: 'Test', rows: [headers, ['001', '002', '003', '303', { n: '1' }, 'm?y moc', 'may moc']] }]), 'synthetic.xlsx');
  const state = applyEdits(emptyReview(), s.ctx, [{ sheet: 'Test', row: 2, col: 6, value: 'different reviewed text' }]);
  const result = await autoRepair(s, state);
  assert.equal(result.report.applied, 0);
  assert.equal(result.report.existingReviewPatches, 1);
  assert.equal(Object.keys(result.state.patches).length, 1);
});
test("semantic identifier protection wins over a legacy freeText column role", async () => {
  const head = [...headers, 'BIENKS'];
  const s = await openSession(buildXlsx([{ name: 'Test', rows: [head, ['001', '002', '003', '303', { n: '1' }, 'clean', 'clean', 'A?B'], ['001', '002', '003', '303', { n: '1' }, 'clean', 'clean', 'AXB']] }]), 'synthetic.xlsx');
  const result = await autoRepair(s, emptyReview());
  assert.equal(result.report.applied, 0);
  assert.ok(result.report.locations.some(d => d.role === 'identifier' && d.status === 'blocked'));
});
