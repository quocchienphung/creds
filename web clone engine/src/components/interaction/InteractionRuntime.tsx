"use client";

import { useEffect } from "react";
import { interactionMotion, springEasing } from "./motion-tokens";

/** Delegated input feedback is shared by all routes, including lazy workspace pages. */
export function InteractionRuntime() {
  useEffect(() => {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const pressed = new Map<HTMLElement, Animation>();
    const sizes = new WeakMap<HTMLElement, { width: number; text: string; time: number }>();
    const labelAnimations = new Map<HTMLElement, Animation[]>();
    // a component that morphs its own buttons (label, width, press) marks itself data-interaction-own and is left alone here
    const buttonOf = (target: EventTarget | null) => {
      const button = target instanceof Element ? target.closest<HTMLElement>('button,a.Button,a[class*="CtaButton"],[data-slot="button"]') : null;
      return button && !button.closest("[data-interaction-own]") ? button : null;
    };
    const remember = (button: HTMLElement) => sizes.set(button, { width: button.offsetWidth, text: button.textContent ?? "", time: performance.now() });
    const eligible = (button: HTMLElement) => !button.matches(':disabled,[aria-disabled="true"],[aria-busy="true"],[aria-haspopup]:not([aria-haspopup="false"]),[aria-expanded],[role^="menuitem"],[role="option"],[role="combobox"]')
      && !button.closest('[data-interaction-press="off"],.guide-intro,.pmap__block,.agt__node,.twf__row')
      && (!button.style.transform || button.style.transform === "none");
    const release = () => {
      for (const [button, animation] of pressed) {
        const scale = getComputedStyle(button).scale;
        animation.cancel();
        const back = button.animate([{ scale: scale === "none" ? "1" : scale }, { scale: "1" }], { duration: reduced.matches ? 0 : interactionMotion.spring, easing: springEasing() });
        void back.finished.then(() => back.cancel(), () => {});
      }
      pressed.clear();
    };
    const press = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent && (!['Enter', ' '].includes(event.key) || event.repeat)) return;
      if (event instanceof PointerEvent && event.button !== 0) return;
      const summary = event.target instanceof Element ? event.target.closest("summary") : null;
      summary?.closest("details")?.setAttribute("data-interaction-accordion", "");
      const button = buttonOf(event.target); if (!button) return;
      remember(button);
      if (reduced.matches || !eligible(button)) return;
      pressed.get(button)?.cancel();
      const width = button.offsetWidth, scale = width > 220 ? .985 : width <= 48 ? .96 : .97;
      pressed.set(button, button.animate([{ scale: getComputedStyle(button).scale === "none" ? "1" : getComputedStyle(button).scale }, { scale }], { duration: interactionMotion.instant, easing: interactionMotion.ease, fill: "both" }));
    };
    const focus = (event: FocusEvent) => { const button = buttonOf(event.target); if (button) remember(button); };
    const keyup = (event: KeyboardEvent) => { if (['Enter', ' '].includes(event.key)) release(); };
    const observer = new MutationObserver(records => {
      const changed = new Set<HTMLElement>();
      for (const record of records) {
        const button = buttonOf(record.target instanceof Element ? record.target : record.target.parentElement);
        if (button) changed.add(button);
      }
      for (const button of changed) {
        const before = sizes.get(button), text = button.textContent ?? "";
        if (!before || before.text === text || performance.now() - before.time > 5000 || !button.isConnected) continue;
        const width = button.offsetWidth;
        labelAnimations.get(button)?.forEach(animation => animation.cancel());
        const animations: Animation[] = [];
        if (!reduced.matches && Math.abs(width - before.width) > 1) animations.push(button.animate([{ width: `${before.width}px` }, { width: `${width}px` }], { duration: interactionMotion.spring, easing: springEasing() }));
        const label = button.querySelector<HTMLElement>('[data-interaction-label],.Button-label,.ui-button__label');
        if (label) animations.push(label.animate(reduced.matches ? [{ opacity: .4 }, { opacity: 1 }] : [{ opacity: 0, transform: "translateY(4px)", filter: "blur(2px)" }, { opacity: 1, transform: "none", filter: "blur(0px)" }], { duration: interactionMotion.standard, easing: interactionMotion.enter }));
        labelAnimations.set(button, animations); sizes.set(button, { width, text, time: before.time });
        const done = () => { if (labelAnimations.get(button) === animations) labelAnimations.delete(button); };
        void Promise.all(animations.map(animation => animation.finished)).then(done, done);
      }
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });
    document.addEventListener("pointerdown", press, true); document.addEventListener("keydown", press, true);
    document.addEventListener("pointerup", release, true); document.addEventListener("pointercancel", release, true);
    document.addEventListener("keyup", keyup, true); document.addEventListener("focusin", focus, true);
    window.addEventListener("blur", release); reduced.addEventListener("change", release);
    return () => {
      observer.disconnect(); pressed.forEach(animation => animation.cancel()); labelAnimations.forEach(animations => animations.forEach(animation => animation.cancel()));
      document.removeEventListener("pointerdown", press, true); document.removeEventListener("keydown", press, true);
      document.removeEventListener("pointerup", release, true); document.removeEventListener("pointercancel", release, true);
      document.removeEventListener("keyup", keyup, true); document.removeEventListener("focusin", focus, true);
      window.removeEventListener("blur", release); reduced.removeEventListener("change", release);
    };
  }, []);
  return null;
}
