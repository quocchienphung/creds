"use client";

import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, type MotionStyle, type MotionValue } from "motion/react";
import { AlertCircle, Check, Pencil, RotateCcw, Square, Undo2 } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Button, EASE_STANDARD, TextShimmer } from "./primitives";
import { chunkWords, mulberry32 } from "./tldr-model";
import { FADE_OUT_MS, SPRING_BLOCK, STREAM_MS, arcAt, countEdits, distanceBetween, easeInOut, fillMs, findOccurrence, groupLines, patchRange, piece, pieceText, replaceRange, travelMs, type AgentCursorPhase, type AgentEdit, type DocBlock, type Piece, type Point } from "./agent-cursor-model";
import "./agent-cursor.css";

export type { AgentCursorPhase, AgentEdit, DocBlock };
export interface AgentCursorLabels {
  reading: string; stop: string; runAgain: string; ask: string; retry: string; undo: string; accept: string;
  ready: (count: number) => string; accepted: (count: number) => string; reverted: (count: number) => string; stoppedEarly: string; stoppedAfter: (count: number) => string;
  failed: string; empty: string; barCount: (count: number) => string; by: (name: string) => string; review: string; simulated: string;
  rewrite: string; insert: (type: DocBlock["type"]) => string; fix: string;
}
const DEFAULT_LABELS: AgentCursorLabels = {
  reading: "Reading the doc", stop: "Stop", runAgain: "Run again", ask: "Ask", retry: "Retry", undo: "Undo", accept: "Accept changes",
  ready: count => `${count} ${count === 1 ? "edit" : "edits"} ready for review`, accepted: count => `Accepted ${count} ${count === 1 ? "edit" : "edits"}`, reverted: count => `Undid ${count} ${count === 1 ? "edit" : "edits"}`,
  stoppedEarly: "Stopped before any edits", stoppedAfter: count => `Stopped after ${count} ${count === 1 ? "edit" : "edits"}`, failed: "Connection lost", empty: "Nothing to change",
  barCount: count => `${count} ${count === 1 ? "edit" : "edits"}`, by: name => `by ${name}`, review: "Review edits", simulated: "Simulated, nothing was saved.",
  rewrite: "Rewriting", insert: type => type === "heading" ? "Adding a heading" : "Adding a paragraph", fix: "Fixing a typo",
};
export interface AgentCursorProps {
  /** The document as title, heading and paragraph blocks with stable ids. Compared by content, so an inline array is fine. */
  blocks: DocBlock[];
  /** A muted line under the title. */
  meta?: string;
  /** Edits to play in order. Ignored when `run` is set. */
  edits?: AgentEdit[];
  /** Fetches edits from your agent. The signal aborts when someone presses Stop. A rejected promise shows the error with a Retry button. */
  run?: (signal: AbortSignal) => Promise<AgentEdit[]>;
  agent?: { name: string; mark?: ReactNode; color?: string };
  /** A human in the doc, drawn as a second cursor with their portrait and first name. Null hides it. */
  collaborator?: { name: string; avatar?: string; color?: string } | null;
  autoPlay?: boolean; loop?: boolean; speed?: number;
  onAccept?: (blocks: DocBlock[]) => void; onUndo?: (blocks: DocBlock[]) => void; onPhaseChange?: (phase: AgentCursorPhase) => void;
  simulated?: boolean;
  /** What the document is called to assistive technology. */
  title?: string;
  /** How a row-like block breaks into text (drawn as it is: long unbroken text wraps anywhere). */
  labels?: Partial<AgentCursorLabels>;
  className?: string;
}

interface BlockView { id: string; type: DocBlock["type"]; pieces: Piece[]; fading: boolean; added: boolean; removing: boolean }
interface Rect { left: number; top: number; width: number; height: number }
type StatusKind = "reading" | "step" | "ready" | "accepted" | "reverted" | "stopped" | "failed" | "empty" | "idle";
interface Status { key: string; kind: StatusKind; label: string }
const AGENT_MARK = <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d="M8 1.5v13M1.5 8h13M3.4 3.4l9.2 9.2M12.6 3.4l-9.2 9.2" /></svg>;
const viewOf = (blocks: readonly DocBlock[]): BlockView[] => blocks.map(block => ({ id: block.id, type: block.type, pieces: [piece(block.text)], fading: false, added: false, removing: false }));
const blocksOf = (view: readonly BlockView[]): DocBlock[] => view.filter(item => !item.removing).map(item => ({ id: item.id, type: item.type, text: pieceText(item.pieces) }));
const nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

