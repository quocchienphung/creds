"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useEffect, useRef } from "react";
import { Lock } from "lucide-react";
import { StorageDropzone } from "../../../storage/StorageDropzone";
import type { CollateralEngine } from "../../useCollateralEngine";
import { WorkbookUnfurl } from "./WorkbookUnfurl";
import { useImportCopy } from "./import-copy";
import { ArchiveNotice } from "../../queue/ArchiveNotice";
import "./import-step.css";

const MESSAGE: Record<string, string> = {
  "not-xlsx": "This file is not an .xlsx workbook.",
  "legacy-or-encrypted": "This is a legacy .xls file or a password-protected workbook. Save it as an unprotected .xlsx first.",
  empty: "The file is empty.", "too-large": "The file is larger than this tool accepts.", "zip-bomb": "The archive expands to an unsafe size.",
  corrupt: "The workbook could not be opened. It may be damaged.", "no-workbook": "This archive is not an Excel workbook.", "no-sheets": "The workbook has no worksheets.",
};

export function ImportStep({ engine, onReview }: { engine: CollateralEngine; onReview: () => void }) {
  const { t: uiText } = useWorkspaceI18n();
  const copy = useImportCopy();
  const input = useRef<HTMLInputElement>(null);
  const drop = useRef<HTMLDivElement>(null);
  const previousFile = useRef(engine.fileName);
  const scanning = engine.phase === "scanning";
  const receive = (files: File[]) => { const file = files.find(item => /\.xlsx$/i.test(item.name)) ?? files[0]; if (file) void engine.open(file); };
  const error = engine.failure ? MESSAGE[engine.failure.code ?? ""] ?? engine.failure.message : undefined;
  useEffect(() => {
    if (previousFile.current && !engine.fileName) drop.current?.querySelector<HTMLButtonElement>(".storage-dropzone__area")?.focus({ preventScroll: true });
    previousFile.current = engine.fileName;
  }, [engine.fileName]);
  return <div className="cr-import">
    <div className="cr-import__center">
      <div className="cr-import__intro"><h2>{copy("intro")}</h2><p>{copy("hint")}</p></div>
      <div className="cr-import__drop" ref={drop}>
        {engine.fileName ? <>
          <input ref={input} className="storage-dropzone__input" type="file" accept=".xlsx" tabIndex={-1} aria-label={uiText("Choose an Excel workbook")} onChange={event => { receive(Array.from(event.currentTarget.files ?? [])); event.currentTarget.value = ""; }} />
          <WorkbookUnfurl key={engine.fileName} engine={engine} error={error} onReplace={() => input.current?.click()} onReview={onReview} />
        </> : <StorageDropzone entries={[]} multiple={false} accept=".xlsx" badges={["XLSX", "XLSX"]} inputLabel="Choose an Excel workbook" hint={copy("limits")} onFiles={receive} />}
      </div>
      <aside className="cr-import__options" aria-label={uiText("Options")}>
        <label className="cr-switch-row"><button type="button" role="switch" className="cr-switch" aria-label={uiText("Flag accented text")} aria-checked={engine.diacriticPolicy} disabled={scanning} onClick={() => engine.rescan(!engine.diacriticPolicy)}><span className="cr-switch__thumb" /></button><span>{uiText("Flag accented text")}</span></label>
        <p className="cr-local"><Lock size={13} aria-hidden="true" /> {uiText("Processed on this device")}</p>
      </aside>
      <ArchiveNotice />
    </div>
  </div>;
}
