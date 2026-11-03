import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRows, childPath, countLabel, copyTextOf, markPieces, memorySource, previewOf, revealFor, rowLabel, scrollTarget, searchValue, typeLine, ROW_HEIGHT } from "./json-model.ts";

// The data of the public preview, rebuilt from what its rows say (docs/research/json-viewer/source/states.txt).
const events = Array.from({ length: 180 }, (_, i) => ({ id: `evt_${i}`, type: i === 131 ? "refund.requested" : "order.updated", at: 1757851200 + i, agent: `Firefox ${130 + i % 3} on Windows`, ...(i === 131 ? { note: "Refund requested for damaged lamp shade" } : {}) }));
const order = {
  id: "ord_8Kd2Q7", object: "order", status: "fulfilled", livemode: false, created: 1757851200, currency: "usd", amount_total: 48600,
  customer: { id: "cus_R3v9", name: "Emma Collins", email: "emma.collins@example.com", phone: "+1 555 0100", tier: "gold" },
  items: [{ sku: "LMP-1", name: "Lamp", quantity: 1, price: 2400 }, { sku: "LMP-2", name: "Shade", quantity: 2, price: 900 }, { sku: "BLB-9", name: "Bulb", quantity: 4, price: 300 }],
  shipping: { carrier: "UPS", service: "Ground", tracking: "1Z999AA10123456784", metadata: { zone: "2", signature: false } },
  discount: null, metadata: { "campaign id": "fall-26", "gift wrap": true }, events,
};
const source = () => memorySource(order, "order");
const rowsOf = (expanded, visible = {}) => buildRows({ source: source(), expanded: new Set(expanded), visible, pageSize: 50 }).rows;

test("the first render: the root open and its thirteen children, labelled as the preview labels them", () => {
  const rows = rowsOf(["order"]);
  assert.equal(rows.length, 14);
  assert.deepEqual(rows.slice(0, 3).map(r => r.label), ["order, object, 13 keys", "id: ord_8Kd2Q7", "object: order"]);
  assert.deepEqual([rows[8].label, rows[9].label, rows[10].label, rows[11].label, rows[12].label], ["customer, object, 5 keys", "items, array, 3 items", "shipping, object, 4 keys", "discount: null", "metadata, object, 2 keys"]);
  assert.equal(rows[1].posinset + "/" + rows[1].setsize, "1/13"); assert.equal(rows[13].posinset + "/" + rows[13].setsize, "13/13");
  assert.equal(rows[0].level, 0); assert.equal(rows[1].level, 1);
  assert.equal(rows[7].info.text, "48600"); assert.equal(rows[4].info.text, "false"); assert.equal(rows[2].info.text, '"order"'); assert.equal(rows[2].info.plain, "order");
});

test("a closed branch previews its keys, an open one does not: the exact strings of the preview", () => {
  assert.equal(previewOf(order.customer), "{ id, name, email, … }");
  assert.equal(previewOf(order.shipping), "{ carrier, service, tracking, … }");
  assert.equal(previewOf(order.metadata), "{ campaign id, gift wrap }");
  assert.equal(previewOf(order.events), "[…]");
  assert.equal(previewOf({}), "{}"); assert.equal(previewOf([]), "[]");
});

test("count labels, the type line under the tree, and paths", () => {
  assert.equal(countLabel("object", 13), "13 keys"); assert.equal(countLabel("array", 180), "180 items"); assert.equal(countLabel("array", 1), "1 item"); assert.equal(countLabel("object", 1), "1 key");
  const rows = rowsOf(["order"]);
  assert.equal(typeLine(rows[0].info), "object, 13 keys"); assert.equal(typeLine(rows[1].info), "string"); assert.equal(typeLine(rows[7].info), "number");
  assert.equal(childPath("order.events", "131", true), "order.events[131]"); assert.equal(childPath("order.events[131]", "note", false), "order.events[131].note");
  assert.equal(childPath("order.metadata", "gift wrap", false), 'order.metadata["gift wrap"]');
});

test("an open long array shows its first page, then a 'Show 50 more' row with what is left (65 rows, set size 51)", () => {
  const rows = rowsOf(["order", "order.events"]);
  assert.equal(rows.length, 14 + 50 + 1);
  const more = rows.at(-1);
  assert.equal(more.kind, "more"); assert.equal(more.label, "Show 50 more, 130 hidden"); assert.equal(more.level, 2); assert.equal(more.posinset, 51); assert.equal(more.setsize, 51);
  assert.equal(rows[14].label, "0, object, 4 keys"); assert.equal(rows[14].posinset + "/" + rows[14].setsize, "1/51"); assert.equal(rows[14].info.isIndex, true);
  assert.equal(rows[13].open, true);
  // the next page: 100 shown, 80 hidden, and the last page is only what is left
  assert.equal(rowsOf(["order", "order.events"], { "order.events": 100 }).at(-1).label, "Show 50 more, 80 hidden");
  assert.equal(rowsOf(["order", "order.events"], { "order.events": 150 }).at(-1).label, "Show 30 more, 30 hidden");
  assert.equal(rowsOf(["order", "order.events"], { "order.events": 180 }).at(-1).kind, "node");
});

