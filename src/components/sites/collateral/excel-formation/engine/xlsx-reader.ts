import type { Cell, CellType, Row, Sheet, StyleKind, Workbook } from "./types.ts";
import { columnIndex, readXmlText } from "./text.ts";
import { scanXml } from "./xml-scan.ts";
import { unzipBounded } from "./xlsx-zip.ts";
import { LIMITS } from "./limits.ts";
export { LIMITS };

export type ImportErrorCode = "empty" | "legacy-or-encrypted" | "not-xlsx" | "too-large" | "zip-bomb" | "corrupt" | "no-workbook" | "no-sheets";
export class CreditImportError extends Error {
  code: ImportErrorCode;
  constructor(code: ImportErrorCode, message: string) { super(message); this.name = "CreditImportError"; this.code = code; }
}
export interface ReadProgress { phase: "unzip" | "strings" | "styles" | "sheet"; sheet?: string; fraction: number }
export type ProgressFn = (progress: ReadProgress) => void;

export function checkSignature(bytes: Uint8Array): void {
  if (!bytes.length) throw new CreditImportError("empty", "The file is empty.");
  if (bytes.length > LIMITS.fileBytes) throw new CreditImportError("too-large", "The file is larger than this tool accepts.");
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) throw new CreditImportError("legacy-or-encrypted", "This is a legacy .xls file or a password-protected workbook. Save it as an unprotected .xlsx first.");
  if (!(bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 3 || bytes[2] === 5))) throw new CreditImportError("not-xlsx", "This file is not an .xlsx workbook.");
}

function sharedStrings(xml: string): { value: string; rich: boolean }[] {
  const strings: { value: string; rich: boolean }[] = [];
  let text = "", inT = false, phonetic = 0, rich = false;
  for (const token of scanXml(xml)) {
    if (token.kind === "start") {
      if (token.name === "si") { text = ""; rich = false; if (token.empty) strings.push({ value: "", rich: false }); }
      if (token.name === "r") rich = true;
      if (token.name === "rPh" && !token.empty) phonetic++;
      if (token.name === "t" && !token.empty) inT = true;
    } else if (token.kind === "text" && inT && !phonetic) text += readXmlText(token.text);
    else if (token.kind === "end") {
      if (token.name === "si") { if (text.length > 32767 || strings.length >= LIMITS.strings) throw new CreditImportError("too-large", "Shared string budget exceeded."); strings.push({ value: text, rich }); }
      if (token.name === "t") inT = false;
      if (token.name === "rPh") phonetic--;
    }
  }
  return strings;
}

