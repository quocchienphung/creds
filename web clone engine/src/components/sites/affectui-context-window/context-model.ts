export type ContextItem = { id: string; label: string; tokens: number };
export type ContextPart = { id: string; label: string; tokens?: number; items?: ContextItem[]; compact?: number; color: number };

export const demoParts: ContextPart[] = [
  { id: "system", label: "System prompt", tokens: 4200, color: 1 },
  { id: "tools", label: "Tools", tokens: 12800, color: 2 },
  { id: "files", label: "Files", color: 3, items: [
    { id: "schema", label: "schema.prisma", tokens: 9400 },
    { id: "billing", label: "billing.ts", tokens: 21300 },
    { id: "notes", label: "meeting-notes.md", tokens: 15400 },
  ] },
  { id: "conversation", label: "Conversation", tokens: 108600, compact: .28, color: 4 },
  { id: "memory", label: "Memory", tokens: 3900, color: 5 },
];

export const tokensOf = (part: ContextPart) => part.items ? part.items.reduce((sum, item) => sum + item.tokens, 0) : (part.tokens ?? 0);
export const formatTokens = (value: number) => value >= 1000 ? `${(value / 1000).toFixed(1)}K` : `${Math.round(value)}`;

/** Round each cumulative boundary so the field stays proportional without accumulating rounding errors. */
export function contextCells(parts: ContextPart[], limit: number, count = 216): (ContextPart | null)[] {
  const result: (ContextPart | null)[] = [];
  let sum = 0;
  for (const part of parts) {
    const tokens = tokensOf(part);
    if (tokens <= 0) continue;
    sum += tokens;
    const end = Math.min(count, Math.max(result.length + 1, Math.round(sum / limit * count)));
    while (result.length < end) result.push(part);
  }
  while (result.length < count) result.push(null);
  return result;
}
