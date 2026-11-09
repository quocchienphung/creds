import { test } from "node:test";
import assert from "node:assert/strict";
import { cacheKey, chunkDelay, chunkFields, chunkWords, countWords, defaultCount, defaultReadout, mulberry32, pointCountFor, readingMinutes, splitParagraphs, streamResult, targetWordsFor } from "./tldr-model.ts";

const text = "Linear made sync about 4x faster for its largest workspaces by replacing the full bootstrap snapshot with partial bootstrapping. The client now loads only what the first screen needs.";

test("lengths map to the targets the docs give: 35, 60, 85, 100 and 130 words, 3 to 7 points", () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(targetWordsFor), [35, 60, 85, 100, 130]);
  assert.deepEqual([1, 2, 3, 4, 5].map(pointCountFor), [3, 4, 5, 6, 7]);
  assert.equal(defaultReadout("summary", 2), "~60 words"); assert.equal(defaultReadout("points", 2), "4 points");
  assert.equal(defaultCount("summary", 58, 0), "58 words"); assert.equal(defaultCount("points", 0, 1), "1 point");
});

test("chunks of words are 3 to 8 words, and joining them gives the text back", () => {
  for (const seed of [1, 2, 3, 99]) {
    const chunks = chunkWords(text, mulberry32(seed));
    assert.equal(chunks.join(""), text);
    chunks.slice(0, -1).forEach(chunk => assert.ok(countWords(chunk) >= 3 && countWords(chunk) <= 8, chunk));
    assert.ok(countWords(chunks.at(-1)) >= 1 && countWords(chunks.at(-1)) <= 8);
  }
});

test("chunks of fields cut delimited text at its delimiters and lose nothing", () => {
  const line = '00123,"Dell Latitude, 14""",Hà Nội,185000000,2025-03-14,\n00124,Xe tải,Đà Nẵng,740000000,2024-11-02,Bảo hiểm';
  const chunks = chunkFields(line, mulberry32(7));
  assert.equal(chunks.join(""), line);
  assert.ok(chunks.every(chunk => chunk.length > 0));
  assert.ok(chunks.length >= 2);
});

test("the pace of a stream is 30 to 40 ms a chunk", () => {
  const random = mulberry32(5);
  for (let i = 0; i < 200; i++) { const ms = chunkDelay(random); assert.ok(ms >= 30 && ms <= 40); }
});

test("a result is cached per mode and length, and the article has one entry", () => {
  assert.equal(cacheKey("full", 4), cacheKey("full", 1)); assert.notEqual(cacheKey("summary", 2), cacheKey("summary", 3)); assert.notEqual(cacheKey("summary", 2), cacheKey("points", 2));
});

test("reading time is worked out at 230 words a minute, at least one minute", () => {
  assert.equal(readingMinutes([{ id: "a", text: "word ".repeat(460) }]), 2);
  assert.equal(readingMinutes([{ id: "a", text: "short" }]), 1);
});

test("a finished string streams as text events and a point list as point + text events", async () => {
  const control = new AbortController();
  const events = [];
  for await (const event of streamResult(text, control.signal, { random: mulberry32(3), skipPacing: true })) events.push(event);
  assert.ok(events.every(event => event.type === "text")); assert.equal(events.map(event => event.text).join(""), text);
  const points = [{ text: "One two three four.", source: "r2" }, { text: "Five six seven eight nine.", source: "r5" }];
  const seen = [];
  for await (const event of streamResult(points, control.signal, { random: mulberry32(3), skipPacing: true })) seen.push(event);
  assert.deepEqual(seen.filter(event => event.type === "point").map(event => event.source), ["r2", "r5"]);
  assert.equal(seen[0].type, "point"); assert.equal(seen.filter(event => event.type === "text").map(event => event.text).join(""), "One two three four.Five six seven eight nine.");
});

test("an aborted stream stops at once", async () => {
  const control = new AbortController();
  const events = [];
  for await (const event of streamResult(text.repeat(5), control.signal, { random: mulberry32(3), delay: () => 5 })) { events.push(event); if (events.length === 2) control.abort(); }
  assert.ok(events.length <= 3);
});

test("a blank line starts a new paragraph of a prose result", () => {
  assert.deepEqual(splitParagraphs("a\n\nb\n\n\nc"), ["a", "b", "c"]);
});

test("the simulation streams lead sentences for a summary and tied points for key points, and fails on request", async () => {
  const { simulateTldr } = await import("./tldr-model.ts");
  const article = { title: "T", paragraphs: [{ id: "a", text: "First sentence here. Second one follows." }, { id: "b", text: "Another paragraph starts. It goes on." }, { id: "c", text: "Third paragraph. More." }] };
  const run = async (mode, length, options) => { const out = []; for await (const event of simulateTldr({ mode, length, targetWords: 3, pointCount: length + 2, article, signal: new AbortController().signal }, { thinkMs: 1, skipPacing: true, random: mulberry32(2), ...options })) out.push(event); return out; };
  const summary = await run("summary", 1);
  assert.equal(summary.map(event => event.text).join(""), "First sentence here.");
  const points = await run("points", 1);
  assert.deepEqual(points.filter(event => event.type === "point").map(event => event.source), ["a", "b", "c"]);
  assert.equal(points.filter(event => event.type === "text").map(event => event.text).join(""), "First sentence here.Another paragraph starts.Third paragraph.");
  await assert.rejects(() => run("summary", 1, { fail: true }), /did not respond/);
});
