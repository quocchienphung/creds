// CLI for src/lib/excel-csv. Everything stays local: no network, no logging of cell values. Never overwrites the input or an existing output.
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { convertWorkbook, inspectWorkbook, ConversionError } from "../src/lib/excel-csv/conversion-engine.ts";

const HELP = `Usage: npm run excel-csv -- <file.xlsx> [options]

  --inspect            only show sheets, ranges and risks (no output file)
  --sheet <name>       sheet to export (repeat for several; required if the workbook has more than one)
  --mode <m>           standard_csv (default) | single_column_csv | plain_text_comma (.txt)
  --out <dir>          output folder (default: next to the input)
  --range <A1:J20>     export exactly this range instead of the data region
  --entire             keep the empty rows above the data (A1 to the last cell)
  --no-bom             UTF-8 without BOM
  --lf                 LF line endings instead of CRLF
  --exclude-hidden     leave hidden rows out
  --safe               prefix ' on text starting with = + - @ (changes values, reported)
  --sampled            sampled verification (reported as not fully verified)
  --force              overwrite existing output files`;

const { values: v, positionals } = parseArgs({ allowPositionals: true, options: {
  inspect: { type: "boolean" }, sheet: { type: "string", multiple: true }, mode: { type: "string" }, out: { type: "string" }, range: { type: "string" },
  entire: { type: "boolean" }, "no-bom": { type: "boolean" }, lf: { type: "boolean" }, "exclude-hidden": { type: "boolean" }, safe: { type: "boolean" },
  sampled: { type: "boolean" }, force: { type: "boolean" }, help: { type: "boolean" },
} });
if (v.help || positionals.length !== 1) { console.log(HELP); process.exit(v.help ? 0 : 2); }

const file = resolve(positionals[0]);
try {
  const input = { name: basename(file), bytes: new Uint8Array(readFileSync(file)) };
  if (v.inspect) { console.log(JSON.stringify(inspectWorkbook(input), null, 2)); process.exit(0); }
  const files = await convertWorkbook(input, {
    outputMode: v.mode ?? "standard_csv", sheetNames: v.sheet, rangePolicy: v.entire || v.range ? "entire_selected_range" : "data_region", explicitRange: v.range,
    bom: !v["no-bom"], recordDelimiter: v.lf ? "\n" : "\r\n", includeHidden: !v["exclude-hidden"],
    csvFormulaProtection: v.safe ? "excel_view_safe" : "lossless", verification: v.sampled ? "sampled" : "full",
  });
  const outDir = resolve(v.out ?? dirname(file));
  mkdirSync(outDir, { recursive: true });
  let failed = false;
  for (const { fileName, bytes, report } of files) {
    const target = join(outDir, fileName), { warnings, mismatches, ...summary } = report;
    console.log(`\n${fileName}`);
    console.log(JSON.stringify(summary, null, 2));
    for (const w of warnings) console.log(`  warning ${w.code}${w.cell ? ` @${w.cell}` : ""}: ${w.detail}`);
    if (report.verificationStatus === "failed") { failed = true; console.error(`  NOT WRITTEN: verification failed at ${mismatches.join(", ")}`); continue; }
    if (existsSync(target) && !v.force) { failed = true; console.error(`  NOT WRITTEN: ${target} already exists (use --force)`); continue; }
    const tmp = `${target}.${process.pid}.tmp`;
    try { writeFileSync(tmp, bytes); renameSync(tmp, target); } finally { rmSync(tmp, { force: true }); }
    console.log(`  written: ${target}`);
  }
  process.exit(failed ? 1 : 0);
} catch (error) {
  console.error(error instanceof ConversionError ? `Error [${error.code}]: ${error.message}` : error.code === "ENOENT" ? `File not found: ${file}` : `Error: ${error.message}`);
  process.exit(1);
}
