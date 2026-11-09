import type { Cell, Fix, FixKind, Issue, IssueCategory, Severity, Sheet, Suggestion, TokenCandidates, Workbook } from "./types.ts";
import type { ColumnSpec, FieldRole, MappingProfile } from "./mapping-profiles.ts";
import type { WorkbookProfile } from "./profile.ts";
import { columnLetters, fingerprint } from "./text.ts";
import { incompleteAt, resolveBlocks } from "./blocks.ts";

export const RULE_VERSION = "rules-2026.11.5";
const RANK: Record<Severity, number> = { critical: 4, high: 3, medium: 2, low: 1 };
export const maxSeverity = (a: Severity, b: Severity): Severity => RANK[a] >= RANK[b] ? a : b;
export const isBlocking = (severity: Severity) => severity === "critical" || severity === "high";

// ── character classes ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const ZERO_WIDTH = new RegExp("[\\u200b-\\u200f\\u2028\\u2029\\u202a-\\u202e\\u2060-\\u2064\\u00ad\\ufeff\\u180e]", "g");
const CONTROL = new RegExp("[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f-\\u009f]", "g");
const ODD_SPACES = new RegExp("[\\u00a0\\u2000-\\u200a\\u202f\\u205f\\u3000]", "g");
const MOJIBAKE = new RegExp("Ã[\\u0080-\\u00bf]|Ä[\\u0080-\\u00bf\\u2018-\\u201e\\u0152\\u0153\\u0160\\u0161\\u0178\\u0192\\u02c6\\u02dc]|Æ[\\u00a0-\\u00bf\\u0161]|á[»º][\\u0080-\\u00bf\\u2018-\\u203a]|â€[\\u0153\\u0099\\u201c\\u201d\\u00a6\\u2122\\u2013\\u2014\\u02dc]");
/** Text that needs no analysis at all: printable ASCII without `?`, single spaces inside, nothing at the edges. */
const CLEAN = /^[\x21-\x3e\x40-\x7e]+(?: [\x21-\x3e\x40-\x7e]+)*$/;
const CP1252: Record<number, number> = { 0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f };

const codePoint = (ch: string) => "U+" + ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0");

/** Undo "UTF-8 read as Windows-1252/Latin-1" only when the result is valid and re-encodes to exactly the original text; otherwise null. */
export function tryDecodeMojibake(text: string): string | null {
  const bytes: number[] = [];
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (code < 0x80) bytes.push(code);
    else if (CP1252[code] !== undefined) bytes.push(CP1252[code]);
    else if (code < 0x100) bytes.push(code);
    else return null;
  }
  let decoded: string;
  try { decoded = new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes)); } catch { return null; }
  if (decoded === text || decoded.includes("�")) return null;
  const back: number[] = [];
  const reverse = new Map(Object.entries(CP1252).map(([unicode, byte]) => [byte, Number(unicode)]));
  for (const byte of new TextEncoder().encode(decoded)) back.push(byte);
  const rebuilt = back.map(byte => byte < 0x80 || byte >= 0xa0 || !reverse.has(byte) ? String.fromCharCode(byte) : String.fromCharCode(reverse.get(byte)!)).join("");
  return rebuilt === text ? decoded : null;
}
export function stripDiacritics(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").normalize("NFC");
}
export const hasDiacritics = (text: string) => /[̀-ͯ]/.test(text.normalize("NFD")) || /[đĐ]/.test(text);

/** Apply a deterministic fix to a value. Pure; the same input always gives the same output. */
export function applyFix(kind: FixKind, text: string): string {
  switch (kind) {
    case "trim": return text.trim();
    case "collapse-spaces": return text.trim().replace(/ {2,}/g, " ");
    case "normalize-space-chars": return text.replace(ODD_SPACES, " ").trim();
    case "strip-invisible": return text.replace(ZERO_WIDTH, "");
    case "strip-diacritics": return stripDiacritics(text);
    case "decode-mojibake": return tryDecodeMojibake(text) ?? text;
  }
}
/** Fixes that may be previewed and applied for many cells at once. Lossy or re-interpreting fixes are always reviewed one by one. */
export const BULK_FIXES: readonly FixKind[] = ["trim", "collapse-spaces", "normalize-space-chars", "strip-invisible"];

