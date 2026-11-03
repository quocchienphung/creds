import type { ProcessNode } from "./process-model.ts";

/**
 * Geometry of the Process map: where each block sits, how two blocks are joined, and how the whole map fits a view.
 * The map grows out of one block in the middle: its branches fan out around it in rings, each branch taking a slice of the
 * circle as wide as the number of blocks it holds. A block the person dragged keeps the place they gave it; every other block
 * is placed by this layout, and nudged apart where two would overlap. Pure and deterministic: the same plan always gives the
 * same map. Units are map units (one unit is one pixel at zoom 1); a position is the center of a block.
 */
export interface Size { w: number; h: number }
export interface Point { x: number; y: number }
export interface Box { x: number; y: number; w: number; h: number }

export const BLOCK: Size = { w: 232, h: 132 };
export const GAP = 36;
/** The rings are ellipses, wider than tall: blocks are wider than tall and a screen is too, so the map fills it at a readable zoom. */
const FIRST_RING = 290;
const RING_STEP = 220;
const ASPECT_X = 1.25;
const ASPECT_Y = 0.84;
const SEPARATE_PASSES = 60;

const leavesOf = (node: ProcessNode): number => node.children.length ? node.children.reduce((sum, child) => sum + leavesOf(child), 0) : 1;
/** A tall screen (a phone held upright) gets rings taller than wide, so the map reads top to bottom and not off both sides. */
export type Shape = "wide" | "tall";
const polar = (radius: number, degrees: number, shape: Shape): Point => {
  const angle = degrees * Math.PI / 180, across = shape === "tall" ? 0.62 : ASPECT_X, down = shape === "tall" ? 1.3 : ASPECT_Y;
  return { x: Math.round(radius * across * Math.sin(angle)), y: Math.round(-radius * down * Math.cos(angle)) };
};

/** The blocks' centers. `sizes` are the measured sizes of the blocks that are on screen; the others use `BLOCK`. */
export function layoutMap(root: ProcessNode, sizes: ReadonlyMap<string, Size> = new Map(), shape: Shape = "wide"): Map<string, Point> {
  const centers = new Map<string, Point>();
  const pinned = new Set<string>();
  const nodes: ProcessNode[] = [];

  const place = (node: ProcessNode, depth: number, from: number, to: number) => {
    nodes.push(node);
    const middle = (from + to) / 2;
    centers.set(node.id, depth === 0 ? { x: 0, y: 0 } : polar(FIRST_RING + RING_STEP * (depth - 1), middle, shape));
    if (node.pos) { centers.set(node.id, { ...node.pos }); pinned.add(node.id); }
    const count = node.children.length;
    if (!count) return;
    // The root's branches go all the way round (a lone branch to the right, two to the left and right, three or more
    // evenly with the first one on top); deeper branches share the slice of the block they grow from.
    let start = from, end = to;
    if (depth === 0) { start = count === 1 ? -90 : count === 2 ? 0 : -180 / count; end = start + 360; }
    const total = node.children.reduce((sum, child) => sum + leavesOf(child), 0);
    let cursor = start;
    for (const child of node.children) {
      const share = (end - start) * leavesOf(child) / total;
      place(child, depth + 1, cursor, cursor + share);
      cursor += share;
    }
  };
  place(root, 0, 0, 360);

  // Where two blocks overlap, the ones that are not pinned move apart along the shorter way out.
  const size = (id: string) => sizes.get(id) ?? BLOCK;
  for (let pass = 0; pass < SEPARATE_PASSES; pass += 1) {
    let moved = false;
    for (let i = 0; i < nodes.length; i += 1) for (let j = i + 1; j < nodes.length; j += 1) {
      const a = nodes[i], b = nodes[j];
      if (pinned.has(a.id) && pinned.has(b.id)) continue;
      const pa = centers.get(a.id)!, pb = centers.get(b.id)!, sa = size(a.id), sb = size(b.id);
      const overlapX = (sa.w + sb.w) / 2 + GAP - Math.abs(pa.x - pb.x), overlapY = (sa.h + sb.h) / 2 + GAP - Math.abs(pa.y - pb.y);
      if (overlapX <= 0 || overlapY <= 0) continue;
      moved = true;
      const alongX = overlapX < overlapY;
      const sign = (alongX ? pb.x - pa.x : pb.y - pa.y) >= 0 ? 1 : -1;
      const push = (alongX ? overlapX : overlapY) / (pinned.has(a.id) || pinned.has(b.id) ? 1 : 2);
      const shift = (id: string, amount: number) => { const point = centers.get(id)!; centers.set(id, alongX ? { x: Math.round(point.x + amount), y: point.y } : { x: point.x, y: Math.round(point.y + amount) }); };
      if (!pinned.has(a.id)) shift(a.id, -sign * push);
      if (!pinned.has(b.id)) shift(b.id, sign * push);
    }
    if (!moved) break;
  }
  return centers;
}

