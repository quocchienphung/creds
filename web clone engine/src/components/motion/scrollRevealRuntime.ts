/**
 * Scroll reveal, after aithor.framer.website (measured 2026-10-19): section heads and their main blocks
 * rise 40px and fade in once they enter the viewport — a ≈200 ms trigger delay, then 700 ms of
 * ease-out-quart (cubic-bezier(0.25, 1, 0.5, 1)); blocks that share a parent follow 80 ms apart.
 *
 * Only elements below the first viewport at load are touched, and only with `opacity` and the
 * independent `translate` property, so layout, grids, existing transforms and the first paint are
 * unchanged; each animation is cancelled once it has played.
 *
 * Serialised with `toString()` and inlined, so it must stay self-contained.
 */
export function scrollRevealRuntime(): void {
  const TARGETS = [
    "main .section-title",
    "main .stats-section__title",
    "main .footer-cta-section__content-text",
    "main .footer-cta-section__feature-card",
    "main .homepage-query-box",
    "main .modular-solutions-bento-card",
  ].join(", ");
  const STAGGER = 80;

  const start = () => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
    const fold = window.innerHeight;
    const els = Array.from(document.querySelectorAll<HTMLElement>(TARGETS)).filter(
      (el) => el.getBoundingClientRect().top > fold,
    );
    // Web Animations hold each block in its start state (paused in the delay phase) and play it on
    // entry; nothing is written to the DOM, so React hydration sees the markup it rendered.
    const siblings = new Map<Element | null, number>();
    const pending = new Map<Element, Animation>();
    for (const el of els) {
      const n = siblings.get(el.parentElement) ?? 0;
      siblings.set(el.parentElement, n + 1);
      const anim = el.animate(
        [
          { opacity: 0, translate: "0 40px" },
          { opacity: 1, translate: "0 0" },
        ],
        { duration: 700, delay: 200 + n * STAGGER, easing: "cubic-bezier(0.25, 1, 0.5, 1)", fill: "both" },
      );
      anim.pause();
      anim.currentTime = 0;
      pending.set(el, anim);
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const anim = pending.get(entry.target);
          io.unobserve(entry.target);
          if (!anim) continue;
          pending.delete(entry.target);
          anim.play();
          anim.finished.then(() => anim.cancel()).catch(() => {});
        }
      },
      { rootMargin: "0px 0px -6% 0px" },
    );
    els.forEach((el) => io.observe(el));
  };

  // Held until the page transition that revealed this document is over (`__ptSettled`, set by the
  // transition script that runs before this one) and the page is idle: only blocks below the fold are
  // touched, so nothing shows the wait, and the transition's frames do not pay for the layout and the
  // animations.
  const settled = (window as Window & { __ptSettled?: Promise<void> }).__ptSettled;
  const later = () => ("requestIdleCallback" in window ? requestIdleCallback(start, { timeout: 1000 }) : setTimeout(start, 50));
  const go = () => (settled ? settled.then(later) : start());
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go, { once: true });
  else go();
}
