"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { Check, Plus } from "lucide-react";
import { WorkspaceDialog } from "./WorkspaceDialog";
import { Combobox } from "../affectui-combobox/Combobox";


export interface WorkspaceProfile { name: string; email: string; role: string; avatar?: string }
export interface WorkspacePreferences { dark: boolean; emailNotifications: boolean; desktopNotifications: boolean; theme?: "light" | "dark" | "system" }
export interface CustomView { id: string; name: string; layout: "table" | "board"; owner: string }
export type EditorKind = "Full changelog" | "Create workspace" | "New view";

export function WorkspaceEditors({ kind, open, onClose, createWorkspace, createView, owners }: {
  kind: EditorKind; open: boolean; onClose: () => void;
  createWorkspace: (name: string) => void; createView: (view: CustomView) => void;
  owners: string[];
}) {
  const { t: uiText } = useWorkspaceI18n();
  return <WorkspaceDialog open={open} title={uiText(kind)} onClose={onClose}>
    {kind === "Create workspace" && <form onSubmit={event=>{event.preventDefault();const form=event.currentTarget;const name=String(new FormData(form).get("name")).trim();if(!name)return;createWorkspace(name);form.reset();onClose();}}><label className="crm-field">{uiText("Workspace name")}<input name="name" placeholder={uiText("Workspace name")} required maxLength={40} autoFocus /></label><p>{uiText("Start with an empty company list, contacts and reports.")}</p><div className="workspace-form-actions"><button type="submit" className="ui-button" data-variant="primary" data-size="sm"><Plus size={14} />{uiText("Create workspace")}</button></div></form>}
    {kind === "New view" && <form onSubmit={event=>{event.preventDefault();const form=event.currentTarget;const data=new FormData(form);const name=String(data.get("name")).trim();if(!name)return;createView({id:crypto.randomUUID(),name,layout:data.get("layout")==="board" ? "board" : "table",owner:String(data.get("owner") || "")});form.reset();onClose();}}><label className="crm-field">{uiText("View name")}<input name="name" placeholder={uiText("My sales view")} required maxLength={50} autoFocus /></label><div className="crm-field"><Combobox label={uiText("Layout")} name="layout" defaultValue="table" options={[{value:"table",label:"Table"},{value:"board",label:"Board"}]} /></div><div className="crm-field"><Combobox label={uiText("Owner")} name="owner" defaultValue="" options={[{value:"",label:"All owners"},...owners.map(owner=>({value:owner,label:owner,localize:false}))]} /></div><div className="workspace-form-actions"><button type="submit" className="ui-button" data-variant="primary" data-size="sm">{uiText("Create view")}</button></div></form>}
    {kind === "Full changelog" && <div className="workspace-changelog">{[
      {title:"Reports, with a clearer picture",text:"Explore revenue by channel, compare periods, export CSV files and save named reports."},
      {title:"Shared folders",text:"Keep your sales documents together. Open Sales docs to upload files, edit drafts and download copies."},
      {title:"A better way to work",text:"Edit cells, paste ranges and move companies through your pipeline. Your workspace changes are saved in this browser."},
    ].map((entry,index)=><article key={entry.title}><span className="workspace-change-dot"><Check size={12} /></span><div><small>{uiText("Update ")}{uiText(3-index)}</small><h3>{uiText(entry.title)}</h3><p>{uiText(entry.text)}</p></div></article>)}</div>}
  </WorkspaceDialog>;
}
