/**
 * The model behind the JSON viewer: what a row says, how paths are written, how a tree becomes a flat list of rows with paging, and how search
 * walks a value. Pure (no DOM, no React), so every rule is testable against what was read off the public preview of UIArc's JSON viewer
 * (`docs/research/json-viewer/`): row labels, previews, count labels, "Show N more" rows, set sizes, match order.
 *
 * Rules marked "inferred" were not observable on the preview's own data (for instance the label of a branch with one key) and follow the
 * obvious English form.
 */
export type JsonValueType = "object" | "array" | "string" | "number" | "boolean" | "null" | "other";

export interface JsonNodeInfo {
  /** `root.users[0].name`: the root name, then `.key` or `[index]`. */
  path: string;
  /** What the row shows as its key: a key, or an array index. */
  key: string;
  isIndex: boolean;
  type: JsonValueType;
  /** Keys or items of a branch. */
  count: number;
  /** A primitive as it is drawn: strings in double quotes. */
  text: string;
  /** A primitive as a screen reader and a copy want it: strings without quotes. */
  plain: string;
  /** Closed branches only: `{ id, name, email, … }` or `[…]`. */
  preview: string;
}

export interface SearchStep { path: string; index: number; key: string }
export interface SearchHit { path: string; trail: SearchStep[] }
export interface SearchResult { hits: SearchHit[]; capped: boolean }
export const SEARCH_LIMIT = 2000;
export const ROW_HEIGHT = 30;
export const TREE_PADDING = 6;
export const ANIMATED_ROW_LIMIT = 400;
/** Expand all on a document that answers later stops opening branches once this many rows are drawn (a 27 MB document has hundreds of thousands). */
export const OPEN_ALL_ROWS = 600;

/**
 * Where a viewer gets its rows from. A value in memory answers at once; a document that lives in a worker answers later, `children` returning
 * null until the page has arrived and `subscribe` telling the viewer when to ask again.
 */
export interface JsonSource {
  rootName: string;
  /** True when every answer is immediate (a value in memory): search can then run while typing and open every branch that holds a match. */
  readonly sync?: boolean;
  root(): JsonNodeInfo | null;
  children(path: string, from: number, to: number): JsonNodeInfo[] | null;
  request(path: string, from: number, to: number): void;
  /** How many children of a branch, counted from the first, are already here (a source that answers at once may leave this out). */
  loaded?(path: string): number;
  subscribe(listener: () => void): () => void;
  /** Goes up every time new pages arrive: what the viewer reads (with `subscribe`) to know it must ask again. */
  version(): number;
  search(query: string, max: number): SearchResult | Promise<SearchResult>;
  /** The text the copy buttons put on the clipboard. */
  copyText(path: string, kind: "value" | "path"): string | Promise<string>;
  /** The value itself when it is in memory (for `onSelect`). */
  valueOf?(path: string): unknown;
}

export const typeOf = (value: unknown): JsonValueType =>
  value === null ? "null" : Array.isArray(value) ? "array" : typeof value === "object" ? "object" : typeof value === "string" ? "string" : typeof value === "number" ? "number" : typeof value === "boolean" ? "boolean" : "other";
export const isBranch = (type: JsonValueType) => type === "object" || type === "array";

/** `1 key`, `13 keys`, `1 item`, `180 items` (the singular is inferred: the preview's data has none). */
export const countLabel = (type: JsonValueType, count: number) => type === "array" ? `${count} ${count === 1 ? "item" : "items"}` : `${count} ${count === 1 ? "key" : "keys"}`;

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
/** Dot for identifiers, brackets for indexes, bracketed quotes for anything else (inferred for keys the preview's data does not have). */
export const childPath = (parent: string, key: string, isIndex: boolean) => isIndex ? `${parent}[${key}]` : IDENTIFIER.test(key) ? `${parent}.${key}` : `${parent}[${JSON.stringify(key)}]`;

/** `{ id, name, email, … }` for more than three keys, `{ a, b }` otherwise, `[…]` for arrays; empty ones are `{}` and `[]` (inferred). */
export function previewOf(value: unknown): string {
  if (Array.isArray(value)) return value.length ? "[…]" : "[]";
  if (value && typeof value === "object") {
    const keys = Object.keys(value as object);
    return keys.length ? `{ ${keys.slice(0, 3).join(", ")}${keys.length > 3 ? ", …" : ""} }` : "{}";
  }
  return "";
}
export const previewFromKeys = (keys: readonly string[], array: boolean) => array ? (keys.length ? "[…]" : "[]") : keys.length ? `{ ${keys.slice(0, 3).join(", ")}${keys.length > 3 ? ", …" : ""} }` : "{}";

