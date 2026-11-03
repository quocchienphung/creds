export interface ReportMeta { KB001: string; KB002: string; KB003: string; KB004: string }
export type OwnerPolicy = "distinct" | "first";
/** `code`: branches, customers and assets in ascending code order (what the reference file shows at every level); `source`: as they first appear in the workbook. */
export type OrderPolicy = "code" | "source";
/** The two parts of the file name that are not in the workbook: the reporting TCTD's code and the three-character sequence (`D40<code><date>.<zzz>.json`). */
export interface FileNaming { tctd: string; sequence: string }
export const emptyFileNaming: FileNaming = { tctd: "", sequence: "" };
export interface ReportOptions { ownerPolicy: OwnerPolicy; order: OrderPolicy; file?: FileNaming }
export const defaultReportOptions: ReportOptions = { ownerPolicy: "distinct", order: "code", file: emptyFileNaming };
