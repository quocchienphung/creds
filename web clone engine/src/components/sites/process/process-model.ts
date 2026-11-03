import type { AvatarMark, ToolMark } from "../affectui-agent-tree/tree-model.ts";
import { roster } from "./agent-roster.ts";
import type { RosterId } from "./agent-roster.ts";
import { roleIds, roleOf } from "./roles.ts";
import type { Role } from "./roles.ts";

/**
 * The data a person edits on the Process page: a goal broken into tasks and sub-tasks, each with an AI block (or a
 * person) that does it. Pure rules only (no React, no storage): creation, immutable tree edits, and normalizing
 * untrusted data (a saved copy, a backend answer, an imported file) into a value the screen can safely show.
 */
export type CoreProvider = "anthropic" | "claudecode" | "openai" | "codex" | "gemini" | "kimi" | "hermes" | "ollama" | "qwen" | "deepseek" | "mistral" | "human" | "custom";
/** Every engine a block can be given: the first eleven, a person, a custom engine, and the roster of more AI agents and models. */
export type Provider = CoreProvider | RosterId;
export type Mode = "parallel" | "sequence";
export type CostUnit = "usd" | "credits" | "tokens" | "none";

/** The AI block of a task: which engine does it, with which model, told what. A person (`human`) needs no model. */
export interface AiBlock { provider: Provider; model: string; instructions: string }

/** Only the simulated engine reads these; a real engine ignores them. */
export interface Simulation { failOnce?: boolean; durationMs?: number; cost?: number }

export interface ProcessNode {
  id: string;
  name: string;
  /** What the block is for (planner, coder, fixer …). Picking one fills the instructions of a new block. */
  role: Role;
  task: string;
  ai: AiBlock;
  tools: ToolMark[];
  /** A person approves this task before it runs. */
  approval: boolean;
  /** What the approver is asked. A default question is used when empty. */
  askText: string;
  /** How its sub-tasks run: all at once, or one after another. */
  mode: Mode;
  /** The task stops (fails) when its own cost reaches this, in the process's cost unit. */
  limit?: number;
  sim?: Simulation;
  /** Where the person put the block on the map (its center, in map units). Without it the map places the block itself. */
  pos?: { x: number; y: number };
  children: ProcessNode[];
}

/**
 * A connection the person drew between two blocks, on top of the tree (each block hangs under one block; this is everything
 * else). Pointing back at a block that came before (an ancestor) closes a loop: the blocks from there to here run again, for
 * at most `rounds` rounds in all. Pointing at any other block means "wait for me": that block also starts only after this one
 * has finished. The tree stays the structure; links never move a block.
 */
export interface ProcessLink { id: string; from: string; to: string; label?: string; rounds?: number }

export interface ProcessDoc {
  id: string;
  name: string;
  goal: string;
  unit: CostUnit;
  createdAt: string;
  updatedAt: string;
  root: ProcessNode;
  /** The connections drawn on top of the tree. Absent when there are none. */
  links?: ProcessLink[];
}

export interface ProcessLibrary { version: 1; activeId: string; processes: ProcessDoc[] }

export const LIMITS = { processes: 50, nodes: 200, depth: 8, name: 80, goal: 300, task: 600, instructions: 4000, model: 120, askText: 300, tools: 6, links: 100, label: 40, rounds: 10 } as const;
/** How many times a loop goes around when nothing else is said (the first pass counts). */
export const DEFAULT_ROUNDS = 2;
export const providerIds: readonly Provider[] = ["anthropic", "claudecode", "openai", "codex", "gemini", "kimi", "hermes", "ollama", "qwen", "deepseek", "mistral", ...roster.map(entry => entry.id), "human", "custom"];
/** Model servers that run on the person's own machine: a run costs no dollars there (in the demo numbers). */
export const freeInDollars: ReadonlySet<Provider> = new Set<Provider>(["ollama", "lmstudio", "vllm", "xinference"]);
export { roleIds };
export const toolIds: readonly ToolMark[] = ["notion", "github", "slack", "figma", "hubspot", "stripe"];
const costUnits: readonly CostUnit[] = ["usd", "credits", "tokens", "none"];

