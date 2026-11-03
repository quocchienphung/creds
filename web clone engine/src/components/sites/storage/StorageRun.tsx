"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useId, useState, type ReactNode } from "react";
import { Check, ChevronDown, Circle, Database, FileCheck2, FileInput, FileSearch, Hand, ListChecks, LoaderCircle, RotateCcw, Search, Square, TriangleAlert } from "lucide-react";
import "./storage-run.css";

export type StorageRunStatus = "idle" | "running" | "review" | "completed" | "error" | "stopped";
export interface StorageRunStep {
  id: string;
  label: string;
  detail: string;
  status: "pending" | "running" | "completed" | "error";
  meta?: string;
}
export interface StorageRunProps {
  status: StorageRunStatus;
  fileCount: number;
  steps: StorageRunStep[];
  onStop?: () => void;
  onRetry?: () => void;
  children?: ReactNode;
  description?: string;
}

const statusLabels: Record<StorageRunStatus, string> = { idle: "Ready", running: "Processing", review: "Waiting for you", completed: "Complete", error: "Needs attention", stopped: "Stopped" };
const stageIcons = [FileInput, FileCheck2, FileSearch, Search, Database, ListChecks];

export function StorageRun({ status, fileCount, steps, onStop, onRetry, children, description }: StorageRunProps) {
  const { t: uiText } = useWorkspaceI18n();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const id = useId();
  const done = steps.filter(step => step.status === "completed").length;
  const progress = steps.length ? Math.round(done / steps.length * 100) : 0;
  const activeStep = steps.find(step => step.status === "running" || step.status === "error");
  const statusIcon = status === "running" ? <LoaderCircle size={13} className="storage-run__spinner" /> : status === "review" ? <Hand size={13} /> : status === "completed" ? <Check size={13} /> : status === "error" ? <TriangleAlert size={13} /> : <Circle size={10} />;
  const currentDescription = description ?? activeStep?.label ?? (status === "review" ? "Review extracted content before storing your originals." : status === "completed" ? "Documents stored. Ready to explore." : status === "stopped" ? "Processing stopped. You can retry this batch." : status === "idle" ? "Add documents to start a processing run." : `${done} of ${steps.length} steps complete`);
  return <section className="storage-run" aria-labelledby={`${id}-title`} data-status={status}>
    <header className="storage-run__header">
      <div className="storage-run__title-row">
        <h2 id={`${id}-title`}>{uiText(status === "idle" ? uiText("Document processing") : uiText("Process {0} document{1}", [fileCount, fileCount === 1 ? "" : "s"]))}</h2>
        {status === "running" && onStop && <button className="storage-run__icon-button" type="button" onClick={onStop} aria-label={uiText("Stop document processing")} title={uiText("Stop processing")}><Square size={14} /></button>}
        {(status === "error" || status === "stopped") && onRetry && <button className="storage-run__retry" type="button" onClick={onRetry}><RotateCcw size={14} />{uiText("Retry")}</button>}
      </div>
      <div className="storage-run__meta"><span className="storage-run__engine"><Database size={14} />{uiText("Local document engine")}</span><span className="storage-run__status" role="status">{uiText(statusIcon)}{uiText(statusLabels[status])}</span></div>
    </header>
    <div className="storage-run__body">
      <ol className="storage-run__steps">{steps.map((step, index) => {
        const Icon = stageIcons[index % stageIcons.length];
        const isExpanded = expanded.has(step.id);
        return <li className="storage-run__step" key={step.id} data-status={step.status}>
          <button type="button" className="storage-run__step-head" aria-expanded={isExpanded} aria-controls={`${id}-detail-${index}`} onClick={() => setExpanded(current => { const next = new Set(current); if (next.has(step.id)) next.delete(step.id); else next.add(step.id); return next; })}>
            <span className="storage-run__step-icon">{step.status === "running" ? <LoaderCircle size={16} className="storage-run__spinner" /> : <Icon size={16} />}</span>
            <span className="storage-run__step-label">{uiText(step.label)}</span>
            {step.meta && <span className="storage-run__step-meta">{uiText(step.meta)}</span>}
            <span className="storage-run__step-state" aria-label={uiText(step.status)}>{step.status === "completed" ? <Check size={14} /> : step.status === "error" ? <TriangleAlert size={14} /> : <span className="storage-run__state-dot" />}</span>
            <ChevronDown size={15} className="storage-run__chevron" />
          </button>
          <div id={`${id}-detail-${index}`} className="storage-run__detail" hidden={!isExpanded}><p>{uiText(step.detail)}</p></div>
        </li>;
      })}</ol>
      {!steps.length && <p className="storage-run__empty">{uiText("Add documents to start a processing run.")}</p>}
    </div>
    {children && <div className="storage-run__review">{children}</div>}
    <footer className="storage-run__footer">
      <div className="storage-run__progress" role="progressbar" aria-label={uiText("Document processing progress")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: `${progress}%` }} /></div>
      <div className="storage-run__footnote"><span>{uiText(currentDescription)}</span><span>{uiText(progress)}%</span></div>
    </footer>
    <span className="storage-run__sr" aria-live="polite" aria-atomic="true">{uiText(statusLabels[status])}. {uiText(currentDescription)}</span>
  </section>;
}
