"use client";

import { useMemo } from "react";
import { specimenSegments } from "./gallery-model";

/**
 * The "photo" of the gallery: the text of one cell, drawn so every character can be inspected. Marked characters are highlighted, characters that
 * cannot be seen (zero-width, control, odd spaces) become small labelled glyphs. In the magnifier (`lens`) each of them also shows its code point.
 * Text is always rendered as text, never as HTML.
 */
export function Specimen({ value, marks, lens = false, empty }: { value: string; marks?: { start: number; end: number; label?: string }[]; lens?: boolean; empty: string }) {
  const runs = useMemo(() => specimenSegments(value, marks), [value, marks]);
  return <span className="cg-specimen" data-lens={lens || undefined}>
    {value === "" ? <span className="cg-specimen__empty">{empty}</span> : runs.map(run => run.kind === "plain"
      ? <span key={run.start}>{run.text}</span>
      : <span key={run.start} className={run.kind === "glyph" ? "cg-glyph" : "cg-mark"} data-code={lens ? (run.kind === "glyph" ? run.label : codeOf(run.text)) : undefined} title={run.label}>{run.text}</span>)}
  </span>;
}
const codeOf = (text: string) => "U+" + (text.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0");
