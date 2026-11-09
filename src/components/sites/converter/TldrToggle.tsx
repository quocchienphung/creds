"use client";

import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion } from "motion/react";
import { AlertCircle, Check, CircleCheck, CircleDashed, CircleStop, Copy, FileText, RotateCcw, Square } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button, EASE_STANDARD, SPRING_HEIGHT, SegmentedControl, Slider, TextShimmer, Tip } from "./primitives";
import { cacheKey, chunkWords, countWords, defaultCount, defaultReadout, pointCountFor, readingMinutes, simulateTldr, streamResult, targetWordsFor, type Random, type TldrKeyPoint, type TldrLength, type TldrMode, type TldrParagraph, type TldrRequest, type TldrStreamEvent } from "./tldr-model";
import "./tldr-toggle.css";

export type { TldrKeyPoint, TldrLength, TldrMode, TldrParagraph, TldrRequest, TldrStreamEvent };
export interface TldrArticle { title: string; paragraphs: TldrParagraph[]; source?: { name: string; mark?: ReactNode }; author?: { name: string; avatar?: string }; date?: string; readingTime?: string }
export interface TldrResult { mode: "summary" | "points"; length: TldrLength; text: string; points?: TldrKeyPoint[]; words: number }
export interface TldrLabels {
  mode: string; full: string; summary: string; points: string; length: string;
  readingParagraphs: (count: number) => string; findingPoints: string; thinking: string; writing: string;
  stop: string; stopped: string; failed: string; tryAgain: string; regenerate: string; copySummary: string; copyPoints: string; copied: string;
  jump: (index: number, text: string) => string; empty: string; errorTitle: (mode: "summary" | "points") => string; simulated: string; defaultError: string;
  announceStart: (mode: "summary" | "points", model: string) => string; announceDone: (mode: "summary" | "points", words: number, points: number) => string;
  announceSaved: (mode: "summary" | "points") => string; announceStopped: string; announceShowing: (index: number) => string; announceFailed: (mode: "summary" | "points", message: string) => string;
}
const DEFAULT_LABELS: TldrLabels = {
  mode: "Reading mode", full: "Full", summary: "Summary", points: "Key points", length: "Length",
  readingParagraphs: count => `Reading ${count} ${count === 1 ? "paragraph" : "paragraphs"}`, findingPoints: "Finding key points", thinking: "Thinking", writing: "Writing",
  stop: "Stop", stopped: "Stopped", failed: "Failed", tryAgain: "Try again", regenerate: "Regenerate", copySummary: "Copy summary", copyPoints: "Copy key points", copied: "Copied",
  jump: (index, text) => `Jump to paragraph ${index}: ${text}`, empty: "Nothing to summarize.", errorTitle: mode => mode === "points" ? "Couldn’t find key points" : "Couldn’t summarize", simulated: "Simulated, nothing was sent.", defaultError: "Something went wrong.",
  announceStart: (mode, model) => mode === "points" ? `Finding key points with ${model}.` : `Summarizing with ${model}.`,
  announceDone: (mode, words, points) => mode === "points" ? `${points} key ${points === 1 ? "point" : "points"} ready.` : `Summary ready, ${words} ${words === 1 ? "word" : "words"}.`,
  announceSaved: mode => mode === "points" ? "Showing the saved key points." : "Showing the saved summary.", announceStopped: "Stopped. What arrived is kept.",
  announceShowing: index => `Showing paragraph ${index} in the article.`, announceFailed: (mode, message) => `${mode === "points" ? "Couldn’t find key points" : "Couldn’t summarize"}. ${message}`,
};

