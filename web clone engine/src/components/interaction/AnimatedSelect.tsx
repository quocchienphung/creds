"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { Select } from "@base-ui/react/select";
import { Check, ChevronDown } from "lucide-react";
import "./animated-select.css";

export interface SelectOption { value: string; label: string; decoration?: ReactNode }

/** Base UI owns selection, focus, typeahead and collision handling; motion uses the shared menu tokens. */
export function AnimatedSelect({ label, value, options, onChange, disabled = false }: {
  label: string; value: string; options: readonly SelectOption[]; onChange: (value: string) => void; disabled?: boolean;
}) {
  const { t: uiText } = useWorkspaceI18n();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [host, setHost] = useState<{ container: HTMLElement | null; style: CSSProperties; motionOff: boolean }>({ container: null, style: {}, motionOff: false });
  function closeOnEscape(event: KeyboardEvent) {
    // Focus can still be on the trigger when a pointer-opened list receives Escape.
    if (open && event.key === "Escape") {
      event.preventDefault(); event.stopPropagation(); setOpen(false);
      requestAnimationFrame(() => trigger.current?.focus({ preventScroll: true }));
    }
  }
  return <span className="ui-select">
    <Select.Root value={value} items={options.map(option => ({ ...option, label: uiText(option.label) }))} disabled={disabled} modal={false} open={open} onValueChange={next => { if (next !== null) onChange(next); }} onOpenChange={open => {
      setOpen(open);
      const button = trigger.current;
      if (!open || !button) return;
      const computed = getComputedStyle(button);
      // A dialog is in the browser's top layer: keep its dropdown in that same dialog, and inherit the workspace theme.
      setHost({ container: button.closest("dialog"), motionOff: button.closest('[data-ui-motion="off"]') !== null, style: {
        "--ui-select-paper": computed.getPropertyValue("--panel").trim() || "#fff",
        "--ui-select-ink": computed.getPropertyValue("--ink").trim() || "#202020",
        "--ui-select-muted": computed.getPropertyValue("--muted").trim() || "#858585",
        "--ui-select-line": computed.getPropertyValue("--line").trim() || "#e9e9e9",
        "--ui-select-tray": computed.getPropertyValue("--tray").trim() || "#f7f7f7",
      } as CSSProperties });
    }}>
      <Select.Trigger ref={trigger} className="ui-select-trigger" aria-label={uiText(label)} onKeyDownCapture={closeOnEscape}>
        <Select.Value className="ui-select-value" /><Select.Icon className="ui-select-icon"><ChevronDown size={15} /></Select.Icon>
      </Select.Trigger>
      <Select.Portal container={host.container ?? undefined}>
        <Select.Positioner className="ui-select-positioner" align="end" sideOffset={6} collisionPadding={10} alignItemWithTrigger={false} style={host.style} data-ui-motion={host.motionOff ? "off" : undefined}>
          <Select.Popup className="ui-select-popup" onKeyDownCapture={closeOnEscape}>
            <Select.List aria-label={uiText(label)}>{options.map(option => <Select.Item key={option.value} value={option.value} className="ui-select-item">
              {option.decoration && <span className="ui-select-decoration" aria-hidden="true">{uiText(option.decoration)}</span>}
              <Select.ItemText>{uiText(option.label)}</Select.ItemText><Select.ItemIndicator className="ui-select-check"><Check size={14} /></Select.ItemIndicator>
            </Select.Item>)}</Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  </span>;
}
