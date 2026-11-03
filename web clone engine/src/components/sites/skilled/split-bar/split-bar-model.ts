/**
 * Pure maths of the split bar: shares, how the highlighted part widens and the rest give way, which label fits where, and where the labels that do not fit
 * stand on their lane. No DOM, so it runs against the numbers recorded from the public UIArc preview (docs/research/uiarc-split-bar) in node.
 */

export interface SplitSegment {
  id: string;
  /** full name: legend, readout, screen readers */
  label: string;
  /** shorter name for the labels on the bar itself (defaults to `label`) */
  short?: string;
  value: number;
  /** any CSS colour; defaults to the chart ramp by position */
  color?: string;
}

/** A highlighted part widens by this much of the bar, or by what its own label needs when that is more (measured: 24.8 % -> 29.3 %). */
export const WIDEN = 0.045;
/** Pixels a segment needs beyond its name and share text before the name is shown inside (fitted over eight widths: 31.5..42.2, measured 34.8 on a widened part). */
export const NAME_EXTRA = 35;
/** Pixels before even the share fits inside (51.1 px is too small, 58.0 px fits). */
export const SHARE_MIN = 56;
/** A widened part never takes more than this much of the bar for its label alone. */
export const WIDEN_CAP = 0.6;
/** Outside labels keep this far apart and this far from the bar's end. */
export const OUTSIDE_GAP = 16;
export const OUTSIDE_EDGE = 4;
/** Height of the lane under the bar when something stands in it, and where a label's centre line sits (from the recorded paths). */
export const LANE_HEIGHT = 40;
export const LEADER_END_Y = 15;

export interface Share { id: string; label: string; short: string; value: number; share: number; index: number; color?: string }

const usable = (value: number) => Number.isFinite(value) && value > 0;

/** Every segment that has something to show, in order, with its share of the visible total (hidden ones count as nothing). */
export function sharesOf(segments: readonly SplitSegment[], hidden: ReadonlySet<string>): { shares: Share[]; total: number } {
  const total = segments.reduce((sum, segment) => (usable(segment.value) && !hidden.has(segment.id) ? sum + segment.value : sum), 0);
  const shares: Share[] = [];
  segments.forEach((segment, index) => {
    if (!usable(segment.value)) return;
    shares.push({ id: segment.id, label: segment.label, short: segment.short ?? segment.label, value: segment.value, share: hidden.has(segment.id) || total <= 0 ? 0 : segment.value / total, index, color: segment.color });
  });
  return { shares, total };
}

export interface Span { id: string; left: number; right: number }

/**
 * Where every part starts and ends, as fractions of the bar. A hidden part (share 0) keeps its place with no width. The highlighted part grows to
 * `max(share + 4.5 %, what its label needs)` and the others give way in proportion, so the bar stays whole.
 */
export function layoutSpans(shares: readonly Share[], highlightId: string | null, neededPx: (id: string) => number, barPx: number): Span[] {
  const target = highlightId === null ? undefined : shares.find(item => item.id === highlightId && item.share > 0);
  let grown = target?.share ?? 0, scale = 1;
  if (target && target.share < 1) {
    const need = barPx > 0 ? Math.min(WIDEN_CAP, neededPx(target.id) / barPx) : 0;
    grown = Math.min(1 - 1e-6, Math.max(target.share + WIDEN, need));
    scale = (1 - grown) / (1 - target.share);
  }
  let at = 0;
  return shares.map(item => {
    const width = target && item.id === target.id ? grown : item.share * scale;
    const span = { id: item.id, left: at, right: at + width };
    at += width;
    return span;
  });
}

export type LabelMode = "name" | "share" | "outside";
/** Which label a part of `widthPx` shows: name and share, the share alone, or none (it stands on the lane under the bar). */
export function labelMode(widthPx: number, nameWidth: number, shareWidth: number): LabelMode {
  if (widthPx >= nameWidth + shareWidth + NAME_EXTRA) return "name";
  if (widthPx >= SHARE_MIN) return "share";
  return "outside";
}

export interface Placed { id: string; anchor: number; width: number; left: number }
/**
 * The labels on the lane: each wants to centre under its part, they are pushed apart (never overlapping, `OUTSIDE_GAP` between) and kept inside the
 * bar. Forward pass pushes right, backward pass pulls back what ran past the end.
 */
export function placeOutside(items: readonly { id: string; anchor: number; width: number }[], barPx: number): Placed[] {
  const sorted = [...items].sort((a, b) => a.anchor - b.anchor);
  const placed: Placed[] = sorted.map(item => ({ ...item, left: item.anchor - item.width / 2 }));
  const limit = (item: Placed) => Math.max(0, barPx - OUTSIDE_EDGE - item.width);
  for (let i = 0; i < placed.length; i++) {
    placed[i].left = Math.max(0, Math.min(placed[i].left, limit(placed[i])));
    if (i > 0) placed[i].left = Math.max(placed[i].left, placed[i - 1].left + placed[i - 1].width + OUTSIDE_GAP);
  }
  for (let i = placed.length - 1; i >= 0; i--) {
    const room = i === placed.length - 1 ? limit(placed[i]) : placed[i + 1].left - OUTSIDE_GAP - placed[i].width;
    placed[i].left = Math.min(placed[i].left, room);
  }
  return placed;
}

/** The S-shaped leader from the part's centre on the bar's lower edge to the label's centre line, as recorded: `M ax 0 C ax 10 lx 6 lx 15`. */
export const leaderPath = (anchor: number, labelCentre: number) => `M${r1(anchor)} 0 C${r1(anchor)} 10 ${r1(labelCentre)} 6 ${r1(labelCentre)} ${LEADER_END_Y}`;
const r1 = (value: number) => Math.round(value * 10) / 10;

/** "41.6%": shares always read with one decimal. */
export const shareText = (share: number) => `${(Math.round(share * 1000) / 10).toFixed(1)}%`;

/** Next visible part for the arrow keys; `null` highlight starts from the first (or last) one. Parts with no width are skipped. */
export function stepHighlight(visible: readonly string[], current: string | null, key: "next" | "previous" | "first" | "last"): string | null {
  if (visible.length === 0) return null;
  if (key === "first") return visible[0];
  if (key === "last") return visible[visible.length - 1];
  const at = current === null ? -1 : visible.indexOf(current);
  if (key === "next") return visible[at < 0 ? 0 : Math.min(visible.length - 1, at + 1)];
  return visible[at < 0 ? visible.length - 1 : Math.max(0, at - 1)];
}

/**
 * Which part the pointer is over. The highlighted part keeps the pointer while it is inside the widened part (so the edges do not flicker at the
 * seam); otherwise the plain, un-widened layout decides.
 */
export function hitTest(x: number, base: readonly Span[], widened: readonly Span[], current: string | null): string | null {
  if (current !== null) {
    const span = widened.find(item => item.id === current);
    if (span && span.right > span.left && x >= span.left && x <= span.right) return current;
  }
  const hit = base.find(item => item.right > item.left && x >= item.left && x <= item.right);
  return hit?.id ?? null;
}