export const boxOf = (center: Point, size: Size): Box => ({ x: center.x - size.w / 2, y: center.y - size.h / 2, w: size.w, h: size.h });

/** The smallest box that holds every box. */
export function boundsOf(boxes: readonly Box[]): Box {
  if (!boxes.length) return { x: 0, y: 0, w: 0, h: 0 };
  const left = Math.min(...boxes.map(box => box.x)), top = Math.min(...boxes.map(box => box.y));
  return { x: left, y: top, w: Math.max(...boxes.map(box => box.x + box.w)) - left, h: Math.max(...boxes.map(box => box.y + box.h)) - top };
}

export interface View { x: number; y: number; scale: number }
export const MIN_SCALE = 0.25;
export const MAX_SCALE = 2;
export const clampScale = (scale: number) => Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));

/** The pan and zoom that show every box inside a viewport with `padding` around them (never zoomed in past 1). */
export function fitView(boxes: readonly Box[], viewport: Size, padding = 48, inset: { left?: number; right?: number; top?: number; bottom?: number } = {}, floor = MIN_SCALE): View {
  const bounds = boundsOf(boxes);
  const room = { w: Math.max(80, viewport.w - padding * 2 - (inset.left ?? 0) - (inset.right ?? 0)), h: Math.max(80, viewport.h - padding * 2 - (inset.top ?? 0) - (inset.bottom ?? 0)) };
  // Never smaller than `floor`: a map too big for the view is centered and panned, not shrunk until it cannot be read.
  const scale = clampScale(Math.max(floor, Math.min(1, room.w / Math.max(1, bounds.w), room.h / Math.max(1, bounds.h))));
  const centerX = (viewport.w + (inset.left ?? 0) - (inset.right ?? 0)) / 2, centerY = (viewport.h + (inset.top ?? 0) - (inset.bottom ?? 0)) / 2;
  return { scale, x: centerX - (bounds.x + bounds.w / 2) * scale, y: centerY - (bounds.y + bounds.h / 2) * scale };
}

/** Zooms around a point of the view (the pointer), so the map under it stays put. */
export function zoomAt(view: View, factor: number, around: Point): View {
  const scale = clampScale(view.scale * factor);
  const ratio = scale / view.scale;
  return { scale, x: around.x - (around.x - view.x) * ratio, y: around.y - (around.y - view.y) * ratio };
}

export type Side = "top" | "right" | "bottom" | "left";
export interface Edge { d: string; from: Point; to: Point; fromSide: Side; toSide: Side; length: number; /** The middle of the curve: where a label sits. */ mid: Point }

const OPPOSITE: Record<Side, Side> = { top: "bottom", bottom: "top", left: "right", right: "left" };
export const anchorOf = (box: Box, side: Side): Point => side === "top" ? { x: box.x + box.w / 2, y: box.y } : side === "bottom" ? { x: box.x + box.w / 2, y: box.y + box.h } : side === "left" ? { x: box.x, y: box.y + box.h / 2 } : { x: box.x + box.w, y: box.y + box.h / 2 };