// ── corpus: clean words of a column, the only evidence suggestions are made from ─────────────────────────────────────────────────────
export class Corpus {
  private byLength = new Map<number, Map<string, number>>();
  private memo = new Map<string, { text: string; support: number }[]>();
  size = 0;
  add(value: string) {
    if (value.indexOf("?") >= 0 || !CLEAN.test(value) && /[^\x20-\x7e]/.test(value)) return;
    for (const raw of value.split(/\s+/)) {
      const word = trimPunctuation(raw).text;
      if (word.length < 2) continue;
      let bucket = this.byLength.get(word.length);
      if (!bucket) this.byLength.set(word.length, bucket = new Map());
      if (!bucket.has(word)) this.size++;
      bucket.set(word, (bucket.get(word) ?? 0) + 1);
    }
  }
  count(word: string): number { return this.byLength.get(word.length)?.get(word) ?? 0; }
  /** Clean words that fit a pattern in which every `?` stands for exactly one letter or digit. Known characters must match exactly, case included. */
  candidates(pattern: string, limit = 5): { text: string; support: number }[] {
    const cached = this.memo.get(pattern);
    if (cached) return cached;
    const out: { text: string; support: number }[] = [];
    const bucket = this.byLength.get(pattern.length);
    if (bucket) for (const [word, support] of bucket) {
      let ok = true;
      for (let i = 0; i < pattern.length; i++) {
        const want = pattern[i];
        if (want === "?" ? !/[A-Za-z0-9]/.test(word[i]) : word[i] !== want) { ok = false; break; }
      }
      if (ok) out.push({ text: word, support });
    }
    out.sort((a, b) => b.support - a.support || (a.text < b.text ? -1 : 1));
    const top = out.slice(0, limit);
    this.memo.set(pattern, top);
    return top;
  }
}
const EDGE_PUNCT = /[(),.;:"'\[\]{}]/;
function trimPunctuation(raw: string, offset = 0) {
  let start = 0, end = raw.length;
  while (start < end && EDGE_PUNCT.test(raw[start])) start++;
  while (end > start && EDGE_PUNCT.test(raw[end - 1])) end--;
  return { text: raw.slice(start, end), start: offset + start, end: offset + end };
}

// ── per-value analysis ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface Finding {
  group?: Issue["group"];
  category: IssueCategory;
  severity: Severity;
  reason: string;
  marks?: { start: number; end: number; label?: string }[];
  fix?: Fix;
  proposedValue?: string;
  suggestions?: Suggestion[];
  tokens?: TokenCandidates[];
  block?: Issue["block"];
}
export interface AnalyzeOptions { corpus?: Corpus; diacriticPolicy?: boolean }

const isTextRole = (role: FieldRole) => role === "freeText";
const isStrictRole = (role: FieldRole) => role === "code" || role === "name" || role === "date" || role === "dateDMY" || role === "amount" || role === "list";

