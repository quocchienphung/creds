"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useId } from "react";
import { Download, LayoutGrid, Plug, Upload } from "lucide-react";
import { Combobox } from "../affectui-combobox/Combobox";
import { WorkspaceDialog } from "../affectui-crm/WorkspaceDialog";
import { LIMITS, unitLabel } from "./process-model";
import type { CostUnit, ProcessDoc } from "./process-model";

export function ConfirmDialog({ open, title, message, confirmLabel, onConfirm, onClose }: { open: boolean; title: string; message: string; confirmLabel: string; onConfirm: () => void; onClose: () => void }) {
  const { t: uiText } = useWorkspaceI18n();
  return <WorkspaceDialog open={open} title={uiText(title)} onClose={onClose}>
    <div className="proc-dialog"><p>{uiText(message)}</p>
      <div className="proc-dialog__actions"><button type="button" className="proc-button" onClick={onClose}>{uiText("Cancel")}</button><button type="button" className="proc-button proc-button--danger" onClick={onConfirm}>{uiText(confirmLabel)}</button></div>
    </div>
  </WorkspaceDialog>;
}

const snippet = `window.__workspaceBackendConfig = {
  baseUrl: "https://api.example.com/v1",
  headers: async () => ({ Authorization: \`Bearer \${await token()}\` }),
  serverProcess: true, // the server runs the tasks
};`;

export function ConnectDialog({ open, onClose, simulated, engineCount }: { open: boolean; onClose: () => void; simulated: boolean; engineCount: number }) {
  const { t: uiText } = useWorkspaceI18n();
  return <WorkspaceDialog open={open} title={uiText(simulated ? uiText("Connect an engine") : uiText("Connected engine"))} onClose={onClose} wide>
    <div className="proc-dialog proc-connect">
      {simulated
        ? <p><strong>{uiText("This page is running a simulation.")}</strong> {uiText(" Tasks move through their statuses on a timer and the costs are demo values; no model is called and nothing leaves your browser. Connect an engine to run the tasks for real.")}</p>
        : <p><strong>{uiText("A server runs your tasks.")}</strong> {uiText(" The page sends the plan and your decisions and shows what the server reports.")}{uiText(engineCount ? uiText(" It lists {0} AI block{1} you can choose.", [engineCount, engineCount === 1 ? "" : "s"]) : uiText(" It does not list its AI blocks, so model names are typed."))}</p>}
      <h3>{uiText("How to connect")}</h3>
      <p>{uiText("Point the workspace at your API and turn on ")}<code>serverProcess</code> {uiText(" before the workspace loads:")}</p>
      <pre>{snippet}</pre>
      <p>{uiText("Your server implements these routes under ")}<code>/workspaces/{uiText("{id}")}/process</code>:</p>
      <ul className="proc-routes">
        <li><code>GET /engines</code> {uiText(" the AI blocks it can run (for example the models installed in a local Ollama)")}</li>
        <li><code>POST /runs</code> {uiText(" start a run from the plan")}</li>
        <li><code>GET /runs/{uiText("{runId}")}</code> {uiText(" the run's newest state (polled while it is active)")}</li>
        <li><code>POST /runs/{uiText("{runId}")}/actions</code> {uiText(" approve, reject, retry, dismiss or stop")}</li>
      </ul>
      <p>{uiText("Your server can forward each task to a local model server, a chat bot or an agent framework. The page never talks to a model itself. The full contract, with the JSON shapes, is in ")}<code>docs/backend-api.md</code> {uiText(" under “Process (engine)”.")}</p>
      <div className="proc-dialog__actions"><button type="button" className="proc-button" onClick={onClose}>{uiText("Close")}</button></div>
    </div>
  </WorkspaceDialog>;
}

export function SettingsDialog({ open, onClose, doc, simulated, remote, onGoal, onUnit, onConnect, onExport, onImport, onTidy }: {
  open: boolean; onClose: () => void; doc: ProcessDoc; simulated: boolean; remote: boolean;
  onGoal: (goal: string) => void; onUnit: (unit: CostUnit) => void; onConnect: () => void; onExport: () => void; onImport: () => void; onTidy: () => void;
}) {
  const { t: uiText } = useWorkspaceI18n();
  const id = useId();
  return <WorkspaceDialog open={open} title={uiText("Process settings")} onClose={onClose}>
    <div className="proc-dialog proc-settings">
      <div className="proc-field"><label className="proc-field__label" htmlFor={`${id}-goal`}>{uiText("Goal")}</label>
        <textarea id={`${id}-goal`} className="proc-input proc-input--area" rows={2} value={doc.goal} maxLength={LIMITS.goal} placeholder={uiText("What should this process get done?")} onChange={event => onGoal(event.target.value)} /></div>
      <Combobox label={uiText("Show costs in")} searchable={false} value={doc.unit} options={(Object.keys(unitLabel) as CostUnit[]).map(value => ({ value, label: value === "none" ? "No costs" : unitLabel[value] }))} onChange={value => onUnit(value as CostUnit)} />
      <div className="proc-field"><span className="proc-field__label">{uiText("Engine")}</span>
        <p className="proc-field__hint">{uiText(simulated ? uiText("Simulated: tasks move through their statuses on a timer. Nothing is sent to a model.") : uiText("Connected: a server runs the tasks."))}</p>
        <div><button type="button" className="proc-button" onClick={onConnect}><Plug size={14} />{uiText(simulated ? uiText("Connect an engine") : uiText("About the engine"))}</button></div></div>
      <div className="proc-field"><span className="proc-field__label">{uiText("Map")}</span>
        <div><button type="button" className="proc-button" onClick={onTidy}><LayoutGrid size={14} />{uiText("Tidy up the map")}</button></div>
        <p className="proc-field__hint">{uiText("Lets the map place every block again. Blocks you moved by hand go back to their automatic place.")}</p></div>
      <div className="proc-field"><span className="proc-field__label">{uiText("Backup")}</span>
        <div className="proc-dialog__actions" style={{ justifyContent: "flex-start" }}>
          <button type="button" className="proc-button" onClick={onExport}><Download size={14} />{uiText("Export as JSON")}</button>
          <button type="button" className="proc-button" onClick={onImport}><Upload size={14} />{uiText("Import a process")}</button>
        </div>
        {remote && <p className="proc-field__hint">{uiText("Saved to your workspace's server.")}</p>}</div>
      <div className="proc-dialog__actions"><button type="button" className="proc-button" onClick={onClose}>{uiText("Done")}</button></div>
    </div>
  </WorkspaceDialog>;
}
