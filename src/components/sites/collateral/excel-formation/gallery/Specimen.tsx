"use client";

import { useMemo } from "react";
import { specimenSegments } from "./gallery-model";

/**
 * The "photo" of the gallery: the text of one cell, drawn so every character can be inspected. Marked characters are highlighted, characters that
 * cannot be seen (zero-width, control, odd spaces) become small labelled glyphs.
 * Text is always rendered as text, never as HTML.
 */
export function Specimen({ value, marks, empty }: { value: string; marks?: { start: number; end: number; label?: string }[]; empty: string }) {
  const runs = useMemo(() => specimenSegments(value, marks), [value, marks]);
  return <span className="cg-specimen">
    {value === "" ? <span className="cg-specimen__empty">{empty}</span> : runs.map(run => run.kind === "plain"
      ? <span key={run.start}>{run.text}</span>
      : <span key={run.start} className={run.kind === "glyph" ? "cg-glyph" : "cg-mark"} title={run.label}>{run.text}</span>)}
  </span>;
}