/** The mark an avatar shows for a provider; a person and a custom engine show initials. */
export const markOf = (provider: Provider): AvatarMark | undefined => provider === "human" || provider === "custom" ? undefined : provider;
export { roleOf };

let counter = 0;
export function uid(prefix = "n") {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function createNode(partial: Partial<ProcessNode> = {}): ProcessNode {
  return {
    id: partial.id ?? uid(), name: "New block", role: "custom", task: "Describe what this task should get done", ai: { provider: "anthropic", model: "claude-sonnet-5-5", instructions: "" },
    tools: [], approval: false, askText: "", mode: "parallel", children: [], ...partial,
  };
}

export function createBlankProcess(name = "Untitled process", now = new Date()): ProcessDoc {
  const stamp = now.toISOString();
  return { id: uid("proc"), name, goal: "", unit: "usd", createdAt: stamp, updatedAt: stamp, root: createNode({ name: "Coordinator", role: "coordinator", task: "Describe the goal of this process" }) };
}

export const createLibrary = (docs: ProcessDoc[]): ProcessLibrary => ({ version: 1, activeId: docs[0]?.id ?? "", processes: docs });

/* ---------- immutable tree edits ---------- */
export function flattenNodes(root: ProcessNode): ProcessNode[] { return [root, ...root.children.flatMap(flattenNodes)]; }
export const findNode = (root: ProcessNode, id: string) => flattenNodes(root).find(node => node.id === id);
export const countNodes = (root: ProcessNode) => flattenNodes(root).length;

export function depthOfNode(root: ProcessNode, id: string, depth = 0): number {
  if (root.id === id) return depth;
  for (const child of root.children) { const found = depthOfNode(child, id, depth + 1); if (found >= 0) return found; }
  return -1;
}
export const heightOf = (node: ProcessNode): number => 1 + Math.max(0, ...node.children.map(heightOf));
export const parentNode = (root: ProcessNode, id: string) => flattenNodes(root).find(node => node.children.some(child => child.id === id));

/** Replaces one node (and keeps everything else as it was); an unchanged tree returns the same object. */
export function updateNode(root: ProcessNode, id: string, change: (node: ProcessNode) => ProcessNode): ProcessNode {
  if (root.id === id) return change(root);
  let changed = false;
  const children = root.children.map(child => { const next = updateNode(child, id, change); if (next !== child) changed = true; return next; });
  return changed ? { ...root, children } : root;
}

/** Pins a block where the person dropped it. */
export const setPosition = (root: ProcessNode, id: string, pos: { x: number; y: number }): ProcessNode => updateNode(root, id, node => node.pos?.x === pos.x && node.pos?.y === pos.y ? node : { ...node, pos: { x: pos.x, y: pos.y } });

/** Lets the map place every block again ("Tidy up"). */
export function clearPositions(root: ProcessNode): ProcessNode {
  const children = root.children.map(clearPositions);
  const same = !root.pos && children.every((child, index) => child === root.children[index]);
  if (same) return root;
  const { pos, ...rest } = root;
  void pos;
  return { ...rest, children };
}

/** Adds a sub-task; refused (same tree back) past the node and depth limits. */
export function addChild(root: ProcessNode, parentId: string, node: ProcessNode): ProcessNode {
  const depth = depthOfNode(root, parentId);
  if (depth < 0 || depth + heightOf(node) >= LIMITS.depth || countNodes(root) + countNodes(node) > LIMITS.nodes) return root;
  return updateNode(root, parentId, parent => ({ ...parent, children: [...parent.children, node] }));
}

/** Removes a task and everything under it. The root cannot be removed. */
export function removeNode(root: ProcessNode, id: string): ProcessNode {
  if (root.id === id) return root;
  const children = root.children.filter(child => child.id !== id).map(child => removeNode(child, id));
  const same = children.length === root.children.length && children.every((child, index) => child === root.children[index]);
  return same ? root : { ...root, children };
}

/** Removes several tasks at once (each with what is under it). The first block is never removed; a task that went with its parent is already gone. */
export function removeNodes(root: ProcessNode, ids: readonly string[]): ProcessNode {
  return ids.reduce((current, id) => id === root.id ? current : removeNode(current, id), root);
}

/** Moves a task one place among its siblings. */
export function moveNode(root: ProcessNode, id: string, delta: -1 | 1): ProcessNode {
  const parent = parentNode(root, id);
  if (!parent) return root;
  const index = parent.children.findIndex(child => child.id === id), target = index + delta;
  if (target < 0 || target >= parent.children.length) return root;
  return updateNode(root, parent.id, node => {
    const children = [...node.children];
    [children[index], children[target]] = [children[target], children[index]];
    return { ...node, children };
  });
}

/** Moves a task (with its sub-tasks) under another one. Not under itself, its own sub-tasks, or past the depth limit. */
export function reparentNode(root: ProcessNode, id: string, parentId: string): ProcessNode {
  const moving = findNode(root, id);
  if (!moving || root.id === id || parentNode(root, id)?.id === parentId) return root;
  if (flattenNodes(moving).some(node => node.id === parentId)) return root;
  const depth = depthOfNode(root, parentId);
  if (depth < 0 || depth + heightOf(moving) >= LIMITS.depth) return root;
  return addChild(removeNode(root, id), parentId, moving);
}

/** A deep copy with fresh ids, placed right after the original. */
export function duplicateNode(root: ProcessNode, id: string): { root: ProcessNode; copyId: string | null } {
  const original = findNode(root, id), parent = parentNode(root, id);
  if (!original || !parent || countNodes(root) + countNodes(original) > LIMITS.nodes) return { root, copyId: null };
  const copy = (node: ProcessNode): ProcessNode => ({ ...node, id: uid(), ai: { ...node.ai }, tools: [...node.tools], sim: node.sim ? { ...node.sim } : undefined, children: node.children.map(copy) });
  const clone = { ...copy(original), name: `${original.name} (copy)`.slice(0, LIMITS.name) };
  const next = updateNode(root, parent.id, node => {
    const children = [...node.children];
    children.splice(children.findIndex(child => child.id === id) + 1, 0, clone);
    return { ...node, children };
  });
  return { root: next, copyId: clone.id };
}

/** Tasks a person may move `id` under: everything except itself, its sub-tasks and (for the depth limit) too-deep places. */
export function validParents(root: ProcessNode, id: string): ProcessNode[] {
  const moving = findNode(root, id);
  if (!moving || root.id === id) return [];
  const blocked = new Set(flattenNodes(moving).map(node => node.id));
  return flattenNodes(root).filter(node => !blocked.has(node.id) && depthOfNode(root, node.id) + heightOf(moving) < LIMITS.depth);
}

export const touch = (doc: ProcessDoc, now = new Date()): ProcessDoc => ({ ...doc, updatedAt: now.toISOString() });

/* ---------- connections ---------- */
/** The ids from a block up to the first block, the block itself included. */
export function pathToRoot(root: ProcessNode, id: string): string[] {
  const path: string[] = [];
  const walk = (node: ProcessNode): boolean => {
    if (node.id === id) { path.push(node.id); return true; }
    if (node.children.some(walk)) { path.push(node.id); return true; }
    return false;
  };
  walk(root);
  return path;
}

export type LinkKind = "loop" | "needs";
/** A link back to a block that came before is a loop; a link to any other block means "this one has to finish first". */
export const linkKind = (root: ProcessNode, link: Pick<ProcessLink, "from" | "to">): LinkKind => pathToRoot(root, link.from).includes(link.to) ? "loop" : "needs";

/**
 * What has to happen before what. Every block has a start (S) and an end (E): a block starts before what it holds starts and ends
 * after it ends, a sub-block in a sequence starts after the one before it ends, and a waiting link makes its target start after its
 * source ends. A new waiting link is refused when its target's start already leads to its source's end: they would wait for each other.
 */
function happensBefore(root: ProcessNode, links: readonly ProcessLink[]): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();
  const edge = (from: string, to: string) => graph.set(from, (graph.get(from) ?? new Set<string>()).add(to));
  for (const node of flattenNodes(root)) {
    edge(`S:${node.id}`, `E:${node.id}`);
    node.children.forEach((child, index) => {
      edge(`S:${node.id}`, `S:${child.id}`);
      edge(`E:${child.id}`, `E:${node.id}`);
      if (node.mode === "sequence" && index > 0) edge(`E:${node.children[index - 1].id}`, `S:${child.id}`);
    });
  }
  for (const link of links) if (linkKind(root, link) === "needs") edge(`E:${link.from}`, `S:${link.to}`);
  return graph;
}
function reaches(graph: Map<string, Set<string>>, from: string, to: string): boolean {
  const seen = new Set<string>();
  const stack = [from];
  while (stack.length) {
    const id = stack.pop()!;
    if (id === to) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    graph.get(id)?.forEach(next => stack.push(next));
  }
  return false;
}

