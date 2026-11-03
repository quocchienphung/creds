"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useId } from "react";
import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, Copy, Hourglass, Minus, Play, Plus, Repeat, ShieldCheck, Trash2, X } from "lucide-react";
import { PermissionPreview } from "./ProcessPermissions";
import { Combobox } from "../affectui-combobox/Combobox";
import type { ComboboxOption } from "../affectui-combobox/Combobox";
import { Mark, markNames } from "../affectui-agent-tree/tree-marks";
import { modelChoices, problemsOf, providerOf, providers, modelsOf } from "./catalog";
import { LIMITS, checkLink, clampRounds, costFormatter, depthOfNode, findNode, flattenNodes, linkKind, markOf, parentNode, toolIds, unitLabel, validParents } from "./process-model";
import { roleOf, roles } from "./roles";
import type { Role, RoleStep } from "./roles";
import type { CostUnit, Mode, ProcessDoc, ProcessLink, ProcessNode, Provider } from "./process-model";
import type { EngineInfo } from "./engine";
import type { NodeRun } from "./run-model";
import { durationLabel, statusLabel } from "../affectui-agent-tree/tree-model";

export interface InspectorProps {
  doc: ProcessDoc;
  node: ProcessNode;
  engines: readonly EngineInfo[];
  /** The simulated engine is running the process: its demo attributes are shown. */
  simulated: boolean;
  run?: NodeRun;
  /** A run is active: the structure is frozen so what is running cannot be pulled apart. */
  locked: boolean;
  /** `field` names a text field being typed in: keystrokes in one field become one undo step, while picks and switches are a step each. */
  onChange: (change: (node: ProcessNode) => ProcessNode, field?: string) => void;
  onAddChild: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMove: (delta: -1 | 1) => void;
  onReparent: (parentId: string) => void;
  onRunBranch: () => void;
  onResolve: (action: "approve" | "reject" | "retry" | "dismiss") => void;
  onReviewPermission: () => void;
  /** Connect this block to another one (the page says why when it is not possible). */
  onConnect: (toId: string) => void;
  onLinkChange: (id: string, change: Partial<Pick<ProcessLink, "label" | "rounds">>) => void;
  onLinkRemove: (id: string) => void;
  /** Add a sub-block the role's guide suggests, or a block of the role that usually comes next. */
  onAddStep: (step: RoleStep) => void;
  onAddNext: (role: Role) => void;
  now: number;
}

function Field({ label, hint, children, htmlFor }: { label: string; hint?: string; children: ReactNode; htmlFor?: string }) {
  const { t: uiText } = useWorkspaceI18n();
  return <div className="proc-field"><label className="proc-field__label" htmlFor={htmlFor}>{uiText(label)}</label>{children}{hint && <p className="proc-field__hint">{uiText(hint)}</p>}</div>;
}

