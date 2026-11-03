import { interactionMotion, springEasing } from "./motion-tokens";

const rows = '[role="menuitem"],[role="menuitemradio"],[role="menuitemcheckbox"],[role="option"],[data-menu-item],.ui-as-menu__item';
export function animateMenu(element: HTMLElement, open: boolean, side = "bottom", from?: { opacity: string; transform: string }) {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const direction = side === "top" || side === "above" ? 1 : -1;
  const styles = getComputedStyle(element);
  const opacity = from?.opacity ?? (open ? "0" : styles.opacity);
  const start = from?.transform ?? (open ? `translateY(${direction * 5}px) scale(.97)` : styles.transform);
  const end = open ? "none" : `translateY(${direction * 2.5}px) scale(.985)`;
  const animations = [element.animate([{ opacity }, { opacity: open ? 1 : 0 }], {
    duration: reduced ? interactionMotion.instant : open ? interactionMotion.fast : interactionMotion.exit,
    easing: open ? interactionMotion.enter : interactionMotion.ease, fill: "both",
  })];
  if (!reduced) animations.push(element.animate([{ transform: start }, { transform: end }], {
    duration: open ? interactionMotion.spring : interactionMotion.exit, easing: open ? springEasing() : interactionMotion.ease, fill: "both",
  }));
  if (open && !reduced) [...element.querySelectorAll<HTMLElement>(rows)].slice(0, 12).forEach((row, index) => {
    animations.push(row.animate([{ opacity: 0, transform: `translateY(${direction * 2}px)` }, { opacity: getComputedStyle(row).opacity, transform: "none" }], {
      duration: interactionMotion.standard, delay: Math.min(index, 4) * interactionMotion.stagger, easing: interactionMotion.enter, fill: "backwards",
    }));
  });
  const finished = Promise.all(animations.map(animation => animation.finished));
  // An interrupted entrance is normal when a menu closes quickly. Callers only
  // await exits, so mark cancellation handled even when an entrance is ignored.
  void finished.catch(() => {});
  return { finished, cancel: () => animations.forEach(animation => animation.cancel()) };
}

/** One moving highlight. Pointer motion glides; keyboard selection never waits. */
export function wireMenuHighlight(element: HTMLElement) {
  let highlight = element.querySelector<HTMLElement>(":scope > [data-interaction-highlight]");
  const owned = !highlight;
  if (!highlight) { highlight = document.createElement("span"); highlight.dataset.interactionHighlight = ""; highlight.ariaHidden = "true"; element.prepend(highlight); }
  const layer = highlight;
  let active: HTMLElement | null = null, keyboard = true, animation: Animation | undefined;
  const fine = matchMedia("(hover: hover) and (pointer: fine)");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const targetOf = (target: EventTarget | null) => target instanceof Element ? target.closest<HTMLElement>(rows) : null;
  const place = (row: HTMLElement | null, glide: boolean) => {
    if (!row || !element.contains(row) || row.matches(':disabled,[aria-disabled="true"],[data-disabled]')) return;
    if (active === row && glide) return;
    const before = getComputedStyle(layer).transform;
    animation?.cancel();
    const parent = element.getBoundingClientRect(), box = row.getBoundingClientRect();
    const sx = parent.width / element.offsetWidth || 1, sy = parent.height / element.offsetHeight || 1;
    const x = (box.left - parent.left) / sx - element.clientLeft + element.scrollLeft;
    const y = (box.top - parent.top) / sy - element.clientTop + element.scrollTop;
    const transform = `translate(${x}px,${y}px)`;
    row.dataset.interactionRow = "";
    layer.style.width = `${box.width / sx}px`; layer.style.height = `${box.height / sy}px`;
    layer.style.transform = transform; layer.style.opacity = "1";
    layer.toggleAttribute("data-danger", row.matches('[data-danger="true"],[data-destructive],.ui-as-menu__item--danger'));
    if (active && glide && !reduced.matches) animation = layer.animate([{ transform: before }, { transform }], { duration: interactionMotion.spring, easing: springEasing() });
    active = row;
  };
  const pointer = (event: PointerEvent) => { if (event.pointerType !== "mouse" || !fine.matches) return; keyboard = false; place(targetOf(event.target), true); };
  const focus = (event: FocusEvent) => { if (keyboard) place(targetOf(event.target), false); };
  const key = () => { keyboard = true; };
  const leave = () => { if (!keyboard) { layer.style.opacity = "0"; active = null; } };
  element.addEventListener("pointerover", pointer); element.addEventListener("focusin", focus);
  element.addEventListener("keydown", key, true); element.addEventListener("pointerleave", leave);
  return () => {
    animation?.cancel(); element.removeEventListener("pointerover", pointer); element.removeEventListener("focusin", focus);
    element.removeEventListener("keydown", key, true); element.removeEventListener("pointerleave", leave);
    element.querySelectorAll<HTMLElement>("[data-interaction-row]").forEach(row => row.removeAttribute("data-interaction-row"));
    if (owned) layer.remove();
  };
}
