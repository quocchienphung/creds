import { zipSync } from "fflate";
import type { Workbook } from "./types.ts";
import { readWorkbook } from "./xlsx-reader.ts";
import { columnIndex, columnLetters, writeXmlText } from "./text.ts";
import { scanXml } from "./xml-scan.ts";
import { unzipBounded } from "./xlsx-zip.ts";

/**
 * Corrected-copy export. The approved patches are written into the original file's XML at their exact cell: styles, filters, hidden rows,
 * other sheets, defined names and every untouched cell stay as they were. Nothing is rewritten through a JSON round trip.
 */
export interface CellPatch { sheet: string; row: number; col: number; value: string; asNumber: boolean }
export interface PatchReport { bytes: Uint8Array; changedCells: number; sheetsTouched: string[] }

export class PatchError extends Error {
  constructor(message: string) { super(message); this.name = "PatchError"; }
}

const FIXED_TIME = Date.UTC(1980, 0, 1);

function cellXml(ref: string, style: string, patch: CellPatch): string {
  const s = style ? ` s="${style}"` : "";
  return patch.asNumber ? `<c r="${ref}"${s}><v>${patch.value.trim()}</v></c>` : `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${writeXmlText(patch.value)}</t></is></c>`;
}

/** Find `<tag r="N"` where N is exactly the row number (not a longer one that starts with it). */
function findRow(xml: string, row: number, from: number, end: number): number {
  const needle = `<row r="${row}"`;
  let at = xml.indexOf(needle, from);
  while (at >= 0 && at < end) {
    const next = xml.charCodeAt(at + needle.length);
    if (next === 32 || next === 62 || next === 47) return at;
    at = xml.indexOf(needle, at + 1);
  }
  return -1;
}

/** Rewrite one `<row>`: returns its new text and where the old one ended in the original XML. */
function patchRow(xml: string, rowAt: number, rowNumber: number, patches: CellPatch[]): { text: string; end: number } {
  const headEnd = xml.indexOf(">", rowAt);
  const selfClosing = xml.charCodeAt(headEnd - 1) === 47;
  let head = xml.slice(rowAt, selfClosing ? headEnd - 1 : headEnd);
  let body = selfClosing ? "" : xml.slice(headEnd + 1, xml.indexOf("</row>", headEnd));
  const end = selfClosing ? headEnd + 1 : headEnd + 1 + body.length + 6;
  for (const patch of patches) {
    const ref = columnLetters(patch.col) + rowNumber;
    const needle = `<c r="${ref}"`;
    let at = body.indexOf(needle);
    while (at >= 0) { const next = body.charCodeAt(at + needle.length); if (next === 32 || next === 62 || next === 47) break; at = body.indexOf(needle, at + 1); }
    if (at >= 0) {
      const tagEnd = body.indexOf(">", at);
      const style = /\ss="(\d+)"/.exec(body.slice(at, tagEnd + 1))?.[1] ?? "";
      const cellEnd = body.charCodeAt(tagEnd - 1) === 47 ? tagEnd + 1 : body.indexOf("</c>", tagEnd) + 4;
      body = body.slice(0, at) + cellXml(ref, style, patch) + body.slice(cellEnd);
    } else {
      // The cell does not exist yet: insert it before the first cell of a later column, keeping the row in column order.
      let insertAt = body.length;
      for (const match of body.matchAll(/<c r="([A-Z]+)\d+"/g)) if (columnIndex(match[1]) > patch.col) { insertAt = match.index!; break; }
      body = body.slice(0, insertAt) + cellXml(ref, "", patch) + body.slice(insertAt);
      head = head.replace(/\sspans="[^"]*"/, "");
    }
  }
  return { text: head + ">" + body + "</row>", end };
}

/** Where a row that is not in the file belongs: right before the first row with a larger number, or before `</sheetData>`. */
function insertionPoint(xml: string, from: number, rowNumber: number, dataEnd: number): number {
  let pos = from;
  while (true) {
    const at = xml.indexOf("<row r=\"", pos);
    if (at < 0 || at >= dataEnd) return dataEnd;
    if (Number(/^<row r="(\d+)"/.exec(xml.slice(at, at + 24))![1]) > rowNumber) return at;
    pos = at + 8;
  }
}

