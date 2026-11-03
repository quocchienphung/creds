"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useEffect, useId, useRef, useState } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import "./storage-onboarding.css";

const steps = [
  { title: "A home for everything you know", copy: "Keep your finance, banking, SQL and data documents together. Your knowledge library starts with the files you already have.", scene: "An open folder ready to receive documents" },
  { title: "Bring your documents, keep the context", copy: "Drop in files, choose a knowledge area, and follow each processing step. Originals stay available to download whenever you need them.", scene: "Documents stacking inside an open folder" },
  { title: "See your knowledge take shape", copy: "Your storage map grows with every document. Explore each area, search your library, and review what was stored before moving on.", scene: "A completed badge with a check mark" },
];

export interface StorageOnboardingProps {
  open: boolean;
  onClose: () => void;
  onStart: () => void;
}

function StorageIllustration({ step }: { step: number }) {
  const { t: uiText } = useWorkspaceI18n();
  const reducedMotion = useReducedMotion();
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const driftX = useSpring(pointerX, { stiffness: 140, damping: 22 });
  const driftY = useSpring(pointerY, { stiffness: 140, damping: 22 });
  const badge = step === 2;
  const files = step === 1;
  const spring = reducedMotion ? { duration: 0 } : { type: "spring" as const, stiffness: 180, damping: 22 };
  return <motion.svg className="storage-onboarding__art" viewBox="0 0 320 200" role="img" aria-label={uiText(steps[step].scene)} style={{ x: driftX, y: driftY }} onPointerMove={event => {
    if (event.pointerType !== "mouse" || reducedMotion) return;
    const box = event.currentTarget.getBoundingClientRect();
    pointerX.set((event.clientX - box.left - box.width / 2) * .025);
    pointerY.set((event.clientY - box.top - box.height / 2) * .025);
  }} onPointerLeave={() => { pointerX.set(0); pointerY.set(0); }}>
    <motion.rect className="storage-onboarding__shade" animate={badge ? { x: 135, y: 130, width: 22, height: 52, rx: 4, rotate: 16 } : { x: 98, y: 51, width: 44, height: 22, rx: 7, rotate: 0 }} transition={spring} />
    <motion.rect className="storage-onboarding__shade" animate={badge ? { x: 163, y: 130, width: 22, height: 52, rx: 4, rotate: -16 } : { x: 92, y: 64, width: 136, height: 88, rx: 12, rotate: 0 }} transition={spring} />
    <motion.rect className="storage-onboarding__shade" animate={badge ? { x: 106, y: 38, width: 108, height: 108, rx: 54, opacity: 1 } : { x: 92, y: 64, width: 136, height: 88, rx: 12, opacity: 0 }} transition={spring} />
    {[{ x: 106, y: 44, rotate: -10 }, { x: 130, y: 38, rotate: -2 }, { x: 156, y: 44, rotate: 9 }, { x: 234, y: 8, rotate: 16 }].map((paper, index) => <motion.rect key={index} className="storage-onboarding__paper" animate={files ? { ...paper, width: index === 3 ? 48 : 56, height: index === 3 ? 60 : 72, rx: 6, opacity: 1 } : { x: badge ? 150 : 90 + index * 45, y: badge ? 82 : -20, width: 20, height: 28, rx: 5, rotate: 0, opacity: 0 }} transition={spring} />)}
    <motion.rect className="storage-onboarding__paper storage-onboarding__front" animate={badge ? { x: 118, y: 50, width: 84, height: 84, rx: 42 } : { x: 88, y: 90, width: 144, height: 64, rx: 11 }} transition={spring} />
    <motion.path d="M226 30C214 13 198 13 190 30" className="storage-onboarding__trail" animate={{ opacity: files ? 1 : 0 }} transition={spring} />
    <motion.path d="M148 114H172" className="storage-onboarding__stroke" animate={{ opacity: step === 0 ? 1 : 0 }} transition={spring} />
    <motion.path d="M151 36H169M160 27V45" className="storage-onboarding__stroke" animate={{ opacity: step === 0 ? 1 : 0 }} transition={spring} />
    <motion.path d="M249 17L276 25M247 26L270 32M244 34L261 39" className="storage-onboarding__stroke" animate={{ opacity: files ? 1 : 0 }} transition={spring} />
    <motion.path d="M111 51L104 44M160 28V18M208 51L216 45" className="storage-onboarding__stroke" animate={{ opacity: badge ? 1 : 0 }} transition={spring} />
    <motion.path d="M143 93L155 105L178 80" className="storage-onboarding__check" animate={{ opacity: badge ? 1 : 0, pathLength: badge ? 1 : 0 }} transition={spring} />
  </motion.svg>;
}

export function StorageOnboarding({ open, onClose, onStart }: StorageOnboardingProps) {
  const { t: uiText } = useWorkspaceI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [step, setStep] = useState(0);
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    if (!open && dialog.current?.open) dialog.current?.close();
  }, [open]);
  return <dialog ref={dialog} className="storage-onboarding" aria-labelledby={titleId} aria-describedby={descriptionId} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }} onKeyDown={event => {
    if (event.key === "ArrowRight") { event.preventDefault(); setStep(current => Math.min(2, current + 1)); }
    if (event.key === "ArrowLeft") { event.preventDefault(); setStep(current => Math.max(0, current - 1)); }
  }}>
    <div className="storage-onboarding__card">
      <div className="storage-onboarding__stage">
        <StorageIllustration step={step} />
        <button type="button" className="storage-onboarding__skip" onClick={onClose}>{uiText("Skip")}</button>
      </div>
      <div className="storage-onboarding__body">
        <div className="storage-onboarding__copy" aria-live="polite" aria-atomic="true">
          <motion.div key={step} initial={reducedMotion ? false : { opacity: 0, y: 5, filter: "blur(3px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={{ duration: reducedMotion ? 0 : .2 }}>
          <h2 id={titleId}>{uiText(steps[step].title)}</h2>
          <p id={descriptionId}>{uiText(steps[step].copy)}</p>
          <span className="storage-onboarding__sr">{uiText("Step ")}{uiText(step + 1)} {uiText(" of 3")}</span>
          </motion.div>
        </div>
        <div className="storage-onboarding__footer">
          <div className="storage-onboarding__dots" role="group" aria-label={uiText("Storage introduction steps")}>{steps.map((item, index) => <button key={item.title} type="button" aria-label={uiText("Step {0}: {1}", [index + 1, item.title])} aria-current={step === index ? "step" : undefined} onClick={() => setStep(index)}><span /></button>)}</div>
          <div className="storage-onboarding__actions">
            <button type="button" className="storage-onboarding__back" aria-label={uiText("Previous step")} disabled={step === 0} onClick={() => setStep(current => Math.max(0, current - 1))}><ArrowLeft size={16} /><span>{uiText("Back")}</span></button>
            <button type="button" className="storage-onboarding__next" onClick={() => step === 2 ? onStart() : setStep(current => current + 1)}>{uiText(step === 2 ? uiText("Add documents") : uiText("Next"))}<ArrowRight size={16} /></button>
          </div>
        </div>
      </div>
    </div>
  </dialog>;
}
