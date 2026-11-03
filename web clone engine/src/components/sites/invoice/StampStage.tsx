"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { DateWheel } from "./DateWheel";
import { InvoicePaper } from "./InvoicePaper";
import { StampMark, MARK_SIZE } from "./StampMark";
import type { InvoiceData } from "./invoice-model";
import { clampParts, daysInMonth, impressionTilt, inkColor, isStampDate, kindInfo, MAX_YEAR, MIN_YEAR, MONTH_SHORT, parseDate, shortDate, STAMP_INKS, STAMP_KINDS, toDate, todayDate, weekdayLabel } from "./invoice-stamp-model";
import type { InvoiceStamp, StampInk, StampKind } from "./invoice-stamp-model";
import { StageClock } from "./stage-clock";
import { paintScene } from "./stage-paint";
import { Stamp3D } from "./Stamp3D";
import { HANDLE, SOLE } from "./stamp-geometry";
import { MARK } from "./stamp-timeline";
import type { Phase } from "./stamp-timeline";
import "./invoice-stamp.css";

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

export interface StampStageProps {
  /** The paper in the scene is this document. */
  invoice: InvoiceData;
  /** The invoice's stamp, if it has one: the picker opens on it, and Undo goes back to it. */
  initial?: InvoiceStamp;
  /** The invoice now carries this stamp (or none, after Undo). Called when the stamp is set down, not when the scene ends. */
  onCommit: (stamp: InvoiceStamp | null) => void;
  onClose: () => void;
  onDownload: () => void;
  onNext: () => void;
}

/**
 * The invoice stamp, as a pop-up that turns into a scene. It opens as a date picker (three wheels on a soft card, the kind of stamp, its ink and
 * one button). Pressing the button does not close the picker: the card itself becomes a rubber stamp, the page behind it turns out to be the
 * invoice, the camera pulls back and tilts down over the paper, the stamp comes down, presses, and goes up leaving its impression. "Done" lets
 * the paper settle flat, and Undo plays everything backwards to the picker.
 *
 * The scene is `poseAt(phase, time)` (stamp-timeline.ts), played by a StageClock and written to the DOM by `paintScene` on every frame.
 * Nothing is a picture: the card, the stamp's body, the paper, the shadow and the impression are all DOM and SVG built here.
 */