export type LinkCheck = { ok: true; kind: LinkKind } | { ok: false; reason: string };
/** Whether `from` may be connected to `to`, and if not, why (shown to the person). */
export function checkLink(doc: Pick<ProcessDoc, "root" | "links">, from: string, to: string, ignore?: string): LinkCheck {
  const { root } = doc, links = (doc.links ?? []).filter(link => link.id !== ignore);
  const source = findNode(root, from), target = findNode(root, to);
  if (!source || !target) return { ok: false, reason: "That block is not on the map." };
  if (from === to) return { ok: false, reason: "A block cannot connect to itself." };
  if (links.some(link => link.from === from && link.to === to)) return { ok: false, reason: `${source.name} is already connected to ${target.name}.` };
  if (source.children.some(child => child.id === to)) return { ok: false, reason: `${target.name} is already a sub-block of ${source.name}.` };
  if (links.length >= LIMITS.links) return { ok: false, reason: `A map can have up to ${LIMITS.links} connections.` };
  const kind = linkKind(root, { from, to });
  if (kind === "loop") {
    if (links.some(link => link.from === from && linkKind(root, link) === "loop")) return { ok: false, reason: `${source.name} already loops back somewhere. A block loops back to one place.` };
    return { ok: true, kind };
  }
  if (flattenNodes(source).some(node => node.id === to)) return { ok: false, reason: `${target.name} is already part of ${source.name}.` };
  if (reaches(happensBefore(root, links), `S:${to}`, `E:${from}`)) return { ok: false, reason: `${target.name} already has to wait for ${source.name}, so this would make them wait for each other.` };
  return { ok: true, kind };
}

