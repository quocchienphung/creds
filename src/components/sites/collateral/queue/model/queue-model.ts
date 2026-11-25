export interface QueueEntry {
  id: string;
  name: string;
  size: number;
  sha256: string;
  uploadedAt: string;
  status: "uploaded" | "ready" | "failed";
  error?: string;
  sheets?: number;
  rows?: number;
}

export interface QueueDeleteReceipt { undoToken: string; expiresAt: string }

export type QueueTone = "scanned" | "failed" | "saved";
export const queueTone = (entry: Pick<QueueEntry, "status">): QueueTone => entry.status === "ready" ? "scanned" : entry.status === "failed" ? "failed" : "saved";

export function queueBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export function filterQueue(entries: readonly QueueEntry[], query: string, status: string) {
  const text = query.trim().toLocaleLowerCase();
  return entries.filter(entry => (!text || entry.name.toLocaleLowerCase().includes(text) || entry.sha256.includes(text)) && (status === "all" || entry.status === status));
}
