"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useState } from "react";
import { Download, FileSpreadsheet } from "lucide-react";
import { ActionButton } from "../../../skilled/ui/ActionButton";
import type { CollateralEngine, ExportedFile } from "../../useCollateralEngine";
import { downloadBlob } from "../../download";

export function ExportStep({ engine, notify }: { engine: CollateralEngine; notify: (message: string) => void }) {
  const { t: uiText } = useWorkspaceI18n();
  const view = engine.view!;
  const [file, setFile] = useState<ExportedFile | null>(null);
  const changed = view.summary.patched;
  async function build() {
    const made = await engine.exportXlsx();
    setFile(made);
    if (!made?.ok) { notify(uiText("Check failed")); throw new Error("The corrected workbook did not pass its check."); }
    notify(uiText("Corrected workbook verified"));
  }
  return <div className="cr-export">
    <section className="ui-sb-card cr-panel" aria-labelledby="ex-xlsx">
      <div className="cr-card-top"><h3 className="ui-sb-h2" id="ex-xlsx">{uiText("Corrected workbook")}</h3><FileSpreadsheet size={17} aria-hidden="true" /></div>
      <dl className="cr-facts"><div><dt>{uiText("Cells changed")}</dt><dd>{changed}</dd></div><div><dt>{uiText("Still serious")}</dt><dd>{view.summary.blocking}</dd></div><div><dt>{uiText("Exceptions")}</dt><dd>{view.summary.exceptions}</dd></div></dl>
      {changed === 0 && <p className="ui-sb-muted" role="status">{uiText("No changes yet")}</p>}
      <div className="ui-sb-actions">
        <ActionButton size="sm" label={uiText("Create corrected workbook")} pendingLabel={uiText("Building…")} successLabel={uiText("Verified")} resetAfterMs={2400} disabled={engine.busy} onAction={build} onActionError={() => {}} />
        {file && <button type="button" className="ui-button" data-variant="secondary" data-size="sm" disabled={!file.ok} onClick={() => { downloadBlob(file.fileName, file.blob); notify(uiText("Downloaded {0}", [file.fileName])); }}><span className="ui-button__icon"><Download size={15} /></span><span className="ui-button__label">{uiText("Download")} {file.fileName}</span></button>}
      </div>
      {file && <p className="cr-verify" data-ok={file.ok || undefined} role="status">{file.ok ? uiText("Verified: {0} cells match, nothing else changed", [file.changedCells]) : uiText("Check failed: {0} wrong, {1} unexpected", [file.wrongValues, file.unexpectedChanges])}</p>}
    </section>
  </div>;
}
