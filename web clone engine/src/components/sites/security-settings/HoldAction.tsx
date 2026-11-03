"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useEffect, useId, useRef, useState } from "react";
import { animate, motion, useMotionValue } from "motion/react";
import { Check, LoaderCircle, LogOut, type LucideIcon } from "lucide-react";

export function HoldAction({ disabled, onConfirm, label = "Sign out of other sessions", doneLabel = "Other sessions signed out", Icon = LogOut }: { disabled: boolean; onConfirm: () => Promise<boolean>; label?: string; doneLabel?: string; Icon?: LucideIcon }) {
  const { t: uiText } = useWorkspaceI18n();
  const [phase, setPhase] = useState<'idle' | 'holding' | 'busy' | 'done'>('idle');
  const progress = useMotionValue(0);
  const animation = useRef<ReturnType<typeof animate> | undefined>(undefined);
  const held = useRef(false);
  const busy = useRef(false);
  const mounted = useRef(true);
  const hint = useId();
  const confirm = useRef(onConfirm); confirm.current = onConfirm;
  function cancel() { if (busy.current) return; held.current = false; animation.current?.stop(); progress.set(0); setPhase('idle'); }
  useEffect(() => {
    mounted.current = true;
    window.addEventListener('blur', cancel);
    const hidden = () => { if (document.hidden) cancel(); }; document.addEventListener('visibilitychange', hidden);
    return () => { mounted.current = false; animation.current?.stop(); window.removeEventListener('blur', cancel); document.removeEventListener('visibilitychange', hidden); };
    // The cancellation only reads refs and the stable MotionValue.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function start() {
    if (disabled || held.current || busy.current || phase === 'done') return;
    held.current = true; setPhase('holding'); progress.set(0);
    animation.current = animate(progress, 1, { duration: 1.2, ease: 'linear', onComplete: () => {
      if (!held.current) return;
      held.current = false; busy.current = true; setPhase('busy');
      void confirm.current().then(ok => { if (mounted.current) { setPhase(ok ? 'done' : 'idle'); if (!ok) progress.set(0); } }).finally(() => { busy.current = false; });
    } });
  }
  return <span className="sec-hold-wrap"><button type="button" className="sec-button sec-hold" data-phase={phase} data-interaction-own disabled={disabled || phase === 'busy' || phase === 'done'} aria-label={uiText(label)} aria-describedby={hint} aria-busy={phase === 'busy'}
    onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); start(); }}
    onPointerUp={cancel} onPointerCancel={cancel} onLostPointerCapture={() => { if (held.current) cancel(); }} onBlur={() => { if (held.current) cancel(); }} onClick={event => event.preventDefault()}
    onKeyDown={event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); if (!event.repeat) start(); } }} onKeyUp={event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); cancel(); } }}>
    <motion.span className="sec-hold-fill" aria-hidden="true" style={{ scaleX: progress }} />
    <span>{phase === 'busy' ? <LoaderCircle className="sec-spin" size={16} /> : phase === 'done' ? <Check size={16} /> : <Icon size={16} />}{uiText(phase === 'busy' ? uiText('Working…') : phase === 'done' ? doneLabel : label)}</span>
  </button><span id={hint} className="sec-sr">{uiText("Press and hold for 1.2 seconds to confirm. With a keyboard, hold Space or Enter.")}</span></span>;
}
