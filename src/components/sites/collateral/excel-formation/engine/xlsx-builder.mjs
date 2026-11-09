// Test-only: builds small, valid .xlsx files from SYNTHETIC rows so the engine can be exercised without any real data.
import { zipSync, strToU8 } from "fflate";
import { writeXmlText, columnLetters } from "./text.ts";

/**
 * sheets: [{ name, rows: Array<Array<string | {n: string} | {inline: string} | {rich: string} | {f: string, v?: string} | null | undefined>>, hiddenRows?: number[], autoFilter?: boolean, styles?: {[colIndex]: 0|1|2} }]
 * A plain string becomes a shared string, `{n}` a number kept as its raw text, `{inline}` an inline string.
 */
export function buildXlsx(sheets, { shared = true, macro = false } = {}) {
  const strings = [];
  const indexOf = new Map();
  const sst = text => { if (!indexOf.has(text)) { indexOf.set(text, strings.length); strings.push(text); } return indexOf.get(text); };
  const sheetXml = sheet => {
    const rows = sheet.rows.map((cells, r) => {
      const hidden = sheet.hiddenRows?.includes(r + 1) ? ' hidden="1"' : "";
      const body = cells.map((cell, c) => {
        if (cell === null || cell === undefined) return "";
        const ref = columnLetters(c) + (r + 1);
        const style = sheet.styles?.[c] ? ` s="${sheet.styles[c]}"` : "";
        if (typeof cell === "string") return shared ? `<c r="${ref}"${style} t="s"><v>${sst(cell)}</v></c>` : `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${writeXmlText(cell)}</t></is></c>`;
        if ("n" in cell) return `<c r="${ref}"${style}><v>${cell.n}</v></c>`;
        if ("rich" in cell) return `<c r="${ref}"${style} t="inlineStr"><is><r><rPr><b/></rPr><t xml:space="preserve">${writeXmlText(cell.rich)}</t></r></is></c>`;
        if ("inline" in cell) return `<c r="${ref}"${style} t="inlineStr"><is><t>${writeXmlText(cell.inline)}</t></is></c>`;
        if ("f" in cell) return `<c r="${ref}"${style}><f>${writeXmlText(cell.f)}</f>${cell.v === undefined ? "" : `<v>${cell.v}</v>`}</c>`;
        return "";
      }).join("");
      return body || hidden ? `<row r="${r + 1}"${hidden}>${body}</row>` : `<row r="${r + 1}"/>`;
    }).join("");
    const width = Math.max(1, ...sheet.rows.map(row => row.length));
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${columnLetters(width - 1)}${sheet.rows.length}"/><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetData>${rows}</sheetData>${sheet.autoFilter ? `<autoFilter ref="A1:${columnLetters(width - 1)}${sheet.rows.length}"/>` : ""}</worksheet>`;
  };
  const parts = sheets.map(sheetXml);
  const sstXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">${strings.map(text => `<si><t xml:space="preserve">${writeXmlText(text)}</t></si>`).join("")}</sst>`;
  const files = {
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    "xl/workbook.xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${writeXmlText(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rIdS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/><Relationship Id="rIdT" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    "xl/styles.xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`),
    "xl/sharedStrings.xml": strToU8(sstXml),
  };
  parts.forEach((xml, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(xml); });
  if (macro) files["xl/vbaProject.bin"] = new Uint8Array([1, 2, 3]);
  return zipSync(files, { mtime: Date.UTC(1980, 0, 1) });
}