/** A block's height follows its content on a bounce-free spring (0.24 s); an inserted block grows from zero, an undone one folds back to it. */
function Fit({ block, reduce, busy, children }: { block: BlockView; reduce: boolean; busy: (delta: number) => void; children: ReactNode }) {
  const height = useMotionValue(0);
  const inner = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"auto" | "fixed">(block.added ? "fixed" : "auto");
  const first = useRef(true);
  useLayoutEffect(() => {
    const node = inner.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    let controls: ReturnType<typeof animate> | null = null, running = false;
    const finishRun = () => { if (running) { running = false; busy(-1); } };
    const apply = () => {
      const target = block.removing ? 0 : node.offsetHeight;
      controls?.stop();
      if (first.current) {
        first.current = false;
        if (!block.added || reduce) { height.set(target); setMode(block.removing ? "fixed" : "auto"); return; }
        height.set(0); setMode("fixed");
      }
      if (Math.abs(height.get() - target) < 0.5 && !block.removing) { finishRun(); setMode("auto"); return; }
      setMode("fixed");
      if (!running) { running = true; busy(1); }
      controls = animate(height, target, { ...SPRING_BLOCK, onComplete: () => { finishRun(); if (!block.removing) setMode("auto"); } });
    };
    const observer = new ResizeObserver(apply);
    observer.observe(node);
    apply();
    return () => { observer.disconnect(); controls?.stop(); finishRun(); };
  }, [block.removing, block.added, reduce, height, busy]);
  return <motion.div className="ac-fit" data-clip={mode === "fixed" ? "" : undefined} style={mode === "fixed" ? { height } : undefined}><div ref={inner}>{children}</div></motion.div>;
}

/**
 * A document card where an AI agent edits live with a labelled cursor beside a human collaborator, then hands the changes over for review: its cursor
 * comes out of its avatar, selects a block and streams in a rewrite, adds a block, flags and fixes a word, and the changes stay tinted until someone
 * accepts or undoes them from a floating bar. Rebuilt from the open preview of UIArc's Agent cursor (a Pro component: DOM, declared CSS and a recording
 * of the rendered page's autoplay; docs/research/agent-cursor/). It edits what `edits` (or `run`) says and invents nothing.
 */
