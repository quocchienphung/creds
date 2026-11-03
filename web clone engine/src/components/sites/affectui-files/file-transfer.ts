import type { WorkspaceBackend } from "@/lib/workspace-backend/types";
import { safeFileUrl } from "./files-model";
import type { LibraryFile } from "./files-model";

/** Binary data stays out of localStorage and resource JSON. Production uses the host's upload adapter. */
async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("logio-file-library", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("blobs");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("File storage is unavailable. Please try again or connect your workspace backend."));
  });
}
async function blobOperation(mode: IDBTransactionMode, id: string, file?: File): Promise<Blob | undefined> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction("blobs", mode), store = transaction.objectStore("blobs");
      const request = file ? store.put(file, id) : store.get(id);
      transaction.oncomplete = () => resolve(file ? undefined : request.result as Blob | undefined);
      transaction.onabort = transaction.onerror = () => reject(new Error("Could not store this file. Your device may be out of space."));
    });
  } finally { db.close(); }
}
export async function uploadLibraryFile(backend: WorkspaceBackend, workspaceId: string, file: File, signal: AbortSignal): Promise<Pick<LibraryFile, "url" | "localBlobId">> {
  if (file.size > 20 * 1024 * 1024) throw new Error("Choose a file smaller than 20 MB.");
  if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
  if (backend.remote) {
    if (!backend.upload) throw new Error("This backend does not support file uploads yet.");
    const result = await backend.upload(workspaceId, "document", file, signal);
    if (!safeFileUrl(result.url)) throw new Error("The upload server returned an invalid file URL.");
    return result;
  }
  const localBlobId = crypto.randomUUID();
  await blobOperation("readwrite", localBlobId, file);
  return { localBlobId };
}
export async function downloadLibraryFile(file: LibraryFile) {
  if (file.url) {
    if (!safeFileUrl(file.url)) throw new Error("This file URL is invalid.");
    const link = document.createElement("a"); link.href = file.url; link.download = file.name; link.target = "_blank"; link.rel = "noopener noreferrer"; link.click(); return;
  }
  const blob = file.localBlobId ? await blobOperation("readonly", file.localBlobId) : file.text !== undefined ? new Blob([file.text], { type: "text/plain;charset=utf-8" }) : undefined;
  if (!blob) throw new Error("This file is no longer available on this device. Upload it again.");
  const url = URL.createObjectURL(blob), link = document.createElement("a");
  link.href = url; link.download = file.localBlobId ? file.name : `${file.name}.txt`; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 3000);
}
