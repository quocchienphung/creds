import assert from "node:assert/strict";
import test from "node:test";
import { addPending, clearPending, duePending, readPending } from "./storage-purge.ts";

const fake = () => { const data = new Map(); return { getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); }, data }; };

test("noted removals are read back, per workspace, and cleared by id", () => {
  const store = fake();
  addPending("a", ["1", "2"], 1000, store);
  addPending("b", ["1"], 2000, store);
  assert.deepEqual(readPending(store).map(item => [item.workspaceId, item.id, item.at]), [["a", "1", 1000], ["a", "2", 1000], ["b", "1", 2000]]);
  clearPending("a", ["1"], store);
  assert.deepEqual(readPending(store).map(item => `${item.workspaceId}:${item.id}`), ["a:2", "b:1"]);
});

test("noting the same document again moves it instead of duplicating it", () => {
  const store = fake();
  addPending("a", ["1"], 1000, store);
  addPending("a", ["1"], 5000, store);
  assert.deepEqual(readPending(store), [{ workspaceId: "a", id: "1", at: 5000 }]);
});

test("a damaged or missing store reads as empty and never throws", () => {
  const store = fake();
  assert.deepEqual(readPending(store), []);
  store.setItem("logio-storage-pending-purge", "{not json");
  assert.deepEqual(readPending(store), []);
  store.setItem("logio-storage-pending-purge", JSON.stringify([{ workspaceId: "a" }, { workspaceId: "a", id: "x", at: 1 }, 7]));
  assert.deepEqual(readPending(store), [{ workspaceId: "a", id: "x", at: 1 }]);
  assert.deepEqual(readPending(undefined), []);
  assert.doesNotThrow(() => addPending("a", ["1"], 1, undefined));
  assert.doesNotThrow(() => addPending("a", ["1"], 1, { getItem: () => null, setItem: () => { throw new Error("full"); } }));
});

test("only removals past their window are due, and the wait to the next one is reported", () => {
  const items = [{ workspaceId: "a", id: "old", at: 0 }, { workspaceId: "a", id: "fresh", at: 9000 }, { workspaceId: "b", id: "other", at: 0 }];
  const { due, waitMs } = duePending(items, "a", 12000, 12000);
  assert.deepEqual(due.map(item => item.id), ["old"]);
  assert.equal(waitMs, 9000);
  assert.deepEqual(duePending([], "a", 1, 1), { due: [], waitMs: null });
});
