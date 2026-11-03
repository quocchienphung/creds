"use client";

import { useEffect, useState } from "react";

/** The workspace's clock, as already shown in the Activity list. */
export const WORKSPACE_TIME_ZONE = "Asia/Ho_Chi_Minh";
const DAY = 86_400_000;

const dayKey = (t: number) => new Intl.DateTimeFormat("en-CA", { timeZone: WORKSPACE_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(t);
export const dayId = dayKey;

/** "Today", "Yesterday", otherwise "Friday, September 18". */
export function dayLabel(t: number, now: number): string {
  const key = dayKey(t);
  if (key === dayKey(now)) return "Today";
  if (key === dayKey(now - DAY)) return "Yesterday";
  return new Intl.DateTimeFormat("en-US", { timeZone: WORKSPACE_TIME_ZONE, weekday: "long", month: "long", day: "numeric" }).format(t);
}
export const clock = (t: number) => new Intl.DateTimeFormat("en-GB", { timeZone: WORKSPACE_TIME_ZONE, hour: "2-digit", minute: "2-digit" }).format(t);
export const fullDate = (t: number) => new Intl.DateTimeFormat("en-US", { timeZone: WORKSPACE_TIME_ZONE, dateStyle: "full", timeStyle: "short" }).format(t);

/** "now", "11m", "3h" within a day, otherwise the clock time. */
export function shortAge(t: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - t) / 1000));
  if (seconds < 45) return "now";
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h`;
  return clock(t);
}

/** A clock that ticks about once a minute so relative labels stay fresh without re-rendering every second. */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}
