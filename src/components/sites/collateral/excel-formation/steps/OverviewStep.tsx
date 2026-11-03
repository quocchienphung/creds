"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { motion, useReducedMotion } from "motion/react";
import { SplitBar } from "../../../skilled/split-bar/SplitBar";
import type { CollateralEngine } from "../../useCollateralEngine";
import type { Severity } from "../engine/types";
import { CATEGORY_LABEL, SEVERITIES, SEVERITY_LABEL, severityTone } from "../../labels";
import type { IssueCategory } from "../engine/types";
import type { ReviewFilters } from "../review-filters";
import { sheetStatuses, type SheetState } from "../engine/sheet-status";

/** Only a finished, spotless scan is green; a sheet that was not scanned is grey and a failed one red. */
const SCAN_TONE: Record<SheetState, string | undefined> = { clean: "green", issues: "amber", error: "red", unscanned: "plain-soft" };

const num = (value: number, locale: string) => new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US").format(value);

export function OverviewStep({ engine, onReview }: { engine: CollateralEngine; onReview: (patch: Partial<ReviewFilters>) => void }) {
  const { t: uiText, locale } = useWorkspaceI18n();
  const reduce = useReducedMotion();
  const result = engine.result!, view = engine.view!;
  const n = (value: number) => num(value, locale);
  const issues = [...result.issues, ...view.introduced];
  const statuses = sheetStatuses(result.profile.sheets.map(sheet => sheet.name), result.sheetScans, issues, issue => view.states[issue.id]?.status ?? "open");
  const notScanned = statuses.some(item => item.state === "unscanned" || item.state === "error");
  const byCategory = new Map<IssueCategory, number>(), byField = new Map<string, number>(), bySeverity: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const issue of issues) { byCategory.set(issue.category, (byCategory.get(issue.category) ?? 0) + 1); byField.set(issue.field, (byField.get(issue.field) ?? 0) + 1); bySeverity[issue.severity]++; }
  const categories = [...byCategory].sort((a, b) => b[1] - a[1]), fields = [...byField].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const top = categories[0]?.[1] ?? 1, topField = fields[0]?.[1] ?? 1;
  const summary = view.summary;
  const allDone = issues.length > 0 && summary.byStatus.open + summary.byStatus.edited === 0;
  const stateText = issues.length === 0 ? (notScanned ? uiText("Some worksheets were not scanned, so nothing can be said about them yet.") : uiText("No issue found. Nothing needs review.")) : allDone ? uiText("Every issue has been verified or accepted.") : uiText("{0} issues need review, {1} of them serious.", [n(summary.byStatus.open + summary.byStatus.edited), n(summary.blocking)]);
  return <div className="cr-overview">
    <p className="cr-status" role="status">{stateText}</p>
    {result.blockers.length > 0 && <div className="ui-sb-card cr-blockers" role="alert"><b>{uiText("Fix these first")}</b><ul>{result.blockers.map(text => <li key={text}>{uiText(text)}</li>)}</ul></div>}
    <div className="cr-stats">
      {SEVERITIES.map(severity => <button type="button" key={severity} className="ui-sb-card cr-stat" disabled={bySeverity[severity] === 0} onClick={() => onReview({ severities: [severity], status: "all", category: "", field: "", query: "" })}>
        <span className="ui-sb-pill" data-tone={severityTone(severity)}>{uiText(SEVERITY_LABEL[severity])}</span><strong>{n(bySeverity[severity])}</strong><small>{uiText("issues")}</small></button>)}
      <div className="ui-sb-card cr-stat cr-stat--plain"><span className="ui-sb-cap">{uiText("Rows with issues")}</span><strong>{n(result.stats.affectedRows)}</strong><small>{uiText("of {0} rows", [n(result.stats.rowsScanned)])}</small></div>
    </div>
    <div className="cr-columns">
      <section className="ui-sb-card cr-panel" aria-labelledby="ov-cat"><h3 className="ui-sb-h2" id="ov-cat">{uiText("By problem")}</h3>
        {categories.length > 0 && <SplitBar title={uiText("Share of issues")} legend={false} locale={locale === "vi" ? "vi-VN" : "en-US"} unit={uiText("issues")} segments={categories.map(([category, count]) => ({ id: category, label: uiText(CATEGORY_LABEL[category]), value: count }))} />}
        {categories.length === 0 ? <p className="ui-sb-muted">{uiText("Nothing to show.")}</p> : <ul className="cr-bars">{categories.map(([category, count]) => <li key={category}><span className="cr-bars__name">{uiText(CATEGORY_LABEL[category])}</span><span className="cr-bars__track" aria-hidden="true"><motion.i initial={reduce ? false : { width: 0 }} animate={{ width: `${count / top * 100}%` }} transition={{ duration: reduce ? 0 : 0.5, ease: [0.22, 1, 0.36, 1] }} /></span><button type="button" className="cr-bars__value" onClick={() => onReview({ category, severities: [...SEVERITIES], status: "all", field: "", query: "" })}>{n(count)}</button></li>)}</ul>}
      </section>
      <section className="ui-sb-card cr-panel" aria-labelledby="ov-col"><h3 className="ui-sb-h2" id="ov-col">{uiText("By column")}</h3>
        {fields.length === 0 ? <p className="ui-sb-muted">{uiText("Nothing to show.")}</p> : <ul className="cr-bars">{fields.map(([field, count]) => <li key={field}><span className="cr-bars__name">{field}</span><span className="cr-bars__track" aria-hidden="true"><motion.i initial={reduce ? false : { width: 0 }} animate={{ width: `${count / topField * 100}%` }} transition={{ duration: reduce ? 0 : 0.5, ease: [0.22, 1, 0.36, 1] }} /></span><button type="button" className="cr-bars__value" onClick={() => onReview({ field, severities: [...SEVERITIES], status: "all", category: "", query: "" })}>{n(count)}</button></li>)}</ul>}
      </section>
    </div>
    <section className="ui-sb-section" aria-labelledby="ov-sheets"><div className="ui-sb-section__head"><h3 className="ui-sb-h2" id="ov-sheets">{uiText("Worksheets")}</h3></div>
      <div className="ui-sb-table-wrap" tabIndex={0} role="region" aria-label={uiText("Worksheets")}><table className="ui-sb-table"><thead><tr><th scope="col">{uiText("Sheet")}</th><th scope="col">{uiText("Role")}</th><th scope="col">{uiText("Text scan")}</th><th scope="col" className="ui-sb-num">{uiText("Text cells")}</th><th scope="col" className="ui-sb-num">{uiText("Cells with ?")}</th><th scope="col" className="ui-sb-num">{uiText("Data rows")}</th><th scope="col" className="ui-sb-num">{uiText("Hidden")}</th><th scope="col" className="ui-sb-num">{uiText("Empty")}</th><th scope="col">{uiText("Filter")}</th></tr></thead>
        <tbody>{result.profile.sheets.map(sheet => { const scanned = statuses.find(item => item.name === sheet.name)!; return <tr key={sheet.name}><td>{sheet.name}</td><td><span className="ui-sb-pill" data-tone={sheet.role === "primary" ? "green" : undefined}>{uiText(sheet.role === "primary" ? "Data" : sheet.role === "csv-packed" ? "Text copy" : sheet.role === "empty" ? "Empty" : "Other")}</span></td><td><span className="ui-sb-pill" data-sheet-state={scanned.state} data-tone={SCAN_TONE[scanned.state]}>{uiText(scanned.state === "clean" ? "Clean" : scanned.state === "issues" ? "{0} to review" : scanned.state === "error" ? "Scan failed" : "Not scanned", [n(scanned.open || scanned.scan?.unrepairableQuestionMarks || 0)])}</span></td><td className="ui-sb-num">{scanned.scan ? n(scanned.scan.textCellsSeen) : "—"}</td><td className="ui-sb-num">{scanned.scan ? n(scanned.scan.questionMarkCells) : "—"}</td><td className="ui-sb-num">{n(sheet.dataRows)}</td><td className="ui-sb-num">{n(sheet.hiddenRows)}</td><td className="ui-sb-num">{n(sheet.emptyRows)}</td><td>{sheet.autoFilter ? uiText("On") : uiText("Off")}</td></tr>; })}</tbody></table></div>
    </section>
    <div className="ui-sb-actions"><button type="button" className="ui-button" data-variant="primary" data-size="sm" disabled={issues.length === 0} onClick={() => onReview({})}><span className="ui-button__label">{uiText("Review and fix")}</span></button></div>
  </div>;
}
