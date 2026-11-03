"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { Fragment, useEffect, useRef, useState, type KeyboardEvent } from "react";

import "./run-draft.css";
import { useResource } from "@/lib/workspace-backend/react";
import { resources } from "../workspace-resources";

type Decision = "pending" | "accepted" | "rejected";
export type DraftState = { decisions: Decision[]; history: Decision[][] };
type Suggestion = { before: string; after: string; following: string };

const suggestions: Suggestion[] = [
  { before: "18", after: "21", following: "% in Q3 to $4." },
  { before: "2M", after: "3M", following: ", " },
  { before: "mostly ", after: "", following: "driven by " },
  { before: "", after: "six ", following: "new enterprise customers. Churn " },
  { before: "stayed flat at 2.", after: "fell to ", following: "1" },
  { before: "", after: ".8", following: "%, and " },
  { before: "we expect ", after: "", following: "the pipeline " },
  { before: "to carry into", after: "supports raising the", following: " Q4 " },
  { before: "without changes to the plan", after: "target by 5%", following: "." },
];
const initialState: DraftState = { decisions: suggestions.map(() => "pending"), history: [] };
const checkPath = "M3.75 8.4 6.6 11.1 12.25 5";

function description({ before, after }: Suggestion) {
  return before && after ? `replace “${before.trim()}” with “${after.trim()}”` : before ? `remove “${before.trim()}”` : `add “${after.trim()}”`;
}

