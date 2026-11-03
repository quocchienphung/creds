/** The pure rules of the model picker: no React, no DOM, so they can be tested on their own. */
export type Effort = "low" | "medium" | "high";
export const efforts: readonly Effort[] = ["low", "medium", "high"];
export const effortLabels: Record<Effort, string> = { low: "Low", medium: "Medium", high: "High" };
/** How much longer the first token takes while extended thinking is on, per effort. */
export const effortFactor: Record<Effort, number> = { low: 1.6, medium: 2.5, high: 4 };
/** Number of segments in a speed / quality / cost bar. */
export const BAR_SEGMENTS = 5;

export interface PickerModel {
  id: string;
  name: string;
  /** One short line, two or three words. */
  description?: string;
  /** A small mark for the row (a React node). Defaults to the first letter of the name. */
  icon?: unknown;
  /** Strengths from 1 to 5 (cost 5 is the most expensive). Leave all three out for a router, whose row says "Varies". */
  speed?: number;
  quality?: number;
  cost?: number;
  /** Time to the first token without thinking, in milliseconds. */
  latencyMs?: number;
  /** Price per million tokens, in dollars. */
  pricePerM?: number;
}

export const hasRatings = (model: PickerModel) => model.speed !== undefined && model.quality !== undefined && model.cost !== undefined;
export const clampRating = (value: number | undefined) => Math.max(0, Math.min(BAR_SEGMENTS, Math.round(value ?? 0)));

export function latencySeconds(model: PickerModel, thinking: boolean, effort: Effort): number | null {
  if (model.latencyMs === undefined) return null;
  return (model.latencyMs / 1000) * (thinking ? effortFactor[effort] : 1);
}
/** "2.1s" style: one decimal. */
export const formatSeconds = (seconds: number) => `${Math.max(0, seconds).toFixed(1)}s`;
export const priceDecimals = (price: number) => (Number.isInteger(price) ? 0 : 2);
/** Whole dollars when the price is whole ("$25"), otherwise cents ("$0.50"). */
export const formatPrice = (price: number, decimals = priceDecimals(price)) => `$${Math.max(0, price).toFixed(decimals)}`;

/** The line the footer shows for a model: first-token time and price when known, otherwise its description. */
export interface Caption { seconds: number | null; price: number | null; text: string; key: string }
export function captionFor(model: PickerModel | undefined, thinking: boolean, effort: Effort): Caption {
  if (!model) return { seconds: null, price: null, text: "", key: "text:" };
  const seconds = latencySeconds(model, thinking, effort), price = model.pricePerM ?? null;
  if (seconds === null && price === null) return { seconds, price, text: model.description ?? "", key: "text:" + (model.description ?? "") };
  return { seconds, price, text: "", key: "stats:" + (seconds === null ? "-" : "s") + (price === null ? "-" : "p") };
}
/** What a screen reader hears when the footer changes: the final figures, never the rolling ones. */
export function spokenCaption(model: PickerModel | undefined, caption: Caption) {
  if (!model) return "";
  if (!caption.key.startsWith("stats:")) return caption.text ? model.name + ": " + caption.text : model.name;
  const parts = [caption.seconds === null ? "" : "about " + formatSeconds(caption.seconds) + " to the first token", caption.price === null ? "" : formatPrice(caption.price) + " per million tokens"].filter(Boolean);
  return model.name + ": " + parts.join(", ");
}
export function rowLabel(model: PickerModel) {
  const bits = [model.name + (model.description ? ", " + model.description : "")];
  if (hasRatings(model)) bits.push("Speed " + clampRating(model.speed) + ", quality " + clampRating(model.quality) + ", cost " + clampRating(model.cost) + " of " + BAR_SEGMENTS);
  return bits.join(". ");
}

/** Ease-out used for the rolling figures. */
export const easeOutQuad = (t: number) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 2;
export const TWEEN_MS = 380;

/** Arrow / Home / End movement through a list that wraps around. Returns the same index for other keys. */
export function moveIndex(key: string, index: number, count: number) {
  if (count <= 0) return 0;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  if (key === "ArrowDown") return (index + 1) % count;
  if (key === "ArrowUp") return (index - 1 + count) % count;
  return index;
}
/** The effort one step away (wrapping), for the arrow keys in the radio group. */
export function stepEffort(current: Effort, direction: 1 | -1): Effort {
  return efforts[(efforts.indexOf(current) + direction + efforts.length) % efforts.length];
}

/** Where the menu goes: below or above the trigger, and how tall it may be. */
export function placeMenu(input: { triggerTop: number; triggerBottom: number; viewportHeight: number; naturalHeight: number; side: "auto" | "top" | "bottom"; gap?: number; margin?: number }) {
  const gap = input.gap ?? 6, margin = input.margin ?? 8;
  const below = Math.max(0, input.viewportHeight - input.triggerBottom - gap - margin), above = Math.max(0, input.triggerTop - gap - margin);
  const side = input.side === "auto" ? (below >= input.naturalHeight || below >= above ? "bottom" : "top") : input.side;
  return { side, maxHeight: side === "bottom" ? below : above } as const;
}
