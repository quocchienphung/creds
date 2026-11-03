"use client";

import { useMemo } from "react";
import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { JsonViewer } from "../../../json-viewer/JsonViewer";
import type { CollateralEngine } from "../../useCollateralEngine";
import type { JsonPlan } from "../engine/json-session";
import { remoteSource } from "../remote-source";

/**
 * The document the export would write, as a tree to explore: every branch, customer and asset of it, read from the worker a page at a time (the
 * reference file is 27 MB, so it is never parsed here). It is the diagnostic build: it can differ from the file you may download until every
 * check holds.
 */
export function GroupedPreview({ plan, engine, notify }: { plan: JsonPlan; engine: CollateralEngine; notify: (message: string) => void }) {
  const { t: uiText, locale } = useWorkspaceI18n();
  const n = (value: number) => new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US").format(value);
  const r = plan.reconciliation;
  const { docRoot, docChildren, docSearch, docText } = engine;
  const epoch = plan.epoch ?? 0;
  // A new build of the document is a new source; the open branches and the search stay, being kept by the viewer.
  const source = useMemo(() => { void epoch; return remoteSource({ root: docRoot, children: docChildren, search: docSearch, text: docText }, "report"); }, [docRoot, docChildren, docSearch, docText, epoch]);
  return <section className="ui-sb-card cr-panel cr-preview" aria-labelledby="gp-title">
    <div className="cr-card-top"><h3 className="ui-sb-h2" id="gp-title">{uiText("Reporting JSON preview")}</h3><span className="ui-sb-pill" data-tone="amber">{uiText("Diagnostic · not the export")}</span></div>
    <p className="ui-sb-muted">{uiText("{0} branches · {1} customers · {2} assets · {3} rows", [n(r.branches), n(r.customers), n(r.assets), n(r.rowsInSheet)])}</p>
    <JsonViewer source={source} rootName="report" label={uiText("Reporting JSON")} defaultExpanded={["report", "report.CNTCTD"]} maxHeight={460} pageSize={50}
      onCopy={({ kind }) => notify(kind === "path" ? uiText("Path copied") : uiText("Value copied"))} />
  </section>;
}
