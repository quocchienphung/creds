"use client";

import { animate, useMotionValue, useMotionValueEvent, useReducedMotion } from "motion/react";
import { Check, CircleAlert, Database, FileText, Globe, Mail, Shield, ShieldCheck, Square, X } from "lucide-react";
import { Children, isValidElement, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ButtonHTMLAttributes, ReactElement, ReactNode } from "react";
import { Mark } from "../affectui-agent-tree/tree-marks";
import { TIMING } from "./orchestrator-model.ts";
import type { MarkName } from "./orchestrator-model.ts";
import type { ToolId, ToolStatus } from "./tool-call-model.ts";
import { useOrchestratorCopy } from "./OrchestratorI18n";

/** One piece of text that streams: a chunk of a few words every 36 ms, each fading in over 150 ms (the delay is on the chunk, so nothing renders per frame). */
export function chunkify(text: string): string[] {
  const words = text.split(/(?<=\s)/);
  const chunks: string[] = [];
  let current = "";
  for (const word of words) { current += word; if (current.length >= 16) { chunks.push(current); current = ""; } }
  if (current) chunks.push(current);
  return chunks;
}
export function Chunks({ text, delay = 0, animated = true }: { text: string; delay?: number; animated?: boolean }) {
  const reduced = useReducedMotion();
  const chunks = chunkify(text);
  if (!animated || reduced) return <>{text}</>;
  return <>{chunks.map((chunk, index) => <span key={index} className="op-chunk" style={{ animationDelay: `${delay + index * TIMING.chunk}ms` }}>{chunk}</span>)}</>;
}

/**
 * The workspace's own "Interface motion" setting marks an ancestor with data-ui-motion="off". It is read from the document once and kept: a MutationObserver
 * updates it when the attribute changes, so rendering (which asks very often) never queries the DOM.
 */
let motionSetOff = false;
const motionListeners = new Set<() => void>();
let motionObserver: MutationObserver | null = null;
function subscribeMotion(callback: () => void) {
  if (!motionObserver) {
    motionSetOff = document.querySelector('[data-ui-motion="off"]') !== null;
    motionObserver = new MutationObserver(() => {
      const next = document.querySelector('[data-ui-motion="off"]') !== null;
      if (next !== motionSetOff) { motionSetOff = next; motionListeners.forEach(listener => listener()); }
    });
    motionObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-ui-motion"], subtree: true });
  }
  motionListeners.add(callback);
  return () => { motionListeners.delete(callback); if (!motionListeners.size) { motionObserver?.disconnect(); motionObserver = null; } };
}
const readMotionOff = () => motionSetOff;

/** True when motion should be off: the system asks for less, or the workspace's interface motion is off. */
export function useMotionOff(): boolean {
  const reduced = useReducedMotion();
  const setOff = useSyncExternalStore(subscribeMotion, readMotionOff, () => false);
  return (reduced ?? false) || setOff;
}

/** A swap of one text for another: the old one fades out in 100 ms while the new one fades in over 160 ms from 2 px below. */
export function Swap({ id, children, className, onWidth }: { id: string | number; children: ReactNode; className?: string; onWidth?: (width: number) => void }) {
  const off = useMotionOff();
  const [items, setItems] = useState<{ key: string | number; node: ReactNode; state: "rest" | "in" | "out" }[]>([{ key: id, node: children, state: "rest" }]);
  const [seen, setSeen] = useState(id);
  if (seen !== id) {
    setSeen(id);
    setItems(list => off ? [{ key: id, node: children, state: "rest" }] : [...list.filter(item => item.state !== "out").map(item => ({ ...item, state: "out" as const })), { key: id, node: children, state: "in" }]);
  }
  useEffect(() => {
    if (!items.some(item => item.state === "out")) return;
    const timer = window.setTimeout(() => setItems(list => list.filter(item => item.state !== "out").map(item => ({ ...item, state: "rest" as const }))), 130);
    return () => window.clearTimeout(timer);
  }, [items]);
  return <span className={["op-swap", className].filter(Boolean).join(" ")}>
    {items.map((item, index) => {
      const current = index === items.length - 1;
      return <SwapItem key={item.key} state={item.state} onWidth={current ? onWidth : undefined}>{current ? children : item.node}</SwapItem>;
    })}
  </span>;
}
function SwapItem({ state, onWidth, children }: { state: "rest" | "in" | "out"; onWidth?: (width: number) => void; children: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || !onWidth) return;
    const read = () => onWidth(element.getBoundingClientRect().width);
    read();
    const observer = new ResizeObserver(read);
    observer.observe(element);
    return () => observer.disconnect();
  }, [onWidth]);
  return <span ref={ref} className={state === "in" ? "op-swap__in" : state === "out" ? "op-swap__out" : undefined} style={onWidth ? { justifySelf: "start", width: "max-content" } : undefined}>{children}</span>;
}