export function RunDraft({ workspaceId, resetKey = 0, notify, onTextChange }: {
  workspaceId: string;
  resetKey?: number;
  notify: (message: string) => void;
  onTextChange?: (text: string) => void;
}) {
  const { t: uiText } = useWorkspaceI18n();
  const [stored, setStored] = useResource(resources.runDraft, workspaceId,  initialState);
  const state = stored?.decisions?.length === suggestions.length && Array.isArray(stored.history) ? stored : initialState;
  const [active, setActive] = useState<number | null>(null);
  const [position, setPosition] = useState({ left: 8, top: 8 });
  const [announcement, setAnnouncement] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const tokens = useRef<(HTMLSpanElement | null)[]>([]);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousReset = useRef(resetKey);
  const pending = state.decisions.flatMap((value, index) => value === "pending" ? [index] : []);
  const done = pending.length === 0;
  const activePending = active !== null && state.decisions[active] === "pending";
  const text = "Revenue grew " + suggestions.map((suggestion, index) => (state.decisions[index] === "accepted" ? suggestion.after : suggestion.before) + suggestion.following).join("");

  useEffect(() => { onTextChange?.(text); }, [onTextChange, text]);
  useEffect(() => {
    if (previousReset.current === resetKey) return;
    previousReset.current = resetKey;
    let disposed = false;
    queueMicrotask(() => {
      if (disposed) return;
      setStored(initialState);
      setActive(null);
      setAnnouncement("Draft reset. 9 suggestions left.");
    });
    return () => { disposed = true; };
  }, [resetKey, setStored]);
  useEffect(() => () => { if (hoverTimer.current) clearTimeout(hoverTimer.current); }, []);

  useEffect(() => {
    const element = root.current;
    if (!element || active === null) return;
    const outside = (event: PointerEvent) => { if (!element.contains(event.target as Node)) setActive(null); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [active]);
  useEffect(() => {
    if (active === null || !card.current) return;
    const cardElement = card.current;
    const token = tokens.current[active];
    const place = () => {
      if (!token) return;
      const frame = cardElement.getBoundingClientRect();
      // Inline changes can span lines; anchor to the first actual text rectangle.
      const rect = token.getClientRects()[0] || token.getBoundingClientRect();
      const width = popover.current?.offsetWidth || 218;
      const height = popover.current?.offsetHeight || 34;
      const left = Math.max(8, Math.min(frame.width - width - 8, rect.left - frame.left + rect.width / 2 - width / 2));
      const top = Math.max(8, rect.top - frame.top - height - 6);
      setPosition(previous => previous.left === left && previous.top === top ? previous : { left, top });
    };
    const observer = new ResizeObserver(place);
    observer.observe(cardElement);
    // Run after React's DOM commit, then only when its geometry changes.
    const frame = requestAnimationFrame(place);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [active, state.decisions]);

  function cancelHoverClose() {
    if (hoverTimer.current) { clearTimeout(hoverTimer.current); hoverTimer.current = null; }
  }
  function leaveHover() {
    cancelHoverClose();
    hoverTimer.current = setTimeout(() => {
      const focused = document.activeElement;
      if (!focused?.closest(".ui-df__chg, .ui-df__pop")) setActive(null);
    }, 120);
  }
  function activate(index: number, focus = false) {
    if (state.decisions[index] !== "pending") return;
    cancelHoverClose();
    setActive(index);
    if (focus) tokens.current[index]?.focus({ preventScroll: true });
  }
  function navigate(direction: number) {
    if (!pending.length) return;
    const offset = active === null ? (direction > 0 ? -1 : 0) : pending.indexOf(active);
    const index = pending[(offset + direction + pending.length) % pending.length];
    activate(index, true);
    tokens.current[index]?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "auto" });
  }
  function decide(decision: "accepted" | "rejected", index: number | null) {
    const affected = index === null ? pending : state.decisions[index] === "pending" ? [index] : [];
    if (!affected.length) return;
    const decisions = state.decisions.map((value, position) => affected.includes(position) ? decision : value);
    setStored({ decisions, history: [...state.history.slice(-49), [...state.decisions]] });
    const remaining = decisions.flatMap((value, position) => value === "pending" ? [position] : []);
    const summary = `${decision === "accepted" ? "Accepted" : "Rejected"}: ${index === null ? `${affected.length} suggestions` : description(suggestions[index])}. ${remaining.length ? `${remaining.length} suggestions left.` : "All changes reviewed."}`;
    setAnnouncement(summary);
    if (index === null || !remaining.length) {
      setActive(null);
      if (!remaining.length) notify("All draft changes reviewed");
    } else {
      const next = remaining.find(position => position > index) ?? remaining[0];
      setActive(next);
      requestAnimationFrame(() => tokens.current[next]?.focus({ preventScroll: true }));
    }
  }
  function undo() {
    const decisions = state.history.at(-1);
    if (!decisions) return;
    setStored({ decisions, history: state.history.slice(0, -1) });
    const count = decisions.filter(value => value === "pending").length;
    setAnnouncement(`Undone. ${count} suggestions left.`);
    setActive(null);
  }
  function handleKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") { event.stopPropagation(); setActive(null); return; }
    if (!activePending || event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === "y" || key === "n") { event.preventDefault(); decide(key === "y" ? "accepted" : "rejected", active); }
    if (event.key === "ArrowRight" || event.key === "ArrowDown") { event.preventDefault(); navigate(1); }
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") { event.preventDefault(); navigate(-1); }
  }

  return <div ref={root} className="ui-df" data-done={done || undefined} onKeyDown={handleKey}>
    <div className="ui-df__label"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.75c.3 2.9 1.35 3.95 4.25 4.25-2.9.3-3.95 1.35-4.25 4.25C7.7 7.35 6.65 6.3 3.75 6 6.65 5.7 7.7 4.65 8 1.75Z"/><path d="M12.5 10.25c.15 1.25.6 1.7 1.75 1.75-1.15.15-1.6.6-1.75 1.75-.15-1.15-.6-1.6-1.75-1.75 1.15-.05 1.6-.5 1.75-1.75Z"/></svg><span>{uiText("Board memo – Q3 · Revenue")}</span></div>
    <div ref={card} className="ui-df__card">
      <div className="ui-df__head"><div className="ui-df__bar">
        <div className="ui-df__layer" data-show={!done || undefined} inert={done} aria-hidden={done || undefined}>
          <span className="ui-df__count"><span className="ui-df__num">{uiText(pending.length)}</span><span className="ui-df__word">{uiText(pending.length === 1 ? uiText("suggestion") : uiText("suggestions"))}</span></span>
          <span className="ui-df__actions"><span className="ui-df__nav"><button type="button" className="ui-df__icon" aria-label={uiText("Previous suggestion")} disabled={done} onClick={() => navigate(-1)}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 12.5 5.5 8 10 3.5"/></svg></button><button type="button" className="ui-df__icon" aria-label={uiText("Next suggestion")} disabled={done} onClick={() => navigate(1)}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5"/></svg></button></span><button type="button" className="ui-df__btn" disabled={done} onClick={() => decide("rejected", null)}>{uiText("Reject all")}</button><button type="button" className="ui-df__btn ui-df__btn--primary" disabled={done} onClick={() => decide("accepted", null)}>{uiText("Accept all")}</button></span>
        </div>
        <div className="ui-df__layer" data-show={done || undefined} inert={!done} aria-hidden={!done || undefined}><span className="ui-df__count ui-df__count--done"><svg className="ui-df__ok" viewBox="0 0 16 16" aria-hidden="true"><path d={checkPath} pathLength="1"/></svg>{uiText("All changes reviewed")}</span><button type="button" className="ui-df__btn" disabled={!state.history.length} onClick={undo}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5.5 4 2.75 6.75 5.5 9.5"/><path d="M3 6.75h6.5a3.75 3.75 0 0 1 0 7.5H7.5"/></svg>{uiText("Undo")}</button></div>
      </div></div>
      <div className="ui-df__body"><p className="ui-df__text"><span>{uiText("Revenue grew ")}</span>{suggestions.map((suggestion, index) => {
        const decision = state.decisions[index];
        const isPending = decision === "pending";
        return <Fragment key={index}><span ref={element => { tokens.current[index] = element; }} className="ui-df__chg" data-state={decision} data-active={active === index && isPending || undefined} tabIndex={isPending ? 0 : undefined} role={isPending ? "button" : undefined} aria-label={uiText(isPending ? uiText("Suggestion {0} of 9: {1}. Press Y to accept, N to reject", [index + 1, description(suggestion)]) : undefined)}
          onClick={() => activate(index, true)} onFocus={() => activate(index)} onPointerEnter={event => { if (event.pointerType !== "touch") activate(index); }} onPointerLeave={leaveHover}
          onBlur={event => { if (!root.current?.contains(event.relatedTarget)) setActive(null); }}
          onKeyDown={event => { if (isPending && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); activate(index, true); } }}>
          {suggestion.before && <del className="ui-df__del" aria-hidden={decision === "accepted" || undefined}>{uiText(suggestion.before)}</del>}{suggestion.after && <ins className="ui-df__ins" aria-hidden={decision === "rejected" || undefined}>{uiText(suggestion.after)}</ins>}
        </span><span>{uiText(suggestion.following)}</span></Fragment>;
      })}</p></div>
      <div ref={popover} className="ui-df__pop" role="group" aria-label={uiText("Review suggestion")} aria-hidden={!activePending || undefined} data-open={activePending || undefined} style={position} onPointerEnter={cancelHoverClose} onPointerLeave={leaveHover}>
        <button type="button" tabIndex={activePending ? 0 : -1} className="ui-df__pbtn" aria-label={uiText("Accept suggestion")} onClick={() => { if (active !== null) decide("accepted", active); }}><svg viewBox="0 0 16 16" aria-hidden="true"><path d={checkPath}/></svg>{uiText("Accept")}<kbd>Y</kbd></button><span className="ui-df__sep" aria-hidden="true"/><button type="button" tabIndex={activePending ? 0 : -1} className="ui-df__pbtn" aria-label={uiText("Reject suggestion")} onClick={() => { if (active !== null) decide("rejected", active); }}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/></svg>{uiText("Reject")}<kbd>N</kbd></button>
      </div>
    </div><span className="ui-df__sr" role="status" aria-live="polite">{uiText(announcement)}</span>
  </div>;
}