/** Everything wrong with one text value, judged by what the column is for. Deterministic; suggestions are evidence, never applied. */
export function analyzeValue(value: string, spec: Pick<ColumnSpec, "role" | "noDiacritics">, options: AnalyzeOptions = {}): Finding[] {
  if (value === "" || CLEAN.test(value)) return [];
  const findings: Finding[] = [];
  const role = spec.role;

  if (value.indexOf("�") >= 0) {
    const marks = [...value.matchAll(/�/g)].map(m => ({ start: m.index!, end: m.index! + 1, label: "U+FFFD" }));
    findings.push({ category: "UNICODE_REPLACEMENT", severity: "critical", reason: "Replacement character: the original letter was lost", marks });
  }
  const mojibake = MOJIBAKE.test(value);
  if (mojibake) {
    const decoded = tryDecodeMojibake(value);
    findings.push({
      category: "ENCODING_MOJIBAKE", severity: "high", reason: "Mis-decoded text (UTF-8 read as Windows-1252)",
      marks: [...value.matchAll(new RegExp(MOJIBAKE.source, "g"))].map(m => ({ start: m.index!, end: m.index! + m[0].length })),
      ...(decoded ? { fix: { kind: "decode-mojibake", lossy: false } as Fix, proposedValue: decoded, suggestions: [{ value: decoded, basis: "decoded", support: 0 } as Suggestion] } : {}),
    });
  }
  const invisible = [...value.matchAll(ZERO_WIDTH)], control = [...value.matchAll(CONTROL)];
  if (invisible.length || control.length) {
    const marks = [...invisible, ...control].sort((a, b) => a.index! - b.index!).map(m => ({ start: m.index!, end: m.index! + 1, label: codePoint(m[0]) }));
    const onlyZeroWidth = control.length === 0;
    findings.push({
      category: "INVISIBLE_OR_CONTROL", severity: isStrictRole(role) ? "high" : "medium", marks,
      reason: onlyZeroWidth ? "Invisible character" : "Control character",
      ...(onlyZeroWidth && role !== "code" ? { fix: { kind: "strip-invisible", lossy: false } as Fix, proposedValue: applyFix("strip-invisible", value) } : {}),
    });
  }
  // `?` — the legacy loss of a letter. Field-aware: codes and names never hold a legitimate question mark.
  if (value.indexOf("?") >= 0 && !/https?:\/\/|www\./i.test(value)) {
    const finding = questionMarkFinding(value, role, options.corpus);
    if (finding) findings.push(finding);
  }
  // Whitespace.
  const oddSpaces = ODD_SPACES.test(value) || /[\t\r\n]/.test(value);
  ODD_SPACES.lastIndex = 0;
  const edge = value !== value.trim();
  const doubled = isStrictRole(role) && / {2,}/.test(value);
  if (oddSpaces || edge || doubled) {
    const kind: FixKind = oddSpaces ? "normalize-space-chars" : doubled ? "collapse-spaces" : "trim";
    const proposed = oddSpaces ? applyFix("normalize-space-chars", value) : applyFix(doubled ? "collapse-spaces" : "trim", value);
    const embedded = /[\t\r\n]/.test(value);
    findings.push({
      category: "WHITESPACE_ANOMALY", severity: isStrictRole(role) && role !== "name" ? "medium" : "low", marks: [...value.matchAll(/^\s+|\s+$| {2,}|[\t\r\n\u00a0\u2000-\u200a\u202f\u205f\u3000]/g)].map(m => ({ start: m.index!, end: m.index! + m[0].length })),
      reason: embedded ? "Tab or line break in a one-line field" : oddSpaces ? "Unusual space character" : edge ? "Spaces at the start or end" : "Repeated spaces",
      ...(proposed !== value && !embedded ? { fix: { kind, lossy: false } as Fix, proposedValue: proposed } : {}),
    });
  }
  // Diacritics: a policy choice, not corruption.
  if (options.diacriticPolicy !== false && spec.noDiacritics && !mojibake && hasDiacritics(value)) {
    const stripped = stripDiacritics(value);
    findings.push({
      category: "DIACRITIC_POLICY", severity: "low", reason: "Has diacritics; the export is without diacritics",
      marks: [...value.normalize("NFC").matchAll(/[^\x00-\x7f]/g)].map(m => ({ start: m.index!, end: m.index! + m[0].length, label: codePoint(m[0]) })),
      ...(/[^\x00-\x7f]/.test(stripped) ? {} : { fix: { kind: "strip-diacritics", lossy: true } as Fix, proposedValue: stripped, suggestions: [{ value: stripped, basis: "mechanical", support: 0 } as Suggestion] }),
    });
  }
  return findings;
}

