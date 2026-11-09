"use client";

import { AnimatePresence, animate, motion, useMotionValue, useMotionValueEvent, useReducedMotion } from "motion/react";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type Ref } from "react";
import "./arc-tokens.css";
import "./primitives.css";

/** The springs the previews run on, fitted to their recordings (docs/research/tldr-toggle/README.md): critically damped, omega 12.6 / 19 rad/s. */
export const SPRING_PILL = { type: "spring", stiffness: 160, damping: 25.6 } as const;
export const SPRING_VALUE = { type: "spring", stiffness: 360, damping: 38 } as const;
export const SPRING_HEIGHT = { type: "spring", visualDuration: 0.26, bounce: 0 } as const;
export const EASE_STANDARD = [0.22, 1, 0.36, 1] as const;
export const EASE_ENTER = [0.16, 1, 0.3, 1] as const;
/** The samples of the spring easing the previews declare for a number or letter entering (opacity over 700 ms). */
const SPRING_SAMPLES = [0, 0.0213, 0.0739, 0.1443, 0.2235, 0.305, 0.3849, 0.4606, 0.5305, 0.594, 0.6508, 0.7011, 0.7452, 0.7836, 0.8168, 0.8454, 0.8699, 0.8907, 0.9084, 0.9234, 0.9361, 0.9467, 0.9557, 0.9632, 0.9694, 0.9747, 0.979, 0.9826, 0.9857, 0.9882, 0.9902, 0.992, 0.9934, 0.9946, 0.9955, 0.9963, 1];
export const easeSpring = (t: number) => { const x = Math.min(1, Math.max(0, t)) * (SPRING_SAMPLES.length - 1), i = Math.min(SPRING_SAMPLES.length - 2, Math.floor(x)); return SPRING_SAMPLES[i] + (SPRING_SAMPLES[i + 1] - SPRING_SAMPLES[i]) * (x - i); };