export const clampRounds = (rounds: number) => Math.max(2, Math.min(LIMITS.rounds, Math.round(rounds) || DEFAULT_ROUNDS));
/** Connects two blocks; the same doc comes back when the connection is not allowed. */
export function addLink(doc: ProcessDoc, from: string, to: string, rounds = DEFAULT_ROUNDS, id = uid("link")): ProcessDoc {
  const check = checkLink(doc, from, to);
  if (!check.ok) return doc;
  const link: ProcessLink = { id, from, to, ...(check.kind === "loop" ? { rounds: clampRounds(rounds) } : {}) };
  return { ...doc, links: [...(doc.links ?? []), link] };
}
export function removeLink(doc: ProcessDoc, id: string): ProcessDoc {
  if (!doc.links?.some(link => link.id === id)) return doc;
  const links = doc.links.filter(link => link.id !== id);
  const { links: removed, ...rest } = doc;
  void removed;
  return links.length ? { ...rest, links } : rest;
}
export function updateLink(doc: ProcessDoc, id: string, change: Partial<Pick<ProcessLink, "label" | "rounds">>): ProcessDoc {
  if (!doc.links?.some(link => link.id === id)) return doc;
  return { ...doc, links: doc.links.map(link => {
    if (link.id !== id) return link;
    const next: ProcessLink = { ...link };
    if ("label" in change) { const label = (change.label ?? "").slice(0, LIMITS.label); if (label.trim()) next.label = label; else delete next.label; }
    if (change.rounds !== undefined && linkKind(doc.root, link) === "loop") next.rounds = clampRounds(change.rounds);
    return next;
  }) };
}
/** The loop a block closes (the one it loops back with), if any. */
export const loopFrom = (doc: Pick<ProcessDoc, "root" | "links">, id: string) => (doc.links ?? []).find(link => link.from === id && linkKind(doc.root, link) === "loop");
/** The blocks `id` has to wait for besides the one it hangs under. */
export const waitsFor = (doc: Pick<ProcessDoc, "root" | "links">, id: string) => (doc.links ?? []).filter(link => link.to === id && linkKind(doc.root, link) === "needs").map(link => link.from);

