import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTree, isAttemptCard, taskIdOf } from "./run-view.ts";
import { modelLabel, modelChoices, problemsOf, providerOf, providers } from "./catalog.ts";
import { createNode, createSampleProcess, markOf, providerIds } from "./process-model.ts";
import { roster } from "./agent-roster.ts";
import { aiMarks } from "../affectui-agent-tree/ai-marks.generated.ts";
import { replay, startLog } from "./run-model.ts";
import { flatten, totalsOf } from "../affectui-agent-tree/tree-model.ts";

const doc = createSampleProcess(new Date("2026-10-21T09:00:00Z"));
const T0 = 2_000_000;

test("without a run every card is ready, with the AI block's mark and name", () => {
  const tree = buildTree(doc.root, { snapshot: null });
  assert.equal(flatten(tree).length, 9);
  assert.ok(flatten(tree).every(agent => agent.status === "idle"));
  assert.deepEqual([tree.mark, tree.model], ["anthropic", "Opus 5.5"]);
  assert.equal(tree.children[3].mark, "codex");
  assert.equal(tree.children[3].model, "GPT-6.1 Sol");
  assert.deepEqual([tree.children[1].mark, tree.children[1].model], ["kimi", "Kimi"]);
  assert.equal(tree.children[1].children[0].model, "Gemini");
  assert.deepEqual([tree.children[1].children[1].mark, tree.children[1].children[1].model], ["deepseek", "DeepSeek"]);
  assert.equal(tree.children[2].cost, undefined);
  assert.deepEqual([tree.badge, tree.children[3].children[1].badge], [{ label: "Coordinator", color: "#4f46e5" }, { label: "Fixer", color: "#d97706" }]);
});

test("with a run each card takes its task's status, cost and times", () => {
  const log = startLog(doc.root, doc.id, "usd", T0);
  const snap = replay(log, T0 + 1200);
  const tree = buildTree(doc.root, { snapshot: snap });
  const writer = flatten(tree).find(agent => agent.id === "writer");
  assert.equal(writer.status, "waiting");
  assert.equal(writer.ask, "Formal or friendly for the plan names? Both drafts are in Notion.");
  assert.equal(flatten(tree).find(agent => agent.id === "research").status, "running");
  assert.equal(flatten(tree).find(agent => agent.id === "scraper").status, "queued");
  assert.equal(totalsOf(tree).waiting, 1);
});

test("a retried task keeps its failed try as a card of its own", () => {
  let log = startLog(doc.root, doc.id, "usd", T0);
  const failAt = T0 + 700 + 700 + 3600 + 50; // root -> coder -> tester, each delegating after 700 ms, then 60% of 6 s
  assert.equal(buildTree(doc.root, { snapshot: replay(log, failAt) }).children[3].children[0].status, "failed");
  log = { ...log, events: [{ t: failAt, action: { type: "retry", id: "tester" } }] };
  const tree = buildTree(doc.root, { snapshot: replay(log, failAt + 1000) });
  const coder = tree.children[3];
  assert.deepEqual(coder.children.slice(0, 2).map(agent => [agent.id, agent.status]), [["tester~1", "failed"], ["tester", "running"]]);
  assert.equal(coder.children[2].id, "fixer");
  assert.equal(coder.children[2].status, "queued", "in sequence the fixer waits for the tester");
  assert.match(coder.children[0].error, /Simulated failure/);
  assert.equal(isAttemptCard("tester~1"), true);
  assert.equal(taskIdOf("tester~1"), "tester");
  assert.equal(taskIdOf("tester"), "tester");
  assert.deepEqual(totalsOf(tree).failed, 1);
});

test("a task that is not in the run yet (added after it started) is ready, not queued", () => {
  const snap = replay(startLog(doc.root, doc.id, "usd", T0), T0 + 100);
  const extended = { ...doc.root, children: [...doc.root.children, createNode({ id: "late", name: "Late" })] };
  assert.equal(buildTree(extended, { snapshot: snap }).children[4].status, "idle");
});

test("the roster: every AI engine has a unique id, a real logo and a place in the picker", () => {
  const ids = providers.map(item => item.id);
  assert.equal(new Set(ids).size, ids.length, "ids are unique");
  assert.ok(roster.length >= 70, `${roster.length} engines in the roster`);
  for (const entry of roster) {
    assert.ok(aiMarks[entry.id]?.html.includes("<path"), `${entry.id} has a drawn logo`);
    assert.equal(providerOf(entry.id).label, entry.label);
    assert.ok(providerIds.includes(entry.id), `${entry.id} is a valid provider`);
  }
  for (const name of ["Cursor", "Windsurf", "Cline", "Devin", "OpenHands", "Goose", "Kiro", "Trae", "Grok", "Perplexity", "LM Studio", "Groq", "OpenRouter"]) assert.ok(providers.some(item => item.label === name), name);
  assert.deepEqual([...new Set(providers.map(item => item.group))], ["Hosted models", "Coding agents", "Agent frameworks", "Local and open", "Routers and clouds", "Other"]);
  assert.equal(markOf("cursor"), "cursor");
  assert.equal(markOf("human"), undefined);
});

test("model names: the app's list, what the engine reports, then what was typed", () => {
  assert.equal(modelLabel("anthropic", "claude-sonnet-5-5"), "Sonnet 5.5");
  assert.equal(modelLabel("openai", "gpt-6-luna"), "GPT-6 Luna");
  assert.equal(modelLabel("ollama", ""), "Ollama");
  assert.equal(modelLabel("ollama", "llama3.2"), "llama3.2");
  assert.equal(modelLabel("ollama", "ollama:llama3.2", [{ id: "ollama:llama3.2", label: "Llama 3.2", provider: "ollama", local: true }]), "Llama 3.2");
  assert.equal(modelLabel("hermes", ""), "Hermes Agent");
  assert.equal(modelLabel("human", "x"), "Person");
  assert.equal(modelLabel("custom", ""), "Custom engine");
  assert.equal(providerOf("ollama").local, true);
  assert.equal(providers.length, 13 + roster.length);
  assert.equal(modelLabel("kimi", ""), "Kimi");
  assert.equal(modelLabel("claudecode", "claude-opus-5-5"), "Opus 5.5");
  assert.equal(modelLabel("codex", "gpt-6-luna"), "GPT-6 Luna");
  assert.equal(providerOf("kimi").needsModel, false);
  const choices = modelChoices("ollama", [{ id: "ollama:a", label: "A", provider: "ollama", local: true }, { id: "x", label: "X", provider: "openai", local: false }]);
  assert.deepEqual(choices.map(item => item.id), ["ollama:a"]);
  assert.ok(modelChoices("anthropic", []).length >= 4);
});

test("problems are reported next to the task, not found when the run fails", () => {
  assert.deepEqual(problemsOf(createNode({ task: "Do it" })), []);
  assert.deepEqual(problemsOf(createNode({ task: " " })), ["Describe the task."]);
  assert.deepEqual(problemsOf(createNode({ task: "x", ai: { provider: "ollama", model: "", instructions: "" } })), ["Choose a model for Ollama."]);
  assert.deepEqual(problemsOf(createNode({ task: "x", ai: { provider: "human", model: "", instructions: "" } })).length, 1);
  assert.deepEqual(problemsOf(createNode({ task: "x", approval: true, ai: { provider: "human", model: "", instructions: "" } })), []);
  assert.deepEqual(problemsOf(createNode({ task: "x", ai: { provider: "hermes", model: "", instructions: "" } })), []);
});
