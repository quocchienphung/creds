"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { AnimatePresence, animate, motion, useMotionTemplate, useMotionValue, usePresence, useReducedMotion, useTransform } from "motion/react";
import type { MotionValue } from "motion/react";
import { AnimatedNumber } from "../terrain/AnimatedNumber";
import {
  LANE_HEIGHT, NAME_EXTRA, hitTest, labelMode, layoutSpans, leaderPath, placeOutside, shareText, sharesOf, stepHighlight,
  type LabelMode, type Share, type Span, type SplitSegment,
} from "./split-bar-model.ts";
import "../terrain/activity-terrain.css";
import "./split-bar.css";

export type { SplitSegment } from "./split-bar-model.ts";

/** Edges, labels and leaders ride one critically damped spring (14.5 rad/s: fitted to the recorded edges, rms 1 % of the travel). */
const EDGE = { type: "spring", stiffness: 210, damping: 29 } as const;
const FADE = { duration: 0.24, ease: [0.22, 1, 0.36, 1] } as const;
const RAMP = 7;

export interface SplitBarProps {
  segments: readonly SplitSegment[];
  title: string;
  description?: string;
  /** number format of the values in the readout; shares always read as percentages with one decimal */
  format?: Intl.NumberFormatOptions;
  unit?: string;
  totalLabel?: string;
  hidden?: readonly string[];
  defaultHidden?: readonly string[];
  onHiddenChange?: (hidden: string[]) => void;
  legend?: boolean;
  locale?: string;
  label?: string;
  className?: string;
  style?: CSSProperties;
  /** A part lit from outside (the terrain's hovered hour); the pointer and keyboard on the bar itself win. */
  highlightId?: string | null;
  /** The part lit by this bar's own pointer, keyboard or legend (`null`: none). Not called for `highlightId`. */
  onHighlightChange?: (id: string | null) => void;
  /** Said inside the empty bar. */
  emptyLabel?: string;
  tone?: "neutral" | "danger";
}

type How = "pointer" | "keyboard" | "legend" | "touch";
interface Metrics { names: Record<string, number>; digit: number; dot: number; percent: number }
const sameMetrics = (a: Metrics | null, b: Metrics) => a !== null && a.digit === b.digit && a.dot === b.dot && a.percent === b.percent && Object.keys(b.names).every(name => a.names[name] === b.names[name]);

/** One part of the bar: a full-width layer cut to its share by an animated clip-path, so its labels slide with it and are cut cleanly at its edge. */
function Layer({ share, span, barW, mode, text, highlighted, dimmed, reduced, color }: { share: Share; span: Span; barW: MotionValue<number>; mode: LabelMode; text: string; highlighted: boolean; dimmed: boolean; reduced: boolean; color: string }) {
  const { t: uiText } = useWorkspaceI18n();
  // a part opens from nothing where it will stand
  const left = useMotionValue(span.left * 100), right = useMotionValue(100 - span.left * 100);
  const [present, safeToRemove] = usePresence();
  useEffect(() => {
    if (!present) return;
    const toLeft = span.left * 100, toRight = 100 - span.right * 100;
    if (reduced) { left.set(toLeft); right.set(toRight); return; }
    const a = animate(left, toLeft, EDGE), b = animate(right, toRight, EDGE);
    return () => { a.stop(); b.stop(); };
  }, [present, span.left, span.right, reduced, left, right]);
  // a part that left the data folds up where it stands, then goes
  useEffect(() => {
    if (present) return;
    const middle = (left.get() + 100 - right.get()) / 2;
    const a = reduced ? null : animate(left, middle, EDGE), b = reduced ? null : animate(right, 100 - middle, EDGE);
    const done = window.setTimeout(() => safeToRemove?.(), reduced ? 0 : 380);
    return () => { a?.stop(); b?.stop(); window.clearTimeout(done); };
  }, [present, reduced, left, right, safeToRemove]);

  const gapLeft = useTransform(left, value => (value > 0.05 ? 1 : 0)), gapRight = useTransform(right, value => (value > 0.05 ? 1 : 0));
  // rounded to a thousandth of a percent: a spring's tail would otherwise write numbers like 1.2e-14 into the style
  const leftPct = useTransform(left, value => Math.round(value * 1000) / 1000), rightPct = useTransform(right, value => Math.round(value * 1000) / 1000);
  const clipPath = useMotionTemplate`inset(0px calc(${rightPct}% + ${gapRight}px) 0px calc(${leftPct}% + ${gapLeft}px) round 4px)`;
  const capX = useTransform([right, barW], ([r, w]: number[]) => (1 - r / 100) * w - 4);
  const capOpacity = useTransform([left, right, barW], ([l, r, w]: number[]) => Math.min(1, Math.max(0, (((100 - r - l) / 100) * w) / 6)));
  const insideX = useTransform([left, barW], ([l, w]: number[]) => (l / 100) * w + 10);
  const lastText = useRef(text);
  if (share.share > 0) lastText.current = text;
  const showName = mode === "name";
  return <motion.span className="sb__segment" aria-hidden="true" data-hl={highlighted ? "" : undefined} data-dim={dimmed ? "" : undefined} data-leaving={present ? undefined : ""} style={{ "--seg": color, clipPath } as never}>
    <motion.span className="sb__cap" style={{ x: capX, opacity: capOpacity }} />
    <motion.span className="sb__inside" data-mode={mode} style={{ x: insideX }}>
      <motion.span className="sb__insideName" initial={false} animate={{ width: showName ? "auto" : 0, opacity: showName ? 1 : 0, marginRight: showName ? 5 : 0 }} transition={reduced ? { duration: 0 } : EDGE}>{uiText(share.short)}</motion.span>
      <AnimatedNumber text={lastText.current} />
    </motion.span>
  </motion.span>;
}

