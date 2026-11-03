import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { dataRoot, readResource, StoreError, validWorkspaceId } from "./workspace-store.ts";
import { indexDocument, parseStorageLibrary, validateDocument } from "../../components/sites/storage/storage-model.ts";
import { MAX_DOCUMENT_BYTES, MAX_TEXT_CHARS, parseKnowledgeIndex, type KnowledgeIndex, type KnowledgeReceipt } from "../storage/knowledge-contract.ts";
import { writeFile } from "node:fs/promises";

interface StoredIndex extends KnowledgeIndex { version: 1; name: string; mime: string; sha256: string; bytes: number }
const idRule = /^[A-Za-z0-9_-]{1,128}$/;
function rootFor(workspaceId: string) {
  if (!validWorkspaceId(workspaceId)) throw new StoreError("Invalid workspace id.", 400);
  return path.resolve(dataRoot(), "workspaces", workspaceId, "storage");
}
/** All paths, including cleanup targets, are checked inside the selected workspace storage root. */
function within(root: string, segment: string) {
  const target = path.resolve(root, segment), relative = path.relative(root, target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new StoreError("Invalid document path.", 400);
  return target;
}
function directory(workspaceId: string, id: string) {
  if (!idRule.test(id)) throw new StoreError("Invalid document id.", 400);
  return within(rootFor(workspaceId), id);
}
const locks = new Map<string, Promise<unknown>>();
async function locked<T>(key: string, action: () => Promise<T>): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve(), next = previous.then(action, action);
  locks.set(key, next);
  try { return await next; } finally { if (locks.get(key) === next) locks.delete(key); }
}
async function loadStored(workspaceId: string, id: string): Promise<StoredIndex> {
  const dir = directory(workspaceId, id);
  try {
    const value: unknown = JSON.parse(await readFile(path.join(dir, "index.json"), "utf8"));
    const index = parseKnowledgeIndex(value);
    if (!index || !value || typeof value !== "object" || !("version" in value) || value.version !== 1 || !("name" in value) || typeof value.name !== "string" || !("mime" in value) || typeof value.mime !== "string" || !("bytes" in value) || typeof value.bytes !== "number" || !Number.isSafeInteger(value.bytes) || value.bytes <= 0 || value.bytes > MAX_DOCUMENT_BYTES || !("sha256" in value) || typeof value.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(value.sha256)) throw new Error("Invalid stored index");
    return { version: 1, ...index, name: value.name, mime: value.mime, bytes: value.bytes, sha256: value.sha256 };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new StoreError("This document is not stored on the server.", 404);
    throw new StoreError("The stored document index could not be read.", 500);
  }
}
export async function saveKnowledge(workspaceId: string, id: string, file: File, text: string, sha256: string): Promise<KnowledgeReceipt> {
  const dir = directory(workspaceId, id);
  try { validateDocument(file); } catch (error) { throw new StoreError(error instanceof Error ? error.message : "Invalid document.", 400); }
  if (text.length > MAX_TEXT_CHARS * 2 || text.includes("\0") || !/^[a-f0-9]{64}$/.test(sha256)) throw new StoreError("Invalid document text or fingerprint.", 400);
  const bytes = Buffer.from(await file.arrayBuffer());
  if (createHash("sha256").update(bytes).digest("hex") !== sha256) throw new StoreError("The document fingerprint does not match its original bytes.", 400);
  const index = indexDocument(text);
  // HTML multipart normalizes field line endings to CRLF; restore the canonical text index.
  text = index.text;
  if (text.length > MAX_TEXT_CHARS) throw new StoreError("The document index exceeds 1,000,000 characters.", 400);
  const stored: StoredIndex = { version: 1, name: file.name, mime: file.type || "application/octet-stream", bytes: bytes.length, sha256, text, chunks: index.chunks };
  return locked(dir, async () => {
    try {
      const existing = await loadStored(workspaceId, id);
      if (existing.sha256 !== sha256 || existing.text !== text || existing.bytes !== bytes.length || existing.name !== file.name) throw new StoreError("A different document already uses this id.", 409);
      return { id, sha256, bytes: bytes.length };
    } catch (error) { if (!(error instanceof StoreError) || error.status !== 404) throw error; }
    const root = rootFor(workspaceId), staging = within(root, `.pending-${randomUUID()}`);
    await mkdir(staging, { recursive: true });
    try {
      await writeFile(path.join(staging, "original"), bytes);
      await writeFile(path.join(staging, "index.json"), JSON.stringify(stored), "utf8");
      await rename(staging, dir);
    } finally { await rm(staging, { recursive: true, force: true }); }
    return { id, sha256, bytes: bytes.length };
  });
}
export async function readKnowledge(workspaceId: string, id: string): Promise<KnowledgeIndex> {
  const stored = await loadStored(workspaceId, id);
  return { text: stored.text, chunks: stored.chunks };
}
export async function downloadKnowledge(workspaceId: string, id: string) {
  const stored = await loadStored(workspaceId, id);
  let bytes: Buffer;
  try { bytes = await readFile(path.join(directory(workspaceId, id), "original")); }
  catch { throw new StoreError("The original document could not be read.", 404); }
  if (bytes.length !== stored.bytes || createHash("sha256").update(bytes).digest("hex") !== stored.sha256) throw new StoreError("The stored original failed its integrity check.", 500);
  return { bytes, name: stored.name, sha256: stored.sha256 };
}
export async function removeKnowledge(workspaceId: string, id: string) {
  const dir = directory(workspaceId, id);
  return locked(dir, async () => {
    const manifest = await readResource(workspaceId, "knowledge-library");
    if (manifest && !parseStorageLibrary(manifest.data)) throw new StoreError("The library metadata is invalid. Restore it before deleting originals.", 409);
    if (manifest && parseStorageLibrary(manifest.data)?.documents.some(d => d.id === id)) throw new StoreError("Remove this document from the library metadata before deleting its original.", 409);
    await rm(dir, { recursive: true, force: true });
  });
}
export async function searchKnowledge(workspaceId: string, query: string) {
  rootFor(workspaceId);
  if (query.length > 256) throw new StoreError("Search up to 256 characters at a time.", 400);
  const stored = await readResource(workspaceId, "knowledge-library");
  if (!stored) return [];
  const library = parseStorageLibrary(stored.data);
  if (!library) throw new StoreError("The library metadata could not be read.", 500);
  const match = query.trim().toLocaleLowerCase(), ids: string[] = [];
  if (!match) return ids;
  for (const document of library.documents) {
    const metadata = `${document.name} ${document.category} ${document.excerpt} ${document.keywords.join(" ")}`.toLocaleLowerCase();
    if (metadata.includes(match)) { ids.push(document.id); continue; }
    try { if ((await readKnowledge(workspaceId, document.id)).text.toLocaleLowerCase().includes(match)) ids.push(document.id); }
    catch (error) { if (!(error instanceof StoreError) || error.status !== 404) throw error; }
  }
  return ids;
}