/** A button label that morphs: the width springs (stiffness 340, damping 48) while the text swaps. */
export function LabelSlot({ id, children }: { id: string; children: ReactNode }) {
  const off = useMotionOff();
  const slot = useRef<HTMLSpanElement>(null);
  const width = useMotionValue(0);
  const measured = useRef(false);
  // stable, so the measuring effect of the label inside runs when the label changes and not on every render of the page
  const onWidth = useCallback((target: number) => {
    const element = slot.current;
    if (!element || target <= 0) return;
    if (!measured.current || off) { measured.current = true; width.set(target); element.style.width = `${target}px`; return; }
    element.setAttribute("data-morphing", "");
    animate(width, target, { type: "spring", stiffness: 340, damping: 48, onUpdate: value => { element.style.width = `${value}px`; }, onComplete: () => element.removeAttribute("data-morphing") });
  }, [off, width]);
  return <span ref={slot} className="op-btn__slot"><Swap id={id} onWidth={onWidth}><span className="op-btn__content">{children}</span></Swap></span>;
}

/** A number that counts to each new value (200 ms, expo out) and writes its text straight to the DOM, so a busy run does not re-render around it. */
export function Count({ value, format, className }: { value: number; format: (value: number) => string; className?: string }) {
  const off = useMotionOff();
  const ref = useRef<HTMLSpanElement>(null);
  const motion = useMotionValue(value);
  useEffect(() => {
    if (off) { motion.set(value); return; }
    const controls = animate(motion, value, { duration: 0.2, ease: [0.22, 1, 0.36, 1] });
    return () => controls.stop();
  }, [value, off, motion]);
  useMotionValueEvent(motion, "change", latest => { if (ref.current) ref.current.textContent = format(latest); });
  return <span ref={ref} className={className}>{format(value)}</span>;
}

/** The sweep of a calm band across a label while something runs. */
export function TextShimmer({ children, active = true }: { children: ReactNode; active?: boolean }) {
  return <span className="op-shimmer" data-state={active ? "active" : "idle"} aria-busy={active || undefined}><span className="op-shimmer__label">{children}</span></span>;
}

