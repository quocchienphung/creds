import { defineResource } from "../../../lib/workspace-backend/resource.ts";
import { knowledgeChunks } from "../../../lib/storage/knowledge-contract.ts";
export { MAX_DOCUMENT_BYTES, MAX_TEXT_CHARS } from "../../../lib/storage/knowledge-contract.ts";
import { MAX_DOCUMENT_BYTES } from "../../../lib/storage/knowledge-contract.ts";

export const storageCategories = ["Finance", "Banking", "SQL", "Data"] as const;
export type StorageCategory = typeof storageCategories[number];
export interface StorageDocument {
  id: string; name: string; category: StorageCategory; bytes: number; mime: string;
  sha256: string; addedAt: string; words: number; chunks: number;
  excerpt: string; keywords: string[]; extraction: "indexed" | "original-only";
  warning?: string; url?: string;
}
export interface StorageLibrary { version: 1; onboarded: boolean; documents: StorageDocument[] }
export const emptyStorage: StorageLibrary = { version: 1, onboarded: false, documents: [] };
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
export function parseStorageLibrary(raw: unknown): StorageLibrary | undefined {
  if (!object(raw) || raw.version !== 1 || typeof raw.onboarded !== "boolean" || !Array.isArray(raw.documents)) return;
  const ids = new Set<string>();
  for (const d of raw.documents) {
    if (!object(d) || typeof d.id !== "string" || !/^[\w-]{1,128}$/.test(d.id) || ids.has(d.id) || typeof d.name !== "string" || !d.name.trim() || d.name.length > 240 || !storageCategories.includes(d.category as StorageCategory) || typeof d.bytes !== "number" || !Number.isSafeInteger(d.bytes) || d.bytes < 0 || d.bytes > MAX_DOCUMENT_BYTES || typeof d.mime !== "string" || typeof d.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(d.sha256) || typeof d.addedAt !== "string" || !Number.isFinite(Date.parse(d.addedAt)) || ![d.words,d.chunks].every(v => typeof v === "number" && Number.isSafeInteger(v) && v >= 0) || typeof d.excerpt !== "string" || d.excerpt.length > 1000 || !Array.isArray(d.keywords) || d.keywords.length > 16 || !d.keywords.every(v => typeof v === "string" && v.length <= 80) || !["indexed","original-only"].includes(String(d.extraction)) || (d.warning !== undefined && typeof d.warning !== "string")) return;
    if (d.url !== undefined) {
      if (typeof d.url !== "string" || /[\r\n\\]/.test(d.url)) return;
      try { const u = new URL(d.url, "https://local.invalid"); if (!["http:","https:"].includes(u.protocol) || u.username || u.password || d.url.startsWith("//")) return; } catch { return; }
    }
    ids.add(d.id);
  }
  return raw as unknown as StorageLibrary;
}
export const storageResource = defineResource<StorageLibrary>({ name: "knowledge-library", scope: "workspace", storage: "backend", live: true, empty: emptyStorage, parse: parseStorageLibrary });
/** Stable persistence receipt, independent of object property ordering. */
export function storageSignature(library:StorageLibrary) {
  return JSON.stringify([library.version,library.onboarded,[...library.documents].sort((a,b)=>a.id.localeCompare(b.id)).map(d=>[d.id,d.name,d.category,d.bytes,d.mime,d.sha256,d.addedAt,d.words,d.chunks,d.excerpt,d.keywords,d.extraction,d.warning??null,d.url??null])]);
}

