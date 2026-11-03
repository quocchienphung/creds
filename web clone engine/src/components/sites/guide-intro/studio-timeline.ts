import type { CursorAgent } from "../affectui-agent-cursors/AgentCursor";

export const STUDIO_DURATION = 15000;
export const PAINT_END = 13000;
export const FRAME_START = 1200;
export const FRAME_END = 12800;
export const ENGRAVE_START = 9400;
export const ENGRAVE_END = 13700;
export const progressBetween = (time: number, start: number, end: number) => Math.max(0, Math.min(1, (time - start) / (end - start)));
export const WORKSPACE_HREF = "/personalize?browse=1";
export const ARTWORK_SRC = "/sites/guide-intro/starry-night.jpg";
export const studioSteps = [
  { id: "paper", at: 0 }, { id: "color", at: 350 }, { id: "final", at: PAINT_END },
] as const;
export const phaseAt = (time: number) => studioSteps.findLast(step => time >= step.at) ?? studioSteps[0];

export const artistAgents: readonly CursorAgent[] = [
  { id: "sky", name: "Sky painter", mark: "openai", color: "#4985d6", role: "Swirls & sky" },
  { id: "colorist", name: "Colorist", mark: "claudecode", color: "#9874ce", role: "Stars & moonlight" },
  { id: "landscape", name: "Landscape", mark: "gemini", color: "#5b9f88", role: "Hills & village" },
  { id: "detail", name: "Detail artist", mark: "kimi", color: "#cd789e", role: "The finishing touches" },
  { id: "writer", name: "Writer", mark: "anthropic", color: "#cf805f", role: "The painting’s story" },
  { id: "researcher", name: "Researcher", mark: "codex", color: "#9874ce", role: "Art & brushwork" },
  { id: "framer", name: "Frame maker", mark: "claudecode", color: "#b99551", role: "Gilded frame & finishing" },
  { id: "engraver", name: "Engraver", mark: "openai", color: "#df7149", role: "Laser engraving & signature" },
];
export function doingAt(id: string, phase: string) {
  if (id === "engraver") return phase === "final" ? "Signing the work" : "Laser engraving";
  if (id === "framer") return phase === "final" ? "Ready to hang" : "Crafting the frame";
  if (id === "writer") return phase === "color" ? "Refining the story" : "Writing";
  if (id === "researcher") return phase === "color" ? "Revising" : "Researching";
  if (phase === "paper") return "Preparing the canvas";
  if (phase === "final") return "";
  return id === "sky" ? "Painting the sky" : id === "colorist" ? "Adding moonlight" : "Painting";
}
