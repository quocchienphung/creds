"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useId } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import "./account-theme.css";

export type AccountThemeValue = "light" | "dark" | "system";
const options = [{ value: "light", label: "Light", Icon: Sun }, { value: "dark", label: "Dark", Icon: Moon }, { value: "system", label: "System", Icon: Monitor }] as const;

/** Dimensions and 580ms monotone thumb transition measured in UIArc's public User menu preview. */
export function AccountTheme({ value, onChange }: { value: AccountThemeValue; onChange: (value: AccountThemeValue) => void }) {
  const { t: uiText } = useWorkspaceI18n();
  const id = useId();
  const selected = Math.max(0, options.findIndex(option => option.value === value));
  return <div className="account-theme" data-interaction-own>
    <Sun size={16} aria-hidden="true" /><span id={id}>{uiText("Theme")}</span>
    <div className="account-theme__segments" role="group" aria-labelledby={id}>
      <span className="account-theme__thumb" data-choice={selected} aria-hidden="true" />
      {options.map(({ value: option, label, Icon }, index) => <button type="button" key={option} role="menuitemradio" aria-checked={value === option} aria-label={uiText(label)} title={uiText(label)} data-theme-option tabIndex={value === option ? 0 : -1}
        onClick={() => onChange(option)} onKeyDown={event => {
          const next = event.key === 'ArrowRight' ? (index + 1) % 3 : event.key === 'ArrowLeft' ? (index + 2) % 3 : null;
          if (next === null) return;
          event.preventDefault(); event.stopPropagation(); onChange(options[next].value);
          event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button')[next]?.focus();
        }}><Icon size={14} aria-hidden="true" /></button>)}
    </div>
  </div>;
}
