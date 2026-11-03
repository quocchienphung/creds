"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check } from "lucide-react";

export type BarPhase = "edit" | "saving" | "saved";

/** The count rolls: a new number enters from below when it grows and from above when it shrinks. */
function Count({ value }: { value: number }) {
  const { t: uiText } = useWorkspaceI18n();
  const reduce = useReducedMotion();
  const [track, setTrack] = useState({ value, direction: 1 });
  if (track.value !== value) setTrack({ value, direction: value >= track.value ? 1 : -1 });
  const direction = track.direction;
  return <span className="sc-count" aria-hidden="true"><AnimatePresence initial={false} mode="popLayout"><motion.span key={value} initial={{ y: reduce ? 0 : `${direction * 0.9}em`, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: reduce ? 0 : `${direction * -0.9}em`, opacity: 0 }} transition={{ duration: reduce ? 0 : 0.26, ease: [0.22, 1, 0.36, 1] }}>{uiText(value)}</motion.span></AnimatePresence></span>;
}

/**
 * The floating unsaved-changes bar. It grows out of a small puck (46px tall; ~290px wide once it holds its content, on a spring that
 * settles in ~900ms in the public preview), rolls its count when the number of edits changes, and shrinks into a "Settings saved"
 * confirmation (146 × 42) after the save.
 */
export function SaveBar({ visible, phase, count, failed, onSave, onDiscard }: { visible: boolean; phase: BarPhase; count: number; failed: boolean; onSave: () => void; onDiscard: () => void }) {
  const { t: uiText, locale } = useWorkspaceI18n();
  const reduce = useReducedMotion();
  const holder = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    const node = holder.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setWidth(Math.ceil(node.getBoundingClientRect().width)));
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible, phase]);
  const spring = reduce ? { duration: 0 } : { type: "spring" as const, stiffness: 120, damping: 22 };
  return <div className="sc-dock">
    <AnimatePresence>
      {visible && <motion.div key="bar" className="sc-bar" role="group" aria-label={uiText(phase === "saved" ? uiText("Save status") : uiText("Unsaved changes"))}
        initial={{ y: reduce ? 0 : 26, opacity: 0, width: 46, height: 44 }}
        animate={{ y: 0, opacity: 1, width: width === null ? 46 : width + 2, height: phase === "saved" ? 42 : 46, transition: { ...spring, opacity: { duration: 0.2 } } }}
        exit={{ y: reduce ? 0 : 10, opacity: 0, transition: { duration: reduce ? 0.1 : 0.22, ease: [0.22, 1, 0.36, 1] } }}>
        <div className="sc-bar__content">
          <AnimatePresence initial={false} mode="popLayout">
            {phase === "saved"
              ? <motion.div key="saved" ref={holder} className="sc-bar__saved" data-phase="saved" initial={{ opacity: 0, filter: "blur(3px)" }} animate={{ opacity: 1, filter: "blur(0px)" }} exit={{ opacity: 0, filter: "blur(3px)" }} transition={{ duration: reduce ? 0 : 0.2 }}><Check size={16} aria-hidden="true" /><span>{uiText("Settings saved")}</span></motion.div>
              : <motion.div key="edit" ref={holder} className="sc-bar__edit" data-phase="edit" initial={{ opacity: 0, filter: "blur(3px)" }} animate={{ opacity: 1, filter: "blur(0px)" }} exit={{ opacity: 0, filter: "blur(3px)" }} transition={{ duration: reduce ? 0 : 0.2 }}>
                <span className={`sc-bar__count${failed ? " sc-bar__count--failed" : ""}`}><Count value={count} />{uiText("&nbsp;")}{locale === "vi" ? <><span>{uiText("thay đổi")}</span><span className="sc-long"> {uiText(" chưa lưu")}</span></> : <><span className="sc-long">{uiText("unsaved&nbsp;")}</span><span>{count === 1 ? uiText("change") : uiText("changes")}</span></>}<span className="sc-sr-only">{locale === "vi" ? uiText("{0} thay đổi chưa lưu", [count]) : uiText("{0} unsaved {1}", [count, count === 1 ? "change" : "changes"])}</span></span>
                <button type="button" className="sc-btn sc-btn--ghost" onClick={onDiscard} disabled={phase === "saving"}>{uiText("Discard")}</button>
                <button type="button" className="sc-btn sc-btn--primary" onClick={onSave} disabled={phase === "saving"} aria-busy={phase === "saving" || undefined}>{uiText(phase === "saving" ? uiText("Saving…") : uiText("Save"))}</button>
              </motion.div>}
          </AnimatePresence>
        </div>
      </motion.div>}
    </AnimatePresence>
  </div>;
}
