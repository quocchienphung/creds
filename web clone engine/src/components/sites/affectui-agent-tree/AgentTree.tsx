"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import type { CSSProperties, KeyboardEvent, MouseEvent, ReactNode } from "react";
import {
  dollars, flatten, goneNodes, isMuted, statusLabel, totalsOf, visibleTree, withGhosts,
  type Ghost, type TreeAgent,
} from "./tree-model";
import { Chevron } from "./tree-marks";
import { AgentBar } from "./agent-bar";
import type { ResolveAction } from "./agent-bar";
import { AgentCardBody } from "./agent-card";
import { useWidth } from "./use-width";
import "../affectui-fonts.css";
import "./agent-tree.css";

export type { ResolveAction };

export interface AgentTreeProps {
  /** The whole tree, rebuilt as the run goes on. Ids keep the cards in place; a new id grows in with a drawn connector. */
  root: TreeAgent;
  /** Ids of folded branches, controlled or uncontrolled. */
  collapsed?: readonly string[];
  defaultCollapsed?: readonly string[];
  onCollapsedChange?: (collapsed: string[]) => void;
  /** An answer from the "needs you" or "failed" window. Without it the windows only show what is wrong. */
  onResolve?: (agent: TreeAgent, action: ResolveAction) => void;
  /** A click (or Enter) on a card; makes the cards selectable. */
  onSelect?: (agent: TreeAgent) => void;
  selectedId?: string | null;
  /** The clock for running times. Without it the tree ticks every second while an agent runs. */
  now?: number;
  /** Formats every cost: swap in credits or tokens. */
  formatCost?: (amount: number) => string;
  /** Hide every cost (a tree of local models may have none). */
  showCost?: boolean;
  title?: string;
  /** What an agent is called, singular and plural: ["task", "tasks"] for a plan. */
  noun?: readonly [string, string];
  /** Controls beside the totals in the bar, for example a Run button. */
  barExtra?: ReactNode;
  /** Controls on a card's bottom row, before the fold button, for example "Add sub-task". */
  renderCardActions?: (agent: TreeAgent) => ReactNode;
  className?: string;
}

const CARD = 216;
const INDENT = 32;
const GAP = 8;
const WIDE_MIN = 560;
/** Side by side, cards shrink down to this before the tree falls back to the indented layout. */
const MIN_CARD = 168;
const SETTLE_MS = 640;
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* The wall clock as an external store: the server renders no time, so hydration never disagrees. */
let clockNow = 0;
const clockListeners = new Set<() => void>();
let clockTimer: ReturnType<typeof setInterval> | undefined;
function subscribeClock(listener: () => void) {
  clockNow = Date.now();
  clockListeners.add(listener);
  clockTimer ??= setInterval(() => { clockNow = Date.now(); clockListeners.forEach(notify => notify()); }, 1000);
  return () => { clockListeners.delete(listener); if (!clockListeners.size) { clearInterval(clockTimer); clockTimer = undefined; } };
}
const readClock = () => clockNow;
const serverClock = () => 0;
const noClock = () => () => {};

interface Edge { parent: string; child: string; bus: boolean; muted: boolean; fresh: boolean; leaving: boolean; delay: number }
const SVG = "http://www.w3.org/2000/svg";
const RADIUS = 8;
const BUS_RADIUS = 12;

/** Connector path for one parent → child edge, in the tree's coordinates. */
function connectorPath(parent: DOMRect, child: DOMRect, origin: DOMRect, bus: boolean) {
  const left = (box: DOMRect) => box.left - origin.left;
  const top = (box: DOMRect) => box.top - origin.top;
  if (bus) {
    const x0 = left(parent) + parent.width / 2, y0 = top(parent) + parent.height;
    const xc = left(child) + child.width / 2, yt = top(child), yb = yt - 20;
    if (Math.abs(xc - x0) < 1) return { d: `M ${x0} ${y0} V ${yt}`, x: x0, y: y0 };
    const dir = Math.sign(xc - x0), r = Math.min(BUS_RADIUS, Math.abs(xc - x0) / 2);
    // A straight T under the parent's dot; only the corner above each child is rounded.
    return { d: `M ${x0} ${y0} V ${yb} H ${xc - dir * r} Q ${xc} ${yb} ${xc} ${yb + r} V ${yt}`, x: x0, y: y0 };
  }
  const x0 = left(parent) + 21, y0 = top(parent) + parent.height;
  const yc = top(child) + 20, xe = left(child);
  return { d: `M ${x0} ${y0} V ${yc - RADIUS} Q ${x0} ${yc} ${x0 + RADIUS} ${yc} H ${xe}`, x: x0, y: y0 };
}

