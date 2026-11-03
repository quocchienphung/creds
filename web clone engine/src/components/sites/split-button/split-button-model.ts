/**
 * Split button, the parts that are not React: how a label morphs, the menu's placement, and the numbers measured from the public preview of
 * UIArc's Split button (docs/research/split-button/README.md). Pure, so node can test it.
 */

export interface Glyph { id: number; char: string; state: "in" | "stay" | "out" }

/**
 * The letters of the label after it changed. The longest shared start stays put; the rest of the old label leaves (`out`, taken out of the
 * flow so the width can spring) and the rest of the new one enters (`in`). Measured: "Publish" to "Published" keeps seven letters and brings in two.
 */
export function morphGlyphs(previous: readonly Glyph[], next: string, nextId: () => number): Glyph[] {
  const live = previous.filter(glyph => glyph.state !== "out");
  const chars = Array.from(next);
  let keep = 0;
  while (keep < live.length && keep < chars.length && live[keep].char === chars[keep]) keep += 1;
  const stay = live.slice(0, keep).map(glyph => glyph.state === "stay" ? glyph : { ...glyph, state: "stay" as const });
  const leaving = live.slice(keep).map(glyph => ({ ...glyph, state: "out" as const }));
  const entering = chars.slice(keep).map(char => ({ id: nextId(), char, state: "in" as const }));
  // letters still on their way out keep going: they are only taken away by the component when their fade has ended
  const stillLeaving = previous.filter(glyph => glyph.state === "out");
  return [...stay, ...entering, ...leaving, ...stillLeaving];
}
export const textOf = (glyphs: readonly Glyph[]) => glyphs.filter(glyph => glyph.state !== "out").map(glyph => glyph.char).join("");

/** Measured, in seconds and px. */
export const MORPH = {
  /** The width of the label follows its content with an overdamped spring (stiffness 340, damping 48, ratio 1.3). It starts a little after the new letters appear when growing. */
  width: { type: "spring" as const, stiffness: 340, damping: 48, mass: 1 },
  growDelay: 0.05,
  /** New letters rise from a 4px blur: opacity over 224ms, blur over 264ms, expo-out, each letter ~9ms after the one before. */
  enter: { opacity: 0.224, blur: 0.264, stagger: 0.009, blurPx: 4 },
  /** Old letters fade fast (about 100ms) while blurring to 2px. */
  leave: { duration: 0.1, blurPx: 2 },
  /** How long a result label ("Published") stays before the main label returns. */
  resultMs: 2200,
};
export const MENU = {
  /** `--ease-spring` of the source: linear() over .58s. Used for the chevron and the press release. */
  durationSpring: 0.58,
  easeSpring: "linear(0,.0213,.0739,.1443,.2235,.305,.3849,.4606,.5305,.594,.6508,.7011,.7452,.7836,.8168,.8454,.8699,.8907,.9084,.9234,.9361,.9467,.9557,.9632,.9694,.9747,.979,.9826,.9857,.9882,.9902,.992,.9934,.9946,.9955,.9963,1)",
  /** The menu sits 4px under the chevron button, aligned to the end of the group, 12px from the viewport edges. */
  sideOffset: 4, collision: 12, itemStagger: 0.035, maxStaggered: 4, closeMs: 130,
};

export interface Rect { left: number; top: number; right: number; bottom: number; width: number; height: number }
export interface MenuPlacement { x: number; y: number; side: "top" | "bottom"; maxHeight: number }
/** End-aligned under the anchor; flipped above it when it does not fit below and there is more room above; kept inside the viewport. */
export function placeMenu(anchor: Rect, menu: { width: number; height: number }, viewport: { width: number; height: number }, offset = MENU.sideOffset, padding = MENU.collision): MenuPlacement {
  const below = viewport.height - anchor.bottom - offset - padding, above = anchor.top - offset - padding;
  const side = menu.height > below && above > below ? "top" : "bottom";
  const room = side === "top" ? above : below;
  const height = Math.min(menu.height, Math.max(room, 0));
  const y = side === "top" ? anchor.top - offset - height : anchor.bottom + offset;
  const x = Math.min(Math.max(padding, anchor.right - menu.width), Math.max(padding, viewport.width - padding - menu.width));
  return { x, y, side, maxHeight: Math.max(room, 0) };
}
/** Where the menu starts from before it settles: 5px toward the button, scaled to .97 (the source's --menu-y). */
export const menuStart = (side: "top" | "bottom") => ({ x: 0, y: side === "top" ? 5 : -5, scale: 0.97 });

/** The item to highlight after an arrow key, looping at the ends and skipping disabled items. */
export function nextEnabled(enabled: readonly boolean[], from: number, step: 1 | -1): number {
  const count = enabled.length;
  if (!count || !enabled.some(Boolean)) return -1;
  let index = from;
  for (let i = 0; i < count; i += 1) { index = (index + step + count) % count; if (enabled[index]) return index; }
  return -1;
}
/** Typeahead: the next enabled item whose label starts with what was typed, searching after the current one. */
export function matchTyped(labels: readonly string[], enabled: readonly boolean[], typed: string, from: number): number {
  const needle = typed.toLowerCase();
  for (let i = 1; i <= labels.length; i += 1) { const index = (from + i + labels.length) % labels.length; if (enabled[index] && labels[index].toLowerCase().startsWith(needle)) return index; }
  return -1;
}
