"use client";

import { useId } from "react";
import { Languages } from "lucide-react";
import { useWorkspaceI18n } from "../i18n/WorkspaceI18n";
import "./account-theme.css";

const options = [
  { value: "en", label: "English", short: "EN" },
  { value: "vi", label: "Tiếng Việt", short: "VI" },
] as const;

/** The account menu's compact language picker shares Theme's height and thumb motion. */
export function AccountLanguage() {
  const { locale, setLocale, t } = useWorkspaceI18n();
  const id = useId();
  return <div className="account-theme account-language" data-interaction-own>
    <Languages size={16} aria-hidden="true" /><span id={id}>{t("Language")}</span>
    <div className="account-theme__segments" role="group" aria-labelledby={id}>
      <span className="account-theme__thumb" data-choice={locale === "vi" ? 1 : 0} aria-hidden="true" />
      {options.map((option, index) => <button key={option.value} type="button" role="menuitemradio" aria-checked={locale === option.value}
        aria-label={option.label} title={option.label} lang={option.value} data-language-option tabIndex={locale === option.value ? 0 : -1}
        onClick={() => setLocale(option.value)} onKeyDown={event => {
          const next = event.key === "ArrowRight" || event.key === "ArrowLeft" ? 1 - index : event.key === "Home" ? 0 : event.key === "End" ? 1 : null;
          if (next === null) return;
          event.preventDefault(); event.stopPropagation(); setLocale(options[next].value);
          event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
        }}>{option.short}</button>)}
    </div>
  </div>;
}