export function validateDocument(file: {name: string; size: number}) {
  if (!file.name.trim() || file.name.length > 240) throw new Error("Use a file name between 1 and 240 characters.");
  if (file.size === 0) throw new Error("This file is empty. Choose a document with content.");
  if (file.size > MAX_DOCUMENT_BYTES) throw new Error("This file exceeds the 20 MB limit.");
  if (!/\.(pdf|docx|txt|md|csv|tsv|sql|json|xlsx)$/i.test(file.name)) throw new Error("Choose PDF, DOCX, TXT, MD, CSV, TSV, SQL, JSON or XLSX.");
}
export const documentExtension = (name: string) => name.split(".").at(-1)?.toUpperCase() || "FILE";
export function formatStorageBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}
const stopWords = new Set("the and for with this that from have are was were not you your into can will file document những được trong của các cho một với này tại là và có không để về khi hoặc".split(" "));
/** Lexical indexing, not a language model or inferred financial advice. */
export function indexDocument(text: string) {
  const normalized = text.replace(/\r\n?/g,"\n").replace(/\u0000/g,"").trim();
  const words = normalized.match(/[\p{L}\p{N}_]+/gu) || [];
  const frequency = new Map<string,number>();
  for (const word of words) { const key=word.toLowerCase(); if(key.length>2 && key.length<=80 && !stopWords.has(key))frequency.set(key,(frequency.get(key)||0)+1); }
  const keywords=[...frequency].sort((a,b)=>b[1]-a[1] || a[0].localeCompare(b[0])).slice(0,12).map(([word])=>word);
  const chunks = knowledgeChunks(normalized);
  return { text:normalized, words:words.length, chunks, keywords, excerpt:normalized.slice(0,800) };
}

export interface MapNode { id:string; label:string; value:number; color:number; category:StorageCategory; children?:MapNode[] }
export function buildStorageTree(documents: StorageDocument[], measure: "files" | "bytes", shading: "indexed" | "recent"): MapNode[] {
  return storageCategories.map(category=>{
    const docs=documents.filter(d=>d.category===category);
    const types=[...new Set(docs.map(d=>documentExtension(d.name)))];
    const children=types.map(ext=>{
      const children=docs.filter(d=>documentExtension(d.name)===ext).map(d=>({id:d.id,label:d.name,value:measure==="files" ? 1:d.bytes,category,color:shading==="indexed" ? (d.extraction==="indexed"?1:0) : Math.max(0,1-(Date.now()-Date.parse(d.addedAt))/(30*86400000))}));
      const value=children.reduce((s,d)=>s+d.value,0);
      return {id:`${category}:${ext}`,label:ext,value,category,color:value?children.reduce((s,d)=>s+d.color*d.value,0)/value:0,children};
    });
    const value=children.reduce((s,d)=>s+d.value,0);
    return {id:category,label:category,value,category,color:value?children.reduce((s,d)=>s+d.color*d.value,0)/value:0,children};
  });
}
export interface MapRect { x:number;y:number;width:number;height:number }
/** Squarified rows minimize the worst aspect ratio. Rectangles exactly partition the input. */
export function squarify(nodes: {id:string;value:number}[], bounds:MapRect): (MapRect & {id:string})[] {
  const sorted=nodes.filter(n=>Number.isFinite(n.value)&&n.value>0).sort((a,b)=>b.value-a.value);
  const total=sorted.reduce((s,n)=>s+n.value,0);
  if (!total || bounds.width<=0 || bounds.height<=0) return [];
  const remaining=sorted.map(n=>({...n,area:n.value/total*bounds.width*bounds.height}));
  const result:(MapRect & {id:string})[]=[];
  let {x,y,width,height}=bounds;
  const worst=(row:typeof remaining,side:number)=>{const sum=row.reduce((s,n)=>s+n.area,0),min=Math.min(...row.map(n=>n.area)),max=Math.max(...row.map(n=>n.area));return Math.max(side*side*max/(sum*sum),sum*sum/(side*side*min));};
  while(remaining.length) {
    const side=Math.min(width,height),row=[remaining.shift()!];
    while(remaining.length && worst([...row,remaining[0]],side)<=worst(row,side))row.push(remaining.shift()!);
    const area=row.reduce((s,n)=>s+n.area,0);
    if(width>=height){const w=area/height;let offset=y;for(const n of row){const h=n.area/w;result.push({id:n.id,x,y:offset,width:w,height:h});offset+=h;}x+=w;width=Math.max(0,width-w);}
    else {const h=area/width;let offset=x;for(const n of row){const w=n.area/h;result.push({id:n.id,x:offset,y,width:w,height:h});offset+=w;}y+=h;height=Math.max(0,height-h);}
  }
  return result;
}