export function AgentCursor(props: AgentCursorProps) {
  const { blocks, meta, edits: editsProp, run, onAccept, onUndo, onPhaseChange, title, className } = props;
  const agent = { name: "Claude", color: "#D97757", ...props.agent };
  const collaboratorKey = JSON.stringify(props.collaborator === undefined ? "default" : props.collaborator);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the person is read through its content: an inline object is not a change
  const collaborator = useMemo<{ name: string; avatar?: string; color?: string } | null>(() => props.collaborator === undefined ? { name: "Emma" } : props.collaborator, [collaboratorKey]);
  const speed = props.speed && props.speed > 0 ? props.speed : 1, loop = props.loop ?? false, autoPlay = props.autoPlay ?? true;
  const simulated = props.simulated ?? false;
  const labels = useMemo<AgentCursorLabels>(() => ({ ...DEFAULT_LABELS, ...props.labels }), [props.labels]);
  const reduce = useReducedMotion() ?? false;
  const blocksKey = JSON.stringify(blocks), editsKey = JSON.stringify(editsProp ?? null);

  const [view, setViewState] = useState<BlockView[]>(() => viewOf(blocks));
  const viewRef = useRef(view);
  const setView = useCallback((next: BlockView[] | ((current: BlockView[]) => BlockView[])) => { const value = typeof next === "function" ? next(viewRef.current) : next; viewRef.current = value; setViewState(value); }, []);
  const [phase, setPhaseState] = useState<AgentCursorPhase>("idle");
  const [status, setStatus] = useState<Status>({ key: "idle", kind: "idle", label: "" });
  const [selection, setSelection] = useState<Rect[]>([]);
  const [caret, setCaret] = useState<string | null>(null);
  const [bar, setBar] = useState(false);
  const [docFading, setDocFading] = useState(false);
  const [announce, setAnnounce] = useState("");
  const [agentReady, setAgentReady] = useState(false);
  const [flip, setFlip] = useState({ agent: false, human: false });
  const [visible, setVisible] = useState(false);
  const [held, setHeld] = useState(false);
  const [count, setCount] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null), avatarRef = useRef<HTMLSpanElement>(null), acceptRef = useRef<HTMLButtonElement>(null);
  const textRefs = useRef(new Map<string, HTMLElement>()), selectionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const tagRefs = useRef<{ agent: HTMLSpanElement | null; human: HTMLSpanElement | null }>({ agent: null, human: null });
  const control = useRef<AbortController | null>(null);
  const applied = useRef<AgentEdit[]>([]), planned = useRef<AgentEdit[]>([]);
  const animating = useRef(0);
  const phaseRef = useRef<AgentCursorPhase>("idle");
  const latest = useRef({ speed, reduce, labels, simulated, onAccept, onUndo, onPhaseChange, run, editsProp, blocks, loop, collaborator, held, visible });
  useLayoutEffect(() => { latest.current = { speed, reduce, labels, simulated, onAccept, onUndo, onPhaseChange, run, editsProp, blocks, loop, collaborator, held, visible }; });
  const cursors = { agent: { x: useMotionValue(31), y: useMotionValue(28.5) }, human: { x: useMotionValue(412), y: useMotionValue(180) } } as Record<"agent" | "human", { x: MotionValue<number>; y: MotionValue<number> }>;
  const cursorsRef = useRef(cursors);
  useLayoutEffect(() => { cursorsRef.current = cursors; });

  const setPhase = useCallback((next: AgentCursorPhase) => { phaseRef.current = next; setPhaseState(next); latest.current.onPhaseChange?.(next); }, []);
  const announceStep = useCallback((text: string) => setAnnounce(latest.current.simulated ? `${text}. ${latest.current.labels.simulated}` : text), []);
  const busy = useCallback((delta: number) => { animating.current += delta; }, []);

  // ---- waiting that obeys the signal, the playback speed and the card being on screen
  const sleep = useCallback(async (ms: number, signal: AbortSignal) => {
    const wait = (time: number) => new Promise<void>(resolve => { if (signal.aborted) { resolve(); return; } const timer = setTimeout(done, time); function done() { clearTimeout(timer); signal.removeEventListener("abort", done); resolve(); } signal.addEventListener("abort", done, { once: true }); });
    await wait(latest.current.reduce ? Math.min(ms, 140) / latest.current.speed : ms / latest.current.speed);
    while (!signal.aborted && !latest.current.visible) await wait(120);
  }, []);
  const idle = useCallback(async (signal: AbortSignal) => { for (let i = 0; i < 80 && animating.current > 0 && !signal.aborted; i++) await sleep(16 * latest.current.speed, signal); }, [sleep]);

  // ---- geometry, measured from the live line boxes
  const relative = useCallback((rect: { left: number; top: number; width: number; height: number }): Rect => { const root = rootRef.current!.getBoundingClientRect(); return { left: rect.left - root.left, top: rect.top - root.top, width: rect.width, height: rect.height }; }, []);
  const rangeLines = useCallback((id: string, start?: number, end?: number): Rect[] => {
    const element = textRefs.current.get(id);
    if (!element) return [];
    const range = document.createRange();
    if (start === undefined || end === undefined) range.selectNodeContents(element);
    else {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let at = 0, startSet = false;
      for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
        const next = at + node.data.length;
        if (!startSet && start < next) { range.setStart(node, Math.max(0, start - at)); startSet = true; }
        if (startSet && end <= next) { range.setEnd(node, Math.max(0, end - at)); break; }
        at = next;
      }
      if (!startSet) return [];
    }
    return groupLines([...range.getClientRects()]).map(relative);
  }, [relative]);
  const avatarPoint = useCallback((): Point => { const rect = avatarRef.current?.getBoundingClientRect(), root = rootRef.current?.getBoundingClientRect(); return rect && root ? { x: rect.left - root.left + rect.width / 2 + 1, y: rect.top - root.top + rect.height / 2 + 0.5 } : { x: 31, y: 28.5 }; }, []);

  // ---- a cursor travels on a gentle arc, ease-in-out, 280 to 600 ms by distance
  const flipTag = useCallback((who: "agent" | "human", at: Point) => {
    const root = rootRef.current, tag = tagRefs.current[who];
    if (!root || !tag) return;
    const needs = at.x + 12 + tag.offsetWidth > root.clientWidth - 8;
    setFlip(current => current[who] === needs ? current : { ...current, [who]: needs });
  }, []);
  const travel = useCallback((who: "agent" | "human", to: Point, signal: AbortSignal, options: { ms?: number; linear?: boolean } = {}) => new Promise<void>(resolve => {
    const { x, y } = cursorsRef.current[who];
    const from = { x: x.get(), y: y.get() }, distance = distanceBetween(from, to);
    if (latest.current.reduce || distance < 0.5) { x.set(to.x); y.set(to.y); flipTag(who, to); resolve(); return; }
    const controls = animate(0, 1, { duration: (options.ms ?? travelMs(distance, latest.current.speed)) / 1000, ease: options.linear ? "linear" : easeInOut, onUpdate: t => { const point = options.linear ? { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t } : arcAt(from, to, t); x.set(point.x); y.set(point.y); }, onComplete: () => { flipTag(who, to); resolve(); } });
    signal.addEventListener("abort", () => { controls.stop(); resolve(); }, { once: true });
  }), [flipTag]);
  const place = useCallback((who: "agent" | "human", at: Point) => { const { x, y } = cursorsRef.current[who]; x.set(at.x); y.set(at.y); flipTag(who, at); }, [flipTag]);

  // ---- a selection fills line by line in step with the drag of the cursor
  const select = useCallback(async (lines: Rect[], signal: AbortSignal) => {
    if (!lines.length) return;
    setSelection(lines); await nextFrame(); await nextFrame();
    if (latest.current.reduce) { selectionRefs.current.forEach(node => { if (node) node.style.transform = "none"; }); return; }
    for (let index = 0; index < lines.length && !signal.aborted; index++) {
      const node = selectionRefs.current[index], line = lines[index], ms = fillMs(line.width, latest.current.speed);
      const cursor = travel("agent", { x: line.left + line.width, y: line.top + line.height / 2 }, signal, { ms, linear: true });
      await Promise.all([cursor, new Promise<void>(resolve => { if (!node) { resolve(); return; } const controls = animate(node, { transform: ["scaleX(0)", "scaleX(1)"] }, { duration: ms / 1000, ease: "linear" }); controls.then(() => { node.style.transform = "none"; resolve(); }); signal.addEventListener("abort", () => { controls.stop(); resolve(); }, { once: true }); })]);
    }
  }, [travel]);

  const patchBlock = useCallback((id: string, patch: (block: BlockView) => BlockView) => setView(current => current.map(block => block.id === id ? patch(block) : block)), [setView]);
  const textStart = useCallback((id: string): Point | null => { const line = rangeLines(id)[0]; return line ? { x: line.left, y: line.top + line.height / 2 } : null; }, [rangeLines]);
  const textEnd = useCallback((id: string): Point | null => { const lines = rangeLines(id), line = lines[lines.length - 1]; return line ? { x: line.left + line.width, y: line.top + line.height / 2 } : null; }, [rangeLines]);

  /** Stream `text` into a block, 3 to 6 words every 34 ms, each chunk fading in over 140 ms. */
  const stream = useCallback(async (id: string, text: string, signal: AbortSignal) => {
    patchBlock(id, block => ({ ...block, pieces: [] }));
    setCaret(id);
    if (latest.current.reduce) { patchBlock(id, block => ({ ...block, pieces: [piece(text, "tint", true)] })); return; }
    const chunks = chunkWords(text, mulberry32(text.length * 31 + 7), 3, 6);
    for (const chunk of chunks) {
      if (signal.aborted) return;
      patchBlock(id, block => ({ ...block, pieces: [...block.pieces, piece(chunk, "chunk", true)] }));
      await sleep(STREAM_MS, signal);
    }
  }, [patchBlock, sleep]);

  const playEdit = useCallback(async (edit: AgentEdit, signal: AbortSignal) => {
    const labelsNow = latest.current.labels;
    if (edit.type === "rewrite") {
      setStatus({ key: `step:${edit.label ?? labelsNow.rewrite}:${applied.current.length}`, kind: "step", label: edit.label ?? labelsNow.rewrite });
      await idle(signal);
      const start = textStart(edit.block);
      if (!start) return;
      await travel("agent", start, signal);
      await select(rangeLines(edit.block), signal);
      await sleep(220, signal);
      if (signal.aborted) return;
      patchBlock(edit.block, block => ({ ...block, fading: true }));
      await sleep(FADE_OUT_MS, signal);
      setSelection([]);
      await stream(edit.block, edit.text, signal);
      patchBlock(edit.block, block => ({ ...block, fading: false }));
      await sleep(120, signal);
      setCaret(null);
      const end = textEnd(edit.block);
      if (end && !signal.aborted) await travel("agent", { x: Math.min(end.x, (rootRef.current?.clientWidth ?? 600) - 40), y: end.y }, signal);
    } else if (edit.type === "insert") {
      const label = edit.label ?? labelsNow.insert(edit.block.type);
      setStatus({ key: `step:${label}:${applied.current.length}`, kind: "step", label });
      await idle(signal);
      const anchor = textEnd(edit.after) ?? textStart(edit.after);
      if (anchor) await travel("agent", { x: (textStart(edit.after)?.x ?? anchor.x), y: anchor.y + 22 }, signal);
      setView(current => { const at = current.findIndex(block => block.id === edit.after); const next = [...current]; next.splice(at < 0 ? next.length : at + 1, 0, { id: edit.block.id, type: edit.block.type, pieces: [], fading: false, added: true, removing: false }); return next; });
      await sleep(260, signal);
      const line = textStart(edit.block.id);
      if (line && !signal.aborted) await travel("agent", line, signal, { ms: 200 / latest.current.speed });
      await stream(edit.block.id, edit.block.text, signal);
      await sleep(140, signal);
      setCaret(null);
      const end = textEnd(edit.block.id);
      if (end && !signal.aborted) await travel("agent", { x: Math.min(end.x + 6, (rootRef.current?.clientWidth ?? 600) - 40), y: end.y }, signal);
    } else {
      setStatus({ key: `step:${edit.label ?? labelsNow.fix}:${applied.current.length}`, kind: "step", label: edit.label ?? labelsNow.fix });
      await idle(signal);
      const block = viewRef.current.find(item => item.id === edit.block);
      if (!block) return;
      const at = findOccurrence(pieceText(block.pieces), edit.find, edit.occurrence ?? 0);
      if (at < 0) return;
      patchBlock(edit.block, item => ({ ...item, pieces: patchRange(item.pieces, at, at + edit.find.length, { kind: "typo" }) }));
      await nextFrame(); await nextFrame();
      const lines = rangeLines(edit.block, at, at + edit.find.length);
      const first = lines[0];
      if (first) await travel("agent", { x: first.left, y: first.top + first.height / 2 }, signal);
      await sleep(260, signal);
      await select(lines, signal);
      await sleep(130, signal);
      if (signal.aborted) return;
      patchBlock(edit.block, item => ({ ...item, pieces: replaceRange(item.pieces, at, at + edit.find.length, { ...piece(edit.replace, "tint", true), key: -1 - applied.current.length }) }));
      setSelection([]);
      await sleep(160, signal);
    }
    if (!signal.aborted) applied.current.push(edit);
  }, [idle, patchBlock, rangeLines, select, setView, sleep, stream, textEnd, textStart, travel]);

  /** Back to the avatar: the cursor flies home and fades. */
  const goHome = useCallback(async (signal: AbortSignal) => { await travel("agent", avatarPoint(), signal); setAgentReady(false); }, [avatarPoint, travel]);

  /** The run is over, by itself or by Stop: what landed waits for review, or nothing landed and it says so. */
  const finish = useCallback((stoppedEarly: boolean) => {
    const total = countEdits(applied.current);
    setCount(total); setSelection([]); setCaret(null); setAgentReady(false);
    if (applied.current.length) {
      setPhase("review");
      const label = stoppedEarly ? latest.current.labels.stoppedAfter(total) : latest.current.labels.ready(total);
      setStatus({ key: "ready", kind: "ready", label }); announceStep(label); setBar(true);
    } else {
      setPhase("stopped");
      const label = latest.current.labels.stoppedEarly;
      setStatus({ key: "stopped", kind: "stopped", label }); announceStep(label); setBar(false);
    }
  }, [announceStep, setPhase]);

  /** A whole run: read, then each edit in order, then hand over for review. */
  const play = useCallback(async () => {
    control.current?.abort();
    const controller = new AbortController(); control.current = controller;
    const { signal } = controller;
    setBar(false); setSelection([]); setCaret(null); setDocFading(false);
    applied.current = []; setCount(0);
    setView(viewOf(latest.current.blocks));
    setPhase("thinking");
    setStatus({ key: "reading", kind: "reading", label: latest.current.labels.reading }); announceStep(latest.current.labels.reading);
    await nextFrame();
    place("agent", avatarPoint()); setAgentReady(true);
    try {
      let edits = latest.current.editsProp ?? [];
      const fetching = latest.current.run?.(signal);
      if (fetching) edits = await fetching;
      if (signal.aborted) { if (control.current === controller) finish(true); return; }
      planned.current = edits;
      if (!edits.length) { setAgentReady(false); setPhase("empty"); setStatus({ key: "empty", kind: "empty", label: latest.current.labels.empty }); announceStep(latest.current.labels.empty); return; }
      const first = viewRef.current.find(block => block.type === "paragraph") ?? viewRef.current[0];
      const reading = first ? rangeLines(first.id)[0] : undefined;
      if (reading) await travel("agent", { x: reading.left + Math.min(reading.width * 0.55, 180), y: reading.top + reading.height / 2 }, signal);
      await sleep(260, signal);
      if (signal.aborted) { if (control.current === controller) finish(true); return; }
      setPhase("editing");
      for (const edit of edits) { if (signal.aborted) break; await playEdit(edit, signal); }
      if (signal.aborted) { if (control.current === controller) finish(true); return; }
      await sleep(320, signal);
      await goHome(signal);
      if (signal.aborted) return;
      finish(false);
    } catch (error) {
      if (signal.aborted) return;
      setAgentReady(false); setSelection([]); setCaret(null); setBar(false);
      setPhase("error");
      const label = latest.current.labels.failed;
      setStatus({ key: "failed", kind: "failed", label });
      setAnnounce(`${label}${error instanceof Error && error.message ? `. ${error.message}` : ""}${latest.current.simulated ? ` ${latest.current.labels.simulated}` : ""}`);
    }
  }, [announceStep, avatarPoint, finish, goHome, place, playEdit, rangeLines, setPhase, setView, sleep, travel]);

  const stop = useCallback(() => { control.current?.abort(); }, []);
  const accept = useCallback(() => {
    if (phaseRef.current !== "review") return;
    setView(current => current.map(block => ({ ...block, pieces: block.pieces.map(item => ({ ...item, pending: false })) })));
    setBar(false); setPhase("accepted");
    const label = latest.current.labels.accepted(countEdits(applied.current));
    setStatus({ key: "accepted", kind: "accepted", label }); announceStep(label);
    latest.current.onAccept?.(blocksOf(viewRef.current));
  }, [announceStep, setPhase, setView]);
  /** Back to the document as given: text reverts at once, blocks the agent added fold back to nothing and are then dropped. */
  const reset = useCallback(() => {
    const original = new Map(viewOf(latest.current.blocks).map(block => [block.id, block]));
    setView(current => current.map(block => original.get(block.id) ?? { ...block, removing: true }));
    window.setTimeout(() => setView(current => current.filter(block => !block.removing)), 520);
  }, [setView]);
  const undo = useCallback(() => {
    if (phaseRef.current !== "review") return;
    const total = countEdits(applied.current);
    setBar(false); reset(); setPhase("reverted");
    const label = latest.current.labels.reverted(total);
    setStatus({ key: "reverted", kind: "reverted", label }); announceStep(label);
    latest.current.onUndo?.(latest.current.blocks.map(block => ({ ...block })));
  }, [announceStep, reset, setPhase]);

  // ---- on screen: the run starts (or restarts when the document or the edits change); off screen it waits
  useEffect(() => {
    const node = rootRef.current;
    if (!node || typeof IntersectionObserver === "undefined") { queueMicrotask(() => setVisible(true)); return; }
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.2 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const started = useRef<string | null>(null);
  useEffect(() => {
    if (!visible) return;
    const key = `${blocksKey}|${editsKey}|${run ? "run" : ""}`;
    if (!autoPlay) { if (started.current !== key) { started.current = key; control.current?.abort(); setView(viewOf(latest.current.blocks)); setPhase("idle"); setStatus({ key: "idle", kind: "idle", label: "" }); setBar(false); setAgentReady(false); } return; }
    if (started.current === key) return;
    started.current = key;
    void play();
  }, [visible, autoPlay, blocksKey, editsKey, run, play, setPhase, setView]);
  useEffect(() => () => { control.current?.abort(); }, []);

  // ---- the collaborator reads along: now and then the cursor drifts a few pixels; in a looping demo it accepts after a pause (never while the card is hovered or focused)
  useEffect(() => {
    if (!collaborator || reduce || !visible) return;
    const controller = new AbortController();
    void (async () => {
      const home = { x: cursorsRef.current.human.x.get(), y: cursorsRef.current.human.y.get() };
      for (let step = 0; !controller.signal.aborted; step++) {
        await sleep(2200 + (step * 613) % 900, controller.signal);
        if (controller.signal.aborted || phaseRef.current === "review" && latest.current.loop) continue;
        await travel("human", { x: home.x + ((step * 7) % 15) - 7, y: home.y + ((step * 5) % 9) - 4 }, controller.signal, { ms: 700 / latest.current.speed });
      }
    })();
    return () => controller.abort();
  }, [collaborator, reduce, visible, sleep, travel]);
  useEffect(() => {
    const person = latest.current.collaborator;
    if (!person || !loop || phase !== "review") return;
    const controller = new AbortController();
    void (async () => {
      await sleep(1350, controller.signal);
      while (!controller.signal.aborted && latest.current.held) await sleep(300, controller.signal);
      const button = acceptRef.current?.getBoundingClientRect(), root = rootRef.current?.getBoundingClientRect();
      if (controller.signal.aborted || !button || !root) return;
      await travel("human", { x: button.left - root.left + button.width / 2, y: button.top - root.top + button.height / 2 }, controller.signal);
      await sleep(140, controller.signal);
      if (controller.signal.aborted) return;
      accept();
      await sleep(1800, controller.signal);
      if (controller.signal.aborted) return;
      await travel("human", { x: (rootRef.current?.clientWidth ?? 600) - 260, y: 180 }, controller.signal);
      if (latest.current.held) return;
      await sleep(400, controller.signal);
      setDocFading(true); await sleep(140, controller.signal);
      reset(); await sleep(60, controller.signal); setDocFading(false);
      started.current = null; void play();
    })();
    return () => controller.abort();
  }, [phase, loop, accept, play, reset, sleep, travel]);
  useEffect(() => { const person = collaborator; if (person && rootRef.current) { const width = rootRef.current.clientWidth; place("human", { x: Math.max(120, width - 268), y: 180 }); } }, [collaborator, place]);

  const running = phase === "thinking" || phase === "editing";
  const doneCount = count;
  const action = running ? "stop" : phase === "error" ? "retry" : phase === "accepted" || phase === "reverted" || phase === "stopped" || phase === "empty" ? "again" : phase === "idle" && !autoPlay ? "ask" : null;
  const statusIcon = status.kind === "ready" ? <Pencil /> : status.kind === "accepted" ? <Check className="ac-success" /> : status.kind === "reverted" ? <Undo2 /> : status.kind === "stopped" ? <Square /> : status.kind === "failed" ? <AlertCircle className="ac-danger" /> : status.kind === "empty" ? <Pencil /> : null;
  const rerun = () => { started.current = null; void play(); };
  const startPlay = () => { started.current = `${blocksKey}|${editsKey}|${run ? "run" : ""}`; void play(); };

  const textFor = (block: BlockView) => {
    const children = <>{block.pieces.map(item => item.kind === "plain" ? <span key={item.key}>{item.text}</span>
      : item.kind === "typo" ? <span key={item.key} className="ac-swap"><span className="ac-typo" data-pending={item.pending}>{item.text}</span></span>
      : item.kind === "chunk" ? <span key={item.key} className="ac-chunk" data-shown="true" data-pending={item.pending}>{item.text}</span>
      : <span key={item.key} className="ac-tint" data-pending={item.pending} data-new={item.key < 0 ? "" : undefined}>{item.text}</span>)}
      {caret === block.id && <span className="ac-caretSlot" aria-hidden="true"><span className="ac-caret" /></span>}</>;
    const common = { ref: (node: HTMLElement | null) => { if (node) textRefs.current.set(block.id, node); else textRefs.current.delete(block.id); }, "data-fading": block.fading ? "true" : "false" } as const;
    if (block.type === "title") return <h3 className="ac-title" {...common}>{children}</h3>;
    if (block.type === "heading") return <h4 className="ac-heading" {...common}>{children}</h4>;
    return <p className="ac-paragraph" {...common}>{children}</p>;
  };
  const cursor = (who: "agent" | "human", ready: boolean, color: string | undefined, name: string, avatar?: string, mark?: ReactNode) => <motion.div className="ac-cursor" data-ready={ready ? "true" : "false"} data-agent={who === "agent"} style={{ x: cursors[who].x, y: cursors[who].y, "--c": color ?? (who === "agent" ? "var(--agent)" : "var(--human)") } as MotionStyle}>
    <svg className="ac-arrow" viewBox="0 0 20 20" aria-hidden="true"><path d="M3 3 L3 15.5 L6.6 12.4 L9.3 18.4 L11.6 17.4 L9 11.6 L13.6 11.6 Z" /></svg>
    <span ref={node => { tagRefs.current[who] = node; }} className="ac-tag" data-flip={flip[who] ? "true" : "false"}>{who === "agent" ? <span className="ac-tagMark">{mark}</span> : avatar ? <img className="ac-tagAvatar" src={avatar} alt="" width={16} height={16} /> : <span className="ac-tagInitial">{name.slice(0, 1)}</span>}{name}</span>
  </motion.div>;

  return <div ref={rootRef} className={["ac-root", className].filter(Boolean).join(" ")} style={{ "--agent": agent.color, "--human": collaborator?.color ?? "var(--series-2)" } as CSSProperties}
    onPointerEnter={() => setHeld(true)} onPointerLeave={() => setHeld(false)} onFocusCapture={() => setHeld(true)} onBlurCapture={() => setHeld(false)}>
    <div className="ac-header">
      <div className="ac-stack"><span ref={avatarRef} className="ac-agentAvatar" data-working={running ? "true" : "false"} role="img" aria-label={agent.name}>{agent.mark ?? AGENT_MARK}</span>
        {collaborator && <span className="ac-stackAvatar" role="img" aria-label={collaborator.name}>{collaborator.avatar ? <img src={collaborator.avatar} alt="" /> : collaborator.name.slice(0, 1)}</span>}</div>
      <div className="ac-status" aria-hidden="true"><AnimatePresence mode="wait" initial={false}><motion.span key={status.key} className="ac-statusInner" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1, transition: { duration: reduce ? 0 : 0.16, ease: EASE_STANDARD } }} exit={{ opacity: 0, transition: { duration: reduce ? 0 : 0.1, ease: EASE_STANDARD } }}>
        {statusIcon && <span className="ac-statusIcon">{statusIcon}</span>}
        <span className="ac-statusLabel">{status.kind === "reading" || status.kind === "step" ? <TextShimmer>{status.label}</TextShimmer> : status.label}</span>
      </motion.span></AnimatePresence></div>
      <span className="fp-sr" role="status" aria-live="polite">{announce}</span>
      <div className="ac-action"><AnimatePresence mode="wait" initial={false}>{action && <motion.span key={action} initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1, transition: { duration: reduce ? 0 : 0.16 } }} exit={{ opacity: 0, transition: { duration: reduce ? 0 : 0.1 } }}>
        {action === "stop" && <Button tone="ghost" onClick={stop}><span className="ac-buttonInner"><Square aria-hidden="true" />{labels.stop}</span></Button>}
        {action === "again" && <Button tone="ghost" onClick={rerun}><span className="ac-buttonInner"><RotateCcw aria-hidden="true" />{labels.runAgain}</span></Button>}
        {action === "retry" && <Button tone="ghost" onClick={rerun}><span className="ac-buttonInner"><RotateCcw aria-hidden="true" />{labels.retry}</span></Button>}
        {action === "ask" && <Button tone="ghost" onClick={startPlay}><span className="ac-buttonInner"><Pencil aria-hidden="true" />{labels.ask}</span></Button>}
      </motion.span>}</AnimatePresence></div>
    </div>
    <div className="ac-selectionLayer" aria-hidden="true">{selection.map((line, index) => <div key={index} ref={node => { selectionRefs.current[index] = node; }} className="ac-selection" style={{ left: line.left, top: line.top, width: line.width, height: line.height, transform: "scaleX(0)" }} />)}</div>
    <article className="ac-doc" data-fading={docFading ? "true" : "false"} aria-label={title ?? blocks.find(block => block.type === "title")?.text} aria-busy={running}>
      {view.map(block => <div key={block.id} className="ac-block" data-type={block.type}><Fit block={block} reduce={reduce} busy={busy}><div className="ac-pad">{textFor(block)}</div>{block.type === "title" && meta && <div className="ac-meta">{meta}</div>}</Fit></div>)}
    </article>
    <div className="ac-barWrap"><AnimatePresence>{bar && <motion.div key="bar" className="ac-bar" role="group" aria-label={labels.review} initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, transition: { duration: reduce ? 0 : 0.2, ease: EASE_STANDARD } }} exit={{ opacity: 0, transition: { duration: reduce ? 0 : 0.12 } }}>
      <span className="ac-barLabel"><span className="ac-barMark">{agent.mark ?? AGENT_MARK}</span><span className="ac-barCount">{labels.barCount(doneCount)}<span className="ac-barBy">{" "}{labels.by(agent.name)}</span></span></span>
      <Button tone="ghost" onClick={undo}><span className="ac-buttonInner"><Undo2 aria-hidden="true" />{labels.undo}</span></Button>
      <Button ref={acceptRef} tone="primary" onClick={accept}><span className="ac-buttonInner"><Check aria-hidden="true" />{labels.accept}</span></Button>
    </motion.div>}</AnimatePresence></div>
    <div className="ac-cursorLayer" aria-hidden="true">
      {collaborator && cursor("human", true, collaborator.color, collaborator.name, collaborator.avatar)}
      {cursor("agent", agentReady, agent.color, agent.name, undefined, agent.mark ?? AGENT_MARK)}
    </div>
  </div>;
}
