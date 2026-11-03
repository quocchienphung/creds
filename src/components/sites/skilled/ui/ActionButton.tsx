"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ButtonHTMLAttributes, KeyboardEvent, ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, LoaderCircle } from "lucide-react";
import "./action-button.css";

const ease = [0.22, 1, 0.36, 1] as const;
const spring = (omega: number) => ({ type: "spring", stiffness: omega * omega, damping: 2 * omega }) as const;
/** Measured on the public preview: the label width rides a critical spring of about 27 rad/s; the icons' scale about 22; a press lands in about 110 ms, a release about 19.5 rad/s. */
const WIDTH = spring(27), ICON_SCALE = spring(22), PRESS = spring(45), RELEASE = spring(19.5);
/** The result stays this long before the button returns to idle (measured 2.40 s). */
export const RESET_AFTER_MS = 2400;

type Phase = "idle" | "pending" | "success";
/** native button props, minus the handlers motion types differently (and the ones this component owns) */
export interface ActionButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "children" | "onDrag" | "onDragStart" | "onDragEnd" | "onAnimationStart" | "onAnimationEnd" | "onAnimationIteration"> {
  /** idle label and accessible name */
  label: string;
  /** Runs on press. The pending state lasts until the promise settles. */
  onAction: () => void | Promise<void>;
  pendingLabel?: string;
  successLabel?: string;
  /** delay before returning to idle after success; 0 keeps the success state */
  resetAfterMs?: number;
  /** called when `onAction` rejects; the button returns to idle */
  onActionError?: (error: unknown) => void;
  /** the trailing icon at rest (an arrow by default) */
  icon?: ReactNode;
  /** md is the preview's 44 px button; sm is a 36 px adaptation for dense rows */
  size?: "md" | "sm";
}

const phaseVariants = {
  // the arrow leaves forward and comes back from behind; the status icons shrink away and grow in
  enter: ({ kind, from }: { kind: string; from: Phase }) => (kind === "idle" && from !== "idle" ? { opacity: 0, filter: "blur(2px)", x: -6, scale: 1 } : { opacity: 0, filter: "blur(2px)", x: 0, scale: 0.6 }),
  center: { opacity: 1, filter: "blur(0px)", x: 0, scale: 1 },
  exit: ({ kind }: { kind: string }) => (kind === "idle" ? { opacity: 0, filter: "blur(2px)", x: 8, scale: 1 } : { opacity: 0, filter: "blur(2px)", x: 0, scale: 0.6 }),
};

/**
 * A call-to-action button that runs an async action and morphs through pending and success on the button itself: the label crossfades (the new text rising
 * 2 px), its width springs to fit, the icon swaps (arrow, spinner, a check that draws itself). Pending keeps focus (aria-busy, not disabled).
 * An independent build of the public UIArc "Action button" preview, measured from what it paints (docs/research/uiarc-action-button); no UIArc source or API.
 */
