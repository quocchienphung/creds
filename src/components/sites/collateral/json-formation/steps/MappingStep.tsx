"use client";

import { useEffect, useState } from "react";
import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { Combobox } from "../../../affectui-combobox/Combobox";
import { MAU9_PROFILE } from "../../excel-formation/engine/mapping-profiles";
import { columnLetters } from "../../excel-formation/engine/text";
import type { CollateralEngine } from "../../useCollateralEngine";

const SHOWN = 36;

/**
 * The mapping the engine used, column by column: which Excel column fills which attribute of Mẫu số 09, by which rule, and what the first data
 * row of the open workbook puts there. Only exact header matches were mapped; a header that appears twice is left for the reviewer.
 */
export function MappingStep({ engine }: { engine: CollateralEngine }) {
  const { t: uiText } = useWorkspaceI18n();
  const profile = engine.result!.profile, mapping = profile.mapping;
  const sheetProfile = profile.sheets.find(item => item.name === profile.primary);
  const exampleRow = sheetProfile?.headerRow != null ? sheetProfile.headerRow + 1 : null;
  const { rowContext } = engine;
  const fileHash = engine.result?.fileHash ?? "";
  const [example, setExample] = useState<{ key: string; values: Map<number, string> } | null>(null);
  useEffect(() => {
    if (exampleRow === null) return;
    let alive = true;
    void rowContext(exampleRow).then(context => { if (alive && context) setExample({ key: fileHash, values: new Map(context.cells.map(cell => [cell.col, cell.value])) }); }).catch(() => {});
    return () => { alive = false; };
  }, [rowContext, exampleRow, fileHash]);
  if (!mapping) return <p className="ui-sb-card cr-blockers" role="alert">{uiText("No worksheet matches the mapping profile, so no mapping can be shown.")}</p>;
  const values = example?.key === fileHash ? example.values : null;
  const resolved = new Map(mapping.resolved.map(item => [item.spec.header, item.col]));
  const ambiguous = new Map(mapping.ambiguous.map(item => [item.spec.header, item.cols]));
  const missing = new Set(mapping.missing.map(spec => spec.header));
  const shown = (col: number | undefined) => {
    if (exampleRow === null || col === undefined) return "—";
    if (!values) return "…";
    const text = values.get(col) ?? "";
    return text === "" ? "—" : text.length > SHOWN ? `${text.slice(0, SHOWN)}…` : text;
  };
  return <div className="cr-mapping">
    <p className="ui-sb-muted">{MAU9_PROFILE.title} · v{MAU9_PROFILE.version}{exampleRow !== null && ` · ${uiText("Example: Excel row {0}", [exampleRow])}`}</p>
    <div className="ui-sb-table-wrap" tabIndex={0} role="region" aria-label={uiText("Column mapping")}><table className="ui-sb-table cr-map-table"><thead><tr><th scope="col">{uiText("Excel column")}</th><th scope="col">{uiText("Header")}</th><th scope="col">{uiText("JSON field")}</th><th scope="col">{uiText("Rule")}</th><th scope="col">{uiText("In the example row")}</th><th scope="col">{uiText("Status")}</th></tr></thead>
      <tbody>{MAU9_PROFILE.columns.map(spec => {
        const col = resolved.get(spec.header), choices = ambiguous.get(spec.header);
        const state = choices ? "ambiguous" : missing.has(spec.header) ? "missing" : spec.json ? "mapped" : "unused";
        return <tr key={spec.header} data-state={state}>
          <td className="ui-sb-mono">{col !== undefined ? columnLetters(col) : "—"}</td><td>{spec.header}{spec.required && <abbr title={uiText("Required")} className="cr-req">*</abbr>}</td>
          <td className="ui-sb-mono">{spec.json ?? <span className="ui-sb-muted">{uiText("not used in the JSON")}</span>}</td>
          <td className="ui-sb-muted">{spec.rule ? uiText(spec.rule) : "—"}</td>
          <td className="ui-sb-mono">{shown(col)}</td>
          <td>{choices ? <div className="cr-choose"><Combobox size="sm" aria-label={uiText("Choose the {0} column", [spec.header])} placeholder={uiText("Choose…")} options={choices.map(choice => ({ value: String(choice), label: columnLetters(choice), localize: false }))} onChange={value => engine.rescan({ [spec.header]: Number(value) })} searchable={false} /></div>
            : <span className="ui-sb-pill" data-tone={state === "mapped" ? "green" : state === "missing" ? (spec.required ? "red" : "amber") : undefined}>{uiText(state === "mapped" ? "Mapped" : state === "missing" ? "Missing" : "Kept, not exported")}</span>}</td>
        </tr>;
      })}</tbody></table></div>
    {mapping.unknown.length > 0 && <section className="ui-sb-section"><div className="ui-sb-section__head"><h3 className="ui-sb-h2">{uiText("Columns the profile does not know")}</h3></div><p className="ui-sb-muted">{mapping.unknown.map(header => `${header.letter} ${header.text}`).join(" · ")}</p></section>}
    <section className="ui-sb-section"><div className="ui-sb-section__head"><h3 className="ui-sb-h2">{uiText("Entries of the JSON built from several columns")}</h3></div>
      <ul className="cr-rules">{(MAU9_PROFILE.blocks ?? []).map(block => <li key={block.id}><span className="ui-sb-mono">{block.json}</span> · {uiText("key column {0}", [block.anchor])}: {uiText("an entry without its key column is a problem to review; its values are kept")}</li>)}</ul></section>
    <section className="ui-sb-section"><div className="ui-sb-section__head"><h3 className="ui-sb-h2">{uiText("Open decisions")}</h3></div>
      <ul className="cr-rules"><li>{uiText("TS005 first row · TS006 sum of rows")}</li><li>{uiText("TS009 order: first seen")}</li><li>{uiText("Report date and contacts: entered at export")}</li><li>{uiText("File name: TCTD code and sequence are entered at export")}</li></ul></section>
  </div>;
}