export interface TldrToggleProps {
  article: TldrArticle;
  /** Produces the result. Stream { type: "text" } events for prose; for key points send { type: "point", source } before each point's text. A promise of the finished string or points also works: the card streams it in chunks itself. Leave it out to run the built-in simulation. */
  summarize?: (request: TldrRequest) => AsyncIterable<TldrStreamEvent> | Promise<string | TldrKeyPoint[]>;
  model?: { name: string; mark?: ReactNode };
  mode?: TldrMode; defaultMode?: TldrMode; onModeChange?: (mode: TldrMode) => void;
  length?: TldrLength; defaultLength?: TldrLength; onLengthChange?: (length: TldrLength) => void;
  onComplete?: (result: TldrResult) => void; onJump?: (paragraphId: string) => void;
  autoPlay?: boolean; simulated?: boolean;
  /** How a paragraph of the article is drawn (rows of a sheet); the text stays the paragraph's accessible text. */
  renderParagraph?: (paragraph: TldrParagraph, index: number) => ReactNode;
  /** `lines`: the result is delimited text, drawn as it is with its own line breaks. */
  layout?: "prose" | "lines";
  /** How a result is cut into the chunks that arrive every 30 to 40 ms (3 to 8 words by default). */
  chunker?: (text: string, random: Random) => string[];
  readout?: (mode: TldrMode, length: TldrLength) => string;
  count?: (mode: TldrMode, words: number, points: number) => string;
  /** What the jump link of a point says: ¶2 by default. */
  jumpLabel?: (index: number, id: string) => string;
  labels?: Partial<TldrLabels>;
  /** A change clears the saved results and runs the current mode again (the data behind `summarize` changed, not the article). */
  resetKey?: string | number;
  className?: string;
}

type Status = "idle" | "thinking" | "streaming" | "done" | "stopped" | "error";
interface Live { status: Status; paragraphs: string[][]; points: { source: string; chunks: string[]; done: boolean }[]; words: number; error?: string; cached: boolean }
const EMPTY: Live = { status: "idle", paragraphs: [], points: [], words: 0, cached: false };
interface Saved { paragraphs: string[][]; points: Live["points"]; words: number }
const flat = (live: Pick<Live, "paragraphs">) => live.paragraphs.map(chunks => chunks.join("")).join("\n\n");
const isIterable = (value: unknown): value is AsyncIterable<TldrStreamEvent> => !!value && typeof (value as AsyncIterable<TldrStreamEvent>)[Symbol.asyncIterator] === "function";

/**
 * An article card with a Full, Summary and Key points switch and a length slider. Switching streams a result in place of the article in chunks of
 * 3 to 8 words while the card's height follows on a spring with no bounce; key points tick as they are written and each links back to the paragraph
 * it came from, which is scrolled to and highlighted. Rebuilt from the open preview of UIArc's TL;DR toggle (a Pro component: DOM, declared CSS and
 * recordings of the rendered page; docs/research/tldr-toggle/). It writes nothing by itself: `summarize` does (or the built-in simulation, which
 * says so).
 */
