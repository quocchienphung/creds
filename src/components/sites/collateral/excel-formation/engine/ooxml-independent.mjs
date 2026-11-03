// Test/QA oracle that does NOT use xlsx-reader.ts, xlsx-patcher.ts or xml-scan.ts: fflate + regular expressions over the raw OOXML parts.
// It answers three questions about two workbooks: which uncompressed parts differ, which cells differ, and what a cell finally holds.
import { unzipSync } from "fflate";
import { createHash } from "node:crypto";

const text = bytes => new TextDecoder().decode(bytes);
const ENTITIES = { lt: "<", gt: ">", amp: "&", quot: "\"", apos: "'" };
const decodeXml = s => s
  .replace(/&(#x[0-9a-fA-F]+|#\d+|lt|gt|amp|quot|apos);/g, (_, e) => e[0] === "#" ? String.fromCodePoint(e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENTITIES[e])
  .replace(/_x([0-9A-Fa-f]{4})_/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
const attr = (tag, name) => new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(tag)?.slice(1).find(v => v !== undefined);
const textOf = xml => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(m => decodeXml(m[1])).join("");
const sha = bytes => createHash("sha256").update(bytes).digest("hex");

/** SHA-256 of every UNCOMPRESSED zip entry: two archives that only differ in compression have identical maps. */
export function partHashes(bytes) {
  const out = {};
  for (const [name, data] of Object.entries(unzipSync(bytes))) out[name] = sha(data);
  return out;
}
export function comparePackages(before, after) {
  const a = partHashes(before), b = partHashes(after), names = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  const differing = names.filter(name => a[name] !== b[name]);
  return {
    entries: names.length, identical: names.length - differing.length, differing,
    verdict: differing.length ? "CONTENT_CHANGED" : (sha(before) === sha(after) ? "BYTE_IDENTICAL" : "RECOMPRESSED_ONLY"),
  };
}

/** sheetName -> { cells: Map("A1" -> { type, value, formula, style, row }), hiddenRows: Set } */
export function cellMap(bytes) {
  const files = unzipSync(bytes);
  const sst = files["xl/sharedStrings.xml"] ? [...text(files["xl/sharedStrings.xml"]).matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>|<si\s*\/>/g)].map(m => textOf(m[1] ?? "")) : [];
  const rels = new Map([...text(files["xl/_rels/workbook.xml.rels"]).matchAll(/<Relationship\b[^>]*>/g)].map(m => [attr(m[0], "Id"), attr(m[0], "Target")]));
  const out = {};
  for (const m of text(files["xl/workbook.xml"]).matchAll(/<sheet\b[^>]*>/g)) {
    const name = decodeXml(attr(m[0], "name")), rid = attr(m[0], "r:id") ?? attr(m[0], "id");
    let target = rels.get(rid); target = target.startsWith("/") ? target.slice(1) : "xl/" + target;
    const xml = text(files[target]), cells = new Map(), hiddenRows = new Set();
    for (const row of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const rn = attr(row[1], "r");
      if (/\shidden\s*=\s*["']1/.test(row[1])) hiddenRows.add(Number(rn));
      for (const c of (row[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = attr(c[1], "r"), t = attr(c[1], "t") ?? "n", body = c[2] ?? "";
        const f = /<f\b[^>]*?(?:\/>|>[\s\S]*?<\/f>)/.exec(body);
        const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
        let value = "";
        if (t === "s") value = sst[Number(v)]; else if (t === "inlineStr") value = textOf(/<is>([\s\S]*?)<\/is>/.exec(body)?.[1] ?? ""); else value = v === undefined ? "" : decodeXml(v);
        cells.set(ref, { type: t === "s" || t === "inlineStr" ? "text" : t, value, formula: f ? f[0] : null, style: attr(c[1], "s") ?? "0", row: Number(rn) });
      }
    }
    out[name] = { cells, hiddenRows };
  }
  return out;
}

/** Cell-level diff. `changed`: cells whose literal text/type differs. `structural`: style, formula, hidden-row or sheet-set differences. */
export function diffCells(before, after) {
  const a = cellMap(before), b = cellMap(after), changed = [], structural = [];
  for (const sheet of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (!a[sheet] || !b[sheet]) { structural.push({ sheet, problem: "sheet-set" }); continue; }
    if ([...a[sheet].hiddenRows].sort().join() !== [...b[sheet].hiddenRows].sort().join()) structural.push({ sheet, problem: "hidden-rows" });
    for (const ref of new Set([...a[sheet].cells.keys(), ...b[sheet].cells.keys()])) {
      const x = a[sheet].cells.get(ref), y = b[sheet].cells.get(ref);
      if (!x || !y) { changed.push({ sheet, ref, before: x?.value, after: y?.value, kind: "presence" }); continue; }
      if (x.value !== y.value || x.type !== y.type) changed.push({ sheet, ref, before: x.value, after: y.value, kind: "value" });
      else if (x.style !== y.style || x.formula !== y.formula) structural.push({ sheet, ref, problem: x.formula !== y.formula ? "formula" : "style" });
    }
  }
  return { changed, structural };
}