/** The S-shaped line from a part on the bar to its label in the lane; both ends glide, so it morphs with them. */
function Leader({ anchor, centre, reduced }: { anchor: number; centre: number; reduced: boolean }) {
  const a = useMotionValue(anchor), c = useMotionValue(centre);
  useEffect(() => {
    if (reduced) { a.set(anchor); c.set(centre); return; }
    const x = animate(a, anchor, EDGE), y = animate(c, centre, EDGE);
    return () => { x.stop(); y.stop(); };
  }, [anchor, centre, reduced, a, c]);
  const d = useTransform([a, c], ([ax, lx]: number[]) => leaderPath(ax, lx));
  return <motion.path className="sb__leader" d={d} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={reduced ? { duration: 0 } : FADE} />;
}

/**
 * One 100 % bar split into shares: rest on a part to widen it and read its exact figures, switch parts off from the legend and the rest reflow on
 * springs, labels sit inside a part when they fit and on leader lines under the bar when they do not.
 * An independent build of the public UIArc "Split bar" preview, measured from what it paints (docs/research/uiarc-split-bar); no UIArc source or API.
 */
export function SplitBar({
  segments, title, description, format, unit, totalLabel = "Total", hidden: hiddenProp, defaultHidden, onHiddenChange, legend = true, locale = "en-US", label, className, style,
  highlightId = null, onHighlightChange, emptyLabel = "Nothing to show", tone = "neutral",
}: SplitBarProps) {
  const { t: uiText } = useWorkspaceI18n();
  const titleId = useId(), reduced = useReducedMotion() ?? false;
  const barRef = useRef<HTMLDivElement>(null), measureRef = useRef<HTMLSpanElement>(null);
  const barW = useMotionValue(0);
  const [barPx, setBarPx] = useState(0);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [inner, setInner] = useState<readonly string[]>(defaultHidden ?? []);
  const [own, setOwn] = useState<{ id: string; how: How } | null>(null);
  const [live, setLive] = useState("");
  const [shake, setShake] = useState<{ id: string; n: number } | null>(null);

  const hidden = hiddenProp ?? inner;
  const hiddenSet = useMemo(() => new Set(hidden), [hidden]);
  const { shares, total } = useMemo(() => sharesOf(segments, hiddenSet), [segments, hiddenSet]);
  const visible = useMemo(() => shares.filter(item => item.share > 0), [shares]);
  const visibleIds = useMemo(() => visible.map(item => item.id), [visible]);
  const numberFormat = useMemo(() => new Intl.NumberFormat(locale, format), [locale, format]);
  const formatValue = useCallback((value: number) => numberFormat.format(value), [numberFormat]);
  const unitText = unit ? ` ${unit}` : "";

  const ownId = own && visibleIds.includes(own.id) ? own.id : null;
  const activeId = ownId ?? (highlightId !== null && visibleIds.includes(highlightId) ? highlightId : null);

  // the bar's width, and the widths of the texts that go on it (measured when the data or the fonts change, never while moving)
  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const read = () => { const width = bar.getBoundingClientRect().width; barW.set(width); setBarPx(width); };
    read();
    const observer = new ResizeObserver(read);
    observer.observe(bar);
    return () => observer.disconnect();
  }, [barW]);
  const names = useMemo(() => [...new Set(shares.map(item => item.short))], [shares]);
  const namesKey = names.join("\u0000");
  useLayoutEffect(() => {
    const root = measureRef.current;
    if (!root) return;
    let live = true;
    const read = () => {
      if (!live) return;
      const width = (selector: string) => root.querySelector<HTMLElement>(selector)?.getBoundingClientRect().width ?? 0;
      const next: Metrics = { names: {}, digit: width('[data-g="0"]'), dot: width('[data-g="."]'), percent: width('[data-g="%"]') };
      root.querySelectorAll<HTMLElement>("[data-n]").forEach(node => { next.names[node.dataset.n ?? ""] = node.getBoundingClientRect().width; });
      setMetrics(previous => (sameMetrics(previous, next) ? previous : next));
    };
    read();
    void document.fonts?.ready.then(read);
    return () => { live = false; };
  }, [namesKey]);

  const shareWidth = useCallback((text: string) => {
    if (!metrics) return 0;
    let width = 0;
    for (const char of text) width += char === "." ? metrics.dot : char === "%" ? metrics.percent : metrics.digit;
    return width;
  }, [metrics]);
  const nameWidth = useCallback((short: string) => metrics?.names[short] ?? 0, [metrics]);

  const neededPx = useCallback((id: string) => {
    const item = shares.find(share => share.id === id);
    return item ? nameWidth(item.short) + shareWidth(shareText(item.share)) + NAME_EXTRA : 0;
  }, [shares, nameWidth, shareWidth]);
  const base = useMemo(() => layoutSpans(shares, null, () => 0, barPx), [shares, barPx]);
  const spans = useMemo(() => layoutSpans(shares, activeId, neededPx, barPx), [shares, activeId, neededPx, barPx]);
  const spanOf = useMemo(() => new Map(spans.map(span => [span.id, span])), [spans]);

  const modes = useMemo(() => new Map(shares.map(item => {
    const span = spanOf.get(item.id), width = span ? (span.right - span.left) * barPx : 0;
    const mode: LabelMode = !metrics ? "share" : labelMode(width, nameWidth(item.short), shareWidth(shareText(item.share)));
    return [item.id, item.share > 0 ? mode : "outside"] as const;
  })), [shares, spanOf, barPx, metrics, nameWidth, shareWidth]);

  const outside = useMemo(() => placeOutside(visible.filter(item => modes.get(item.id) === "outside").map(item => {
    const span = spanOf.get(item.id) as Span;
    return { id: item.id, anchor: ((span.left + span.right) / 2) * barPx, width: nameWidth(item.short) + 4 + shareWidth(shareText(item.share)) };
  }), barPx), [visible, modes, spanOf, barPx, nameWidth, shareWidth]);

  // what the bar's own pointer / keyboard / legend lit, told to the host (not what the host lit)
  const told = useRef<string | null>(null);
  useEffect(() => {
    if (told.current === ownId) return;
    told.current = ownId;
    onHighlightChange?.(ownId);
  }, [ownId, onHighlightChange]);
  useEffect(() => () => { if (told.current !== null) { told.current = null; onHighlightChange?.(null); } }, [onHighlightChange]);

  const announce = (message: string) => setLive(previous => (previous === message ? `${message}​` : message));
  const describe = (item: Share) => `${item.label}, ${shareText(item.share)}, ${formatValue(item.value)}${unitText}`;

  function setHidden(next: string[]) {
    if (hiddenProp === undefined) setInner(next);
    onHiddenChange?.(next);
  }
  function toggle(id: string) {
    const item = shares.find(share => share.id === id);
    if (!item) return;
    const off = hiddenSet.has(id);
    if (!off && visible.length <= 1) {
      setShake(previous => ({ id, n: (previous?.n ?? 0) + 1 }));
      announce(`${item.label} is the only share shown, so it stays on.`);
      return;
    }
    setHidden(off ? hidden.filter(entry => entry !== id) : [...hidden, id]);
    setOwn(current => (current?.id === id ? null : current));
    announce(`${item.label} ${off ? "shown" : "hidden"}.`);
  }

  // ---- pointer, touch, keyboard on the bar ----
  const fraction = (clientX: number) => { const rect = barRef.current?.getBoundingClientRect(); return rect && rect.width > 0 ? (clientX - rect.left) / rect.width : -1; };
  const onPointerMove = (event: ReactPointerEvent) => {
    if (event.pointerType === "touch") return;
    const id = hitTest(fraction(event.clientX), base, spans, own?.how === "pointer" ? own.id : null);
    setOwn(current => (id ? (current?.id === id && current.how === "pointer" ? current : { id, how: "pointer" }) : current?.how === "pointer" ? null : current));
  };
  const onPointerLeave = (event: ReactPointerEvent) => { if (event.pointerType !== "touch") setOwn(current => (current?.how === "pointer" ? null : current)); };
  const onPointerDown = (event: ReactPointerEvent) => {
    if (event.pointerType !== "touch") return;
    const id = hitTest(fraction(event.clientX), base, base, null);
    setOwn(id ? { id, how: "touch" } : null);
  };
  useEffect(() => {
    if (own?.how !== "touch") return;
    const away = (event: PointerEvent) => { if (!barRef.current?.contains(event.target as Node)) setOwn(null); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [own?.how]);

  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const move = (key: "next" | "previous" | "first" | "last") => {
      event.preventDefault();
      const id = stepHighlight(visibleIds, ownId, key);
      if (id === null) return;
      setOwn({ id, how: "keyboard" });
      const item = visible.find(share => share.id === id);
      if (item) announce(describe(item));
    };
    switch (event.key) {
      case "ArrowRight": case "ArrowDown": move("next"); break;
      case "ArrowLeft": case "ArrowUp": move("previous"); break;
      case "Home": move("first"); break;
      case "End": move("last"); break;
      case "Enter": case " ":
        event.preventDefault();
        if (ownId !== null) toggle(ownId);
        break;
      case "Escape": if (ownId !== null) { event.preventDefault(); setOwn(null); announce(""); } break;
      default:
    }
  };

  const active = activeId === null ? null : shares.find(item => item.id === activeId) ?? null;
  const colorOf = (item: Share) => item.color ?? `oklch(var(--sb-l${(item.index % RAMP) + 1}) var(--sb-c) var(--sb-h))`;
  const barLabel = `${label ?? title}: ${visible.map(item => `${item.label} ${shareText(item.share)}`).join(", ")}. Use the arrow keys to read each share.`;
  const lineKey = active ? active.id : "total";

  return <figure className={["sb", className].filter(Boolean).join(" ")} style={style} data-tone={tone} aria-labelledby={titleId}>
    <span ref={measureRef} className="sb__measure" aria-hidden="true">
      {names.map(name => <span key={name} data-n={name} className="sb__mName">{name}</span>)}
      <span className="sb__mNum" data-g="0">0</span><span className="sb__mNum" data-g=".">.</span><span className="sb__mNum" data-g="%">%</span>
    </span>
    <div className="sb__head">
      <div className="sb__heading">
        <p id={titleId} className="sb__title">{uiText(title)}</p>
        {description && <p className="sb__description">{uiText(description)}</p>}
      </div>
      <div className="sb__readout" aria-hidden="true">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={lineKey} className="sb__readoutLine" initial={{ opacity: 0, y: reduced ? 0 : 6, filter: reduced ? "blur(0px)" : "blur(2px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: reduced ? 0 : -6, filter: reduced ? "blur(0px)" : "blur(2px)" }} transition={reduced ? { duration: 0 } : FADE}>
            {active && <span className="sb__dot" style={{ "--seg": colorOf(active) } as CSSProperties} />}
            <span className="sb__readoutName">{uiText(active ? active.label : totalLabel)}</span>
            <span className="sb__readoutShare"><AnimatedNumber text={active ? shareText(active.share) : formatValue(total)} /></span>
            <span className="sb__readoutValue">{active ? <><AnimatedNumber text={formatValue(active.value)} />{uiText(unitText)}</> : unit}</span>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
    <div ref={barRef} className="sb__bar" tabIndex={0} role="group" aria-roledescription="split bar" aria-label={uiText(barLabel)} data-empty={visible.length === 0 ? "" : undefined} onPointerMove={onPointerMove} onPointerLeave={onPointerLeave} onPointerDown={onPointerDown} onKeyDown={onKeyDown} onBlur={() => setOwn(current => (current?.how === "keyboard" ? null : current))}>
      <AnimatePresence initial>
        {shares.map(item => {
          const span = spanOf.get(item.id);
          if (!span) return null;
          return <Layer key={item.id} share={item} span={span} barW={barW} mode={modes.get(item.id) ?? "share"} text={shareText(item.share)} highlighted={item.id === activeId} dimmed={activeId !== null && item.id !== activeId} reduced={reduced} color={colorOf(item)} />;
        })}
      </AnimatePresence>
      {visible.length === 0 && <span className="sb__emptyLabel">{uiText(emptyLabel)}</span>}
    </div>
    <motion.div className="sb__lane" aria-hidden="true" initial={false} animate={{ height: outside.length > 0 ? LANE_HEIGHT : 0 }} transition={reduced ? { duration: 0 } : EDGE}>
      <svg className="sb__leaders" width="100%" height={LANE_HEIGHT}>
        <AnimatePresence>
          {outside.map(item => <Leader key={item.id} anchor={item.anchor} centre={item.left + item.width / 2} reduced={reduced} />)}
        </AnimatePresence>
      </svg>
      <AnimatePresence>
        {outside.map(item => {
          const share = shares.find(entry => entry.id === item.id);
          if (!share) return null;
          return <motion.span key={item.id} className="sb__outside" initial={{ x: item.left, opacity: 0 }} animate={{ x: item.left, opacity: 1 }} exit={{ opacity: 0 }} transition={reduced ? { duration: 0 } : { x: EDGE, opacity: FADE }}>
            <span className="sb__outsideName">{uiText(share.short)}</span><AnimatedNumber text={shareText(share.share)} />
          </motion.span>;
        })}
      </AnimatePresence>
    </motion.div>
    {legend && <ul className="sb__legend" aria-label={uiText("{0} segments", [label ?? title])}>
      {shares.map(item => {
        const off = hiddenSet.has(item.id);
        return <li key={item.id}>
          <button type="button" className="sb__legendItem" aria-pressed={!off} aria-label={uiText(off ? uiText("{0}, hidden", [item.label]) : uiText("{0}, {1}", [item.label, shareText(item.share)]))} data-off={off ? "true" : undefined} style={{ "--seg": colorOf(item) } as CSSProperties}
            onClick={() => toggle(item.id)}
            onPointerEnter={event => { if (event.pointerType === "mouse" && !off) setOwn({ id: item.id, how: "legend" }); }}
            onPointerLeave={event => { if (event.pointerType === "mouse") setOwn(current => (current?.how === "legend" && current.id === item.id ? null : current)); }}>
            <motion.span key={shake?.id === item.id ? shake.n : 0} className="sb__legendLabel" initial={{ x: 0 }} animate={shake?.id === item.id && shake.n > 0 && !reduced ? { x: [0, -3, 3, -2, 2, 0] } : { x: 0 }} transition={{ duration: 0.32, ease: "easeOut" }}>
              <span className="sb__swatch" aria-hidden="true" /><span className="sb__legendName">{uiText(item.label)}</span>
            </motion.span>
            <span className="sb__legendShare" aria-hidden="true">{off ? <span className="sb__legendOff">{uiText("Off")}</span> : <AnimatedNumber text={shareText(item.share)} />}</span>
          </button>
        </li>;
      })}
    </ul>}
    <p className="sb__sr" role="status" aria-live="polite" aria-atomic="true">{uiText(live)}</p>
  </figure>;
}