/** The side of `from` that faces `to`: across when the blocks are mostly side by side, up or down when they are mostly stacked. */
export function facingSide(from: Box, to: Box): Side {
  const dx = (to.x + to.w / 2) - (from.x + from.w / 2), dy = (to.y + to.h / 2) - (from.y + from.h / 2);
  return Math.abs(dx) / (from.w + to.w) > Math.abs(dy) / (from.h + to.h) ? (dx >= 0 ? "right" : "left") : (dy >= 0 ? "bottom" : "top");
}

/**
 * The curve that joins a block to the one it hands work to: out of the side that faces it, into the side that faces back.
 * `bend` pushes the middle of the curve sideways (to the right of the way it travels when positive), so a connection drawn on top
 * of the tree does not lie on the tree's own curve.
 */
export function edgeBetween(parent: Box, child: Box, bend = 0): Edge {
  const fromSide = facingSide(parent, child), toSide = OPPOSITE[fromSide];
  const from = anchorOf(parent, fromSide), to = anchorOf(child, toSide);
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const reach = Math.max(40, Math.min(160, length / 2));
  const lead = (point: Point, side: Side): Point => ({ x: point.x + (side === "right" ? reach : side === "left" ? -reach : 0), y: point.y + (side === "bottom" ? reach : side === "top" ? -reach : 0) });
  const push = length ? { x: -(to.y - from.y) / length * bend, y: (to.x - from.x) / length * bend } : { x: 0, y: 0 };
  const c1 = lead(from, fromSide), c2 = lead(to, toSide);
  c1.x += push.x; c1.y += push.y; c2.x += push.x; c2.y += push.y;
  const mid = { x: Math.round((from.x + 3 * c1.x + 3 * c2.x + to.x) / 8), y: Math.round((from.y + 3 * c1.y + 3 * c2.y + to.y) / 8) };
  return { d: `M ${from.x} ${from.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${to.x} ${to.y}`, from, to, fromSide, toSide, length, mid };
}

/** The block under a point of the map (the topmost in `ids` order), ignoring `except`; null over empty canvas. */
export function blockAt(point: Point, boxes: ReadonlyMap<string, Box>, except?: string): string | null {
  let found: string | null = null;
  for (const [id, box] of boxes) if (id !== except && point.x >= box.x && point.x <= box.x + box.w && point.y >= box.y && point.y <= box.y + box.h) found = id;
  return found;
}

/** A free place for a new block next to `from` on `side`, stepping away from blocks that are already there. */
export function freeSpot(taken: readonly Box[], from: Box, side: Side, size: Size = BLOCK): Point {
  const along = side === "left" || side === "right";
  const step = along ? size.h + GAP : size.w + GAP;
  const reachOut = along ? (from.w + size.w) / 2 + 84 : (from.h + size.h) / 2 + 84;
  const dir = side === "right" || side === "bottom" ? 1 : -1;
  const center = { x: from.x + from.w / 2, y: from.y + from.h / 2 };
  for (let attempt = 0; attempt < 24; attempt += 1) {
    // 0, +1, -1, +2, -2 … steps sideways from the straight-out spot.
    const offset = attempt === 0 ? 0 : (attempt % 2 ? 1 : -1) * Math.ceil(attempt / 2) * step;
    const point = along ? { x: center.x + dir * reachOut, y: center.y + offset } : { x: center.x + offset, y: center.y + dir * reachOut };
    const candidate = boxOf(point, size);
    const clash = taken.some(box => candidate.x < box.x + box.w + GAP / 2 && candidate.x + candidate.w + GAP / 2 > box.x && candidate.y < box.y + box.h + GAP / 2 && candidate.y + candidate.h + GAP / 2 > box.y);
    if (!clash) return { x: Math.round(point.x), y: Math.round(point.y) };
  }
  return { x: Math.round(center.x + dir * reachOut * 2), y: Math.round(center.y) };
}