/** Drops connections the tree no longer allows (a block was removed or moved) and gives each loop its rounds; the rest stays in order. */
export function pruneLinks(doc: ProcessDoc): ProcessDoc {
  if (!doc.links?.length) return doc;
  const kept: ProcessLink[] = [];
  for (const link of doc.links) {
    const check = checkLink({ root: doc.root, links: kept }, link.from, link.to);
    if (!check.ok) continue;
    if (check.kind === "loop" && link.rounds === undefined) kept.push({ ...link, rounds: DEFAULT_ROUNDS });
    else if (check.kind === "needs" && link.rounds !== undefined) { const { rounds, ...rest } = link; void rounds; kept.push(rest); }
    else kept.push(link);
  }
  if (kept.length === doc.links.length && kept.every((link, index) => link === doc.links![index])) return doc;
  const { links, ...rest } = doc;
  void links;
  return kept.length ? { ...rest, links: kept } : rest;
}


/* ---------- cost formatting ---------- */
export function costFormatter(unit: CostUnit): (amount: number) => string {
  if (unit === "credits") return amount => `${amount.toFixed(amount >= 10 ? 0 : 1)} cr`;
  if (unit === "tokens") return amount => amount >= 1000 ? `${(amount / 1000).toFixed(1)}K tok` : `${Math.round(amount)} tok`;
  return amount => `$${amount.toFixed(2)}`;
}
export const unitLabel: Record<CostUnit, string> = { usd: "Dollars", credits: "Credits", tokens: "Tokens", none: "No cost" };

/* ---------- normalizing untrusted data ---------- */
const text = (raw: unknown, max: number, fallback = "") => typeof raw === "string" ? raw.slice(0, max) : fallback;
const isRecord = (raw: unknown): raw is Record<string, unknown> => !!raw && typeof raw === "object" && !Array.isArray(raw);
const finite = (raw: unknown) => typeof raw === "number" && Number.isFinite(raw) ? raw : undefined;

function normalizeNode(raw: unknown, depth: number, seen: Set<string>, budget: { left: number }): ProcessNode | null {
  if (!isRecord(raw) || depth >= LIMITS.depth || budget.left <= 0) return null;
  budget.left -= 1;
  let id = text(raw.id, 80);
  if (!id || seen.has(id)) id = uid();
  seen.add(id);
  const ai = isRecord(raw.ai) ? raw.ai : {};
  const provider = providerIds.includes(ai.provider as Provider) ? ai.provider as Provider : "anthropic";
  const sim = isRecord(raw.sim) ? { failOnce: raw.sim.failOnce === true || undefined, durationMs: finite(raw.sim.durationMs), cost: finite(raw.sim.cost) } : undefined;
  const limit = finite(raw.limit);
  const x = isRecord(raw.pos) ? finite(raw.pos.x) : undefined, y = isRecord(raw.pos) ? finite(raw.pos.y) : undefined;
  return {
    id, name: text(raw.name, LIMITS.name, "Task") || "Task", role: roleIds.includes(raw.role as Role) ? raw.role as Role : "custom", task: text(raw.task, LIMITS.task),
    ai: { provider, model: text(ai.model, LIMITS.model), instructions: text(ai.instructions, LIMITS.instructions) },
    tools: Array.isArray(raw.tools) ? [...new Set(raw.tools.filter((tool): tool is ToolMark => toolIds.includes(tool as ToolMark)))].slice(0, LIMITS.tools) : [],
    approval: raw.approval === true, askText: text(raw.askText, LIMITS.askText), mode: raw.mode === "sequence" ? "sequence" : "parallel",
    ...(limit !== undefined && limit > 0 ? { limit } : {}),
    ...(x !== undefined && y !== undefined ? { pos: { x: Math.max(-50_000, Math.min(50_000, Math.round(x))), y: Math.max(-50_000, Math.min(50_000, Math.round(y))) } } : {}),
    ...(sim && (sim.failOnce || sim.durationMs !== undefined || sim.cost !== undefined) ? { sim: { ...(sim.failOnce ? { failOnce: true } : {}), ...(sim.durationMs !== undefined ? { durationMs: Math.max(200, Math.min(600_000, sim.durationMs)) } : {}), ...(sim.cost !== undefined ? { cost: Math.max(0, sim.cost) } : {}) } } : {}),
    children: Array.isArray(raw.children) ? raw.children.map(child => normalizeNode(child, depth + 1, seen, budget)).filter((child): child is ProcessNode => !!child) : [],
  };
}

