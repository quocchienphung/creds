"use client";

import { useEffect, useId, useState } from "react";
import type { LaneAgent, LaneTask } from "./AgentLanes";
import { FittedLanes } from "./extra-lanes";
import { minute } from "./lanes-model";
import icons from "./icons.json";

/** Brand artwork observed in the public preview, bundled locally; no remote SVG or runtime. */
function LaneIcon({ name }: { name: keyof typeof icons }) {
  const id = useId();
  let svg = icons[name];
  for (const match of icons[name].matchAll(/\bid="([^"]+)"/g)) {
    const unique = `${id}-${match[1]}`;
    svg = svg.replaceAll(`id="${match[1]}"`, `id="${unique}"`).replaceAll(`url(#${match[1]})`, `url(#${unique})`);
  }
  return <span className="agl__icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />;
}
const agents: readonly LaneAgent[] = [
  { id: "researcher", name: "Researcher", model: "Opus 5.5", avatarLabel: "Claude", avatar: <LaneIcon name="claude" /> },
  { id: "writer", name: "Writer", model: "Sonnet 5.5", avatarLabel: "Claude", avatar: <LaneIcon name="claude" /> },
  { id: "reviewer", name: "Reviewer", model: "GPT-6 Sol", avatarLabel: "ChatGPT", avatar: <LaneIcon name="chatgpt" /> },
  { id: "ops", name: "Ops", model: "Gemini 3.8 Flash", avatarLabel: "Gemini", avatar: <LaneIcon name="gemini" /> },
];
const tools = (...names: (keyof typeof icons)[]) => names.map(name => <LaneIcon name={name} key={name} />);
const baseTasks: readonly LaneTask[] = [
  { id: "r1", agentId: "researcher", title: "Competitor pricing", status: "done", start: -27 * minute, end: -16 * minute, handoffTo: "w1", tools: tools("google", "notion"), summary: ["Checked 6 competitors", "Collected plans and prices", "Handed the table to the Writer"] },
  { id: "r2", agentId: "researcher", title: "Customer interviews", status: "running", start: -9 * minute, tools: tools("notion", "slack"), summary: ["Read 14 interview notes", "Grouping quotes by theme"] },
  { id: "w1", agentId: "writer", title: "Draft pricing page", status: "running", start: -15 * minute, tools: tools("figma", "notion"), summary: ["Outlined the page", "Wrote plan copy and FAQ"] },
  { id: "v1", agentId: "reviewer", title: "PR #482 billing", status: "done", start: -29 * minute, end: -19 * minute, tools: tools("github", "linear"), summary: ["Read 12 changed files", "214 tests passed", "Left 3 comments"] },
  { id: "o1", agentId: "ops", title: "Sync CRM", status: "failed", start: -27 * minute, end: -20.5 * minute, tools: tools("hubspot"), summary: ["Loaded 18,240 contacts", "Stopped at the API rate limit"] },
  { id: "o2", agentId: "ops", title: "Rotate API keys", status: "waiting", start: -12 * minute, ask: "Rotate the production Stripe and OpenAI keys? Jobs reconnect in ~30 s.", tools: tools("stripe", "github") },
];

/** The reference's demo clock advances 30 simulated seconds per second. It never calls a service. */
export function CrmAgentLanes({ active }: { active: boolean }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!active) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let timer: ReturnType<typeof setInterval> | undefined;
    const sync = () => {
      clearInterval(timer);
      if (document.hidden || motion.matches) return;
      let last = performance.now();
      timer = setInterval(() => {
        const current = performance.now();
        const delta = (current - last) * 30;
        last = current;
        setElapsed(previous => previous + delta);
      }, 100);
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    motion.addEventListener("change", sync);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", sync); motion.removeEventListener("change", sync); };
  }, [active]);
  const tasks = baseTasks.map(task => {
    if (task.id === "w1" && elapsed >= 4 * minute) return { ...task, status: "done" as const, end: 4 * minute, handoffTo: "v2" };
    if (task.id === "r2" && elapsed >= 13 * minute) return { ...task, status: "done" as const, end: 13 * minute };
    return task;
  });
  if (elapsed >= 4 * minute) tasks.push({ id: "v2", agentId: "reviewer", title: "Review pricing copy", status: "running", start: 4 * minute, tools: tools("figma") });
  return <div className="crm-lanes"><FittedLanes agents={agents} tasks={tasks} now={elapsed} active={active} /></div>;
}
