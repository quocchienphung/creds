"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import "./arc-layout.css";

/**
 * The frame the two Collateral sections share. Breadcrumbs, the step tabs and the file chip are independent rebuilds of the topbar and the
 * nested nav of UIArc's Sidebar block (public preview, docs/research/uiarc-sidebar-block/): crumbs separated by a slash, the last one swaps
 * with a vertical slide, the active tab has a sliding pill.
 */
export function Breadcrumbs({ trail }: { trail: string[] }) {
  const { t: uiText } = useWorkspaceI18n();
  const reduce = useReducedMotion();
  const last = trail.length - 1;
  return <nav className="cl-crumbs" aria-label={uiText("Breadcrumb")}>
    <ol>{trail.map((crumb, index) => <li key={index} className={index === last ? "cl-crumb cl-crumb--current" : "cl-crumb"} aria-current={index === last ? "page" : undefined}>
      {index === last ? <span className="cl-crumb__swap"><AnimatePresence mode="popLayout" initial={false}><motion.span key={crumb} initial={reduce ? false : { y: "100%", opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={reduce ? undefined : { y: "-100%", opacity: 0 }} transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 38 }}>{uiText(crumb)}</motion.span></AnimatePresence></span> : uiText(crumb)}
    </li>)}</ol>
  </nav>;
}

export function FileChip({ name, detail, onClose }: { name: string; detail: string; onClose: () => void }) {
  const { t: uiText } = useWorkspaceI18n();
  return <span className="cl-file"><span className="cl-file__name" title={name}>{name}</span><small>{detail}</small><button type="button" className="cl-file__close" aria-label={uiText("Close file")} title={uiText("Close file")} onClick={onClose}><X size={13} /></button></span>;
}

export function SectionHeader({ trail, title, file }: { trail: string[]; title: string; file?: ReactNode }) {
  const { t: uiText } = useWorkspaceI18n();
  return <header className="cl-header"><div className="cl-topbar"><Breadcrumbs trail={trail} />{file}</div><h1 className="ui-as-page-title">{uiText(title)}</h1></header>;
}