export function normalizeProcess(raw: unknown): ProcessDoc | null {
  if (!isRecord(raw)) return null;
  const root = normalizeNode(raw.root, 0, new Set(), { left: LIMITS.nodes });
  if (!root) return null;
  const id = text(raw.id, 80) || uid("proc");
  const stamp = new Date().toISOString();
  const dated = (value: unknown) => typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : stamp;
  const doc: ProcessDoc = { id, name: text(raw.name, LIMITS.name, "Untitled process") || "Untitled process", goal: text(raw.goal, LIMITS.goal), unit: costUnits.includes(raw.unit as CostUnit) ? raw.unit as CostUnit : "usd", createdAt: dated(raw.createdAt), updatedAt: dated(raw.updatedAt), root };
  return pruneLinks(withLinks(doc, raw.links));
}

/** Connections from untrusted data: only well-formed ones between blocks that exist; pruneLinks then drops the ones the tree does not allow. */
function withLinks(doc: ProcessDoc, raw: unknown): ProcessDoc {
  if (!Array.isArray(raw)) return doc;
  const ids = new Set(flattenNodes(doc.root).map(node => node.id));
  const seen = new Set<string>();
  const links: ProcessLink[] = [];
  for (const item of raw.slice(0, LIMITS.links)) {
    if (!isRecord(item)) continue;
    const from = text(item.from, 80), to = text(item.to, 80);
    if (!ids.has(from) || !ids.has(to)) continue;
    let id = text(item.id, 80);
    if (!id || seen.has(id)) id = uid("link");
    seen.add(id);
    const label = text(item.label, LIMITS.label).trim(), rounds = finite(item.rounds);
    links.push({ id, from, to, ...(label ? { label } : {}), ...(rounds !== undefined ? { rounds: clampRounds(rounds) } : {}) });
  }
  return links.length ? { ...doc, links } : doc;
}

/** A saved library, or null when it is not one (the screen then shows its retry notice and keeps the stored copy). */
export function normalizeLibrary(raw: unknown): ProcessLibrary | null {
  if (!isRecord(raw) || raw.version !== 1 || !Array.isArray(raw.processes) || raw.processes.length > LIMITS.processes) return null;
  const processes: ProcessDoc[] = [];
  const ids = new Set<string>();
  for (const item of raw.processes) {
    const doc = normalizeProcess(item);
    if (!doc) return null;
    if (ids.has(doc.id)) doc.id = uid("proc");
    ids.add(doc.id);
    processes.push(doc);
  }
  const activeId = typeof raw.activeId === "string" && ids.has(raw.activeId) ? raw.activeId : processes[0]?.id ?? "";
  return { version: 1, activeId, processes };
}

/* ---------- starting points ---------- */
const node = (id: string, name: string, task: string, ai: Partial<AiBlock> & Pick<AiBlock, "provider">, rest: Partial<ProcessNode> = {}): ProcessNode =>
  createNode({ id, name, task, ai: { model: "", instructions: "", ...ai }, ...rest });

