"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, MouseEvent, PointerEvent } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { preload } from "react-dom";
import { useSearchParams } from "next/navigation";
import { defaultGuideIndex, guideGroups, liveFrameOf, navigateWorkspaceHref } from "./navigation-model";
import { WorkspaceLink } from "./WorkspaceLink";
import { WorkspaceBackendProvider } from "@/lib/workspace-backend/react";
import { InitialRouteProvider, sectionFromParam } from "../affectui-crm/workspace-state";
import { WorkspaceShellSkeleton } from "../shimmer-loader/WorkspaceShellSkeleton";
import { GradientFloor } from "../affectui-gradient-floor/GradientFloor";
import { InvoicePlan } from "../affectui-agent-plan/AgentPlan";
import { WritingAssistant } from "../affectui-writing-assistant/WritingAssistant";
import { ProjectDelegateBoard } from "../affectui-delegate-board/ProjectDelegateBoard";
import { CrmAgentLanes } from "../affectui-agent-lanes/CrmAgentLanes";
import { ContextWindow } from "../affectui-context-window/ContextWindow";
import "../affectui-fonts.css";
import "../i18n/vietnamese-fonts.css";
import "./guide-navigation.css";

const Workspace = dynamic(() => import("../affectui-crm/Crm").then(module => module.Crm), {
  loading: () => <WorkspaceShellSkeleton />,
});
const swipeDistance = 40;

export function PersonalizeApp({ initialBrowse = false, initialGroup, initialSection, initialView }: { initialBrowse?: boolean; initialGroup?: string; initialSection?: string; initialView?: string }) {
  // Read Next's history state directly. Listening only for a manually dispatched popstate can miss
  // navigation during a router update on WebKit, leaving the URL and the visible app out of sync.
  const params = useSearchParams() ?? new URLSearchParams(initialBrowse ? `browse=1&group=${encodeURIComponent(initialGroup ?? "")}` : "");
  return <WorkspaceBackendProvider>{params.get("browse") === "1"
    ? <GuideNavigation initialGroup={params.get("group")} />
    : <InitialRouteProvider value={{ section: sectionFromParam(initialSection), view: initialView ?? null }}><Workspace /></InitialRouteProvider>}</WorkspaceBackendProvider>;
}

