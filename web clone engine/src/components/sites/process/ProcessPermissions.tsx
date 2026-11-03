"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { revealPanelContent, useMorphingPanel } from "@/components/interaction/useMorphingPanel";
import { ArrowRight, ChevronLeft, ChevronRight, CircleDollarSign, Eye, GitBranch, ListChecks, Minus, ShieldCheck, Wrench, X } from "lucide-react";
import { PermissionRequest } from "../affectui-permission-request/PermissionRequest";
import type { PermissionDecision, PermissionItem } from "../affectui-permission-request/PermissionRequest";
import { Mark, markNames } from "../affectui-agent-tree/tree-marks";
import { modelLabel, providerOf } from "./catalog";
import { costFormatter, flattenNodes, markOf } from "./process-model";
import type { ProcessDoc, ProcessNode } from "./process-model";
import type { RunSnapshot } from "./run-model";
import type { EngineInfo } from "./engine";
import "./process-permissions.css";

function requestItems(node: ProcessNode, unit: ProcessDoc["unit"], simulated: boolean): PermissionItem[] {
  const descendants = flattenNodes(node).length - 1;
  return [
    { id: "task", label: node.task.trim() || `Run ${node.name}`, icon: <ListChecks /> },
    { id: "tools", label: node.tools.length ? `${simulated ? "Tool labels" : "Tools it may use"}: ${node.tools.map(tool => markNames[tool]).join(", ")}` : "No tools assigned", icon: <Wrench /> },
    ...(unit !== "none" && node.ai.provider !== "human" ? [{ id: "cost", label: "This block’s cost limit", detail: node.limit === undefined ? "No limit" : costFormatter(unit)(node.limit), icon: <CircleDollarSign /> }] : []),
    ...(descendants ? [{ id: "children", label: `${descendants} connected sub-task${descendants === 1 ? "" : "s"} can follow. Each keeps its own approval rule.`, icon: <GitBranch /> }] : []),
  ];
}

function RequestCard({ node, doc, simulated, engines = [], reason, ...props }: {
  node: ProcessNode; doc: ProcessDoc; simulated: boolean; engines?: readonly EngineInfo[]; reason?: string;
  decision?: PermissionDecision; busy?: boolean; error?: string; preview?: boolean;
  onDecision: (decision: PermissionDecision) => void; onReset?: () => void;
}) {
  const mark = markOf(node.ai.provider);
  return <PermissionRequest {...props} name={node.name} avatar={mark ? <Mark id={mark} /> : undefined}
    target={`${providerOf(node.ai.provider).label} · ${modelLabel(node.ai.provider, node.ai.model, engines) || doc.name}`}
    reason={reason || node.askText.trim() || `Run “${node.name}”? You decide before this block starts.`}
    items={requestItems(node, doc.unit, simulated)} simulated={simulated} />;
}

/** A sandbox next to the approval rule: it never calls the engine or writes a decision. */
export function PermissionPreview({ node, doc, simulated, engines }: { node: ProcessNode; doc: ProcessDoc; simulated: boolean; engines: readonly EngineInfo[] }) {
  const { t: uiText } = useWorkspaceI18n();
  const [decision, setDecision] = useState<PermissionDecision>();
  return <details className="proc-permission-preview" data-interaction-accordion>
    <summary><Eye size={14} aria-hidden="true" /><span>{uiText("Preview permission request")}</span><ChevronRight size={13} aria-hidden="true" /></summary>
    <div className="proc-permission-preview__body">
      <span className="proc-permission-preview__label">{uiText("Interactive preview")}</span>
      <RequestCard key={node.id} node={node} doc={doc} simulated={simulated} engines={engines} preview decision={decision} onDecision={setDecision} onReset={() => setDecision(undefined)} />
    </div>
  </details>;
}

