"use client";

import { motion } from "motion/react";
import { Check, ChevronDown, Copy } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AUTO_COLLAPSE_MS, FOLD, ROW_STAGGER, TOOL_NAME, TOOL_SPRING, allSettled, copyText, foldedCount, groupHeader, groupStartsOpen, jsonLines, needsDecision, summaryOf, titleOf } from "./tool-call-model.ts";
import type { ToolCallData, ToolOutput, ToolValue } from "./tool-call-model.ts";
import { formatDuration } from "./orchestrator-model.ts";
import { Button, Swap, TextShimmer, ToolMarkIcon, ToolStatusIcon, useMotionOff } from "./parts";
import { useOrchestratorCopy } from "./OrchestratorI18n";
import type { Translate } from "../i18n/translate";

export interface ToolCallHandlers { onApprove?: (call: ToolCallData) => void; onDeny?: (call: ToolCallData) => void; onRetry?: (call: ToolCallData) => void }

// ---------------------------------------------------------------- outputs

function Json({ lines }: { lines: string[] }) {
  return <pre className="tc-json">{lines.map((line, index) => <span key={index} className="tc-json__line" aria-hidden={index >= FOLD.jsonLines ? true : undefined}>{highlight(line)}</span>)}</pre>;
}
const TOKEN = /("(?:[^"\\]|\\.)*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b/g;
function highlight(line: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let last = 0, key = 0;
  for (const match of line.matchAll(TOKEN)) {
    const at = match.index ?? 0;
    if (at > last) parts.push(line.slice(last, at));
    if (match[1] !== undefined) { parts.push(<span key={key++} className={match[2] ? "tc-json__key" : "tc-json__string"}>{match[1]}</span>); if (match[2]) parts.push(match[2]); }
    else if (match[3] !== undefined) parts.push(<span key={key++} className="tc-json__number">{match[3]}</span>);
    else parts.push(<span key={key++} className="tc-json__literal">{match[4]}</span>);
    last = at + match[0].length;
  }
  if (last < line.length) parts.push(line.slice(last));
  return parts;
}

function OutputView({ output, expanded }: { output: ToolOutput; expanded: boolean }) {
  const t = useOrchestratorCopy();
  switch (output.type) {
    case "text": return <p className="tc-text">{t(output.text)}</p>;
    case "list": return <ul className="tc-list">{output.items.map((item, index) => <li key={index} className="tc-list__row"><span className="tc-list__lead">{item.lead}</span><span className="tc-list__title">{t(item.title)}</span><span className="tc-list__tag">{t(item.tag ?? "")}</span></li>)}</ul>;
    case "table": {
      const rows = expanded ? output.rows : output.rows.slice(0, FOLD.tableRows);
      return <div className="tc-table-scroll"><table className="tc-table"><thead><tr>{output.columns.map(column => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, at) => <td key={at}>{String(cell)}</td>)}</tr>)}</tbody></table></div>;
    }
    case "json": { const lines = jsonLines(output.value); return <Json lines={expanded ? lines : lines.slice(0, FOLD.jsonLines)} />; }
  }
}

function CopyButton({ label, text }: { label: string; text: string }) {
  const t = useOrchestratorCopy();
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return <Button tone="ghost" iconOnly className="tc-copy" aria-label={t(label)} data-copy-state={state}
    onClick={async () => { try { await navigator.clipboard.writeText(text); setState("copied"); } catch { setState("error"); } window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setState("idle"), 1800); }}>
    <span className="op-icon" aria-hidden="true"><Swap id={state}><span data-state={state}>{state === "copied" ? <Check size={16} strokeWidth={2} /> : <Copy size={16} strokeWidth={1.75} />}</span></Swap></span>
    <span className="tc-sr" role="status" aria-live="polite">{t(state === "copied" ? "Copied" : state === "error" ? "Copy failed" : "")}</span>
  </Button>;
}

function Section({ label, copy, children }: { label: string; copy: string; children: ReactNode }) {
  const t = useOrchestratorCopy();
  return <div className="tc-section" role="group" aria-label={t(label)}>
    <div className="tc-section__head"><span className="tc-section__label" aria-hidden="true">{t(label)}</span><CopyButton label={`Copy ${label.toLowerCase()}`} text={copy} /></div>
    {children}
  </div>;
}

function Well({ output }: { output: ToolOutput }) {
  const t = useOrchestratorCopy();
  const folded = foldedCount(output);
  const [expanded, setExpanded] = useState(false);
  return <div className="tc-well">
    <div className="tc-fold"><OutputView output={output} expanded={expanded} /></div>
    {folded > 0 && <button type="button" className="tc-more" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>
      <ChevronDown className="tc-more__icon" data-open={expanded ? "" : undefined} size={14} strokeWidth={1.75} aria-hidden="true" />{expanded ? t("Show less") : t(output.type === "table" ? "Show {0} more rows" : "Show {0} more lines", [folded])}
    </button>}
  </div>;
}

