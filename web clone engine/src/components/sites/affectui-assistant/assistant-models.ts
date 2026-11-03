import type { PickerModel } from "../affectui-model-picker/model-picker-logic";

export type AssistantProvider = "auto" | "claude" | "chatgpt" | "gemini";
export type AssistantModel = PickerModel & { provider: AssistantProvider };

/**
 * The models the composer offers. `id` is what the chat API receives in `model`, so it must match what the
 * backend accepts. This is the one place to add, remove or re-rate a model (a screen can also pass its own
 * list to AssistantHome).
 *
 * Read before trusting the numbers:
 * - speed / quality / cost (1-5, cost 5 = most expensive) are this product's own relative ratings, not
 *   benchmarks published by the providers.
 * - latencyMs is an indicative time to the first token, and pricePerM an output price per million tokens
 *   in dollars, taken from third-party summaries of provider price lists. Both change over time: verify them
 *   against each provider and edit here. The OpenAI ids and names come from conflicting third-party lists and
 *   are unverified.
 * - Gemini carries ratings only; without latency and price its footer shows the description.
 */
export const assistantModels: AssistantModel[] = [
  { id: "claude-fable-5-1", provider: "claude", name: "Fable 5.1", description: "Deepest reasoning", speed: 2, quality: 5, cost: 5, latencyMs: 2400, pricePerM: 50 },
  { id: "claude-opus-5-5", provider: "claude", name: "Opus 5.5", description: "Hardest problems", speed: 3, quality: 5, cost: 4, latencyMs: 1500, pricePerM: 20 },
  { id: "claude-sonnet-5-5", provider: "claude", name: "Sonnet 5.5", description: "Everyday work", speed: 4, quality: 4, cost: 3, latencyMs: 900, pricePerM: 10 },
  { id: "claude-haiku-5-5", provider: "claude", name: "Haiku 5.5", description: "Quick and light", speed: 5, quality: 3, cost: 1, latencyMs: 400, pricePerM: 0.5 },
  { id: "gpt-6-astra", provider: "chatgpt", name: "GPT-6 Astra", description: "Flagship reasoning", speed: 2, quality: 5, cost: 5, latencyMs: 2200, pricePerM: 50 },
  { id: "gpt-6-1-sol", provider: "chatgpt", name: "GPT-6.1 Sol", description: "Balanced all-rounder", speed: 4, quality: 4, cost: 3, latencyMs: 800, pricePerM: 10 },
  { id: "gpt-6-luna", provider: "chatgpt", name: "GPT-6 Luna", description: "Fast and cheap", speed: 5, quality: 3, cost: 1, latencyMs: 350, pricePerM: 0.5 },
  { id: "gemini", provider: "gemini", name: "Gemini", description: "Long documents", speed: 4, quality: 4, cost: 3 },
  { id: "auto", provider: "auto", name: "Auto", description: "Picks per message" },
];

/** Model ids saved by earlier versions, which named a provider instead of a model. */
const legacyModelIds: Record<string, string> = { claude: "claude-sonnet-5-5", chatgpt: "gpt-6-1-sol" };

/** A stored or received model id turned into one the list knows; anything else becomes Auto. */
export function resolveModelId(raw: unknown, models: readonly { id: string }[] = assistantModels): string {
  const id = typeof raw === "string" ? (legacyModelIds[raw] ?? raw) : "";
  return models.some(model => model.id === id) ? id : "auto";
}

export type AssistantEffort = "low" | "medium" | "high";
export const resolveEffort = (raw: unknown): AssistantEffort => (raw === "low" || raw === "high" ? raw : "medium");
