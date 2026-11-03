import type { WorkspaceSection } from "../affectui-crm/workspace-state";

/**
 * The groups of the selector, in on-screen order, and the workspace pages each one owns. `href` is the page
 * a group opens on; its `sections` are the only pages its sidebar lists, `pipelines` a second titled list.
 * `image` is the frame shown in the selector; null draws a neutral frame until a picture is supplied. `live` swaps the
 * picture for a working component that stays interactive in the frame (the frame is then not a link; the row opens the page).
 */
export type LiveFrame = "writing-assistant" | "agent-plan" | "delegate-board" | "agent-lanes" | "context-window";

export const guideGroups = [
  { id: "sales", name: "Sales", number: "01", href: "/personalize?section=invoice", image: null, live: "agent-plan", sections: ["Invoice"], pipelines: [] },
  { id: "agent-chat", name: "Agent Chat", number: "02", href: "/personalize?section=new-chat", image: null, live: "writing-assistant", sections: ["New chat", "Files", "Run", "Usage"], pipelines: [] },
  { id: "crm", name: "CRM", number: "03", href: "/personalize?section=home", image: null, live: "agent-lanes", sections: ["Home", "Companies", "Contacts", "Deals", "Reports"], pipelines: ["New business", "Renewals", "Partnerships"] },
  { id: "project-management", name: "Project Management", number: "04", href: "/personalize?section=mapping", image: null, live: "delegate-board", sections: ["Mapping", "Process", "Tracing", "Orchestrator"], pipelines: [] },
  { id: "skilled", name: "Skilled", number: "05", href: "/skilled", image: null, live: "context-window", sections: ["Skilled", "Repo", "Storage"], pipelines: [] },
  // No picture and no live frame yet: the selector draws its neutral frame.
  { id: "rules", name: "Rules", number: "06", href: "/personalize?section=excel-formation", image: null, sections: ["Excel formation", "JSON formation", "Queue"], pipelines: [] },
] as const satisfies readonly { id: string; name: string; number: string; href: string; image: string | null; live?: LiveFrame; sections: readonly WorkspaceSection[]; pipelines: readonly WorkspaceSection[] }[];

export type GuideGroup = (typeof guideGroups)[number];
export type GuideGroupId = GuideGroup["id"];

/** The working component a group shows in its frame instead of a picture, if any. */
export function liveFrameOf(group: GuideGroup): LiveFrame | undefined {
  return "live" in group ? group.live : undefined;
}

/** The reference clip starts with its second item selected. */
export const defaultGuideIndex = 1;

/** Which group owns a workspace page. Every page belongs to exactly one group. */
export function groupOfSection(section: WorkspaceSection): GuideGroup {
  return guideGroups.find(group => (group.sections as readonly string[]).includes(section) || (group.pipelines as readonly string[]).includes(section)) ?? guideGroups[2];
}

export function subscribeLocation(listener: () => void) {
  window.addEventListener("popstate", listener);
  return () => window.removeEventListener("popstate", listener);
}

/** Keep native link behaviors (new tab, copy link) while navigating the workspace locally. */
export function navigateWorkspaceHref(href: string) {
  // A separate page must go through a document navigation; pushState only updates this workspace's state.
  if (new URL(href, window.location.href).pathname !== window.location.pathname) {
    window.location.assign(href);
    return;
  }
  window.history.pushState({}, "", href);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
