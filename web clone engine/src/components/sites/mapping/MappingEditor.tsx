"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, Download, Plus, Trash2, Upload, X } from "lucide-react";
import { Combobox, type ComboboxOption } from "../affectui-combobox/Combobox";
import { createSampleData } from "./mapping-sample";
import { emptyData, findProject, findTask, normalizeData } from "./mapping-store";
import type { MappingModel } from "./mapping-model";
import type { Health, MappingCommand, MappingData, TaskStatus } from "./mapping-types";
import { healthLabels, healthOrder, statusLabels, statusOrder } from "./mapping-types";

export type Dispatch = (command: MappingCommand) => void;
const MAX_IMPORT_BYTES = 2_000_000;

function Field({ label, children, wide }: { label: string; children: (id: string) => ReactNode; wide?: boolean }) {
  const { t: uiText } = useWorkspaceI18n();
  const id = useId();
  return <div className="mapping-field" data-wide={wide || undefined}><label htmlFor={id}>{uiText(label)}</label>{children(id)}</div>;
}
function TextField({ label, value, onChange, multiline, placeholder, type = "text", min, max }: { label: string; value: string | number; onChange: (value: string) => void; multiline?: boolean; placeholder?: string; type?: string; min?: number; max?: number }) {
  const { t: uiText } = useWorkspaceI18n();
  return <Field label={uiText(label)} wide={multiline}>{id => multiline
    ? <textarea id={id} value={value} rows={3} placeholder={uiText(placeholder)} onChange={event => onChange(event.target.value)} />
    : <input id={id} type={type} value={value} min={min} max={max} placeholder={uiText(placeholder)} onChange={event => onChange(event.target.value)} />}</Field>;
}
function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: ComboboxOption[] }) {
  const { t: uiText } = useWorkspaceI18n();
  return <Combobox className="mapping-cbx" label={uiText(label)} value={value} options={options} onChange={onChange} />;
}
/** Destructive actions need a second click within a few seconds. */
function ConfirmButton({ label, confirm = "Click again to confirm", onConfirm }: { label: string; confirm?: string; onConfirm: () => void }) {
  const { t: uiText } = useWorkspaceI18n();
  const [armed, setArmed] = useState(false);
  useEffect(() => { if (!armed) return; const timer = setTimeout(() => setArmed(false), 4000); return () => clearTimeout(timer); }, [armed]);
  return <button type="button" className="mapping-btn" data-tone="danger" data-armed={armed || undefined} onBlur={() => setArmed(false)} onClick={() => { if (armed) { setArmed(false); onConfirm(); } else setArmed(true); }}><Trash2 size={14} strokeWidth={1.75} />{uiText(armed ? confirm : label)}</button>;
}
const Actions = ({ children }: { children: ReactNode }) => <div className="mapping-actions">{children}</div>;

const personOption = (person: MappingData["people"][number]): ComboboxOption => ({ value: person.id, label: person.name || "Unnamed", hint: person.role || undefined, avatar: person.avatarUrl || true, keywords: [person.role] });
function peopleOptions(model: MappingModel): ComboboxOption[] { return [{ value: "", label: "Unassigned" }, ...model.data.people.map(personOption)]; }
const statusColor: Record<TaskStatus, string> = { todo: "var(--border-strong)", progress: "var(--accent)", review: "var(--accent)", blocked: "var(--danger)", done: "var(--success)" };
const healthColor: Record<Health, string> = { "on-track": "var(--success)", "at-risk": "var(--warning)", "off-track": "var(--danger)" };