// ---------------------------------------------------------------------------------------------------------------------------------------
// Segmented control
// ---------------------------------------------------------------------------------------------------------------------------------------
export interface SegOption<T extends string> { value: T; label: ReactNode; disabled?: boolean }
/** A small set of related views: a pill slides to the chosen one on a critically damped spring. Arrows, Home and End choose; only the chosen button is in the tab order. */
export function SegmentedControl<T extends string>({ options, value, onChange, label, disabled }: { options: SegOption<T>[]; value: T; onChange: (value: T) => void; label: string; disabled?: boolean }) {
  const reduce = useReducedMotion();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const pill = useRef<HTMLSpanElement>(null);
  const left = useMotionValue(0), width = useMotionValue(0);
  const [ready, setReady] = useState(false);
  const first = useRef(true);
  /** Where the pill is going: a resize that leaves it unchanged must not cut the spring short. */
  const aim = useRef({ left: -1, width: -1 });
  const key = options.map(option => option.value).join("|");
  useLayoutEffect(() => {
    const button = refs.current[options.findIndex(option => option.value === value)];
    if (!button) return;
    const target = { left: button.offsetLeft, width: button.offsetWidth };
    aim.current = target;
    if (first.current || reduce) { first.current = false; left.set(target.left); width.set(target.width); setReady(true); return; }
    const a = animate(left, target.left, SPRING_PILL), b = animate(width, target.width, SPRING_PILL);
    return () => { a.stop(); b.stop(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `options` is read through its key
  }, [value, key, reduce, left, width]);
  useEffect(() => {
    const track = pill.current?.parentElement;
    if (!track || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const button = refs.current[options.findIndex(option => option.value === value)];
      if (!button || (Math.abs(button.offsetLeft - aim.current.left) < 0.5 && Math.abs(button.offsetWidth - aim.current.width) < 0.5)) return;
      aim.current = { left: button.offsetLeft, width: button.offsetWidth };
      left.set(button.offsetLeft); width.set(button.offsetWidth);
    });
    observer.observe(track);
    return () => observer.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, key, left, width]);
  useMotionValueEvent(left, "change", latest => { if (pill.current) pill.current.style.transform = `translateX(${latest}px)`; });
  useMotionValueEvent(width, "change", latest => { if (pill.current) pill.current.style.width = `${latest}px`; });
  const move = (event: ReactKeyboardEvent, from: number) => {
    const enabled = options.map((option, index) => ({ option, index })).filter(item => !item.option.disabled);
    const at = enabled.findIndex(item => item.index === from);
    let next = at;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (at + 1) % enabled.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (at + enabled.length - 1) % enabled.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = enabled.length - 1;
    else return;
    event.preventDefault();
    const target = enabled[next];
    onChange(target.option.value);
    requestAnimationFrame(() => refs.current[target.index]?.focus({ preventScroll: true }));
  };
  return <div className="fp-seg fp-scope" role="group" aria-label={label}>
    <div className="fp-seg__track">
      <span ref={pill} className="fp-seg__selection" aria-hidden="true" style={{ opacity: ready ? 1 : 0, transform: `translateX(${left.get()}px)`, width: width.get() }} />
      {options.map((option, index) => <button key={option.value} ref={node => { refs.current[index] = node; }} type="button" className="fp-seg__button" data-value={option.value} aria-pressed={option.value === value} tabIndex={option.value === value ? 0 : -1} disabled={disabled || option.disabled} onClick={() => onChange(option.value)} onKeyDown={event => move(event, index)}><span className="fp-seg__label">{option.label}</span></button>)}
    </div>
  </div>;
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Text shimmer, button, tooltip
// ---------------------------------------------------------------------------------------------------------------------------------------
/** The sweep of a calm band across a label while something runs. */
export function TextShimmer({ children, active = true }: { children: ReactNode; active?: boolean }) {
  return <span className="fp-shimmer" data-state={active ? "active" : "idle"} aria-busy={active || undefined}><span className="fp-shimmer__label">{children}</span></span>;
}

export function Button({ tone = "secondary", icon, className, children, ...rest }: { tone?: "primary" | "secondary" | "ghost"; icon?: boolean; ref?: Ref<HTMLButtonElement> } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={["fp-btn", className].filter(Boolean).join(" ")} data-tone={tone} data-icon={icon ? "" : undefined} {...rest}>{children}</button>;
}

/** A tooltip that opens after a short hover or on keyboard focus, drawn in the body so no clipped card can cut it. */
export function Tip({ label, children, delay = 600 }: { label: string; children: ReactNode; delay?: number }) {
  const reduce = useReducedMotion();
  const wrap = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const show = useCallback((wait: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { const rect = wrap.current?.getBoundingClientRect(); if (rect) setAt({ x: rect.left + rect.width / 2, y: window.innerHeight - rect.top + 8 }); }, wait);
  }, []);
  const hide = useCallback(() => { clearTimeout(timer.current); setAt(null); }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!at) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") hide(); };
    window.addEventListener("keydown", close); window.addEventListener("scroll", hide, true);
    return () => { window.removeEventListener("keydown", close); window.removeEventListener("scroll", hide, true); };
  }, [at, hide]);
  return <span ref={wrap} style={{ display: "inline-flex" }} onPointerEnter={event => { if (event.pointerType !== "touch") show(delay); }} onPointerLeave={hide} onPointerDown={hide} onFocus={event => { if (event.target.matches(":focus-visible")) show(0); }} onBlur={hide}>
    {children}
    {typeof document !== "undefined" && createPortal(<AnimatePresence>{at && <motion.span key="tip" role="tooltip" className="fp-tip" style={{ left: at.x, bottom: at.y, x: "-50%" }} initial={reduce ? false : { opacity: 0, scale: 0.96, y: 3 }} animate={{ opacity: 1, scale: 1, y: 0, transition: { duration: reduce ? 0 : 0.14, ease: EASE_ENTER } }} exit={{ opacity: 0, transition: { duration: reduce ? 0 : 0.1 } }}>{label}</motion.span>}</AnimatePresence>, document.body)}
  </span>;
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Rolling readout
// ---------------------------------------------------------------------------------------------------------------------------------------
type Token = { key: string; kind: "digit"; digit: number } | { key: string; kind: "symbol"; char: string };
/** Digits are columns keyed from the units up, so a unit stays the same column as the number grows; every other character is keyed by itself and its place among the same ones. */
export function tokenizeReadout(text: string): Token[] {
  const tokens: Token[] = [];
  const seen = new Map<string, number>();
  const runs = [...text.matchAll(/\d+|\D/g)].map(match => match[0]);
  let run = 0;
  for (const part of runs) {
    if (/^\d+$/.test(part)) {
      [...part].forEach((digit, index) => tokens.push({ key: `d${run}.${part.length - 1 - index}`, kind: "digit", digit: Number(digit) }));
      run++;
    } else { const n = seen.get(part) ?? 0; seen.set(part, n + 1); tokens.push({ key: `s${part}${n}`, kind: "symbol", char: part }); }
  }
  return tokens;
}

