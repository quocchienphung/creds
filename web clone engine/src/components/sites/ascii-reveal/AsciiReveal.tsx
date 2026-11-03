"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import { GlyphCover, mountCover } from "./GlyphCover";
import { noteWait, takeWait } from "./wait-note";

/**
 * Shown by a loading page (a `SectionSkeleton`): after the usual short delay the content panel is covered with the moving glyph field.
 * It is a hint that something is happening, not the loading state itself (the skeleton stays in the tree for screen readers), and it
 * gives up after 12 s so a page that never arrives is never hidden behind it.
 */
export function AsciiLoading({ delay = 200 }: { delay?: number }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (shown) { noteWait(); return () => noteWait(); }
    const timer = window.setTimeout(() => setShown(true), delay);
    return () => window.clearTimeout(timer);
  }, [delay, shown]);
  return shown ? <GlyphCover mode="loading" /> : null;
}

/** Mounted next to a page that has just arrived: if a loading field was on screen a moment ago, it dissolves from where the person pressed. */
export function AsciiReveal() {
  // Decided after the commit: by then the loading page has been taken out and has said that it was seen.
  // The decision is kept in a ref: React may run this effect twice (strict mode) and the wait can be taken only once.
  const play = useRef<boolean | null>(null);
  useEffect(() => {
    play.current ??= takeWait();
    return play.current ? mountCover({ mode: "reveal" }) ?? undefined : undefined;
  }, []);
  return null;
}

/** A page component that, once it appears after a visible wait, is revealed instead of just popping in. Layout is untouched (the cover is separate). */
export function revealed<P extends object>(Component: ComponentType<P>): ComponentType<P> {
  function Revealed(props: P) {
    return <><Component {...props} /><AsciiReveal /></>;
  }
  Revealed.displayName = `Revealed(${Component.displayName || Component.name || "Page"})`;
  return Revealed;
}
