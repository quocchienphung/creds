import { z } from "zod";
import type { Row, Workbook } from "../../excel-formation/engine/types.ts";
import type { ColumnSpec, MappingProfile } from "../../excel-formation/engine/mapping-profiles.ts";
import type { WorkbookProfile } from "../../excel-formation/engine/profile.ts";
import { ASSET_KEY_ORDER, templateProblems } from "./template-mau09.ts";

/**
 * Grouped banking JSON: branch → customer → asset, built from the reviewed workbook (original cells + approved patches). The shape and the
 * rules come from the reference file and are documented in docs/collateral/02 and 04. Pure and deterministic: the same workbook, mapping,
 * patches and options always give byte-identical output. Nothing here knows about the screen.
 */
export interface JsonNumber { $num: string }
export interface OwnerOut { TS0121: string; TS0122: string; TS0123: string }
export interface InvestorOut { TS01411: string; TS01412: string; TS01413: string; TS01414: string }
export interface ProjectOut { TS0141: InvestorOut[]; TS0142: string; TS0143: string; TS0144: string; TS0145: string; TS0146: JsonNumber; TS0147: string; TS0148: string }
export interface LandOut { TS0151: string; TS0152: string; TS0153: string; TS0154: string }
export interface VehicleOut { TS0161: string; TS0162: string; TS0163: string }
export interface AssetOut {
  TS001: string; TS002: string; TS003: string; TS004: string; TS005: JsonNumber; TS006: JsonNumber; TS007: string; TS008: JsonNumber; TS013: string;
  TS009: string[]; TS010: string[]; TS011: string[]; TS012: OwnerOut[]; TS014: ProjectOut[]; TS015: LandOut[]; TS016: VehicleOut[];
}
export interface CustomerOut { TTC03: string; TTC04: string; THONGTINBD: AssetOut[] }
export interface BranchOut { TTC01: string; TTC02: string; KHACHHANG: CustomerOut[] }
export interface ReportOut { KB001: string; KB002: string; KB003: string; KB004: string; CNTCTD: BranchOut[] }

import { defaultReportOptions } from "./report-options.ts";
import type { ReportMeta, ReportOptions } from "./report-options.ts";
export { defaultReportOptions };
export type { OrderPolicy, OwnerPolicy, ReportMeta, ReportOptions } from "./report-options.ts";

/** Text of a cell after review: the approved patch if there is one, otherwise the original. */
export type ValueAt = (row: Row, col: number) => string;

export interface Reconciliation {
  rowsInSheet: number;
  rowsGrouped: number;
  rowsUnmatched: number;
  rowsEmptySkipped: number;
  branches: number;
  customers: number;
  assets: number;
  /** Contract numbers across all assets (after the same number is listed once per asset). */
  contracts: number;
  /** Rows that repeat a contract number already listed for the same asset (merged, never lost). */
  duplicateContractRows: number;
  owners: number;
  assetsWithoutOwner: number;
  assetsWithSeveralOwners: number;
  /** Assets that carry at least one entry of TS010/TS011 (shared collateral), TS014 (project), TS015 (land title) or TS016 (vehicle). */
  assetsWithShared: number;
  assetsWithProject: number;
  assetsWithLand: number;
  assetsWithVehicle: number;
  /** How many assets are made of 1, 2, 3, 4, 5, more rows: why rows and assets differ. */
  rowsPerAsset: Record<string, number>;
  /** Assets whose rows disagree on a value that goes into the JSON (the first row, or the sum, is used and the difference is reported). */
  assetsWithValueConflicts: number;
  /** Approved edits that could not reach the JSON because they are on a row that does not supply the asset's value. */
  patchedCellsNotUsed: number;
  patchedCells: number;
}
export interface ReportResult { report: ReportOut; reconciliation: Reconciliation; problems: string[] }

