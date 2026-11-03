"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useEffect, useId, useReducer, useRef, useState, type CSSProperties } from "react";
import Image from "next/image";
import { useReducedMotion } from "motion/react";
import { contextCells, demoParts, formatTokens, tokensOf, type ContextPart } from "./context-model";
import "../affectui-fonts.css";
import "./context-window-reference.css";
import "./context-window.css";

type State = {
  parts: ContextPart[]; expanded: boolean; removing: string | null; hot: string | null;
  busy: boolean; done: boolean; hideDone: boolean; saved: number;
};
type Action = { type: "reset" } | { type: "hover"; id: string | null } | { type: "toggle" }
  | { type: "remove-start" | "remove"; id: string } | { type: "compact" | "compacted" | "hide-done" };
const initial = (): State => ({ parts: demoParts, expanded: false, removing: null, hot: null, busy: false, done: false, hideDone: false, saved: 0 });

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "reset": return initial();
    case "hover": return { ...state, hot: action.id };
    case "toggle": return { ...state, expanded: !state.expanded };
    case "remove-start": return { ...state, removing: action.id };
    case "remove": return { ...state, removing: null, parts: state.parts.map(part => part.items ? { ...part, items: part.items.filter(item => item.id !== action.id) } : part) };
    case "compact": return state.done || state.busy ? state : { ...state, busy: true, saved: 0 };
    case "compacted": {
      if (!state.busy) return state;
      const part = state.parts.find(part => part.compact);
      const next = part ? Math.round(tokensOf(part) * (part.compact ?? 1)) : 0;
      return { ...state, busy: false, done: true, saved: part ? tokensOf(part) - next : 0,
        parts: state.parts.map(part => part.compact ? { ...part, tokens: next } : part) };
    }
    case "hide-done": return { ...state, hideDone: true };
  }
}