/** A launch plan split across several AI blocks, with a person approving the copy and one task that fails once so Retry can be tried. */
export function createSampleProcess(now = new Date()): ProcessDoc {
  const stamp = now.toISOString();
  return {
    id: "proc-launch", name: "Launch the pricing page", goal: "Launch the new pricing page by Friday", unit: "usd", createdAt: stamp, updatedAt: stamp,
    root: node("launch", "Coordinator", "Launch the new pricing page by Friday", { provider: "anthropic", model: "claude-opus-5-5", instructions: roleOf("coordinator").instructions }, {
      role: "coordinator", tools: ["slack", "notion", "github"], sim: { durationMs: 7000 },
      children: [
        node("planner", "Planner", "Break the launch into steps and say who does each one", { provider: "anthropic", model: "claude-sonnet-5-5", instructions: roleOf("planner").instructions }, { role: "planner", tools: ["notion"], sim: { durationMs: 5000 } }),
        node("research", "Researcher", "Compare the pricing of five competitors", { provider: "kimi", model: "", instructions: roleOf("helper").instructions }, {
          role: "helper", tools: ["notion", "slack"], sim: { durationMs: 6000 },
          children: [
            node("scraper", "Scraper", "Read the pricing pages of Linear, Notion and three more", { provider: "gemini", model: "gemini", instructions: roleOf("processor").instructions }, { role: "processor", tools: ["notion"], sim: { durationMs: 5000 } }),
            node("analyst", "Analyst", "Summarize 120 G2 reviews that mention price", { provider: "deepseek", model: "", instructions: roleOf("processor").instructions }, { role: "processor", tools: ["hubspot", "notion"], sim: { durationMs: 7000 } }),
          ],
        }),
        node("writer", "Writer", "Write the copy for the three plans", { provider: "anthropic", model: "claude-sonnet-5-5", instructions: roleOf("instructor").instructions }, { role: "instructor", tools: ["notion", "figma"], approval: true, askText: "Formal or friendly for the plan names? Both drafts are in Notion.", sim: { durationMs: 8000 } }),
        node("coder", "Coder", "Build the page and wire up checkout", { provider: "codex", model: "gpt-6-1-sol", instructions: roleOf("coder").instructions }, {
          role: "coder", mode: "sequence", tools: ["github", "stripe", "figma"], sim: { durationMs: 9000 },
          children: [
            node("tester", "Tester", "Write and run the checkout tests", { provider: "openai", model: "gpt-6-luna", instructions: roleOf("helper").instructions }, { role: "helper", tools: ["github"], sim: { durationMs: 6000, failOnce: true } }),
            node("fixer", "Fixer", "Fix whatever the tests found", { provider: "claudecode", model: "claude-sonnet-5-5", instructions: roleOf("fixer").instructions }, { role: "fixer", tools: ["github"], sim: { durationMs: 5000 } }),
          ],
        }),
      ],
    }),
  };
}

/** A small pipeline for a local model: Hermes Agent coordinates, an Ollama model drafts, a person approves before anything is sent. */
export function createLocalProcess(now = new Date()): ProcessDoc {
  const stamp = now.toISOString();
  return {
    id: "proc-local", name: "Reply to a customer (local model)", goal: "Draft a reply to the customer's question without sending it anywhere", unit: "tokens", createdAt: stamp, updatedAt: stamp,
    root: node("reply", "Coordinator", "Read the question, ask for a draft and hand it over for approval", { provider: "hermes", model: "", instructions: `${roleOf("coordinator").instructions} Keep the customer's data on this machine. Do not call any hosted model.` }, {
      role: "coordinator", mode: "sequence", tools: ["slack"], sim: { durationMs: 4000 },
      children: [
        node("draft", "Drafter", "Draft a short, friendly reply that answers the question", { provider: "ollama", model: "", instructions: "Answer in the customer's language. Under 120 words." }, { role: "helper", sim: { durationMs: 7000 } }),
        node("review", "Reviewer", "Check the draft against the refund policy", { provider: "ollama", model: "", instructions: roleOf("fixer").instructions }, { role: "fixer", sim: { durationMs: 5000 } }),
        node("send", "Approver", "Approve the reply before it is sent", { provider: "human", model: "", instructions: "" }, { role: "custom", approval: true, askText: "Send this reply to the customer?", tools: ["slack"], sim: { durationMs: 2000 } }),
      ],
    }),
  };
}


/**
 * The closed loop: the blocks of a software team that go round and round until the work is shipped. The Coordinator splits the goal,
 * the Planner plans it, the Creator makes the spec, the Coder builds it and QA checks it (with the Fixer looping back to QA), the
 * Reviewer judges it and the Deployer ships it, but only after a person approves. The Deployer then loops back to the Coordinator for
 * the next round. Nothing here deploys anything: it is a plan for an engine to run, and the simulated engine only plays it.
 */
