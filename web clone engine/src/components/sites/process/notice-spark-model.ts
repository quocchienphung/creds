import type { Notice, NoticeTone } from "../affectui-notification-stack/stack-model.ts";

/**
 * Where a run notice shows on the map. Each block with something to say carries one small blinking star beside it; the star opens that
 * block's notices in a card next to the block. Pure rules (no React): which notices belong to which block, which tone the star has, where the
 * star sits on the screen (it is pinned to the edge of the map when its block is out of view), and where the card opens.
 */
export interface ScreenBox { x: number; y: number; w: number; h: number }
export interface ScreenSize { w: number; h: number }
export interface ScreenInset { left?: number; right?: number; top?: number; bottom?: number }
export interface Placed<T extends Notice> { blockId: string; notices: T[] }

/** The size of the star's button and the room kept around it and the card. */
export const SPARK = 28;
export const EDGE = 8;
export const POPOVER_WIDTH = 344;
/** A card is about this tall (a title, two lines, a button); the stack under it adds a few strips. Used to choose above or below. */
export const POPOVER_HEIGHT = 230;
export const POPOVER_GAP = 14;

/** Groups notices by the block they are about, in the order the blocks first appear; a notice about the run itself belongs to the first block. */
export function groupByBlock<T extends Notice & { blockId?: string }>(notices: readonly T[], fallbackId: string, exists: (id: string) => boolean = () => true): Placed<T>[] {
  const groups = new Map<string, T[]>();
  for (const notice of notices) {
    const id = notice.blockId && exists(notice.blockId) ? notice.blockId : fallbackId;
    groups.set(id, [...(groups.get(id) ?? []), notice]);
  }
  return [...groups].map(([blockId, items]) => ({ blockId, notices: items }));
}

const weight: Record<NoticeTone, number> = { error: 3, attention: 2, neutral: 1, success: 0 };
/** A star is as loud as the loudest notice behind it: a failure is red even if three quiet "done" notices came after it. */
export function sparkTone(notices: readonly Notice[]): NoticeTone {
  let best: NoticeTone = "success", found = false;
  for (const notice of notices) {
    const tone = notice.tone ?? "neutral";
    if (!found || weight[tone] > weight[best]) { best = tone; found = true; }
  }
  return found ? best : "neutral";
}

/** A failure (or something that needs the person) stays after it has been opened; a quiet notice is gone once it has been read. */
export const outlastsReading = (notice: Notice) => notice.tone === "error" || notice.tone === "attention";

/** Whether the star should still blink: something behind it has not been opened yet. */
export const isUnseen = (notices: readonly Notice[], seen: ReadonlySet<string>) => notices.some(notice => !seen.has(notice.id));

const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), Math.max(low, high));

/**
 * The star's centre: just outside the top right corner of its block (inside it, it would cover the status badge). A block that is out of view keeps its star at the nearest edge of the map
 * (inside whatever the page keeps for its own controls), so a block that finishes off screen is still noticed.
 */
export function placeSpark(block: ScreenBox, viewport: ScreenSize, inset: ScreenInset = {}): { x: number; y: number; pinned: boolean } {
  const want = { x: block.x + block.w + 6, y: block.y - 6 };
  const half = SPARK / 2 + EDGE;
  const x = clamp(want.x, (inset.left ?? 0) + half, viewport.w - (inset.right ?? 0) - half);
  const y = clamp(want.y, (inset.top ?? 0) + half, viewport.h - (inset.bottom ?? 0) - half);
  return { x, y, pinned: x !== want.x || y !== want.y };
}

export interface PopoverPlace { left: number; width: number; top?: number; bottom?: number; side: "right" | "left" | "below" | "above" }

/**
 * Where the card opens. Beside the block, on the right if there is room (the left otherwise), level with its top; when the map is too
 * narrow for that (a phone), under the block, or above it if there is no room below. `anchor` is the block, or the star when the star is
 * pinned to an edge. The card keeps clear of the map's edges and of `inset`.
 */
export function placePopover(anchor: ScreenBox, viewport: ScreenSize, inset: ScreenInset = {}, height = POPOVER_HEIGHT): PopoverPlace {
  const low = (inset.left ?? 0) + EDGE, high = viewport.w - (inset.right ?? 0) - EDGE;
  const width = Math.max(220, Math.min(POPOVER_WIDTH, high - low));
  const top = (inset.top ?? 0) + EDGE, bottom = viewport.h - (inset.bottom ?? 0) - EDGE;
  const right = anchor.x + anchor.w, below = anchor.y + anchor.h;
  const beside = (side: "right" | "left"): PopoverPlace => {
    const left = side === "right" ? right + POPOVER_GAP : anchor.x - POPOVER_GAP - width;
    // Level with the top of the block; kept inside the map, and hung from the bottom when it would not fit
    const wanted = anchor.y - 8;
    return wanted + height <= bottom ? { left, width, top: Math.max(top, wanted), side } : { left, width, bottom: Math.max(EDGE, viewport.h - Math.min(bottom, below + 8)), side };
  };
  if (right + POPOVER_GAP + width <= high) return beside("right");
  if (anchor.x - POPOVER_GAP - width >= low) return beside("left");
  const left = clamp(anchor.x + anchor.w / 2 - width / 2, low, high - width);
  if (below + 12 + height <= bottom || anchor.y - 12 - height < top) return { left, width, top: Math.min(Math.max(top, below + 12), Math.max(top, bottom - height)), side: "below" };
  return { left, width, bottom: Math.max(EDGE, viewport.h - (anchor.y - 12)), side: "above" };
}
