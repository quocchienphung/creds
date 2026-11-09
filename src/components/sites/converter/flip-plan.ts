// What Flip would write for a sheet, worked out from the cells alone: the delimited text, the facts about it that a reader should know (the key
// points of the TL;DR card, each tied to the row it comes from) and the edits the Agent cursor plays to show the change. Nothing here reads a file:
// it is a pure function of the rows it is given, so it is the same on the page, in the tests and, later, in the real conversion.
import { field, trimRow } from "./flip-model.ts";

export const SEP = " │ ";
export const BREAK_MARK = "↵";
/** The paragraph id of a row; row 1 is the header. */
export const rowId = (row: number) => `r${row}`;
const show = (value: string) => value.replace(/\r?\n/g, BREAK_MARK);

/** A row as it reads in the workbook: cells apart by a bar, a line break drawn as a mark, empty cells at the end left out. */
export const workbookText = (row: readonly string[]) => trimRow(row.map(show)).join(SEP);
/** A row joined by the delimiter and nothing else: what a naive converter would write. */
export const naiveLine = (row: readonly string[], delimiter: string) => row.map(show).join(delimiter);
/** A row as Flip writes it, a line break drawn as a mark (for the document the Agent cursor edits). */
export const csvLineDisplay = (row: readonly string[], delimiter: string) => row.map(value => show(field(value, delimiter))).join(delimiter);

