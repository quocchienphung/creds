/**
 * Removed documents keep their originals and indexes for a short Undo window. If the page is closed inside it, the files would stay behind with no
 * way to reach them, so each removal is noted here (ids only) until the files are really deleted; the next visit to Storage finishes the job.
 */
export interface PendingPurge { workspaceId: string; id: string; at: number }
type Store = Pick<Storage, "getItem" | "setItem">;
const KEY = "logio-storage-pending-purge";
const MAX = 200;

function browserStore(): Store | undefined { try { return typeof localStorage === "undefined" ? undefined : localStorage; } catch { return undefined; } }
const valid = (item: unknown): item is PendingPurge => !!item && typeof item === "object" && typeof (item as PendingPurge).workspaceId === "string" && typeof (item as PendingPurge).id === "string" && Number.isFinite((item as PendingPurge).at);

export function readPending(store: Store | undefined = browserStore()): PendingPurge[] {
  try { const raw = JSON.parse(store?.getItem(KEY) ?? "[]") as unknown; return Array.isArray(raw) ? raw.filter(valid) : []; } catch { return []; }
}
function write(items: PendingPurge[], store: Store | undefined) { try { store?.setItem(KEY, JSON.stringify(items.slice(-MAX))); } catch { /* A full or blocked store only loses the safety net. */ } }

export function addPending(workspaceId: string, ids: readonly string[], at = Date.now(), store: Store | undefined = browserStore()) {
  const kept = readPending(store).filter(item => !(item.workspaceId === workspaceId && ids.includes(item.id)));
  write([...kept, ...ids.map(id => ({ workspaceId, id, at }))], store);
}
export function clearPending(workspaceId: string, ids: readonly string[], store: Store | undefined = browserStore()) {
  write(readPending(store).filter(item => !(item.workspaceId === workspaceId && ids.includes(item.id))), store);
}
/** Which noted removals of this workspace are old enough to finish (their Undo window, plus a grace for other tabs, is over), and how long until the next one is. */
export function duePending(items: readonly PendingPurge[], workspaceId: string, now: number, graceMs: number): { due: PendingPurge[]; waitMs: number | null } {
  const mine = items.filter(item => item.workspaceId === workspaceId);
  const due = mine.filter(item => now - item.at >= graceMs);
  const waits = mine.filter(item => now - item.at < graceMs).map(item => graceMs - (now - item.at));
  return { due, waitMs: waits.length ? Math.min(...waits) : null };
}
