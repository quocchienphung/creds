import { isStamp } from "./invoice-stamp-model.ts";
import type { InvoiceStamp } from "./invoice-stamp-model.ts";

export type Currency = "USD" | "EUR" | "GBP";
export interface InvoiceLine { id: string; name: string; qty: number; rate: number; tax: number; group: string }
export interface InvoiceParty { name: string; address: string; email: string; taxId: string }
export interface CreditLine { lineId: string; selected: boolean; cents: number }
export interface InvoiceData {
  version: 2;
  id: string;
  number: string;
  creditNumber: string;
  issued: string;
  due: string;
  period: string;
  currency: Currency;
  seller: InvoiceParty;
  buyer: InvoiceParty;
  lines: InvoiceLine[];
  note: string;
  paymentUrl: string;
  credit: { date: string; issued: boolean; lines: CreditLine[] };
  /** A stamp set down on the invoice (paid, received, approved, due). Absent until someone stamps it. */
  stamp?: InvoiceStamp;
}
export interface InvoiceLibrary { version: 2; activeId: string; documents: InvoiceData[] }
export const LIMITS = { documents: 200, lines: 200, text: 160, address: 600, note: 2000, qty: 1_000_000, rate: 100_000 };
export const uid = () => crypto.randomUUID();
export const isoToday = (now = new Date()) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
export function isDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}
export function addDays(date: string, days: number) { return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10); }
export function formatDate(date: string) { return isDate(date) ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`)) : "—"; }
export function clamp(value: number, max: number, decimals = 2) { const scale = 10 ** decimals; return Math.min(max, Math.max(0, Math.round((Number.isFinite(value) ? value : 0) * scale + 1e-8) / scale)); }
export const toCents = (amount: number) => Math.round(amount * 100 + 1e-8);
const divideRounded = (value: bigint, divisor: bigint) => Number((value + divisor / BigInt(2)) / divisor);
/** Quantity is precise to .001, unit price to cents, tax to .01%; all rounding is half-up per line. */
export const lineCents = (line: Pick<InvoiceLine, "qty" | "rate">) => divideRounded(BigInt(Math.round(clamp(line.qty, LIMITS.qty, 3) * 1000)) * BigInt(toCents(clamp(line.rate, LIMITS.rate))), BigInt(1000));
export const taxCents = (cents: number, tax: number) => divideRounded(BigInt(cents) * BigInt(Math.round(clamp(tax, 100) * 100)), BigInt(10000));
export function totals(lines: InvoiceLine[]) {
  const subtotal = lines.reduce((sum, line) => sum + lineCents(line), 0);
  const tax = lines.reduce((sum, line) => sum + taxCents(lineCents(line), line.tax), 0);
  return { subtotal, tax, total: subtotal + tax };
}
export function creditTotals(invoice: InvoiceData) {
  let subtotal = 0, tax = 0;
  for (const line of invoice.lines) {
    const credit = invoice.credit.lines.find(item => item.lineId === line.id);
    const amount = credit?.selected ? Math.min(lineCents(line), Math.max(0, Math.round(credit.cents))) : 0;
    subtotal += amount; tax += taxCents(amount, line.tax);
  }
  return { subtotal, tax, total: subtotal + tax };
}
export const formatMoney = (cents: number, currency: Currency = "USD") => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
export const currencySymbol = (currency: Currency) => ({ USD: "$", EUR: "€", GBP: "£" })[currency];
export const formatAmount = (cents: number) => new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
export function safePaymentUrl(value: string) { try { const url = new URL(value); return url.protocol === "https:" ? url.href : null; } catch { return null; } }
export function syncCredits(invoice: InvoiceData): InvoiceData {
  return { ...invoice, credit: { ...invoice.credit, issued: false, lines: invoice.lines.map(line => {
    const old = invoice.credit.lines.find(item => item.lineId === line.id);
    return old ? { ...old, cents: Math.min(lineCents(line), old.cents) } : { lineId: line.id, selected: true, cents: lineCents(line) };
  }) } };
}
export function createDefaultInvoice(): InvoiceData {
  const lines: InvoiceLine[] = [
    { id: "growth", name: "Growth plan", qty: 1, rate: 1250, tax: 20, group: "" },
    { id: "seats", name: "Extra seats", qty: 12, rate: 40, tax: 20, group: "" },
    { id: "api", name: "API calls (per 1k)", qty: 18420, rate: .42, tax: 20, group: "Metered usage" },
  ];
  return { version: 2, id: uid(), number: "INV-2041", creditNumber: "CN-0117", issued: "2026-10-01", due: "2026-10-31", period: "1 Sep – 30 Sep 2026", currency: "USD",
    seller: { name: "Lumen Labs, Inc.", address: "48 Harbour Street\nBristol\nBS1 4RN\nUnited Kingdom", email: "", taxId: "" },
    buyer: { name: "Northwind Logistics GmbH", address: "Speicherstraße 12\nHamburg\n20457\nGermany", email: "", taxId: "" },
    lines, note: "", paymentUrl: "", credit: { date: "2026-10-01", issued: false, lines: lines.map(line => ({ lineId: line.id, selected: true, cents: lineCents(line) })) },
  };
}
export function createBlankInvoice(previous?: InvoiceData, usedNumbers: string[] = []): InvoiceData {
  const today = isoToday(), sample = createDefaultInvoice();
  const line: InvoiceLine = { id: uid(), name: "", qty: 1, rate: 0, tax: 0, group: "" };
  let seq = 1; while (usedNumbers.includes(`INV-${String(seq).padStart(4, "0")}`)) seq++;
  return { ...sample, number: `INV-${String(seq).padStart(4, "0")}`, creditNumber: `CN-${String(seq).padStart(4, "0")}`, issued: today, due: addDays(today, 30), period: "", currency: previous?.currency ?? "USD",
    seller: previous ? { ...previous.seller } : { name: "", address: "", email: "", taxId: "" }, buyer: { name: "", address: "", email: "", taxId: "" },
    lines: [line], credit: { date: today, issued: false, lines: [{ lineId: line.id, selected: true, cents: 0 }] },
  };
}
export function createLibrary(invoice = createDefaultInvoice()): InvoiceLibrary { return { version: 2, activeId: invoice.id, documents: [invoice] }; }
export function validateInvoice(invoice: InvoiceData): string | null {
  if (!invoice.number.trim()) return "Enter an invoice number.";
  if (!invoice.creditNumber.trim()) return "Enter a credit note number.";
  if (!invoice.seller.name.trim() || !invoice.buyer.name.trim()) return "Enter both the seller and client name.";
  if (!isDate(invoice.issued) || !isDate(invoice.due) || !isDate(invoice.credit.date)) return "Enter valid dates.";
  if (invoice.due < invoice.issued) return "The due date must be on or after the invoice date.";
  if (!invoice.lines.length || invoice.lines.some(line => !line.name.trim())) return "Describe every line item before saving.";
  if (invoice.paymentUrl && !safePaymentUrl(invoice.paymentUrl)) return "The payment link must be a valid HTTPS URL.";
  if ([invoice.seller.email, invoice.buyer.email].some(email => email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return "Enter valid email addresses.";
  return null;
}
const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const str = (value: unknown, max = LIMITS.text): value is string => typeof value === "string" && value.length <= max;
const num = (value: unknown, max: number): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= max;
function party(raw: unknown): InvoiceParty | null { const p = object(raw); return p && str(p.name) && str(p.address, LIMITS.address) && str(p.email) && str(p.taxId) ? { name: p.name, address: p.address, email: p.email, taxId: p.taxId } : null; }
/** Strictly validates v2; v1 migration retains the previous screen's entered fields. Never silently replaces corrupt data. */
export function normalizeInvoice(input: unknown): InvoiceData | null {
  const raw = object(input); if (!raw) return null;
  if (raw.version === 1) return migrateLegacy(raw);
  if (raw.version !== 2 || !str(raw.id, 80) || !raw.id || !str(raw.number) || !str(raw.creditNumber) || !isDate(raw.issued) || !isDate(raw.due) || !str(raw.period) || !["USD", "EUR", "GBP"].includes(String(raw.currency)) || !str(raw.note, LIMITS.note) || !str(raw.paymentUrl, 2048)) return null;
  const seller = party(raw.seller), buyer = party(raw.buyer), credit = object(raw.credit);
  if (!seller || !buyer || !Array.isArray(raw.lines) || raw.lines.length > LIMITS.lines || !credit || !isDate(credit.date) || typeof credit.issued !== "boolean" || !Array.isArray(credit.lines)) return null;
  const ids = new Set<string>(), lines: InvoiceLine[] = [];
  for (const item of raw.lines) { const line = object(item);
    if (!line || !str(line.id, 80) || !line.id || ids.has(line.id) || !str(line.name) || !str(line.group) || !num(line.qty, LIMITS.qty) || !num(line.rate, LIMITS.rate) || !num(line.tax, 100)) return null;
    ids.add(line.id); lines.push({ id: line.id, name: line.name, group: line.group, qty: clamp(line.qty, LIMITS.qty, 3), rate: clamp(line.rate, LIMITS.rate), tax: clamp(line.tax, 100) });
  }
  const credits: CreditLine[] = [], creditIds = new Set<string>();
  for (const item of credit.lines) { const c = object(item); const line = lines.find(line => line.id === c?.lineId);
    if (!c || !line || creditIds.has(line.id) || typeof c.selected !== "boolean" || !num(c.cents, lineCents(line)) || !Number.isInteger(c.cents)) return null;
    creditIds.add(line.id); credits.push({ lineId: line.id, selected: c.selected, cents: c.cents });
  }
  if (credits.length !== lines.length) return null;
  if (raw.stamp !== undefined && !isStamp(raw.stamp)) return null;
  const stamp = raw.stamp === undefined ? {} : { stamp: { kind: raw.stamp.kind, date: raw.stamp.date, ink: raw.stamp.ink } };
  return { version: 2, id: raw.id, number: raw.number, creditNumber: raw.creditNumber, issued: raw.issued, due: raw.due, period: raw.period, currency: raw.currency as Currency, seller, buyer, lines, note: raw.note, paymentUrl: raw.paymentUrl, credit: { date: credit.date, issued: credit.issued, lines: credits }, ...stamp };
}
function migrateLegacy(raw: Record<string, unknown>): InvoiceData | null {
  if (!Array.isArray(raw.lines) || raw.lines.length > LIMITS.lines || !isDate(raw.issued) || !isDate(raw.due) || !str(raw.number)) return null;
  const from = object(raw.from), to = object(raw.billTo); if (!from || !to || !str(from.name) || !str(from.address, LIMITS.address) || !str(to.name) || !str(to.address, LIMITS.address)) return null;
  const lines: InvoiceLine[] = [], ids = new Set<string>();
  for (const item of raw.lines) { const l = object(item); if (!l || !str(l.id, 80) || ids.has(l.id) || !str(l.description) || !num(l.quantity, LIMITS.qty) || !num(l.rate, LIMITS.rate) || !num(raw.taxRate, 100)) return null;
    ids.add(l.id); lines.push({ id: l.id, name: l.description, qty: l.quantity, rate: l.rate, tax: raw.taxRate, group: "" });
  }
  const invoice = createDefaultInvoice();
  return { ...invoice, id: "migrated-invoice", number: raw.number, issued: raw.issued, due: raw.due, period: "", seller: { name: from.name, address: from.address, email: "", taxId: "" }, buyer: { name: to.name, address: to.address, email: "", taxId: "" }, lines, note: typeof raw.note === "string" ? raw.note.slice(0, LIMITS.note) : "", credit: { date: raw.issued, issued: false, lines: lines.map(l => ({ lineId: l.id, selected: true, cents: lineCents(l) })) } };
}
export function normalizeLibrary(input: unknown): InvoiceLibrary | null {
  const raw = object(input); if (!raw) return null;
  if (!Array.isArray(raw.documents)) { const invoice = normalizeInvoice(raw); return invoice ? createLibrary(invoice) : null; }
  if (raw.version !== 2 || raw.documents.length > LIMITS.documents || !str(raw.activeId, 80)) return null;
  const documents: InvoiceData[] = [], ids = new Set<string>();
  for (const item of raw.documents) { const invoice = normalizeInvoice(item); if (!invoice || ids.has(invoice.id)) return null; ids.add(invoice.id); documents.push(invoice); }
  if (documents.length && !ids.has(raw.activeId)) return null;
  if (!documents.length && raw.activeId !== "") return null;
  return { version: 2, activeId: raw.activeId, documents };
}
/** CSV formula prefixes are escaped as well as RFC4180 quotes. */
export function invoiceCsv(invoice: InvoiceData) {
  const rows: (string | number)[][] = [["Invoice", invoice.number], ["Seller", invoice.seller.name], ["Client", invoice.buyer.name], ["Currency", invoice.currency], ["Issued", invoice.issued], ["Due", invoice.due], ["Name", "Quantity", "Rate", "Tax %", "Net amount", "Tax amount", "Gross amount"]];
  for (const l of invoice.lines) { const net = lineCents(l), tax = taxCents(net, l.tax); rows.push([l.name, l.qty, l.rate, l.tax, (net / 100).toFixed(2), (tax / 100).toFixed(2), ((net + tax) / 100).toFixed(2)]); }
  const sum = totals(invoice.lines); rows.push(["Subtotal", sum.subtotal / 100], ["Tax", sum.tax / 100], ["Total", sum.total / 100]);
  if (invoice.stamp) rows.push(["Stamp", invoice.stamp.kind, invoice.stamp.date]);
  return rows.map(row => row.map(value => { let text = String(value); if (typeof value === "string" && /^[\s]*[=+\-@\t\r]/.test(text)) text = `'${text}`; return `"${text.replaceAll('"', '""')}"`; }).join(",")).join("\r\n");
}
