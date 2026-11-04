// Independent verification of a repaired workbook. Usage: node scripts/collateral/verify-output.mjs before.xlsx after.xlsx
// Reads both files with a DIFFERENT implementation (src/.../independent-ooxml-check.py: Python stdlib, no code shared with the app) and proves:
//   - the package is a valid zip, with the same sheets in the same order, with the same state and the same relationship targets
//   - every cell that differs held a `?` before and holds no formula; every other cell is identical (value, type, formula)
//   - every package part other than the touched sheets and the shared strings is byte-identical
// If python is missing the result is `verification_degraded` and the exit code is 2: the app's own reader is never presented as independent.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const checker = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src/components/sites/collateral/excel-formation/engine/independent-ooxml-check.py");
export function verify(beforePath, afterPath) {
  const python = ["python3", "python"].find(name => spawnSync(name, ["--version"]).status === 0);
  if (!python) return { status: "verification_degraded", reason: "python is not available: no independent reader could run" };
  const read = path => { const r = spawnSync(python, ["-I", checker, path], { encoding: "utf8", maxBuffer: 1 << 29 }); if (r.status !== 0) throw new Error(r.stderr); return JSON.parse(r.stdout); };
  const a = read(beforePath), b = read(afterPath), problems = [];
  if (!a.zipOk || !b.zipOk) problems.push("zip integrity");
  if (JSON.stringify(a.sheets) !== JSON.stringify(b.sheets)) problems.push("sheets (names, order, state or parts) differ");
  if (JSON.stringify(a.relationships) !== JSON.stringify(b.relationships)) problems.push("workbook relationships differ");
  let changed = 0;
  const refs = new Set([...Object.keys(a.cells), ...Object.keys(b.cells)]);
  for (const ref of refs) {
    const x = a.cells[ref], y = b.cells[ref];
    if (JSON.stringify(x) === JSON.stringify(y)) continue;
    changed++;
    if (!x || !y) problems.push(`${ref}: cell appeared or vanished`);
    else if (x[2] !== null || y[2] !== null) problems.push(`${ref}: a formula cell changed`);
    else if (!String(x[1]).includes("?")) problems.push(`${ref}: changed but held no ? before`);
    else if (y[0] === "n") problems.push(`${ref}: became a number`);
  }
  const touched = new Set([...a.sheets.map(s => s.part), "xl/sharedStrings.xml"]);
  for (const part of new Set([...Object.keys(a.parts), ...Object.keys(b.parts)])) if (!touched.has(part) && a.parts[part] !== b.parts[part]) problems.push(`${part}: not a sheet and not the shared strings, yet it differs`);
  return { status: problems.length ? "verification_failed" : "verified_independent", reader: python + " -I independent-ooxml-check.py", changedCells: changed, cells: refs.size, sheets: a.sheets.length, problems };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [before, after] = process.argv.slice(2);
  if (!before || !after) { console.error("usage: verify-output.mjs before.xlsx after.xlsx"); process.exit(64); }
  const result = verify(before, after); console.log(JSON.stringify(result, null, 2));
  process.exit(result.status === "verified_independent" ? 0 : result.status === "verification_degraded" ? 2 : 1);
}
