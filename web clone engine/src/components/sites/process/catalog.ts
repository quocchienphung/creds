import { assistantModels } from "../affectui-assistant/assistant-models.ts";
import { roster } from "./agent-roster.ts";
import type { Provider, ProcessNode } from "./process-model.ts";
import type { EngineInfo } from "./engine.ts";

/**
 * Who can do a task. The hosted models (Claude, ChatGPT, Gemini) and their names come from the app's own model list
 * (`affectui-assistant/assistant-models.ts`, the one the chat composer offers), so they never drift from it. Hermes
 * Agent and Ollama run on the person's machine: they have no fixed model list here, so the model is typed (or picked from
 * what the engine reports installed) instead of invented. A person and a custom engine need no model.
 */
export interface ProviderInfo { id: Provider; label: string; hint: string; group: string; local: boolean; needsModel: boolean; placeholder: string }

const groupOrder = ["Hosted models", "Coding agents", "Agent frameworks", "Local and open", "Routers and clouds", "Other"];
const listed: ProviderInfo[] = [
  { id: "anthropic", label: "Claude", hint: "Anthropic", group: "Hosted models", local: false, needsModel: true, placeholder: "Pick a Claude model" },
  { id: "claudecode", label: "Claude Code", hint: "Anthropic's coding agent", group: "Coding agents", local: false, needsModel: false, placeholder: "Optional: a Claude model" },
  { id: "openai", label: "ChatGPT", hint: "OpenAI", group: "Hosted models", local: false, needsModel: true, placeholder: "Pick a ChatGPT model" },
  { id: "codex", label: "Codex", hint: "OpenAI's coding agent", group: "Coding agents", local: false, needsModel: false, placeholder: "Optional: a GPT model" },
  { id: "gemini", label: "Gemini", hint: "Google", group: "Hosted models", local: false, needsModel: true, placeholder: "Pick a Gemini model" },
  { id: "kimi", label: "Kimi", hint: "Moonshot AI", group: "Hosted models", local: false, needsModel: false, placeholder: "Optional: the Kimi model to use" },
  { id: "hermes", label: "Hermes Agent", hint: "Runs on this machine", group: "Local and open", local: true, needsModel: false, placeholder: "Optional: the model it uses" },
  { id: "ollama", label: "Ollama", hint: "Runs on this machine", group: "Local and open", local: true, needsModel: true, placeholder: "Type a model installed in Ollama" },
  { id: "qwen", label: "Qwen", hint: "Open models, Alibaba", group: "Local and open", local: true, needsModel: false, placeholder: "Optional: the Qwen model to use" },
  { id: "deepseek", label: "DeepSeek", hint: "Open models", group: "Local and open", local: true, needsModel: false, placeholder: "Optional: the DeepSeek model to use" },
  { id: "mistral", label: "Mistral", hint: "Open models", group: "Local and open", local: true, needsModel: false, placeholder: "Optional: the Mistral model to use" },
  ...roster.map((entry): ProviderInfo => ({ id: entry.id, label: entry.label, hint: entry.hint, group: entry.group, local: entry.local, needsModel: false, placeholder: `Optional: the ${entry.label} model or setup to use` })),
  { id: "human", label: "A person", hint: "Decides or writes it themselves", group: "Other", local: false, needsModel: false, placeholder: "" },
  { id: "custom", label: "Custom engine", hint: "Your own chat bot or agent", group: "Other", local: false, needsModel: false, placeholder: "The engine's id" },
];
/** Grouped by kind, in the order the picker shows them; inside a group the order above is kept. */
export const providers: readonly ProviderInfo[] = groupOrder.flatMap(group => listed.filter(item => item.group === group));

export const providerOf = (id: Provider) => providers.find(item => item.id === id) ?? providers[0];

/** The coding agents run the same models as the chat composer lists for their maker. */
const assistantProvider: Partial<Record<Provider, string>> = { anthropic: "claude", claudecode: "claude", openai: "chatgpt", codex: "chatgpt", gemini: "gemini" };

/** The models of a hosted provider, as the chat composer lists them. */
export function modelsOf(provider: Provider): { id: string; label: string; hint?: string }[] {
  const key = assistantProvider[provider];
  return key ? assistantModels.filter(model => model.provider === key).map(model => ({ id: model.id, label: model.name, hint: model.description })) : [];
}

/** What the model option list offers for a provider: the app's models plus anything the engine reports for it. */
export function modelChoices(provider: Provider, engines: readonly EngineInfo[]) {
  const known = modelsOf(provider);
  const reported = engines.filter(engine => engine.provider === provider && !known.some(item => item.id === engine.id))
    .map(engine => ({ id: engine.id, label: engine.label, hint: engine.local ? "Installed here" : engine.note }));
  return [...known, ...reported];
}

/** The line under a task's name: the model's name, or what runs it. */
export function modelLabel(provider: Provider, model: string, engines: readonly EngineInfo[] = []): string {
  if (provider === "human") return "Person";
  const named = [...modelsOf(provider), ...engines.map(engine => ({ id: engine.id, label: engine.label }))].find(item => item.id === model)?.label;
  if (named) return named;
  if (model) return model;
  return providerOf(provider).label;
}

/** Why a task cannot run yet, if there is a reason: shown next to the AI block so the problem is not found only when the run fails. */
export function problemsOf(node: ProcessNode): string[] {
  const problems: string[] = [];
  const info = providerOf(node.ai.provider);
  if (!node.task.trim()) problems.push("Describe the task.");
  if (info.needsModel && !node.ai.model.trim()) problems.push(`Choose a model for ${info.label}.`);
  if (node.ai.provider === "custom" && !node.ai.model.trim()) problems.push("Give the custom engine an id.");
  if (node.ai.provider === "human" && !node.approval) problems.push("A person's task waits for them: turn on approval so they are asked.");
  return problems;
}
