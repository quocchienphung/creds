"use client";

import { useEffect } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";

export function AnimatedNumber({ value, format }: { value: number; format: (value: number) => string }) {
  const number = useMotionValue(value);
  const reduce = useReducedMotion();
  const display = useTransform(number, format);
  useEffect(() => {
    const animation = animate(number, value, { duration: reduce ? 0 : 0.7, ease: [0.22, 1, 0.36, 1] });
    return () => animation.stop();
  }, [number, reduce, value]);
  return <motion.span>{display}</motion.span>;
}
