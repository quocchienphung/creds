export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
export const MAX_TEXT_CHARS = 1_000_000;
export interface KnowledgeIndex { text: string; chunks: string[] }
export interface KnowledgeReceipt { id: string; sha256: string; bytes: number }
/** Document bytes and indexes use the same configured workspace auth/transport as resources. */
export interface KnowledgeTransport {
  save(workspaceId: string, id: string, file: File, index: KnowledgeIndex, sha256: string, signal?: AbortSignal): Promise<KnowledgeReceipt>;
  load(workspaceId: string, id: string, signal?: AbortSignal): Promise<KnowledgeIndex>;
  download(workspaceId: string, id: string, signal?: AbortSignal): Promise<Blob>;
  remove(workspaceId: string, id: string, signal?: AbortSignal): Promise<void>;
  search(workspaceId: string, query: string, signal?: AbortSignal): Promise<string[]>;
}
export function knowledgeChunks(text: string): string[] {
  const chunks: string[] = [];
  for (let at = 0; at < text.length; at += 1400) chunks.push(text.slice(at, at + 1600));
  return chunks;
}
export function parseKnowledgeIndex(raw: unknown): KnowledgeIndex | undefined {
  if (!raw || typeof raw !== "object" || !("text" in raw) || !("chunks" in raw)) return;
  if (typeof raw.text !== "string" || raw.text.length > MAX_TEXT_CHARS || raw.text.includes("\0") || !Array.isArray(raw.chunks)) return;
  const expected = knowledgeChunks(raw.text);
  if (raw.chunks.length !== expected.length || !raw.chunks.every((part, i) => part === expected[i])) return;
  return { text: raw.text, chunks: expected };
}
