"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

/**
 * Crossfades when `id` changes: the new content fades in (with a touch of blur) while the old content, kept
 * exactly as it last looked, fades out on top of it. Content that changes under the same id (a rolling figure)
 * updates in place.
 */
export function Swap({ id, children }: { id: string; children: ReactNode }) {
  const latest = useRef<{ id: string; node: ReactNode }>({ id, node: children });
  const [leaving, setLeaving] = useState<{ key: number; node: ReactNode }[]>([]);
  const count = useRef(0);
  useEffect(() => {
    const before = latest.current;
    latest.current = { id, node: children };
    if (before.id === id) return;
    const key = ++count.current;
    // The old copy is dropped when its fade-out is over. The timer is not cancelled by later renders (a rolling
    // figure re-renders every frame); a timer that fires after unmount does nothing.
    window.setTimeout(() => setLeaving(list => list.filter(item => item.key !== key)), 240);
    setLeaving(list => [...list, { key, node: before.node }]);
  }, [id, children]);
  return <span className="mp__swap">
    <span className="mp__swap-item" key={id}>{children}</span>
    {leaving.map(item => <span className="mp__swap-item" data-out="" aria-hidden="true" key={`out-${item.key}`}>{item.node}</span>)}
  </span>;
}
