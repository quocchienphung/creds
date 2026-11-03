import assert from "node:assert/strict";
import test from "node:test";
import { applyDocumentEdit, draftName, draftOfDocument, inspectDocumentDraft, isDocumentDirty, restoreDocuments, splitName, withoutDocuments } from "./storage-edit.ts";
import { parseStorageLibrary } from "./storage-model.ts";

const doc = (id, name, extra = {}) => ({ id, name, category: "Finance", bytes: 10, mime: "text/plain", sha256: id.padEnd(64, "a").slice(0, 64).replace(/[^a-f0-9]/g, "a"), addedAt: "2026-10-01T00:00:00.000Z", words: 2, chunks: 1, excerpt: "x", keywords: ["x"], extraction: "indexed", ...extra });
const library = (...documents) => ({ version: 1, onboarded: true, documents });

test("the extension is the file's type and stays out of the draft", () => {
  assert.deepEqual(splitName("report.final.pdf"), { base: "report.final", ext: ".pdf" });
  assert.deepEqual(splitName("notes"), { base: "notes", ext: "" });
  assert.deepEqual(splitName(".env"), { base: ".env", ext: "" });
  const d = doc("a1", "budget.xlsx");
  assert.deepEqual(draftOfDocument(d), { base: "budget", category: "Finance" });
  assert.equal(draftName(d, { base: "  plan 2027 ", category: "Finance" }), "plan 2027.xlsx");
});

test("a fresh draft is clean; a new name or area makes it dirty; spaces around the name do not", () => {
  const d = doc("a1", "budget.xlsx");
  assert.equal(isDocumentDirty(d, draftOfDocument(d)), false);
  assert.equal(isDocumentDirty(d, { base: " budget ", category: "Finance" }), false);
  assert.equal(isDocumentDirty(d, { base: "budget 2", category: "Finance" }), true);
  assert.equal(isDocumentDirty(d, { base: "budget", category: "Banking" }), true);
});

test("the name is checked in words", () => {
  const d = doc("a1", "budget.xlsx");
  assert.match(inspectDocumentDraft(d, { base: "   ", category: "Finance" }).error, /name/);
  assert.match(inspectDocumentDraft(d, { base: "a/b", category: "Finance" }).error, /can’t contain/);
  assert.match(inspectDocumentDraft(d, { base: "a\nb", category: "Finance" }).error, /control/);
  assert.match(inspectDocumentDraft(d, { base: "x".repeat(240), category: "Finance" }).error, /limit is 240/);
  assert.equal(inspectDocumentDraft(d, { base: "x".repeat(234), category: "Finance" }).ok, true, "234 + .xlsx is exactly 240");
  assert.match(inspectDocumentDraft(d, { base: "ok", category: "Poetry" }).error, /knowledge areas/);
});

test("an edit changes only name and area, and the library still parses", () => {
  const a = doc("a1", "budget.xlsx"), b = doc("b2", "rates.csv");
  const next = applyDocumentEdit(library(a, b), "a1", { base: "plan", category: "Banking" });
  assert.deepEqual(next.documents.map(d => [d.name, d.category]), [["plan.xlsx", "Banking"], ["rates.csv", "Finance"]]);
  assert.deepEqual({ ...next.documents[0], name: a.name, category: a.category }, a, "id, fingerprint, size, date and index are untouched");
  assert.ok(parseStorageLibrary(next));
  assert.throws(() => applyDocumentEdit(library(a), "zzz", { base: "x", category: "Finance" }), /no longer/);
  assert.throws(() => applyDocumentEdit(library(a), "a1", { base: "", category: "Finance" }), /name/);
});

test("removing remembers where each document stood, and restoring puts them back there", () => {
  const docs = ["a1", "b2", "c3", "d4"].map(id => doc(id, `${id}.txt`));
  const { library: rest, removed } = withoutDocuments(library(...docs), ["b2", "d4", "nope"]);
  assert.deepEqual(rest.documents.map(d => d.id), ["a1", "c3"]);
  assert.deepEqual(removed.map(r => [r.document.id, r.index]), [["b2", 1], ["d4", 3]]);
  assert.deepEqual(restoreDocuments(rest, removed).documents.map(d => d.id), ["a1", "b2", "c3", "d4"]);
  assert.deepEqual(restoreDocuments(rest, [...removed].reverse()).documents.map(d => d.id), ["a1", "b2", "c3", "d4"], "order of the list does not matter");
});

test("restoring is idempotent and refuses an identical twin that was uploaded meanwhile", () => {
  const a = doc("a1", "a.txt"), b = doc("b2", "b.txt");
  const { library: rest, removed } = withoutDocuments(library(a, b), ["a1"]);
  const back = restoreDocuments(rest, removed);
  assert.equal(restoreDocuments(back, removed).documents.length, 2);
  const twin = doc("zz9", "a-copy.txt", { sha256: a.sha256 });
  assert.throws(() => restoreDocuments(library(twin, b), removed), /identical copy/);
});
