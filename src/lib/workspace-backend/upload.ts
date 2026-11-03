import { BackendError } from "./types.ts";
import type { UploadKind, WorkspaceBackend } from "./types.ts";

/** The file's bytes as a `data:` URL, for storing it inside the saved JSON when there is nowhere else to put it. */
export async function readAsDataUrl(file: Blob): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let start = 0; start < bytes.length; start += 0x8000) binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  return `data:${file.type || "application/octet-stream"};base64,${btoa(binary)}`;
}

/**
 * Keeps a file the person chose and returns the address to show it from: the URL the backend stores it at, or
 * (this browser's storage, or a server that has no upload route) a data URL that is saved with the rest of the data.
 * `workspaceId` is undefined for account-level files such as the profile picture.
 */
export async function storeFile(backend: WorkspaceBackend, workspaceId: string | undefined, kind: UploadKind, file: File): Promise<string> {
  if (backend.upload) {
    try { return (await backend.upload(workspaceId, kind, file)).url; }
    catch (error) { if (!(error instanceof BackendError && error.code === "not-found")) throw error; }
  }
  return readAsDataUrl(file);
}