const NUMBER = /^-?\d+(\.\d+)?$/;
/** A valid JSON number literal that keeps the exact decimal text of the cell. */
export function numberLiteral(text: string): string | null {
  const t = text.trim();
  if (t === "") return null;
  if (NUMBER.test(t)) {
    let out = t.includes(".") ? t.replace(/0+$/, "").replace(/\.$/, "") : t;
    if (/^-0$/.test(out)) out = "0";
    return out.replace(/^(-?)0+(?=\d)/, "$1");
  }
  const exponent = /^(-?)(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/.exec(t);
  if (!exponent) return null;
  const [, sign, whole, frac = "", e] = exponent;
  const shift = Number(e);
  if (!Number.isInteger(shift) || Math.abs(shift) > 1000 || whole.length + frac.length > 10000) return null;
  const digits = whole + frac, point = whole.length + shift;
  return numberLiteral(sign + (point <= 0 ? "0." + "0".repeat(-point) + digits : point >= digits.length ? digits + "0".repeat(point - digits.length) : digits.slice(0, point) + "." + digits.slice(point)));
}
/** Exact decimal sum of number texts (BigInt on a common scale), so amounts never pick up floating point error. */
export function sumDecimals(texts: string[]): string | null {
  const ONE = BigInt(1), ZERO = BigInt(0);
  const parts: { sign: bigint; digits: string; frac: number }[] = [];
  for (const raw of texts) {
    const text = numberLiteral(raw);
    if (text === null || !NUMBER.test(text)) return null;
    const negative = text.startsWith("-"), [whole, frac = ""] = text.replace("-", "").split(".");
    parts.push({ sign: negative ? -ONE : ONE, digits: whole + frac, frac: frac.length });
  }
  const scale = Math.max(0, ...parts.map(p => p.frac));
  let total = ZERO;
  for (const p of parts) total += p.sign * BigInt(p.digits + "0".repeat(scale - p.frac));
  const negative = total < ZERO;
  let digits = (negative ? -total : total).toString().padStart(scale + 1, "0");
  if (scale) digits = digits.slice(0, -scale) + "." + digits.slice(-scale);
  return numberLiteral((negative ? "-" : "") + digits);
}
/** DD/MM/YYYY (the workbook's report date) → YYYYMMDD. */
export function reportDateFrom(text: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text.trim());
  if (!m) return /^\d{8}$/.test(text.trim()) ? text.trim() : null;
  const out = `${m[3]}${m[2]}${m[1]}`;
  return validYmd(out) ? out : null;
}
export function validYmd(text: string): boolean {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(text);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return y >= 1900 && y <= 2200 && date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}
/** The report date found in the workbook: one value for every row, or null with the reason. */
export function workbookReportDate(sheetRows: Row[], col: number | undefined, valueAt: ValueAt): { date: string | null; distinct: number } {
  if (col === undefined) return { date: null, distinct: 0 };
  const dates = new Set<string>();
  for (const row of sheetRows) { const text = valueAt(row, col).trim(); if (text !== "") dates.add(reportDateFrom(text) ?? `invalid:${text}`); }
  const only = dates.size === 1 ? [...dates][0] : null;
  return { date: only && !only.startsWith("invalid:") ? only : null, distinct: dates.size };
}

const num = (text: string): JsonNumber => ({ $num: numberLiteral(text) ?? "0" });
/** The report with its header keys in the order of the form, whatever order the caller's object had. */
const withMeta = (meta: ReportMeta, CNTCTD: BranchOut[]): ReportOut => ({ KB001: meta.KB001, KB002: meta.KB002, KB003: meta.KB003, KB004: meta.KB004, CNTCTD });
const filled = (values: readonly string[]) => values.some(value => value.trim() !== "");

