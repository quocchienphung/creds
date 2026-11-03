"use client";

import { assistantModels } from "../affectui-assistant/assistant-models";
import { DelegateBoard } from "./DelegateBoard";
import type { DelegateAgent, DelegateTask } from "./delegate-model";

/**
 * The Project Management frame of the Guide me selector: the Delegate Board with project work handed to agents. Model
 * names come from the app's own model list (the one the composer offers), so they never drift from it; no price per
 * minute is set, so the queues total time. The clock is fixed (09:00) so the "Busy until" times read the same on the
 * server, on every device and in every test.
 */
const modelName = (id: string) => assistantModels.find(model => model.id === id)?.name ?? id;

const agents: readonly DelegateAgent[] = [
  { id: "planner", name: "Planner", model: modelName("claude-opus-5-5"), logo: "anthropic", current: 20 },
  { id: "writer", name: "Writer", model: modelName("claude-sonnet-5-5"), logo: "anthropic" },
  { id: "coder", name: "Coder", model: modelName("gpt-6-1-sol"), logo: "openai", current: 24 },
  { id: "ops", name: "Ops", model: modelName("gemini"), logo: "gemini" },
];

const work: readonly DelegateTask[] = [
  { id: "notes", title: "Write release notes", estimate: 12, tools: ["notion", "github"] },
  { id: "checkout", title: "Fix checkout test", estimate: 20, tools: ["github"] },
  { id: "calls", title: "Summarize churn calls", estimate: 15, tools: ["slack", "hubspot"] },
  { id: "pricing", title: "Update pricing page", estimate: 10, tools: ["figma"] },
  { id: "roadmap", title: "Review roadmap", estimate: 45, tools: ["notion"], agentId: "planner" },
  { id: "auth", title: "Refactor auth", estimate: 60, tools: ["github"], agentId: "coder" },
  { id: "sdk", title: "Upgrade SDK", estimate: 12, tools: ["stripe", "github"], agentId: "coder" },
];

const demoNow = new Date(2026, 0, 5, 9, 0).getTime();

export function ProjectDelegateBoard() {
  return <DelegateBoard agents={agents} tasks={work} now={demoNow} maxChips={2} />;
}
