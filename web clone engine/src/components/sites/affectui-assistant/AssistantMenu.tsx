"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { wireMenuHighlight } from "@/components/interaction/menu-motion";

/** Native top-layer menus stay visible above the composer, including at the bottom of a mobile chat. */
export function AssistantMenu({ label, title, children, end = false, active = false, className = "ui-as-ghost" }: {
  label: ReactNode; title: string; children: (close: () => void) => ReactNode; end?: boolean; active?: boolean; className?: string;
}) {
  const { t: uiText } = useWorkspaceI18n();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => menu.current ? wireMenuHighlight(menu.current) : undefined, []);
  function close() { setOpen(false); }
  useEffect(() => {
    if (!open && menu.current?.matches(":popover-open")) { menu.current.hidePopover(); trigger.current?.focus(); }
  }, [open]);
  function show(focus = false) {
    const panel = menu.current, button = trigger.current;
    if (!panel || !button) return;
    if (panel.matches(":popover-open")) { panel.hidePopover(); button.focus(); return; }
    panel.showPopover();
    const rect = button.getBoundingClientRect(), box = { width: panel.offsetWidth, height: panel.offsetHeight };
    panel.style.left = `${Math.max(8, Math.min(end ? rect.right - box.width : rect.left, innerWidth - box.width - 8))}px`;
    const above = rect.bottom + box.height + 8 > innerHeight;
    panel.dataset.interactionSide = above ? "top" : "bottom";
    panel.style.top = `${Math.max(8, Math.min(above ? rect.top - box.height - 6 : rect.bottom + 6, innerHeight - box.height - 8))}px`;
    if (focus) panel.querySelector<HTMLButtonElement>("button")?.focus();
  }
  return <span className="ui-as-anchor">
    <button ref={trigger} type="button" className={className} aria-haspopup="menu" aria-expanded={open} data-active={active || undefined} onClick={() => show()} onKeyDown={event => { if (event.key === "ArrowDown") { event.preventDefault(); show(true); } }}>{uiText(label)}</button>
    <div ref={menu} popover="auto" className="ui-as-menu assistant-menu" data-interaction-menu data-align={end ? "end" : undefined} aria-label={uiText(title)} onToggle={event => setOpen(event.newState === "open")} onKeyDown={event => {
      if (event.key === "Escape") { close(); return; }
      if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
      const items = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") || []);
      const index = items.findIndex(item => item === document.activeElement);
      const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      event.preventDefault(); items[next]?.focus();
    }}><span className="ui-as-menu__title">{uiText(title)}</span><div className="ui-as-menu__list" role="menu">{children(close)}</div></div>
  </span>;
}
