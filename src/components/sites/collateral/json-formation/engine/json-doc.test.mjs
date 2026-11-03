import { test } from "node:test";
import assert from "node:assert/strict";
import { COPY_LIMIT, childrenOf, resolve, rootInfo, searchDocument, textOf } from "./json-doc.ts";

const report = { KB001: "20260930", KB002: "A", CNTCTD: [{ TTC01: "00000001", KHACHHANG: [{ TTC03: "C1", THONGTINBD: [{ TS001: "X1", TS013: "Ke hoach" }, { TS001: "X2", TS013: "Hang hoa" }] }] }] };

test("the root and a page of children carry what a row needs, and a path that matches the viewer's", () => {
  assert.equal(rootInfo(report, "report").count, 3); assert.equal(rootInfo(report, "report").path, "report");
  const kids = childrenOf(report, "report", [], 0, 10);
  assert.deepEqual(kids.map(k => k.path), ["report.KB001", "report.KB002", "report.CNTCTD"]);
  assert.equal(kids[2].preview, "[…]"); assert.equal(kids[0].text, '"20260930"');
  const assets = childrenOf(report, "report", ["CNTCTD", "0", "KHACHHANG", "0", "THONGTINBD"], 1, 2);
  assert.equal(assets.length, 1); assert.equal(assets[0].path, "report.CNTCTD[0].KHACHHANG[0].THONGTINBD[1]"); assert.equal(assets[0].key, "1"); assert.equal(assets[0].isIndex, true);
  assert.equal(childrenOf(report, "report", ["KB001"], 0, 5).length, 0, "a primitive has no children");
});

test("a search finds keys and values, and tells the keys to walk to each hit", () => {
  const found = searchDocument(report, "report", "hang hoa");
  assert.equal(found.hits.length, 1);
  assert.deepEqual(found.hits[0].trail.map(s => s.key), ["CNTCTD", "0", "KHACHHANG", "0", "THONGTINBD", "1", "TS013"]);
  assert.equal(found.hits[0].path, "report.CNTCTD[0].KHACHHANG[0].THONGTINBD[1].TS013");
  assert.equal(resolve(report, found.hits[0].trail.map(s => s.key)), "Hang hoa");
});

test("copy: the text of a value, and a refusal above the limit", () => {
  assert.equal(textOf(report, ["KB001"]), "20260930");
  assert.ok(textOf(report, ["CNTCTD", "0"]).includes('"TTC01": "00000001"'));
  const huge = { a: "x".repeat(COPY_LIMIT + 10) };
  assert.equal(textOf(huge, ["a"]), null); assert.equal(textOf(huge, []), null);
});

test("numbers kept as exact text in the report are numbers in the viewer, in search and in copy (the exported file has no $num)", () => {
  const withNumbers = { KB001: "20260930", CNTCTD: [{ TTC01: "1", KHACHHANG: [{ TTC03: "C", THONGTINBD: [{ TS001: "A", TS005: { $num: "318244" }, TS006: { $num: "1000.4" }, TS008: { $num: "0" }, TS009: [] }] }] }] };
  const keys = ["CNTCTD", "0", "KHACHHANG", "0", "THONGTINBD", "0"];
  const asset = childrenOf(withNumbers, "report", keys, 0, 10);
  const ts005 = asset.find(item => item.key === "TS005");
  assert.deepEqual([ts005.type, ts005.text, ts005.plain, ts005.count, ts005.preview], ["number", "318244", "318244", 0, ""], "a leaf, not an object with a $num key");
  assert.equal(childrenOf(withNumbers, "report", [...keys, "TS005"], 0, 5).length, 0, "nothing to open under a number");
  assert.equal(asset.find(item => item.key === "TS006").text, "1000.4");
  assert.equal(rootInfo(withNumbers, "report").count, 2);
  const hit = searchDocument(withNumbers, "report", "318244");
  assert.deepEqual(hit.hits.map(item => item.path), ["report.CNTCTD[0].KHACHHANG[0].THONGTINBD[0].TS005"], "found on the field itself, never on $num");
  assert.equal(searchDocument(withNumbers, "report", "$num").hits.length, 0);
  assert.equal(textOf(withNumbers, [...keys, "TS006"]), "1000.4");
  const piece = textOf(withNumbers, keys);
  assert.ok(piece.includes('"TS005": 318244') && piece.includes('"TS006": 1000.4') && !piece.includes("$num"));
  assert.deepEqual(JSON.parse(piece).TS005, 318244, "what is copied parses as the file would");
});
