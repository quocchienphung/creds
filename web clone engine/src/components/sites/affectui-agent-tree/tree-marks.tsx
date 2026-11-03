"use client";

import { useId } from "react";
import { brandIcons } from "../affectui-delegate-board/brand-icons.generated";
import { aiMarks } from "./ai-marks.generated";
import type { AiMarkId } from "./ai-marks.generated";
import type { AgentStatus, AvatarMark, ToolMark } from "./tree-model";

/**
 * The logos the tree and the map draw. Anthropic, OpenAI, Gemini and the six tool marks are the artwork exported from the public
 * Delegate Board preview (affectui-delegate-board/brand-icons.generated.ts); the other AI engines come from the published
 * @lobehub/icons-static-svg package (ai-marks.generated.ts, regenerate with scripts/forensics/agent-tree-ai-marks.mjs).
 * Both files are generated static markup, never user input.
 */
export const markNames: Record<AvatarMark | ToolMark, string> = {
  ...(Object.fromEntries(Object.entries(aiMarks).map(([id, mark]) => [id, mark.title])) as Record<AiMarkId, string>),
  anthropic: "Anthropic", openai: "OpenAI", gemini: "Gemini", hermes: "Hermes Agent", ollama: "Ollama", kimi: "Kimi", codex: "Codex", claudecode: "Claude Code", qwen: "Qwen", deepseek: "DeepSeek", mistral: "Mistral",
  notion: "Notion", github: "GitHub", slack: "Slack", figma: "Figma", hubspot: "HubSpot", stripe: "Stripe",
};

/** Logos whose artwork is dark on dark: in dark mode they are lifted so they can be seen. */
const darkInk: ReadonlySet<string> = new Set(["langgraph", "deepinfra", "gemma", "fireworks", "unsloth"]);

export function Mark({ id }: { id: AvatarMark | ToolMark }) {
  const uid = useId().replace(/[^\w-]/g, "");
  if (id in aiMarks) {
    const mark = aiMarks[id as AiMarkId];
    return <svg className="agt__mark" data-mono={mark.mono ? "" : undefined} data-dim={darkInk.has(id) ? "" : undefined} viewBox={mark.viewBox} fill={mark.fill ?? undefined} fillRule={(mark.fillRule as "evenodd" | null) ?? undefined} aria-hidden="true" dangerouslySetInnerHTML={{ __html: mark.html.replaceAll("__uid__", uid) }} />;
  }
  const icon = brandIcons[id as keyof typeof brandIcons];
  // A gradient id must be unique in the document, and the same logo can sit on many cards.
  const html = icon.html.replaceAll("dgb-gemini", `${uid}-gemini`);
  return <svg className="agt__mark" data-mono={icon.mono ? "" : undefined} viewBox={icon.viewBox} fill={icon.fill ?? undefined} aria-hidden="true" dangerouslySetInnerHTML={{ __html: html }} />;
}

/** The glyph in a status pill: a spinner while running, a check when done, a warning triangle when failed, a clock when it needs you. */
export function StatusGlyph({ status }: { status: AgentStatus }) {
  const common = { width: 12, height: 12, viewBox: "0 0 12 12", fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;
  switch (status) {
    case "running": return <svg {...common} className="agt__spin"><circle cx="6" cy="6" r="4.2" opacity=".25" /><path d="M6 1.8a4.2 4.2 0 0 1 4.2 4.2" /></svg>;
    case "done": return <svg {...common}><path d="m2.6 6.3 2.4 2.4 4.4-5" /></svg>;
    case "failed": return <svg {...common}><path d="M6 1.9 10.9 10H1.1L6 1.9ZM6 5v2.3M6 8.7v.1" /></svg>;
    case "waiting": return <svg {...common}><circle cx="6" cy="6" r="4.4" /><path d="M6 3.6V6l1.6 1" /></svg>;
    case "queued": return <svg {...common}><circle cx="6" cy="6" r="4.2" strokeDasharray="1.6 2.2" /></svg>;
    case "stopped": return <svg {...common}><rect x="3" y="3" width="6" height="6" rx="1.2" /></svg>;
    default: return <svg {...common}><circle cx="6" cy="6" r="3.2" /></svg>;
  }
}

export const Spark = () => <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 1.2c.4 2.9 1.9 4.4 4.8 4.8-2.9.4-4.4 1.9-4.8 4.8C6.6 7.9 5.1 6.4 2.2 6 5.1 5.6 6.6 4.1 7 1.2Z" fill="currentColor" /><circle cx="11.6" cy="11.4" r="1.1" fill="currentColor" opacity=".55" /></svg>;
/** A plain chevron drawn for this tree (the fold and window buttons rotate it). */
export const Chevron = () => <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="m3 4.5 3 3 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
