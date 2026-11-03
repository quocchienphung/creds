"use client";

import { animate, motion, useMotionValue } from "motion/react";
import { CircleCheck, CircleX, Pause, Play, RotateCcw } from "lucide-react";
import { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { CARD_SPRING, KIND_LABEL, PLOT, SPEEDS, axisTicks, costFormat, countFormat, neighbour, normalize, pathOf, seconds, spanState, summaryOf, totalsAt } from "./timeline-model.ts";
import type { Normalized, Span, SpanKind, TimelineRun } from "./timeline-model.ts";
import { Button, ModelMark, SegmentedControl, Swap, TextShimmer, ToolMarkIcon, useMotionOff } from "./parts";
import type { ToolId } from "./tool-call-model.ts";
import { useOrchestratorCopy } from "./OrchestratorI18n";
import { timelineSpanName } from "./orchestrator-copy";

const rowColor = (row: number) => (row === 0 ? "var(--text-secondary)" : `var(--series-${((row - 1) % 4) + 1})`);
const toolId = (tool?: string): ToolId => (tool === "GitHub" ? "github" : tool === "PostgreSQL" ? "postgres" : tool === "Notion" ? "files" : tool === "Slack" ? "slack" : tool === "Web fetch" || tool === "Web search" ? "web" : "files");

interface SpanButtonProps { span: Span; state: "pending" | "active" | "done"; pinned: boolean; dim: boolean; tab: boolean; label: string; liveEnd: number | null; onEnter: (span: Span, target: HTMLElement) => void; onLeave: () => void; onPress: (span: Span) => void; onKey: (event: ReactKeyboardEvent, span: Span) => void; onFocusSpan: (span: Span, target: HTMLElement) => void }
const SpanButton = memo(function SpanButton({ span, state, pinned, dim, tab, label, liveEnd, onEnter, onLeave, onPress, onKey, onFocusSpan }: SpanButtonProps) {
  const failed = span.status === "failed" && state === "done";
  const duration = liveEnd !== null ? Math.max(0, liveEnd - span.start) : span.end - span.start;
  return <button type="button" className="tl-span" data-kind={span.kind} data-state={state === "pending" ? undefined : state} data-span-id={span.id} data-failed={failed ? "" : undefined} data-dim={dim ? "" : undefined}
    aria-pressed={pinned} aria-label={label} tabIndex={tab ? 0 : -1} style={{ "--s": span.start, "--d": duration } as CSSProperties}
    onPointerEnter={event => { if (event.pointerType === "mouse") onEnter(span, event.currentTarget); }} onPointerLeave={event => { if (event.pointerType === "mouse") onLeave(); }}
    onFocus={event => { if (event.currentTarget.matches(":focus-visible")) onFocusSpan(span, event.currentTarget); }} onBlur={onLeave}
    onClick={() => onPress(span)} onKeyDown={event => onKey(event, span)}>
    {failed ? <CircleX className="tl-span__icon" aria-hidden="true" /> : span.retry && state === "done" ? <RotateCcw className="tl-span__icon" aria-hidden="true" /> : null}
  </button>;
});

/** The card that follows the pointer from span to span: it glides on the morph spring, crossfades its content and springs to its new height. */
function SpanCard({ target, model, host }: { target: { span: Span; rect: DOMRect } | null; model: Normalized; host: React.RefObject<HTMLElement | null> }) {
  const t = useOrchestratorCopy();
  const off = useMotionOff();
  const x = useMotionValue(0), y = useMotionValue(0), height = useMotionValue(0), opacity = useMotionValue(0);
  const body = useRef<HTMLDivElement>(null), lift = useRef<HTMLDivElement>(null);
  const visible = useRef(false);
  const [last, setLast] = useState<{ span: Span; rect: DOMRect } | null>(null);
  if (target && target !== last) setLast(target);
  useLayoutEffect(() => {
    const root = host.current;
    if (!target || !root) { visible.current = false; animate(opacity, 0, { duration: off ? 0 : 0.1 }); return; }
    const base = root.getBoundingClientRect();
    const width = Math.min(280, base.width - 16);
    const cx = target.rect.left - base.left + target.rect.width / 2;
    const left = Math.min(Math.max(8, cx - width / 2), Math.max(8, base.width - width - 8));
    const topAbove = target.rect.top - base.top - 8;
    const below = topAbove - (height.get() || 120) < 4;
    if (lift.current) lift.current.style.transform = below ? "none" : "translateY(-100%)";
    const targetY = below ? target.rect.bottom - base.top + 8 : topAbove;
    if (!visible.current || off) { x.set(left); y.set(targetY); }
    else { animate(x, left, CARD_SPRING); animate(y, targetY, CARD_SPRING); }
    visible.current = true;
    animate(opacity, 1, { duration: off ? 0 : 0.1 });
  }, [target, host, off, x, y, height, opacity]);
  useEffect(() => {
    const element = body.current;
    if (!element) return;
    const read = () => { const next = element.offsetHeight; if (!height.get() || off) height.set(next); else animate(height, next, CARD_SPRING); };
    read();
    const observer = new ResizeObserver(read);
    observer.observe(element);
    return () => observer.disconnect();
  }, [target?.span.id, height, off]);
  const span = (target ?? last)?.span;
  const agent = span ? model.agents[span.row] : null;
  return <motion.div className="tl-card-layer" aria-hidden="true" style={{ x, y, opacity }}>
    <div ref={lift} style={{ transform: "translateY(-100%)" }}>
      <motion.div className="tl-card" style={{ height }}>
        <div ref={body}>
          {span && agent && <Swap id={span.id}><div className="tl-card__body">
            <p className="tl-card__head" style={{ "--c": rowColor(span.row) } as CSSProperties}><span className="tl-dot" style={{ background: "var(--c)" }} /><span className="tl-card__agent">{t(agent.name)}</span><span className="tl-card__model">{agent.model}</span></p>
            <p className="tl-card__label">{t(span.label)}</p>
            <p className="tl-card__meta">
              {span.kind === "tool" && span.tool && <span className="tl-card__tool"><span className="tl-mark"><ToolMarkIcon tool={toolId(span.tool)} /></span>{t(span.tool)}</span>}
              {span.kind !== "tool" && <span>{t(KIND_LABEL[span.kind])}</span>}
              <span className="tl-sep">·</span><span className="tl-tabular">{seconds(span.end - span.start)}</span>
              {span.tokens ? <><span className="tl-sep">·</span><span className="tl-tabular">{countFormat(span.tokens)} tokens</span></> : null}
            </p>
            {span.status === "failed" && <p className="tl-card__failed"><CircleX aria-hidden="true" /><span>{t("Failed: {0}", [t(span.detail ?? "the call did not finish")])}</span></p>}
            {span.retry && <p className="tl-card__note"><RotateCcw aria-hidden="true" /><span>{t(span.retry)}</span></p>}
          </div></Swap>}
        </div>
      </motion.div>
    </div>
  </motion.div>;
}

interface AgentTimelineProps {
  /** the run, or a function of the clock in seconds (for a live run the page's events are turned into spans at the timeline's own pace) */
  run: TimelineRun | ((now: number) => TimelineRun);
  /** follow a run in progress: the clock is `liveNow()` seconds, open spans grow to it and the playback controls are hidden */
  live?: boolean;
  liveNow?: () => number;
  title?: string;
  /** the speed-up the finished line reports, when the page has its own figure for it (the orchestrator's sequential estimate) */
  speedup?: number;
  /** replay from zero when it scrolls into view */
  autoPlay?: boolean;
  onSpanSelect?: (span: Span | null) => void;
}

export function AgentTimeline({ run, live = false, liveNow, title, speedup, autoPlay = false, onSpanSelect }: AgentTimelineProps) {
  const t = useOrchestratorCopy();
  const off = useMotionOff();
  const titleId = useId();
  const root = useRef<HTMLElement>(null), plot = useRef<HTMLDivElement>(null);
  /** a replay's position in seconds; null is the end of the run */
  const [position, setPosition] = useState<number | null>(() => (autoPlay && !off ? 0 : null));
  const [liveClock, setLiveClock] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(SPEEDS[0]);
  const [pinned, setPinned] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [hover, setHover] = useState<{ span: Span; rect: DOMRect } | null>(null);
  const [announce, setAnnounce] = useState<string | { agents: number; duration: number }>("");
  const [dragging, setDragging] = useState(false);
  const [inView, setInView] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // the clock the render sees is the one of the last tick (about twenty a second); the model closes open spans at it
  const liveStep = Math.round(liveClock * 10);
  const resolved = useMemo(() => (typeof run === "function" ? run(live ? liveStep / 10 : Infinity) : run), [run, live, liveStep]);
  const duration0 = useMemo(() => normalize(resolved, liveClock).duration, [resolved, liveClock]);
  const now = live ? liveClock : Math.min(position ?? duration0, duration0);
  const step = Math.round(now * 10);
  const model = useMemo(() => normalize(resolved, live ? step / 10 : Infinity), [resolved, live, step]);
  const duration = model.duration;
  const finished = !live && duration > 0 && now >= duration - 1e-6;
  const axis = live ? Math.max(10, Math.ceil((now + 1) / 5) * 5) : model.axis;
  const rowsHeight = PLOT.pad + PLOT.row * model.agents.length;
  const ticks = useMemo(() => axisTicks(axis), [axis]);

  const live$ = useRef({ live, liveNow, speed, duration, now, playing });
  useEffect(() => { live$.current = { live, liveNow, speed, duration, now, playing }; });
  // the clock lives on the plot only: bars, playhead and knob are inside it, so the labels and the rest of the card are not restyled every frame
  const write = useCallback((value: number) => { plot.current?.style.setProperty("--now", String(value)); }, []);
  useEffect(() => { write(now); }, [now, write]);

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const observer = new IntersectionObserver(entries => { const visible = entries.some(entry => entry.isIntersecting); setInView(visible); }, { threshold: 0.1 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  // a replay that asked to play itself starts when it comes into view
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!autoPlay || off || !inView || live || autoStarted.current || duration <= 0) return;
    autoStarted.current = true;
    const frame = requestAnimationFrame(() => setPlaying(true));
    return () => cancelAnimationFrame(frame);
  }, [autoPlay, off, inView, live, duration]);

  // one clock: it writes the current time to a CSS variable every frame (bars, playhead and connectors are CSS from it); React re-renders about 20 times a second
  useEffect(() => {
    if (!inView || (!playing && !live)) return;
    let frame = 0, last = performance.now(), sinceTick = 0;
    let value = live ? (live$.current.liveNow?.() ?? 0) / 1000 : live$.current.now;
    if (!live && value >= live$.current.duration - 1e-6) value = 0;
    const loop = (time: number) => {
      const dt = Math.min(0.1, (time - last) / 1000); last = time;
      const state = live$.current;
      if (state.live) value = (state.liveNow?.() ?? 0) / 1000;
      else {
        value = Math.min(state.duration, value + dt * state.speed);
        if (value >= state.duration) { setPlaying(false); setPosition(null); setAnnounce({ agents: model.agents.length, duration: state.duration }); write(state.duration); return; }
      }
      write(value);
      sinceTick += dt;
      if (sinceTick >= 0.05) { sinceTick = 0; if (state.live) setLiveClock(value); else setPosition(value); }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [playing, live, inView, model.agents.length, write]);

  const totals = totalsAt(model, now);
  const summary = summaryOf(model);
  const sizerTime = seconds(Math.max(duration, now)), sizerTokens = countFormat(Math.max(summary.tokens, totals.tokens));
  const word = playing || live ? "Running" : finished || now <= 0 ? "Ready" : "Paused";
  const path = pinned ? pathOf(model, model.spans.find(span => span.id === pinned) ?? model.spans[0]) : null;

  const seek = (value: number) => { const next = Math.min(model.duration, Math.max(0, value)); setPosition(next); write(next); };
  const restart = () => { setPosition(0); write(0); setPlaying(true); setAnnounce("Replaying."); };
  const togglePlay = () => { if (playing) { setPlaying(false); setAnnounce("Paused."); } else if (finished) restart(); else { setPlaying(true); setAnnounce("Replaying."); } };

  // ---- spans
  const press = useCallback((span: Span) => { const next = pinned === span.id ? null : span.id; setPinned(next); onSpanSelect?.(next ? span : null); }, [pinned, onSpanSelect]);
  const onKey = useCallback((event: ReactKeyboardEvent, span: Span) => {
    if (event.key === "Escape") { setPinned(null); onSpanSelect?.(null); return; }
    const next = neighbour(model, span, event.key);
    if (!next && !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    if (next) { setFocusId(next.id); window.requestAnimationFrame(() => root.current?.querySelector<HTMLElement>(`[data-span-id="${next.id}"]`)?.focus({ preventScroll: false })); }
  }, [model, onSpanSelect]);
  const enter = useCallback((span: Span, target: HTMLElement) => setHover({ span, rect: target.getBoundingClientRect() }), []);
  const leave = useCallback(() => setHover(null), []);
  const firstId = model.byRow.find(row => row.length)?.[0]?.id ?? null;
  const tabId = focusId ?? pinned ?? firstId;

  // ---- the scrubber
  const fromPointer = (event: ReactPointerEvent) => {
    const rect = plot.current?.getBoundingClientRect();
    if (!rect) return;
    setPlaying(false);
    seek(((event.clientX - rect.left) / rect.width) * axis);
  };
  const onAxisKey = (event: ReactKeyboardEvent) => {
    const step = event.shiftKey ? 5 : 0.5;
    const map: Record<string, number> = { ArrowLeft: now - step, ArrowRight: now + step, PageUp: now + 5, PageDown: now - 5, Home: 0, End: model.duration };
    if (event.key in map) { event.preventDefault(); setPlaying(false); seek(map[event.key]); }
  };

  const linkStyle = (link: Normalized["links"][number]): CSSProperties => ({ "--c": `var(--series-${((link.series - 1) % 4) + 1})`, top: link.top, height: link.height, left: `calc(${link.left} / var(--axis) * 100% - ${link.shape === "out" ? 0.75 : 0}px)`, width: `calc(${link.width} / var(--axis) * 100% + 0.75px)` } as CSSProperties);

  return <section ref={root} className="tl" aria-labelledby={titleId}>
    <div className="tl-inner">
      <header className="tl-header">
        <h3 id={titleId} className="tl-title">{title ?? t(resolved.title)}</h3>
        <div className="tl-status">
          <p className="tl-layer" data-on={finished ? undefined : ""} aria-hidden={finished || undefined}>
            <span className="tl-word">
              {(["Running", "Paused", "Ready"] as const).map(item => <span key={item} className="tl-word__item" data-on={word === item ? "" : undefined}>{item === "Running" ? <TextShimmer active={word === "Running"}>{t("Running")}</TextShimmer> : t(item)}</span>)}
            </span>
            <span className="tl-sep" aria-hidden="true">&nbsp;·</span>{" "}
            <span className="tl-part"><span className="tl-count"><span className="tl-count__sizer" aria-hidden="true">{sizerTime}</span><span>{seconds(Math.min(now, Math.max(duration, now)))}</span></span></span>
            <span className="tl-sep" aria-hidden="true">&nbsp;·</span>{" "}
            <span className="tl-part"><span className="tl-count"><span className="tl-count__sizer" aria-hidden="true">{sizerTokens}</span><span>{countFormat(totals.tokens)}</span></span> <span className="tl-unit">tokens</span></span>
            <span className="tl-sep" aria-hidden="true">&nbsp;·</span>{" "}
            <span className="tl-part"><span className="tl-count"><span>{costFormat(totals.cost)}</span></span></span>
            {totals.working > 0 && <span className="tl-sr">, {t(totals.working === 1 ? "{0} agent working" : "{0} agents working", [totals.working])}</span>}
          </p>
          <p className="tl-layer" data-on={finished ? "" : undefined} aria-hidden={!finished || undefined}>
            <CircleCheck className="tl-done-icon" aria-hidden="true" /><span className="tl-sr">{t("Finished: ")}</span>
            <span className="tl-part">{t("{0} agents", [summary.agents])}</span><span className="tl-sep" aria-hidden="true">&nbsp;·</span>{" "}
            <span className="tl-part">{seconds(summary.duration)}</span><span className="tl-sep" aria-hidden="true">&nbsp;·</span>{" "}
            <span className="tl-part">{t("{0}x faster than sequential", [(speedup ?? summary.speedup).toFixed(1)])}</span><span className="tl-sep" aria-hidden="true">&nbsp;·</span>{" "}
            <span className="tl-part">{costFormat(summary.cost)}</span>
          </p>
        </div>
      </header>
      <div className="tl-scroller" data-scrolled={scrolled ? "" : undefined} onScroll={event => setScrolled(event.currentTarget.scrollLeft > 0)}>
        <div className="tl-body" style={{ "--axis": axis, "--rows-h": `${rowsHeight}px`, "--row": `${PLOT.row}px`, "--bar": `${PLOT.bar}px`, "--pad": `${PLOT.pad}px`, "--axis-h": `${PLOT.axis}px` } as CSSProperties}>
          <div className="tl-labels">
            {model.agents.map((agent, row) => <div key={agent.id} id={`${titleId}-row-${row}`} className="tl-label" style={{ "--c": rowColor(row) } as CSSProperties}>
              <span className="tl-dot" aria-hidden="true" />
              <span className="tl-label__text"><span className="tl-name">{t(agent.name)}</span><span className="tl-model">{agent.mark && <span className="tl-mark" aria-hidden="true"><ModelMark mark={agent.mark} /></span>}<span className="tl-model__name">{agent.model}</span></span></span>
            </div>)}
          </div>
          <div className="tl-track">
            <div ref={plot} className="tl-plot" data-path={path ? "" : undefined} style={{ "--now": now } as CSSProperties}>
              <div className="tl-grid" aria-hidden="true">{ticks.map(tick => <span key={tick} className="tl-gridline" style={{ left: `calc(${tick} / var(--axis) * 100%)` }} />)}</div>
              <div className="tl-links" aria-hidden="true">
                {model.links.filter(link => now >= link.at - 1e-6).map(link => <span key={link.key} className="tl-link" data-shape={link.shape} data-dir={link.dir} data-draw="" data-hot={path?.links.has(link.key) ? "" : undefined} style={linkStyle(link)} />)}
              </div>
              {model.byRow.map((spans, row) => <div key={row} role="group" aria-labelledby={`${titleId}-row-${row}`} className="tl-row" style={{ "--c": rowColor(row), top: PLOT.pad + row * PLOT.row } as CSSProperties}>
                {spans.filter(span => now >= span.start - 1e-6).map(span => <SpanButton key={span.id} span={span} state={spanState(span, now)} pinned={pinned === span.id} dim={!!path && !path.spans.has(span.id)} tab={tabId === span.id} label={timelineSpanName(span, model, t)} liveEnd={span.open ? now : null}
                  onEnter={enter} onLeave={leave} onPress={press} onKey={onKey} onFocusSpan={enter} />)}
              </div>)}
              <div className="tl-ports" aria-hidden="true">
                {model.links.filter(link => now >= link.at - 1e-6).map(link => <span key={link.key} className="tl-port" data-draw="" data-hot={path?.links.has(link.key) ? "" : undefined} style={{ "--c": `var(--series-${((link.series - 1) % 4) + 1})`, top: link.top, left: `calc(${link.shape === "out" ? link.left : link.left + link.width} / var(--axis) * 100%)`, "--delay": link.shape === "in" ? "360ms" : "0ms" } as CSSProperties} />)}
              </div>
              <div className="tl-playhead" data-settled={finished ? "" : undefined} aria-hidden="true" />
              <div className="tl-axis" data-live={live ? "" : undefined} onPointerDown={event => { if (live) return; event.currentTarget.setPointerCapture(event.pointerId); setDragging(true); fromPointer(event); }} onPointerMove={event => { if (dragging) fromPointer(event); }} onPointerUp={() => setDragging(false)} onPointerCancel={() => setDragging(false)}>
                {ticks.map(tick => <span key={tick} className="tl-tick" style={{ left: `calc(${tick} / var(--axis) * 100%)` }}>{tick}s</span>)}
                <span className="tl-knob" role="slider" tabIndex={live ? -1 : 0} aria-label={t("Time")} aria-valuemin={0} aria-valuemax={duration} aria-valuenow={Math.round(now * 10) / 10} aria-valuetext={t("{0} of {1}", [seconds(now), seconds(duration)])} aria-orientation="horizontal" data-active={dragging ? "" : undefined} onKeyDown={onAxisKey} style={{ pointerEvents: "auto" }} />
              </div>
            </div>
          </div>
        </div>
      </div>
      <footer className="tl-footer">
        <div className="tl-controls">
          {!live && <>
            <Button iconOnly aria-label={t(playing ? "Pause" : "Play")} onClick={togglePlay}><span className="tl-glyph" data-playing={playing ? "" : undefined}><Play className="tl-glyph__play" fill="currentColor" aria-hidden="true" /><Pause className="tl-glyph__pause" fill="currentColor" aria-hidden="true" /></span></Button>
            <Button iconOnly aria-label={t("Restart")} onClick={restart}><RotateCcw aria-hidden="true" /></Button>
            {SPEEDS.length > 1 && <SegmentedControl label="Playback speed" value={speed} onChange={setSpeed} options={SPEEDS.map(value => ({ value, label: `${value}x` }))} />}
          </>}
        </div>
        <ul className="tl-legend" aria-hidden="true">
          {(["thinking", "tool", "waiting"] as SpanKind[]).map(kind => <li key={kind}><span className="tl-swatch" data-kind={kind} />{t(KIND_LABEL[kind])}</li>)}
          <li><svg className="tl-legend__icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v5a3 3 0 0 0 3 3h6M10 8l3 3-3 3" /></svg>{t("Handoff")}</li>
          <li><CircleX className="tl-legend__failed" />{t("Failed")}</li>
        </ul>
      </footer>
    </div>
    <SpanCard target={hover} model={model} host={root} />
    <p className="tl-sr" role="status" aria-live="polite">{typeof announce === "string" ? t(announce) : t("Finished: {0} agents, {1}.", [announce.agents, seconds(announce.duration)])}</p>
  </section>;
}
