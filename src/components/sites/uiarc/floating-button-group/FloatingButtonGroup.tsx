"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import { motionTokens } from "../motion-tokens";
import "./floating-button-group.css";

export interface FloatingAction { id: string; label: string; icon: ReactNode; onClick: () => void; disabled?: boolean; primary?: boolean }

/** The tray stays still; only its shared hover/focus highlight morphs and presses. */
export function FloatingButtonGroup({ actions, label }: { actions: FloatingAction[]; label: string }) {
  const id = useId(), reduce = useReducedMotion();
  const [active, setActive] = useState<string | null>(null);
  const [pressed, setPressed] = useState(false);
  const hovering = useRef(false);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const enabled = actions.filter(action => !action.disabled);
  const tabStop = enabled.find(action => action.id === active)?.id ?? enabled[0]?.id;
  return <LayoutGroup id={id}><div className="arc-floating" role="toolbar" aria-label={label} aria-orientation="horizontal"
    onPointerEnter={() => { hovering.current = true; }}
    onPointerLeave={event => { hovering.current = false; setPressed(false); if (!event.currentTarget.contains(document.activeElement)) setActive(null); }}
    onBlur={event => { if (!hovering.current && !event.currentTarget.contains(event.relatedTarget)) setActive(null); }}
    onKeyDown={event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key) || !enabled.length) return;
      event.preventDefault(); event.stopPropagation();
      const index = enabled.findIndex(action => buttons.current.get(action.id) === document.activeElement);
      const next = event.key === "Home" ? 0 : event.key === "End" ? enabled.length - 1 : (index + (event.key === "ArrowLeft" ? -1 : 1) + enabled.length) % enabled.length;
      buttons.current.get(enabled[next].id)?.focus();
    }}>
    {actions.map(action => <button type="button" key={action.id} ref={node => { if (node) buttons.current.set(action.id, node); else buttons.current.delete(action.id); }}
      className="arc-floating__button" data-primary={action.primary || undefined} disabled={action.disabled} tabIndex={tabStop === action.id ? 0 : -1} title={action.label} aria-label={action.label}
      onFocus={() => setActive(action.id)} onPointerEnter={() => { if (!action.disabled) setActive(action.id); }}
      onPointerDown={() => setPressed(true)} onPointerUp={() => setPressed(false)} onPointerCancel={() => setPressed(false)} onClick={action.onClick}>
      <AnimatePresence>{active === action.id && !action.disabled && <motion.span className="arc-floating__highlight" layoutId="highlight" aria-hidden="true"
        initial={{ opacity: 0, scale: reduce ? 1 : .94 }} animate={{ opacity: 1, scale: !reduce && pressed ? .965 : 1 }} exit={{ opacity: 0 }}
        transition={reduce ? { duration: .12 } : { ...motionTokens.spring.morph, opacity: { duration: .12 } }} />}</AnimatePresence>
      <span className="arc-floating__icon" aria-hidden="true">{action.icon}</span>
      <AnimatePresence initial={false} mode="popLayout"><motion.span className="arc-floating__label" key={action.label}
        initial={reduce ? false : { opacity: 0, y: 2, filter: "blur(2px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: reduce ? 0 : -2 }}
        transition={{ duration: reduce ? .12 : .16 }}>{action.label}</motion.span></AnimatePresence>
    </button>)}
  </div></LayoutGroup>;
}