function questionMarkFinding(value: string, role: FieldRole, corpus?: Corpus): Finding | null {
  const marks: { start: number; end: number; label?: string }[] = [];
  const tokens: TokenCandidates[] = [];
  let severity: Severity = "low";
  let suspicious = 0;
  for (const match of value.matchAll(/\S+/g)) {
    if (match[0].indexOf("?") < 0) continue;
    const { text, start, end } = trimPunctuation(match[0], match.index!);
    if (text.indexOf("?") < 0) continue;
    for (let i = 0; i < text.length; i++) if (text[i] === "?") marks.push({ start: start + i, end: start + i + 1 });
    if (!isTextRole(role)) {
      // A code or a name never holds a legitimate question mark; candidates are still offered where the column has clean words (names).
      severity = maxSeverity(severity, "critical"); suspicious++;
      if (role === "name" && corpus && text !== "?") tokens.push({ start, end, text, candidates: corpus.candidates(text) });
      else tokens.push({ start, end, text, candidates: [] });
      continue;
    }
    if (text === "?") { severity = maxSeverity(severity, "low"); continue; }
    const interior = /[A-Za-z0-9]\?+[A-Za-z0-9]/.test(text);
    const stripped = text.replace(/^\?+|\?+$/g, "");
    // A word that ends in one `?` and is itself a known clean word is most likely a real question.
    if (!interior && /^[^?]+\?$/.test(text) && value.slice(end).trim() === "" && corpus && corpus.count(stripped) >= 3) { severity = maxSeverity(severity, "low"); continue; }
    suspicious++;
    severity = maxSeverity(severity, interior ? "critical" : "high");
    const found = corpus?.candidates(text) ?? [];
    tokens.push({ start, end, text, candidates: found });
  }
  if (!marks.length) return null;
  const suggestions: Suggestion[] = [];
  // A whole-cell suggestion only when every suspicious word has exactly one fitting clean word; with several, the reviewer chooses word by word.
  if (suspicious > 0 && tokens.length === suspicious && tokens.every(token => token.candidates.length === 1)) {
    let out = "", at = 0;
    for (const token of tokens) { out += value.slice(at, token.start) + token.candidates[0].text; at = token.end; }
    out += value.slice(at);
    suggestions.push({ value: out, basis: "corpus", support: Math.min(...tokens.map(token => token.candidates[0].support)) });
  }
  const onlyQuestions = suspicious === 0;
  return {
    category: "QUESTION_MARK_IN_WORD", severity, marks, ...(tokens.length ? { tokens } : {}), ...(suggestions.length ? { suggestions } : {}),
    reason: onlyQuestions ? "Probably a real question mark" : isTextRole(role) ? "A letter was replaced by ?" : "? is not allowed in this field",
  };
}

// ── workbook scan ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface ScanStats {
  rowsScanned: number;
  rowsHidden: number;
  rowsEmptySkipped: number;
  cellsScanned: number;
  issues: number;
  bySeverity: Record<Severity, number>;
  byCategory: Partial<Record<IssueCategory, number>>;
  affectedRows: number;
  corpusWords: number;
  ms: number;
}
export interface ScanResult { issues: Issue[]; stats: ScanStats; blockers: string[]; corpora: Map<number, Corpus>; /** Clean words of the damaged columns outside the profile, keyed by `genericKey`. */ genericCorpora?: Map<string, Corpus> }
export interface ScanOptions { diacriticPolicy?: boolean; onProgress?: (fraction: number) => void }

const validDate = (text: string) => {
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(text);
  if (!match) return false;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(y, m - 1, d));
  return y >= 1900 && y <= 2200 && date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
};
const validDmy = (text: string) => {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  return !!match && validDate(`${match[3]}${match[2]}${match[1]}`);
};