/**
 * Who started whom: an orchestrator and its sub-agents as a tree, with status, cost and time on every card, costs rolling
 * up each branch and branches that fold to one line. The connectors are measured from the cards, so any width or zoom
 * works. From 560px the first level sits side by side under the root (when it fits); narrower, every level is indented.
 */
export function AgentTree({
  root, collapsed, defaultCollapsed, onCollapsedChange, onResolve, onSelect, selectedId, now: suppliedNow, formatCost = dollars, showCost = true,
  title = "Agents", noun = ["agent", "agents"], barExtra, renderCardActions, className,
}: AgentTreeProps) {
  const { t: uiText } = useWorkspaceI18n();
  const [one, many] = noun;
  const ids = useId();
  const [ownCollapsed, setOwnCollapsed] = useState<readonly string[]>(defaultCollapsed ?? []);
  const collapsedIds = collapsed ?? ownCollapsed;
  const folded = new Set(collapsedIds);
  const visible = visibleTree(root, folded);
  const key = flatten(visible).map(agent => agent.id).join("|");

  // When the shape changes, remember who left (to fade them out in place) and who is new (to draw their connector).
  const [memory, setMemory] = useState({ key, tree: visible, ghosts: [] as Ghost[], fresh: new Set(flatten(visible).map(agent => agent.id)) });
  if (memory.key !== key) {
    const before = new Set(flatten(memory.tree).map(agent => agent.id));
    setMemory({ key, tree: visible, ghosts: goneNodes(memory.tree, visible), fresh: new Set(flatten(visible).filter(agent => !before.has(agent.id)).map(agent => agent.id)) });
  }
  useEffect(() => {
    if (!memory.ghosts.length && !memory.fresh.size) return;
    const timer = setTimeout(() => setMemory(current => current.key === key ? { ...current, ghosts: [], fresh: new Set() } : current), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [memory, key]);
  const leaving = new Set<string>();
  const shown = withGhosts(visible, memory.ghosts, leaving);

  const totals = totalsOf(root);
  const clock = useSyncExternalStore(suppliedNow === undefined && (totals.live || totals.waiting > 0) ? subscribeClock : noClock, readClock, serverClock);
  const now = suppliedNow ?? clock;
  const selectable = !!onSelect;


  function setFolded(next: string[]) {
    onCollapsedChange?.(next);
    if (collapsed === undefined) setOwnCollapsed(next);
  }
  const toggle = (id: string) => setFolded(folded.has(id) ? collapsedIds.filter(value => value !== id) : [...collapsedIds, id]);
  const childCount = new Map(flatten(root).map(agent => [agent.id, agent.children?.length ?? 0]));

  // Layout: first level side by side when the root has room for it, otherwise every level indented.
  const [setHost, width] = useWidth();
  // Cards that are fading out still take their place, so the layout does not change under them.
  const first = shown.children?.length ?? 0;
  const cardWidth = first > 0 ? Math.min(CARD, Math.floor((width - (first - 1) * GAP) / first - INDENT)) : CARD;
  const wide = first > 0 && width >= WIDE_MIN && cardWidth >= MIN_CARD;

  const edges: Edge[] = [];
  const addEdges = (agent: TreeAgent, depth: number) => (agent.children ?? []).forEach((child, index) => {
    edges.push({ parent: agent.id, child: child.id, bus: wide && depth === 0, muted: isMuted(child.status), fresh: memory.fresh.has(child.id), leaving: leaving.has(child.id), delay: memory.fresh.has(child.id) ? 120 + index * 80 : 0 });
    addEdges(child, depth + 1);
  });
  addEdges(shown, 0);

  const treeRef = useRef<HTMLDivElement>(null);
  const linksRef = useRef<SVGSVGElement>(null);
  const dotsRef = useRef<SVGSVGElement>(null);
  const cards = useRef(new Map<string, HTMLElement>());
  const drawn = useRef({ paths: new Map<string, SVGPathElement>(), dots: new Map<string, SVGCircleElement>(), rects: new Map<string, { x: number; y: number }>(), signature: "", frame: 0, layout: "", draw: undefined as (() => void) | undefined });
  const edgesKey = edges.map(edge => `${edge.parent}>${edge.child}${edge.bus ? "b" : "h"}${edge.muted ? "m" : ""}${edge.leaving ? "l" : ""}${edge.fresh ? "f" : ""}`).join("|");

  // Connectors are drawn from the cards' real positions (so they follow a gliding card), straight into the SVG.
  useLayoutEffect(() => {
    const host = treeRef.current, links = linksRef.current, dots = dotsRef.current;
    if (!host || !links || !dots) return;
    const state = drawn.current;
    const animate = !reducedMotion();
    // A change of width or of layout (side by side or indented) is not a move: nothing glides then.
    const layoutKey = `${wide}|${width}`;
    const settled = state.layout === layoutKey;
    state.layout = layoutKey;

    // Every card glides from where it was to where it is now.
    const origin = host.getBoundingClientRect();
    const nextRects = new Map<string, { x: number; y: number }>();
    cards.current.forEach((element, id) => {
      const box = element.getBoundingClientRect();
      const at = { x: box.left - origin.left, y: box.top - origin.top };
      nextRects.set(id, at);
      const from = state.rects.get(id);
      if (!from || !animate || !settled || element.hasAttribute("data-leaving")) return;
      const dx = from.x - at.x, dy = from.y - at.y;
      if (Math.abs(dx) + Math.abs(dy) > 1) element.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: 420, easing: "cubic-bezier(0.32, 0.72, 0.24, 1)" });
    });
    state.rects = nextRects;

    const draw = () => {
      const o = host.getBoundingClientRect();
      for (const svg of [links, dots]) { svg.setAttribute("width", String(o.width)); svg.setAttribute("height", String(o.height)); svg.setAttribute("viewBox", `0 0 ${o.width} ${o.height}`); }
      const livePaths = new Set<string>(), liveDots = new Set<string>();
      for (const edge of edges) {
        const parent = cards.current.get(edge.parent), child = cards.current.get(edge.child);
        if (!parent || !child) continue;
        const { d, x, y } = connectorPath(parent.getBoundingClientRect(), child.getBoundingClientRect(), o, edge.bus);
        const id = `${edge.parent}>${edge.child}`;
        livePaths.add(id);
        let path = state.paths.get(id);
        if (!path) { path = document.createElementNS(SVG, "path"); path.setAttribute("class", "agt__link"); path.setAttribute("pathLength", "1"); links.appendChild(path); state.paths.set(id, path); }
        path.setAttribute("d", d);
        path.toggleAttribute("data-muted", edge.muted); path.toggleAttribute("data-leaving", edge.leaving); path.toggleAttribute("data-fresh", edge.fresh && !edge.leaving);
        path.style.setProperty("--agt-delay", `${edge.delay}ms`);
        liveDots.add(edge.parent);
        let dot = state.dots.get(edge.parent);
        if (!dot) { dot = document.createElementNS(SVG, "circle"); dot.setAttribute("class", "agt__dot"); dot.setAttribute("r", "4"); dots.appendChild(dot); state.dots.set(edge.parent, dot); }
        dot.setAttribute("cx", String(x)); dot.setAttribute("cy", String(y));
        const parentEdges = edges.filter(item => item.parent === edge.parent);
        dot.toggleAttribute("data-muted", parentEdges.every(item => item.muted)); dot.toggleAttribute("data-leaving", parentEdges.every(item => item.leaving));
      }
      state.paths.forEach((path, id) => { if (!livePaths.has(id)) { path.remove(); state.paths.delete(id); } });
      state.dots.forEach((dot, id) => { if (!liveDots.has(id)) { dot.remove(); state.dots.delete(id); } });
    };
    state.draw = draw;
    draw();
    // While cards glide, the connectors follow frame by frame.
    const signature = `${edgesKey}|${wide}|${width}`;
    if (signature !== state.signature) {
      state.signature = signature;
      cancelAnimationFrame(state.frame);
      if (animate) {
        let began = 0;
        const step = (time: number) => { began ||= time; draw(); if (time - began < 520) state.frame = requestAnimationFrame(step); };
        state.frame = requestAnimationFrame(step);
      }
    }
  });
  useEffect(() => {
    const host = treeRef.current;
    if (!host) return;
    const state = drawn.current;
    const observer = new ResizeObserver(() => state.draw?.());
    observer.observe(host);
    return () => { observer.disconnect(); cancelAnimationFrame(state.frame); };
  }, []);

  function renderBranch(agent: TreeAgent, depth: number, index: number): ReactNode {
    const isLeaving = leaving.has(agent.id);
    const kids = agent.children ?? [];
    const total = childCount.get(agent.id) ?? 0;
    const expanded = !folded.has(agent.id);
    const fresh = memory.fresh.has(agent.id);
    const delay = fresh && depth > 0 ? 220 + index * 80 : 0;
    const label = `${agent.name}, ${statusLabel[agent.status]}`;
    function select(event: MouseEvent | KeyboardEvent) {
      if ((event.target as Element).closest("button, a, input, select, textarea, [data-no-select]") && event.target !== event.currentTarget) return;
      onSelect?.(agent);
    }
    return <div className={`agt__branch${depth === 0 ? " agt__root-branch" : ""}`} key={agent.id} role="treeitem" aria-label={uiText(label)} aria-level={depth + 1}
      aria-expanded={total ? expanded : undefined} aria-selected={selectable ? selectedId === agent.id : undefined} style={{ "--agt-depth": depth } as CSSProperties}>
      <div
        className="agt__node" ref={element => { if (element) cards.current.set(agent.id, element); else cards.current.delete(agent.id); }}
        data-status={agent.status} data-clickable={selectable ? "" : undefined} data-selected={selectedId === agent.id ? "" : undefined} data-leaving={isLeaving ? "" : undefined}
        tabIndex={selectable && !isLeaving ? 0 : undefined} style={{ "--agt-delay": `${delay}ms` } as CSSProperties}
        onClick={selectable ? select : undefined} onKeyDown={selectable ? event => { if ((event.key === "Enter" || event.key === " ") && event.target === event.currentTarget) { event.preventDefault(); select(event); } } : undefined}
      >
        <AgentCardBody agent={agent} now={now} formatCost={formatCost} showCost={showCost} actions={renderCardActions?.(agent)} fold={total > 0 ? <button type="button" className="agt__fold" aria-expanded={expanded} aria-controls={`${ids}-${agent.id}`}
          aria-label={uiText("{0} {1} sub-{2} of {3}", [expanded ? "Hide" : "Show", total, total === 1 ? one : many, agent.name])} onClick={() => toggle(agent.id)}>{uiText(total)}<Chevron /></button> : undefined} />
      </div>
      {kids.length > 0 && <div className={depth === 0 ? "agt__level" : "agt__below"} role="group" id={`${ids}-${agent.id}`}>
        {uiText(kids.map((child, position) => renderBranch(child, depth + 1, position)))}
      </div>}
    </div>;
  }

  return <div className={`agt${className ? ` ${className}` : ""}`} ref={setHost} data-wide={wide ? "" : undefined} style={{ ...(width ? {} : { visibility: "hidden" }), ...(wide ? { "--agt-card-w": `${cardWidth}px` } : {}) } as CSSProperties}>
    <AgentBar root={root} title={uiText(title)} noun={noun} formatCost={formatCost} showCost={showCost} onResolve={onResolve} extra={barExtra} />
    <div className="agt__tree" ref={treeRef} role="tree" aria-label={uiText(title)}>
      <svg className="agt__links" ref={linksRef} aria-hidden="true" />
      {uiText(renderBranch(shown, 0, 0))}
      <svg className="agt__links agt__dots" ref={dotsRef} aria-hidden="true" style={{ zIndex: 2 }} />
    </div>
  </div>;
}
