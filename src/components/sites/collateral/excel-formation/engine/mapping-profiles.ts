/**
 * Versioned, editable mapping profiles: Excel column → semantic field → JSON field → transform.
 * The MAU9 profile below was derived from the real headers and checked against the reference JSON (docs/collateral/02-…); every entry that is
 * not verified carries `json: undefined` and is reported as unmapped rather than guessed.
 */
export type FieldRole = "freeText" | "name" | "code" | "date" | "dateDMY" | "amount" | "list";
export type Transform = "string" | "number" | "sum" | "first" | "list-unique" | "date-yyyymmdd";
export interface ColumnSpec {
  header: string;
  field: string;
  role: FieldRole;
  /** Target path in the contractual JSON, when the mapping is verified. */
  json?: string;
  transform?: Transform;
  required?: boolean;
  /** Cells of this column must not contain Vietnamese diacritics (export policy). */
  noDiacritics?: boolean;
  /** The column is a second source used only for comparison with another column. */
  comparisonOf?: string;
  /** How the value reaches the JSON, in words (shown in the mapping step, translated there). */
  rule?: string;
}
/**
 * A group of columns that become one entry of an array in the JSON (a project, a land title, a vehicle). The `anchor` column names the entry:
 * values in the other columns without it are an entry nobody can identify, which is reported as a problem and never dropped.
 */
export interface BlockSpec {
  id: string;
  title: string;
  /** Where the entry goes in the contractual JSON. */
  json: string;
  anchor: string;
  members: string[];
}
export interface MappingProfile {
  id: string;
  version: number;
  title: string;
  /** Columns whose exact values identify one asset: branch + customer + asset. */
  groupBy: { branch: string; customer: string; asset: string };
  /** Fields that must have one value for the whole asset; a difference is reported, not resolved silently. */
  consistentWithinAsset: string[];
  consistentWithinBranch: string[];
  consistentWithinCustomer: string[];
  /** Pair of columns that must hold the same description. */
  descriptionPair?: { primary: string; secondary: string };
  columns: ColumnSpec[];
  blocks?: BlockSpec[];
}

const c = (header: string, field: string, role: FieldRole, extra: Partial<ColumnSpec> = {}): ColumnSpec => ({ header, field, role, ...extra });

