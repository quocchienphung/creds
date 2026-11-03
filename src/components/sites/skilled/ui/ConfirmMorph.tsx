"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useReducer, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, animate, motion, useMotionTemplate, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import type { AnimationPlaybackControls } from "motion/react";
import { CircleAlert, LoaderCircle } from "lucide-react";
import {
  DRAIN_OMEGA, GROW_OMEGA, HOLD_MS, PausableTimer, QUESTION_TIMEOUT_MS, SHRINK_OMEGA, canConfirm, confirmReducer, initialConfirm, partDelay,
  type ConfirmPhase,
} from "./confirm-morph-model.ts";
import "./confirm-morph.css";

export type { ConfirmPhase } from "./confirm-morph-model.ts";

const ease = [0.22, 1, 0.36, 1] as const;
const spring = (omega: number) => ({ type: "spring", stiffness: omega * omega, damping: 2 * omega }) as const;
const isThenable = (value: unknown): value is PromiseLike<unknown> => !!value && typeof (value as { then?: unknown }).then === "function";

export interface ConfirmMorphProps {
  /** the resting label, "Delete project" */
  label: ReactNode;
  icon?: ReactNode;
  /** the question; defaults to the label with a question mark */
  prompt?: ReactNode;
  confirmLabel?: string; cancelLabel?: string; pendingLabel?: string; doneLabel?: string; errorLabel?: string; retryLabel?: string; undoLabel?: string; undoingLabel?: string;
  /** danger colours the confirm answer for things that destroy; neutral gives it the ink for things that can be reversed */
  tone?: "danger" | "neutral";
  /** press confirms on a press; hold asks for the confirm button to be held while it fills */
  confirmMode?: "press" | "hold";
  holdDuration?: number;
  /** Return a promise to show the pending face; a rejection shows the error face with Retry. */
  onConfirm?: () => void | Promise<unknown>;
  /** Adds Undo to the result. Return a promise to show a pending face while it runs. */
  onUndo?: () => void | Promise<unknown>;
  onCancel?: () => void;
  onStateChange?: (phase: ConfirmPhase) => void;
  /** ms before an unanswered question returns to rest (hovering pauses it; 0: never) */
  confirmTimeout?: number;
  /** ms a result stays before returning to rest (hovering pauses it; 0: it stays) */
  resultTimeout?: number;
  cancelOnOutsidePress?: boolean;
  /** names the resting button for assistive technology when several look alike ("Delete claim-checker") */
  ariaLabel?: string;
  /** md is the preview's 36 px pill; sm is a 32 px adaptation for dense rows */
  size?: "md" | "sm";
  disabled?: boolean;
  className?: string;
}

interface FaceContext { intro: boolean; reduced: boolean }
const Face = createContext<FaceContext>({ intro: false, reduced: false });

/** One piece of a face. Pieces arrive in reading order, each clearing a 4 px blur (tween 0.23 s on the ease-standard curve, 36 ms apart). */
function Part({ index, className, children }: { index: number; className?: string; children: ReactNode }) {
  const { intro, reduced } = useContext(Face);
  if (!intro) return <span className={["cm__part", className].filter(Boolean).join(" ")}>{children}</span>;
  return <motion.span className={["cm__part", className].filter(Boolean).join(" ")} initial={{ opacity: 0, filter: reduced ? "blur(0px)" : "blur(4px)" }} animate={{ opacity: 1, filter: "blur(0px)" }} transition={reduced ? { duration: 0.12 } : { duration: 0.23, ease, delay: partDelay(index) }}>{children}</motion.span>;
}

