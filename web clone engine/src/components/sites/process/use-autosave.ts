"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BackendError } from "@/lib/workspace-backend";

export interface Autosave {
  /** There is a change that is not stored yet. */
  dirty: boolean;
  saving: boolean;
  error: { message: string; code?: string } | null;
  /** Save again now (after a failure). */
  retry: () => void;
}

const BACKOFF_MS = [1000, 2000, 4000];

/**
 * Saves `value` a moment after it stops changing: one save at a time, always the newest value, edits never wait for it.
 * A failure that is worth repeating (network, server, rate limit) is retried automatically three times (1 s, 2 s, 4 s) like
 * the shared workspace backend does; anything else waits for the person ("Retry"). Leaving the page with unsaved changes asks first.
 * `baseline` is the value that is already stored, so nothing is saved until something differs from it.
 */
export function useAutosave<T>(value: T, baseline: T, save: (value: T) => Promise<void>, delayMs = 600): Autosave {
  const json = JSON.stringify(value);
  const [saved, setSaved] = useState(() => JSON.stringify(baseline));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<Autosave["error"]>(null);
  const [attempt, setAttempt] = useState(0);
  const latest = useRef({ value, json, save });
  const busy = useRef(false);
  const alive = useRef(true);
  const latestSaved = useRef(saved);
  useEffect(() => { latest.current = { value, json, save }; });
  useEffect(() => { latestSaved.current = saved; }, [saved]);

  const flush = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    let tries = 0;
    try {
      // Keep going while the newest value differs from what was just stored.
      for (;;) {
        const { value: next, json: nextJson, save: write } = latest.current;
        if (nextJson === latestSaved.current) break;
        if (alive.current) setSaving(true);
        try {
          await write(next);
          latestSaved.current = nextJson;
          tries = 0;
          if (alive.current) { setSaved(nextJson); setError(null); }
        } catch (failure) {
          const retryable = failure instanceof BackendError && failure.retryable;
          if (retryable && tries < BACKOFF_MS.length) { await new Promise(resolve => setTimeout(resolve, BACKOFF_MS[tries])); tries += 1; continue; }
          if (alive.current) setError({ message: failure instanceof Error ? failure.message : "Could not save.", code: failure instanceof BackendError ? failure.code : undefined });
          break;
        }
      }
    } finally {
      busy.current = false;
      if (alive.current) setSaving(false);
    }
  }, []);

  // Leaving the page (another section opens) writes what is still waiting, so the next page sees it: a run started a moment ago
  // has to be there when the Tracing page loads.
  useEffect(() => { alive.current = true; return () => { alive.current = false; void flush(); }; }, [flush]);

  const dirty = json !== saved;
  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => void flush(), delayMs);
    return () => clearTimeout(timer);
  }, [json, dirty, delayMs, flush, attempt]);

  useEffect(() => {
    if (!dirty && !saving) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty, saving]);

  const retry = useCallback(() => { setError(null); setAttempt(count => count + 1); }, []);
  return { dirty, saving, error, retry };
}
