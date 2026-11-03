import { storageCategories, type StorageCategory, type StorageDocument, type StorageLibrary } from "./storage-model.ts";

/** What the details editor of a document holds while it is open: the name without its extension, and the knowledge area. */
export interface DocumentDraft { base: string; category: StorageCategory }

/** "report.final.pdf" -> base "report.final", ext ".pdf" (the extension is the file's real type, so it is not editable). */
export function splitName(name: string): { base: string; ext: string } {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? { base: name.slice(0, dot), ext: name.slice(dot) } : { base: name, ext: "" };
}
export const draftOfDocument = (document: StorageDocument): DocumentDraft => ({ base: splitName(document.name).base, category: document.category });
export const draftName = (document: Pick<StorageDocument, "name">, draft: DocumentDraft) => `${draft.base.trim()}${splitName(document.name).ext}`;
/** Has anything been changed compared with what is stored? */
export const isDocumentDirty = (document: StorageDocument, draft: DocumentDraft) => draftName(document, draft) !== document.name || draft.category !== document.category;

export type DocumentInspection = { ok: true; name: string } | { ok: false; error: string };
/** Live check while typing: a name a file system and the library accept, and a known knowledge area. */
export function inspectDocumentDraft(document: Pick<StorageDocument, "name">, draft: DocumentDraft): DocumentInspection {
  const base = draft.base.trim();
  if (!base) return { ok: false, error: "Give the document a name." };
  if (/[\\/]/.test(base)) return { ok: false, error: "A name can’t contain / or \\." };
  if (/[\u0000-\u001f\u007f]/.test(base)) return { ok: false, error: "A name can’t contain line breaks or control characters." };
  const name = draftName(document, draft);
  if (name.length > 240) return { ok: false, error: `The name is ${name.length} characters; the limit is 240.` };
  if (!storageCategories.includes(draft.category)) return { ok: false, error: "Choose one of the knowledge areas." };
  return { ok: true, name };
}

/** The library with the edit applied to one document. Only its name and knowledge area change: id, fingerprint, size, date and index stay. Throws a sentence a person can act on. */
export function applyDocumentEdit(library: StorageLibrary, id: string, draft: DocumentDraft): StorageLibrary {
  const document = library.documents.find(item => item.id === id);
  if (!document) throw new Error("This document is no longer in the library.");
  const inspected = inspectDocumentDraft(document, draft);
  if (!inspected.ok) throw new Error(inspected.error);
  return { ...library, documents: library.documents.map(item => item.id === id ? { ...item, name: inspected.name, category: draft.category } : item) };
}

/** A removed document and where it stood (so Undo can put it back there). */
export interface Removed { document: StorageDocument; index: number }
export function withoutDocuments(library: StorageLibrary, ids: readonly string[]): { library: StorageLibrary; removed: Removed[] } {
  const removed = library.documents.flatMap((document, index) => ids.includes(document.id) ? [{ document, index }] : []);
  return { library: { ...library, documents: library.documents.filter(document => !ids.includes(document.id)) }, removed };
}
/** Put removed documents back at their old places (ascending, so each lands where it stood). A document already present is left alone; one whose twin was uploaded meanwhile cannot come back. */
export function restoreDocuments(library: StorageLibrary, removed: readonly Removed[]): StorageLibrary {
  const documents = [...library.documents];
  for (const { document, index } of [...removed].sort((a, b) => a.index - b.index)) {
    if (documents.some(item => item.id === document.id)) continue;
    if (documents.some(item => item.sha256 === document.sha256)) throw new Error(`An identical copy of ${document.name} was added meanwhile, so it can’t be restored.`);
    documents.splice(Math.max(0, Math.min(index, documents.length)), 0, document);
  }
  return { ...library, documents };
}