/** The result's check: a disc that pops from 0.5 on a spring while it fades in, then the tick draws itself in 0.22 s. */
function DoneCheck({ reduced }: { reduced: boolean }) {
  return <svg className="cm__check" viewBox="0 0 18 18" width="18" height="18" fill="none" aria-hidden="true">
    <motion.circle cx="9" cy="9" r="8" initial={reduced ? false : { scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={reduced ? { duration: 0 } : { scale: spring(15), opacity: { duration: 0.14, ease } }} style={{ transformOrigin: "50% 50%", transformBox: "fill-box" }} />
    <motion.path d="M5.6 9.3 7.8 11.4 12.4 6.7" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" initial={reduced ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={reduced ? { duration: 0 } : { duration: 0.22, ease, delay: partDelay(0) + 0.15 }} />
  </svg>;
}

/**
 * A button that morphs in place into an inline question, then a spinner, then a result with Undo. In hold mode the confirm button is answered by pressing and
 * holding it for a second while a solid copy fills in from the left (it drains back on a spring if released early).
 * An independent build of the public UIArc "Confirm morph" preview, measured from what it paints (docs/research/uiarc-confirm-morph); no UIArc source or API.
 */
export function ConfirmMorph({
  label, icon, prompt, confirmLabel = "Delete", cancelLabel = "Cancel", pendingLabel = "Deleting", doneLabel = "Deleted", errorLabel = "Couldn’t finish", retryLabel = "Retry",
  undoLabel = "Undo", undoingLabel = "Restoring", tone = "danger", confirmMode = "press", holdDuration = HOLD_MS, onConfirm, onUndo, onCancel, onStateChange,
  confirmTimeout = QUESTION_TIMEOUT_MS, resultTimeout = 0, cancelOnOutsidePress = true, ariaLabel, size = "md", disabled = false, className,
}: ConfirmMorphProps) {
  const { t: uiText } = useWorkspaceI18n();
  const reduced = useReducedMotion() ?? false;
  const promptId = useId(), holdId = useId();
  const [state, dispatch] = useReducer(confirmReducer, initialConfirm);
  const [live, setLive] = useState("");
  const [holding, setHolding] = useState(false);
  const [ready, setReady] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null), triggerRef = useRef<HTMLButtonElement>(null), confirmRef = useRef<HTMLButtonElement>(null), undoRef = useRef<HTMLButtonElement>(null), retryRef = useRef<HTMLButtonElement>(null);
  const width = useMotionValue(0), measured = useRef(false);
  const holdP = useMotionValue(0), holdAnimation = useRef<AnimationPlaybackControls | null>(null), holdingRef = useRef(false);
  const openedAt = useRef(0), alive = useRef(true), timer = useRef<PausableTimer | null>(null), mounted = useRef(false), previous = useRef<ConfirmPhase>("idle");
  const latest = useRef({ onConfirm, onUndo, onCancel, onStateChange });
  latest.current = { onConfirm, onUndo, onCancel, onStateChange };
  const phase = state.phase;
  const hold = confirmMode === "hold";

  useEffect(() => { mounted.current = true; alive.current = true; return () => { alive.current = false; timer.current?.cancel(); holdAnimation.current?.stop(); }; }, []);

  // ---- the pill: only its width moves, growing on the slower spring and shrinking on the faster one
  const natural = useCallback((px: number) => {
    if (px <= 0) return;
    if (!measured.current) { measured.current = true; width.set(px); setReady(true); return; }
    const from = width.get();
    if (Math.abs(px - from) < 0.5 && !width.isAnimating()) return;
    if (reduced) width.set(px); else animate(width, px, spring(px > from ? GROW_OMEGA : SHRINK_OMEGA));
  }, [width, reduced]);

  // ---- running the handlers
  const run = useCallback(async (kind: "confirm" | "undo") => {
    const handler = kind === "confirm" ? latest.current.onConfirm : latest.current.onUndo;
    try {
      const result = handler?.();
      if (isThenable(result)) await result;
      if (alive.current) dispatch("resolved");
    } catch {
      if (alive.current) dispatch(kind === "confirm" ? "rejected" : "undoFailed");
    }
  }, []);
  const startConfirm = useCallback(() => { dispatch("confirm"); void run("confirm"); }, [run]);
  const open = useCallback(() => { if (!disabled) dispatch("open"); }, [disabled]);
  const cancel = useCallback(() => { dispatch("cancel"); latest.current.onCancel?.(); }, []);
  const retry = useCallback(() => { dispatch("retry"); void run("confirm"); }, [run]);
  const undo = useCallback(() => { dispatch("undo"); void run("undo"); }, [run]);

  // ---- hold: a straight-line fill; released early it drains back on a spring
  const startHold = useCallback(() => {
    if (holdingRef.current || phase !== "confirming" || !canConfirm(performance.now(), openedAt.current)) return;
    holdingRef.current = true; setHolding(true);
    holdAnimation.current?.stop();
    holdAnimation.current = animate(holdP, 100, { duration: holdDuration / 1000, ease: "linear", onComplete: () => { holdingRef.current = false; setHolding(false); startConfirm(); } });
  }, [phase, holdDuration, holdP, startConfirm]);
  const endHold = useCallback(() => {
    if (!holdingRef.current) return;
    holdingRef.current = false; setHolding(false);
    holdAnimation.current?.stop();
    if (reduced) holdP.set(0); else holdAnimation.current = animate(holdP, 0, spring(DRAIN_OMEGA));
    setLive(previousLive => (previousLive === "Hold a little longer to confirm." ? "Hold a little longer to confirm.​" : "Hold a little longer to confirm."));
  }, [holdP, reduced]);

  // ---- each state: timers, focus, announcements
  useEffect(() => {
    const was = previous.current; previous.current = phase;
    if (was !== phase) latest.current.onStateChange?.(phase);
    timer.current?.cancel(); timer.current = null;
    const arm = (ms: number) => { if (ms > 0) { timer.current = new PausableTimer(ms, () => { if (!alive.current) return; if (phase === "confirming") latest.current.onCancel?.(); dispatch("timeout"); }); if (!rootRef.current?.matches(":hover") && !document.hidden) timer.current.start(); } };
    const focus = (element: HTMLElement | null | undefined) => requestAnimationFrame(() => element?.focus({ preventScroll: true }));
    if (phase === "confirming") {
      openedAt.current = performance.now(); holdP.set(0); holdAnimation.current?.stop();
      arm(confirmTimeout); focus(confirmRef.current);
      setLive(`${typeof prompt === "string" ? prompt : typeof label === "string" ? `${label}?` : "Are you sure?"}${hold ? " Press and hold to confirm." : ""}`);
    } else if (phase === "pending") { focus(rootRef.current); setLive(state.undoing ? undoingLabel : pendingLabel); }
    else if (phase === "done") { arm(resultTimeout); focus(undoRef.current ?? rootRef.current); setLive(`${doneLabel}.${latest.current.onUndo ? " Undo is available." : ""}`); }
    else if (phase === "error") { arm(resultTimeout); focus(retryRef.current); setLive(errorLabel); }
    else if (was !== "idle") {
      holdP.set(0);
      const active = document.activeElement;
      if (!active || active === document.body || rootRef.current?.contains(active)) focus(triggerRef.current);
      setLive("");
    }
    return () => { timer.current?.cancel(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, state.undoing]);

  // timers pause while the pointer rests on the control and while the tab is hidden
  useEffect(() => {
    const visibility = () => { if (document.hidden) timer.current?.pause(); else if (!rootRef.current?.matches(":hover")) timer.current?.start(); };
    document.addEventListener("visibilitychange", visibility);
    return () => document.removeEventListener("visibilitychange", visibility);
  }, []);
  useEffect(() => {
    if (phase !== "confirming" || !cancelOnOutsidePress) return;
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !rootRef.current?.contains(event.target)) cancel(); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [phase, cancelOnOutsidePress, cancel]);

  const fillRight = useTransform(holdP, value => Math.round((100 - value) * 1000) / 1000);
  const fillClip = useMotionTemplate`inset(0px ${fillRight}% 0px 0px round 999px)`;
  const faceProps = { intro: mounted.current, reduced };
  const confirmBusy = phase === "pending";

  return <div ref={rootRef} className={["cm", className].filter(Boolean).join(" ")} data-state={phase} data-face={phase} data-interaction-own="" data-tone={tone} data-mode={confirmMode} data-size={size} data-disabled={disabled ? "true" : undefined} tabIndex={-1} aria-busy={confirmBusy || undefined}
    onPointerEnter={event => { if (event.pointerType === "mouse") timer.current?.pause(); }} onPointerLeave={event => { if (event.pointerType === "mouse") timer.current?.start(); }}
    onKeyDown={event => {
      if (event.key !== "Escape") return;
      if (phase === "confirming") { event.preventDefault(); event.stopPropagation(); cancel(); }
      else if (phase === "done" || phase === "error") { event.preventDefault(); event.stopPropagation(); dispatch("dismiss"); }
    }}>
    <motion.div className="cm__surface" style={ready ? { width } : undefined}>
      <AnimatePresence initial={false}>
        {phase === "idle" && <FaceFrame key="idle" name="idle" context={faceProps} onMeasure={natural}>
          <Part index={0}><button ref={triggerRef} type="button" className="cm__trigger" aria-label={uiText(ariaLabel)} disabled={disabled} onClick={open}>{icon && <span className="cm__icon" aria-hidden="true">{uiText(icon)}</span>}<span>{uiText(label)}</span></button></Part>
        </FaceFrame>}
        {phase === "confirming" && <FaceFrame key="confirming" name="confirming" context={faceProps} onMeasure={natural} group={promptId}>
          <Part index={0} className="cm__prompt"><span id={promptId}>{prompt ?? <>{uiText(label)}?</>}</span></Part>
          <Part index={1}><button type="button" className="cm__secondary" onClick={cancel}>{uiText(cancelLabel)}</button></Part>
          <Part index={2}>
            <button ref={confirmRef} type="button" className="cm__confirm" data-holding={holding ? "" : undefined} aria-describedby={hold ? holdId : undefined}
              onPointerDown={event => { if (hold && (event.pointerType !== "mouse" || event.button === 0)) startHold(); }}
              onPointerUp={() => { if (hold) endHold(); }} onPointerCancel={() => { if (hold) endHold(); }} onPointerLeave={() => { if (hold) endHold(); }}
              onContextMenu={event => { if (hold) event.preventDefault(); }}
              onKeyDown={event => { if (hold && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); if (!event.repeat) startHold(); } }}
              onKeyUp={event => { if (hold && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); endHold(); } }}
              onBlur={() => { if (hold) endHold(); }}
              onClick={() => { if (!hold && canConfirm(performance.now(), openedAt.current)) startConfirm(); }}>
              <span>{uiText(confirmLabel)}</span>
              {hold && <motion.span className="cm__fill" aria-hidden="true" style={{ clipPath: fillClip }}><span>{uiText(confirmLabel)}</span></motion.span>}
            </button>
          </Part>
          {hold && <span id={holdId} className="cm__sr">{uiText("Press and hold")}</span>}
        </FaceFrame>}
        {phase === "pending" && <FaceFrame key="pending" name="pending" context={faceProps} onMeasure={natural}>
          <Part index={0} className="cm__status" ><LoaderCircle className="cm__spinner" size={16} strokeWidth={2} aria-hidden="true" /><span>{uiText(state.undoing ? undoingLabel : pendingLabel)}</span></Part>
        </FaceFrame>}
        {phase === "done" && <FaceFrame key="done" name="done" context={faceProps} onMeasure={natural}>
          <Part index={0} className="cm__status cm__status--done"><DoneCheck reduced={reduced} /><span className="cm__statusText">{uiText(doneLabel)}</span></Part>
          {onUndo && <Part index={1}><button ref={undoRef} type="button" className="cm__secondary cm__undo" onClick={undo}>{uiText(undoLabel)}</button></Part>}
        </FaceFrame>}
        {phase === "error" && <FaceFrame key="error" name="error" context={faceProps} onMeasure={natural}>
          <Part index={0} className="cm__status cm__status--error"><CircleAlert size={16} strokeWidth={2} aria-hidden="true" /><span>{uiText(errorLabel)}</span></Part>
          <Part index={1}><button ref={retryRef} type="button" className="cm__secondary" onClick={retry}>{uiText(retryLabel)}</button></Part>
        </FaceFrame>}
      </AnimatePresence>
    </motion.div>
    <span className="cm__sr" role="status" aria-live="polite">{uiText(live)}</span>
  </div>;
}

/** A face sits at its natural width against the pill's leading edge; the springing edge reveals the rest. The old face fades out where it stood. */
function FaceFrame({ name, context, onMeasure, group, children }: { name: string; context: FaceContext; onMeasure: (px: number) => void; group?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const read = () => onMeasure(element.offsetWidth);
    read();
    const observer = new ResizeObserver(read);
    observer.observe(element);
    return () => observer.disconnect();
  }, [onMeasure]);
  return <Face.Provider value={context}>
    <motion.div ref={ref} className="cm__face" data-face={name} role={group ? "group" : undefined} aria-labelledby={group} exit={{ opacity: 0, transition: { duration: 0.1, ease } }}>{children}</motion.div>
  </Face.Provider>;
}