const DATE_BUILTIN = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);
function styleKinds(xml: string): StyleKind[] {
  const formats = new Map<number, string>(), kinds: StyleKind[] = [];
  let xfs = false;
  for (const token of scanXml(xml)) {
    if (token.name === "cellXfs") xfs = token.kind === "start" && !token.empty;
    if (token.kind !== "start") continue;
    if (token.name === "numFmt") formats.set(Number(token.attrs.numFmtId), readXmlText(token.attrs.formatCode ?? ""));
    if (token.name !== "xf" || !xfs) continue;
    const id = Number(token.attrs.numFmtId ?? 0), code = formats.get(id);
    kinds.push(id === 49 || code === "@" ? "text" : DATE_BUILTIN.has(id) ? "date" : code !== undefined ? /[ymdhs]/i.test(code.replace(/"[^"]*"|\[[^\]]*\]|\\./g, "")) ? "date" : "number" : id === 0 ? "general" : "number");
  }
  return kinds;
}

function scanSheet(name: string, part: string, xml: string, strings: { value: string; rich: boolean }[], progress?: ProgressFn, budget = { cells: 0 }): Sheet {
  const sheet: Sheet = { name, part, cellsVisited: 0, dimension: null, rows: [], hiddenRows: 0, hiddenColumns: 0, mergeCount: 0, autoFilter: false, formulaCount: 0, emptyRows: 0, maxCol: 0 };
  let row: Row | null = null, cell: Cell | null = null, col = -1, previousRow = 0, value = "", capture = "", phonetic = 0, nextReport = 0;
  const ranges: { r1: number; r2: number; c1: number; c2: number }[] = [];
  const protectRange = (ref: string) => {
    const m = /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/.exec(ref);
    if (!m) fail("Invalid protected range.");
    ranges.push({ r1: Number(m![2]), r2: Number(m![4] ?? m![2]), c1: columnIndex(m![1]), c2: columnIndex(m![3] ?? m![1]) });
  };
  const fail = (reason: string): never => { throw new CreditImportError("corrupt", `Worksheet ${part}, row ${row?.r ?? 0}, column ${col + 1}: ${reason}`); };
  const endCell = () => {
    if (!cell || !row) return fail("Invalid cell nesting.");
    if (cell.t === "s") {
      if (!/^\d+$/.test(value) || Number(value) >= strings.length) fail("Shared string reference is out of range.");
      cell.v = strings[Number(value)].value;
      if (strings[Number(value)].rich) cell.protectedText = true;
    } else cell.v = cell.t === "n" || cell.t === "b" || cell.t === "e" || cell.t === "d" ? value : readXmlText(value);
    if (cell.f) sheet.formulaCount++;
    sheet.cellsVisited!++;
    if (++budget.cells > LIMITS.cells || cell.v.length > 32767) throw new CreditImportError("too-large", "Workbook cell or text budget exceeded.");
    // Keep empty, styled cells too: they participate in accounting and preservation.
    row.cells[col] = cell; sheet.maxCol = Math.max(sheet.maxCol, col + 1); cell = null; capture = "";
  };
  const endRow = () => {
    if (!row) return fail("Invalid row nesting.");
    if (row.cells.some(c => c && (c.v !== "" || c.f))) sheet.rows.push(row);
    else { sheet.emptyRows++; sheet.emptyCells = (sheet.emptyCells ?? 0) + row.cells.filter(Boolean).length; }
    row = null;
  };
  for (const token of scanXml(xml)) {
    const { name: tag, attrs: a } = token;
    if (token.kind === "text") { if (capture && !phonetic) value += token.text; continue; }
    if (token.kind === "end") {
      if (tag === "row") endRow(); else if (tag === "c") endCell(); else if (tag === "t" || tag === "v") capture = ""; else if (tag === "rPh") phonetic--;
      continue;
    }
    if (tag === "dimension") sheet.dimension = a.ref ?? null;
    if (tag === "autoFilter") sheet.autoFilter = true;
    if (tag === "mergeCell") { sheet.mergeCount++; protectRange(a.ref ?? ""); }
    if (tag === "col" && /^(1|true)$/.test(a.hidden ?? "")) sheet.hiddenColumns += Number(a.max) - Number(a.min) + 1;
    if (tag === "row") {
      if (row) fail("Nested row.");
      const r = Number(a.r ?? previousRow + 1);
      if (!Number.isInteger(r) || r <= previousRow || r > 1048576) fail("Invalid or duplicate row reference.");
      previousRow = r; row = { r, hidden: /^(1|true)$/.test(a.hidden ?? ""), cells: [] }; col = -1;
      if (sheet.rows.length + sheet.emptyRows > LIMITS.rows) throw new CreditImportError("too-large", "Worksheet row budget exceeded.");
      if (row.hidden) sheet.hiddenRows++;
      if (token.empty) endRow();
    } else if (tag === "c") {
      if (!row || cell) fail("Invalid cell nesting.");
      const ref = a.r?.match(/^([A-Z]{1,3})([1-9]\d*)$/);
      if (a.r && (!ref || Number(ref[2]) !== row!.r)) fail("Invalid cell reference.");
      const next = ref ? columnIndex(ref[1]) : col + 1;
      if (next <= col || next >= 16384) fail("Invalid or duplicate column reference.");
      col = next;
      const t = (a.t ?? "n") as CellType, s = Number(a.s ?? 0);
      if (!["s", "n", "inlineStr", "str", "b", "e", "d"].includes(t) || !Number.isInteger(s) || s < 0) fail("Unsupported cell type or style.");
      cell = { t, s, v: "" }; value = "";
      if (token.empty) { if (t === "s") fail("Missing shared string reference."); endCell(); }
    } else if (cell && tag === "f") { cell.f = true; if (a.ref) protectRange(a.ref); }
    else if (cell && (tag === "r" || tag === "extLst")) cell.protectedText = true;
    else if (cell && (tag === "v" || tag === "t") && !token.empty) capture = tag;
    else if (tag === "rPh" && !token.empty) phonetic++;
    if (token.end >= nextReport) { progress?.({ phase: "sheet", sheet: name, fraction: token.end / xml.length }); nextReport = token.end + 1_500_000; }
  }
  let comparisons = 0;
  for (const range of ranges) for (const item of sheet.rows) {
    if (++comparisons > 2_000_000) throw new CreditImportError("too-large", "Protected-range scan exceeds the workbook budget.");
    if (item.r < range.r1 || item.r > range.r2) continue;
    for (let c = range.c1; c <= Math.min(range.c2, item.cells.length - 1); c++) if (item.cells[c]) item.cells[c]!.protectedText = true;
  }
  return sheet;
}

export interface ReadOptions { fileName: string; fileHash: string; onProgress?: ProgressFn }
/** fflate remains the only ZIP engine. Decodes one part at a time; this is not a constant-memory reader. */
export function readWorkbook(bytes: Uint8Array, { fileName, fileHash, onProgress }: ReadOptions): Workbook {
  checkSignature(bytes); onProgress?.({ phase: "unzip", fraction: 0 });
  let names: string[] = [], files: Record<string, Uint8Array>;
  try { files = unzipBounded(bytes, name => { names.push(name); return /^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|styles\.xml|sharedStrings\.xml|worksheets\/[^/]+\.xml)$/.test(name); }); }
  catch (error) { throw new CreditImportError(error instanceof Error && /budget|expansion/i.test(error.message) ? "zip-bomb" : "corrupt", "The archive is damaged or exceeds safe decompression limits."); }
  if (!files["xl/workbook.xml"]) throw new CreditImportError("no-workbook", "This archive is not an Excel workbook (xl/workbook.xml is missing).");
  const decode = (part: string) => new TextDecoder("utf-8", { fatal: true }).decode(files[part]);
  try {
    const workbookXml = decode("xl/workbook.xml"), rels = new Map<string, string>(), notes: string[] = [];
    if (files["xl/_rels/workbook.xml.rels"]) for (const token of scanXml(decode("xl/_rels/workbook.xml.rels"))) if (token.kind === "start" && token.name === "Relationship" && token.attrs.TargetMode !== "External") {
      const target = readXmlText(token.attrs.Target ?? "");
      // Excel and SharePoint write `../customXml/item1.xml` for parts the reader never opens: resolve the path, and skip (not fail on) one that leaves the package.
      const path = target.startsWith("/") ? [] : ["xl"];
      let inside = !target.includes(":");
      for (const part of target.split("/")) { if (part === "..") inside &&= path.pop() !== undefined; else if (part && part !== ".") path.push(part); }
      if (inside) rels.set(token.attrs.Id, path.join("/"));
    }
    const targets: { name: string; part: string; rid: string; state: NonNullable<Sheet["state"]> }[] = [];
    for (const token of scanXml(workbookXml)) if (token.kind === "start") {
      if (token.name === "sheet") {
        const id = Object.entries(token.attrs).find(([key]) => key.endsWith(":id"))?.[1], part = id ? rels.get(id) : undefined;
        if (!part || !files[part]) throw new Error("Worksheet relationship or part is missing.");
        const name = readXmlText(token.attrs.name ?? "");
        if (!name || targets.some(t => t.name === name || t.part === part)) throw new Error("Duplicate worksheet identity.");
        const state = token.attrs.state === "hidden" || token.attrs.state === "veryHidden" ? token.attrs.state : "visible";
        targets.push({ name, part, rid: id!, state });
        if (state !== "visible") notes.push("The workbook has hidden sheets.");
      }
      if (token.name === "calcPr" && token.attrs.fullCalcOnLoad === "1") notes.push("The workbook recalculates on load.");
      if (token.name === "definedName") notes.push("The workbook has defined names.");
    }
    if (!targets.length) throw new CreditImportError("no-sheets", "The workbook has no worksheets.");
    onProgress?.({ phase: "strings", fraction: 0 });
    const strings = files["xl/sharedStrings.xml"] ? sharedStrings(decode("xl/sharedStrings.xml")) : [];
    onProgress?.({ phase: "styles", fraction: 0 });
    const styles = files["xl/styles.xml"] ? styleKinds(decode("xl/styles.xml")) : [];
    const budget = { cells: 0 };
    // One sheet that cannot be read does not take the others with it: it is kept as an empty sheet that says why, is never patched and is never shown as clean.
    // Limits (size, budgets) still stop the whole file: they protect the machine, not one sheet.
    const sheets = targets.map(target => {
      try { const sheet = scanSheet(target.name, target.part, decode(target.part), strings, onProgress, budget); sheet.rid = target.rid; sheet.state = target.state; delete files[target.part]; return sheet; }
      catch (error) {
        if (error instanceof CreditImportError && error.code !== "corrupt") throw error;
        delete files[target.part];
        const reason = error instanceof CreditImportError ? error.message : "The worksheet XML is malformed or is not valid UTF-8.";
        return { name: target.name, part: target.part, rid: target.rid, state: target.state, cellsVisited: 0, dimension: null, rows: [], hiddenRows: 0, hiddenColumns: 0, mergeCount: 0, autoFilter: false, formulaCount: 0, emptyRows: 0, maxCol: 0, error: reason } satisfies Sheet;
      }
    });
    // When no sheet at all can be read there is nothing to scan: the file is refused with the reason of the first one.
    if (sheets.every(sheet => sheet.error)) throw new CreditImportError("corrupt", sheets[0].error!);
    for (const sheet of sheets) if (sheet.error) notes.push("A worksheet could not be read and is left untouched.");
    if (names.some(name => /vbaProject\.bin$/.test(name))) notes.push("The workbook contains a macro project. It is never executed and is kept untouched.");
    if (names.some(name => /^xl\/(?:comments|threadedComments|drawings\/|charts\/|tables\/)/.test(name))) notes.push("Comments, text boxes, charts and tables are not scanned: only the text of cells is.");
    names = [];
    return { fileName, size: bytes.length, fileHash, sheets, styleKinds: styles, notes };
  } catch (error) { if (error instanceof CreditImportError) throw error; throw new CreditImportError("corrupt", error instanceof Error ? error.message : "Malformed workbook XML."); }
}
export type { Row };
