import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, open, readFile, readdir, rename, rm, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { dataRoot, StoreError, validWorkspaceId } from "./workspace-store.ts";

export const QUEUE_UPLOAD_LIMIT = 120 * 1024 * 1024;
export const QUEUE_UNDO_MS = 8000;
export interface QueueDeleteReceipt { undoToken: string; expiresAt: string }
interface DeletionMarker { tokenHash: string; expiresAt: string }
export type QueueStatus = "uploaded" | "ready" | "failed";
export interface QueueEntry {
  id: string;
  name: string;
  size: number;
  sha256: string;
  uploadedAt: string;
  status: QueueStatus;
  error?: string;
  sheets?: number;
  rows?: number;
}
export type QueueUpdate = Pick<QueueEntry, "status" | "error" | "sheets" | "rows">;

const idRule = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const statuses: readonly string[] = ["uploaded", "ready", "failed"];
const count = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

function rootFor(workspaceId: string) {
  if (!validWorkspaceId(workspaceId)) throw new StoreError("Invalid workspace id.", 400);
  return path.resolve(dataRoot(), "workspaces", workspaceId, "collateral-queue");
}
/** Verify the absolute target before writing, renaming or recursively deleting it. */
function within(root: string, segment: string) {
  const target = path.resolve(root, segment), relative = path.relative(root, target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new StoreError("Invalid queue path.", 400);
  return target;
}
function directory(workspaceId: string, id: string) {
  if (!idRule.test(id)) throw new StoreError("Invalid queue entry id.", 400);
  return within(rootFor(workspaceId), id);
}
function trashDirectory(workspaceId: string, id: string) {
  directory(workspaceId, id);
  return within(rootFor(workspaceId), `.deleted-${id}`);
}
function validFileName(name: string) {
  return name.length > 0 && name.length <= 255 && /\.xlsx$/i.test(name) && !/[\x00-\x1f\x7f/\\]/.test(name);
}
function validEntry(value: unknown): value is QueueEntry {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<QueueEntry>;
  return typeof item.id === "string" && idRule.test(item.id) && typeof item.name === "string" && validFileName(item.name)
    && count(item.size) && item.size > 0 && item.size <= QUEUE_UPLOAD_LIMIT
    && typeof item.sha256 === "string" && /^[a-f0-9]{64}$/.test(item.sha256)
    && typeof item.uploadedAt === "string" && Number.isFinite(Date.parse(item.uploadedAt))
    && typeof item.status === "string" && statuses.includes(item.status)
    && (item.error === undefined || typeof item.error === "string")
    && (item.sheets === undefined || count(item.sheets)) && (item.rows === undefined || count(item.rows));
}

const locks = new Map<string, Promise<unknown>>();
async function locked<T>(key: string, action: () => Promise<T>): Promise<T> {
  const next = (locks.get(key) ?? Promise.resolve()).then(action, action);
  locks.set(key, next);
  try { return await next; } finally { if (locks.get(key) === next) locks.delete(key); }
}
async function loadAt(dir: string, id: string): Promise<QueueEntry> {
  try {
    const value: unknown = JSON.parse(await readFile(path.join(dir, "metadata.json"), "utf8"));
    if (!validEntry(value) || value.id !== id) throw new Error("Invalid queue metadata");
    return value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new StoreError("This upload is no longer in the queue.", 404);
    throw new StoreError("The saved upload metadata could not be read.", 500);
  }
}
const load = (workspaceId: string, id: string) => loadAt(directory(workspaceId, id), id);

async function readDeletion(dir: string): Promise<DeletionMarker> {
  try {
    const value: unknown = JSON.parse(await readFile(path.join(dir, "deletion.json"), "utf8"));
    if (!value || typeof value !== "object" || !("tokenHash" in value) || typeof value.tokenHash !== "string" || !/^[a-f0-9]{64}$/.test(value.tokenHash)
      || !("expiresAt" in value) || typeof value.expiresAt !== "string" || !Number.isFinite(Date.parse(value.expiresAt))) throw new Error("Invalid deletion marker");
    return { tokenHash: value.tokenHash, expiresAt: value.expiresAt };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      try { await readdir(dir); }
      catch (missing) { if ((missing as NodeJS.ErrnoException).code === "ENOENT") throw new StoreError("The undo window has ended.", 410); throw missing; }
    }
    throw new StoreError("The saved deletion marker could not be read. The file has not been purged.", 500);
  }
}

