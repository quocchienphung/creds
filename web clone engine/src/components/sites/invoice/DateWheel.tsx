"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from "react";

export interface WheelItem { value: number; text: string }
/** The distance between two rows, in the picker's own units. */
export const WHEEL_PITCH = 22;
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/**
 * One column of the date picker: a drum of values with the chosen one in the middle. Drag it, flick it, scroll the mouse wheel over it, tap a
 * neighbour, or use the arrow keys, Page Up/Down, Home and End. It always comes to rest on a row, and it is a spinbutton for assistive tech.
 * Rows farther from the middle fade and blur, as the rows of a real drum fall away from you.
 */
export function DateWheel({ label, items, index, onIndex, readOnly = false }: { label: string; items: readonly WheelItem[]; index: number; onIndex: (index: number) => void; readOnly?: boolean }) {
  const { t: uiText } = useWorkspaceI18n();
  const last = items.length - 1;
  const [pos, setPos] = useState(index);
  const posRef = useRef(index), target = useRef(index), frame = useRef(0), clock = useRef(0);
  const drag = useRef<{ id: number; y: number; from: number; moved: boolean; samples: { t: number; y: number }[] } | null>(null);
  const wheel = useRef(0), root = useRef<HTMLDivElement | null>(null), notify = useRef(onIndex);
  useEffect(() => { notify.current = onIndex; });

  const show = useCallback((value: number) => { posRef.current = value; setPos(value); }, []);
  const settle = useCallback(() => {
    cancelAnimationFrame(frame.current);
    clock.current = 0;
    const step = (now: number) => {
      const dt = clock.current ? Math.min(0.05, (now - clock.current) / 1000) : 1 / 60;
      clock.current = now;
      const gap = target.current - posRef.current;
      if (Math.abs(gap) < 0.003) { show(target.current); return; }
      // critically damped approach: quick to start, soft to arrive
      show(posRef.current + gap * (1 - Math.exp(-dt * 17)));
      frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
  }, [show]);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  // The value changed from outside (another wheel shortened the month, the picker was reset): glide there
  useEffect(() => { target.current = clamp(index, 0, Math.max(0, last)); settle(); }, [index, last, settle]);

  const choose = (next: number) => { const value = clamp(Math.round(next), 0, last); target.current = value; settle(); if (value !== index) notify.current(value); };

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (readOnly || event.button > 0) return;
    cancelAnimationFrame(frame.current);
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id: event.pointerId, y: event.clientY, from: posRef.current, moved: false, samples: [{ t: event.timeStamp, y: event.clientY }] };
  }
  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const gesture = drag.current;
    if (!gesture || gesture.id !== event.pointerId) return;
    const scale = (root.current?.getBoundingClientRect().height ?? 0) / (WHEEL_PITCH * 5) || 1;
    const moved = event.clientY - gesture.y;
    if (Math.abs(moved) > 3) gesture.moved = true;
    if (!gesture.moved) return;
    // past either end the drum gives, but not freely
    const raw = gesture.from - moved / (WHEEL_PITCH * scale), over = raw < 0 ? raw : raw > last ? raw - last : 0;
    show(over ? (raw < 0 ? 0 : last) + over * 0.3 : raw);
    gesture.samples.push({ t: event.timeStamp, y: event.clientY });
    if (gesture.samples.length > 6) gesture.samples.shift();
  }
  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const gesture = drag.current;
    if (!gesture || gesture.id !== event.pointerId) return;
    drag.current = null;
    const scale = (root.current?.getBoundingClientRect().height ?? 0) / (WHEEL_PITCH * 5) || 1;
    if (!gesture.moved) {
      // a tap: the row under the finger comes to the middle
      const rect = root.current?.getBoundingClientRect();
      const offset = rect ? Math.round((event.clientY - (rect.top + rect.height / 2)) / (WHEEL_PITCH * scale)) : 0;
      choose(index + offset);
      return;
    }
    const first = gesture.samples[0], end = gesture.samples[gesture.samples.length - 1];
    const speed = end.t > first.t ? -((end.y - first.y) / (end.t - first.t)) * 1000 / (WHEEL_PITCH * scale) : 0; // rows per second
    choose(posRef.current + clamp(speed * 0.18, -12, 12));
  }
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (readOnly) return;
    const moves: Record<string, number> = { ArrowUp: -1, ArrowDown: 1, PageUp: -5, PageDown: 5 };
    if (event.key in moves) { event.preventDefault(); choose(index + moves[event.key]); }
    else if (event.key === "Home") { event.preventDefault(); choose(0); }
    else if (event.key === "End") { event.preventDefault(); choose(last); }
  }
  // The mouse wheel needs a non-passive listener to keep the page from scrolling while the drum turns
  useEffect(() => {
    const element = root.current;
    if (!element || readOnly) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      wheel.current += event.deltaY;
      if (Math.abs(wheel.current) < 40) return;
      const direction = Math.sign(wheel.current);
      wheel.current = 0;
      choose(target.current + direction);
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
    // `choose` reads the latest index through the ref and the closure of the render it belongs to
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, index, last]);

  const rows: { item: WheelItem; at: number }[] = [];
  for (let at = Math.max(0, Math.floor(pos) - 3); at <= Math.min(last, Math.ceil(pos) + 3); at += 1) rows.push({ item: items[at], at });
  const current = items[clamp(index, 0, Math.max(0, last))];

  return <div ref={root} className="inv-wheel" role="spinbutton" tabIndex={readOnly ? -1 : 0} aria-label={uiText(label)} aria-valuemin={items[0]?.value} aria-valuemax={items[last]?.value} aria-valuenow={current?.value} aria-valuetext={uiText(current?.text)} aria-readonly={readOnly || undefined}
    data-readonly={readOnly ? "" : undefined} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onKeyDown={onKeyDown}>
    <span className="inv-wheel__lens" aria-hidden="true" />
    {rows.map(({ item, at }) => {
      const away = Math.abs(at - pos), fade = away <= 1 ? 1 - away * 0.26 : Math.max(0, 0.74 - (away - 1) * 0.62), blur = Math.max(0, away - 1.1) * 1.3;
      return <span key={item.value} className="inv-wheel__row" aria-hidden="true" data-center={away < 0.5 ? "" : undefined}
        style={{ transform: `translateY(${((at - pos) * WHEEL_PITCH).toFixed(2)}px) scale(${(1 - Math.min(away, 2) * 0.05).toFixed(3)})`, opacity: fade, filter: blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : undefined }}>{uiText(item.text)}</span>;
    })}
  </div>;
}