/** Edits whatever the map is currently zoomed into: studio, team, project or task. */
export function EditPanel({ model, view, dispatch }: { model: MappingModel; view: number; dispatch: Dispatch }) {
  const { t: uiText } = useWorkspaceI18n();
  const node = model.nodes[view] ?? model.nodes[0], { data } = model;
  if (node.kind === "company") return <div className="mapping-form" key="company">
    <p className="mapping-formKind">{uiText("Workspace")}</p>
    <TextField label={uiText("Workspace name")} value={data.name} onChange={name => dispatch({ type: "workspace.update", name })} />
    <p className="mapping-formNote">{uiText(data.teams.length)} {uiText(data.teams.length === 1 ? uiText("team") : uiText("teams"))}, {uiText(model.projects.length)} {uiText(" projects, ")}{uiText(model.tasks.length)} {uiText(" tasks, ")}{uiText(data.people.length)} {uiText(" people. Zoom into a team, project or task to edit it. Drag a team to rearrange.")}</p>
    <Actions><button type="button" className="mapping-btn" onClick={() => dispatch({ type: "team.add" })}><Plus size={14} strokeWidth={1.75} />{uiText("Add team")}</button></Actions>
  </div>;
  if (node.kind === "team") {
    const team = data.teams[node.ref], index = node.ref;
    return <div className="mapping-form" key={team.id}>
      <p className="mapping-formKind">{uiText("Team")}</p>
      <TextField label={uiText("Name")} value={team.name} onChange={name => dispatch({ type: "team.update", id: team.id, patch: { name } })} />
      <TextField label={uiText("Mission")} multiline value={team.mission} placeholder={uiText("What this team is for")} onChange={mission => dispatch({ type: "team.update", id: team.id, patch: { mission } })} />
      <SelectField label={uiText("Lead")} value={team.leadId ?? ""} options={peopleOptions(model)} onChange={leadId => dispatch({ type: "team.update", id: team.id, patch: { leadId: leadId || null } })} />
      <Combobox multiple className="mapping-cbx" label={uiText("Members")} placeholder={uiText(data.people.length ? uiText("Add members…") : uiText("Add people in the People tab first"))} disabled={!data.people.length} value={team.memberIds} options={data.people.map(personOption)} onChange={memberIds => dispatch({ type: "team.update", id: team.id, patch: { memberIds } })} />
      <Actions>
        <button type="button" className="mapping-btn" onClick={() => dispatch({ type: "project.add", teamId: team.id })}><Plus size={14} strokeWidth={1.75} />{uiText("Add project")}</button>
        <button type="button" className="mapping-btn" disabled={index === 0} onClick={() => dispatch({ type: "team.move", id: team.id, toIndex: index - 1 })}><ArrowUp size={14} strokeWidth={1.75} />{uiText("Move earlier")}</button>
        <button type="button" className="mapping-btn" disabled={index === data.teams.length - 1} onClick={() => dispatch({ type: "team.move", id: team.id, toIndex: index + 1 })}><ArrowDown size={14} strokeWidth={1.75} />{uiText("Move later")}</button>
        <ConfirmButton label={uiText("Delete team")} onConfirm={() => dispatch({ type: "team.remove", id: team.id })} />
      </Actions>
    </div>;
  }
  if (node.kind === "project") {
    const found = findProject(data, model.projects[node.ref].id)!, { project, team } = found, index = team.projects.findIndex(item => item.id === project.id);
    return <div className="mapping-form" key={project.id}>
      <p className="mapping-formKind">{uiText("Project")}</p>
      <TextField label={uiText("Name")} value={project.name} onChange={name => dispatch({ type: "project.update", id: project.id, patch: { name } })} />
      <TextField label={uiText("Brief")} multiline value={project.brief} placeholder={uiText("What this project delivers")} onChange={brief => dispatch({ type: "project.update", id: project.id, patch: { brief } })} />
      <SelectField label={uiText("Health")} value={project.health} options={healthOrder.map(value => ({ value, label: healthLabels[value], color: healthColor[value] }))} onChange={health => dispatch({ type: "project.update", id: project.id, patch: { health: health as Health } })} />
      <TextField label={uiText("Due date")} type="date" value={project.due ?? ""} onChange={due => dispatch({ type: "project.update", id: project.id, patch: { due: due || null } })} />
      <SelectField label={uiText("Lead")} value={project.leadId ?? ""} options={peopleOptions(model)} onChange={leadId => dispatch({ type: "project.update", id: project.id, patch: { leadId: leadId || null } })} />
      <TextField label={uiText("Blocked by")} value={project.blocker} placeholder={uiText("Used in blocked task summaries")} onChange={blocker => dispatch({ type: "project.update", id: project.id, patch: { blocker } })} />
      <SelectField label={uiText("Team")} value={team.id} options={data.teams.map(item => ({ value: item.id, label: item.name || "Untitled team" }))} onChange={toTeamId => dispatch({ type: "project.move", id: project.id, toTeamId, toIndex: 9999 })} />
      <Actions>
        <button type="button" className="mapping-btn" onClick={() => dispatch({ type: "task.add", projectId: project.id })}><Plus size={14} strokeWidth={1.75} />{uiText("Add task")}</button>
        <button type="button" className="mapping-btn" disabled={index === 0} onClick={() => dispatch({ type: "project.move", id: project.id, toTeamId: team.id, toIndex: index - 1 })}><ArrowUp size={14} strokeWidth={1.75} />{uiText("Move earlier")}</button>
        <button type="button" className="mapping-btn" disabled={index === team.projects.length - 1} onClick={() => dispatch({ type: "project.move", id: project.id, toTeamId: team.id, toIndex: index + 1 })}><ArrowDown size={14} strokeWidth={1.75} />{uiText("Move later")}</button>
        <ConfirmButton label={uiText("Delete project")} onConfirm={() => dispatch({ type: "project.remove", id: project.id })} />
      </Actions>
    </div>;
  }
  if (node.kind === "task") {
    const task = findTask(data, model.tasks[node.ref].id)!.task, state = model.status(node.ref);
    return <div className="mapping-form" key={task.id}>
      <p className="mapping-formKind">{uiText("Task")}</p>
      <TextField label={uiText("Title")} value={task.title} onChange={title => dispatch({ type: "task.update", id: task.id, patch: { title } })} />
      <TextField label={uiText("Description")} multiline value={task.description} placeholder={uiText("Leave empty for a generated summary")} onChange={description => dispatch({ type: "task.update", id: task.id, patch: { description } })} />
      <SelectField label={uiText("Status")} value={state} options={statusOrder.map(value => ({ value, label: statusLabels[value], color: statusColor[value] }))} onChange={status => dispatch({ type: "task.setStatus", id: task.id, status: status as TaskStatus })} />
      <SelectField label={uiText("Assignee")} value={task.assigneeId ?? ""} options={peopleOptions(model)} onChange={assigneeId => dispatch({ type: "task.update", id: task.id, patch: { assigneeId: assigneeId || null } })} />
      <TextField label={uiText("Due date")} type="date" value={task.due ?? ""} onChange={due => dispatch({ type: "task.update", id: task.id, patch: { due: due || null } })} />
      <div className="mapping-pair">
        <TextField label={uiText("Points")} type="number" min={0} max={99} value={task.points} onChange={points => dispatch({ type: "task.update", id: task.id, patch: { points: Number(points) } })} />
        <TextField label={uiText("Comments")} type="number" min={0} max={9999} value={task.comments} onChange={comments => dispatch({ type: "task.update", id: task.id, patch: { comments: Number(comments) } })} />
      </div>
      <fieldset className="mapping-steps"><legend>{uiText("Checklist")}</legend>
        {task.checklist.map(item => <div className="mapping-step" key={item.id}>
          <input type="checkbox" aria-label={uiText("Done: {0}", [item.label])} checked={item.done} onChange={() => dispatch({ type: "item.toggle", taskId: task.id, id: item.id })} />
          <input type="text" aria-label={uiText("Step name")} value={item.label} onChange={event => dispatch({ type: "item.update", taskId: task.id, id: item.id, patch: { label: event.target.value } })} />
          <button type="button" className="mapping-iconBtn" aria-label={uiText("Remove {0}", [item.label || "step"])} onClick={() => dispatch({ type: "item.remove", taskId: task.id, id: item.id })}><X size={14} strokeWidth={1.75} /></button>
        </div>)}
        <button type="button" className="mapping-btn" onClick={() => dispatch({ type: "item.add", taskId: task.id })}><Plus size={14} strokeWidth={1.75} />{uiText("Add step")}</button>
      </fieldset>
      <Actions><ConfirmButton label={uiText("Delete task")} onConfirm={() => dispatch({ type: "task.remove", id: task.id })} /></Actions>
    </div>;
  }
  return null;
}