export function detectIssues(workbook: Workbook, wprofile: WorkbookProfile, profile: MappingProfile, options: ScanOptions = {}): ScanResult {
  const started = Date.now();
  const blockers: string[] = [];
  const empty: ScanStats = { rowsScanned: 0, rowsHidden: 0, rowsEmptySkipped: 0, cellsScanned: 0, issues: 0, bySeverity: { critical: 0, high: 0, medium: 0, low: 0 }, byCategory: {}, affectedRows: 0, corpusWords: 0, ms: 0 };
  const sheetProfile = wprofile.sheets.find(sheet => sheet.name === wprofile.primary);
  const sheet = workbook.sheets.find(item => item.name === wprofile.primary);
  if (!sheet || !sheetProfile || !wprofile.mapping || sheetProfile.headerRow === null) {
    return { issues: [], stats: { ...empty, ms: Date.now() - started }, blockers: ["No worksheet matches the mapping profile, so the JSON conversion is unavailable. Corrupted text is still checked on every worksheet."], corpora: new Map() };
  }
  const mapping = wprofile.mapping;
  if (sheetProfile.ambiguousHeader) blockers.push("More than one row matches the header; resolve the header ambiguity before export.");
  if (wprofile.sheets.filter(item => item.role === "primary" && item.match === sheetProfile.match).length > 1) blockers.push("More than one worksheet matches the profile equally; select an unambiguous source before JSON export.");
  for (const spec of mapping.missing) if (spec.required) blockers.push(`Required column ${spec.header} is missing.`);
  for (const item of mapping.ambiguous) blockers.push(`Column ${item.spec.header} appears ${item.cols.length} times; choose the right one.`);
  const issues: Issue[] = [];
  const seen = new Set<string>();
  const push = (row: number, col: number, spec: ColumnSpec, value: string, finding: Omit<Finding, never> & { related?: Issue["related"] }) => {
    const base = `${sheet.name}\u0001${row}\u0001${col}\u0001${finding.category}`;
    let id = fingerprint(base, workbook.fileHash);
    for (let n = 1; seen.has(id); n++) id = fingerprint(base + "\u0001" + n, workbook.fileHash);
    seen.add(id);
    issues.push({
      id, fileHash: workbook.fileHash, sheet: sheet.name, row, column: columnLetters(col), col, field: spec.header, category: finding.category, severity: finding.severity,
      originalValueFingerprint: fingerprint(value, workbook.fileHash), originalValue: value, reason: finding.reason, status: "open", ruleVersion: RULE_VERSION,
      ...(finding.marks ? { marks: finding.marks } : {}), ...(finding.fix ? { fix: finding.fix } : {}), ...(finding.proposedValue !== undefined ? { proposedValue: finding.proposedValue } : {}),
      ...(finding.suggestions ? { suggestions: finding.suggestions } : {}), ...(finding.tokens ? { tokens: finding.tokens } : {}), ...(finding.related ? { related: finding.related } : {}), ...(finding.group ? { group: finding.group } : {}), ...(finding.block ? { block: finding.block } : {}),
    });
  };

  // Pass 1: build the corpus of clean words per text column (the evidence for suggestions).
  const corpora = new Map<number, Corpus>();
  const dataRows = sheet.rows.filter(row => row.r > sheetProfile.headerRow!);
  for (const { spec, col } of mapping.resolved) if (spec.role === "freeText" || spec.role === "name") {
    const corpus = new Corpus();
    for (const row of dataRows) { const cell = row.cells[col]; if (cell && cell.t !== "n") corpus.add(cell.v); }
    corpora.set(col, corpus);
  }
  // Header problems.
  for (const header of mapping.unknown) push(sheetProfile.headerRow, header.col, { header: header.text, field: "", role: "code" }, header.text, { category: "UNKNOWN_COLUMN", severity: "low", reason: "Column is not in the mapping profile" });
  for (const duplicate of mapping.duplicates) for (const col of duplicate.cols) push(sheetProfile.headerRow, col, { header: duplicate.text, field: "", role: "code" }, duplicate.text, { category: "DUPLICATE_HEADER", severity: "high", reason: "Header appears more than once" });

  // Pass 2: cell rules.
  const affected = new Set<number>();
  let cells = 0, hidden = 0;
  const total = dataRows.length;
  dataRows.forEach((row, index) => {
    if (row.hidden) hidden++;
    for (const { spec, col } of mapping.resolved) {
      const cell = row.cells[col];
      cells++;
      const value = cell?.v ?? "";
      const before = issues.length;
      if (!cell || value.trim() === "" && !cell.f) { if (spec.required) push(row.r, col, spec, "", { category: "MISSING_REQUIRED", severity: "high", reason: "Required value is empty" }); continue; }
      if (cell.f && value === "") { push(row.r, col, spec, "", { category: "FORMULA_UNRESOLVED", severity: "medium", reason: "Formula has no stored result" }); continue; }
      typeRules(row.r, col, spec, cell, value, push, workbook);
      if (cell.t !== "n" || spec.role === "freeText") for (const finding of analyzeValue(value, spec, { corpus: corpora.get(col), diacriticPolicy: options.diacriticPolicy })) push(row.r, col, spec, value, finding);
      if (issues.length > before) affected.add(row.r);
    }
    if (options.onProgress && index % 2000 === 0) options.onProgress(index / total * 0.8);
  });

  // Pass 3: description pair.
  const pair = profile.descriptionPair;
  const primaryCol = pair && mapping.resolved.find(item => item.spec.header === pair.primary), secondaryCol = pair && mapping.resolved.find(item => item.spec.header === pair.secondary);
  if (pair && primaryCol && secondaryCol) for (const row of dataRows) {
    const a = row.cells[primaryCol.col]?.v ?? "", b = row.cells[secondaryCol.col]?.v ?? "";
    if (a === b) continue;
    const bothFilled = a !== "" && b !== "";
    push(row.r, primaryCol.col, primaryCol.spec, a, { category: "DESCRIPTION_CONFLICT", severity: bothFilled ? "high" : "medium", reason: bothFilled ? "The two description columns differ" : "Only one description column is filled", related: [{ row: row.r, column: columnLetters(secondaryCol.col), value: b }] });
    affected.add(row.r);
  }

  // Pass 4a: an entry of the JSON (project, land title, vehicle) whose key column is empty while its other columns hold values.
  for (const block of resolveBlocks(profile, mapping.resolved)) for (const row of dataRows) {
    const at = incompleteAt(block, col => row.cells[col]?.v ?? "");
    if (at === null) continue;
    const target = mapping.resolved.find(item => item.col === at)!;
    push(row.r, at, target.spec, row.cells[at]?.v ?? "", { category: "INCOMPLETE_GROUP", severity: "high", reason: "The key column of the entry is empty", block: { id: block.id, anchor: block.anchorHeader } });
    affected.add(row.r);
  }

  // Pass 4: groups that must be consistent.
  groupRules(dataRows, sheetProfile.headerRow, mapping.resolved, profile, push, affected);
  options.onProgress?.(1);

  issues.sort((x, y) => x.row - y.row || x.col - y.col || (x.category < y.category ? -1 : 1));
  const stats: ScanStats = { ...empty, rowsScanned: total, rowsHidden: hidden, rowsEmptySkipped: sheet.emptyRows, cellsScanned: cells, issues: issues.length, affectedRows: affected.size, corpusWords: [...corpora.values()].reduce((sum, corpus) => sum + corpus.size, 0), ms: Date.now() - started };
  for (const issue of issues) { stats.bySeverity[issue.severity]++; stats.byCategory[issue.category] = (stats.byCategory[issue.category] ?? 0) + 1; }
  return { issues, stats, blockers, corpora };
}

