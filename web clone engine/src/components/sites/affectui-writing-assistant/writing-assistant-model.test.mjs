import test from "node:test";
import assert from "node:assert/strict";
import { chatReducer, defaultContent, dictatedText, dictationWordCount, emptyChat, isBusy, sampleWriter, timing, tokenize, visibleText, wordInterval } from "./writing-assistant-model.ts";

const run = (...actions) => actions.reduce(chatReducer, emptyChat);
const last = state => state.messages[state.messages.length - 1];

test("the four suggestions and the dictation sentence reach the replies measured on the preview", () => {
  const replies = [...defaultContent.suggestions, defaultContent.dictation].map(sampleWriter);
  assert.match(replies[0], /^I fixed two typos/);
  assert.match(replies[1], /^Here's a tighter version/);
  assert.match(replies[2], /^I softened the opening/);
  assert.match(replies[3], /^Hi Sam, thanks for the update/);
  assert.match(replies[4], /^Hi team, just a friendly nudge/);
  assert.equal(new Set(replies).size, 5);
});

test("rules are tried in order and anything else gets the open first-draft reply", () => {
  assert.match(sampleWriter("Make this email sound warmer"), /^I fixed two typos/);
  assert.match(sampleWriter("Please shorten this paragraph"), /^Here's a tighter version/);
  assert.match(sampleWriter("Write a friendly reminder"), /^Hi team/);
  assert.match(sampleWriter("Draft an apology"), /^Got it\. Here's a first draft/);
  assert.match(sampleWriter(""), /^Got it/);
});

test("tokens keep trailing whitespace so revealing words never reflows earlier text", () => {
  const tokens = tokenize("Hi team,\n\nthanks!");
  assert.deepEqual(tokens, ["Hi ", "team,\n\n", "thanks!"]);
  assert.equal(tokens.join(""), "Hi team,\n\nthanks!");
  assert.deepEqual(tokenize(""), []);
  assert.deepEqual(tokenize("  "), ["  "]);
});

test("sending adds the user message and a Writing line, trims the text and ignores blanks", () => {
  const state = run({ type: "send", text: "  Make it shorter  " });
  assert.equal(state.messages.length, 2);
  assert.deepEqual(state.messages[0], { id: 1, role: "user", text: "Make it shorter" });
  assert.equal(last(state).status, "writing");
  assert(isBusy(state));
  assert.equal(run({ type: "send", text: "   " }), emptyChat);
});

test("a second message cannot be sent while a reply is on its way", () => {
  const busy = run({ type: "send", text: "one" });
  assert.equal(chatReducer(busy, { type: "send", text: "two" }), busy);
  const streaming = chatReducer(busy, { type: "reply", text: "a b c" });
  assert.equal(chatReducer(streaming, { type: "send", text: "two" }), streaming);
  const done = chatReducer(streaming, { type: "reveal", count: 99 });
  assert(!isBusy(done));
  assert.equal(chatReducer(done, { type: "send", text: "two" }).messages.length, 4);
});

test("a reply shows its first word at once, then reveals word by word to done", () => {
  let state = run({ type: "send", text: "hi" }, { type: "reply", text: "Hello there my friend" });
  assert.equal(last(state).status, "streaming");
  assert.equal(visibleText(last(state)), "Hello ");
  state = chatReducer(state, { type: "reveal", count: 3 });
  assert.equal(visibleText(last(state)), "Hello there my ");
  state = chatReducer(state, { type: "reveal", count: 2 });
  assert.equal(last(state).shown, 3, "never reveals backwards");
  state = chatReducer(state, { type: "reveal", count: 4 });
  assert.equal(last(state).status, "done");
  assert.equal(visibleText(last(state)), "Hello there my friend");
});

test("an instant reply (reduced motion) is done immediately and a one-word reply never streams", () => {
  assert.equal(last(run({ type: "send", text: "hi" }, { type: "reply", text: "a b c", instant: true })).status, "done");
  assert.equal(last(run({ type: "send", text: "hi" }, { type: "reply", text: "Done." })).status, "done");
  assert.equal(last(run({ type: "send", text: "hi" }, { type: "reply", text: "" })).status, "done");
});

test("stale replies and reveals are ignored once a message is no longer in that phase", () => {
  const done = run({ type: "send", text: "hi" }, { type: "reply", text: "a b", instant: true });
  assert.equal(chatReducer(done, { type: "reply", text: "other" }), done);
  assert.equal(chatReducer(done, { type: "reveal", count: 1 }), done);
  assert.equal(chatReducer(done, { type: "fail" }), done);
  assert.equal(chatReducer(emptyChat, { type: "reveal", count: 1 }), emptyChat);
});

test("a failed reply becomes an error line, frees the chat and keeps the user's message", () => {
  const failed = run({ type: "send", text: "hi" }, { type: "fail" });
  assert.equal(last(failed).status, "error");
  assert(!isBusy(failed));
  assert.equal(failed.messages[0].text, "hi");
});

test("New chat clears everything and ids keep counting up within a chat", () => {
  const two = run({ type: "send", text: "a" }, { type: "reply", text: "x", instant: true }, { type: "send", text: "b" });
  assert.deepEqual(two.messages.map(message => message.id), [1, 2, 3, 4]);
  assert.equal(chatReducer(two, { type: "reset" }), emptyChat);
});

test("long replies stream within the cap, short ones at the measured per-word pace", () => {
  assert.equal(wordInterval(20), timing.wordMs);
  assert(wordInterval(400) * 400 <= timing.streamCapMs + 1e-6);
  assert.equal(wordInterval(0), timing.wordMs);
});

test("dictation reveals the sentence word by word", () => {
  const sentence = defaultContent.dictation;
  assert.equal(dictationWordCount(sentence), 11);
  assert.equal(dictatedText(sentence, 0), "");
  assert.equal(dictatedText(sentence, 3), "Write a friendly");
  assert.equal(dictatedText(sentence, 99), sentence);
  assert.equal(dictatedText("  spaced   out ", 2), "spaced out");
});