export function createLoopProcess(now = new Date()): ProcessDoc {
  const stamp = now.toISOString();
  const role = (id: Role) => roleOf(id).instructions;
  return {
    id: "proc-loop", name: "Ship to production, round and round", goal: "Plan, build, check, review and deploy the change, then go round again for the next one", unit: "usd", createdAt: stamp, updatedAt: stamp,
    root: node("loop-coordinator", "Coordinator", "Own the goal, hand each part to the right block and decide whether to go another round", { provider: "anthropic", model: "claude-opus-5-5", instructions: role("coordinator") }, {
      role: "coordinator", tools: ["slack", "notion"], sim: { durationMs: 4000 },
      children: [
        node("loop-planner", "Planner", "Break the change into small steps and say who does each one", { provider: "anthropic", model: "claude-sonnet-5-5", instructions: role("planner") }, { role: "planner", tools: ["notion"], sim: { durationMs: 4000 } }),
        node("loop-creator", "Creator", "Write the spec and the copy the change needs", { provider: "gemini", model: "gemini", instructions: role("creator") }, { role: "creator", tools: ["notion", "figma"], sim: { durationMs: 5000 } }),
        node("loop-coder", "Coder", "Build the change in small commits", { provider: "codex", model: "gpt-6-1-sol", instructions: role("coder") }, {
          role: "coder", tools: ["github"], sim: { durationMs: 6000 },
          children: [
            node("loop-qa", "QA", "Run the checks and try the main flow; report pass or fail with evidence", { provider: "openai", model: "gpt-6-luna", instructions: role("qa") }, {
              role: "qa", tools: ["github"], sim: { durationMs: 4000 },
              children: [
                node("loop-fixer", "Fixer", "Fix whatever QA found, then hand back to QA", { provider: "claudecode", model: "claude-sonnet-5-5", instructions: role("fixer") }, { role: "fixer", tools: ["github"], sim: { durationMs: 4000 } }),
              ],
            }),
          ],
        }),
        node("loop-reviewer", "Reviewer", "Judge the result against the goal and approve it or send it back", { provider: "anthropic", model: "claude-opus-5-5", instructions: role("reviewer") }, { role: "reviewer", tools: ["github", "slack"], sim: { durationMs: 4000 } }),
        node("loop-deployer", "Deployer", "Build and publish the approved change", { provider: "hermes", model: "", instructions: role("processor") }, {
          role: "processor", tools: ["github", "slack"], approval: true, askText: "Deploy this change to production?", sim: { durationMs: 5000 },
        }),
      ],
    }),
    links: [
      { id: "loop-after-plan", from: "loop-planner", to: "loop-creator" },
      { id: "loop-after-spec", from: "loop-creator", to: "loop-coder" },
      { id: "loop-after-build", from: "loop-coder", to: "loop-reviewer" },
      { id: "loop-after-review", from: "loop-reviewer", to: "loop-deployer" },
      { id: "loop-fix-again", from: "loop-fixer", to: "loop-qa", rounds: 3, label: "until it passes" },
      { id: "loop-next-round", from: "loop-deployer", to: "loop-coordinator", rounds: 2, label: "next release" },
    ],
  };
}

export const templates = [
  { id: "launch", label: "Pricing page launch", description: "Several AI blocks, one approval, one task that fails once", create: createSampleProcess },
  { id: "local", label: "Local model reply", description: "Hermes Agent and Ollama on this machine, a person approves", create: createLocalProcess },
  { id: "loop", label: "Closed loop: ship to production", description: "Planner, Creator, Coder, QA, Reviewer, Fixer and Deployer go round and round; a person approves each deploy", create: createLoopProcess },
] as const;

/** A copy of a template as a new process (fresh ids, so it can sit next to the original). */
export function instantiate(doc: ProcessDoc, now = new Date()): ProcessDoc {
  const renamed = new Map<string, string>();
  const fresh = (item: ProcessNode): ProcessNode => { const id = uid(); renamed.set(item.id, id); return { ...item, id, children: item.children.map(fresh) }; };
  const stamp = now.toISOString();
  const root = fresh(doc.root);
  const links = doc.links?.map(link => ({ ...link, id: uid("link"), from: renamed.get(link.from) ?? link.from, to: renamed.get(link.to) ?? link.to }));
  return { ...doc, id: uid("proc"), createdAt: stamp, updatedAt: stamp, root, ...(links?.length ? { links } : {}) };
}
