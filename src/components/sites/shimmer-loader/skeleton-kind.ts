/**
 * Which skeleton a page gets while it loads: the one shaped like the page that will arrive. Pure, so the choice can be tested and the
 * server (which knows the section from the URL) draws the same skeleton as the browser.
 */
export type SkeletonKind = "home" | "table" | "reports" | "chat" | "files" | "run" | "canvas" | "trace" | "invoice" | "settings" | "preferences";

const kinds: Record<string, SkeletonKind> = {
  Queue: "files", "Excel formation": "files", "JSON formation": "settings", Converter: "files", Settings: "preferences",
};
export const skeletonKindOf = (section: string): SkeletonKind => kinds[section] ?? "table";

/** What a screen reader hears while the page loads. */
export const loadingLabel = (section: string) => `Loading ${section.toLowerCase()}…`;
