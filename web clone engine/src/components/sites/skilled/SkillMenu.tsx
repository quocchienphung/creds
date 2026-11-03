"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useRef, useState, type ReactNode } from "react";
import { Menu } from "@base-ui/react/menu";
import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronDown } from "lucide-react";
import "./skill-menu.css";

export interface SkillMenuOption<Value extends string> {
  value: Value;
  label: string;
  icon?: ReactNode;
  description?: string;
}

/** Public ARC menu geometry, with Base UI handling focus, keyboard and collision positioning. */
export function SkillMenu<Value extends string>({ label, value, options, onSelect, icon, className = "sk-chip", triggerLabel, focusAfterSelect, actions = false }: {
  label: string;
  value: Value;
  options: readonly SkillMenuOption<Value>[];
  onSelect: (value: Value) => void;
  icon?: ReactNode;
  className?: string;
  triggerLabel?: string;
  focusAfterSelect?: (value: Value) => HTMLElement | null;
  actions?: boolean;
}) {
  const { t: uiText } = useWorkspaceI18n();
  const trigger = useRef<HTMLButtonElement>(null);
  const selected = useRef<Value | null>(null);
  const [theme, setTheme] = useState("light");
  const current = options.find(option => option.value === value);
  function choose(next: Value) { selected.current = next; onSelect(next); }
  const renderOption = (option: SkillMenuOption<Value>) => <>
    {option.icon && <span className="sk-menu-icon" aria-hidden="true">{uiText(option.icon)}</span>}
    <span className="sk-menu-text"><span>{uiText(option.label)}</span>{option.description && <small>{uiText(option.description)}</small>}</span>
    {!actions && <span className="sk-menu-check" aria-hidden="true">{value === option.value && <Check size={14} />}</span>}
  </>;
  return <Menu.Root modal={false} onOpenChange={open => {
    if (open) { selected.current = null; setTheme(trigger.current?.closest("[data-theme]")?.getAttribute("data-theme") ?? "light"); }
  }}>
    <Menu.Trigger ref={trigger} className={`${className} sk-menu-trigger`} aria-label={uiText("{0}: {1}", [label, triggerLabel ?? current?.label ?? ""])}>
      {uiText(icon)}<span className="sk-picker-value"><AnimatePresence initial={false} mode="popLayout"><motion.span key={triggerLabel ?? value} initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -2 }} transition={{ duration: .16, ease: [.22, 1, .36, 1] }}>{uiText(triggerLabel ?? current?.label)}</motion.span></AnimatePresence></span><ChevronDown size={12} className="sk-picker-chevron" />
    </Menu.Trigger>
    <Menu.Portal><Menu.Positioner sideOffset={6} align="start" collisionPadding={12} className="sk-menu-positioner">
      <Menu.Popup className="sk-menu" data-theme={theme} finalFocus={() => selected.current !== null && focusAfterSelect ? focusAfterSelect(selected.current) ?? true : true}>
        <Menu.Group><Menu.GroupLabel className="sk-menu-label">{uiText(label)}</Menu.GroupLabel>
          {actions ? options.map(option => <Menu.Item className="sk-menu-item" key={option.value} label={uiText(option.label)} aria-label={uiText(option.label)} data-description={Boolean(option.description) || undefined} onClick={() => choose(option.value)}>{uiText(renderOption(option))}</Menu.Item>) :
            <Menu.RadioGroup value={value} onValueChange={(next: Value) => choose(next)}>{options.map(option => <Menu.RadioItem className="sk-menu-item" key={option.value} value={option.value} label={uiText(option.label)} aria-label={uiText(option.label)} data-description={Boolean(option.description) || undefined} closeOnClick>{uiText(renderOption(option))}</Menu.RadioItem>)}</Menu.RadioGroup>}
        </Menu.Group>
      </Menu.Popup>
    </Menu.Positioner></Menu.Portal>
  </Menu.Root>;
}