const purgeTimers = new Map<string, NodeJS.Timeout>();
function clearPurgeTimer(trash: string) {
  const timer = purgeTimers.get(trash);
  if (timer) clearTimeout(timer);
  purgeTimers.delete(trash);
}
async function purgeTrash(trash: string, id: string, now: number): Promise<boolean> {
  const marker = await readDeletion(trash);
  if (Date.parse(marker.expiresAt) > now) return false;
  await loadAt(trash, id);
  // Keep metadata/marker available for a retry if Windows refuses to delete a locked original.
  try { await unlink(path.join(trash, "original.xlsx")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  await rm(trash, { recursive: true, force: false });
  clearPurgeTimer(trash);
  return true;
}
function schedulePurge(active: string, trash: string, id: string, expiresAt: string) {
  clearPurgeTimer(trash);
  const timer = setTimeout(() => {
    purgeTimers.delete(trash);
    void locked(active, async () => {
      try { await purgeTrash(trash, id, Date.now()); }
      catch (error) {
        // A restored entry has no trash directory. Other failures remain durable for the next request's sweep.
        if (error instanceof StoreError && error.status === 410) return;
        process.emitWarning("Queue deletion cleanup failed; the next queue request will retry. The expired file has not been reported as purged.", { code: "LOGIO_QUEUE_PURGE_FAILED" });
      }
    });
  }, Math.max(1, Date.parse(expiresAt) - Date.now() + 1));
  timer.unref();
  purgeTimers.set(trash, timer);
}

/** Durable recovery: every queue request scans tombstones; after a restart, expired ones purge and live windows regain timers. */
export async function sweepExpiredQueueUploads(workspaceId: string, now = Date.now()): Promise<void> {
  const root = rootFor(workspaceId);
  let children;
  try { children = await readdir(root, { withFileTypes: true }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
  await Promise.all(children.filter(child => child.isDirectory() && child.name.startsWith(".deleted-") && idRule.test(child.name.slice(9))).map(child => {
    const id = child.name.slice(9), active = directory(workspaceId, id), trash = trashDirectory(workspaceId, id);
    return locked(active, async () => {
      let marker: DeletionMarker;
      try { marker = await readDeletion(trash); }
      catch (error) {
        // Another request restored/purged this directory while this scan was waiting for its lock.
        if (error instanceof StoreError && error.status === 410) return;
        throw error;
      }
      if (Date.parse(marker.expiresAt) <= now) await purgeTrash(trash, id, now);
      else { await loadAt(trash, id); schedulePurge(active, trash, id, marker.expiresAt); }
    });
  }));
}

/** Original bytes are streamed to a private staging directory; the entry appears only after both files exist. */
export async function saveQueueUpload(workspaceId: string, name: string, chunks: AsyncIterable<Uint8Array>): Promise<QueueEntry> {
  const root = rootFor(workspaceId);
  if (!validFileName(name)) throw new StoreError("Choose an .xlsx workbook with a valid file name.", 400);
  const id = randomUUID(), dir = directory(workspaceId, id), staging = within(root, `.pending-${id}`);
  await mkdir(staging, { recursive: true });
  let size = 0;
  const hash = createHash("sha256");
  try {
    const file = await open(path.join(staging, "original.xlsx"), "wx");
    try {
      for await (const chunk of chunks) {
        size += chunk.byteLength;
        if (size > QUEUE_UPLOAD_LIMIT) throw new StoreError("The workbook exceeds 120 MiB.", 413);
        hash.update(chunk);
        await file.writeFile(chunk);
      }
    } finally { await file.close(); }
    if (!size) throw new StoreError("The workbook is empty.", 400);
    const entry: QueueEntry = { id, name, size, sha256: hash.digest("hex"), uploadedAt: new Date().toISOString(), status: "uploaded" };
    await writeFile(path.join(staging, "metadata.json"), JSON.stringify(entry), "utf8");
    await rename(staging, dir);
    return entry;
  } finally { await rm(staging, { recursive: true, force: true }); }
}

export async function listQueueUploads(workspaceId: string): Promise<QueueEntry[]> {
  await sweepExpiredQueueUploads(workspaceId);
  const root = rootFor(workspaceId);
  let children;
  try { children = await readdir(root, { withFileTypes: true }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  const entries = await Promise.all(children.filter(child => child.isDirectory() && idRule.test(child.name)).map(async child => {
    const dir = directory(workspaceId, child.name);
    return locked(dir, async () => {
      try { return await load(workspaceId, child.name); }
      catch (error) { if (error instanceof StoreError && error.status === 404) return null; throw error; }
    });
  }));
  return entries.filter((entry): entry is QueueEntry => !!entry).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt) || b.id.localeCompare(a.id));
}

export async function downloadQueueUpload(workspaceId: string, id: string) {
  const dir = directory(workspaceId, id);
  return locked(dir, async () => {
    const entry = await load(workspaceId, id);
    let bytes: Buffer;
    try { bytes = await readFile(path.join(dir, "original.xlsx")); }
    catch { throw new StoreError("The saved workbook could not be read.", 500); }
    if (bytes.byteLength !== entry.size || createHash("sha256").update(bytes).digest("hex") !== entry.sha256) throw new StoreError("The saved workbook failed its integrity check.", 500);
    return { entry, bytes };
  });
}

export function parseQueueUpdate(value: unknown): QueueUpdate | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Partial<QueueUpdate>;
  if (!item.status || !statuses.includes(item.status)
    || (item.error !== undefined && (typeof item.error !== "string" || item.error.length > 1500))
    || (item.sheets !== undefined && !count(item.sheets)) || (item.rows !== undefined && !count(item.rows))) return null;
  return { status: item.status, ...(item.error !== undefined ? { error: item.error } : {}), ...(item.sheets !== undefined ? { sheets: item.sheets } : {}), ...(item.rows !== undefined ? { rows: item.rows } : {}) };
}

/** Worker-reported processing status; originals and identity cannot be changed through this endpoint. */
export async function updateQueueUpload(workspaceId: string, id: string, update: QueueUpdate): Promise<QueueEntry> {
  const dir = directory(workspaceId, id), parsed = parseQueueUpdate(update);
  if (!parsed) throw new StoreError("Invalid upload processing status.", 400);
  return locked(dir, async () => {
    const current = await load(workspaceId, id);
    const { error: priorError, sheets: priorSheets, rows: priorRows, ...identity } = current;
    void priorError; void priorSheets; void priorRows;
    const next: QueueEntry = { ...identity, ...parsed };
    const temp = path.join(dir, `metadata-${randomUUID()}.tmp`);
    try { await writeFile(temp, JSON.stringify(next), "utf8"); await rename(temp, path.join(dir, "metadata.json")); }
    finally { await rm(temp, { force: true }); }
    return next;
  });
}

export async function removeQueueUpload(workspaceId: string, id: string): Promise<void> {
  const dir = directory(workspaceId, id);
  return locked(dir, async () => {
    await load(workspaceId, id);
    // Keep metadata discoverable when Windows refuses to unlink a locked original. A retry can finish a prior partial removal.
    try { await unlink(path.join(dir, "original.xlsx")); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    // A rejected filesystem operation propagates to the API; the UI must not report a successful delete.
    await rm(dir, { recursive: true, force: false });
  });
}

/** Hide atomically, retaining the original identity and bytes for exactly the server's eight-second undo window. */
export async function deleteQueueUpload(workspaceId: string, id: string, now = Date.now()): Promise<QueueDeleteReceipt> {
  const active = directory(workspaceId, id), trash = trashDirectory(workspaceId, id);
  return locked(active, async () => {
    await load(workspaceId, id);
    const undoToken = randomBytes(32).toString("hex"), expiresAt = new Date(now + QUEUE_UNDO_MS).toISOString();
    const marker: DeletionMarker = { tokenHash: createHash("sha256").update(undoToken).digest("hex"), expiresAt };
    const temp = path.join(active, `deletion-${randomUUID()}.tmp`);
    try {
      await writeFile(temp, JSON.stringify(marker), "utf8");
      await rename(temp, path.join(active, "deletion.json"));
      await rename(active, trash);
    } catch (error) {
      await rm(temp, { force: true });
      throw error;
    }
    schedulePurge(active, trash, id, expiresAt);
    return { undoToken, expiresAt };
  });
}

export async function restoreQueueUpload(workspaceId: string, id: string, undoToken: string, now = Date.now()): Promise<QueueEntry> {
  const active = directory(workspaceId, id), trash = trashDirectory(workspaceId, id);
  if (!/^[a-f0-9]{64}$/.test(undoToken)) throw new StoreError("Invalid undo token.", 403);
  return locked(active, async () => {
    const marker = await readDeletion(trash);
    const given = createHash("sha256").update(undoToken).digest();
    if (!timingSafeEqual(given, Buffer.from(marker.tokenHash, "hex"))) throw new StoreError("Invalid undo token.", 403);
    if (Date.parse(marker.expiresAt) <= now) {
      await purgeTrash(trash, id, now);
      throw new StoreError("The undo window has ended.", 410);
    }
    const entry = await loadAt(trash, id);
    let bytes: Buffer;
    try { bytes = await readFile(path.join(trash, "original.xlsx")); }
    catch { throw new StoreError("The deleted workbook could not be read.", 500); }
    if (bytes.byteLength !== entry.size || createHash("sha256").update(bytes).digest("hex") !== entry.sha256) throw new StoreError("The deleted workbook failed its integrity check.", 500);
    await rename(trash, active);
    clearPurgeTimer(trash);
    await rm(path.join(active, "deletion.json"), { force: true });
    return entry;
  });
}