type Push = (row: number, col: number, spec: ColumnSpec, value: string, finding: Finding & { related?: Issue["related"] }) => void;

function typeRules(row: number, col: number, spec: ColumnSpec, cell: Cell, value: string, push: Push, workbook: Workbook) {
  // A text cell that merely carries a date *format* is harmless; only a date stored as a number is converted by Excel and loses its exact text.
  void workbook;
  if (spec.role === "date") {
    if (cell.t === "n") push(row, col, spec, value, { category: "TYPE_MISMATCH", severity: "high", reason: "Date stored as a number" });
    else if (!validDate(value.trim())) push(row, col, spec, value, { category: "INVALID_CODE_OR_DATE", severity: "high", reason: "Not a real date (YYYYMMDD)" });
  } else if (spec.role === "dateDMY") {
    if (cell.t !== "n" && !validDmy(value.trim())) push(row, col, spec, value, { category: "INVALID_CODE_OR_DATE", severity: "high", reason: "Not a real date (DD/MM/YYYY)" });
    else if (cell.t === "n") push(row, col, spec, value, { category: "TYPE_MISMATCH", severity: "medium", reason: "Report date stored as a number" });
  } else if (spec.role === "amount") {
    if (cell.t !== "n" || !Number.isFinite(Number(value))) push(row, col, spec, value, { category: "TYPE_MISMATCH", severity: "high", reason: "Amount is not a number" });
  } else if ((spec.role === "code" || spec.role === "list") && cell.t === "n") {
    push(row, col, spec, value, { category: "TYPE_MISMATCH", severity: "medium", reason: "Code stored as a number" });
  }
  if (spec.role === "list" && /[\s,;|+]/.test(value.trim())) {
    push(row, col, spec, value, { category: "ARRAY_PARSE_AMBIGUOUS", severity: "medium", reason: "Separator inside a list value", marks: [...value.trim().matchAll(/[\s,;|+]/g)].map(m => ({ start: m.index!, end: m.index! + 1 })) });
  }
}

