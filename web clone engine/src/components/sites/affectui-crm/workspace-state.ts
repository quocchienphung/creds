"use client";

import { createContext, useContext, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation.js";

export const workspaceSections = ["Home", "Companies", "Contacts", "Deals", "Reports", "New chat", "Files", "Run", "Mapping", "Process", "Tracing", "Orchestrator", "Invoice", "Usage", "Excel formation", "JSON formation", "Queue", "Skilled", "Repo", "Storage", "New business", "Renewals", "Partnerships"] as const;
export type WorkspaceSection = (typeof workspaceSections)[number];

function subscribeRoute(listener: () => void) {
  window.addEventListener("popstate", listener);
  return () => window.removeEventListener("popstate", listener);
}
/** The section a `?section=` value names; Companies when it names none. */
export function sectionFromParam(section: string | null | undefined): WorkspaceSection {
  return workspaceSections.find(value => value.toLowerCase().replaceAll(" ", "-") === section) || "Companies";
}
function routeSnapshot(): WorkspaceSection {
  if (window.location.pathname === "/skilled" && !new URLSearchParams(window.location.search).has("section")) return "Skilled";
  return sectionFromParam(new URLSearchParams(window.location.search).get("section"));
}
/**
 * The route the server read from the URL. Without it the server (and the first client render, which must match it) could only guess
 * "Companies", so every reload flashed the Companies page before the real one arrived.
 */
const InitialRoute = createContext<{ section: WorkspaceSection; view: string | null } | null>(null);
export const InitialRouteProvider = InitialRoute.Provider;
/** The section the server read from the address, if this part of the tree is inside the provider. */
export const useInitialSection = (): WorkspaceSection | null => useContext(InitialRoute)?.section ?? null;
function viewSnapshot() { return new URLSearchParams(window.location.search).get("crm-view"); }
/**
 * The user's Settings are not a page of the workspace: they open over the current page (from the account menu) and the address says
 * so with `?settings=<section id>` (`1` for the first section). A person who arrives at the older `?section=settings` link gets the same.
 */
function settingsSnapshot() {
  const params = new URLSearchParams(window.location.search);
  return params.get("settings") ?? (params.get("section") === "settings" ? params.get("settings-tab") || "1" : null);
}
export function useWorkspaceRoute() {
  const router = useRouter();
  const initial = useContext(InitialRoute);
  const section = useSyncExternalStore(subscribeRoute, routeSnapshot, () => initial?.section ?? "Companies");
  const crmView = useSyncExternalStore(subscribeRoute, viewSnapshot, () => initial?.view ?? null);
  const settings = useSyncExternalStore(subscribeRoute, settingsSnapshot, () => null);
  function navigate(next: WorkspaceSection, view?: string) {
    if (next === "Skilled" && window.location.pathname !== "/skilled") { router.push("/skilled"); return; }
    if (next !== "Skilled" && window.location.pathname === "/skilled") { router.push(`/personalize?section=${next.toLowerCase().replaceAll(" ", "-")}`); return; }
    const url = new URL(window.location.href);
    url.searchParams.delete("panel");
    url.searchParams.delete("settings-tab");
    url.searchParams.delete("folder");
    url.searchParams.delete("settings");
    if (view) url.searchParams.set("crm-view", view);
    else url.searchParams.delete("crm-view");
    if (next === "Companies" || next === "Skilled") url.searchParams.delete("section");
    else url.searchParams.set("section", next.toLowerCase().replaceAll(" ", "-"));
    if (url.href !== window.location.href) {
      window.history.pushState({}, "", url);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
  }
  /** Open the Settings over the current page (`id` is a section of the Settings, such as "members"), or close them. */
  function openSettings(id = "1") {
    const url = new URL(window.location.href);
    if (url.searchParams.get("section") === "settings") url.searchParams.delete("section");
    url.searchParams.delete("settings-tab");
    url.searchParams.set("settings", id);
    window.history.pushState({}, "", url);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }
  function closeSettings() {
    const url = new URL(window.location.href);
    url.searchParams.delete("settings");
    url.searchParams.delete("settings-tab");
    if (url.searchParams.get("section") === "settings") url.searchParams.delete("section");
    window.history.replaceState({}, "", url);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }
  return { section, crmView, settings, openSettings, closeSettings, navigate };
}

export function downloadFile(name: string, content: string, mime = "text/plain;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function toCsv(rows: (string | number)[][]) {
  return rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\r\n");
}