export function primitiveText(value: unknown, type: JsonValueType): { text: string; plain: string } {
  if (type === "string") return { text: `"${value as string}"`, plain: value as string };
  if (type === "null") return { text: "null", plain: "null" };
  const plain = String(value);
  return { text: plain, plain };
}

export function infoOf(value: unknown, path: string, key: string, isIndex: boolean): JsonNodeInfo {
  const type = typeOf(value);
  if (isBranch(type)) { const count = Array.isArray(value) ? value.length : Object.keys(value as object).length; return { path, key, isIndex, type, count, text: "", plain: "", preview: previewOf(value) }; }
  return { path, key, isIndex, type, count: 0, text: primitiveText(value, type).text, plain: primitiveText(value, type).plain, preview: "" };
}

/** What a screen reader hears for a row: `id: ord_8Kd2Q7` for a primitive, `customer, object, 5 keys` for a branch. */
export const rowLabel = (info: JsonNodeInfo) => isBranch(info.type) ? `${info.key}, ${info.type}, ${countLabel(info.type, info.count)}` : `${info.key}: ${info.plain}`;
/** The type line under the tree: `object, 13 keys`, `array, 180 items`, or just `string`. */
export const typeLine = (info: JsonNodeInfo) => isBranch(info.type) ? `${info.type}, ${countLabel(info.type, info.count)}` : info.type;

