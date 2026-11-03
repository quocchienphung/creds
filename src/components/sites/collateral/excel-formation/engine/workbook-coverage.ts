import type { Session } from "./session.ts";
import type { ReviewState } from "./review.ts";
import { cellKey } from "./review.ts";
import { analyzeValue, isBlocking } from "./detect.ts";
/** Extra safety gate for cells outside the primary mapped review. No values, names or guesses leave this function. */
export function otherCellBlockers(session: Session, state: ReviewState): number {
  const mapped = new Set(session.wprofile.mapping?.resolved.map(item => item.col) ?? []);
  const header = session.wprofile.sheets.find(item => item.name === session.wprofile.primary)?.headerRow ?? 0;
  let blockers = 0;
  for (const sheet of session.workbook.sheets) for (const row of sheet.rows) for (let col = 0; col < row.cells.length; col++) {
    const cell = row.cells[col]; if (!cell) continue;
    if (sheet.name === session.wprofile.primary && row.r > header && mapped.has(col)) continue;
    const value = state.patches[cellKey(sheet.name, row.r, col)]?.value ?? cell.v;
    if (!/[?\ufffdÃÄÆáâ\u0000-\u001f\u007f-\u009f]/.test(value)) continue;
    const spec = session.ctx.specOfCell?.(sheet.name, col) ?? { role: "freeText" as const };
    if (analyzeValue(value, spec, { diacriticPolicy: false }).some(f => isBlocking(f.severity))) blockers++;
  }
  return blockers;
}
