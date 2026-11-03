"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useId } from "react";
import type { KeyboardEvent } from "react";
import { motion } from "motion/react";

export interface SegmentedOption<T extends string> { value: T; label: string }

/**
 * A small group of mutually exclusive buttons with a thumb that glides to the chosen one (a spring at the preview's 10.7 rad/s, critically damped).
 * Arrow keys move the choice, Home and End jump to the ends; only the chosen button is in the tab order.
 */
export function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly SegmentedOption<T>[]; onChange: (value: T) => void }) {
  const { t: uiText } = useWorkspaceI18n();
  const id = useId();
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = options.length - 1;
    const next = event.key === "ArrowRight" || event.key === "ArrowDown" ? (index + 1) % options.length : event.key === "ArrowLeft" || event.key === "ArrowUp" ? (index + last) % options.length : event.key === "Home" ? 0 : event.key === "End" ? last : null;
    if (next === null) return;
    event.preventDefault();
    onChange(options[next].value);
    (event.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus();
  }
  return <div className="at-segmented" role="group" aria-label={uiText(label)}>
    <div className="at-segmented__track">
      {options.map((option, index) => {
        const pressed = option.value === value;
        return <button key={option.value} type="button" className="at-segmented__button" data-value={option.value} aria-pressed={pressed} tabIndex={pressed ? 0 : -1} onClick={() => onChange(option.value)} onKeyDown={event => onKeyDown(event, index)}>
          {pressed && <motion.span layoutId={`${id}-thumb`} className="at-segmented__thumb" aria-hidden="true" transition={{ type: "spring", stiffness: 114.5, damping: 21.4 }} />}
          <span className="at-segmented__label">{uiText(option.label)}</span>
        </button>;
      })}
    </div>
  </div>;
}