/** The value as the copy button writes it: a string as it is, a branch as indented JSON. */
export function copyTextOf(value: unknown): string {
  const type = typeOf(value);
  if (isBranch(type)) return JSON.stringify(value, null, 2);
  return primitiveText(value, type).plain;
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// A value in memory as a source
// ---------------------------------------------------------------------------------------------------------------------------------------
export function memorySource(data: unknown, rootName: string): JsonSource {
  const values = new Map<string, unknown>([[rootName, data]]);
  const entriesOf = (value: unknown): [string, unknown][] => Array.isArray(value) ? value.map((item, i) => [String(i), item]) : value && typeof value === "object" ? Object.entries(value as object) : [];
  const remember = (path: string, value: unknown) => values.set(path, value);
  return {
    rootName, sync: true,
    root: () => infoOf(data, rootName, rootName, false),
    children(path, from, to) {
      const value = values.get(path);
      const entries = entriesOf(value).slice(from, to), array = Array.isArray(value);
      return entries.map(([key, child]) => { const p = childPath(path, key, array); remember(p, child); return infoOf(child, p, key, array); });
    },
    request() {},
    subscribe: () => () => {},
    version: () => 0,
    search(query, max) { return searchValue(data, rootName, query, max); },
    copyText: (path, kind) => kind === "path" ? path : copyTextOf(values.get(path)),
    valueOf: path => values.get(path),
  };
}

/** Every key and primitive value that holds the query (case-insensitive), in document order, stopping at `max`. Array indexes are not searched (inferred). */
export function searchValue(data: unknown, rootName: string, query: string, max = SEARCH_LIMIT, unwrap?: (value: unknown) => unknown): SearchResult {
  const needle = query.trim().toLowerCase();
  const hits: SearchHit[] = [];
  if (!needle) return { hits, capped: false };
  let capped = false;
  const walk = (raw: unknown, path: string, key: string, isIndex: boolean, trail: SearchStep[]): void => {
    if (capped) return;
    // `unwrap` lets a source show a stored value as another one (a number kept as its exact text, say) without copying the document.
    const value = unwrap ? unwrap(raw) : raw;
    const type = typeOf(value);
    const keyHit = !isIndex && key.toLowerCase().includes(needle);
    const valueHit = !isBranch(type) && primitiveText(value, type).plain.toLowerCase().includes(needle);
    if (keyHit || valueHit) { if (hits.length >= max) { capped = true; return; } hits.push({ path, trail }); }
    if (!isBranch(type)) return;
    const array = Array.isArray(value);
    const entries: [string, unknown][] = array ? (value as unknown[]).map((item, i) => [String(i), item]) : Object.entries(value as object);
    for (let i = 0; i < entries.length && !capped; i++) { const p = childPath(path, entries[i][0], array); walk(entries[i][1], p, entries[i][0], array, [...trail, { path: p, index: i, key: entries[i][0] }]); }
  };
  walk(data, rootName, rootName, false, []);
  return { hits, capped };
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------------------------------------------------------------------
export interface RowModel {
  id: string;
  kind: "node" | "more" | "loading";
  /** 0 for the root. The row's `aria-level` is level + 1. */
  level: number;
  path: string;
  parent: string | null;
  info?: JsonNodeInfo;
  open: boolean;
  posinset: number;
  setsize: number;
  label: string;
  /** "more" rows: the next page, and what is left. */
  next?: number;
  hidden?: number;
}
export interface RowsInput { source: JsonSource; /** Open every branch that is shown, as it arrives (Expand all on a source that answers later). */ all?: boolean; expanded: ReadonlySet<string>; visible: Readonly<Record<string, number>>; pageSize: number }

/** The flat list the tree draws: the root, and under every open branch its first page of children, then a "Show N more" row while any are hidden. */
export function buildRows({ source, all, expanded, visible, pageSize }: RowsInput): { rows: RowModel[]; missing: { path: string; from: number; to: number }[] } {
  const rows: RowModel[] = [], missing: { path: string; from: number; to: number }[] = [];
  const root = source.root();
  if (!root) return { rows, missing };
  const walk = (info: JsonNodeInfo, level: number, parent: string | null, posinset: number, setsize: number) => {
    const branch = isBranch(info.type), open = branch && (expanded.has(info.path) || (!!all && rows.length < OPEN_ALL_ROWS));
    rows.push({ id: info.path, kind: "node", level, path: info.path, parent, info, open, posinset, setsize, label: rowLabel(info) });
    if (!open) return;
    const shown = Math.min(info.count, visible[info.path] ?? pageSize);
    // What is here is drawn at once; a page still on its way is a "Loading" row after it, so rows already on screen never go away to make room for it.
    const ready = info.count ? Math.min(shown, source.loaded ? source.loaded(info.path) : shown) : 0;
    const children = ready ? source.children(info.path, 0, ready) ?? [] : [];
    if (ready < shown) { missing.push({ path: info.path, from: ready, to: shown }); }
    const hidden = info.count - shown, more = hidden > 0;
    children.forEach((child, i) => walk(child, level + 1, info.path, i + 1, children.length + (more || ready < shown ? 1 : 0)));
    if (ready < shown) { rows.push({ id: `${info.path}\u0001loading`, kind: "loading", level: level + 1, path: info.path, parent: info.path, open: false, posinset: children.length + 1, setsize: children.length + 1, label: "Loading" }); return; }
    if (more) { const next = Math.min(pageSize, hidden); rows.push({ id: `${info.path}\u0001more`, kind: "more", level: level + 1, path: info.path, parent: info.path, open: false, posinset: children.length + 1, setsize: children.length + 1, label: `Show ${next} more, ${hidden} hidden`, next, hidden }); }
  };
  walk(root, 0, null, 1, 1);
  return { rows, missing };
}

/** The part of a row's text that the query marks: split into pieces, every case-insensitive occurrence flagged. */
export function markPieces(text: string, query: string): { text: string; mark: boolean }[] {
  const needle = query.trim().toLowerCase();
  if (!needle || !text) return [{ text, mark: false }];
  const lower = text.toLowerCase(), out: { text: string; mark: boolean }[] = [];
  let at = 0;
  for (let i = lower.indexOf(needle); i >= 0; i = lower.indexOf(needle, at)) { if (i > at) out.push({ text: text.slice(at, i), mark: false }); out.push({ text: text.slice(i, i + needle.length), mark: true }); at = i + needle.length; }
  if (at < text.length) out.push({ text: text.slice(at), mark: false });
  return out;
}

/** Everything a hit needs open to be seen: its ancestors, and for each as many children as it takes to reach the one on the path. */
export function revealFor(hit: SearchHit, rootPath: string, pageSize: number): { open: string[]; visible: Record<string, number> } {
  const open = [rootPath], visible: Record<string, number> = {};
  let parent = rootPath;
  hit.trail.forEach((step, i) => {
    // Measured on the preview: after searching a match at index 131 the array showed 132 children and a "Show more" row (set size 133), not a whole page more.
    visible[parent] = Math.max(visible[parent] ?? pageSize, step.index + 1);
    if (i < hit.trail.length - 1) open.push(step.path);
    parent = step.path;
  });
  return { open, visible };
}

/** `scrollTop` that puts the row where the preview put it after a jump: fully visible with one row of margin below it (measured: 36 px above the bottom edge). */
export function scrollTarget(rowIndex: number, scrollTop: number, viewport: number, scrollHeight: number): number {
  const top = TREE_PADDING + rowIndex * ROW_HEIGHT, bottom = top + ROW_HEIGHT, margin = ROW_HEIGHT + TREE_PADDING;
  let target = scrollTop;
  if (top - margin < scrollTop) target = top - margin;
  else if (bottom + margin > scrollTop + viewport) target = bottom + margin - viewport;
  return Math.max(0, Math.min(Math.max(0, scrollHeight - viewport), target));
}
