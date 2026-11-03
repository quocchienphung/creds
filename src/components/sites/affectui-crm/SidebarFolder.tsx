"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useId, type KeyboardEvent, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronDown, Folder, FolderOpen } from "lucide-react";
import "./sidebar-folder.css";

// Measured from the public App rail preview of UIArc's Sidebar (docs/research/uiarc-sidebar/): the child list
// grows/shrinks by height on a critically damped spring (no overshoot, ~550ms to settle); opacity leaves in
// ~100ms on close and trails the height by ~70ms on open.
const heightSpring = { type: "spring", stiffness: 150, damping: 25, restDelta: 0.2, restSpeed: 0.2 } as const;

type SidebarFolderProps = {
  id: string;
  title: string;
  open: boolean;
  lit: boolean;
  onToggle: (open: boolean) => void;
  children: ReactNode;
};

export function SidebarFolder({ id, title, open, lit, onToggle, children }: SidebarFolderProps) {
  const { t: uiText } = useWorkspaceI18n();
  const reduce = useReducedMotion();
  const bodyId = `${useId()}-${id}`;
  const keys = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowRight" && !open) { event.preventDefault(); onToggle(true); }
    else if (event.key === "ArrowLeft" && open) { event.preventDefault(); onToggle(false); }
  };
  return (
    <div className="workspace-folder" data-open={open ? "" : undefined}>
      <button type="button" className="ui-as-side__item workspace-folder__head" aria-expanded={open} aria-controls={bodyId} data-lit={lit ? "" : undefined} onClick={() => onToggle(!open)} onKeyDown={keys}>
        {open ? <FolderOpen size={16} strokeWidth={1.7} /> : <Folder size={16} strokeWidth={1.7} />}
        <span className="workspace-nav-label">{uiText(title)}</span>
        <motion.span className="workspace-folder__chevron" aria-hidden="true" initial={false} animate={{ rotate: open ? 0 : -90 }} transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 32 }}>
          <ChevronDown size={14} strokeWidth={1.8} />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            id={bodyId}
            className="workspace-folder__body"
            role="group"
            aria-label={uiText(title)}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1, transition: reduce ? { duration: 0 } : { height: heightSpring, opacity: { duration: 0.2, delay: 0.07, ease: [0.22, 1, 0.36, 1] } } }}
            exit={{ height: 0, opacity: 0, transition: reduce ? { duration: 0 } : { height: heightSpring, opacity: { duration: 0.1, ease: "easeOut" } } }}
          >
            <div className="workspace-folder__children">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