/** One digit as a column of the ten: the column's value follows a spring and every glyph sits at (digit - value) em, fading and blurring with its distance, so a number counts through the digits between. */
function DigitColumn({ digit, instant }: { digit: number; instant: boolean }) {
  const value = useMotionValue(digit);
  const glyphs = useRef<(HTMLSpanElement | null)[]>([]);
  const paint = useCallback((current: number) => {
    glyphs.current.forEach((node, glyph) => {
      if (!node) return;
      const delta = (((glyph - current + 5) % 10) + 10) % 10 - 5, distance = Math.abs(delta * 1.05), opacity = Math.max(0, 1 - Math.pow(distance, 1.5));
      node.style.transform = Math.abs(delta) < 0.0005 ? "none" : `translateY(${(delta * 1.05).toFixed(3)}em)`;
      node.style.opacity = String(opacity); node.style.visibility = opacity <= 0.001 ? "hidden" : "visible";
      node.style.filter = Math.abs(delta) < 0.0005 ? "none" : `blur(${Math.min(3, Math.abs(delta) * 3).toFixed(2)}px)`;
    });
  }, []);
  useLayoutEffect(() => paint(value.get()), [paint, value]);
  useMotionValueEvent(value, "change", paint);
  useEffect(() => {
    if (instant) { value.set(digit); return; }
    const controls = animate(value, digit, SPRING_VALUE);
    return () => controls.stop();
  }, [digit, instant, value]);
  return <span className="fp-num__col"><span className="fp-num__sizer">0</span>{Array.from({ length: 10 }, (_, glyph) => <span key={glyph} ref={node => { glyphs.current[glyph] = node; }} className="fp-num__glyph">{glyph}</span>)}</span>;
}

