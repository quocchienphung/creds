import { Unzip, UnzipInflate } from "fflate";
import { LIMITS } from "./limits.ts";

/** Inflate in bounded input chunks and count actual output, not just ZIP directory claims. */
export function unzipBounded(bytes: Uint8Array, include: (name: string) => boolean = () => true): Record<string, Uint8Array> {
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  while (end >= Math.max(0, bytes.length - 65557) && data.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0 || end + 22 > bytes.length || end + 22 + data.getUint16(end + 20, true) !== bytes.length) throw new Error("Corrupt ZIP directory.");
  const entries = data.getUint16(end + 10, true);
  if (entries === 65535 || entries > LIMITS.entries || data.getUint32(end + 16, true) + data.getUint32(end + 12, true) !== end) throw new Error("Unsupported ZIP directory or budget exceeded.");
  const directory = new Map<string, { size: number; crc: number }>();
  let cursor = data.getUint32(end + 16, true), declared = 0;
  for (let i = 0; i < entries; i++) {
    if (cursor + 46 > end || data.getUint32(cursor, true) !== 0x02014b50) throw new Error("Corrupt ZIP directory entry.");
    const flags = data.getUint16(cursor + 8, true), compressed = data.getUint32(cursor + 20, true), size = data.getUint32(cursor + 24, true), length = data.getUint16(cursor + 28, true);
    const next = cursor + 46 + length + data.getUint16(cursor + 30, true) + data.getUint16(cursor + 32, true);
    if (next > end || flags & 1) throw new Error("Encrypted or corrupt ZIP entry.");
    const raw = bytes.subarray(cursor + 46, cursor + 46 + length);
    const name = flags & 2048 ? new TextDecoder("utf-8", { fatal: true }).decode(raw) : Array.from(raw, b => String.fromCharCode(b)).join("");
    if (directory.has(name) || name.includes("\u0000")) throw new Error("Duplicate ZIP directory entry.");
    declared += size;
    if (size > LIMITS.entryBytes || declared > LIMITS.totalBytes || (size > 1_000_000 && size / Math.max(1, compressed) > LIMITS.ratio)) throw new Error("Declared ZIP expansion budget exceeded.");
    directory.set(name, { size, crc: data.getUint32(cursor + 16, true) }); cursor = next;
  }
  if (cursor !== end) throw new Error("Corrupt ZIP directory length.");
  const files: Record<string, Uint8Array> = Object.create(null);
  const seen = new Set<string>();
  let total = 0;
  const unzip = new Unzip(file => {
    if (seen.has(file.name) || file.name.startsWith("/") || file.name.includes("\\") || file.name.split("/").includes("..")) throw new Error("Unsafe or duplicate ZIP path.");
    seen.add(file.name);
    if (seen.size > LIMITS.entries || (file.originalSize ?? 0) > LIMITS.entryBytes) throw new Error("ZIP entry budget exceeded.");
    const keep = include(file.name), chunks: Uint8Array[] = [];
    const expected = directory.get(file.name); if (!expected) throw new Error("ZIP local entry is absent from directory.");
    let size = 0, crc = -1;
    file.ondata = (error, chunk, final) => {
      if (error) throw error;
      size += chunk.length; total += chunk.length;
      for (const byte of chunk) crc = CRC_TABLE[(crc ^ byte) & 255] ^ (crc >>> 8);
      if (size > LIMITS.entryBytes || total > LIMITS.totalBytes || (size > 1_000_000 && file.size !== undefined && size / Math.max(1, file.size) > LIMITS.ratio)) throw new Error("Actual ZIP expansion budget exceeded.");
      if (keep) chunks.push(chunk);
      if (final && (size !== expected.size || ((crc ^ -1) >>> 0) !== expected.crc)) throw new Error("ZIP size or CRC mismatch.");
      if (final && keep) {
        const out = new Uint8Array(size); let at = 0;
        for (const part of chunks) { out.set(part, at); at += part.length; }
        files[file.name] = out;
      }
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  for (let at = 0; at < bytes.length; at += 4096) unzip.push(bytes.subarray(at, at + 4096), at + 4096 >= bytes.length);
  if (seen.size !== entries) throw new Error("ZIP directory and local entries disagree.");
  return files;
}

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