function Kv({ input }: { input: Record<string, ToolValue> }) {
  return <div className="tc-well"><dl className="tc-kv">{Object.entries(input).map(([key, value]) => <div key={key} className="tc-kv__row"><dt>{key}</dt><dd>{String(value)}</dd></div>)}</dl></div>;
}

// ---------------------------------------------------------------- one call

function displaySummary(call: ToolCallData, t: Translate): string | undefined {
  if (call.summary !== undefined) return t(call.summary);
  const output = call.output;
  if (output?.type === "list") return t(output.items.length === 1 ? "{0} result" : "{0} results", [output.items.length]);
  if (output?.type === "table") return t(output.rows.length === 1 ? "{0} row" : "{0} rows", [output.rows.length]);
  if (output?.type === "json" && output.value && typeof output.value === "object") {
    const count = Object.keys(output.value).length;
    return t(count === 1 ? "{0} field" : "{0} fields", [count]);
  }
  return summaryOf(call);
}

export function ToolCall({ call, flush = false, handlers = {}, open: controlled, onOpenChange, defaultOpen = false }: { call: ToolCallData; flush?: boolean; handlers?: ToolCallHandlers; open?: boolean; onOpenChange?: (open: boolean) => void; defaultOpen?: boolean }) {
  const t = useOrchestratorCopy();
  const off = useMotionOff();
  const id = useId();
  const [inner, setInner] = useState(defaultOpen);
  const open = controlled ?? inner;
  // the body (Input and Output) is built the first time the row opens and kept after, so a long transcript does not carry every closed body
  const [built, setBuilt] = useState(defaultOpen);
  if (open && !built) setBuilt(true);
  const toggle = () => { const next = !open; if (controlled === undefined) setInner(next); onOpenChange?.(next); };
  const title = t(titleOf(call)), tool = t(TOOL_NAME[call.tool]);
  const summary = displaySummary(call, t);
  const settled = call.status === "success";
  const spoken = call.status === "running" ? `${tool}: ${title}` : call.status === "success" ? `${tool}: ${t(call.title)}, ${summary ? `${summary}, ` : ""}${call.durationMs ? formatDuration(call.durationMs) : ""}` : call.status === "error" ? `${tool}: ${t(call.title)}. ${t(call.message ?? "")}` : call.status === "approval" ? `${tool}: ${t(call.title)}. ${t("Needs approval")}` : `${tool}: ${t(call.title)}. ${t("Denied, it never ran")}`;
  const aside = call.status === "approval" ? "approval" : call.status === "error" && call.retryable ? "retry" : settled && (summary || call.durationMs) ? "meta" : call.status === "denied" ? "denied" : "none";
  return <div className={["tc-call", flush ? "tc-flush" : "tc-standalone"].join(" ")} data-status={call.status} data-open={open ? "" : undefined}>
    <div className="tc-headclip"><div className="tc-head">
      <button type="button" className="tc-toggle" aria-expanded={open} aria-controls={id} aria-label={t("{0}. {1} input and output", [spoken, t(open ? "Hide" : "Show")])} onClick={toggle} />
      <span className="tc-mark" aria-hidden="true"><ToolMarkIcon tool={call.tool} /></span>
      <span className="tc-title" aria-hidden="true"><Swap id={call.status === "running" ? "running" : "title"}><span className="tc-title__text"><span><span><TextShimmer active={call.status === "running"}>{title}</TextShimmer></span></span></span></Swap></span>
      {(call.status === "approval" || call.status === "error") && call.message && <span className="tc-note" aria-hidden="true">{t(call.message)}</span>}
      <span className="tc-aside"><Swap id={aside}><span className="tc-aside__inner">
        {aside === "meta" && <span className="tc-meta" aria-hidden="true">{summary && <span className="tc-meta__summary">{summary}<span className="tc-meta__dot"> · </span></span>}{call.durationMs !== undefined && <span>{formatDuration(call.durationMs)}</span>}</span>}
        {aside === "denied" && <span className="tc-meta" aria-hidden="true">{t("Denied")}</span>}
        {aside === "retry" && <span className="tc-actions"><Button size="sm" aria-label={t("Retry: {0}", [t(call.title)])} onClick={() => handlers.onRetry?.(call)}>{t("Retry")}</Button></span>}
        {aside === "approval" && <span className="tc-actions"><Button size="sm" aria-label={t("Deny: {0}", [t(call.title)])} onClick={() => handlers.onDeny?.(call)}>{t("Deny")}</Button><Button size="sm" className="tc-allow" tone="primary" aria-label={t("Allow: {0}", [t(call.title)])} onClick={() => handlers.onApprove?.(call)}>{t("Allow")}</Button></span>}
      </span></Swap></span>
      <span className="tc-status" aria-hidden="true"><Swap id={call.status}><span className="tc-status__icon" data-status={call.status}><ToolStatusIcon status={call.status} /></span></Swap></span>
      <span className="tc-sr">{call.status === "success" ? t("Done, {0}", [`${summary ? `${summary}, ` : ""}${call.durationMs ? formatDuration(call.durationMs) : ""}`]) : t(call.status === "approval" ? "Needs approval" : call.status === "error" ? "Failed" : call.status === "denied" ? "Denied" : "Running")}</span>
      <ChevronDown className="tc-chevron" size={16} strokeWidth={1.75} aria-hidden="true" />
    </div></div>
    <motion.div id={id} className="tc-bodyclip" initial={false} animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }} inert={!open}
      transition={off ? { duration: 0 } : { height: TOOL_SPRING, opacity: { duration: open ? 0.16 : 0.1, ease: open ? [0.16, 1, 0.3, 1] : [0.22, 1, 0.36, 1] } }}>
      <div className="tc-body">
        {built && call.input && <Section label="Input" copy={JSON.stringify(call.input, null, 2)}><Kv input={call.input} /></Section>}
        {built && call.output && <Section label="Output" copy={copyText(call.output)}><Well output={call.output} /></Section>}
        {built && !call.output && call.status === "error" && call.message && <Section label="Output" copy={call.message}><div className="tc-well"><p className="tc-text" style={{ color: "var(--foreground)" }}>{t(call.message)}</p></div></Section>}
        {built && !call.output && call.status === "running" && <div className="tc-section"><div className="tc-well"><p className="tc-text" style={{ color: "var(--text-muted)" }}>{t("Waiting for the result…")}</p></div></div>}
      </div>
    </motion.div>
    <span className="tc-sr" role="status" aria-live="polite">{spoken}</span>
  </div>;
}