/** One calm review surface for both views. Decisions always go through the existing engine; failures stay open. */
export function ProcessPermissions({ doc, root, snapshot, simulated, engines, preferredId, focusOnOpen, reviewRevision = 0, onDecide, onLocate }: {
  doc: ProcessDoc; root: ProcessNode; snapshot: RunSnapshot; simulated: boolean; engines: readonly EngineInfo[];
  preferredId?: string; focusOnOpen: boolean; reviewRevision?: number;
  onDecide: (id: string, decision: PermissionDecision) => Promise<boolean>; onLocate: (id: string) => void;
}) {
  const { t: uiText } = useWorkspaceI18n();
  const [selectedId, setSelectedId] = useState(preferredId);
  const [minimized, setMinimized] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [receipt, setReceipt] = useState<{ node: ProcessNode; decision: PermissionDecision }>();
  const [dismissed, setDismissed] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const inFlight = useRef(false);
  const moveFocus = useRef(focusOnOpen);
  const [reviewed, setReviewed] = useState(reviewRevision);
  // Explicit review retargets the same surface, rather than remounting a full-size card.
  if (reviewed !== reviewRevision) {
    setReviewed(reviewRevision); setSelectedId(preferredId); setMinimized(false); setDismissed(false); setReceipt(undefined);
    moveFocus.current = focusOnOpen;
  }
  const titleId = useId();
  const waiting = flattenNodes(root).filter(node => snapshot.nodes[node.id]?.status === "waiting");
  const index = Math.max(0, waiting.findIndex(node => node.id === selectedId));
  const node = waiting[index];
  const signature = waiting.map(item => item.id).join(":");
  const visible = !!node || (!!receipt && !dismissed);
  const compact = !!node && (minimized || dismissed);
  const surfaceState = `${compact}:${receipt?.node.id}:${receipt?.decision}:${node?.id}:${waiting.length}:${error ?? ""}`;
  useMorphingPanel(container, surfaceState, visible);
  useLayoutEffect(() => {
    if (container.current && visible && !compact) return revealPanelContent(container.current);
  }, [surfaceState, visible, compact]);
  // Only user-initiated reviews/decisions move focus. An incoming request never interrupts typing or map controls.
  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    container.current?.querySelector<HTMLElement>('.permission-request, [data-review-trigger]')?.focus({ preventScroll: true });
  }, [receipt, minimized, node?.id, signature]);

  function pick(id: string) { moveFocus.current = true; setSelectedId(id); setReceipt(undefined); setError(undefined); setMinimized(false); setDismissed(false); }
  function dismissReceipt() {
    container.current?.closest(".proc-workspace")?.querySelector<HTMLButtonElement>(".agt__extra button")?.focus({ preventScroll: true });
    setDismissed(true);
  }
  async function decide(decision: PermissionDecision) {
    if (!node || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(undefined);
    const restore = !!container.current?.contains(document.activeElement);
    try {
      if (await onDecide(node.id, decision)) {
        moveFocus.current = restore;
        setReceipt({ node, decision }); setDismissed(false);
      } else setError("The decision was not confirmed. Review the current request and try again.");
    } catch { setError("Could not send your decision. Try again."); }
    finally { inFlight.current = false; setBusy(false); }
  }

  if (!visible) return null;
  return <section className={`proc-permissions${compact ? " proc-permissions--minimized" : ""}`} aria-labelledby={compact ? undefined : titleId} ref={container}>
    <div className="proc-permissions__inner" data-morph-content>
    {compact ? <>
    <button type="button" className="proc-permissions__trigger proc-pill" data-review-trigger onClick={() => { moveFocus.current = true; setMinimized(false); setDismissed(false); setReceipt(undefined); }}><ShieldCheck size={16} /><span>{uiText(waiting.length)} {uiText(" permission request")}{uiText(waiting.length === 1 ? "" : "s")}</span><span className="proc-permissions__count">{uiText("Review")}<ArrowRight size={12} /></span></button>
    </> : <>
    <div className="proc-permissions__bar" data-panel-reveal>
      <span id={titleId}><ShieldCheck size={13} aria-hidden="true" />{uiText(receipt ? uiText("Your decision") : uiText("Permission request"))}{waiting.length > 0 && <span className="proc-permissions__number">{uiText(waiting.length)} {uiText(" waiting")}</span>}</span>
      <button type="button" className="proc-icon-button" aria-label={uiText(receipt && !node ? uiText("Dismiss decision") : uiText("Minimize permission requests"))} disabled={busy} onClick={() => { moveFocus.current = true; if (!node) dismissReceipt(); else setMinimized(true); }}><Minus size={14} /></button>
    </div>
    <div className="proc-permissions__content">
      {receipt ? <>
        <RequestCard node={receipt.node} doc={doc} engines={engines} simulated={simulated} decision={receipt.decision} onDecision={() => {}} />
        <div className="proc-permissions__after"><p>{uiText(receipt.decision === "approve" ? uiText("Allowed for this run. Future runs will ask again.") : uiText("This block and its sub-tasks will not run."))}</p>
          {node ? <button type="button" className="proc-button proc-button--small" onClick={() => pick(node.id)}>{uiText("Next request")}<ArrowRight size={12} /></button> : <button type="button" className="proc-icon-button" aria-label={uiText("Dismiss decision")} onClick={dismissReceipt}><X size={14} /></button>}
        </div>
      </> : node && <>
        {waiting.length > 1 && <nav className="proc-permissions__queue" aria-label={uiText("Pending permission requests")}><span>{uiText("Request ")}{uiText(index + 1)} {uiText(" of ")}{uiText(waiting.length)}</span><button type="button" className="proc-icon-button" aria-label={uiText("Previous request")} disabled={busy || index === 0} onClick={() => pick(waiting[index - 1].id)}><ChevronLeft size={14} /></button><button type="button" className="proc-icon-button" aria-label={uiText("Next request")} disabled={busy || index === waiting.length - 1} onClick={() => pick(waiting[index + 1].id)}><ChevronRight size={14} /></button></nav>}
        <RequestCard key={node.id} node={node} doc={doc} engines={engines} simulated={simulated} reason={snapshot.nodes[node.id].ask} busy={busy} error={error} onDecision={decision => void decide(decision)} />
        <button type="button" className="proc-permissions__locate" disabled={busy} onClick={() => { moveFocus.current = true; setMinimized(true); onLocate(node.id); }}>{uiText("Show ")}{node.name} {uiText(" in ")}{doc.name}<ArrowRight size={12} /></button>
      </>}
    </div>
    <span className="proc-sr" role="status">{uiText(waiting.length ? uiText("{0} permission request{1} waiting for your decision.", [waiting.length, waiting.length === 1 ? " is" : "s are"]) : uiText("No permission requests waiting."))}</span>
    </>}
    </div>
  </section>;
}
