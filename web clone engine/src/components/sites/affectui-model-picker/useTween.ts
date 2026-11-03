"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { easeOutQuad, TWEEN_MS } from "./model-picker-logic";

/** A number that rolls to its new value (ease-out, ~380 ms) instead of jumping. Shows the target at once with reduced motion. */
export function useTween(target: number, duration = TWEEN_MS) {
  const reduce = useReducedMotion();
  const [value, setValue] = useState(target);
  const current = useRef(target);
  useEffect(() => {
    if (reduce || current.current === target) { current.current = target; return; }
    const from = current.current, start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = (now - start) / duration;
      current.current = progress >= 1 ? target : from + (target - from) * easeOutQuad(progress);
      setValue(current.current);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration, reduce]);
  return reduce ? target : value;
}
