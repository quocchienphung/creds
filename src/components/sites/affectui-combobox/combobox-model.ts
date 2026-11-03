/** Pure helpers for the combobox: option shape, accent-insensitive search, grouping and match ranges. */
export interface ComboboxOption {
  value: string;
  label: string;
  /** False for a person's name or other free-text record value. */
  localize?: boolean;
  /** Secondary text shown after the label. Also searched. */
  hint?: string;
  /** An image URL, or `true` for the label's initials. */
  avatar?: string | boolean;
  /** A CSS color for a small dot before the label (status, label colors). */
  color?: string;
  /** Options with the same group are listed under one title. */
  group?: string;
  /** Extra search terms that are not displayed. */
  keywords?: string[];
  disabled?: boolean;
}

export interface Row { kind: "option" | "create"; option?: ComboboxOption; text?: string }
export interface Section { title: string | null; id: string; rows: { row: Row; index: number }[] }

/** Lowercase and strip accents so "an" finds "Ân" and "nguyen" finds "Nguyễn". `map[i]` is the original index of normalized char i. */
export function fold(text: string) {
  let out = "";
  const map: number[] = [];
  let index = 0;
  for (const char of text) {
    const base = char.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "d").toLowerCase();
    for (let i = 0; i < base.length; i++) map.push(index);
    out += base; index += char.length;
  }
  map.push(index);
  return { text: out, map };
}

export function initials(label: string) {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts.length === 1 ? [...parts[0]].slice(0, 2).join("") : [...parts[0]][0] + [...parts[parts.length - 1]][0]).toUpperCase();
}

/** Options whose label, hint, group or keywords contain every word typed. */
export function filterOptions(options: ComboboxOption[], query: string) {
  const words = fold(query.trim()).text.split(/\s+/).filter(Boolean);
  if (!words.length) return options;
  return options.filter(option => {
    const haystack = fold([option.label, option.hint ?? "", option.group ?? "", ...(option.keywords ?? [])].join(" ")).text;
    return words.every(word => haystack.includes(word));
  });
}

/** Character ranges of `text` that match the typed words, for highlighting. Ranges are merged and never overlap. */
export function matchRanges(text: string, query: string): [number, number][] {
  const words = fold(query.trim()).text.split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const { text: folded, map } = fold(text);
  const found: [number, number][] = [];
  for (const word of words) {
    let from = 0;
    for (;;) {
      const at = folded.indexOf(word, from);
      if (at < 0) break;
      found.push([map[at], map[at + word.length]]);
      from = at + word.length;
    }
  }
  found.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const range of found) {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]); else merged.push([...range]);
  }
  return merged;
}

/** True when the typed text equals an existing label, so no "create" row is offered. */
export function hasExactMatch(options: ComboboxOption[], text: string) {
  const target = fold(text.trim()).text;
  return options.some(option => fold(option.label.trim()).text === target);
}

/** Flat keyboard order plus the titled sections to draw. The row index is the position in the flat list. */
export function buildSections(options: ComboboxOption[], create?: string): { rows: Row[]; sections: Section[] } {
  const rows: Row[] = [];
  const sections: Section[] = [];
  const byGroup = new Map<string, Section>();
  for (const option of options) {
    const title = option.group ?? null, key = title ?? "";
    let section = byGroup.get(key);
    if (!section) { section = { title, id: `g${sections.length}`, rows: [] }; byGroup.set(key, section); sections.push(section); }
    const row: Row = { kind: "option", option };
    section.rows.push({ row, index: rows.length }); rows.push(row);
  }
  if (create) {
    const row: Row = { kind: "create", text: create };
    sections.push({ title: null, id: "create", rows: [{ row, index: rows.length }] }); rows.push(row);
  }
  return { rows, sections };
}

export const enabled = (row: Row | undefined) => !!row && (row.kind === "create" || !row.option?.disabled);

/** Next enabled row from `from` in `step` direction, clamped at the ends. Returns `from` when nothing is enabled that way. */
export function moveActive(rows: Row[], from: number, step: 1 | -1): number {
  for (let index = from + step; index >= 0 && index < rows.length; index += step) if (enabled(rows[index])) return index;
  return from;
}
export function firstEnabled(rows: Row[]) { return rows.findIndex(enabled); }
export function lastEnabled(rows: Row[]) { for (let index = rows.length - 1; index >= 0; index--) if (enabled(rows[index])) return index; return -1; }

/** Native-select style type-ahead: the first row whose label starts with what was typed. Repeating one letter cycles through its matches. */
export function typeahead(rows: Row[], buffer: string, from: number): number {
  const target = fold(buffer).text;
  if (!target || !rows.length) return -1;
  const repeated = [...target].every(char => char === target[0]), prefix = repeated ? target[0] : target;
  const start = repeated ? from + 1 : Math.max(from, 0);
  for (let step = 0; step < rows.length; step++) {
    const index = (start + step) % rows.length, row = rows[index];
    if (row.kind === "option" && enabled(row) && fold(row.option!.label).text.startsWith(prefix)) return index;
  }
  return -1;
}
