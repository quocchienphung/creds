"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { FileSpreadsheet } from "lucide-react";
import { WorkspaceLink } from "../guide-navigation/WorkspaceLink";

/** Shown by the JSON section while no workbook is open: the data it groups comes from the Excel section. */
export function NeedWorkbook() {
  const { t: uiText } = useWorkspaceI18n();
  return <div className="ui-as-empty" data-tall="">
    <span className="ui-as-empty__icon"><FileSpreadsheet size={20} strokeWidth={1.7} aria-hidden="true" /></span>
    <div className="ui-as-empty__title">{uiText("No workbook open")}</div>
    <p className="ui-as-empty__text">{uiText("Open a workbook in Excel formation first.")}</p>
    <WorkspaceLink className="ui-button" data-variant="primary" data-size="sm" href="/personalize?section=excel-formation"><span className="ui-button__label">{uiText("Go to Excel formation")}</span></WorkspaceLink>
  </div>;
}