export function PeoplePanel({ data, dispatch }: { data: MappingData; dispatch: Dispatch }) {
  const { t: uiText } = useWorkspaceI18n();
  return <div className="mapping-form">
    <p className="mapping-formKind">{uiText("People · ")}{uiText(data.people.length)}</p>
    <ul className="mapping-peopleList">{data.people.map(person => <li key={person.id}>
      <input type="text" aria-label={uiText("Name")} value={person.name} onChange={event => dispatch({ type: "person.update", id: person.id, patch: { name: event.target.value } })} />
      <input type="text" aria-label={uiText("Role of {0}", [person.name])} value={person.role} placeholder={uiText("Role")} onChange={event => dispatch({ type: "person.update", id: person.id, patch: { role: event.target.value } })} />
      <input type="url" aria-label={uiText("Avatar image URL of {0}", [person.name])} value={person.avatarUrl ?? ""} placeholder={uiText("Avatar image URL (optional)")} onChange={event => dispatch({ type: "person.update", id: person.id, patch: { avatarUrl: event.target.value } })} />
      <ConfirmButton label={uiText("Remove")} confirm="Confirm" onConfirm={() => dispatch({ type: "person.remove", id: person.id })} />
    </li>)}</ul>
    {!data.people.length && <p className="mapping-formNote">{uiText("No one yet. New users are named User 1, User 2, and so on.")}</p>}
    <Actions><button type="button" className="mapping-btn" onClick={() => dispatch({ type: "person.add" })}><Plus size={14} strokeWidth={1.75} />{uiText("Add user")}</button></Actions>
  </div>;
}

