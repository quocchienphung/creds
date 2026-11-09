"use client";

/**
 * The corrections of a workbook, kept in this browser (IndexedDB) under the file's hash as they are made, so a reload or a closed tab does not lose
 * them: opening the same file again brings them back. Nothing leaves the device. Every failure (private window, storage off) is silent: the page then
 * behaves as before, with corrections kept only until the tab closes.
 */
const DB = "collateral-progress", STORE = "files";

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await database();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = work(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}

export const readProgress = (fileHash: string): Promise<unknown> => run("readonly", store => store.get(fileHash)).catch(() => undefined);
export const writeProgress = (fileHash: string, file: unknown): Promise<unknown> => run("readwrite", store => store.put(file, fileHash)).catch(() => undefined);
export const dropProgress = (fileHash: string): Promise<unknown> => run("readwrite", store => store.delete(fileHash)).catch(() => undefined);
