import { normalizeLibrary } from "./invoice-model";
import type { InvoiceLibrary } from "./invoice-model";
export interface InvoiceDataSource {
  load(signal?: AbortSignal): Promise<InvoiceLibrary | null>;
  save(library: InvoiceLibrary, commands?: unknown[]): Promise<void>;
}
export function createLocalInvoiceSource(key: string): InvoiceDataSource {
  return {
    async load() { const saved = localStorage.getItem(key); if (!saved) return null; const value = normalizeLibrary(JSON.parse(saved)); if (!value) throw new Error("The saved invoice data is invalid. Your stored copy has been kept."); return value; },
    async save(library) { localStorage.setItem(key, JSON.stringify(library)); },
  };
}