export function DataPanel({ data, dispatch }: { data: MappingData; dispatch: Dispatch }) {
  const { t: uiText } = useWorkspaceI18n();
  const file = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  function exportJson() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url; link.download = `${(data.name || "workspace").replace(/[^\w-]+/g, "-").toLowerCase()}-map.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importJson(selected: File | undefined) {
    if (!selected) return;
    if (selected.size > MAX_IMPORT_BYTES) { setMessage("That file is too large (2 MB limit)."); return; }
    try {
      const parsed = normalizeData(JSON.parse(await selected.text()));
      if (!parsed) { setMessage("That file is not a valid map export."); return; }
      dispatch({ type: "data.replace", data: parsed }); setMessage(`Imported ${parsed.teams.length} teams.`);
    } catch { setMessage("That file could not be read as JSON."); }
    if (file.current) file.current.value = "";
  }
  return <div className="mapping-form">
    <p className="mapping-formKind">{uiText("Data")}</p>
    <p className="mapping-formNote">{uiText("Everything is stored in this browser unless the map is given a data source. Export a copy any time.")}</p>
    <Actions>
      <button type="button" className="mapping-btn" onClick={exportJson}><Download size={14} strokeWidth={1.75} />{uiText("Export JSON")}</button>
      <button type="button" className="mapping-btn" onClick={() => file.current?.click()}><Upload size={14} strokeWidth={1.75} />{uiText("Import JSON")}</button>
      <input ref={file} type="file" accept="application/json,.json" hidden aria-label={uiText("Import map JSON file")} onChange={event => void importJson(event.target.files?.[0])} />
      <ConfirmButton label={uiText("Load sample data")} onConfirm={() => dispatch({ type: "data.replace", data: { ...createSampleData(), name: data.name } })} />
      <ConfirmButton label={uiText("Clear everything")} onConfirm={() => dispatch({ type: "data.replace", data: emptyData(data.name) })} />
    </Actions>
    <p className="mapping-formNote" role="status">{uiText(message)}</p>
  </div>;
}