export function TldrToggle(props: TldrToggleProps) {
  const { article, summarize, onComplete, onJump, renderParagraph, layout = "prose", className } = props;
  const model = props.model ?? { name: "Claude Haiku 5.5" };
  const simulated = props.simulated ?? !summarize;
  const autoPlay = props.autoPlay ?? !summarize;
  const labels = useMemo<TldrLabels>(() => ({ ...DEFAULT_LABELS, ...props.labels }), [props.labels]);
  const readout = props.readout ?? defaultReadout, countLabel = props.count ?? defaultCount, chunker = props.chunker ?? ((text: string, random: Random) => chunkWords(text, random));
  const reduce = useReducedMotion() ?? false;
  const [innerMode, setInnerMode] = useState<TldrMode>(props.defaultMode ?? "full");
  const [innerLength, setInnerLength] = useState<TldrLength>(props.defaultLength ?? 2);
  const mode = props.mode ?? innerMode, length = props.length ?? innerLength;
  const [live, setLive] = useState<Live>(EMPTY);
  const [generation, setGeneration] = useState(0);
  const [announce, setAnnounce] = useState("");
  const [lit, setLit] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const cache = useRef(new Map<string, Saved>());
  const control = useRef<AbortController | null>(null);
  const touched = useRef(false);
  const paraRefs = useRef(new Map<string, HTMLElement>());
  const rootRef = useRef<HTMLDivElement>(null), bodyRef = useRef<HTMLDivElement>(null);
  const settle = useRef<(() => void) | null>(null);
  const pendingJump = useRef<string | null>(null);
  const litTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef({ summarize, onComplete, labels, article, simulated, model, chunker, mode, length });
  useLayoutEffect(() => { latest.current = { summarize, onComplete, labels, article, simulated, model, chunker, mode, length }; });
  const suffix = (text: string) => simulated ? `${text} ${labels.simulated}` : text;
  const articleKey = useMemo(() => `${props.resetKey ?? ""}\u0003${article.title}\u0001${article.paragraphs.map(paragraph => `${paragraph.id}:${paragraph.text}`).join("\u0002")}`, [article, props.resetKey]);

  const setMode = useCallback((next: TldrMode) => { touched.current = true; if (props.mode === undefined) setInnerMode(next); props.onModeChange?.(next); }, [props]);
  const setLength = useCallback((next: TldrLength) => { touched.current = true; if (props.length === undefined) setInnerLength(next); props.onLengthChange?.(next); }, [props]);

  /** Start (or show) the result for a mode and length. */
  const run = useCallback(async (runMode: "summary" | "points", runLength: TldrLength, force: boolean) => {
    control.current?.abort();
    const current = latest.current;
    const key = cacheKey(runMode, runLength), saved = cache.current.get(key);
    if (saved && !force) {
      control.current = null;
      setLive({ status: "done", paragraphs: saved.paragraphs, points: saved.points.map(point => ({ ...point, done: true })), words: saved.words, cached: true });
      setAnnounce(current.labels.announceSaved(runMode));
      return;
    }
    const controller = new AbortController(); control.current = controller;
    const { signal } = controller;
    const start: Live = { status: "thinking", paragraphs: [], points: [], words: 0, cached: false };
    setLive(start);
    setAnnounce(current.labels.announceStart(runMode, current.model.name));
    const acc: Live = { ...start, paragraphs: [], points: [] };
    const commit = (status: Status, extra: Partial<Live> = {}) => { if (!signal.aborted) setLive({ ...acc, paragraphs: acc.paragraphs.map(chunks => [...chunks]), points: acc.points.map(point => ({ ...point, chunks: [...point.chunks] })), status, ...extra }); };
    const request: TldrRequest = { mode: runMode, length: runLength, targetWords: targetWordsFor(runLength), pointCount: pointCountFor(runLength), article: { title: current.article.title, paragraphs: current.article.paragraphs }, signal };
    try {
      let source: AsyncIterable<TldrStreamEvent>;
      if (!current.summarize) source = simulateTldr(request);
      else {
        const output = current.summarize(request);
        source = isIterable(output) ? output : (async function* () { const result = await output; yield* streamResult(result, signal, { chunker: current.chunker }); })();
      }
      for await (const event of source) {
        if (signal.aborted) return;
        if (event.type === "point") { if (acc.points.length) acc.points[acc.points.length - 1].done = true; acc.points.push({ source: event.source, chunks: [], done: false }); }
        else if (runMode === "points") { if (!acc.points.length) acc.points.push({ source: "", chunks: [], done: false }); acc.points[acc.points.length - 1].chunks.push(event.text); }
        else if (layout === "lines") { if (!acc.paragraphs.length) acc.paragraphs.push([]); acc.paragraphs[0].push(event.text); }
        else {
          const parts = event.text.split(/(\n{2,})/);
          if (!acc.paragraphs.length) acc.paragraphs.push([]);
          for (const part of parts) { if (/^\n{2,}$/.test(part)) acc.paragraphs.push([]); else if (part) acc.paragraphs[acc.paragraphs.length - 1].push(part); }
        }
        commit("streaming");
      }
      if (signal.aborted) return;
      if (acc.points.length) acc.points[acc.points.length - 1].done = true;
      acc.words = runMode === "points" ? acc.points.reduce((sum, point) => sum + countWords(point.chunks.join("")), 0) : countWords(flat(acc));
      const savedResult: Saved = { paragraphs: acc.paragraphs.map(chunks => [...chunks]), points: acc.points.map(point => ({ ...point, chunks: [...point.chunks], done: true })), words: acc.words };
      cache.current.set(key, savedResult);
      commit("done", { words: acc.words });
      setAnnounce(current.labels.announceDone(runMode, acc.words, acc.points.length));
      current.onComplete?.({ mode: runMode, length: runLength, text: runMode === "points" ? acc.points.map(point => point.chunks.join("")).join("\n") : flat(acc), points: runMode === "points" ? acc.points.map(point => ({ text: point.chunks.join(""), source: point.source })) : undefined, words: acc.words });
    } catch (error) {
      if (signal.aborted) return;
      const message = error instanceof Error && error.message ? error.message : current.labels.defaultError;
      commit("error", { error: message });
      setAnnounce(current.labels.announceFailed(runMode, message));
    }
  }, [layout]);

  // a new article, mode, length or Regenerate starts the right thing; Full stops whatever runs
  useEffect(() => {
    cache.current.clear();
  }, [articleKey]);
  useEffect(() => {
    if (mode === "full") { control.current?.abort(); control.current = null; setLive(EMPTY); return; }
    void run(mode, length, false);
    return () => { control.current?.abort(); };
  }, [mode, length, articleKey, run, generation]);
  useEffect(() => () => { control.current?.abort(); clearTimeout(litTimer.current); clearTimeout(copyTimer.current); }, []);

  const stop = useCallback(() => {
    if (!control.current || (live.status !== "thinking" && live.status !== "streaming")) return;
    control.current.abort(); control.current = null;
    setLive(current => ({ ...current, status: "stopped", points: current.points.map(point => ({ ...point, done: true })) }));
    setAnnounce(labels.announceStopped);
  }, [live.status, labels.announceStopped]);
  const regenerate = useCallback(() => { cache.current.delete(cacheKey(latest.current.mode as "summary" | "points", latest.current.length)); setGeneration(value => value + 1); }, []);

  // autoplay: a card that is half in view for a second opens its summary, unless the reader has touched it
  useEffect(() => {
    const node = rootRef.current;
    if (!autoPlay || !node || typeof IntersectionObserver === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new IntersectionObserver(([entry]) => {
      clearTimeout(timer);
      if (entry.isIntersecting && entry.intersectionRatio >= 0.5) timer = setTimeout(() => { if (!touched.current) { observer.disconnect(); setMode("summary"); touched.current = false; } }, 1000);
    }, { threshold: [0.5] });
    observer.observe(node);
    return () => { clearTimeout(timer); observer.disconnect(); };
  }, [autoPlay, setMode]);

  // the height: one critically damped spring follows the content; a resize of the container cuts straight to the new height
  const height = useMotionValue(0);
  const [sized, setSized] = useState(false);
  const flushSettle = useCallback(() => { const next = settle.current; settle.current = null; next?.(); }, []);
  useLayoutEffect(() => {
    const body = bodyRef.current, root = rootRef.current;
    if (!body || !root || typeof ResizeObserver === "undefined") return;
    let lastWidth = root.offsetWidth, first = true, controls: ReturnType<typeof animate> | null = null, cut = false;
    const apply = () => {
      const target = body.offsetHeight + 1;
      controls?.stop();
      if (first || cut || reduce) { first = false; cut = false; height.set(target); setSized(true); flushSettle(); return; }
      if (Math.abs(height.get() - target) < 0.5) { flushSettle(); return; }
      // a jump waits for "settled", which the original reads at about 97% of the way (a critically damped spring takes much longer to be exactly there)
      const from = height.get(), near = Math.max(3, Math.abs(target - from) * 0.03);
      controls = animate(height, target, { ...SPRING_HEIGHT, onUpdate: value => { if (Math.abs(value - target) <= near) flushSettle(); }, onComplete: flushSettle });
    };
    const bodyObserver = new ResizeObserver(apply);
    const rootObserver = new ResizeObserver(() => { if (root.offsetWidth !== lastWidth) { lastWidth = root.offsetWidth; cut = true; } });
    bodyObserver.observe(body); rootObserver.observe(root);
    return () => { bodyObserver.disconnect(); rootObserver.disconnect(); controls?.stop(); };
  }, [reduce, height, flushSettle]);

  // a jump: back to the article, wait for the height to settle, scroll to the paragraph, highlight it for 1.8 s and move focus there
  const arrive = useCallback((id: string) => {
    const node = paraRefs.current.get(id);
    if (!node) return;
    const index = latest.current.article.paragraphs.findIndex(paragraph => paragraph.id === id);
    node.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    node.focus({ preventScroll: true });
    setLit(id); setAnnounce(latest.current.labels.announceShowing(index + 1));
    clearTimeout(litTimer.current); litTimer.current = setTimeout(() => setLit(null), 1800);
  }, [reduce]);
  const jump = (id: string) => {
    onJump?.(id);
    pendingJump.current = id;
    settle.current = () => { const target = pendingJump.current; pendingJump.current = null; if (target) arrive(target); };
    if (mode === "full") flushSettle(); else setMode("full");
    window.setTimeout(() => { if (pendingJump.current) flushSettle(); }, 900);
  };

  const copy = async () => {
    const text = mode === "points" ? live.points.map(point => `- ${point.chunks.join("")}`).join("\n") : flat(live);
    try { await navigator.clipboard.writeText(text); setCopied(true); clearTimeout(copyTimer.current); copyTimer.current = setTimeout(() => setCopied(false), 1400); } catch { /* the page has no clipboard permission: nothing to confirm */ }
  };

  const running = live.status === "thinking" || live.status === "streaming";
  // Escape stops a running stream while focus is in the card, or nowhere (the button that started the run has just been replaced by Stop)
  useEffect(() => {
    if (!running) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const active = document.activeElement;
      if (active && active !== document.body && !rootRef.current?.contains(active)) return;
      stop();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [running, stop]);
  const resultMode = mode === "full" ? null : mode;
  const viewKey = mode === "full" ? "full" : `${mode}:${length}:${generation}`;
  const articleParagraphs = article.paragraphs;
  const minutes = article.readingTime ?? `${readingMinutes(articleParagraphs)} min read`;
  const byline = [article.date, minutes].filter(Boolean).join(" · ");
  const fade = { initial: reduce ? false : { opacity: 0 }, animate: { opacity: 1, transition: { duration: reduce ? 0 : 0.16, ease: EASE_STANDARD } }, exit: { opacity: 0, transition: { duration: reduce ? 0 : 0.1, ease: EASE_STANDARD } } } as const;

  const chunkClass = live.cached ? undefined : "tt-chunk";
  const body = (() => {
    if (mode === "full") return articleParagraphs.length
      ? <div className="tt-article">{articleParagraphs.map((paragraph, index) => <p key={paragraph.id} ref={node => { if (node) paraRefs.current.set(paragraph.id, node); else paraRefs.current.delete(paragraph.id); }} className="tt-para" tabIndex={-1} data-lit={lit === paragraph.id ? "" : undefined} data-id={paragraph.id}>{renderParagraph ? renderParagraph(paragraph, index) : paragraph.text}</p>)}</div>
      : <div className="tt-empty"><FileText size={16} aria-hidden="true" />{labels.empty}</div>;
    if (live.status === "error") return <div className="tt-gen"><div className="tt-error" role="alert"><AlertCircle size={16} aria-hidden="true" /><div className="tt-errorCopy"><p className="tt-errorTitle">{labels.errorTitle(mode)}</p><p className="tt-errorText">{suffix(live.error ?? labels.defaultError)}</p></div></div></div>;
    if (mode === "points") return <div className="tt-gen">
      <AnimatePresence>{live.status === "thinking" && <motion.span key="thinking" className="tt-thinking" exit={{ opacity: 0, transition: { duration: reduce ? 0 : 0.1, ease: EASE_STANDARD } }}><TextShimmer>{labels.findingPoints}</TextShimmer></motion.span>}</AnimatePresence>
      {live.points.length > 0 && <ul className="tt-points">{live.points.map((point, index) => {
        const at = articleParagraphs.findIndex(paragraph => paragraph.id === point.source), text = point.chunks.join("");
        return <li key={index} className={live.cached ? "tt-point" : "tt-point tt-enter"}>
          <span className="tt-pointIcon" aria-hidden="true" data-done={point.done ? "true" : undefined}><CircleDashed size={16} className="tt-pending" /><CircleCheck size={16} className="tt-check" /></span>
          <span className="tt-pointText">{point.chunks.map((chunk, at2) => <span key={at2} className={chunkClass}>{chunk}</span>)}</span>
          {live.status === "done" && at >= 0 ? <button type="button" className="tt-jump" aria-label={labels.jump(at + 1, text)} onClick={() => jump(point.source)}>{props.jumpLabel ? props.jumpLabel(at, point.source) : `¶${at + 1}`}</button> : <span className="tt-jumpSlot" aria-hidden="true">{props.jumpLabel ? props.jumpLabel(Math.max(0, at), point.source) : `¶${Math.max(0, at) + 1}`}</span>}
        </li>;
      })}</ul>}
    </div>;
    return <div className="tt-gen">
      <AnimatePresence>{live.status === "thinking" && <motion.span key="thinking" className="tt-thinking" exit={{ opacity: 0, transition: { duration: reduce ? 0 : 0.1, ease: EASE_STANDARD } }}><TextShimmer>{labels.readingParagraphs(articleParagraphs.length)}</TextShimmer></motion.span>}</AnimatePresence>
      {layout === "lines" ? (live.paragraphs[0]?.length ? <pre className="tt-lines" tabIndex={0} aria-label={labels.summary}>{live.paragraphs[0].map((chunk, index) => <span key={index} className={chunkClass}>{chunk}</span>)}</pre> : null)
        : live.paragraphs.length > 0 && <div className="tt-summary">{live.paragraphs.map((chunks, index) => <p key={index}>{chunks.map((chunk, at) => <span key={at} className={chunkClass}>{chunk}</span>)}</p>)}</div>}
    </div>;
  })();

  const statusNode = (() => {
    if (live.status === "thinking") return <span key="thinking" className="tt-state" data-status="thinking"><TextShimmer>{labels.thinking}</TextShimmer></span>;
    if (live.status === "streaming") return <span key="streaming" className="tt-state" data-status="streaming"><TextShimmer>{labels.writing}</TextShimmer></span>;
    if (live.status === "done") return <span key="done" className="tt-state" data-status="done"><Check size={12} aria-hidden="true" />{countLabel(mode, live.words, live.points.length)}</span>;
    if (live.status === "stopped") return <span key="stopped" className="tt-state" data-status="stopped"><CircleStop size={12} aria-hidden="true" />{labels.stopped}</span>;
    if (live.status === "error") return <span key="error" className="tt-state" data-status="error"><AlertCircle size={12} aria-hidden="true" />{labels.failed}</span>;
    return null;
  })();
  const actionKind = running ? "running" : live.status === "error" ? "error" : live.status === "done" || live.status === "stopped" ? "result" : null;

  return <div ref={rootRef} className={["tt-root", className].filter(Boolean).join(" ")}>
    <article className="tt-card" aria-busy={running || undefined} aria-label={article.title}>
      <header className="tt-head">
        {article.source && <div className="tt-source">{article.source.mark && <span className="tt-sourceMark" aria-hidden="true">{article.source.mark}</span>}<span className="tt-truncate">{article.source.name}</span></div>}
        <h3 className="tt-title">{article.title}</h3>
        {byline && <div className="tt-byline">{article.author && <><span className="tt-avatar" role="img" aria-label={article.author.name}>{article.author.avatar ? <img src={article.author.avatar} alt="" /> : article.author.name.split(/\s+/).map(part => part[0]).join("").slice(0, 2)}</span><span className="tt-author">{article.author.name}</span><span aria-hidden="true">·</span></>}<span className="tt-truncate">{byline}</span></div>}
      </header>
      <div className="tt-controls">
        <SegmentedControl label={labels.mode} value={mode} onChange={setMode} options={[{ value: "full", label: labels.full }, { value: "summary", label: labels.summary }, { value: "points", label: labels.points }]} />
        <div className="tt-length"><Slider label={labels.length} value={length} min={1} max={5} disabled={mode === "full"} valueText={value => readout(mode === "full" ? "summary" : mode, value as TldrLength)} onCommit={value => setLength(value as TldrLength)} /></div>
      </div>
      <motion.div className="tt-clip" style={sized ? { height } : undefined}>
        <div ref={bodyRef} className="tt-body">
          <AnimatePresence mode="wait" initial={false}><motion.div key={viewKey} {...fade}>{body}</motion.div></AnimatePresence>
          {resultMode && <motion.div className="tt-foot" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1, transition: { duration: reduce ? 0 : 0.16, ease: EASE_STANDARD } }}>
            <div className="tt-status">
              {model.mark && <span className="tt-modelMark" aria-hidden="true">{model.mark}</span>}<span className="tt-modelName">{model.name}</span><span className="tt-dot" aria-hidden="true">·</span>
              <span className="tt-stateSlot"><AnimatePresence mode="wait" initial={false}><motion.span key={live.status} {...fade}>{statusNode}</motion.span></AnimatePresence></span>
            </div>
            <div className="tt-actions"><AnimatePresence mode="wait" initial={false}>{actionKind && <motion.div key={actionKind} className="tt-actionSet" data-kind={actionKind} {...fade}>
              {actionKind === "running" && <Button tone="ghost" className="tt-action" onClick={stop}><Square size={14} aria-hidden="true" />{labels.stop}</Button>}
              {actionKind === "error" && <Button tone="primary" className="tt-action tt-retry" onClick={regenerate}><RotateCcw size={14} aria-hidden="true" />{labels.tryAgain}</Button>}
              {actionKind === "result" && <>
                <Button tone="ghost" icon className="tt-iconAction" aria-label={resultMode === "points" ? labels.copyPoints : labels.copySummary} data-copy-state={copied ? "copied" : "idle"} onClick={() => void copy()}>
                  <span className="tt-copyIcon" aria-hidden="true"><AnimatePresence initial={false} mode="popLayout"><motion.span key={copied ? "done" : "idle"} initial={reduce ? false : { opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }} transition={{ duration: reduce ? 0 : 0.14, ease: EASE_STANDARD }}>{copied ? <Check size={16} /> : <Copy size={16} />}</motion.span></AnimatePresence></span>
                </Button>
                <span className="fp-sr" role="status" aria-live="polite">{copied ? labels.copied : ""}</span>
                <Tip label={labels.regenerate}><Button tone="ghost" icon className="tt-action tt-iconAction" aria-label={labels.regenerate} onClick={regenerate}><RotateCcw size={16} aria-hidden="true" /></Button></Tip>
              </>}
            </motion.div>}</AnimatePresence></div>
          </motion.div>}
        </div>
      </motion.div>
    </article>
    <div className="fp-sr" role="status" aria-live="polite">{announce && suffix(announce)}</div>
  </div>;
}