function Switch({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (value: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  const { t: uiText } = useWorkspaceI18n();
  const id = useId();
  return <div className="proc-switch">
    <button type="button" id={id} role="switch" aria-checked={checked} disabled={disabled} className="proc-switch__track" onClick={() => onChange(!checked)}><span /></button>
    <label htmlFor={id}><span>{uiText(label)}</span>{hint && <small>{uiText(hint)}</small>}</label>
  </div>;
}

const providerOptions: ComboboxOption[] = providers.map(item => ({ value: item.id, label: item.label, hint: item.hint, group: item.group }));
const roleOptions: ComboboxOption[] = roles.map(role => ({ value: role.id, label: role.label, color: role.color }));
const toolOptions: ComboboxOption[] = toolIds.map(tool => ({ value: tool, label: markNames[tool] }));

export function NodeInspector({ doc, node, engines, simulated, run, locked, onChange, onAddChild, onDuplicate, onDelete, onMove, onReparent, onRunBranch, onResolve, onReviewPermission, onConnect, onLinkChange, onLinkRemove, onAddStep, onAddNext, now }: InspectorProps) {
  const { t: uiText } = useWorkspaceI18n();
  const id = useId();
  const isRoot = doc.root.id === node.id;
  const info = providerOf(node.ai.provider);
  const parent = parentNode(doc.root, node.id);
  const siblings = parent?.children ?? [];
  const index = siblings.findIndex(item => item.id === node.id);
  const problems = problemsOf(node);
  const unit = doc.unit as CostUnit;
  const format = costFormatter(unit);
  const parents = validParents(doc.root, node.id);
  const atLimit = flattenNodes(doc.root).length >= LIMITS.nodes || depthOfNode(doc.root, node.id) + 1 >= LIMITS.depth;

  const modelOptions: ComboboxOption[] = (() => {
    const choices = modelChoices(node.ai.provider, engines).map(choice => ({ value: choice.id, label: choice.label, hint: choice.hint }));
    return node.ai.model && !choices.some(choice => choice.value === node.ai.model) ? [...choices, { value: node.ai.model, label: node.ai.model }] : choices;
  })();

  const setAi = (change: Partial<ProcessNode["ai"]>, field?: string) => onChange(current => ({ ...current, ai: { ...current.ai, ...change } }), field);
  function setProvider(provider: Provider) {
    const hosted = modelsOf(provider), needs = providerOf(provider).needsModel;
    onChange(current => ({ ...current, ai: { ...current.ai, provider, model: hosted.length ? hosted.find(item => item.id === current.ai.model)?.id ?? (needs ? hosted[Math.min(2, hosted.length - 1)].id : "") : provider === current.ai.provider ? current.ai.model : "" } }));
  }
  /** A role names the block and fills its instructions, unless the person already wrote their own. */
  function setRole(role: Role) {
    const next = roleOf(role), previous = roleOf(node.role);
    onChange(current => ({
      ...current, role,
      name: role !== "custom" && (current.name === previous.label || current.name === "New block") ? next.label : current.name,
      ai: { ...current.ai, instructions: !current.ai.instructions.trim() || current.ai.instructions === previous.instructions ? next.instructions : current.ai.instructions },
    }));
  }

  const guide = roleOf(node.role).guide;
  const links = doc.links ?? [];
  const mine = links.filter(link => link.from === node.id || link.to === node.id);
  const nameOf = (blockId: string) => findNode(doc.root, blockId)?.name || "Untitled block";
  const targets: ComboboxOption[] = flattenNodes(doc.root).filter(other => other.id !== node.id).map(other => {
    const check = checkLink(doc, node.id, other.id);
    return { value: other.id, label: other.name || "Untitled block", hint: check.ok ? (check.kind === "loop" ? "loops back" : "waits for this block") : "not possible", disabled: !check.ok };
  });
  const status = run?.status;
  return <div className="proc-inspector" data-status={status} aria-label={uiText("Settings for {0}", [node.name])} role="group">
    <header className="proc-inspector__head">
      <span className="proc-inspector__avatar" data-logo={markOf(node.ai.provider) ? "" : undefined}>{markOf(node.ai.provider) ? <Mark id={markOf(node.ai.provider)!} /> : node.ai.provider === "human" ? uiText("ME") : node.name.slice(0, 2).toUpperCase()}</span>
      <div><strong>{node.name || uiText("Untitled task")}</strong><span>{uiText(isRoot ? uiText("First block") : uiText("Connected to {0}", [parent?.name ?? "the first block"]))}</span></div>
    </header>

    {problems.length > 0 && <ul className="proc-problems" role="status">{problems.map(problem => <li key={problem}>{uiText(problem)}</li>)}</ul>}

    {status && status !== "idle" && <section className="proc-run" aria-label={uiText("This run")} data-status={status}>
      <div className="proc-run__line"><span className="proc-run__status" data-status={status}>{uiText(statusLabel[status])}</span>
        {unit !== "none" && <span>{uiText(format(run?.cost ?? 0))}</span>}
        {run?.started !== undefined && <span>{uiText(durationLabel(Math.max(0, (run.ended ?? now) - run.started)))}</span>}</div>
      {status === "waiting" && <><p>{uiText(run?.ask)}</p><div className="proc-run__actions"><button type="button" className="proc-button proc-button--dark" onClick={onReviewPermission}><ShieldCheck size={14} />{uiText("Review request")}</button></div></>}
      {status === "failed" && <><p>{uiText(run?.error)}</p><div className="proc-run__actions"><button type="button" className="proc-button" onClick={() => onResolve("dismiss")}>{uiText("Dismiss")}</button><button type="button" className="proc-button proc-button--dark" onClick={() => onResolve("retry")}>{uiText("Retry")}</button></div></>}
    </section>}

    <section className="proc-section" aria-label={uiText("Task")}>
      <Field label={uiText("Name")} htmlFor={`${id}-name`}><input id={`${id}-name`} className="proc-input" value={node.name} maxLength={LIMITS.name} onChange={event => onChange(current => ({ ...current, name: event.target.value }), "name")} /></Field>
      <Combobox label={uiText("Role")} options={roleOptions} value={node.role} searchable={false} onChange={value => setRole(value as Role)} />
      {guide && <details className="proc-guide" open>
        <summary><span style={{ background: roleOf(node.role).color }} className="proc-guide__dot" />{uiText("About the {0} role", [uiText(roleOf(node.role).label)])}</summary>
        <dl>
          <div><dt>{uiText("Use it")}</dt><dd>{uiText(guide.when)}</dd></div>
          <div><dt>{uiText("Give it")}</dt><dd>{uiText(guide.receives)}</dd></div>
          <div><dt>{uiText("It passes on")}</dt><dd>{uiText(guide.hands)}</dd></div>
          <div><dt>{uiText("Watch out")}</dt><dd>{uiText(guide.watch)}</dd></div>
        </dl>
        <div className="proc-guide__chips" role="group" aria-label={uiText("Sub-blocks to add")}>
          <span>{uiText("Add a sub-block")}</span>
          {guide.steps.map(step => <button key={step.name} type="button" className="proc-chip" disabled={locked} title={uiText(step.task)} onClick={() => onAddStep(step)}><Plus size={12} /><span style={{ display: "inline" }}>{uiText(step.name)}</span></button>)}
        </div>
        <div className="proc-guide__chips" role="group" aria-label={uiText("Usually next")}>
          <span>{uiText("Usually next")}</span>
          {guide.next.map(next => <button key={next} type="button" className="proc-chip" disabled={locked} onClick={() => onAddNext(next)}><i style={{ background: roleOf(next).color }} className="proc-guide__dot" /><span style={{ display: "inline" }}>{uiText(roleOf(next).label)}</span></button>)}
        </div>
      </details>}
      <Field label={uiText("Task")} htmlFor={`${id}-task`} hint={uiText("What this task should get done, in your words.")}><textarea id={`${id}-task`} className="proc-input proc-input--area" rows={3} value={node.task} maxLength={LIMITS.task} onChange={event => onChange(current => ({ ...current, task: event.target.value }), "task")} /></Field>
    </section>

    <section className="proc-section" aria-label={uiText("AI block")}>
      <h3>{uiText("AI block")}</h3>
      <Combobox label={uiText("Who does it")} options={providerOptions} value={node.ai.provider} searchable onChange={value => setProvider(value as Provider)} />
      {node.ai.provider !== "human" && <Combobox
        label={uiText(node.ai.provider === "custom" ? uiText("Engine id") : uiText("Model"))} placeholder={uiText(info.placeholder)} options={modelOptions} value={node.ai.model || undefined}
        creatable searchable createLabel={text => `Use “${text}”`} emptyText={uiText(node.ai.provider === "ollama" ? "Type the name of a model installed in Ollama" : "Type a model name")}
        onCreate={text => ({ value: text.slice(0, LIMITS.model), label: text.slice(0, LIMITS.model) })}
        onChange={value => setAi({ model: value })} />}
      {node.ai.provider !== "human" && <Field label={uiText("Instructions")} htmlFor={`${id}-instructions`} hint={uiText("Told to this AI block before it starts. Leave empty to use only the task.")}><textarea id={`${id}-instructions`} className="proc-input proc-input--area" rows={4} value={node.ai.instructions} maxLength={LIMITS.instructions} onChange={event => setAi({ instructions: event.target.value }, "instructions")} /></Field>}
      <Combobox label={uiText("Tools it may use")} multiple options={toolOptions} value={node.tools} searchable={false} placeholder={uiText("None")} onChange={values => onChange(current => ({ ...current, tools: values.slice(0, LIMITS.tools) as ProcessNode["tools"] }))} />
    </section>

    <section className="proc-section" aria-label={uiText("Rules")}>
      <h3>{uiText("Rules")}</h3>
      <Switch checked={node.approval} label={uiText("Ask me before it runs")} hint={uiText("The task waits until you approve it.")} onChange={value => onChange(current => ({ ...current, approval: value }))} />
      {node.approval && <Field label={uiText("Question")} htmlFor={`${id}-ask`}><input id={`${id}-ask`} className="proc-input" value={node.askText} maxLength={LIMITS.askText} placeholder={uiText("Run “{0}”?", [node.name])} onChange={event => onChange(current => ({ ...current, askText: event.target.value }), "ask")} /></Field>}
      {node.approval && <PermissionPreview key={node.id} node={node} doc={doc} simulated={simulated} engines={engines} />}
      {node.children.length > 0 && <Combobox label={uiText("Its sub-tasks run")} options={[{ value: "parallel", label: "All at once" }, { value: "sequence", label: "One after another" }]} value={node.mode} searchable={false} onChange={value => onChange(current => ({ ...current, mode: value as Mode }))} />}
      {unit !== "none" && node.ai.provider !== "human" && <Field label={uiText("Stop at ({0})", [unitLabel[unit].toLowerCase()])} htmlFor={`${id}-limit`} hint={uiText("The task fails when its own cost reaches this. Empty means no limit.")}>
        <input id={`${id}-limit`} className="proc-input" type="number" min="0" step="any" inputMode="decimal" value={node.limit ?? ""} placeholder={uiText("No limit")} onChange={event => { const value = event.target.valueAsNumber; onChange(current => { const { limit, ...rest } = current; void limit; return Number.isFinite(value) && value > 0 ? { ...rest, limit: value } : rest; }, "limit"); }} /></Field>}
    </section>

    {simulated && <section className="proc-section" aria-label={uiText("Simulation")}>
      <h3>{uiText("Simulation")}</h3>
      <p className="proc-field__hint">{uiText("Only used by the simulated engine, to try the screens without a model. A connected engine ignores these.")}</p>
      <Field label={uiText("Takes (seconds)")} htmlFor={`${id}-duration`}><input id={`${id}-duration`} className="proc-input" type="number" min="1" max="600" step="1" inputMode="numeric" value={node.sim?.durationMs ? Math.round(node.sim.durationMs / 1000) : ""} placeholder={uiText("Automatic")} onChange={event => { const value = event.target.valueAsNumber; onChange(current => { const rest = { ...current.sim }; delete rest.durationMs; return { ...current, sim: { ...rest, ...(Number.isFinite(value) && value > 0 ? { durationMs: Math.min(600, value) * 1000 } : {}) } }; }, "duration"); }} /></Field>
      <Switch checked={!!node.sim?.failOnce} label={uiText("Fail once")} hint={uiText("Fails part-way so you can try Retry.")} onChange={value => onChange(current => { const rest = { ...current.sim }; delete rest.failOnce; return { ...current, sim: { ...rest, ...(value ? { failOnce: true } : {}) } }; })} />
    </section>}

    <section className="proc-section proc-connections" aria-label={uiText("Connections")}>
      <h3>{uiText("Connections")}</h3>
      <p className="proc-field__hint">{uiText("Blocks hang under the block that hands them work. Connect this block to any other: back to an earlier block it makes a loop, to any other it makes that block wait for this one.")}</p>
      {mine.length > 0 && <ul className="proc-links">
        {mine.map(link => {
          const kind = linkKind(doc.root, link), outgoing = link.from === node.id;
          return <li key={link.id} data-kind={kind}>
            <span className="proc-links__icon">{kind === "loop" ? <Repeat size={13} /> : <Hourglass size={13} />}</span>
            <span className="proc-links__text">{kind === "loop"
              ? (outgoing ? <>{uiText("Loops back to ")}<strong>{uiText(nameOf(link.to))}</strong></> : <><strong>{uiText(nameOf(link.from))}</strong> {uiText(" loops back here")}</>)
              : (outgoing ? <><strong>{uiText(nameOf(link.to))}</strong> {uiText(" waits for this block")}</> : <>{uiText("Waits for ")}<strong>{uiText(nameOf(link.from))}</strong></>)}
              {link.label && <em> · {uiText(link.label)}</em>}</span>
            {kind === "loop" && <span className="pmap__stepper" role="group" aria-label={uiText("Rounds of the loop to {0}", [nameOf(link.to)])}>
              <button type="button" aria-label={uiText("Fewer rounds")} disabled={locked || (link.rounds ?? 2) <= 2} onClick={() => onLinkChange(link.id, { rounds: clampRounds((link.rounds ?? 2) - 1) })}><Minus size={12} /></button>
              <output>{uiText(link.rounds ?? 2)}×</output>
              <button type="button" aria-label={uiText("More rounds")} disabled={locked || (link.rounds ?? 2) >= LIMITS.rounds} onClick={() => onLinkChange(link.id, { rounds: clampRounds((link.rounds ?? 2) + 1) })}><Plus size={12} /></button>
            </span>}
            <button type="button" className="proc-icon-button" aria-label={uiText("Remove the connection {0} to {1}", [nameOf(link.from), nameOf(link.to)])} title={uiText("Remove")} disabled={locked} onClick={() => onLinkRemove(link.id)}><X size={14} /></button>
          </li>;
        })}
      </ul>}
      <Combobox label={uiText("Connect this block to")} options={targets} value={undefined} placeholder={uiText("Choose a block")} searchable={targets.length > 7} disabled={locked || targets.length === 0} emptyText={uiText("No other block")} onChange={value => onConnect(value)} />
      {locked && <p className="proc-field__hint">{uiText("Stop the run to change connections.")}</p>}
    </section>

    <section className="proc-section proc-organize" aria-label={uiText("Organize")}>
      <h3>{uiText("Organize")}</h3>
      {!isRoot && parents.length > 0 && <Combobox label={uiText("Move under")} options={parents.map(item => ({ value: item.id, label: item.name || "Untitled task" }))} value={parent?.id} searchable={parents.length > 7} disabled={locked} onChange={value => onReparent(value)} />}
      <div className="proc-organize__buttons">
        <button type="button" className="proc-button" onClick={onAddChild} disabled={locked || atLimit}><Plus size={14} />{uiText("Add block")}</button>
        <button type="button" className="proc-button" onClick={onRunBranch} disabled={locked}><Play size={14} />{uiText("Run from here")}</button>
        {!isRoot && <>
          <button type="button" className="proc-button" onClick={() => onMove(-1)} disabled={locked || index <= 0} aria-label={uiText("Move up")}><ArrowUp size={14} />{uiText("Up")}</button>
          <button type="button" className="proc-button" onClick={() => onMove(1)} disabled={locked || index < 0 || index >= siblings.length - 1} aria-label={uiText("Move down")}><ArrowDown size={14} />{uiText("Down")}</button>
          <button type="button" className="proc-button" onClick={onDuplicate} disabled={locked || flattenNodes(doc.root).length >= LIMITS.nodes}><Copy size={14} />{uiText("Duplicate")}</button>
          <button type="button" className="proc-button proc-button--danger" onClick={onDelete} disabled={locked}><Trash2 size={14} />{uiText("Delete")}</button>
        </>}
      </div>
      {locked && <p className="proc-field__hint">{uiText("Stop the run to change the structure.")}</p>}
      {findNode(doc.root, node.id)?.children.length ? <p className="proc-field__hint">{uiText("Deleting, moving or copying this task takes its ")}{uiText(flattenNodes(node).length - 1)} {uiText(" sub-task")}{uiText(flattenNodes(node).length - 1 === 1 ? "" : "s")} {uiText(" along.")}</p> : null}
    </section>
  </div>;
}