/** Group the reviewed rows into the nested report. Rows with an empty key are counted as unmatched, never silently dropped. */
export function buildReport(workbook: Workbook, wprofile: WorkbookProfile, profile: MappingProfile, valueAt: ValueAt, meta: ReportMeta, options: ReportOptions = defaultReportOptions, patchedCells: Set<string> = new Set()): ReportResult {
  const sheet = workbook.sheets.find(item => item.name === wprofile.primary);
  const sheetProfile = wprofile.sheets.find(item => item.name === wprofile.primary);
  const problems: string[] = [];
  const empty: Reconciliation = { rowsInSheet: 0, rowsGrouped: 0, rowsUnmatched: 0, rowsEmptySkipped: sheet?.emptyRows ?? 0, branches: 0, customers: 0, assets: 0, contracts: 0, duplicateContractRows: 0, owners: 0, assetsWithoutOwner: 0, assetsWithSeveralOwners: 0, assetsWithShared: 0, assetsWithProject: 0, assetsWithLand: 0, assetsWithVehicle: 0, rowsPerAsset: {}, assetsWithValueConflicts: 0, patchedCellsNotUsed: 0, patchedCells: patchedCells.size };
  if (!sheet || !sheetProfile || sheetProfile.headerRow === null || !wprofile.mapping) return { report: withMeta(meta, []), reconciliation: empty, problems: ["No worksheet matches the mapping profile."] };
  const colOf = (header: string) => wprofile.mapping!.resolved.find(item => item.spec.header === header)?.col;
  const need = (header: string): number => { const col = colOf(header); if (col === undefined) problems.push(`Column ${header} is not mapped.`); return col ?? -1; };
  const c = {
    branch: need(profile.groupBy.branch), customer: need(profile.groupBy.customer), asset: need(profile.groupBy.asset),
    branchName: colOf("TENCNTCTD"), customerName: colOf("TENKH"), type: colOf("MALOAIBD"), start: colOf("NGBDAU"), end: colOf("NGKT"), value: colOf("GIATRI"), allocated: colOf("GIATRIBDKV"),
    valuation: colOf("NGDINHGIA"), deduction: colOf("GTKHAUTRU"), contract: colOf("DSSOHD"), ownerName: colOf("HOTENCSH"), ownerDoc: colOf("GIAYTOCNCSH"), ownerTax: colOf("MSTCSH"), description: colOf("MOTABDS"),
    sharedBranch: colOf("TSCHUNGMATCTD"), sharedCustomer: colOf("TSCHUNGMAKH"),
    investor: colOf("CHUDA"), investorDoc: colOf("GIAYTOCHUDA"), investorTax: colOf("MSTCHUDA"), investorAddress: colOf("DIACHICHUDA"),
    projectName: colOf("TENDA"), projectPlace: colOf("VITRIDA"), projectProvince: colOf("MATINHDTU"), projectLicense: colOf("GIAYPHEP"), projectValue: colOf("GIATRIDA"), projectDeadline: colOf("THOIHANDA"), projectNote: colOf("MOTADA"),
    landCertificate: colOf("GIAYCN"), landAddress: colOf("DIACHI"), landProvince: colOf("MATINH"), landNote: colOf("MOTABD"),
    vehicleType: colOf("LOAIPT"), vehicleRegistration: colOf("GIAYDK"), vehiclePlate: colOf("BIENKS"),
  };
  if (problems.length) return { report: withMeta(meta, []), reconciliation: empty, problems };
  const data = sheet.rows.filter(row => row.r > sheetProfile.headerRow!);
  const text = (row: Row, col: number | undefined) => col === undefined ? "" : valueAt(row, col);

  interface AssetGroup { rows: Row[] }
  const branches = new Map<string, { name: string; customers: Map<string, { name: string; assets: Map<string, AssetGroup> }> }>();
  let unmatched = 0;
  for (const row of data) {
    const b = text(row, c.branch), k = text(row, c.customer), a = text(row, c.asset);
    if (b === "" || k === "" || a === "") { unmatched++; continue; }
    let branch = branches.get(b);
    if (!branch) branches.set(b, branch = { name: text(row, c.branchName), customers: new Map() });
    let customer = branch.customers.get(k);
    if (!customer) branch.customers.set(k, customer = { name: text(row, c.customerName), assets: new Map() });
    const group = customer.assets.get(a);
    if (group) group.rows.push(row); else customer.assets.set(a, { rows: [row] });
  }

  const rec: Reconciliation = { ...empty, rowsInSheet: data.length, rowsUnmatched: unmatched, rowsGrouped: data.length - unmatched, branches: branches.size };
  const out: BranchOut[] = [];
  const representatives = new Set<string>();
  for (const [branchCode, branch] of branches) {
    const customers: CustomerOut[] = [];
    for (const [customerCode, customer] of branch.customers) {
      rec.customers++;
      const assets: AssetOut[] = [];
      for (const [assetId, group] of customer.assets) {
        rec.assets++;
        const first = group.rows[0];
        representatives.add(`${first.r}`);
        const bucket = group.rows.length > 5 ? ">5" : String(group.rows.length);
        rec.rowsPerAsset[bucket] = (rec.rowsPerAsset[bucket] ?? 0) + 1;
        const contracts: string[] = [];
        for (const row of group.rows) { const v = text(row, c.contract); if (v === "") continue; if (contracts.includes(v)) rec.duplicateContractRows++; else contracts.push(v); }
        const owners: OwnerOut[] = [];
        for (const row of group.rows) {
          const owner = { TS0121: text(row, c.ownerName), TS0122: text(row, c.ownerDoc), TS0123: text(row, c.ownerTax) };
          if (owner.TS0121 === "" && owner.TS0122 === "" && owner.TS0123 === "") continue;
          if (!owners.some(item => item.TS0121 === owner.TS0121 && item.TS0122 === owner.TS0122 && item.TS0123 === owner.TS0123)) owners.push(owner);
          if (options.ownerPolicy === "first") break;
        }
        // Shared collateral (TS010, TS011): every distinct value of the asset's rows, first seen first.
        const distinct = (col: number | undefined) => { const found: string[] = []; for (const row of group.rows) { const v = text(row, col); if (v !== "" && !found.includes(v)) found.push(v); } return found; };
        const sharedBranches = distinct(c.sharedBranch), sharedCustomers = distinct(c.sharedCustomer);
        // Projects (TS014): one entry per distinct set of project columns, with the investors listed under it (TS0141). A row that has only
        // investor columns makes a project entry with empty project fields: the values are kept and the review flags the missing project name.
        const projects = new Map<string, ProjectOut>();
        for (const row of group.rows) {
          const project = [c.projectName, c.projectPlace, c.projectProvince, c.projectLicense, c.projectValue, c.projectDeadline, c.projectNote].map(col => text(row, col));
          const investor = [c.investor, c.investorDoc, c.investorTax, c.investorAddress].map(col => text(row, col));
          if (!filled(project) && !filled(investor)) continue;
          const key = project.join("\u0001");
          let entry = projects.get(key);
          if (!entry) {
            if (project[4].trim() !== "" && numberLiteral(project[4]) === null) problems.push(`Asset in row ${first.r}: GIATRIDA is not a number.`);
            projects.set(key, entry = { TS0141: [], TS0142: project[0], TS0143: project[1], TS0144: project[2], TS0145: project[3], TS0146: num(project[4] || "0"), TS0147: project[5], TS0148: project[6] });
          }
          if (filled(investor) && !entry.TS0141.some(item => item.TS01411 === investor[0] && item.TS01412 === investor[1] && item.TS01413 === investor[2] && item.TS01414 === investor[3])) entry.TS0141.push({ TS01411: investor[0], TS01412: investor[1], TS01413: investor[2], TS01414: investor[3] });
        }
        // Land titles (TS015) and vehicles (TS016): one entry per distinct set of their columns. The description of a land title (TS0154) is the
        // description column of the first row that has the entry; it never makes an entry by itself, since every row has one.
        const lands = new Map<string, LandOut>(), vehicles = new Map<string, VehicleOut>();
        for (const row of group.rows) {
          const land = [c.landCertificate, c.landAddress, c.landProvince].map(col => text(row, col));
          if (filled(land) && !lands.has(land.join("\u0001"))) lands.set(land.join("\u0001"), { TS0151: land[0], TS0152: land[1], TS0153: land[2], TS0154: text(row, c.landNote) });
          const vehicle = [c.vehicleType, c.vehicleRegistration, c.vehiclePlate].map(col => text(row, col));
          if (filled(vehicle) && !vehicles.has(vehicle.join("\u0001"))) vehicles.set(vehicle.join("\u0001"), { TS0161: vehicle[0], TS0162: vehicle[1], TS0163: vehicle[2] });
        }
        if (sharedBranches.length || sharedCustomers.length) rec.assetsWithShared++;
        if (projects.size) rec.assetsWithProject++;
        if (lands.size) rec.assetsWithLand++;
        if (vehicles.size) rec.assetsWithVehicle++;
        const allocated = sumDecimals(group.rows.map(row => text(row, c.allocated)).filter(v => v.trim() !== ""));
        if (allocated === null && group.rows.some(row => text(row, c.allocated).trim() !== "")) problems.push(`Asset in row ${first.r}: GIATRIBDKV has a value that is not a number.`);
        const valueText = text(first, c.value);
        if (valueText.trim() !== "" && numberLiteral(valueText) === null) problems.push(`Asset in row ${first.r}: GIATRI is not a number.`);
        const differs = [c.type, c.start, c.valuation, c.value, c.description].some(col => col !== undefined && new Set(group.rows.map(row => text(row, col))).size > 1);
        if (differs) rec.assetsWithValueConflicts++;
        rec.contracts += contracts.length; rec.owners += owners.length;
        if (owners.length === 0) rec.assetsWithoutOwner++;
        if (owners.length > 1) rec.assetsWithSeveralOwners++;
        assets.push({
          TS001: assetId, TS002: text(first, c.type), TS003: text(first, c.start), TS004: text(first, c.end), TS005: num(valueText), TS006: num(allocated ?? "0"), TS007: text(first, c.valuation), TS008: num(text(first, c.deduction) || "0"),
          TS013: text(first, c.description), TS009: contracts, TS010: sharedBranches, TS011: sharedCustomers, TS012: owners, TS014: [...projects.values()], TS015: [...lands.values()], TS016: [...vehicles.values()],
        });
      }
      customers.push({ TTC03: customerCode, TTC04: customer.name, THONGTINBD: assets });
    }
    out.push({ TTC01: branchCode, TTC02: branch.name, KHACHHANG: customers });
  }
  // Approved edits on rows that do not supply a value of the asset are still in the corrected workbook, but not in the JSON.
  const wantedCols = new Set([c.type, c.start, c.end, c.value, c.valuation, c.deduction, c.description, c.branchName, c.customerName].filter((v): v is number => v !== undefined));
  for (const key of patchedCells) {
    const [rowText, colText] = key.split("\u0001").slice(1);
    const col = Number(colText);
    if (wantedCols.has(col) && !representatives.has(rowText)) rec.patchedCellsNotUsed++;
  }
  if (unmatched) problems.push(`${unmatched} rows have an empty branch, customer or asset code and cannot be placed in the hierarchy.`);
  if (options.order === "code") {
    const byCode = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
    out.sort((a, b) => byCode(a.TTC01, b.TTC01));
    for (const item of out) { item.KHACHHANG.sort((a, b) => byCode(a.TTC03, b.TTC03)); for (const customer of item.KHACHHANG) customer.THONGTINBD.sort((a, b) => byCode(a.TS001, b.TS001)); }
  }
  return { report: withMeta(meta, out), reconciliation: rec, problems };
}

