import type { QueueEntry } from "./queue-model";

/** Queue always stores originals on disk, including when the rest of the workspace uses browser storage. */
export async function queueRequest(workspaceId: string, suffix = "", init: RequestInit = {}) {
  const config = globalThis.__workspaceBackendConfig;
  const base = (config?.baseUrl || process.env.NEXT_PUBLIC_WORKSPACE_API_URL || "/api/workspace").replace(/\/+$/, "");
  const headers = new Headers(config?.headers ? await config.headers() : undefined);
  new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  const response = await (config?.fetch ?? fetch)(`${base}/workspaces/${encodeURIComponent(workspaceId)}/collateral-queue${suffix}`, {
    ...init, headers, cache: "no-store", credentials: config?.credentials ?? "same-origin",
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message || `Queue request failed (${response.status}).`);
  }
  return response;
}

export async function listQueue(workspaceId: string, signal?: AbortSignal): Promise<QueueEntry[]> {
  const response = await queueRequest(workspaceId, "", { signal });
  return (await response.json() as { data: QueueEntry[] }).data;
}

export async function uploadQueueFile(workspaceId: string, file: File): Promise<QueueEntry> {
  const response = await queueRequest(workspaceId, "", { method: "POST", body: file, headers: { "Content-Type": "application/octet-stream", "x-file-name": encodeURIComponent(file.name) } });
  return (await response.json() as { data: QueueEntry }).data;
}

export async function readQueueFile(workspaceId: string, entry: QueueEntry): Promise<File> {
  const response = await queueRequest(workspaceId, `/${entry.id}`);
  const blob = await response.blob();
  // Detect a damaged/incomplete original before opening it as if it were the saved upload.
  if (blob.size !== entry.size) throw new Error("The stored original has a different size. Try refreshing Queue.");
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  if (hash !== entry.sha256) throw new Error("The stored original failed its SHA-256 check.");
  return new File([blob], entry.name, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export async function patchQueueEntry(workspaceId: string, id: string, patch: Partial<Pick<QueueEntry, "status" | "error" | "sheets" | "rows">>): Promise<QueueEntry> {
  const response = await queueRequest(workspaceId, `/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
  return (await response.json() as { data: QueueEntry }).data;
}
