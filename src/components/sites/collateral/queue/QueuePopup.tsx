"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { animate, useReducedMotion, type AnimationPlaybackControls } from "motion/react";
import { X } from "lucide-react";
import { useWorkspaceI18n } from "../../i18n/WorkspaceI18n";
import "./queue-popup.css";

// The Card preview's own quick look settles in about 430ms (a critically damped k300/c34.6, fitted from its recorded frames). The Queue asks for a slower, calmer
// arrival, so it stays inside the Motion guide's vocabulary instead: a no-overshoot spring of 0.62s visual duration (the guide's --duration-spring is .58s),
// and a quicker 0.42s on the way back (spring.morph). docs/research/collateral-queue/source-card/README.md
const OPEN_SPRING = { type: "spring", visualDuration: .62, bounce: 0 } as const;
const CLOSE_SPRING = { type: "spring", visualDuration: .42, bounce: 0 } as const;
const RADIUS = 34, ROW_RADIUS = 14, CLOSE_CAP_MS = 900;

interface Geometry { x: number; y: number; sx: number; sy: number; w: number; h: number; from: boolean }

/**
 * The quick look of the public UIArc Card preview: the clicked row's own rectangle grows into a 30rem panel (the surface and the clip that reveals its content
 * move together, so nothing is stretched), the overlay blurs the page by 7px, the content and close button fade in a beat later and everything folds back
 * into the row on close. The native <dialog> supplies the focus trap, Escape and the inert page behind it.
 */
export function QueuePopup({ open, onClose, title, label, getOrigin, children }: {
  open: boolean; onClose: () => void; title: string; label: string; getOrigin?: () => Element | null; children: ReactNode;
}) {
  const { t: uiText } = useWorkspaceI18n();
  const reduced = useReducedMotion() ?? false;
  const dialog = useRef<HTMLDialogElement>(null), surface = useRef<HTMLDivElement>(null), content = useRef<HTMLDivElement>(null);
  const geometry = useRef<Geometry | null>(null), progress = useRef(0), motion = useRef<AnimationPlaybackControls | null>(null), pressedScrim = useRef(false);
  const titleId = useId();
  const [state, setState] = useState<"open" | "closed">("closed");

  const paint = (p: number) => {
    progress.current = p;
    const node = surface.current, body = content.current, g = geometry.current;
    if (!node || !body) return;
    if (!g || p >= 1) { node.style.cssText = ""; body.style.clipPath = ""; return; }
    const sx = g.sx + (1 - g.sx) * p, sy = g.sy + (1 - g.sy) * p, tx = g.x * (1 - p), ty = g.y * (1 - p);
    const radius = ROW_RADIUS + (RADIUS - ROW_RADIUS) * p;
    // The radius is divided by the scale so the corners stay round while the box is stretched (the recording animates it the same way, in percent).
    node.style.transform = `translate(${tx}px, ${ty}px) scale(${sx}, ${sy})`;
    node.style.borderRadius = `${radius / sx}px / ${radius / sy}px`;
    node.style.opacity = String(g.from ? Math.min(1, p / .25) : Math.min(1, .4 + p * 2));
    body.style.clipPath = `inset(${ty}px ${g.w - (tx + g.w * sx)}px ${g.h - (ty + g.h * sy)}px ${tx}px round ${radius}px)`;
  };
  const measure = () => {
    const box = dialog.current?.getBoundingClientRect(), from = getOrigin?.()?.getBoundingClientRect();
    if (!box || !box.width || reduced) { geometry.current = null; return; }
    // Without a row to travel from (it was deleted, or filtered away) the surface rises from a little below and smaller.
    geometry.current = from && from.width ? { x: from.left - box.left, y: from.top - box.top, sx: from.width / box.width, sy: from.height / box.height, w: box.width, h: box.height, from: true }
      : { x: 0, y: 8, sx: .94, sy: .94, w: box.width, h: box.height, from: false };
  };

  useLayoutEffect(() => {
    const node = dialog.current;
    if (!node) return;
    motion.current?.stop();
    if (open) {
      if (!node.open) node.showModal();
      measure(); paint(reduced ? 1 : 0);
      // data-state starts the overlay and content fades once the dialog is in the top layer
      setState("open");
      content.current?.focus({ preventScroll: true });
      if (!reduced) motion.current = animate(progress.current, 1, { ...OPEN_SPRING, onUpdate: paint, onComplete: () => paint(1) });
      return;
    }
    if (!node.open) return;
    setState("closed");
    // The row may have moved meanwhile: fold toward wherever it is now.
    measure();
    const finish = () => { if (node.open) node.close(); };
    if (reduced) { const timer = setTimeout(finish, 120); return () => clearTimeout(timer); }
    const cap = setTimeout(finish, CLOSE_CAP_MS);
    motion.current = animate(progress.current, 0, { ...CLOSE_SPRING, restDelta: .003, restSpeed: .02, onUpdate: paint, onComplete: finish });
    return () => clearTimeout(cap);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a change of `open` runs the morph; measure and paint read refs
  }, [open]);
  useEffect(() => () => motion.current?.stop(), []);

  return <dialog ref={dialog} className="queue-pop" data-state={state} aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); onClose(); }}
    // A press that starts inside and is released on the scrim, or the other way round (dragging off the hold button), is not a click on the scrim.
    onPointerDown={event => { pressedScrim.current = event.target === event.currentTarget; }}
    onClick={event => { if (event.target === event.currentTarget && pressedScrim.current) onClose(); pressedScrim.current = false; }}>
    <div ref={surface} className="queue-pop__surface" aria-hidden="true" />
    <div ref={content} className="queue-pop__content" tabIndex={-1}>
      <h2 id={titleId} className="queue-pop__sr">{title}</h2>
      {children}
      <span className="queue-pop__closeslot"><button type="button" className="queue-pop__close" aria-label={uiText("Close {0}", [label])} onClick={onClose}><X size={16} /></button></span>
    </div>
  </dialog>;
}
