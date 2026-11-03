/**
 * Shared types of the Credit Excel pipeline. Pure data: nothing here touches the DOM, so the same engine runs in a Web Worker and in
 * Node tests. Original values live only in memory (see docs/collateral/05-review-security-policy.md); nothing is persisted or sent anywhere.
 */
export type CellType = "s" | "n" | "inlineStr" | "str" | "b" | "e" | "d";

/** One cell as it is stored in the file: the original type is kept, numbers stay text so precision and leading zeros are never lost. */
export interface Cell {
  t: CellType;
  /** The text of the cell as Excel displays it for text types; the raw number text for `n`. */
  v: string;
  /** Style index (`s` attribute) so a patched cell keeps its format. */
  s: number;
  /** The cell holds a formula (the cached result is in `v`). */
  f?: true;
  /** Unsupported mutation targets remain readable and are explicitly reported. */
  protectedText?: true;
}
export interface Row {
  /** 1-based Excel row number. */
  r: number;
  hidden: boolean;
  /** Indexed by 0-based column; holes are empty cells. */
  cells: (Cell | undefined)[];
}
export type StyleKind = "general" | "number" | "date" | "text";
export interface Sheet {
  name: string;
  /** Path of the worksheet part inside the zip. */
  part: string;
  dimension: string | null;
  rows: Row[];
  hiddenRows: number;
  hiddenColumns: number;
  mergeCount: number;
  autoFilter: boolean;
  formulaCount: number;
  /** Rows present in the XML that hold no value at all. */
  emptyRows: number;
  /** Explicit blank cells in skipped formatting-only rows; preserved in XML and included in repair accounting. */
  emptyCells?: number;
  maxCol: number;
}
export interface Workbook {
  fileName: string;
  size: number;
  /** Fingerprint of the file's bytes; ties every issue to the exact file it came from. */
  fileHash: string;
  sheets: Sheet[];
  styleKinds: StyleKind[];
  /** Defined names, calc mode and similar facts that the export must not disturb. */
  notes: string[];
}

export type Severity = "critical" | "high" | "medium" | "low";
export type IssueStatus = "open" | "edited" | "verified" | "accepted_exception";
export type IssueCategory =
  | "QUESTION_MARK_IN_WORD" | "UNICODE_REPLACEMENT" | "ENCODING_MOJIBAKE" | "INVISIBLE_OR_CONTROL" | "DIACRITIC_POLICY" | "WHITESPACE_ANOMALY"
  | "DESCRIPTION_CONFLICT" | "INVALID_CODE_OR_DATE" | "MISSING_REQUIRED" | "CONFLICTING_DUPLICATE" | "ARRAY_PARSE_AMBIGUOUS"
  | "UNKNOWN_COLUMN" | "TYPE_MISMATCH" | "FORMULA_UNRESOLVED" | "DUPLICATE_HEADER" | "INCOMPLETE_GROUP";

/** A suggestion is evidence-based and never applied by itself. */
export interface Suggestion {
  value: string;
  /** `corpus`: a clean word of the same column fits the pattern; `decoded`: a reversible re-decoding; `mechanical`: a deterministic text operation. */
  basis: "corpus" | "decoded" | "mechanical";
  /** For `corpus`: how many clean cells of the same column contain the supporting word. */
  support: number;
}
/** Candidates for one suspicious word, so the reviewer can build the corrected cell word by word. */
export interface TokenCandidates {
  start: number;
  end: number;
  text: string;
  candidates: { text: string; support: number }[];
}
export type FixKind = "trim" | "collapse-spaces" | "normalize-space-chars" | "strip-invisible" | "strip-diacritics" | "decode-mojibake";
/** A narrow, deterministic transformation that may be previewed and applied in bulk after explicit confirmation. */
export interface Fix { kind: FixKind; lossy: boolean }
export interface Issue {
  id: string;
  fileHash: string;
  sheet: string;
  /** 1-based Excel row. */
  row: number;
  /** Excel column letters. */
  column: string;
  col: number;
  field: string;
  category: IssueCategory;
  severity: Severity;
  originalValueFingerprint: string;
  /** Only ever held in local UI state. */
  originalValue: string;
  /** The result of `fix`, when the issue has a deterministic fix. Never a guessed letter. */
  proposedValue?: string;
  fix?: Fix;
  /** Candidate whole-cell values with their basis; the reviewer chooses, nothing is applied automatically. */
  suggestions?: Suggestion[];
  tokens?: TokenCandidates[];
  reason: string;
  /** Code points or character offsets the rule found, so the UI can mark them. */
  marks?: { start: number; end: number; label?: string }[];
  /** The group of rows a consistency issue is about, so one choice can be applied to all of them on request. */
  group?: { level: "asset" | "branch" | "customer"; key: string };
  /** For INCOMPLETE_GROUP: the block of columns (a project, a land title, a vehicle) and the key header that is empty. */
  block?: { id: string; anchor: string };
  /** The other cell involved (twin description, conflicting rows). */
  related?: { row: number; column: string; value?: string }[];
  status: IssueStatus;
  correctedValue?: string;
  exceptionReason?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  ruleVersion: string;
}