export function Button({ tone = "secondary", size = "md", iconOnly, className, children, ...rest }: { tone?: "primary" | "secondary" | "ghost"; size?: "sm" | "md"; iconOnly?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={["op-btn", className].filter(Boolean).join(" ")} data-tone={tone} data-size={size} data-icon-only={iconOnly ? "" : undefined} {...rest}>{children}</button>;
}

/** The segmented control: a pill slides to the chosen option on a critically damped spring (stiffness 160, damping 25.6, measured). Arrows, Home and End choose. */
export function SegmentedControl({ options, value, onChange, label }: { options: { value: number; label: string }[]; value: number; onChange: (value: number) => void; label: string }) {
  const t = useOrchestratorCopy();
  const off = useMotionOff();
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const [layout, setLayout] = useState<{ left: number; width: number } | null>(null);
  const left = useMotionValue(0), width = useMotionValue(0);
  const first = useRef(true);
  const pillRef = useRef<HTMLSpanElement>(null);
  const optionsKey = options.map(option => `${option.value}:${t(option.label)}`).join("|");
  useLayoutEffect(() => {
    const index = options.findIndex(option => option.value === value);
    const button = refs.current[index];
    if (!button) return;
    const target = { left: button.offsetLeft, width: button.offsetWidth };
    setLayout(previous => (previous && previous.left === target.left && previous.width === target.width ? previous : target));
    if (first.current || off) { first.current = false; left.set(target.left); width.set(target.width); return; }
    const spring = { type: "spring" as const, stiffness: 160, damping: 25.6 };
    const a = animate(left, target.left, spring), b = animate(width, target.width, spring);
    return () => { a.stop(); b.stop(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `options` is read through its key: a new array with the same options is not a change
  }, [value, optionsKey, off, left, width]);
  useMotionValueEvent(left, "change", latest => { if (pillRef.current) pillRef.current.style.transform = `translateX(${latest}px)`; });
  useMotionValueEvent(width, "change", latest => { if (pillRef.current) pillRef.current.style.width = `${latest}px`; });
  const choose = (next: number) => { onChange(next); window.requestAnimationFrame(() => refs.current[options.findIndex(option => option.value === next)]?.focus({ preventScroll: true })); };
  return <div className="op-seg" role="group" aria-label={t(label)}>
    <div className="op-seg__track" style={{ position: "relative" }}>
      <span ref={pillRef} className="op-seg__selection" aria-hidden="true" style={{ zIndex: 0, inset: "auto", top: 3, bottom: 3, left: 0, width: layout?.width ?? 0, transform: `translateX(${layout?.left ?? 0}px)`, borderRadius: "calc(var(--radius-control) - 4px)", opacity: layout ? 1 : 0 }} data-id={id} />
      {options.map((option, index) => <button key={option.value} ref={element => { refs.current[index] = element; }} type="button" className="op-seg__button" data-value={option.value} aria-pressed={option.value === value} tabIndex={option.value === value ? 0 : -1}
        onClick={() => onChange(option.value)}
        onKeyDown={event => {
          const at = options.findIndex(item => item.value === value);
          if (event.key === "ArrowRight" || event.key === "ArrowUp") { event.preventDefault(); choose(options[Math.min(options.length - 1, at + 1)].value); }
          else if (event.key === "ArrowLeft" || event.key === "ArrowDown") { event.preventDefault(); choose(options[Math.max(0, at - 1)].value); }
          else if (event.key === "Home") { event.preventDefault(); choose(options[0].value); }
          else if (event.key === "End") { event.preventDefault(); choose(options[options.length - 1].value); }
        }}><span className="op-seg__label" style={{ zIndex: 1 }}>{t(option.label)}</span></button>)}
    </div>
  </div>;
}

// ------------------------------------------------------------------ marks and glyphs

const MODEL_MARK: Record<MarkName, "anthropic" | "gemini" | "openai"> = { claude: "anthropic", gemini: "gemini", openai: "openai" };
export function ModelMark({ mark }: { mark: MarkName }) {
  return <span className={mark === "claude" ? "ob__claude" : undefined} style={{ display: "contents" }}><Mark id={MODEL_MARK[mark]} /></span>;
}
export function ToolMarkIcon({ tool }: { tool: ToolId }) {
  switch (tool) {
    case "github": return <Mark id="github" />;
    case "slack": return <Mark id="slack" />;
    case "web": return <Globe strokeWidth={1.75} aria-hidden="true" />;
    case "files": return <FileText strokeWidth={1.75} aria-hidden="true" />;
    case "postgres": return <Database strokeWidth={1.75} aria-hidden="true" />;
    case "gmail": return <Mail strokeWidth={1.75} aria-hidden="true" />;
    case "linear": return <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M3 9.2 6.8 13M3.6 6.6 9.4 12.4M5.4 4.4l6.2 6.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>;
  }
}
/** The marks of the status glyphs: a spinner, an idle ring, a dashed ring, a clock, a done disc, an error disc, a stop square. */
export function Glyph({ kind, progress = 0 }: { kind: "spin" | "idle" | "queued" | "clock" | "done" | "error" | "stop" | "arc"; progress?: number }) {
  switch (kind) {
    case "spin": return <svg viewBox="0 0 16 16" className="op-spin" aria-hidden="true"><circle cx="8" cy="8" r="6.25" className="op-glyph-track" /><path d="M8 1.75a6.25 6.25 0 0 1 6.25 6.25" className="op-glyph-arc" /></svg>;
    case "idle": return <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.25" className="op-glyph-idle" /></svg>;
    case "queued": return <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.25" className="op-glyph-queued" /></svg>;
    case "clock": return <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.25" className="op-glyph-idle" /><path d="M8 4.6V8l2.2 1.4" className="op-glyph-hands" /></svg>;
    case "done": return <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" className="op-glyph-done" /><path d="M5 8.2 7.1 10.3 11 6" className="op-glyph-ink" /></svg>;
    case "error": return <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" className="op-glyph-error" /><path d="M8 4.9v3.6" className="op-glyph-ink" /><circle cx="8" cy="11.1" r=".95" className="op-glyph-inkdot" /></svg>;
    case "stop": return <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="4.5" y="4.5" width="7" height="7" rx="1.5" className="op-glyph-idle" style={{ fill: "var(--text-muted)", stroke: "none" }} /></svg>;
    case "arc": { const circumference = 2 * Math.PI * 6.25; return <svg viewBox="0 0 16 16" aria-hidden="true" style={{ transform: "rotate(-90deg)" }}><circle cx="8" cy="8" r="6.25" className="op-glyph-track" /><circle cx="8" cy="8" r="6.25" className="op-glyph-arc" strokeDasharray={`${circumference * progress} ${circumference}`} /></svg>; }
  }
}
export const ToolStatusIcon = ({ status }: { status: ToolStatus }) => {
  switch (status) {
    case "running": return <Glyph kind="spin" />;
    case "success": return <Check strokeWidth={2} aria-hidden="true" />;
    case "error": return <CircleAlert strokeWidth={1.75} aria-hidden="true" />;
    case "approval": return <ShieldCheck strokeWidth={1.75} aria-hidden="true" />;
    case "denied": return <Shield strokeWidth={1.75} aria-hidden="true" />;
  }
};
export const IconX = X;
export const IconStop = Square;

/** First child element of a node (used to read the single icon a caller passes). */
export const onlyChild = (node: ReactNode): ReactElement | null => { const only = Children.toArray(node)[0]; return isValidElement(only) ? only : null; };
