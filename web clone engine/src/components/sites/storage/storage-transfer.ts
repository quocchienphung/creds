import type { WorkspaceBackend } from "../../../lib/workspace-backend/types.ts";
import type { KnowledgeIndex } from "../../../lib/storage/knowledge-contract.ts";
import type { StorageDocument } from "./storage-model.ts";
import { deleteVault, readVault, writeVault } from "./storage-vault.ts";

function remote(backend: WorkspaceBackend) {
  if (!backend.knowledge) throw new Error("This backend needs the Storage document API. See the Storage API contract to connect it.");
  return backend.knowledge;
}
export async function storeStorageDocument(backend: WorkspaceBackend, workspaceId: string, document: StorageDocument, file: File, index: KnowledgeIndex, signal: AbortSignal) {
  if (backend.remote) {
    const receipt = await remote(backend).save(workspaceId, document.id, file, index, document.sha256, signal);
    if (receipt.id !== document.id || receipt.sha256 !== document.sha256 || receipt.bytes !== document.bytes) throw new Error("The backend document receipt does not match this file.");
    // A remote document is durable even when this browser cannot retain an optional cache.
    try { await writeVault(workspaceId, document.id, { blob: file, ...index }); } catch { /* The server remains the source of truth. */ }
    return;
  }
  await writeVault(workspaceId, document.id, { blob: file, ...index });
  if (signal.aborted) { await deleteVault(workspaceId, document.id); signal.throwIfAborted(); }
}
export async function loadStorageIndex(backend: WorkspaceBackend, workspaceId: string, id: string, signal?: AbortSignal): Promise<KnowledgeIndex | undefined> {
  if (backend.remote) return remote(backend).load(workspaceId, id, signal);
  return readVault(workspaceId, id);
}
export async function loadStorageOriginal(backend: WorkspaceBackend, workspaceId: string, document: StorageDocument): Promise<Blob> {
  const blob = backend.remote ? await remote(backend).download(workspaceId, document.id) : (await readVault(workspaceId, document.id))?.blob;
  if (!blob) throw new Error("The original is unavailable on this device. Restore your browser data or upload the document again.");
  if (blob.size !== document.bytes) throw new Error("The downloaded original has an unexpected file size.");
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  const sha256 = [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, "0")).join("");
  if (sha256 !== document.sha256) throw new Error("The downloaded original failed its fingerprint check.");
  return blob;
}
export async function removeStorageDocument(backend: WorkspaceBackend, workspaceId: string, id: string) {
  if (backend.remote) {
    await remote(backend).remove(workspaceId, id);
    try { await deleteVault(workspaceId, id); } catch { /* An unavailable optional cache cannot block server deletion. */ }
  } else await deleteVault(workspaceId, id);
}
export async function searchStorageDocuments(backend: WorkspaceBackend, workspaceId: string, ids: string[], query: string, signal: AbortSignal) {
  if (backend.remote) return remote(backend).search(workspaceId, query, signal);
  const matches: string[] = [];
  for (const id of ids) {
    signal.throwIfAborted();
    if ((await readVault(workspaceId, id))?.text.toLocaleLowerCase().includes(query.toLocaleLowerCase())) matches.push(id);
  }
  return matches;
}
