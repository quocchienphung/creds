"use client";

import { useMemo } from "react";
import { motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { Button } from "../../../uiarc/button/Button";
import { motionTokens } from "../../../uiarc/motion-tokens";
import { wordsOfChange } from "../engine/applied-change";
import { SpeculativeRun } from "./SpeculativeRun";
import "./applied-change.css";

export interface AppliedInfo { key: number; sheet: string; cell: string; before: string; after: string }

/**
 * What a person just confirmed, replayed with the Speculative-decoding card of UIArc: the words the file had on one lane, the words that were
 * approved on the other, the ones that stayed accepted with a check, the ones that changed struck through and replaced. It sits above the next
 * issue until it is dismissed or the next fix replaces it. It only shows; Undo is the same Undo as the toolbar's.
 */
export function AppliedChange({ info, busy, onUndo, onDismiss }: { info: AppliedInfo; busy: boolean; onUndo: () => void; onDismiss: () => void }) {
  const { t } = useWorkspaceI18n();
  const reduce = useReducedMotion() ?? false;
  const predictions = useMemo(() => wordsOfChange(info.before, info.after), [info.before, info.after]);
  return <motion.section className="ac" aria-label={t("Change applied")} layout={false} initial={reduce ? false : { opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? undefined : { opacity: 0, y: -4, transition: { duration: motionTokens.duration.exit } }} transition={reduce ? { duration: 0 } : { duration: motionTokens.duration.standard, ease: [...motionTokens.ease.enter] }}>
    <div className="ac-bar">
      <span className="ac-where"><code className="ac-cell">{info.cell}</code><span className="ac-sheet">{info.sheet}</span></span>
      <span className="ac-actions">
        <Button variant="secondary" size="sm" disabled={busy} onClick={onUndo}>{t("Undo")}</Button>
        <Button variant="ghost" size="sm" aria-label={t("Dismiss")} title={t("Dismiss")} onClick={onDismiss}><X size={15} aria-hidden="true" /></Button>
      </span>
    </div>
    <SpeculativeRun key={info.key} variant="confirmed" title="Change applied" predictions={predictions} picks={{}} text={info.after} onClose={onDismiss} />
  </motion.section>;
}
