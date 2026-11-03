"use client";

import { AnimatePresence, motion } from "motion/react";

const SPRING = { type: "spring", stiffness: 190, damping: 24 } as const;
const WIDTH = { type: "spring", stiffness: 114.5, damping: 21.4 } as const;

/** One digit: the ten digits stand in a column, the chosen one in view; changing the value slides the column, the others fade and blur. */
function Digit({ digit }: { digit: number }) {
  return <span className="at-number__column" data-digit="">
    <span className="at-number__sizer" aria-hidden="true">0</span>
    {Array.from({ length: 10 }, (_, glyph) => {
      const offset = ((glyph - digit + 15) % 10) - 5, current = glyph === digit;
      return <motion.span key={glyph} className="at-number__glyph" initial={false} animate={{ y: `${offset}em`, opacity: current ? 1 : 0, filter: current ? "blur(0em)" : "blur(0.08em)" }} transition={SPRING} style={{ visibility: current ? "visible" : undefined }}>{glyph}</motion.span>;
    })}
  </span>;
}

/**
 * A number whose digits roll to their new value. The text is also given once, plainly, for assistive technology; columns for digits that appear or
 * disappear grow from, and shrink to, zero width.
 */
export function AnimatedNumber({ text }: { text: string }) {
  // columns are keyed from the right so a digit keeps its place when the number grows or shrinks on the left
  const chars = [...text], keyed = chars.map((char, index) => ({ char, key: chars.length - index }));
  return <span className="at-number">
    <span className="at-number__sr">{text}</span>
    <span className="at-number__value" aria-hidden="true">
      <AnimatePresence initial={false}>
        {keyed.map(({ char, key }) => /\d/.test(char)
          ? <motion.span key={`d${key}`} className="at-number__slot" initial={{ width: 0, opacity: 0 }} animate={{ width: "auto", opacity: 1 }} exit={{ width: 0, opacity: 0 }} transition={WIDTH}><Digit digit={Number(char)} /></motion.span>
          : <motion.span key={`s${key}`} className="at-number__symbol" initial={{ width: 0, opacity: 0 }} animate={{ width: "auto", opacity: 1 }} exit={{ width: 0, opacity: 0 }} transition={WIDTH}>{char === " " ? " " : char}</motion.span>)}
      </AnimatePresence>
    </span>
  </span>;
}
