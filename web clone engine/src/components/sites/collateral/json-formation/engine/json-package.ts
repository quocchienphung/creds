import { unzipSync, zipSync } from "fflate";
import type { FileNaming } from "./report-options.ts";

/**
 * The file the form asks for: `D40<TCTD code><report date>.<zzz>.json`, and the same name ending in `.zip` for the compressed copy that holds
 * exactly that one file. The TCTD code and the three-character sequence are not in the workbook; they are typed at export and checked here.
 */
export const FILE_PREFIX = "D40";
const TCTD_CODE = /^[A-Za-z0-9]{1,20}$/;
const SEQUENCE = /^[A-Za-z0-9]{3}$/;
export type NamePart = "tctd" | "sequence" | "date";
export interface PackageName { json: string; zip: string }

/** The names of the two files, or null with the parts that are missing or malformed (the date is KB001, YYYYMMDD). */
export function packageName(file: FileNaming | undefined, reportDate: string): { name: PackageName | null; problems: NamePart[] } {
  const problems: NamePart[] = [];
  if (!TCTD_CODE.test(file?.tctd ?? "")) problems.push("tctd");
  if (!SEQUENCE.test(file?.sequence ?? "")) problems.push("sequence");
  if (!/^\d{8}$/.test(reportDate)) problems.push("date");
  if (problems.length) return { name: null, problems };
  const base = `${FILE_PREFIX}${file!.tctd}${reportDate}.${file!.sequence}`;
  return { name: { json: `${base}.json`, zip: `${base}.zip` }, problems };
}

/** A zip with the one JSON in it. The entry's time is the report date, so the same file always gives the same zip. */
export function makeZip(name: string, json: Uint8Array, reportDate: string): Uint8Array {
  const mtime = new Date(Date.UTC(Number(reportDate.slice(0, 4)), Number(reportDate.slice(4, 6)) - 1, Number(reportDate.slice(6, 8))));
  return zipSync({ [name]: [json, { level: 6, mtime }] });
}
/** Read the zip back: one entry, with this name, with these exact bytes. */
export function zipHolds(zip: Uint8Array, name: string, json: Uint8Array): boolean {
  try {
    const entries = unzipSync(zip);
    const names = Object.keys(entries);
    if (names.length !== 1 || names[0] !== name) return false;
    const back = entries[name];
    return back.length === json.length && back.every((byte, index) => byte === json[index]);
  } catch { return false; }
}