/** The slider's readout: aria-hidden (the thumb carries the spoken value). */
export function RollingReadout({ text }: { text: string }) {
  const reduce = useReducedMotion() ?? false;
  const tokens = tokenizeReadout(text);
  const initial = useRef(true);
  useEffect(() => { initial.current = false; }, []);
  return <span className="fp-num" aria-hidden="true"><AnimatePresence initial={false}>{tokens.map(token => <motion.span key={token.key} className={token.kind === "digit" ? undefined : "fp-num__sym"} style={{ display: "inline-block", overflow: "clip", whiteSpace: "pre" }}
    initial={reduce ? false : { opacity: 0, filter: "blur(4px)", width: 0 }} animate={{ opacity: 1, filter: "blur(0px)", width: "auto", transition: reduce ? { duration: 0 } : { opacity: { duration: 0.7, ease: easeSpring }, filter: { duration: 0.24, ease: EASE_ENTER }, width: SPRING_VALUE } }}
    exit={reduce ? undefined : { opacity: 0, filter: "blur(2px)", width: 0, transition: { opacity: { duration: 0.12, ease: "easeOut" }, filter: { duration: 0.12, ease: "easeOut" }, width: { duration: 0.2, ease: "easeOut" } } }}>
    {token.kind === "digit" ? <DigitColumn digit={token.digit} instant={reduce} /> : token.char}</motion.span>)}</AnimatePresence></span>;
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Slider
// ---------------------------------------------------------------------------------------------------------------------------------------
export interface SliderProps {
  label: string; value: number; min: number; max: number; step?: number;
  /** The words the thumb speaks and the readout shows for a value. */
  valueText: (value: number) => string;
  /** A drag is released, a key moves it, or the track is clicked: one call each, not one per step passed on the way. */
  onCommit: (value: number) => void;
  disabled?: boolean; className?: string;
}
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
/** A single-thumb slider: the thumb follows the pointer 1:1, then settles on the nearest step on a spring; a bubble shows the value while it is held and for 0.7 s after; the readout counts through digits. */
export function Slider({ label, value, min, max, step = 1, valueText, onCommit, disabled, className }: SliderProps) {
  const reduce = useReducedMotion() ?? false;
  const labelId = useId();
  const span = max - min, steps = Math.max(1, Math.round(span / step));
  const toFraction = useCallback((v: number) => span ? (v - min) / span : 0, [span, min]);
  const toValue = useCallback((fraction: number) => min + Math.round(fraction * steps) * step, [min, steps, step]);
  const pos = useMotionValue(toFraction(value));
  const layer = useRef<HTMLDivElement>(null), fill = useRef<HTMLDivElement>(null), thumbs = useRef<HTMLDivElement>(null), anchor = useRef<HTMLSpanElement>(null);
  const dragging = useRef(false), startedAt = useRef(value);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [live, setLive] = useState(value);
  const [held, setHeld] = useState(false), [bubble, setBubble] = useState(false);
  const shown = held ? live : value;
  const paint = useCallback((fraction: number) => {
    if (layer.current) layer.current.style.transform = `translateX(${(-(1 - fraction) * 100).toFixed(4)}%)`;
    if (fill.current) fill.current.style.clipPath = `inset(0px ${((1 - fraction) * 100).toFixed(4)}% 0px 0% round 999px)`;
    anchor.current?.style.setProperty("--at", String(+(fraction * 100).toFixed(3)));
  }, []);
  useLayoutEffect(() => paint(pos.get()), [paint, pos]);
  useMotionValueEvent(pos, "change", paint);
  useEffect(() => {
    if (dragging.current) return;
    if (reduce) { pos.set(toFraction(value)); return; }
    const controls = animate(pos, toFraction(value), SPRING_VALUE);
    return () => controls.stop();
  }, [value, reduce, pos, toFraction]);
  useEffect(() => () => clearTimeout(hideTimer.current), []);
  const settle = (to: number) => { if (reduce) pos.set(toFraction(to)); else animate(pos, toFraction(to), SPRING_VALUE); };
  const fractionAt = (event: ReactPointerEvent) => { const rect = thumbs.current!.getBoundingClientRect(); return clamp01((event.clientX - rect.left) / rect.width); };
  const down = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    clearTimeout(hideTimer.current);
    dragging.current = true; startedAt.current = value;
    const next = toValue(fractionAt(event));
    setLive(next); setHeld(true); setBubble(true); settle(next);
    thumbs.current?.parentElement?.querySelector<HTMLElement>("[role=slider]")?.focus({ preventScroll: true });
  };
  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const fraction = fractionAt(event);
    pos.set(fraction); setLive(toValue(fraction));
  };
  const up = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    const next = toValue(fractionAt(event));
    setHeld(false); setLive(next); settle(next);
    clearTimeout(hideTimer.current); hideTimer.current = setTimeout(() => setBubble(false), 700);
    if (next !== startedAt.current) onCommit(next);
  };
  const key = (event: ReactKeyboardEvent) => {
    if (disabled) return;
    const big = Math.max(step, Math.round(steps / 5) * step);
    const delta = event.key === "ArrowRight" || event.key === "ArrowUp" ? step : event.key === "ArrowLeft" || event.key === "ArrowDown" ? -step : event.key === "PageUp" ? big : event.key === "PageDown" ? -big : 0;
    let next = value;
    if (delta) next = Math.min(max, Math.max(min, value + delta));
    else if (event.key === "Home") next = min; else if (event.key === "End") next = max; else return;
    event.preventDefault();
    if (next !== value) onCommit(next);
  };
  return <div className={["fp-sl", className].filter(Boolean).join(" ")} data-disabled={disabled ? "" : undefined} data-dragging={held ? "" : undefined}>
    <div className="fp-sl__header"><span id={labelId} className="fp-sl__label">{label}</span><span className="fp-sl__readout" aria-hidden="true"><RollingReadout text={valueText(shown)} /></span></div>
    <div className="fp-sl__body"><div className="fp-sl__control" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      <div className="fp-sl__track">{Array.from({ length: steps - 1 }, (_, i) => <span key={i} className="fp-sl__tick" style={{ left: `${(i + 1) / steps * 100}%` }} />)}
        <div ref={fill} className="fp-sl__fill">{Array.from({ length: steps - 1 }, (_, i) => <span key={i} className="fp-sl__tick" style={{ left: `${(i + 1) / steps * 100}%` }} />)}</div></div>
      <div ref={thumbs} className="fp-sl__thumbs"><div ref={layer} className="fp-sl__layer" style={{ zIndex: 2 }}>
        <div role="slider" className="fp-sl__thumb" tabIndex={disabled ? -1 : 0} aria-labelledby={labelId} aria-valuemin={min} aria-valuemax={max} aria-valuenow={shown} aria-valuetext={valueText(shown)} aria-orientation="horizontal" aria-disabled={disabled || undefined} onKeyDown={key} />
        <span ref={anchor} className="fp-sl__anchor"><AnimatePresence>{bubble && <motion.span className="fp-sl__bubble" initial={reduce ? false : { opacity: 0, scale: 0.6, y: 6 }} animate={{ opacity: 1, scale: 1, y: 0, transition: reduce ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 36 } }} exit={{ opacity: 0, scale: reduce ? 1 : 0.8, transition: { duration: reduce ? 0 : 0.12, ease: "easeOut" } }}>{valueText(shown)}</motion.span>}</AnimatePresence></span>
      </div></div>
    </div></div>
  </div>;
}
