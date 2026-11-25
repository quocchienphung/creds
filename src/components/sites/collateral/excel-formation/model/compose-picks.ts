import type { Issue } from "../engine/types.ts";

/** Replace each suspicious word of `value` by the candidate the reviewer picked for it; words without a pick stay as they are. */
export function composeFromPicks(value: string, tokens: NonNullable<Issue["tokens"]>, picks: Record<number, string>): string {
  let out = "", at = 0;
  tokens.forEach((token, index) => { out += value.slice(at, token.start) + (picks[index] ?? value.slice(token.start, token.end)); at = token.end; });
  return out + value.slice(at);
}
