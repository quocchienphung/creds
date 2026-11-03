"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";
import expansion from "./observed-expansion.json";
import { interactionMotion } from "./motion-tokens";

/** A local size morph: text keeps its final metrics while the real surface grows around it. */
export function useMorphingPanel(ref: RefObject<HTMLElement | null>, state: string, visible = true) {
  const previous = useRef<{ width: number; height: number } | null>(null);
  const active = useRef<Animation | null>(null);

  useLayoutEffect(() => {
    const panel = ref.current;
    if (!panel || !visible) { previous.current = null; return; }
    const content = panel.querySelector<HTMLElement>("[data-morph-content]");
    if (!content) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const restore = () => { content.style.removeProperty("width"); content.style.removeProperty("height"); };
    const morph = () => {
      const current = panel.getBoundingClientRect();
      const from = active.current ? current : previous.current;
      active.current?.cancel(); active.current = null; restore();
      const target = panel.getBoundingClientRect();
      previous.current = { width: target.width, height: target.height };
      if (motion.matches) { panel.removeAttribute("data-morphing"); return; }
      const start = from ?? { width: Math.min(target.width, 260), height: Math.min(target.height, 42) };
      if (Math.abs(start.width - target.width) < .5 && Math.abs(start.height - target.height) < .5) return;
      const style = getComputedStyle(panel);
      content.style.width = `${target.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth)}px`;
      content.style.height = `${target.height - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom) - parseFloat(style.borderTopWidth) - parseFloat(style.borderBottomWidth)}px`;
      panel.setAttribute("data-morphing", "");
      const frames = expansion.samples.map((p, i) => ({
        offset: i / (expansion.samples.length - 1),
        width: `${start.width + (target.width - start.width) * p}px`,
        height: `${start.height + (target.height - start.height) * p}px`,
      }));
      const animation = panel.animate(frames, { duration: expansion.duration, easing: "linear", fill: "both" });
      active.current = animation;
      void animation.finished.then(() => {
        if (active.current !== animation) return;
        active.current = null; animation.cancel(); restore(); panel.removeAttribute("data-morphing");
      }, () => {});
    };
    morph();
    // Content changes (queue/receipt/error) retarget through the state key. A viewport
    // resize is the only other measurement source; there is no per-frame geometry loop.
    let resizeFrame = 0;
    const resize = () => { cancelAnimationFrame(resizeFrame); resizeFrame = requestAnimationFrame(morph); };
    const preference = () => { active.current?.cancel(); active.current = null; restore(); panel.removeAttribute("data-morphing"); };
    window.addEventListener("resize", resize); motion.addEventListener("change", preference);
    return () => {
      cancelAnimationFrame(resizeFrame); window.removeEventListener("resize", resize); motion.removeEventListener("change", preference);
      // Keep a visual snapshot before the next layout effect retargets the surface.
      if (active.current) {
        const box = panel.getBoundingClientRect(); previous.current = { width: box.width, height: box.height };
      }
      active.current?.cancel(); active.current = null; restore(); panel.removeAttribute("data-morphing");
    };
  }, [ref, state, visible]);
}

export function revealPanelContent(element: HTMLElement) {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const nodes = element.querySelectorAll<HTMLElement>("[data-panel-reveal]");
  const animations = [...nodes].map((node, index) => node.animate(
    reduced ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: "translateY(4px)" }, { opacity: 1, transform: "none" }],
    { duration: reduced ? interactionMotion.instant : interactionMotion.standard, delay: reduced ? 0 : Math.min(index, 4) * interactionMotion.stagger, easing: interactionMotion.enter },
  ));
  return () => animations.forEach(animation => animation.cancel());
}
