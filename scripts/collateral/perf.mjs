// Wall-clock and peak memory of the one-click repair on a large SYNTHETIC workbook. Run: node --experimental-strip-types scripts/collateral/perf.mjs [--rows 120000]
// Peak RSS of this Node process stands in for the worker's memory (a browser worker was NOT measured).
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const engine = join(root, "src/components/sites/collateral/excel-formation/engine");
const load = p => import(join(engine, p));
const { buildXlsx } = await load("xlsx-builder.mjs"), { openSession } = await load("session.ts"), { emptyReview } = await load("review.ts"), { autoRepair } = await load("auto-repair.ts"), { generate } = await load("collateral/synth.ts");
const at = process.argv.indexOf("--rows"), ROWS = at < 0 ? 120000 : Number(process.argv[at + 1]);
const pool = [...generate({ split: "test", count: 600, seed: 1 }), ...generate({ split: "validation", count: 600, seed: 2 })];
const cleanPool = pool.map(r => r.asciiTruth);
const rows = [["STT", "Mo ta tai san", "Ghi chu", "Gia tri"]];
for (let i = 0; i < ROWS; i++) { const r = pool[i % pool.length]; const dirty = i % 5 === 0; rows.push([{ n: String(i) }, dirty ? r.corruptedInput + " " + (i % 997) : cleanPool[(i * 7) % cleanPool.length] + " " + (i % 997), "ghi chu " + (i % 50), { n: String(i * 1000) }]); }
const per = 80000, body = rows.slice(1), sheets = [];
for (let at = 0, n = 1; at < body.length; at += per, n++) sheets.push({ name: "S" + n, rows: [rows[0], ...body.slice(at, at + per)] });
const bytes = buildXlsx(sheets);
const mb = bytes.length / 1048576;
const t0 = performance.now(), session = await openSession(bytes, "big.xlsx"), tOpen = performance.now() - t0;
const t1 = performance.now(), out = await autoRepair(session, emptyReview(), { policy: "FORCE_NO_QUESTION_MARK", collateral: true }), tRepair = performance.now() - t1;
console.log(JSON.stringify({ SYNTHETIC: true, rows: ROWS, fileMB: +mb.toFixed(1), openSeconds: +(tOpen / 1000).toFixed(1), repairSeconds: +(tRepair / 1000).toFixed(1), timings: Object.fromEntries(Object.entries(out.report.timings).map(([k, v]) => [k, +(v / 1000).toFixed(2)])), cellsChanged: out.report.metrics.outputCellsChanged, unexpected: out.report.metrics.outputUnexpectedChanges, cellsRecovered: out.report.collateral?.cellsRecovered, peakRssMB: Math.round(process.resourceUsage().maxRSS / 1024) }, null, 2));
