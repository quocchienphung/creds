// Aggregate profile of the damage in real workbooks, COUNTS ONLY (no cell text is printed or stored). Run locally:
//   node --experimental-strip-types scripts/collateral/profile-corruption.mjs file1.xlsx [file2.xlsx ...]
// Use the result to set the operator mix of the synthetic lab (synth.ts) from measurements instead of assumptions.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const { readWorkbook } = await import(join(root, "src/components/sites/collateral/excel-formation/engine/xlsx-reader.ts"));
const files = process.argv.slice(2); if (!files.length) { console.error("usage: profile-corruption.mjs file.xlsx ..."); process.exit(64); }
const hist = (o, k) => { o[k] = (o[k] ?? 0) + 1; };
const p = { files: files.length, sheets: 0, textCells: 0, cellsWithQuestion: 0, cellsWithReplacementChar: 0, cellsWithMojibake: 0, tokens: 0, damagedTokens: 0, position: { first: 0, middle: 0, last: 0, whole: 0 }, questionsPerToken: {}, damagedTokensPerCell: {}, damagedTokenLength: {}, casing: { upper: 0, title: 0, lower: 0 }, cleanShareOfDamagedCells: [], terminalQuestion: 0, questionInsideCode: 0 };
for (const file of files) {
  const wb = readWorkbook(new Uint8Array(readFileSync(file)), { fileName: "x.xlsx", fileHash: "profile" });
  for (const sheet of wb.sheets) { p.sheets++; for (const row of sheet.rows) for (const cell of row.cells) {
    if (!cell || cell.f || !["s", "str", "inlineStr"].includes(cell.t)) continue;
    p.textCells++; const v = cell.v;
    if (/[ÃÄÆáâ]/.test(v) && !v.includes("?")) p.cellsWithMojibake++;
    if (v.includes("�")) p.cellsWithReplacementChar++;
    if (!v.includes("?")) continue;
    p.cellsWithQuestion++;
    const tokens = v.split(/\s+/).filter(Boolean); p.tokens += tokens.length;
    const bad = tokens.filter(t => t.includes("?"));
    hist(p.damagedTokensPerCell, Math.min(bad.length, 10));
    p.cleanShareOfDamagedCells.push(+(1 - bad.length / tokens.length).toFixed(2));
    if (/\?$/.test(v)) p.terminalQuestion++;
    for (const t of bad) {
      if (/\d/.test(t)) { p.questionInsideCode++; continue; }
      p.damagedTokens++; const core = t.replace(/^[^\p{L}?]+|[^\p{L}?]+$/gu, "");
      hist(p.questionsPerToken, Math.min((core.match(/\?/g) ?? []).length, 5)); hist(p.damagedTokenLength, Math.min(core.length, 12));
      if (/^\?+$/.test(core)) p.position.whole++; else if (core.startsWith("?")) p.position.first++; else if (core.endsWith("?")) p.position.last++; else p.position.middle++;
      const letters = core.replace(/\?/g, ""); if (letters) p.casing[letters === letters.toUpperCase() && letters.length > 1 ? "upper" : /^\p{Lu}/u.test(letters) ? "title" : "lower"]++;
    } } }
}
const share = p.cleanShareOfDamagedCells; delete p.cleanShareOfDamagedCells;
p.meanCleanShareOfDamagedCells = share.length ? +(share.reduce((a, b) => a + b, 0) / share.length).toFixed(3) : null;
console.log(JSON.stringify(p, null, 2));
