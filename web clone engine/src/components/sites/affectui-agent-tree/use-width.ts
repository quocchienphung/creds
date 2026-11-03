"use client";

import { useCallback, useState, useSyncExternalStore } from "react";

/**
 * The width of an element as an external store, so a layout choice never needs state set from an effect.
 * Returns a callback ref to put on the element and its current width (0 until it is measured, and on the server).
 */
export function useWidth() {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const subscribe = useCallback((notify: () => void) => {
    if (!element) return () => {};
    const observer = new ResizeObserver(notify);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  const width = useSyncExternalStore(subscribe, () => element?.clientWidth ?? 0, () => 0);
  return [setElement, width] as const;
}