function GuideNavigation({ initialGroup }: { initialGroup: string | null }) {
  const { t: uiText, locale } = useWorkspaceI18n();
  // The heading is set in this font, so it is asked for with the page rather than when the heading is first painted
  preload("/fonts/inter-latin.woff2", { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  const groupIndex = guideGroups.findIndex(group => group.id === initialGroup);
  const [active, setActive] = useState(groupIndex < 0 ? defaultGuideIndex : groupIndex);
  const [bar, setBar] = useState<{ top: number; height: number } | null>(null);
  const [ready, setReady] = useState(false);
  // False while the strip slides, so every frame in between is visible; true at rest.
  const [settled, setSettled] = useState(true);
  const settleTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const activeRef = useRef(active);
  const rows = useRef<(HTMLAnchorElement | null)[]>([]);
  const list = useRef<HTMLUListElement>(null);
  // A touch tap on an inactive row only selects it, as hover would; the next tap opens it.
  const press = useRef({ type: "", wasActive: false, index: -1 });
  const preview = useRef<HTMLDivElement>(null);

  const measure = useCallback(() => {
    const row = rows.current[active];
    if (row) setBar({ top: row.offsetTop, height: row.offsetHeight });
  }, [active]);

  useLayoutEffect(() => {
    activeRef.current = active;
    measure();
    const observer = new ResizeObserver(measure);
    if (list.current) observer.observe(list.current);
    return () => observer.disconnect();
  }, [active, measure]);

  // The first position is applied without a transition; later changes animate.
  useLayoutEffect(() => {
    const frame = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const urlTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useLayoutEffect(() => () => { clearTimeout(urlTimer.current); clearTimeout(settleTimer.current); }, []);
  useLayoutEffect(() => {
    // Restore actual history navigation. Debounced replaceState acknowledgments from our own selection
    // must not restore an older group while the finger is already moving back across the list.
    const restoreGroup = () => {
      const params = new URLSearchParams(window.location.search);
      if (params.get("browse") !== "1") return;
      const index = guideGroups.findIndex(group => group.id === params.get("group"));
      clearTimeout(urlTimer.current);
      clearTimeout(settleTimer.current);
      activeRef.current = index < 0 ? defaultGuideIndex : index;
      setActive(activeRef.current);
      setSettled(true);
    };
    window.addEventListener("popstate", restoreGroup);
    return () => window.removeEventListener("popstate", restoreGroup);
  }, []);

  // Keep the selected group in the URL for refresh and Back. Replace rather than push, so hovering never
  // fills the history, and debounce it: Next.js applies history writes to its router asynchronously.
  function writeGroupUrl(index: number) {
    const url = new URL(window.location.href);
    if (url.searchParams.get("browse") !== "1" || url.searchParams.get("group") === guideGroups[index].id) return false;
    url.searchParams.set("group", guideGroups[index].id);
    window.history.replaceState(null, "", url);
    return true;
  }

  // While someone is working in a live frame, passing the pointer over a row must not pull the frame away.
  const workingInPreview = () => !!preview.current?.contains(document.activeElement) && document.activeElement !== preview.current;

  function select(index: number, fromPointer = false) {
    if (index === activeRef.current || (fromPointer && workingInPreview())) return;
    activeRef.current = index;
    setActive(index);
    setSettled(false);
    clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => setSettled(true), 1200);
    clearTimeout(urlTimer.current);
    urlTimer.current = setTimeout(() => writeGroupUrl(index), 150);
  }

  function onPointerDown(event: PointerEvent, index: number) {
    if (!event.isPrimary || event.button !== 0) return;
    press.current = { type: event.pointerType, wasActive: index === activeRef.current, index };
    // Touch has no hover. Show the preview on contact, while remembering whether this press may open it.
    if (event.pointerType === "touch") select(index);
  }

  function onClick(event: MouseEvent, index: number) {
    const { type, wasActive, index: pressedIndex } = press.current;
    press.current = { type: "", wasActive: false, index: -1 };
    // Select here rather than rely on focus: iOS Safari never focuses a tapped link, and a row that already
    // holds focus (after a swipe moved the selection away) gets no new focus event either.
    if (event.detail !== 0 && type === "touch" && pressedIndex === index && !wasActive) { event.preventDefault(); select(index); return; }
    if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    clearTimeout(urlTimer.current);
    if (writeGroupUrl(index)) {
      // Let the router settle the group URL before pushing the workspace entry on top of it.
      event.preventDefault();
      setTimeout(() => navigateWorkspaceHref(guideGroups[index].href), 80);
    }
  }

  // On the list, drag vertically over rows like a mouse hover. Elsewhere, vertical pans still scroll;
  // horizontal swipes step once per gesture. Touch pointers implicitly capture the starting element,
  // so pointerenter/target cannot tell us which row is now underneath the finger.
  const swipe = useRef({ id: -1, x: 0, y: 0, onList: false, mode: "pending" as "pending" | "list" | "horizontal" });
  const suppressClick = useRef(false);

  function onSwipeStart(event: PointerEvent) {
    if (event.isPrimary) suppressClick.current = false;
    if (event.pointerType !== "touch") return;
    if (!event.isPrimary) {
      swipe.current.id = -1;
      suppressClick.current = true;
      return;
    }
    const target = event.target as Element;
    const ignored = target.closest("input, textarea, select, [contenteditable]:not([contenteditable=false]), button, [role=button], .ap__grip");
    swipe.current = { id: ignored ? -1 : event.pointerId, x: event.clientX, y: event.clientY, onList: !!target.closest(".guide-list"), mode: "pending" };
  }

  function onSwipeMove(event: PointerEvent) {
    const gesture = swipe.current;
    if (event.pointerId !== gesture.id) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (gesture.onList && gesture.mode === "pending" && Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) gesture.mode = "list";
    if (gesture.mode === "list") {
      suppressClick.current = true;
      const row = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLAnchorElement>(".guide-item");
      const index = row ? rows.current.indexOf(row) : -1;
      if (index >= 0) select(index);
      return;
    }
    if (gesture.mode === "horizontal") return;
    if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { gesture.id = -1; suppressClick.current = true; return; }
    if (Math.abs(dx) < swipeDistance || Math.abs(dx) < Math.abs(dy) * 1.6) return;
    gesture.mode = "horizontal";
    suppressClick.current = true;
    const next = Math.min(guideGroups.length - 1, Math.max(0, activeRef.current + (dx < 0 ? 1 : -1)));
    select(next);
  }

  function onSwipeEnd(event: PointerEvent) {
    if (event.pointerId === swipe.current.id) swipe.current.id = -1;
  }

  function onSwipeCancel(event: PointerEvent) {
    if (event.pointerId !== swipe.current.id) return;
    swipe.current.id = -1;
    suppressClick.current = true;
    press.current = { type: "", wasActive: false, index: -1 };
  }

  // Suppress the click belonging to a drag even if the finger rests before lifting. A new contact
  // resets the flag immediately, so a deliberate tap after a swipe is never swallowed by a timer.
  function onClickCapture(event: MouseEvent) {
    if (!suppressClick.current || event.detail === 0) return;
    event.preventDefault();
    event.stopPropagation();
  }

  function onKeyDown(event: KeyboardEvent) {
    const last = guideGroups.length - 1;
    const next = event.key === "Home" ? 0 : event.key === "End" ? last
      : event.key === "ArrowDown" || event.key === "ArrowRight" ? (active + 1) % guideGroups.length
      : event.key === "ArrowUp" || event.key === "ArrowLeft" ? (active + last) % guideGroups.length : -1;
    if (next < 0) return;
    event.preventDefault();
    select(next);
    rows.current[next]?.focus();
  }

  return <main lang={locale} className="guide-page" onPointerDown={onSwipeStart} onPointerMove={onSwipeMove} onPointerUp={onSwipeEnd} onPointerCancel={onSwipeCancel} onClickCapture={onClickCapture}>
    <GradientFloor className="guide-floor" />
    <div className="guide-stage">
      <h1 className="guide-heading"><span>{uiText("How I can help you")}</span><sup>{uiText("(SERVICES)")}</sup></h1>
      <div className="guide-grid">
        <nav aria-label={uiText("Guide me")}>
          <ul className="guide-list" ref={list} data-ready={ready ? "" : undefined} onKeyDown={onKeyDown}>
            {bar && <li className="guide-bar" aria-hidden="true" style={{ transform: `translateY(${bar.top}px)`, height: bar.height }} />}
            {guideGroups.map((group, index) => <li key={group.id}>
              <WorkspaceLink
                href={group.href}
                className="guide-item"
                aria-current={index === active ? "true" : undefined}
                tabIndex={index === active ? 0 : -1}
                ref={element => { rows.current[index] = element; }}
                onPointerEnter={event => { if (event.pointerType !== "touch") select(index, true); }}
                onPointerDown={event => onPointerDown(event, index)}
                onFocus={() => select(index)}
                onClick={event => onClick(event, index)}
              >
                <span className="guide-item__number">({uiText(group.number)})</span>
                <span className="guide-item__name">{uiText(group.name)}</span>
              </WorkspaceLink>
            </li>)}
          </ul>
        </nav>
        <div className="guide-preview" ref={preview} data-settled={settled ? "" : undefined}>
          <div className="guide-preview__strip" style={{ "--guide-index": active, "--guide-count": guideGroups.length } as CSSProperties} onTransitionEnd={event => { if (event.target === event.currentTarget && event.propertyName === "transform") { clearTimeout(settleTimer.current); setSettled(true); } }}>
            {guideGroups.map((group, index) => {
              const live = liveFrameOf(group);
              return <div
                className="guide-preview__frame"
                key={group.id}
                data-empty={group.image || live ? undefined : ""}
                data-live={live ? "" : undefined}
                inert={live && index !== active ? true : undefined}
                data-active={index === active ? "" : undefined}
              >
                {group.image && <Image src={group.image} alt="" fill sizes="224px" unoptimized priority={index === active} />}
                {live === "writing-assistant" && <div className="guide-live"><WritingAssistant speech="simulate" /></div>}
                {live === "agent-plan" && <div className="guide-live"><InvoicePlan /></div>}
                {live === "delegate-board" && <div className="guide-live"><ProjectDelegateBoard /></div>}
                {live === "agent-lanes" && <div className="guide-live"><CrmAgentLanes active={index === active} /></div>}
                {live === "context-window" && <div className="guide-live guide-context-window"><ContextWindow active={index === active} autoPlay /></div>}
              </div>;
            })}
          </div>
          {!liveFrameOf(guideGroups[active]) && <WorkspaceLink href={guideGroups[active].href} className="guide-preview__link" tabIndex={-1} aria-label={uiText("Open {0}", [guideGroups[active].name])} />}
        </div>
      </div>
    </div>
  </main>;
}
