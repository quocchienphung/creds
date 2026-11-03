"use client";

import { useCallback, useEffect, useRef } from "react";
import { useResource, useResourceStore, useWorkspaceBackend } from "@/lib/workspace-backend/react";
import { skillLibraryResource, skillEventsResource, type SkillEvent } from "./skill-model";

export function useSkills(workspaceId: string) {
  const [skills, setSkills, sync] = useResource(skillLibraryResource, workspaceId, []);
  const [events, setEvents, eventsSync] = useResource(skillEventsResource, workspaceId, []);
  const store = useResourceStore();
  const backend = useWorkspaceBackend();
  const entry = store.entry(skillLibraryResource, workspaceId, []);
  const record = useCallback((event: Omit<SkillEvent, "id" | "t">) => {
    setEvents(current => [...current, { ...event, id: crypto.randomUUID(), t: Date.now() }].slice(-200));
  }, [setEvents]);
  const started = useRef<number | null>(null);
  useEffect(() => entry.subscribe(() => {
    const view = entry.getSnapshot();
    if (view.save === "saving" && started.current === null) started.current = performance.now();
    if ((view.save === "idle" || view.save === "error") && started.current !== null) {
      const durationMs = performance.now() - started.current;
      started.current = null;
      record({ kind: "save", label: backend.remote ? "Database save" : "Browser save", durationMs, bytes: new TextEncoder().encode(JSON.stringify(view.value)).length, outcome: view.error ? "error" : "success", detail: view.error?.message });
    }
  }), [entry, record, backend.remote]);
  return { skills, setSkills, sync, events, eventsSync, record, backend, entry };
}
