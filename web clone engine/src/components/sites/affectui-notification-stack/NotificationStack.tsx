"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { announcement, depthCss, drawn, LEAVE_MS, stackHeight } from "./stack-model";
import type { DismissReason, Notice, NoticePattern } from "./stack-model";
import "./notification-stack.css";

/**
 * Notice cards stacked behind each other: dismiss the front one to reveal the next. Rebuilt from the public preview of affectUI's
 * Notification Stack (docs/research/notification-stack). The stack is a labelled region; each card is an article named by its title; only
 * the front card is read out and focusable. A dismissed card slides away while the next moves up; reduced motion turns that off.
 * Added: a tone (the badge and the dot of a failure are red), notices that expire by themselves while nobody is looking at them
 * (paused on hover and focus), a line under the stack with the count and "Dismiss all", and Escape to dismiss the front card.
 */
export interface NotificationStackProps {
  /** The front card first. */
  notices: readonly Notice[];
  /** A notice was dismissed: with its close button, its action, Escape, by expiring, or all at once. */
  onDismiss: (notice: Notice, reason: DismissReason) => void;
  /** Dismiss everything: shown as a button under the stack when there is more than one notice. */
  onDismissAll?: () => void;
  label?: string;
  className?: string;
}

const Close = () => <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" /></svg>;
const Arrow = () => <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 11 11 5M6 5h5v5" /></svg>;

/** The drawing behind a card's top right corner: rings, a grid with one lit cell, or rays. Geometry as observed on the preview. */
function Pattern({ kind }: { kind: NoticePattern }) {
  if (kind === "grid") {
    return <svg className="nsc__pattern" viewBox="0 0 220 160" fill="none" aria-hidden="true">
      {[30, 60, 90, 120, 150, 180, 210].map(x => <path key={x} d={`M${x} 0v160`} />)}
      {[20, 50, 80, 110, 140].map(y => <path key={y} d={`M0 ${y}h220`} />)}
      <rect x="150" y="50" width="30" height="30" className="nsc__fill" /><circle cx="180" cy="50" r="3.5" className="nsc__dot" />
    </svg>;
  }
  if (kind === "rays") {
    const rays = Array.from({ length: 9 }, (_, index) => { const angle = (index / 8) * (Math.PI / 2) * 0.96; return `M210 6 L${(210 - Math.cos(angle) * 230).toFixed(1)} ${(6 + Math.sin(angle) * 230).toFixed(1)}`; });
    return <svg className="nsc__pattern" viewBox="0 0 220 160" fill="none" aria-hidden="true">
      {rays.map(d => <path key={d} d={d} />)}<path d="M120 6a90 90 0 0 0 90 90" /><circle cx="146" cy="70" r="3.5" className="nsc__dot" />
    </svg>;
  }
  return <svg className="nsc__pattern" viewBox="0 0 220 160" fill="none" aria-hidden="true">
    <circle cx="190" cy="10" r="46" /><circle cx="190" cy="10" r="86" /><circle cx="190" cy="10" r="128" /><path d="M60 160 220 0M0 58h220M150 0v160" /><circle cx="150" cy="58" r="3.5" className="nsc__dot" />
  </svg>;
}

