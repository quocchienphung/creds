"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { Check, Plus } from "lucide-react";
import { WorkspaceDialog } from "./WorkspaceDialog";


export interface WorkspaceProfile { name: string; email: string; role: string; avatar?: string }
export interface WorkspacePreferences { dark: boolean; emailNotifications: boolean; desktopNotifications: boolean; theme?: "light" | "dark" | "system" }
export interface CustomView { id: string; name: string; layout: "table" | "board"; owner: string }
export type EditorKind = "Full changelog" | "Create workspace";

export function WorkspaceEditors({ kind, open, onClose, createWorkspace }: {
  kind: EditorKind; open: boolean; onClose: () => void;
  createWorkspace: (name: string) => void;
}) {
  const { t: uiText } = useWorkspaceI18n();
  return <WorkspaceDialog open={open} title={uiText(kind)} onClose={onClose}>
    {kind === "Create workspace" && <form onSubmit={event=>{event.preventDefault();const form=event.currentTarget;const name=String(new FormData(form).get("name")).trim();if(!name)return;createWorkspace(name);form.reset();onClose();}}><label className="crm-field">{uiText("Workspace name")}<input name="name" placeholder={uiText("Workspace name")} required maxLength={40} autoFocus /></label><p>{uiText("Start with an empty workspace.")}</p><div className="workspace-form-actions"><button type="submit" className="ui-button" data-variant="primary" data-size="sm"><Plus size={14} />{uiText("Create workspace")}</button></div></form>}
    {kind === "Full changelog" && <div className="workspace-changelog">{[
      {title:"Rules pages",text:"Excel formation, JSON formation and Queue now live together in one Rules group."},
      {title:"Press Tab to search",text:"Tab opens the command palette from anywhere in the workspace."},
      {title:"Saved in your workspace",text:"Uploads and settings are kept by the workspace backend."},
    ].map((entry,index)=><article key={entry.title}><span className="workspace-change-dot"><Check size={12} /></span><div><small>{uiText("Update ")}{uiText(3-index)}</small><h3>{uiText(entry.title)}</h3><p>{uiText(entry.text)}</p></div></article>)}</div>}
  </WorkspaceDialog>;
}
