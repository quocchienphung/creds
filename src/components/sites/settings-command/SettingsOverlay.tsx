"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { motion, useReducedMotion } from "motion/react";
import { SettingsCommand } from "./SettingsCommand";
import { sections, type SectionId, type SettingsValues } from "./settings-model";
import "./settings-command.css";

export interface OverlayRect { x: number; y: number; width: number; height: number }

/** The size the Settings take over the workspace: roomy on a desktop, nearly the whole screen on a phone. */
function targetRect(): OverlayRect {
  const width = window.innerWidth, height = window.innerHeight;
  const w = width <= 700 ? width - 16 : Math.min(1040, width - 48);
  const h = width <= 700 ? height - 16 : Math.min(760, height - 48);
  return { x: Math.round((width - w) / 2), y: Math.round((height - h) / 2), width: w, height: h };
}
const rectOf = (node: Element | null): OverlayRect | null => {
  if (!node) return null;
  const box = node.getBoundingClientRect();
  return box.width ? { x: box.left, y: box.top, width: box.width, height: box.height } : null;
};

/**
 * The Settings as a block that grows out of the menu they were opened from: the box of the small menu (its place, size and corner radius)
 * is the first frame of a large panel, which springs to the centre of the screen while its texts, tabs and rows rise into place one
 * after another. Closing sends the panel back into the account button. The panel is laid out at its final size from the first frame and
 * clipped by the growing box, so nothing reflows during the flight.
 */
export function SettingsOverlay({ origin, section, saved, onSave, onClose, notify, profileEmail }: {
  /** The box the panel starts from (the open menu); without one it grows from the account button. */
  origin: OverlayRect | null;
  section: string;
  saved: SettingsValues; onSave: (values: SettingsValues) => void;
  onClose: () => void; notify?: (message: string) => void;
  profileEmail?: string;
}) {
  const { t: uiText } = useWorkspaceI18n();
  const reduce = useReducedMotion();
  const [target, setTarget] = useState<OverlayRect>(targetRect);
  const [start] = useState<OverlayRect>(() => origin ?? rectOf(document.querySelector(".ui-as-user")) ?? { x: window.innerWidth / 2 - 100, y: window.innerHeight / 2 - 20, width: 200, height: 40 });
  const [leaving, setLeaving] = useState<OverlayRect | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const returnTo = useRef<Element | null>(null);
  const initialSection = sections.find(item => item.id === section)?.id as SectionId | undefined;

  useEffect(() => {
    const resize = () => setTarget(targetRect());
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  useLayoutEffect(() => { returnTo.current = document.activeElement; }, []);
  useEffect(() => {
    panel.current?.focus({ preventScroll: true });
    return () => { const node = returnTo.current; if (node instanceof HTMLElement && node.isConnected) node.focus({ preventScroll: true }); };
  }, []);
  // The page underneath does not scroll while the Settings are open.
  useEffect(() => {
    const previous = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => { document.documentElement.style.overflow = previous; };
  }, []);

  const close = useCallback(() => {
    setLeaving(current => current ?? rectOf(document.querySelector(".ui-as-user")) ?? start);
  }, [start]);
  // Escape closes the panel wherever focus is (the search and the select lists stop their own Escape before it gets here).
  useEffect(() => {
    const key = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape" && !event.defaultPrevented) { event.preventDefault(); close(); } };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [close]);
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") return;
    // Keep Tab inside the panel (the lists the selects draw are outside it, and manage their own keys).
    const items = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]')].filter(node => node.offsetParent !== null);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  const spring = reduce ? { duration: 0 } : { type: "spring" as const, stiffness: 170, damping: 24 };
  const goal = leaving ?? target;
  const radius = leaving ? 12 : 20;
  return <div className="sc-overlay" onKeyDown={onKeyDown}>
    <motion.div className="sc-overlay__scrim" aria-hidden="true" initial={{ opacity: 0 }} animate={{ opacity: leaving ? 0 : 1 }} transition={{ duration: reduce ? 0.12 : 0.28 }} onPointerDown={close} />
    <motion.div ref={panel} className="sc-overlay__panel sc-tokens" role="dialog" aria-modal="true" aria-label={uiText("Settings")} tabIndex={-1}
      initial={{ x: start.x, y: start.y, width: start.width, height: start.height, borderRadius: 14, opacity: 1 }}
      animate={{ x: goal.x, y: goal.y, width: goal.width, height: goal.height, borderRadius: radius, opacity: leaving && !reduce ? 0.01 : leaving ? 0 : 1 }}
      transition={leaving ? { ...(reduce ? { duration: 0.14 } : { type: "spring", stiffness: 230, damping: 28 }), opacity: { duration: 0.18, delay: reduce ? 0 : 0.14 } } : spring}
      onAnimationComplete={() => { if (leaving) onClose(); }}>
      <motion.div className="sc-overlay__content" style={{ width: target.width - 2, height: target.height - 2 }} animate={{ opacity: leaving ? 0 : 1 }} transition={{ duration: leaving ? 0.1 : 0 }}>
        <SettingsCommand saved={saved} onSave={onSave} notify={notify} initialSection={initialSection} onClose={close} reveal={!reduce} profileEmail={profileEmail} />
      </motion.div>
    </motion.div>
  </div>;
}