// ── serialisation and schema ────────────────────────────────────────────────────────────────────────────────────────────────────────
const isNum = (value: unknown): value is JsonNumber => typeof value === "object" && value !== null && "$num" in value;
/** Deterministic text: keys in the order built above, a tab per level like the reference, LF, numbers exactly as their literal. */
export function stringifyReport(value: unknown, depth = 0): string {
  const pad = "\t".repeat(depth + 1), end = "\t".repeat(depth);
  if (isNum(value)) return value.$num;
  if (Array.isArray(value)) return value.length === 0 ? "[]" : "[\n" + value.map(item => pad + stringifyReport(item, depth + 1)).join(",\n") + "\n" + end + "]";
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    return entries.length === 0 ? "{}" : "{\n" + entries.map(([key, item]) => `${pad}${JSON.stringify(key)}: ${stringifyReport(item, depth + 1)}`).join(",\n") + "\n" + end + "}";
  }
  return JSON.stringify(value);
}

const ymd = z.string().regex(/^\d{8}$/).refine(validYmd, "not a real date");
const optionalYmd = z.union([z.literal(""), ymd]);
const owner = z.strictObject({ TS0121: z.string(), TS0122: z.string(), TS0123: z.string() });
const investor = z.strictObject({ TS01411: z.string(), TS01412: z.string(), TS01413: z.string(), TS01414: z.string() });
const project = z.strictObject({ TS0141: z.array(investor), TS0142: z.string(), TS0143: z.string(), TS0144: z.string(), TS0145: z.string(), TS0146: z.number(), TS0147: optionalYmd, TS0148: z.string() });
const land = z.strictObject({ TS0151: z.string(), TS0152: z.string(), TS0153: z.string(), TS0154: z.string() });
const vehicle = z.strictObject({ TS0161: z.string(), TS0162: z.string(), TS0163: z.string() });
const asset = z.strictObject({
  TS001: z.string().min(1), TS002: z.string().min(1), TS003: optionalYmd, TS004: optionalYmd, TS005: z.number(), TS006: z.number(), TS007: optionalYmd, TS008: z.number(), TS013: z.string(),
  TS009: z.array(z.string().min(1)), TS010: z.array(z.string().min(1)), TS011: z.array(z.string().min(1)), TS012: z.array(owner), TS014: z.array(project), TS015: z.array(land), TS016: z.array(vehicle),
});
const customer = z.strictObject({ TTC03: z.string().min(1), TTC04: z.string(), THONGTINBD: z.array(asset).min(1) });
const branch = z.strictObject({ TTC01: z.string().min(1), TTC02: z.string(), KHACHHANG: z.array(customer).min(1) });
/** The contractual schema: Mẫu số 09 (template-mau09.ts) for the keys and their order, this for the formats (docs/collateral/02). Internal review data can never pass: keys are strict. */
export const reportSchema = z.strictObject({ KB001: ymd, KB002: z.string().min(1), KB003: z.string().min(1), KB004: z.string().min(1), CNTCTD: z.array(branch) });

