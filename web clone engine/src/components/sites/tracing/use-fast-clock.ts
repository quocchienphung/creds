"use client";

import { useSyncExternalStore } from "react";

/* One shared clock for the Tracing page: 10 ticks a second while a run is active, so bars grow smoothly. */
let value = 0;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(listener: () => void) {
  value = Date.now();
  listeners.add(listener);
  timer ??= setInterval(() => { value = Date.now(); listeners.forEach(notify => notify()); }, 100);
  return () => { listeners.delete(listener); if (!listeners.size) { clearInterval(timer); timer = undefined; } };
}
const idle = () => () => {};
const read = () => { if (!value) value = Date.now(); return value; };
/** The last tick, without subscribing. */
export const peekClock = read;

/** The current time in ms, refreshed ten times a second while `enabled`; otherwise the time of the last tick. */
export function useFastClock(enabled: boolean) {
  return useSyncExternalStore(enabled ? subscribe : idle, read, read);
}