export function StampStage({ invoice, initial, onCommit, onClose, onDownload, onNext }: StampStageProps) {
  const { t: uiText } = useWorkspaceI18n();
  // The stamp the invoice had when the pop-up opened: Undo goes back to it, even after the invoice has been given a new one
  const [original] = useState(initial);
  const start = original && isStampDate(original.date) ? original : undefined;
  const [kind, setKind] = useState<StampKind>(start?.kind ?? "paid");
  const [ink, setInk] = useState<StampInk>(start?.ink ?? kindInfo(start?.kind ?? "paid").ink);
  const [parts, setParts] = useState(() => parseDate(start?.date ?? todayDate()));
  const [phase, setPhase] = useState<Phase>("pick");
  const [placed, setPlaced] = useState<InvoiceStamp | null>(null);
  const [scale, setScale] = useState(1);
  const [reduced, setReduced] = useState(false);
  const [announce, setAnnounce] = useState("");
  const refs = useRef<Record<string, HTMLElement | null>>({});
  const root = useRef<HTMLDivElement | null>(null), opener = useRef<Element | null>(null);
  const clock = useRef<StageClock | null>(null);
  const mark = useRef({ tilt: 0, color: "#c9382c" });
  const ref = (name: string) => (element: HTMLElement | null) => { refs.current[name] = element; };

  const date = toDate(parts), info = kindInfo(kind), color = inkColor(ink);
  const current = useMemo<InvoiceStamp>(() => ({ kind, date, ink }), [kind, date, ink]);
  const shown = placed ?? current;

  // The clock outlives renders; it is created once, after the elements exist
  useLayoutEffect(() => {
    const made = new StageClock({
      paint: (pose, now, bob) => paintScene(refs.current, pose, now, bob, mark.current),
      phase: setPhase,
    });
    clock.current = made;
    made.rest("pick");
    return () => { made.dispose(); clock.current = null; };
  }, []);
  useLayoutEffect(() => { mark.current = { tilt: impressionTilt(shown), color: inkColor(shown.ink) }; });
  // The poses that do not animate are painted again when the scene is resized or the stamp changes
  useLayoutEffect(() => { if (phase === "pick" || phase === "final") clock.current?.rest(phase); }, [phase, scale, placed]);

  useLayoutEffect(() => {
    const resize = () => setScale(clamp(Math.min(window.innerWidth / 440, window.innerHeight / 500), 0.62, 1.35));
    resize();
    window.addEventListener("resize", resize);
    const media = window.matchMedia("(prefers-reduced-motion: reduce)"), change = () => setReduced(media.matches);
    change(); media.addEventListener("change", change);
    return () => { window.removeEventListener("resize", resize); media.removeEventListener("change", change); };
  }, []);

  // ----- acting -----
  function confirm() {
    if (phase !== "pick") return;
    setPlaced(current);
    onCommit(current);
    setAnnounce(`${kindInfo(current.kind).done}, ${shortDate(current.date)}`);
    if (reduced) clock.current?.jump("final"); else clock.current?.play();
  }
  function done() {
    if (phase !== "hold" && phase !== "play") return;
    if (reduced) clock.current?.jump("final"); else clock.current?.exit();
  }
  function undo() {
    if (phase !== "hold" && phase !== "play" && phase !== "final") return;
    onCommit(start ?? null);
    setPlaced(null);
    setAnnounce("Stamp removed");
    if (phase === "final" || reduced) clock.current?.jump("pick"); else clock.current?.rewind();
  }

  // Escape and Enter do the obvious thing for the phase; Tab stays inside the pop-up
  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const onButton = (event.target as HTMLElement).closest("button") !== null;
    if (event.key === "Enter" && !onButton) {
      if (phase === "pick") { event.preventDefault(); confirm(); }
      else if (phase === "hold") { event.preventDefault(); done(); }
      return;
    }
    if (event.key !== "Tab") return;
    const items = [...(root.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [role="spinbutton"]:not([aria-readonly])') ?? [])].filter(item => item.offsetParent !== null && getComputedStyle(item).visibility !== "hidden" && getComputedStyle(item.closest<HTMLElement>("[data-layer]") ?? item).pointerEvents !== "none");
    if (!items.length) { event.preventDefault(); return; }
    const first = items[0], end = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); end.focus(); }
    else if (!event.shiftKey && document.activeElement === end) { event.preventDefault(); first.focus(); }
  }

  // Escape works wherever the focus is (a click on the paper leaves it on the pop-up itself, a closed print window leaves it on the page)
  const escape = useRef<() => void>(() => {});
  useLayoutEffect(() => { escape.current = () => { if (phase === "pick" || phase === "final") onClose(); else if (phase === "hold") done(); else clock.current?.skip(); }; });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => { if (event.key !== "Escape") return; event.preventDefault(); event.stopPropagation(); escape.current(); };
    document.addEventListener("keydown", listener, true);
    return () => document.removeEventListener("keydown", listener, true);
  }, []);

  // Focus: into the pop-up when it opens, to the button that matters in each phase, and back to where it came from when it closes
  useEffect(() => { opener.current = document.activeElement; return () => { if (opener.current instanceof HTMLElement) opener.current.focus({ preventScroll: true }); }; }, []);
  useEffect(() => {
    const target = phase === "pick" ? refs.current.go : phase === "hold" ? refs.current.undoDone : phase === "final" ? refs.current.download : null;
    target?.focus({ preventScroll: true });
  }, [phase]);

  // A test hook: scrub the scene to an exact moment, which pauses the clock.
  // `element.dispatchEvent(new CustomEvent("stamp-seek", { detail: { phase: "play", time: 1.3 } }))`; a null detail lets go.
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const seek = (event: Event) => {
      const detail = (event as CustomEvent<{ phase: Phase; time: number } | null>).detail;
      if (detail && detail.phase !== "pick") setPlaced(was => was ?? { kind, date, ink });
      clock.current?.seek(detail);
    };
    element.addEventListener("stamp-seek", seek);
    return () => element.removeEventListener("stamp-seek", seek);
  }, [kind, date, ink]);

  const days = Array.from({ length: daysInMonth(parts.y, parts.m) }, (_, index) => ({ value: index + 1, text: String(index + 1) }));
  const months = Array.from({ length: 12 }, (_, index) => ({ value: index + 1, text: MONTH_SHORT[index] }));
  const years = Array.from({ length: MAX_YEAR - MIN_YEAR + 1 }, (_, index) => ({ value: MIN_YEAR + index, text: String(MIN_YEAR + index) }));
  const picking = phase === "pick";
  const below = HANDLE.h / 2 - 21;
  const pickKind = (id: StampKind) => { const next = STAMP_KINDS.find(item => item.id === id); if (!next) return; setKind(next.id); setInk(next.ink); };

  const stage = <div ref={root} className="inv-stage" role="dialog" aria-modal="true" aria-label={uiText("Stamp this invoice")} data-phase={phase} data-reduced={reduced ? "" : undefined} tabIndex={-1} style={{ "--stg-ink": color } as CSSProperties} onKeyDown={onKeyDown}>
    <div className="inv-stage__flat" ref={ref("flat")} onPointerDown={() => { if (phase === "pick") onClose(); }} />
    <div className="inv-stage__table" ref={ref("table")} />
    {(phase === "pick" || phase === "final") && <button type="button" className="inv-stage__close" aria-label={uiText("Close")} onClick={onClose}><svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="m4 4 8 8M12 4l-8 8" /></svg></button>}

    <div className="inv-stage__world" style={{ transform: `scale(${scale})` }}>
      <div className="inv-stage__camera">
        <div className="inv-stage__paper" ref={ref("paper")}>
          <InvoicePaper invoice={invoice} />
          <div className="inv-stage__shade inv-stage__shade--handle" ref={ref("shadeHandle")} style={{ width: HANDLE.w, height: HANDLE.h, borderRadius: HANDLE.radius }} />
          <div className="inv-stage__shade inv-stage__shade--die" ref={ref("shadeDie")} style={{ width: SOLE.w, height: SOLE.h, borderRadius: SOLE.radius }} />
          <div className="inv-stage__mark" ref={ref("mark")} style={{ left: MARK.x - MARK_SIZE.w / 2, top: MARK.y - MARK_SIZE.h / 2, width: MARK_SIZE.w, height: MARK_SIZE.h }}><StampMark stamp={shown} /></div>
        </div>
        <Stamp3D refFor={ref} face={
          <div className="inv-face">
            <div className="inv-face__head"><span className="inv-face__kind">{uiText(info.tab)}</span><span className="inv-face__ink" /></div>
            <div className="inv-face__wheels">
              <DateWheel label={uiText("Day")} items={days} index={parts.d - 1} readOnly={!picking} onIndex={index => setParts(was => clampParts({ ...was, d: index + 1 }))} />
              <DateWheel label={uiText("Month")} items={months} index={parts.m - 1} readOnly={!picking} onIndex={index => setParts(was => clampParts({ ...was, m: index + 1 }))} />
              <DateWheel label={uiText("Year")} items={years} index={parts.y - MIN_YEAR} readOnly={!picking} onIndex={index => setParts(was => clampParts({ ...was, y: MIN_YEAR + index }))} />
            </div>
            <div className="inv-face__cols" aria-hidden="true"><span>{uiText("Day")}</span><span>{uiText("Month")}</span><span>{uiText("Year")}</span></div>
          </div>} />
      </div>
    </div>

    <div className="inv-stage__chrome" data-layer="" ref={ref("chrome")} style={{ top: `calc(50% + ${below * scale + 20}px)` }}>
      <p className="inv-stage__date" aria-live="polite">{uiText(weekdayLabel(date))}</p>
      <div className="inv-seg" role="radiogroup" aria-label={uiText("Kind of stamp")} style={{ "--at": STAMP_KINDS.findIndex(item => item.id === kind), "--n": STAMP_KINDS.length } as CSSProperties}>
        <span className="inv-seg__thumb" aria-hidden="true" />
        {STAMP_KINDS.map(item => <button key={item.id} type="button" role="radio" aria-checked={kind === item.id} data-active={kind === item.id ? "" : undefined} tabIndex={kind === item.id ? 0 : -1} disabled={!picking} data-kind={item.id}
          onClick={() => pickKind(item.id)}
          onKeyDown={event => {
            if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(event.key)) return;
            event.preventDefault();
            const at = STAMP_KINDS.findIndex(entry => entry.id === kind), step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : STAMP_KINDS.length - 1, next = STAMP_KINDS[(at + step) % STAMP_KINDS.length];
            pickKind(next.id);
            (event.currentTarget.parentElement?.querySelector(`[data-kind="${next.id}"]`) as HTMLElement | null)?.focus();
          }}>{uiText(item.tab)}</button>)}
      </div>
      <div className="inv-inks" role="radiogroup" aria-label={uiText("Ink")}>
        {STAMP_INKS.map(item => <button key={item.id} type="button" role="radio" aria-checked={ink === item.id} aria-label={uiText(item.label)} title={uiText(item.label)} data-active={ink === item.id ? "" : undefined} disabled={!picking} style={{ "--dot": item.color } as CSSProperties} onClick={() => setInk(item.id)} />)}
      </div>
      <button type="button" className="inv-go" disabled={!picking} onClick={confirm} ref={ref("go")}>{uiText(info.action)}</button>
    </div>

    <div className="inv-stage__toast" data-layer="" ref={ref("toast")} role="group" aria-label={uiText("Stamp placed")} style={{ top: `calc(50% + ${205 * scale}px)` }}>
      <span className="inv-stage__toast-dot" style={{ background: inkColor(shown.ink) }} aria-hidden="true" />
      <span className="inv-stage__toast-text">{uiText(kindInfo(shown.kind).done)} <i aria-hidden="true">·</i> {uiText(shortDate(shown.date))}</span>
      <button type="button" className="inv-btn" onClick={undo} disabled={phase !== "hold"}>{uiText("Undo")}</button>
      <button type="button" className="inv-go inv-go--small" ref={ref("undoDone")} onClick={done} disabled={phase !== "hold"}>{uiText("Done")}</button>
    </div>

    <div className="inv-stage__final" data-layer="" ref={ref("final")} role="group" aria-label={uiText("Invoice stamped")} style={{ top: `calc(50% + ${214 * scale}px)` }}>
      {reduced && <button type="button" className="inv-btn" onClick={undo} disabled={phase !== "final"}>{uiText("Undo")}</button>}
      <button type="button" className="inv-btn" ref={ref("download")} onClick={onDownload} disabled={phase !== "final"}>{uiText("Download PDF")}</button>
      <button type="button" className="inv-go" onClick={onNext} disabled={phase !== "final"}>{uiText("Next invoice")}</button>
    </div>
    <span className="inv-sr" role="status">{uiText(announce)}</span>
  </div>;

  return createPortal(stage, document.body);
}
