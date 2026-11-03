"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useState } from "react";
import { motion } from "motion/react";
import { Download, Lock } from "lucide-react";
import { SplitButton } from "../../../split-button/SplitButton";
import type { CollateralEngine } from "../../useCollateralEngine";
import type { JsonPlanState } from "../useJsonPlan";
import type { OrderPolicy, OwnerPolicy } from "../engine/json-report";
import { emptyFileNaming } from "../engine/report-options";
import { downloadBlob } from "../../download";
import { JsonPipeline } from "./JsonPipeline";

const FIELDS = [
  { key: "KB001", label: "Reporting date (YYYYMMDD)", mode: "numeric" as const },
  { key: "KB002", label: "Prepared by", mode: "text" as const },
  { key: "KB003", label: "Phone", mode: "tel" as const },
  { key: "KB004", label: "Email", mode: "email" as const },
] as const;
/** The two parts of the file name `D40<code><date>.<zzz>.json` that the workbook does not hold. */
const NAME_FIELDS = [
  { key: "tctd", label: "TCTD code (file name)", max: 20 },
  { key: "sequence", label: "Sequence, 3 characters (file name)", max: 3 },
] as const;

/** The reporting JSON. Offered only when every gate holds; the date and contact details are typed here, never copied from an older file. */
export function JsonPanel({ engine, state, notify }: { engine: CollateralEngine; state: JsonPlanState; notify: (message: string) => void }) {
  const { t: uiText, locale } = useWorkspaceI18n();
  const { meta, options, plan } = state;
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const n = (value: number) => new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US").format(value);
  const r = plan?.reconciliation;
  async function download(kind: "json" | "zip" | "audit" | "csv") {
    setBusy(true); setProblem("");
    try {
      const result = await engine.jsonPlan(meta, options, kind === "json" || kind === "zip", kind === "zip");
      if (!result) return;
      if (kind === "json" || kind === "zip") {
        const name = kind === "zip" ? result.plan.zipName : result.plan.fileName;
        if (!result.plan.ready || !result.bytes || !name) { setProblem(uiText("A check no longer holds")); return; }
        downloadBlob(name, result.bytes);
        notify(uiText("Downloaded {0}", [name]));
      } else if (kind === "audit") { downloadBlob("validation-audit.json", new Blob([result.audit], { type: "application/json" })); notify(uiText("Downloaded {0}", ["validation-audit.json"])); }
      else { downloadBlob("validation-report.csv", new Blob([result.csv], { type: "text/csv;charset=utf-8" })); notify(uiText("Downloaded {0}", ["validation-report.csv"])); }
    } finally { setBusy(false); }
  }
  return <section className="ui-sb-card cr-panel cr-json" aria-labelledby="ex-json" data-ready={plan?.ready || undefined}>
    <div className="cr-card-top"><h3 className="ui-sb-h2" id="ex-json">{uiText("Reporting JSON")}</h3>{plan?.ready ? <span className="ui-sb-pill" data-tone="green">{uiText("Ready")}</span> : <span className="ui-sb-pill"><Lock size={11} aria-hidden="true" /> {uiText("Locked")}</span>}</div>
    <form className="cr-meta" onSubmit={event => event.preventDefault()} aria-label={uiText("Report details")}>
      {FIELDS.map(field => <label key={field.key} className="cr-field"><span className="cd-label">{uiText(field.label)}</span>
        <input className="ui-sb-input" inputMode={field.mode === "numeric" ? "numeric" : undefined} type={field.mode === "email" ? "email" : "text"} autoComplete="off" maxLength={field.key === "KB001" ? 8 : 120} value={meta[field.key]} aria-invalid={field.key === "KB001" && meta.KB001 !== "" && !/^\d{8}$/.test(meta.KB001)} onChange={event => state.setMeta({ ...meta, [field.key]: event.target.value })} /></label>)}
    </form>
    <form className="cr-meta" onSubmit={event => event.preventDefault()} aria-label={uiText("File name")}>
      {NAME_FIELDS.map(field => <label key={field.key} className="cr-field"><span className="cd-label">{uiText(field.label)}</span>
        <input className="ui-sb-input" type="text" autoComplete="off" spellCheck={false} maxLength={field.max} value={(options.file ?? emptyFileNaming)[field.key]} onChange={event => state.setOptions({ ...options, file: { ...(options.file ?? emptyFileNaming), [field.key]: event.target.value.trim() } })} /></label>)}
    </form>
    <p className="ui-sb-muted cr-filename" aria-live="polite">{plan?.fileName ? plan.fileName : uiText("The file name is D40 + TCTD code + report date + . + sequence + .json")}</p>
    <Policy id="owner-policy" label="Owners when rows of one asset list different people" value={options.ownerPolicy} choices={[["distinct", "Keep every person"], ["first", "First row only"]]} onChange={value => state.setOptions({ ...options, ownerPolicy: value as OwnerPolicy })} />
    <Policy id="order-policy" label="Order of branches, customers and assets" value={options.order} choices={[["code", "By code (as the reference)"], ["source", "As in the workbook"]]} onChange={value => state.setOptions({ ...options, order: value as OrderPolicy })} />

    {plan ? <JsonPipeline engine={engine} state={state} plan={plan} /> : <p className="ui-sb-muted" role="status">{uiText("Checking…")}</p>}
    {plan && plan.problems.length > 0 && <ul className="cr-problems" role="alert">{plan.problems.slice(0, 4).map(text => <li key={text}>{text}</li>)}</ul>}
    {r && <dl className="cr-facts cr-recon" aria-label={uiText("Reconciliation")}>
      <div><dt>{uiText("Rows read")}</dt><dd>{n(r.rowsInSheet)}</dd></div><div><dt>{uiText("Branches")}</dt><dd>{n(r.branches)}</dd></div><div><dt>{uiText("Customers")}</dt><dd>{n(r.customers)}</dd></div>
      <div><dt>{uiText("Assets")}</dt><dd>{n(r.assets)}</dd></div><div><dt>{uiText("Contracts")}</dt><dd>{n(r.contracts)}</dd></div><div><dt>{uiText("Owners")}</dt><dd>{n(r.owners)}</dd></div>
      <div><dt>{uiText("Assets with a project (TS014)")}</dt><dd>{n(r.assetsWithProject)}</dd></div><div><dt>{uiText("Assets with a land title (TS015)")}</dt><dd>{n(r.assetsWithLand)}</dd></div><div><dt>{uiText("Assets with a vehicle (TS016)")}</dt><dd>{n(r.assetsWithVehicle)}</dd></div><div><dt>{uiText("Assets with shared collateral (TS010, TS011)")}</dt><dd>{n(r.assetsWithShared)}</dd></div>
      <div><dt>{uiText("Unmatched rows")}</dt><dd>{n(r.rowsUnmatched)}</dd></div><div><dt>{uiText("Assets with conflicting values")}</dt><dd>{n(r.assetsWithValueConflicts)}</dd></div><div><dt>{uiText("Edits not used")}</dt><dd>{n(r.patchedCellsNotUsed)}</dd></div>
    </dl>}
    <div className="ui-sb-actions cr-downloads">
      <SplitButton size="sm" icon={<Download size={15} />} disabled={!plan || busy} label={plan?.ready && plan.fileName ? uiText("Download {0}", [plan.fileName]) : uiText("Download audit report (JSON)")} menuLabel={uiText("More downloads")}
        onClick={() => void download(plan?.ready ? "json" : "audit")}
        actions={[...(plan?.ready ? [{ id: "zip", label: uiText("Download {0}", [plan.zipName ?? ""]), onSelect: () => void download("zip") }, { id: "audit", label: uiText("Audit report (JSON)"), onSelect: () => void download("audit") }] : []), { id: "csv", label: uiText("Audit report (CSV)"), onSelect: () => void download("csv") }]} />
    </div>
    {problem && <p className="cd-note cd-warn" role="alert">{problem}</p>}
  </section>;
}

function Policy({ id, label, value, choices, onChange }: { id: string; label: string; value: string; choices: [string, string][]; onChange: (value: string) => void }) {
  const { t: uiText } = useWorkspaceI18n();
  return <div className="cr-policy"><span className="cd-label" id={id}>{uiText(label)}</span>
    <div className="ui-seg" data-size="sm"><div className="ui-seg__scroller"><div className="ui-seg__track" role="radiogroup" aria-labelledby={id}>{choices.map(([key, text]) => <button type="button" key={key} className="ui-seg__opt" role="radio" aria-checked={value === key} data-active={value === key || undefined} tabIndex={value === key ? 0 : -1} onClick={() => onChange(key)}>
      {value === key && <motion.span className="cr-pill" layoutId={id} transition={{ type: "spring", stiffness: 450, damping: 38 }} />}
      <span className="ui-seg__content"><span className="ui-seg__label"><span className="ui-seg__text">{uiText(text)}</span><span className="ui-seg__text ui-seg__text-bold" aria-hidden="true">{uiText(text)}</span></span></span></button>)}</div></div></div></div>;
}
