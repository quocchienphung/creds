"use client";

import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, type HTMLAttributes, type RefObject } from "react";
import { usePresence } from "motion/react";
import { animateMenu, wireMenuHighlight } from "./menu-motion";

type MenuSurfaceProps = HTMLAttributes<HTMLDivElement> & { side?: "top" | "bottom" | "left" | "right"; "data-side"?: string };
function useSurface(root: RefObject<HTMLElement | null>, side: string) {
  const [present, remove] = usePresence();
  const visual = useRef<{ opacity: string; transform: string } | undefined>(undefined);
  const opener = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const focused = document.activeElement;
    if (present && !opener.current) {
      const anchor = element.closest('.ui-as-anchor,.proc-dock__add,.stats-section__controls,.agt__bar');
      const trigger = anchor?.querySelector<HTMLElement>('button[aria-expanded="true"],button[aria-haspopup],button[role="combobox"]');
      if (trigger && !element.contains(trigger)) opener.current = trigger;
      else if (focused instanceof HTMLElement && focused !== document.body && !element.contains(focused)) opener.current = focused;
    }
    if (!present && opener.current?.isConnected && (element.contains(focused) || focused === document.body)) opener.current.focus({ preventScroll: true });
    const animation = animateMenu(element, present, side, visual.current);
    if (!present) void animation.finished.then(() => remove?.(), () => {});
    return () => {
      const style = getComputedStyle(element); visual.current = { opacity: style.opacity, transform: style.transform };
      animation.cancel();
    };
  }, [present, remove, side, root]);
  useLayoutEffect(() => root.current ? wireMenuHighlight(root.current) : undefined, [root]);
  return present;
}
export const MenuSurface = forwardRef<HTMLDivElement, MenuSurfaceProps>(function MenuSurface({ children, side = "bottom", role = "menu", ...props }, forwarded) {
  const root = useRef<HTMLDivElement>(null);
  const present = useSurface(root, props["data-side"] || side);
  useImperativeHandle(forwarded, () => root.current!, []);
  return <div {...props} ref={root} role={role} data-interaction-menu="" data-interaction-state={present ? "open" : "closed"} data-interaction-side={side}
    aria-hidden={!present || props["aria-hidden"] || undefined} inert={!present || props.inert || undefined}>
    <span data-interaction-highlight aria-hidden="true" />{children}
  </div>;
});

export const MenuListSurface = forwardRef<HTMLUListElement, HTMLAttributes<HTMLUListElement>>(function MenuListSurface({ children, ...props }, forwarded) {
  const root = useRef<HTMLUListElement>(null);
  const present = useSurface(root, "bottom");
  useImperativeHandle(forwarded, () => root.current!, []);
  return <ul {...props} ref={root} data-interaction-menu="" data-interaction-state={present ? "open" : "closed"} aria-hidden={!present || undefined} inert={!present || undefined}>
    <li data-interaction-highlight aria-hidden="true" role="presentation" />{children}
  </ul>;
});