test("search matches keys and primitive values, case-insensitively, in document order, with the way to each hit", () => {
  const one = searchValue(order, "order", "refund");
  assert.equal(one.hits.length, 2, "the type 'refund.requested' and the note both hold it");
  assert.equal(one.hits[1].path, "order.events[131].note");
  assert.deepEqual(one.hits[1].trail.map(s => s.index), [12, 131, 4], "events is the 13th key of the order, the note the 5th key of the event");
  assert.equal(searchValue(order, "order", "zzzz").hits.length, 0);
  assert.equal(searchValue(order, "order", "  ").hits.length, 0);
  assert.ok(searchValue(order, "order", "GROUND").hits.some(h => h.path === "order.shipping.service"), "case-insensitive");
  assert.ok(searchValue(order, "order", "tracking").hits.some(h => h.path === "order.shipping.tracking"), "keys are searched");
  assert.equal(searchValue(order, "order", "e", 25).hits.length, 25); assert.equal(searchValue(order, "order", "e", 25).capped, true);
});

test("revealing a hit opens every ancestor and shows exactly as many children as it takes (132 of 180, as on the preview)", () => {
  const hit = searchValue(order, "order", "damaged lamp").hits[0];
  const reveal = revealFor(hit, "order", 50);
  assert.deepEqual(reveal.open, ["order", "order.events", "order.events[131]"]);
  assert.equal(reveal.visible["order.events"], 132);
  const rows = rowsOf(reveal.open, reveal.visible);
  const events = rows.filter(r => r.level === 2 && r.parent === "order.events");
  assert.equal(events.length, 133, "132 events and the 'Show more' row"); assert.equal(events.at(-1).label, "Show 48 more, 48 hidden");
  assert.equal(rows.find(r => r.path === "order.events[131].note").label, "note: Refund requested for damaged lamp shade");
  assert.equal(rows.find(r => r.path === "order.events[131].note").posinset, 5);
});

test("marks: every occurrence of the query is flagged, whatever its case", () => {
  assert.deepEqual(markPieces('"Refund requested for refund"', "refund"), [{ text: '"', mark: false }, { text: "Refund", mark: true }, { text: " requested for ", mark: false }, { text: "refund", mark: true }, { text: '"', mark: false }]);
  assert.deepEqual(markPieces("abc", ""), [{ text: "abc", mark: false }]);
});

test("copy: a string as it is, a branch as indented JSON", () => {
  assert.equal(copyTextOf("ord_8Kd2Q7"), "ord_8Kd2Q7"); assert.equal(copyTextOf(48600), "48600"); assert.equal(copyTextOf(null), "null");
  assert.equal(copyTextOf({ a: 1 }), '{\n  "a": 1\n}');
  const s = source(); s.children("order", 0, 13);
  assert.equal(s.copyText("order.id", "value"), "ord_8Kd2Q7"); assert.equal(s.copyText("order.id", "path"), "order.id");
});

test("a primitive root is a single row, an empty branch has no children", () => {
  assert.equal(buildRows({ source: memorySource("hello", "root"), expanded: new Set(["root"]), visible: {}, pageSize: 50 }).rows.length, 1);
  const rows = buildRows({ source: memorySource({ a: [] }, "root"), expanded: new Set(["root", "root.a"]), visible: {}, pageSize: 50 }).rows;
  assert.deepEqual(rows.map(r => r.label), ["root, object, 1 key", "a, array, 0 items"]);
});

test("the scroll target keeps a row fully visible with a row of margin (measured: 36 px above the bottom edge after a downward jump)", () => {
  const index = 140, viewport = 380, height = 8952;
  const target = scrollTarget(index, 0, viewport, height);
  const rowTop = 6 + index * ROW_HEIGHT - target;
  assert.equal(viewport - (rowTop + ROW_HEIGHT), 36);
  assert.equal(scrollTarget(2, 0, viewport, height), 0, "already in view: nothing moves");
  assert.equal(scrollTarget(0, 500, viewport, height), 0, "a jump up to the top row");
  assert.equal(scrollTarget(100000, 0, viewport, 400), 20, "never past the end");
  assert.equal(rowLabel({ path: "x", key: "k", isIndex: false, type: "number", count: 0, text: "1", plain: "1", preview: "" }), "k: 1");
});

test("while the next page is on its way, the rows already here stay and a 'Loading' row follows them", () => {
  const full = memorySource({ list: Array.from({ length: 8 }, (_, i) => i) }, "root");
  const partial = { ...full, loaded: path => path === "root.list" ? 3 : 8, children: (path, from, to) => full.children(path, from, to) };
  const { rows, missing } = buildRows({ source: partial, expanded: new Set(["root", "root.list"]), visible: { "root.list": 6 }, pageSize: 50 });
  const list = rows.filter(r => r.parent === "root.list");
  assert.deepEqual(list.map(r => r.kind), ["node", "node", "node", "loading"]);
  assert.deepEqual(missing, [{ path: "root.list", from: 3, to: 6 }]);
  assert.equal(list[0].setsize, 4);
});
