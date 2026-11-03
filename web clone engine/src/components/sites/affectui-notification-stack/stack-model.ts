/**
 * The pure rules of the Notification Stack: how cards sit behind each other, how tall the stack is, which card is in front, and what
 * happens to the card that was dismissed. Rebuilt from the public preview of affectUI's Notification Stack
 * (docs/research/notification-stack): three cards are visible, each one 12 px lower and 5% smaller than the one before; only the card in
 * front has content and can be reached; a dismissed card slides 40 px to the right and fades while the next one moves up.
 */
export type NoticeTone = "neutral" | "success" | "error" | "attention";
export type NoticePattern = "rings" | "grid" | "rays";

export interface NoticeAction {
  label: string;
  href?: string;
  onClick?: () => void;
  /** Opens `href` in a new tab and draws the small arrow. */
  external?: boolean;
  /** The notice stays after the action runs (by default it is dismissed). */
  keep?: boolean;
}

export interface Notice {
  id: string;
  /** The small label at the top: "Failed", "Done", "Needs you". */
  badge: string;
  title: string;
  text?: string;
  action?: NoticeAction;
  pattern?: NoticePattern;
  /** Colors the badge and the dot of the pattern, so a failure is not mistaken for a note. */
  tone?: NoticeTone;
  /** The notice goes away by itself after this long once it is in front (paused while it is hovered or focused). Without it, it stays. */
  expireMs?: number;
}

export type DismissReason = "close" | "action" | "expired" | "escape" | "all";

/** How many cards show behind the front one, and how far each steps down and back. */
export const VISIBLE_BEHIND = 2;
export const STEP_Y = 12;
export const STEP_SCALE = 0.05;
/** How long a dismissed card takes to leave, in ms (the stylesheet's transition must match). */
export const LEAVE_MS = 320;

/** The transform of the card at `depth` (0 is the front). Cards deeper than the visible ones sit where the last visible one does. */
export function depthTransform(depth: number): { y: number; scale: number } {
  const shown = Math.min(depth, VISIBLE_BEHIND);
  return { y: shown * STEP_Y, scale: Math.round((1 - shown * STEP_SCALE) * 100) / 100 };
}
export const depthCss = (depth: number) => { const { y, scale } = depthTransform(depth); return `translateY(${y}px) scale(${scale})`; };

/** The height of the stack: the front card plus the strips of the cards behind it that show. */
export function stackHeight(frontHeight: number, count: number): number {
  return Math.round(frontHeight + Math.min(Math.max(0, count - 1), VISIBLE_BEHIND) * STEP_Y);
}

/** The notices to draw: the ones that are still there, then (below them, leaving) the ones that were just dismissed. */
export function drawn(notices: readonly Notice[], leaving: readonly Notice[]): { notice: Notice; depth: number; leaving: boolean }[] {
  const now = new Set(notices.map(notice => notice.id));
  return [
    ...notices.map((notice, depth) => ({ notice, depth, leaving: false })),
    ...leaving.filter(notice => !now.has(notice.id)).map(notice => ({ notice, depth: 0, leaving: true })),
  ];
}

/** What a screen reader hears when a card comes to the front. */
export const announcement = (notice: Notice) => `${notice.badge}: ${notice.title}.${notice.text ? ` ${notice.text}` : ""}`;

/** Adds a notice in front of the ones waiting; an error or something that needs the person goes before the quiet ones. */
export function enqueue<T extends Notice>(current: readonly T[], incoming: readonly T[], max = 12): T[] {
  const known = new Set(current.map(notice => notice.id));
  const fresh = incoming.filter(notice => !known.has(notice.id));
  if (!fresh.length) return [...current];
  const loud = (notice: T) => notice.tone === "error" || notice.tone === "attention";
  const next = [...fresh.filter(loud), ...current.filter(loud), ...fresh.filter(notice => !loud(notice)), ...current.filter(notice => !loud(notice))];
  // The oldest quiet ones are dropped first when there are too many
  while (next.length > max) {
    const index = [...next].reverse().findIndex(notice => !loud(notice));
    next.splice(index < 0 ? next.length - 1 : next.length - 1 - index, 1);
  }
  return next;
}