/** The key that joins rows into one asset, customer or branch; null when a part of the key is empty. */
export function groupKey(row: Sheet["rows"][number], cols: number[]): string | null {
  const parts = cols.map(col => row.cells[col]?.v ?? "");
  return parts.some(part => part === "") ? null : parts.join("\u0001");
}

function groupRules(rows: Sheet["rows"], headerRow: number, resolved: { spec: ColumnSpec; col: number }[], profile: MappingProfile, push: Push, affected: Set<number>) {
  const colOf = (header: string) => resolved.find(item => item.spec.header === header);
  const branch = colOf(profile.groupBy.branch), customer = colOf(profile.groupBy.customer), asset = colOf(profile.groupBy.asset);
  if (!branch || !customer || !asset) return;
  const text = (row: Sheet["rows"][number], col: number) => row.cells[col]?.v ?? "";
  const run = (label: string, level: "asset" | "branch" | "customer", keyOf: (row: Sheet["rows"][number]) => string | null, headers: string[]) => {
    const groups = new Map<string, Sheet["rows"]>();
    for (const row of rows) { const key = keyOf(row); if (key !== null) (groups.get(key) ?? groups.set(key, []).get(key)!).push(row); }
    for (const header of headers) {
      const target = colOf(header);
      if (!target) continue;
      for (const [groupKey, members] of groups) {
        if (members.length < 2) continue;
        const values = new Map<string, number>();
        for (const member of members) { const v = text(member, target.col); if (!values.has(v)) values.set(v, member.r); }
        if (values.size < 2) continue;
        const anchor = members[0];
        push(anchor.r, target.col, target.spec, text(anchor, target.col), {
          category: "CONFLICTING_DUPLICATE", severity: "high", reason: `${header} differs between rows of the same ${label}`,
          related: [...values].slice(0, 8).map(([value, r]) => ({ row: r, column: columnLetters(target.col), value })), group: { level, key: groupKey },
        });
        affected.add(anchor.r);
      }
    }
  };
  run("asset", "asset", row => groupKey(row, [branch.col, customer.col, asset.col]), profile.consistentWithinAsset);
  run("branch", "branch", row => groupKey(row, [branch.col]), profile.consistentWithinBranch);
  run("customer", "customer", row => groupKey(row, [branch.col, customer.col]), profile.consistentWithinCustomer);
  void headerRow;
}
