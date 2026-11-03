/**
 * The rules of the invoice stamp that do not depend on the screen: which stamps there are, their inks, the date the wheels choose,
 * and how a stamp is written down on an invoice. Pure: no React, no DOM.
 */
export type StampKind = "paid" | "received" | "approved" | "due";
export type StampInk = "red" | "blue" | "green" | "violet" | "black";
export interface InvoiceStamp { kind: StampKind; /** yyyy-mm-dd */ date: string; ink: StampInk }

export interface StampKindInfo { id: StampKind; tab: string; word: string; action: string; done: string; ink: StampInk }
export const STAMP_KINDS: readonly StampKindInfo[] = [
  { id: "paid", tab: "Paid", word: "PAID", action: "Mark as paid", done: "Marked as paid", ink: "red" },
  { id: "received", tab: "Received", word: "RECEIVED", action: "Mark as received", done: "Marked as received", ink: "blue" },
  { id: "approved", tab: "Approved", word: "APPROVED", action: "Mark as approved", done: "Marked as approved", ink: "green" },
  { id: "due", tab: "Due", word: "DUE", action: "Mark as due", done: "Marked as due", ink: "violet" },
];
export const STAMP_INKS: readonly { id: StampInk; label: string; color: string }[] = [
  { id: "red", label: "Red ink", color: "#c9382c" },
  { id: "blue", label: "Blue ink", color: "#1f5bd1" },
  { id: "green", label: "Green ink", color: "#1b7a49" },
  { id: "violet", label: "Violet ink", color: "#6a49d4" },
  { id: "black", label: "Black ink", color: "#26262b" },
];
export const kindInfo = (kind: StampKind): StampKindInfo => STAMP_KINDS.find(item => item.id === kind) ?? STAMP_KINDS[0];
export const inkColor = (ink: StampInk) => (STAMP_INKS.find(item => item.id === ink) ?? STAMP_INKS[0]).color;

export const MIN_YEAR = 2000;
export const MAX_YEAR = 2099;
export const MONTH_SHORT = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"] as const;
export interface DateParts { y: number; m: number; d: number }

export const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();
export function isStampDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  return y >= MIN_YEAR && y <= MAX_YEAR && m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}
export function parseDate(date: string): DateParts {
  const [y, m, d] = date.split("-").map(Number);
  return { y, m, d };
}
/** A date the wheels can show: the year and month are kept in range, the day is pulled back to the last day of a short month. */
export function clampParts(parts: DateParts): DateParts {
  const y = Math.min(MAX_YEAR, Math.max(MIN_YEAR, Math.round(parts.y)));
  const m = Math.min(12, Math.max(1, Math.round(parts.m)));
  return { y, m, d: Math.min(daysInMonth(y, m), Math.max(1, Math.round(parts.d))) };
}
export const toDate = (parts: DateParts) => { const { y, m, d } = clampParts(parts); return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`; };
export const todayDate = (now = new Date()) => toDate({ y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() });

const utc = (date: string) => new Date(`${date}T00:00:00Z`);
/** "Tuesday, 15 September 2026" */
export const weekdayLabel = (date: string) => isStampDate(date) ? new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(utc(date)).replace(/^(\w+) /, "$1, ") : "";
/** "15 Sep 2026" */
export function shortDate(date: string) {
  if (!isStampDate(date)) return "";
  const { y, m, d } = parseDate(date), month = MONTH_SHORT[m - 1];
  return `${d} ${month[0]}${month.slice(1).toLowerCase()} ${y}`;
}
/** "15 SEP 2026", as the stamp prints it */
export function stampDateText(date: string) {
  if (!isStampDate(date)) return "";
  const { y, m, d } = parseDate(date);
  return `${d} ${MONTH_SHORT[m - 1]} ${y}`;
}

export const newStamp = (kind: StampKind = "paid", date: string = todayDate()): InvoiceStamp => ({ kind, date, ink: kindInfo(kind).ink });
export function isStamp(value: unknown): value is InvoiceStamp {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const raw = value as Record<string, unknown>;
  return STAMP_KINDS.some(item => item.id === raw.kind) && STAMP_INKS.some(item => item.id === raw.ink) && isStampDate(raw.date);
}
export const sameStamp = (a?: InvoiceStamp | null, b?: InvoiceStamp | null) => !a && !b ? true : !!a && !!b && a.kind === b.kind && a.date === b.date && a.ink === b.ink;
/** The small rotation of one impression: a hand never sets the stamp down perfectly square, and two stamps are never alike. Stable for the same stamp. */
export function impressionTilt(stamp: InvoiceStamp) {
  let seed = 0;
  for (const char of `${stamp.kind}${stamp.date}`) seed = (seed * 31 + char.charCodeAt(0)) >>> 0;
  return Math.round((((seed % 1000) / 1000) * 4 - 2.6) * 100) / 100;
}
export const impressionSeed = (stamp: InvoiceStamp) => { let seed = 7; for (const char of `${stamp.kind}${stamp.date}${stamp.ink}`) seed = (seed * 33 + char.charCodeAt(0)) >>> 0; return seed % 997; };
