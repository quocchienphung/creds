"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AnimatedNumber } from "../terrain/AnimatedNumber";
import "../terrain/activity-terrain.css";
import { Sparkline } from "./Sparkline";

export interface MetricCardProps {
  label: string; value: number; context: string;
  /** Digits after the point. */
  decimals?: number; suffix?: string;
  /** A short chip such as "+3"; write the direction into the text. Omitted when there is no change to report. */
  change?: string; series?: readonly number[];
}

const format = (value: number, decimals: number) => value.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

/**
 * A compact summary of one number. The digits roll up from zero on first view and then between values; the label, context and chip
 * slide in from the direction the number moved, and the chip's width springs. The number is also given once, plainly, to assistive technology.
 */
export function MetricCard({ label, value, context, decimals = 0, suffix, change, series }: MetricCardProps) {
  const { t: uiText } = useWorkspaceI18n();
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(0);
  useEffect(() => { const frame = requestAnimationFrame(() => setShown(value)); return () => cancelAnimationFrame(frame); }, [value]);
  const [seen, setSeen] = useState(value), [direction, setDirection] = useState<1 | -1>(1);
  if (seen !== value) { setSeen(value); setDirection(value >= seen ? 1 : -1); }
  const travel = reduce ? 0 : 10 * direction;
  const copy = { initial: { opacity: 0, y: travel }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -travel }, transition: { duration: reduce ? .01 : .22, ease: [0.22, 1, 0.36, 1] as const } };
  return <article className="sk-metric" aria-label={uiText(label)}>
    <header>
      <span className="sk-metric__label">{uiText(label)}</span>
      <AnimatePresence initial={false} mode="popLayout">{change && <motion.span key={change} className="sk-metric__chip" data-down={change.startsWith("-") || undefined} {...copy}>{uiText(change)}</motion.span>}</AnimatePresence>
    </header>
    <div className="sk-metric__value"><AnimatedNumber text={format(shown, decimals)} />{suffix && <small>{uiText(suffix)}</small>}</div>
    {series && <Sparkline values={series} label={uiText("{0} trend", [label])} />}
    <div className="sk-metric__context"><AnimatePresence initial={false} mode="popLayout"><motion.span key={context} {...copy}>{uiText(context)}</motion.span></AnimatePresence></div>
  </article>;
}