/** One forward pass over the sheet: untouched XML is copied as it is, only the rows with approved patches are rewritten. */
function patchSheet(xml: string, patches: CellPatch[]): string {
  const spans = cellSpans(xml);
  const writes: { start: number; end: number; value: string }[] = [];
  const missing: CellPatch[] = [];
  for (const patch of patches) {
    const ref = columnLetters(patch.col) + patch.row, span = spans.get(ref);
    if (!span) { missing.push(patch); continue; }
    const raw = xml.slice(span.start, span.end), headEnd = span.headEnd - span.start;
    if (/<(?:\w+:)?(?:f|r|extLst)\b/.test(raw)) throw new PatchError("Unsupported formula or rich-text target.");
    const prefix = span.qname.includes(":") ? span.qname.split(":")[0] + ":" : "";
    const head = raw.slice(0, headEnd).replace(/\s+t\s*=\s*(["'])[\s\S]*?\1/, "").replace(/\/$/, "");
    const value = patch.asNumber ? `${head}><${prefix}v>${patch.value.trim()}</${prefix}v></${span.qname}>` : `${head} t="inlineStr"><${prefix}is><${prefix}t xml:space="preserve">${writeXmlText(patch.value)}</${prefix}t></${prefix}is></${span.qname}>`;
    writes.push({ start: span.start, end: span.end, value });
  }
  if (!missing.length) {
    let at = 0; const out: string[] = [];
    for (const write of writes.sort((a, b) => a.start - b.start)) { out.push(xml.slice(at, write.start), write.value); at = write.end; }
    out.push(xml.slice(at)); return out.join("");
  }
  // Legacy explicit human edits may create a cell/row; only the canonical representation supports insertion.
  if (writes.length) return patchSheet(patchSheet(xml, patches.filter(p => spans.has(columnLetters(p.col) + p.row))), missing);
  if (/<(?:\w+:)(?:row|c)\b/.test(xml) || /\br\s*=\s*'/.test(xml)) throw new PatchError("This representation does not support inserting cells.");
  const byRow = new Map<number, CellPatch[]>();
  for (const patch of patches) (byRow.get(patch.row) ?? byRow.set(patch.row, []).get(patch.row)!).push(patch);
  const dataStart = xml.indexOf("<sheetData");
  const dataEnd = xml.indexOf("</sheetData>");
  if (dataStart < 0 || dataEnd < 0) throw new PatchError("The sheet has no data section, so nothing was exported.");
  const out: string[] = [];
  let cursor = 0;
  for (const [rowNumber, rowPatches] of [...byRow].sort((a, b) => a[0] - b[0])) {
    const rowAt = findRow(xml, rowNumber, cursor, dataEnd);
    if (rowAt >= 0) {
      const { text, end } = patchRow(xml, rowAt, rowNumber, rowPatches);
      out.push(xml.slice(cursor, rowAt), text);
      cursor = end;
    } else {
      const at = insertionPoint(xml, cursor, rowNumber, dataEnd);
      const fresh = `<row r="${rowNumber}"></row>`;
      const { text } = patchRow(fresh, 0, rowNumber, rowPatches);
      out.push(xml.slice(cursor, at), text);
      cursor = at;
    }
  }
  out.push(xml.slice(cursor));
  return out.join("");
}

export function patchWorkbookBytes(original: Uint8Array, workbook: Workbook, patches: CellPatch[]): PatchReport {
  const rowIndex = new Map(workbook.sheets.map(sheet => [sheet.name, new Map(sheet.rows.map(row => [row.r, row]))]));
  const seen = new Set<string>();
  for (const patch of patches) {
    const sheet = workbook.sheets.find(item => item.name === patch.sheet);
    if (!sheet) throw new PatchError("Sheet was not found in the workbook.");
    if (sheet.error) throw new PatchError("This worksheet could not be read, so nothing can be written into it.");
    const key = `${patch.sheet}\u0001${patch.row}\u0001${patch.col}`;
    if (seen.has(key)) throw new PatchError("Duplicate patch target.");
    seen.add(key);
    const target = rowIndex.get(patch.sheet)?.get(patch.row)?.cells[patch.col];
    if (target?.f) throw new PatchError("Formula cells cannot be patched.");
    if (target?.protectedText) throw new PatchError("Merged, rich-text or dependent formula cells cannot be patched.");
    if (!sheet || patch.row < 1 || patch.row > 1048576 || !Number.isInteger(patch.row) || patch.col < 0 || patch.col >= 16384 || !Number.isInteger(patch.col) || patch.value.length > 32767) throw new PatchError("Invalid patch target or text length.");
    if (patch.asNumber && !/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(patch.value.trim())) throw new PatchError("Invalid numeric patch.");
  }
  const files = unzipBounded(original);
  const bySheet = new Map<string, CellPatch[]>();
  for (const patch of patches) (bySheet.get(patch.sheet) ?? bySheet.set(patch.sheet, []).get(patch.sheet)!).push(patch);
  const touched: string[] = [];
  for (const [sheetName, list] of bySheet) {
    const part = workbook.sheets.find(sheet => sheet.name === sheetName)?.part;
    if (!part || !files[part]) throw new PatchError(`Sheet ${sheetName} was not found in the file, so nothing was exported.`);
    const xml = new TextDecoder("utf-8", { fatal: true }).decode(files[part]);
    files[part] = new TextEncoder().encode(patchSheet(xml, list));
    touched.push(sheetName);
  }
  const bytes = zipSync(files, { level: 6, mtime: FIXED_TIME });
  return { bytes, changedCells: patches.length, sheetsTouched: touched };
}

export interface RoundTripReport { ok: boolean; changedCells: number; /** Cells whose value was MEASURED to differ between the input and the re-read output (not the number of patches asked for). */ cellsChanged: number; /** The same measurement per worksheet name. */ bySheet: Record<string, number>; wrongValues: number; unexpectedChanges: number; sheetsCompared: number }
/**
 * Re-read the exported bytes and compare them with the original workbook: every patched cell must hold exactly its approved value and every
 * other cell must be identical. Fails closed: a single difference makes `ok` false.
 */
export function verifyRoundTrip(before: Workbook, exported: Uint8Array, patches: CellPatch[]): RoundTripReport {
  const after = readWorkbook(exported, { fileName: before.fileName, fileHash: before.fileHash });
  const patched = new Map(patches.map(patch => [`${patch.sheet}\u0001${patch.row}\u0001${patch.col}`, patch]));
  let wrong = 0, unexpected = 0, measured = 0; const bySheet: Record<string, number> = {};
  for (const sheet of before.sheets) {
    const other = after.sheets.find(item => item.name === sheet.name);
    if (!other) { unexpected++; continue; }
    const rows = new Map(other.rows.map(row => [row.r, row]));
    const seen = new Set<string>();
    for (const row of sheet.rows) {
      const twin = rows.get(row.r);
      if (!twin || twin.hidden !== row.hidden) unexpected++;
      const width = Math.max(row.cells.length, twin?.cells.length ?? 0);
      for (let col = 0; col < width; col++) {
        const key = `${sheet.name}\u0001${row.r}\u0001${col}`;
        const patch = patched.get(key);
        const a = row.cells[col], b = twin?.cells[col];
        if (patch) { seen.add(key); if ((b?.v ?? "") !== (patch.asNumber ? patch.value.trim() : patch.value)) wrong++; if ((a?.v ?? "") !== (b?.v ?? "")) { measured++; bySheet[sheet.name] = (bySheet[sheet.name] ?? 0) + 1; } }
        else if (a?.v !== b?.v || a?.t !== b?.t || a?.s !== b?.s || a?.f !== b?.f) unexpected++;
      }
    }
    // A patched cell in a row that did not exist before.
    for (const [key, patch] of patched) if (patch.sheet === sheet.name && !seen.has(key)) { const cell = rows.get(patch.row)?.cells[patch.col]; if ((cell?.v ?? "") !== (patch.asNumber ? patch.value.trim() : patch.value)) wrong++; }
    if (other.hiddenRows !== sheet.hiddenRows || other.autoFilter !== sheet.autoFilter || other.mergeCount !== sheet.mergeCount) unexpected++;
  }
  return { ok: wrong === 0 && unexpected === 0, changedCells: patches.length, cellsChanged: measured, bySheet, wrongValues: wrong, unexpectedChanges: unexpected, sheetsCompared: before.sheets.length };
}

export const exportName = (fileName: string) => fileName.replace(/\.xlsx$/i, "") + ".reviewed.xlsx";

interface CellSpan { start: number; headEnd: number; end: number; qname: string }
function cellSpans(xml: string): Map<string, CellSpan> {
  const spans = new Map<string, CellSpan>(); let open: { ref: string; start: number; headEnd: number; qname: string } | null = null;
  for (const token of scanXml(xml)) {
    if (token.kind === "start" && token.name === "c") {
      const ref = token.attrs.r;
      if (!ref || spans.has(ref) || open) throw new PatchError("Unsupported or duplicate cell reference.");
      if (token.empty) spans.set(ref, { start: token.start, headEnd: token.end - 1, end: token.end, qname: token.qname });
      else open = { ref, start: token.start, headEnd: token.end - 1, qname: token.qname };
    } else if (token.kind === "end" && token.name === "c") {
      if (!open) throw new PatchError("Malformed cell.");
      spans.set(open.ref, { start: open.start, headEnd: open.headEnd, end: token.end, qname: open.qname }); open = null;
    }
  }
  return spans;
}

/** Structural verifier separate from the cell reader: unchanged package entries and XML outside approved cell spans are byte equal. */
export function verifyPackageIntegrity(before: Uint8Array, after: Uint8Array, workbook: Workbook, patches: CellPatch[]): boolean {
  const a = unzipBounded(before), b = unzipBounded(after);
  if (Object.keys(a).sort().join("\u0000") !== Object.keys(b).sort().join("\u0000")) return false;
  const byPart = new Map<string, Set<string>>();
  for (const patch of patches) {
    const part = workbook.sheets.find(s => s.name === patch.sheet)?.part; if (!part) return false;
    const refs = byPart.get(part) ?? new Set(); refs.add(columnLetters(patch.col) + patch.row); byPart.set(part, refs);
  }
  for (const part of Object.keys(a)) {
    const refs = byPart.get(part);
    if (!refs) { if (a[part].length !== b[part].length || !a[part].every((v, i) => v === b[part][i])) return false; continue; }
    const x = new TextDecoder().decode(a[part]), y = new TextDecoder().decode(b[part]);
    const strip = (xml: string) => {
      let at = 0; const out: string[] = [];
      for (const [ref, span] of cellSpans(xml)) if (refs.has(ref)) {
        const head = xml.slice(span.start, span.headEnd).replace(/\s+t\s*=\s*(["'])[\s\S]*?\1/, "").replace(/\/$/, "");
        // Preserve every attribute except t, which intentionally changes from shared/numeric to inline text.
        out.push(xml.slice(at, span.start), head, "<approved-cell/>"); at = span.end;
      }
      out.push(xml.slice(at)); return out.join("");
    };
    if (strip(x) !== strip(y)) return false;
  }
  return true;
}

export type PackageVerdict = "CONTENT_CHANGED" | "RECOMPRESSED_ONLY" | "BYTE_IDENTICAL";
/** Compare the UNCOMPRESSED parts of two packages: a ZIP that was only re-compressed has different bytes but identical parts. */
export function comparePackageParts(before: Uint8Array, after: Uint8Array): { verdict: PackageVerdict; parts: number; changedParts: number } {
  const a = unzipBounded(before), b = unzipBounded(after), names = new Set([...Object.keys(a), ...Object.keys(b)]);
  let changed = 0;
  for (const name of names) { const x = a[name], y = b[name]; if (!x || !y || x.length !== y.length || !x.every((v, i) => v === y[i])) changed++; }
  const identicalBytes = before.length === after.length && before.every((v, i) => v === after[i]);
  return { verdict: changed ? "CONTENT_CHANGED" : identicalBytes ? "BYTE_IDENTICAL" : "RECOMPRESSED_ONLY", parts: names.size, changedParts: changed };
}

/** The re-read value of every patched cell: `ok` when the exported cell holds exactly the approved value, `changed` when it differs from the original. */
export interface PatchCheck { sheet: string; row: number; col: number; ok: boolean; changed: boolean }
export function verifyPatches(before: Workbook, exported: Uint8Array, patches: CellPatch[]): PatchCheck[] {
  const after = readWorkbook(exported, { fileName: before.fileName, fileHash: before.fileHash });
  return patches.map(patch => {
    const was = before.sheets.find(sheet => sheet.name === patch.sheet)?.rows.find(row => row.r === patch.row)?.cells[patch.col]?.v ?? "";
    const now = after.sheets.find(sheet => sheet.name === patch.sheet)?.rows.find(row => row.r === patch.row)?.cells[patch.col]?.v ?? "";
    const want = patch.asNumber ? patch.value.trim() : patch.value;
    return { sheet: patch.sheet, row: patch.row, col: patch.col, ok: now === want, changed: now !== was };
  });
}
