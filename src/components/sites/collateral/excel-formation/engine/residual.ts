import type { Session } from "./session.ts";
import { cellKey, type ReviewState } from "./review.ts";
import { sheetEvidence } from "./evidence-index.ts";
import { isTextCell, specRoleOf } from "./sheet-scan.ts";
import { corruptionSpans } from "./corruption-span.ts";
import { analyzeValue } from "./detect.ts";
import { strangeChars } from "./text-clean.ts";

/**
 * Detection over the workbook AS IT IS NOW (the original with every patch applied), with the rules the automatic repair uses to decide that a
 * cell is a problem. It answers "what is still wrong in what will be exported", whichever way each cell got its value.
 */
export type ResidualKind = "question_mark" | "mojibake" | "strange" | "spacing" | "invisible" | "other";
export const RESIDUAL_KINDS: readonly ResidualKind[] = ["question_mark", "mojibake", "strange", "spacing", "invisible", "other"];
/** `snippet` is only for display: the full value is read from the sheet when a cell is opened, so a shortened text is never edited or saved. */
export interface ResidualItem { sheet: string; row: number; col: number; kind: ResidualKind; snippet: string; length: number }
export interface ResidualReport {
  total: number;
  /** Exact counts, even when `items` is capped. */
  bySheet: { sheet: string; counts: Record<ResidualKind, number> }[];
  items: ResidualItem[];
  truncated: boolean;
}
export const RESIDUAL_ITEM_LIMIT = 20000;
const SNIPPET = 160;

const blank = (): Record<ResidualKind, number> => ({ question_mark: 0, mojibake: 0, strange: 0, spacing: 0, invisible: 0, other: 0 });
const kindOf = (category: string): ResidualKind => category === "WHITESPACE_ANOMALY" ? "spacing" : category === "INVISIBLE_OR_CONTROL" ? "invisible" : category === "ENCODING_MOJIBAKE" ? "mojibake" : "other";

/** A short piece of the text around the first damaged spot, so a long cell still shows what is wrong with it. */
function snippetOf(value: string, at: number): string {
  if (value.length <= SNIPPET) return value;
  const start = Math.max(0, Math.min(at - 50, value.length - SNIPPET));
  return (start ? "…" : "") + value.slice(start, start + SNIPPET) + (start + SNIPPET < value.length ? "…" : "");
}

/** Check every text cell of every sheet. Measured at about half a second for 870,000 cells, so callers simply run it again after an edit. */
export function findResidual(session: Session, state: ReviewState): ResidualReport {
  const evidence = sheetEvidence(session);
  const items: ResidualItem[] = [], bySheet: ResidualReport["bySheet"] = [];
  let total = 0, truncated = false;
  for (const sheet of session.workbook.sheets) {
    const counts = blank();
    bySheet.push({ sheet: sheet.name, counts });
    if (sheet.error) continue;
    const info = evidence.get(sheet.name)!, specs = new Map(info.columns.map(item => [item.col, item.spec]));
    for (const row of sheet.rows) {
      if (info.columns.length && row.r <= info.headerRow) continue;
      for (let col = 0; col < row.cells.length; col++) {
        const cell = row.cells[col];
        if (!cell || cell.f || cell.protectedText || !isTextCell(cell)) continue;
        const key = cellKey(sheet.name, row.r, col);
        const value = state.patches[key]?.value ?? cell.v;
        if (!value) continue;
        const spans = corruptionSpans(value).filter(span => span.kind !== "suspected_punctuation");
        const findings = spans.length ? [] : analyzeValue(value, specs.get(col) ?? { role: specRoleOf(value) }, { diacriticPolicy: false });
        const strange = spans.length || findings.length ? [] : strangeChars(value);
        if (!spans.length && !findings.length && !strange.length) continue;
        // A reviewer who accepted the value as legitimate has decided: it is not a problem any more.
        if (session.ctx.issuesAt(sheet.name, row.r, col).some(issue => state.states[issue.id]?.status === "accepted_exception")) continue;
        const kind: ResidualKind = spans.length ? (spans.every(span => span.kind === "mojibake") ? "mojibake" : "question_mark") : findings.length ? kindOf(findings[0].category) : "strange";
        counts[kind]++; total++;
        if (items.length >= RESIDUAL_ITEM_LIMIT) { truncated = true; continue; }
        items.push({ sheet: sheet.name, row: row.r, col, kind, snippet: snippetOf(value, spans[0]?.start ?? strange[0]?.start ?? 0), length: value.length });
      }
    }
  }
  return { total, bySheet, items, truncated };
}
