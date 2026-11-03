"use client";

import { useId } from "react";
import type { CSSProperties } from "react";
import { impressionSeed, impressionTilt, inkColor, kindInfo, stampDateText } from "./invoice-stamp-model";
import type { InvoiceStamp } from "./invoice-stamp-model";
import "./invoice-stamp.css";

/** The size of one impression, in its own units. The same numbers place it on the paper in the scene (`MARK` in stamp-timeline.ts). */
export const MARK_SIZE = { w: 215, h: 76 } as const;

/**
 * What a rubber stamp leaves on paper: a double rounded frame, the word, and the date in heavy condensed capitals, in one ink. It is drawn
 * rather than pictured. Real ink is never even, so the SVG filter roughens the edges, thins the ink in blotches and leaves tiny gaps where the
 * rubber did not take it; the pattern comes from the stamp itself, so the same stamp always prints the same way.
 */
export function StampMark({ stamp, className, style }: { stamp: InvoiceStamp; className?: string; style?: CSSProperties }) {
  const id = useId().replace(/[^\w-]/g, ""), seed = impressionSeed(stamp), kind = kindInfo(stamp.kind), date = stampDateText(stamp.date);
  const wide = date.length > 10 || kind.word.length > 6;
  return <svg className={`inv-mark${className ? ` ${className}` : ""}`} style={{ color: inkColor(stamp.ink), ...style }} viewBox={`0 0 ${MARK_SIZE.w} ${MARK_SIZE.h}`} role="img" aria-label={`${kind.word} ${date}`} data-ink={stamp.ink} data-tilt={impressionTilt(stamp)}>
    <defs>
      <filter id={`${id}-ink`} x="-4%" y="-8%" width="108%" height="116%" colorInterpolationFilters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed={seed} result="grain" />
        <feDisplacementMap in="SourceGraphic" in2="grain" scale="1.7" xChannelSelector="R" yChannelSelector="G" result="rough" />
        <feTurbulence type="fractalNoise" baseFrequency=".032 .055" numOctaves="3" seed={seed + 11} result="blotch" />
        <feColorMatrix in="blotch" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1.8 0 0 0 .12" result="pressure" />
        <feTurbulence type="fractalNoise" baseFrequency="1.35" numOctaves="1" seed={seed + 29} result="specks" />
        <feColorMatrix in="specks" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  18 0 0 0 -5.1" result="taken" />
        <feComposite in="rough" in2="pressure" operator="in" result="uneven" />
        <feComposite in="uneven" in2="taken" operator="in" />
      </filter>
    </defs>
    <g filter={`url(#${id}-ink)`} fill="none" stroke="currentColor">
      <rect x="2.5" y="2.5" width={MARK_SIZE.w - 5} height={MARK_SIZE.h - 5} rx="9" strokeWidth="3.2" />
      <rect x="8.5" y="8.5" width={MARK_SIZE.w - 17} height={MARK_SIZE.h - 17} rx="5" strokeWidth="1.1" />
      <g fill="currentColor" stroke="none" fontFamily='"Stamp Barlow", "Barlow Condensed", "Arial Narrow", Impact, sans-serif' fontWeight="700" textAnchor="middle">
        <text x={MARK_SIZE.w / 2} y="24" fontSize="12.5" letterSpacing={wide ? "3.4" : "5.5"}>{kind.word}</text>
        <text x={MARK_SIZE.w / 2} y="58" fontSize={date.length > 10 ? "35" : "38"} letterSpacing="1.2">{date}</text>
      </g>
    </g>
  </svg>;
}
