"use client";

import { useSyncExternalStore } from "react";

/* One shared clock for the page: it ticks only while something subscribed to it needs the time to move. */
let value = 0;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;
const TICK_MS = 500;

function subscribe(listener: () => void) {
  value = Date.now();
  listeners.add(listener);
  timer ??= setInterval(() => { value = Date.now(); listeners.forEach(notify => notify()); }, TICK_MS);
  return () => { listeners.delete(listener); if (!listeners.size) { clearInterval(timer); timer = undefined; } };
}
const idle = () => () => {};
const read = () => { if (!value) value = Date.now(); return value; };
/** The last tick, without subscribing (to decide whether the clock needs to run at all). */
export const peekTick = read;

/** The current time in ms, refreshed twice a second while `enabled` (a run is active); otherwise the time of the last tick. */
export function useTicker(enabled: boolean) {
  return useSyncExternalStore(enabled ? subscribe : idle, read, read);
}
