/**
 * Cookie consent, the parts that are not React: categories, what is stored, and the numbers measured from the public preview of
 * UIArc's Cookie consent (docs/research/cookie-consent/README.md). Pure, so node can test it.
 */
export interface CookieCategory {
  id: string;
  label: string;
  description?: string;
  /** Always on: shown as "Always on" instead of a switch. */
  required?: boolean;
  defaultEnabled?: boolean;
}
export type CookieConsentValue = Record<string, boolean>;
export type CookieConsentAction = "accept-all" | "reject-all" | "save" | "reset";
export type ConsentFace = "bar" | "panel" | "chip";
export type ConsentPosition = "bottom" | "bottom-left" | "bottom-right";
export interface StoredConsent { value: CookieConsentValue; version: string; updatedAt: string }

export const defaultCookieCategories: CookieCategory[] = [
  { id: "necessary", label: "Strictly necessary", description: "Sign-in, security, and your cart. The site can't work without these.", required: true },
  { id: "preferences", label: "Preferences", description: "Remember your language, region, and display settings." },
  { id: "analytics", label: "Analytics", description: "Count visits and see which pages help, only in aggregate." },
  { id: "marketing", label: "Marketing", description: "Measure campaigns and show relevant ads on other sites." },
];

export interface CookieConsentLabels {
  message: string; customize: string; acceptAll: string; rejectAll: string; save: string;
  preferencesTitle: string; preferencesDescription: string; reopen: string; alwaysOn: string; close: string;
}
export const defaultLabels: CookieConsentLabels = {
  message: "We use essential cookies to run this site. With your OK, we'd also use optional ones to remember settings and learn what helps.",
  customize: "Customize", acceptAll: "Accept all", rejectAll: "Reject all", save: "Save choices",
  preferencesTitle: "Cookie preferences", preferencesDescription: "Choose which optional cookies we can use. You can change this any time.",
  reopen: "Cookie preferences", alwaysOn: "Always on", close: "Close preferences",
};

/** Measured from the public preview, in px. */
export const SIZE = { barMax: 660, panelMax: 420, chip: 44, barRadius: 22, panelRadius: 26, chipRadius: 22, edge: 16, stackBelow: 560, enterRise: 24, enterScale: 0.98 };

/** Springs fitted to the recorded morphs (mass 1). Growing is slightly bouncy (ratio 0.96), shrinking is critically damped, so the surface never overshoots when it folds. */
export const SPRING = {
  grow: { type: "spring" as const, stiffness: 120, damping: 21, mass: 1 },
  shrink: { type: "spring" as const, stiffness: 190, damping: 27.6, mass: 1 },
  enter: { type: "spring" as const, stiffness: 190, damping: 33, mass: 1 },
  thumb: { type: "spring" as const, stiffness: 315, damping: 35.5, mass: 1 },
};
/** The faces share one expo-out curve. The outgoing one starts with the morph; the incoming one 31ms later and takes longer (blur trails opacity). */
export const FADE = {
  ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
  /** The outgoing face decays exponentially (tau about 18ms): measured, 99% gone in ~70ms. */
  out: { delay: 0, duration: 0.1 },
  outEase: (t: number) => (1 - Math.exp(-5.5 * t)) / (1 - Math.exp(-5.5)),
  inOpacity: { delay: 0.031, duration: 0.224 },
  inBlur: { delay: 0.031, duration: 0.264 },
  enterOpacity: { delay: 0, duration: 0.13 },
  blur: 4,
};

export function initialValue(categories: readonly CookieCategory[]): CookieConsentValue {
  return Object.fromEntries(categories.map(category => [category.id, !!category.required || !!category.defaultEnabled]));
}
/** Required categories are always on, unknown ids are dropped, missing ones are off. */
export function normalizeValue(value: CookieConsentValue | null | undefined, categories: readonly CookieCategory[]): CookieConsentValue {
  return Object.fromEntries(categories.map(category => [category.id, category.required ? true : !!value?.[category.id]]));
}
export const allowAll = (categories: readonly CookieCategory[]): CookieConsentValue => Object.fromEntries(categories.map(category => [category.id, true]));
export const rejectAll = (categories: readonly CookieCategory[]): CookieConsentValue => normalizeValue({}, categories);
export function optionalCount(value: CookieConsentValue, categories: readonly CookieCategory[]) {
  const optional = categories.filter(category => !category.required);
  return { allowed: optional.filter(category => value[category.id]).length, total: optional.length };
}
/** The hidden text Save is described by, e.g. "2 of 3 optional categories allowed". */
export function summaryText(value: CookieConsentValue, categories: readonly CookieCategory[]) {
  const { allowed, total } = optionalCount(value, categories);
  return `${allowed} of ${total} optional ${total === 1 ? "category" : "categories"} allowed`;
}

interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }
const defaultStorage = (): StorageLike | null => { try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; } };

/** A saved choice, or null when there is none, it is unreadable, or it was saved for another version. Safe on the server. */
export function readCookieConsent(storageKey: string, version = "1", storage: StorageLike | null = defaultStorage()): StoredConsent | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredConsent>;
    if (!parsed || typeof parsed !== "object" || parsed.version !== version || !parsed.value || typeof parsed.value !== "object" || typeof parsed.updatedAt !== "string") return null;
    const value = Object.fromEntries(Object.entries(parsed.value).filter(([, allowed]) => typeof allowed === "boolean")) as CookieConsentValue;
    return { value, version: parsed.version, updatedAt: parsed.updatedAt };
  } catch { return null; }
}
export function writeCookieConsent(storageKey: string, stored: StoredConsent | null, storage: StorageLike | null = defaultStorage()) {
  if (!storage) return;
  try { if (stored) storage.setItem(storageKey, JSON.stringify(stored)); else storage.removeItem(storageKey); } catch { /* private mode or full: the choice still applies for this visit */ }
}

/** Where the surface sits for a face: its width, the radius, and its horizontal shift inside the layer (the layer is the 16px-inset strip). */
export function faceGeometry(face: ConsentFace, layerWidth: number, position: ConsentPosition, reopenSide: "left" | "right" | undefined) {
  const width = face === "chip" ? SIZE.chip : Math.min(face === "bar" ? SIZE.barMax : SIZE.panelMax, Math.max(layerWidth, SIZE.chip));
  const side = face === "chip" ? chipSide(position, reopenSide) : position === "bottom" ? "center" : position === "bottom-left" ? "left" : "right";
  const x = side === "left" ? 0 : side === "right" ? Math.max(0, layerWidth - width) : Math.max(0, (layerWidth - width) / 2);
  return { width, side, x, radius: face === "bar" ? SIZE.barRadius : face === "panel" ? SIZE.panelRadius : SIZE.chipRadius };
}
/** The reopen button goes to the corner of the bar's side, or left when the bar is centred. */
export function chipSide(position: ConsentPosition, reopenSide: "left" | "right" | undefined): "left" | "right" {
  return reopenSide ?? (position === "bottom-right" ? "right" : "left");
}
/** The message stacks above the actions below this bar width. */
export const stacks = (barWidth: number) => barWidth < SIZE.stackBelow;
/** A bigger surface springs with a little bounce; a smaller one is flat. */
export const springFor = (from: { width: number; height: number }, to: { width: number; height: number }) => to.width * to.height >= from.width * from.height ? SPRING.grow : SPRING.shrink;