export type QuoteReason = "delimiter" | "quote" | "break";
/** Why a cell has to be written in quotes, or null. A line break wins over a quote, a quote over the delimiter (the one a person would look at first). */
export function quoteReason(value: string, delimiter: string): QuoteReason | null {
  if (field(value, delimiter) === value) return null;
  if (/[\r\n]/.test(value)) return "break";
  if (value.includes("\"")) return "quote";
  return "delimiter";
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Facts: the key points
// ---------------------------------------------------------------------------------------------------------------------------------------
export type FactId = "header" | "delimiter" | "none" | "quote" | "break" | "zeros" | "empty" | "accents";
export interface Fact { id: FactId; /** Numbers the sentence is made from. */ params: number[]; /** The paragraph (row) it comes from. */ source: string; /** A column header the fact names, when it names one. */ column?: string }

/** The facts about writing `rows` with `delimiter`, most useful first. Each one is true of the rows given, and names the first row it comes from. */
export function flipFacts(rows: readonly (readonly string[])[], delimiter: string): Fact[] {
  const [header = [], ...data] = rows;
  const columns = header.length || Math.max(0, ...rows.map(row => row.length));
  const facts: Fact[] = [{ id: "header", params: [columns], source: rowId(1) }];
  const scan = (test: (value: string) => boolean) => {
    let count = 0;
    let first: { row: number; col: number } | undefined;
    for (let index = 0; index < data.length; index++) {
      for (let col = 0; col < data[index].length; col++) {
        if (!test(data[index][col])) continue;
        count++;
        if (!first) first = { row: index + 2, col };
      }
    }
    return { count, first };
  };
  const delimiterHits = scan(value => quoteReason(value, delimiter) === "delimiter");
  facts.push(delimiterHits.count && delimiterHits.first
    ? { id: "delimiter", params: [delimiterHits.count, delimiterHits.first.row], source: rowId(delimiterHits.first.row), column: header[delimiterHits.first.col] }
    : { id: "none", params: [], source: rowId(1) });
  const quotes = scan(value => value.includes("\"") && !/[\r\n]/.test(value)), breaks = scan(value => /[\r\n]/.test(value));
  if (quotes.first) facts.push({ id: "quote", params: [quotes.count, quotes.first.row], source: rowId(quotes.first.row), column: header[quotes.first.col] });
  if (breaks.first) facts.push({ id: "break", params: [breaks.count, breaks.first.row], source: rowId(breaks.first.row), column: header[breaks.first.col] });
  const zeros = scan(value => /^0\d+$/.test(value));
  if (zeros.first) facts.push({ id: "zeros", params: [zeros.count, zeros.first.row], source: rowId(zeros.first.row), column: header[zeros.first.col] });
  let empty = 0, emptyFirst = 0;
  data.forEach((row, index) => { for (let col = 0; col < columns; col++) if ((row[col] ?? "") === "") { empty++; emptyFirst ||= index + 2; } });
  if (empty) facts.push({ id: "empty", params: [empty, columns], source: rowId(emptyFirst) });
  const accents = scan(value => /[^\x00-\x7f]/.test(value));
  if (accents.first) facts.push({ id: "accents", params: [accents.count, accents.first.row], source: rowId(accents.first.row), column: header[accents.first.col] });
  return facts;
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// The edits of the Agent cursor
// ---------------------------------------------------------------------------------------------------------------------------------------
export interface DocBlockLike { id: string; type: "title" | "heading" | "paragraph"; text: string }
export type AgentEditLike =
  | { type: "rewrite"; block: string; text: string; label?: string }
  | { type: "insert"; after: string; block: DocBlockLike; label?: string }
  | { type: "fix"; block: string; find: string; replace: string; occurrence?: number; label?: string };

export interface PlanLabels {
  /** The status while a row is joined: `row` is the row number in the sheet, 1 for the header. */
  join: (row: number) => string;
  quote: (reason: QuoteReason) => string;
  /** The line added at the end, and what the agent says while it adds it. */
  summary: string;
  summaryLabel: string;
}
export interface FlipDoc { blocks: DocBlockLike[]; edits: AgentEditLike[]; /** The text each row block ends with. */ final: Record<string, string>; quoted: number; shown: number }

/**
 * The document the Agent cursor edits, and the edits. Each shown row starts as it reads in the workbook; the agent joins it with the delimiter
 * (what a naive converter would write), then wraps each cell that holds the delimiter, a quote or a line break in quotes (the flagged cell is
 * replaced) so the line ends as Flip writes it. A last line says what the file holds.
 */
export function flipDoc(rows: readonly (readonly string[])[], delimiter: string, options: { title: string; shown?: number; fileName: string; labels: PlanLabels }): FlipDoc {
  const shown = Math.min(options.shown ?? 5, rows.length);
  const blocks: DocBlockLike[] = [{ id: "title", type: "title", text: options.title }];
  const edits: AgentEditLike[] = [];
  const final: Record<string, string> = {};
  let quoted = 0;
  for (let index = 0; index < shown; index++) {
    const row = rows[index], id = rowId(index + 1);
    blocks.push({ id, type: "paragraph", text: workbookText(row) });
    edits.push({ type: "rewrite", block: id, text: naiveLine(row, delimiter), label: options.labels.join(index + 1) });
    const segments = row.map(show);
    row.forEach((value, col) => {
      const reason = quoteReason(value, delimiter);
      if (!reason) return;
      const raw = segments[col], wrapped = show(field(value, delimiter));
      // which occurrence of the cell's text in the line as it stands is this cell
      let offset = 0;
      for (let before = 0; before < col; before++) offset += segments[before].length + delimiter.length;
      const text = segments.join(delimiter);
      let occurrence = 0;
      for (let at = text.indexOf(raw); at !== -1 && at < offset; at = text.indexOf(raw, at + 1)) occurrence++;
      edits.push({ type: "fix", block: id, find: raw, replace: wrapped, occurrence, label: options.labels.quote(reason) });
      segments[col] = wrapped; quoted++;
    });
    final[id] = segments.join(delimiter);
  }
  const lastRow = rowId(shown);
  edits.push({ type: "insert", after: lastRow, block: { id: "summary", type: "paragraph", text: options.labels.summary }, label: options.labels.summaryLabel });
  return { blocks, edits, final, quoted, shown };
}

/** Apply one edit to a list of blocks (the document the cursor shows once the edit has landed). Pure, so the end state is testable. */
export function applyEditToBlocks(blocks: readonly DocBlockLike[], edit: AgentEditLike): DocBlockLike[] {
  if (edit.type === "insert") {
    const at = blocks.findIndex(block => block.id === edit.after);
    const next = [...blocks]; next.splice(at < 0 ? next.length : at + 1, 0, edit.block); return next;
  }
  return blocks.map(block => {
    if (block.id !== edit.block) return block;
    if (edit.type === "rewrite") return { ...block, text: edit.text };
    let from = -1;
    for (let n = 0; n <= (edit.occurrence ?? 0); n++) { from = block.text.indexOf(edit.find, from + 1); if (from < 0) return block; }
    return { ...block, text: block.text.slice(0, from) + edit.replace + block.text.slice(from + edit.find.length) };
  });
}