export const ASSET_KEYS = ASSET_KEY_ORDER;
export interface Verification { ok: boolean; utf8: boolean; parses: boolean; schemaErrors: string[]; /** Every object of the document has exactly the keys of the form, in its order, with the right kinds of value. */ keyOrderOk: boolean; templateErrors: string[]; bytes: number }
/** Encode, then prove it: strict UTF-8 decode, JSON.parse, schema, key order. Returns the bytes whatever the result; `ok` says if they may be offered. */
export function encodeAndVerify(report: ReportOut): { bytes: Uint8Array; verification: Verification } {
  const text = stringifyReport(report) + "\n";
  // JSON.stringify writes a lone surrogate as the escape \\udXXX, and TextEncoder would turn a raw one into U+FFFD: both are text that was
  // damaged on the way out, so either is refused before any byte is offered.
  const wellFormed = !/\\u[dD][89a-fA-F][0-9a-fA-F]{2}/.test(text) && !/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(text);
  const bytes = new TextEncoder().encode(text);
  let utf8 = wellFormed, parses = false, keyOrderOk = true;
  const schemaErrors: string[] = [];
  let templateErrors: string[] = [];
  let parsed: unknown;
  try { const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes); parsed = JSON.parse(decoded); parses = true; } catch (error) { if (error instanceof TypeError) utf8 = false; }
  if (parses) {
    const check = reportSchema.safeParse(parsed);
    if (!check.success) for (const issue of check.error.issues.slice(0, 8)) schemaErrors.push(`${issue.path.slice(0, 6).join(".")}: ${issue.message}`);
    templateErrors = templateProblems(parsed);
    keyOrderOk = templateErrors.length === 0;
  }
  return { bytes, verification: { ok: utf8 && parses && schemaErrors.length === 0 && keyOrderOk, utf8, parses, schemaErrors, keyOrderOk, templateErrors, bytes: bytes.length } };
}
export type ColumnSpecOf = ColumnSpec;
