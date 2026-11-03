/**
 * The structure of "Mẫu số 09: Tệp thông tin về biện pháp bảo đảm cấp tín dụng", transcribed key by key from the form: the order of the keys,
 * which values are text, which are numbers and which are lists. The exported file is checked against it at every level, so a key that is
 * missing, added, renamed or out of order anywhere in a 27 MB document is found, not only in the first asset.
 */
export type TemplateNode =
  | { kind: "object"; keys: readonly (readonly [string, TemplateNode])[] }
  | { kind: "array"; of: TemplateNode }
  | { kind: "string" }
  | { kind: "number" };

const text: TemplateNode = { kind: "string" };
const number: TemplateNode = { kind: "number" };
const list = (of: TemplateNode): TemplateNode => ({ kind: "array", of });
const object = (...keys: (readonly [string, TemplateNode])[]): TemplateNode => ({ kind: "object", keys });

const OWNER = object(["TS0121", text], ["TS0122", text], ["TS0123", text]);
const INVESTOR = object(["TS01411", text], ["TS01412", text], ["TS01413", text], ["TS01414", text]);
const PROJECT = object(["TS0141", list(INVESTOR)], ["TS0142", text], ["TS0143", text], ["TS0144", text], ["TS0145", text], ["TS0146", number], ["TS0147", text], ["TS0148", text]);
const LAND = object(["TS0151", text], ["TS0152", text], ["TS0153", text], ["TS0154", text]);
const VEHICLE = object(["TS0161", text], ["TS0162", text], ["TS0163", text]);
const ASSET = object(
  ["TS001", text], ["TS002", text], ["TS003", text], ["TS004", text], ["TS005", number], ["TS006", number], ["TS007", text], ["TS008", number], ["TS013", text],
  ["TS009", list(text)], ["TS010", list(text)], ["TS011", list(text)], ["TS012", list(OWNER)], ["TS014", list(PROJECT)], ["TS015", list(LAND)], ["TS016", list(VEHICLE)],
);
const CUSTOMER = object(["TTC03", text], ["TTC04", text], ["THONGTINBD", list(ASSET)]);
const BRANCH = object(["TTC01", text], ["TTC02", text], ["KHACHHANG", list(CUSTOMER)]);
export const TEMPLATE: TemplateNode = object(["KB001", text], ["KB002", text], ["KB003", text], ["KB004", text], ["CNTCTD", list(BRANCH)]);

/** The keys of one asset in the order of the form (the contractual order, which is not the numeric order: TS013 comes before TS009). */
export const ASSET_KEY_ORDER: readonly string[] = (ASSET as Extract<TemplateNode, { kind: "object" }>).keys.map(([key]) => key);

const kindOf = (value: unknown) => value === null ? "null" : Array.isArray(value) ? "array" : typeof value;

/** Every way `value` departs from the template, with the path of the first departures (document order). Pure; stops after `limit`. */
export function templateProblems(value: unknown, node: TemplateNode = TEMPLATE, path = "report", limit = 8, out: string[] = []): string[] {
  if (out.length >= limit) return out;
  if (node.kind === "string" || node.kind === "number") {
    if (kindOf(value) !== (node.kind === "string" ? "string" : "number")) out.push(`${path}: expected ${node.kind}, found ${kindOf(value)}`);
    return out;
  }
  if (node.kind === "array") {
    if (!Array.isArray(value)) { out.push(`${path}: expected a list, found ${kindOf(value)}`); return out; }
    for (let i = 0; i < value.length && out.length < limit; i++) templateProblems(value[i], node.of, `${path}[${i}]`, limit, out);
    return out;
  }
  if (kindOf(value) !== "object") { out.push(`${path}: expected an object, found ${kindOf(value)}`); return out; }
  const actual = Object.keys(value as object), expected = node.keys.map(([key]) => key);
  if (actual.length !== expected.length || actual.some((key, i) => key !== expected[i])) {
    const missing = expected.filter(key => !actual.includes(key)), extra = actual.filter(key => !expected.includes(key));
    out.push(`${path}: ${missing.length ? `missing ${missing.join(", ")}` : extra.length ? `unexpected ${extra.join(", ")}` : "keys are out of order"}`);
    return out;
  }
  for (const [key, child] of node.keys) { if (out.length >= limit) break; templateProblems((value as Record<string, unknown>)[key], child, `${path}.${key}`, limit, out); }
  return out;
}

/** Every leaf of the template as a path in the notation of the mapping profile (`CNTCTD[].KHACHHANG[].TTC03`, list items end in `[]`). */
export function templateLeaves(node: TemplateNode = TEMPLATE, path = ""): string[] {
  if (node.kind === "string" || node.kind === "number") return [path];
  if (node.kind === "array") return node.of.kind === "string" || node.of.kind === "number" ? [`${path}[]`] : templateLeaves(node.of, `${path}[]`);
  return node.keys.flatMap(([key, child]) => templateLeaves(child, path ? `${path}.${key}` : key));
}