export function ActionButton({
  label, onAction, pendingLabel = "Saving", successLabel = "Saved", resetAfterMs = RESET_AFTER_MS, onActionError, icon, size = "md", className, disabled, type = "button", ...rest
}: ActionButtonProps) {
  const { t: uiText } = useWorkspaceI18n();
  const reduced = useReducedMotion() ?? false;
  const [phase, setPhase] = useState<Phase>("idle");
  const [from, setFrom] = useState<Phase>("idle");
  const [pressed, setPressed] = useState(false);
  const [live, setLive] = useState("");
  const [textWidth, setTextWidth] = useState<number | null>(null);
  const sizerRef = useRef<HTMLSpanElement>(null), reset = useRef<ReturnType<typeof setTimeout> | null>(null), alive = useRef(true), busy = useRef(false);
  const latest = useRef({ onAction, onActionError });
  latest.current = { onAction, onActionError };

  useEffect(() => { alive.current = true; return () => { alive.current = false; if (reset.current) clearTimeout(reset.current); }; }, []);
  const go = useCallback((next: Phase) => { setPhase(current => { setFrom(current); return next; }); }, []);

  const text = phase === "pending" ? pendingLabel : phase === "success" ? successLabel : label;
  // the width of the label that is showing, measured from a hidden copy (never from the moving one)
  useLayoutEffect(() => {
    const element = sizerRef.current;
    if (!element) return;
    const read = () => setTextWidth(element.getBoundingClientRect().width);
    read();
    const observer = new ResizeObserver(read);
    observer.observe(element);
    return () => observer.disconnect();
  }, [text]);

  async function run() {
    if (busy.current || disabled) return;
    if (reset.current) { clearTimeout(reset.current); reset.current = null; }
    busy.current = true; go("pending"); setLive(pendingLabel);
    try {
      await latest.current.onAction();
      if (!alive.current) return;
      go("success"); setLive(successLabel);
      if (resetAfterMs > 0) reset.current = setTimeout(() => { go("idle"); setLive(""); }, resetAfterMs);
    } catch (error) {
      if (!alive.current) return;
      go("idle"); setLive("");
      latest.current.onActionError?.(error);
    } finally { busy.current = false; }
  }
  const press = (value: boolean) => () => setPressed(value);
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => { if ((event.key === "Enter" || event.key === " ") && !event.repeat) setPressed(true); };

  const kind = phase;
  const iconNode = phase === "pending" ? <LoaderCircle className="ab__spinner" size={17} strokeWidth={2} aria-hidden="true" />
    : phase === "success" ? <svg className="ab__statusIcon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><motion.path d="M4 12l5 5L20 6" initial={reduced ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={reduced ? { duration: 0 } : { duration: 0.22, ease, delay: 0.075 }} /></svg>
    : icon ?? <ArrowRight size={17} strokeWidth={2} aria-hidden="true" />;

  return <motion.button {...rest} type={type} className={["ab", className].filter(Boolean).join(" ")} data-interaction-own="" data-state={phase} data-size={size} aria-busy={phase === "pending"} aria-disabled={disabled || undefined}
    animate={{ scale: pressed && !reduced ? 0.97 : 1 }} transition={reduced ? { duration: 0 } : pressed ? PRESS : RELEASE}
    onPointerDown={press(true)} onPointerUp={press(false)} onPointerLeave={press(false)} onPointerCancel={press(false)} onKeyDown={onKeyDown} onKeyUp={press(false)} onBlur={press(false)}
    onClick={() => void run()}>
    <span className="ab__content" aria-hidden="true">
      <motion.span className="ab__morph" initial={false} animate={textWidth === null ? undefined : { width: textWidth }} transition={reduced ? { duration: 0 } : WIDTH}>
        <span ref={sizerRef} className="ab__sizer">{uiText(text)}</span>
        <AnimatePresence initial={false}>
          <motion.span key={text} className="ab__label" initial={reduced ? { opacity: 0 } : { opacity: 0, y: 2 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: reduced ? 0.06 : 0.1, ease } }} transition={{ duration: reduced ? 0.06 : 0.13, ease }}>{uiText(text)}</motion.span>
        </AnimatePresence>
      </motion.span>
      <span className="ab__iconSlot">
        <AnimatePresence initial={false} custom={{ kind, from }}>
          <motion.span key={kind} className="ab__phase" custom={{ kind, from }} variants={phaseVariants} initial="enter" animate="center" exit="exit"
            transition={reduced ? { duration: 0.06 } : { opacity: { duration: 0.14, ease }, filter: { duration: 0.14, ease }, x: ICON_SCALE, scale: ICON_SCALE }}>{uiText(iconNode)}</motion.span>
        </AnimatePresence>
      </span>
    </span>
    <span className="ab__sr">{uiText(label)}</span>
    <span className="ab__sr" role="status">{uiText(live)}</span>
  </motion.button>;
}