// ---------------------------------------------------------------- a group of calls from one turn

export function ToolCallGroup({ calls, active, handlers = {}, defaultOpen, autoCollapse = true }: { calls: ToolCallData[]; active?: boolean; handlers?: ToolCallHandlers; defaultOpen?: boolean; autoCollapse?: boolean }) {
  const t = useOrchestratorCopy();
  const off = useMotionOff();
  const id = useId();
  const header = groupHeader(calls, active);
  const label = calls.some(call => call.status === "approval") ? t("Waiting for approval") : t(header.working ? (calls.length === 1 ? "Using {0} tool" : "Using {0} tools") : (calls.length === 1 ? "Used {0} tool" : "Used {0} tools"), [calls.length]);
  const meta = header.metaFailed ? t("{0} failed", [calls.filter(call => call.status === "error").length]) : header.meta;
  const [initialOpen] = useState(() => defaultOpen ?? groupStartsOpen(calls));
  /** what the person chose by pressing the header; until then the group opens and folds by itself */
  const [chosen, setChosen] = useState<boolean | null>(null);
  const [rowTouched, setRowTouched] = useState(false);
  /** how many calls there were when the group folded itself, so a new call opens it again */
  const [foldedAt, setFoldedAt] = useState<number | null>(null);
  const decision = needsDecision(calls), settled = allSettled(calls);
  // open while a call runs, waits for a decision or has failed; folded once every call has finished (until something new happens)
  const auto = decision || !settled ? true : foldedAt === calls.length ? false : initialOpen;
  const open = chosen ?? auto;
  // the group folds itself 450 ms after every call has finished, so the answer reads right under "Used 4 tools"
  useEffect(() => {
    if (!autoCollapse || !settled || chosen !== null || rowTouched || active) return;
    const timer = window.setTimeout(() => setFoldedAt(calls.length), AUTO_COLLAPSE_MS);
    return () => window.clearTimeout(timer);
  }, [settled, autoCollapse, active, chosen, rowTouched, calls.length]);
  return <div className="tc-group" data-open={open ? "" : undefined}>
    <div className="tc-group__head">
      <button type="button" className="tc-group__toggle" aria-expanded={open} aria-controls={id} onClick={() => setChosen(!open)}>
        <span className="tc-stack" aria-hidden="true">{header.stack.slice(0, 4).map(tool => <span key={tool} className="tc-stack__item"><span className="tc-stack__mark"><ToolMarkIcon tool={tool} /></span></span>)}</span>
        <span className="tc-group__label"><Swap id={header.label}><span><span><TextShimmer active={header.working}>{label}</TextShimmer></span></span></Swap></span>
        <span className="tc-group__meta" data-failed={header.metaFailed ? "" : undefined}><Swap id={header.meta}><span>{meta}</span></Swap></span>
        <ChevronDown className="tc-chevron" size={16} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </div>
    <motion.div id={id} className="tc-list-clip" initial={false} animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }} inert={!open}
      transition={off ? { duration: 0 } : { height: TOOL_SPRING, opacity: { duration: open ? 0.16 : 0.1 } }}>
      <div className="tc-calls">
        {calls.map((call, index) => <motion.div key={call.id} className="tc-item" initial={off ? false : { height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
          transition={off ? { duration: 0 } : { height: { ...TOOL_SPRING, delay: Math.min(index, 6) * ROW_STAGGER }, opacity: { duration: 0.16, ease: [0.16, 1, 0.3, 1], delay: Math.min(index, 6) * ROW_STAGGER } }}>
          <ToolCall call={call} flush handlers={handlers} onOpenChange={() => setRowTouched(true)} />
        </motion.div>)}
      </div>
    </motion.div>
  </div>;
}