function Icon({ name, size = 16 }: { name: "arrow" | "chevron" | "remove" | "compact" | "check"; size?: number }) {
  const path = { arrow: "M3.5 8h9M9 4.5 12.5 8 9 11.5", chevron: "m5 6.75 3 3 3-3", remove: "m5 5 6 6m0-6-6 6", compact: "M6 1.5v3m0 0L4.6 3.1M6 4.5l1.4-1.4M6 10.5v-3m0 0L4.6 8.9M6 7.5l1.4 1.4M2 6h8", check: "m2.5 6 2.3 2.3 4.7-4.6" }[name];
  return <svg className={name === "chevron" ? "ui-cwc__chevron" : undefined} width={size} height={size} viewBox={name === "compact" || name === "check" ? "0 0 12 12" : "0 0 16 16"} fill="none" aria-hidden="true"><path d={path} stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function RollingNumber({ value, reduced }: { value: number; reduced: boolean }) {
  const { t: uiText } = useWorkspaceI18n();
  const element = useRef<HTMLSpanElement>(null);
  const current = useRef(value);
  useEffect(() => {
    const from = current.current;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = reduced ? 1 : Math.min(1, (now - start) / 380);
      current.current = from + (value - from) * (1 - (1 - progress) ** 3);
      if (element.current) element.current.textContent = formatTokens(current.current);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, reduced]);
  return <span className="ui-cwc__big" aria-hidden="true" ref={element}>{uiText(formatTokens(value))}</span>;
}

/** Rebuilt from the visible public preview. All numbers and actions are local demo data. */
export function ContextWindow({ active = true, autoPlay = false }: { active?: boolean; autoPlay?: boolean }) {
  const { t: uiText } = useWorkspaceI18n();
  const [state, dispatch] = useReducer(reducer, undefined, initial);
  const [interacted, setInteracted] = useState(false);
  const [visible, setVisible] = useState(true);
  const reduced = !!useReducedMotion();
  const id = useId();
  const { parts, hot, busy, done, hideDone, expanded, saved, removing } = state;
  const used = parts.reduce((sum, part) => sum + tokensOf(part), 0);
  const limit = 200000;
  const percent = Math.round(used / limit * 100);
  const level = percent >= 95 ? "full" : percent >= 80 ? "warn" : "normal";
  const selected = parts.find(part => part.id === hot);
  const cells = contextCells(parts, limit);

  useEffect(() => {
    const update = () => setVisible(document.visibilityState !== "hidden");
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  useEffect(() => {
    if (!busy) return;
    const timer = setTimeout(() => dispatch({ type: "compacted" }), reduced ? 0 : 1700);
    return () => clearTimeout(timer);
  }, [busy, reduced]);
  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => dispatch({ type: "hide-done" }), reduced ? 0 : 2200);
    return () => clearTimeout(timer);
  }, [done, reduced]);
  useEffect(() => {
    if (!removing) return;
    const timer = setTimeout(() => dispatch({ type: "remove", id: removing }), reduced ? 0 : 240);
    return () => clearTimeout(timer);
  }, [removing, reduced]);

  // The public demo walks through the interaction. A real pointer/key press hands control to the visitor.
  useEffect(() => {
    if (!autoPlay || !active || !visible || interacted || reduced) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (delay: number, action: Action) => timers.push(setTimeout(() => dispatch(action), delay));
    const cycle = () => {
      later(0, { type: "reset" });
      later(2400, { type: "hover", id: "files" });
      later(3400, { type: "toggle" });
      later(5100, { type: "remove-start", id: "schema" });
      later(6600, { type: "hover", id: "conversation" });
      later(7600, { type: "compact" });
      later(10400, { type: "hover", id: null });
      timers.push(setTimeout(cycle, 17500));
    };
    cycle();
    return () => timers.forEach(clearTimeout);
  }, [autoPlay, active, visible, interacted, reduced]);

  const hover = (partId: string | null) => dispatch({ type: "hover", id: partId });
  const caption = busy ? "Compacting…" : selected ? `${selected.label} · ${Math.round(tokensOf(selected) / limit * 100)}% of the window`
    : saved ? `Saved ${formatTokens(saved)} tokens` : level !== "normal" ? `${formatTokens(limit - used)} left` : "Room to keep going";
  const tone = busy || selected ? undefined : saved ? "ok" : level;

  return <div className="ui-cwc" role="group" aria-labelledby={`${id}-title`} data-level={level}
    onPointerDownCapture={() => setInteracted(true)} onKeyDownCapture={() => setInteracted(true)}
    onPointerLeave={() => hover(null)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) hover(null); }}>
    <div className="ui-cwc__card">
      <div className="ui-cwc__head">
        <span id={`${id}-title`} className="ui-cwc__title">{uiText("Context window")}</span>
        <span className="ui-cwc__model"><span className="ui-cwc__model-icon"><Image src="/sites/affectui-context-window/claude.svg" width={12} height={12} alt="" /></span><span>{uiText("claude-sonnet-5-5")}</span></span>
      </div>
      <div className="ui-cwc__figure">
        <RollingNumber value={selected ? tokensOf(selected) : used} reduced={reduced} />
        <span className="ui-cwc__of" aria-hidden="true"><span className="ui-cwc__swap"><span className="ui-cwc__swap-item" key={hot ?? "total"}>{uiText(selected ? selected.label : uiText("of 200K tokens"))}</span></span></span>
        <span className="ui-cwc__pill" aria-hidden="true">{uiText(percent)}%</span>
        <span className="ui-cwc__sr">{uiText(formatTokens(used))} {uiText(" of 200.0K tokens used, ")}{uiText(percent)} {uiText(" percent")}</span>
      </div>
      <div className="ui-cwc__field" aria-hidden="true" data-hot={hot || undefined} onPointerLeave={() => hover(null)}>
        {cells.map((part, index) => <span key={index} className="ui-cwc__cell" style={{ "--i": index, "--ui-cwc-color": part ? `var(--ui-cwc-c${part.color})` : undefined } as CSSProperties}
          data-free={part ? undefined : ""} data-on={part && part.id === hot ? "" : undefined} data-busy={busy && part?.compact ? "" : undefined}
          onPointerEnter={event => { if (event.pointerType !== "touch") hover(part?.id ?? null); }} />)}
      </div>
      <ul className="ui-cwc__parts">
        {parts.map(part => {
          const content = <><span className="ui-cwc__swatch" style={{ background: `var(--ui-cwc-c${part.color})` }} /><span className="ui-cwc__label">{uiText(part.label)}{part.items && <span className="ui-cwc__open" data-open={expanded ? "" : undefined}><Icon name="chevron" /></span>}</span></>;
          return <li className="ui-cwc__part" key={part.id} data-hot={hot === part.id ? "" : undefined} data-dim={hot && hot !== part.id ? "" : undefined}
            onPointerEnter={event => { if (event.pointerType !== "touch") hover(part.id); }} onPointerLeave={() => hover(null)} onFocus={() => hover(part.id)}>
            <div className="ui-cwc__row">{part.items ? <button className="ui-cwc__main" type="button" aria-expanded={expanded} aria-controls={`${id}-files`} onClick={() => dispatch({ type: "toggle" })}>{uiText(content)}<span className="ui-cwc__value">{uiText(formatTokens(tokensOf(part)))}</span></button>
              : <div className="ui-cwc__main">{uiText(content)}{part.compact && <button type="button" className="ui-cwc__compact" aria-label={uiText(done ? uiText("Conversation is compacted") : uiText("Compact Conversation"))} disabled={busy || done} data-busy={busy ? "" : undefined} data-done={done ? "" : undefined} data-leaving={hideDone ? "" : undefined} aria-hidden={hideDone || undefined}
                onClick={() => dispatch({ type: "compact" })}><span className="ui-cwc__compact-icon" key={busy ? "busy" : done ? "done" : "ready"}>{busy ? <span className="ui-cwc__spinner" /> : <Icon name={done ? "check" : "compact"} size={12} />}</span><span className="ui-cwc__compact-text" key={`${busy}:${done}`}>{uiText(busy ? uiText("Compacting") : done ? uiText("Compacted") : uiText("Compact"))}</span></button>}<span className="ui-cwc__value">{uiText(formatTokens(tokensOf(part)))}</span></div>}</div>
            {part.items && <div className="ui-cwc__fold" id={`${id}-files`} data-open={expanded ? "" : undefined} inert={!expanded}><div className="ui-cwc__clip"><ul className="ui-cwc__items">
              {part.items.map(item => <li className="ui-cwc__fold ui-cwc__fold--item" data-open={removing !== item.id ? "" : undefined} key={item.id} inert={removing === item.id}><div className="ui-cwc__clip"><div className="ui-cwc__item"><span className="ui-cwc__item-label">{uiText(item.label)}</span><span className="ui-cwc__item-value">{uiText(formatTokens(item.tokens))}</span><button type="button" className="ui-cwc__remove" aria-label={uiText("Remove {0}", [item.label])} onClick={() => { dispatch({ type: "remove-start", id: item.id }); }}><Icon name="remove" /></button></div></div></li>)}
              {!part.items.length && <li className="ui-cwc__empty">{uiText("No files attached")}</li>}
            </ul></div></div>}
          </li>;
        })}
      </ul>
    </div>
    <div className="ui-cwc__foot"><span className="ui-cwc__caption" aria-live="polite"><span className="ui-cwc__swap"><span className="ui-cwc__swap-item" data-tone={tone} key={caption}><span className={busy ? "ui-cwc__shimmer" : undefined} data-text={busy ? caption : undefined}>{uiText(caption)}</span></span></span></span><button type="button" className="ui-cwc__action" onClick={() => dispatch({ type: "reset" })}>{uiText("New chat")}<Icon name="arrow" /></button></div>
  </div>;
}