export function NotificationStack({ notices, onDismiss, onDismissAll, label = "Notifications", className }: NotificationStackProps) {
  const { t: uiText } = useWorkspaceI18n();
  const [leaving, setLeaving] = useState<readonly Notice[]>([]);
  const [heights, setHeights] = useState<Record<string, number>>({});
  const [paused, setPaused] = useState(false);
  const cards = useRef(new Map<string, HTMLElement>());
  const observer = useRef<ResizeObserver | null>(null);
  const remaining = useRef(new Map<string, number>());
  const front = notices[0];

  // Cards report their own height: the stack is as tall as the card in front, and grows or shrinks with it
  useEffect(() => {
    observer.current = new ResizeObserver(entries => setHeights(current => {
      let next: Record<string, number> | null = null;
      for (const entry of entries) {
        const id = (entry.target as HTMLElement).dataset.id, height = Math.round((entry.target as HTMLElement).offsetHeight);
        if (id && current[id] !== height) (next ??= { ...current })[id] = height;
      }
      return next ?? current;
    }));
    cards.current.forEach(element => observer.current?.observe(element));
    return () => observer.current?.disconnect();
  }, []);
  const register = useCallback((id: string) => (element: HTMLElement | null) => {
    if (element) { cards.current.set(id, element); observer.current?.observe(element); }
    else { const old = cards.current.get(id); if (old) observer.current?.unobserve(old); cards.current.delete(id); }
  }, []);

  const dismiss = useCallback((notice: Notice, reason: DismissReason) => {
    setLeaving(current => [...current.filter(item => item.id !== notice.id), notice]);
    setTimeout(() => setLeaving(current => current.filter(item => item.id !== notice.id)), LEAVE_MS + 40);
    onDismiss(notice, reason);
  }, [onDismiss]);

  // A notice that expires does so only after it has been in front, undisturbed, for its time
  const frontId = front?.id, frontExpiry = front?.expireMs;
  useEffect(() => {
    if (!frontId || frontExpiry === undefined || paused) return;
    const store = remaining.current;
    const left = store.get(frontId) ?? frontExpiry;
    const started = Date.now();
    const timer = setTimeout(() => { store.delete(frontId); if (front) dismiss(front, "expired"); }, left);
    return () => { clearTimeout(timer); store.set(frontId, Math.max(400, left - (Date.now() - started))); };
    // `front` is read when the timer fires; it only changes when `frontId` does
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frontId, frontExpiry, paused, dismiss]);

  const items = drawn(notices, leaving);
  const height = stackHeight(front ? heights[front.id] ?? 168 : 0, notices.length);
  const hearing = front ? announcement(front) : "";

  if (!items.length) return null;
  return <section className={`nsc${className ? ` ${className}` : ""}`} aria-label={uiText(label)} style={{ height }}
    onPointerEnter={() => setPaused(true)} onPointerLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false); }}
    onKeyDown={event => { if (event.key === "Escape" && front) { event.stopPropagation(); dismiss(front, "escape"); } }}>
    {items.map(({ notice, depth, leaving: isLeaving }) => {
      const isFront = depth === 0 && !isLeaving;
      const action = notice.action;
      const actionBody: ReactNode = <>{uiText(action?.label)}{action?.external && <Arrow />}</>;
      return <article key={notice.id} ref={register(notice.id)} data-id={notice.id} className="nsc__card" data-depth={isLeaving ? 0 : depth} data-tone={notice.tone ?? "neutral"} data-leaving={isLeaving ? "" : undefined}
        aria-labelledby={`${notice.id}-title`} aria-hidden={isFront ? undefined : true} inert={isFront ? undefined : true}
        style={{ zIndex: isLeaving ? 11 : 10 - depth, transform: isLeaving ? undefined : depthCss(depth) }}>
        <Pattern kind={notice.pattern ?? "rings"} />
        <div className="nsc__body">
          <div className="nsc__top"><span className="nsc__badge">{uiText(notice.badge)}</span>
            <button type="button" className="nsc__close" aria-label={uiText("Dismiss {0}", [notice.title])} onClick={() => dismiss(notice, "close")}><Close /></button></div>
          <h3 id={`${notice.id}-title`} className="nsc__title">{uiText(notice.title)}</h3>
          {notice.text && <p className="nsc__text">{uiText(notice.text)}</p>}
          {action && (action.href
            ? <a className="nsc__btn" href={action.href} {...(action.external ? { target: "_blank", rel: "noreferrer" } : {})} onClick={() => { action.onClick?.(); if (!action.keep) dismiss(notice, "action"); }}>{uiText(actionBody)}</a>
            : <button type="button" className="nsc__btn" onClick={() => { action.onClick?.(); if (!action.keep) dismiss(notice, "action"); }}>{uiText(actionBody)}</button>)}
        </div>
      </article>;
    })}
    {notices.length > 1 && <div className="nsc__foot" style={{ top: height + 6 }}>
      <span aria-live="off">{uiText(notices.length)} {uiText(" notices")}</span>
      {onDismissAll && <button type="button" onClick={() => { notices.forEach(notice => dismiss(notice, "all")); onDismissAll(); }}>{uiText("Dismiss all")}</button>}
    </div>}
    <span className="nsc__sr" role={front?.tone === "error" ? "alert" : "status"} key={front?.id ?? "none"}>{uiText(hearing)}</span>
  </section>;
}