export const MAU9_PROFILE: MappingProfile = {
  id: "mau9", version: 1, title: "MAU9 – tài sản bảo đảm",
  groupBy: { branch: "MACNTCTD", customer: "MAKH", asset: "MASOBD" },
  consistentWithinAsset: ["MALOAIBD", "NGBDAU", "NGDINHGIA", "GIATRI", "HOTENCSH", "GIAYTOCNCSH", "MSTCSH", "MOTABDS"],
  consistentWithinBranch: ["TENCNTCTD"],
  consistentWithinCustomer: ["TENKH"],
  descriptionPair: { primary: "MOTABDS", secondary: "MOTABD" },
  columns: [
    c("NGAYDULIEU", "report.date", "dateDMY", { json: "KB001", transform: "date-yyyymmdd", rule: "The one date of the workbook as YYYYMMDD; confirmed at export" }),
    c("MACHINHANH", "branch.office", "code"),
    c("DINHKY", "report.period", "code"),
    c("MACNTCTD", "branch.code", "code", { json: "CNTCTD[].TTC01", transform: "string", required: true, rule: "Groups the rows into branches" }),
    c("TENCNTCTD", "branch.name", "name", { json: "CNTCTD[].TTC02", transform: "first", noDiacritics: true, rule: "First row of the branch" }),
    c("MAKH", "customer.code", "code", { json: "CNTCTD[].KHACHHANG[].TTC03", transform: "string", required: true, rule: "Groups the rows into customers of a branch" }),
    c("TENKH", "customer.name", "name", { json: "CNTCTD[].KHACHHANG[].TTC04", transform: "first", noDiacritics: true, rule: "First row of the customer" }),
    c("MASOBD", "asset.id", "code", { json: "THONGTINBD[].TS001", transform: "string", required: true, rule: "Groups the rows into assets of a customer" }),
    c("MALOAIBD", "asset.type", "code", { json: "THONGTINBD[].TS002", transform: "string", required: true, rule: "First row of the asset" }),
    c("NGBDAU", "asset.start", "date", { json: "THONGTINBD[].TS003", transform: "string", rule: "First row of the asset" }),
    c("NGKT", "asset.end", "date", { json: "THONGTINBD[].TS004", transform: "string", rule: "First row of the asset (empty text when empty)" }),
    c("GIATRI", "asset.value", "amount", { json: "THONGTINBD[].TS005", transform: "first", required: true, rule: "First row of the asset, as a number" }),
    c("GIATRIBDKV", "asset.valueAllocated", "amount", { json: "THONGTINBD[].TS006", transform: "sum", rule: "Exact sum of every row of the asset, as a number" }),
    c("NGDINHGIA", "asset.valuationDate", "date", { json: "THONGTINBD[].TS007", transform: "string", rule: "First row of the asset" }),
    c("GTKHAUTRU", "asset.deduction", "amount", { json: "THONGTINBD[].TS008", transform: "first", rule: "First row of the asset, as a number (0 when empty)" }),
    c("DSSOHD", "asset.contracts", "list", { json: "THONGTINBD[].TS009[]", transform: "list-unique", rule: "Every distinct contract of the asset, first seen first; never split on /" }),
    c("TSCHUNGMATCTD", "asset.sharedBranch", "code", { json: "THONGTINBD[].TS010[]", transform: "list-unique", rule: "Every distinct value of the asset, first seen first" }),
    c("TSCHUNGMAKH", "asset.sharedCustomer", "code", { json: "THONGTINBD[].TS011[]", transform: "list-unique", rule: "Every distinct value of the asset, first seen first" }),
    c("HOTENCSH", "owner.name", "name", { json: "THONGTINBD[].TS012[].TS0121", transform: "first", noDiacritics: true, rule: "One owner per distinct person of the asset" }),
    c("GIAYTOCNCSH", "owner.idDocument", "code", { json: "THONGTINBD[].TS012[].TS0122", transform: "first", rule: "Same owner entry" }),
    c("MSTCSH", "owner.taxCode", "code", { json: "THONGTINBD[].TS012[].TS0123", transform: "first", rule: "Same owner entry" }),
    c("MOTABD", "asset.descriptionAlt", "freeText", { json: "THONGTINBD[].TS015[].TS0154", transform: "first", noDiacritics: true, comparisonOf: "MOTABDS", rule: "Description of the land title entry (the twin of MOTABDS)" }),
    c("CHUDA", "project.owner", "name", { json: "THONGTINBD[].TS014[].TS0141[].TS01411", transform: "list-unique", rule: "One investor per distinct set of investor columns" }),
    c("GIAYTOCHUDA", "project.ownerDocument", "code", { json: "THONGTINBD[].TS014[].TS0141[].TS01412", transform: "list-unique", rule: "Same investor entry" }),
    c("MSTCHUDA", "project.ownerTax", "code", { json: "THONGTINBD[].TS014[].TS0141[].TS01413", transform: "list-unique", rule: "Same investor entry" }),
    c("DIACHICHUDA", "project.ownerAddress", "freeText", { json: "THONGTINBD[].TS014[].TS0141[].TS01414", transform: "list-unique", rule: "Same investor entry" }),
    c("TENDA", "project.name", "freeText", { json: "THONGTINBD[].TS014[].TS0142", transform: "first", rule: "One project per distinct set of project columns" }),
    c("VITRIDA", "project.location", "freeText", { json: "THONGTINBD[].TS014[].TS0143", transform: "first", rule: "Same project entry" }),
    c("MATINHDTU", "project.province", "code", { json: "THONGTINBD[].TS014[].TS0144", transform: "first", rule: "Same project entry" }),
    c("GIAYPHEP", "project.license", "code", { json: "THONGTINBD[].TS014[].TS0145", transform: "first", rule: "Same project entry" }),
    c("GIATRIDA", "project.value", "amount", { json: "THONGTINBD[].TS014[].TS0146", transform: "number", rule: "Same project entry, as a number (0 when empty)" }),
    c("THOIHANDA", "project.deadline", "date", { json: "THONGTINBD[].TS014[].TS0147", transform: "string", rule: "Same project entry" }),
    c("MOTADA", "project.description", "freeText", { json: "THONGTINBD[].TS014[].TS0148", transform: "first", rule: "Same project entry" }),
    c("GIAYCN", "asset.certificate", "code", { json: "THONGTINBD[].TS015[].TS0151", transform: "first", rule: "One land title entry per distinct set of land title columns" }),
    c("DIACHI", "asset.address", "freeText", { json: "THONGTINBD[].TS015[].TS0152", transform: "first", rule: "Same land title entry" }),
    c("MATINH", "asset.province", "freeText", { json: "THONGTINBD[].TS015[].TS0153", transform: "first", rule: "Same land title entry" }),
    c("MOTABDS", "asset.description", "freeText", { json: "THONGTINBD[].TS013", transform: "first", noDiacritics: true, rule: "First row of the asset" }),
    c("LOAIPT", "asset.vehicleType", "code", { json: "THONGTINBD[].TS016[].TS0161", transform: "first", rule: "One vehicle per distinct set of vehicle columns" }),
    c("GIAYDK", "asset.registration", "code", { json: "THONGTINBD[].TS016[].TS0162", transform: "first", rule: "Same vehicle entry" }),
    c("BIENKS", "asset.plate", "freeText", { json: "THONGTINBD[].TS016[].TS0163", transform: "first", rule: "Same vehicle entry" }),
  ],
  // The investor columns sit inside the project entry (TS014 → TS0141), so an investor without a project name is an incomplete project too.
  blocks: [
    { id: "investor", title: "Investor", json: "THONGTINBD[].TS014[].TS0141[]", anchor: "CHUDA", members: ["GIAYTOCHUDA", "MSTCHUDA", "DIACHICHUDA"] },
    { id: "project", title: "Project", json: "THONGTINBD[].TS014[]", anchor: "TENDA", members: ["VITRIDA", "MATINHDTU", "GIAYPHEP", "GIATRIDA", "THOIHANDA", "MOTADA", "CHUDA", "GIAYTOCHUDA", "MSTCHUDA", "DIACHICHUDA"] },
    { id: "land", title: "Land title", json: "THONGTINBD[].TS015[]", anchor: "GIAYCN", members: ["DIACHI", "MATINH"] },
    { id: "vehicle", title: "Vehicle", json: "THONGTINBD[].TS016[]", anchor: "LOAIPT", members: ["GIAYDK", "BIENKS"] },
  ],
};
