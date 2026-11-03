"use client";
import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { Fragment, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { CreditLine, InvoiceData, InvoiceParty } from "./invoice-model";
import { impressionTilt } from "./invoice-stamp-model";
import { StampMark } from "./StampMark";
import { creditTotals, currencySymbol, formatAmount, formatDate, formatMoney, lineCents, safePaymentUrl, toCents, totals } from "./invoice-model";

/** Paths observed in the public preview; no icon package substitutions in the cloned block. */
function BlockIcon({ kind }: { kind: "download" | "credit" | "check" }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={kind === "download" ? "M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19.5h14" : kind === "credit" ? "M9 14 4.5 9.5 9 5M4.5 9.5h10a5 5 0 0 1 0 10H12" : "m6 12.5 4 4 8-9"} /></svg>;
}
export function Money({ cents, currency }: { cents: number; currency: InvoiceData["currency"] }) {
  const { t: uiText } = useWorkspaceI18n();
  const reduced = useReducedMotion();
  return <span className="invoice-money"><AnimatePresence initial={false}><motion.span key={`${currency}-${cents}`} initial={{ opacity: 0, y: reduced ? 0 : 5, filter: reduced ? "none" : "blur(2px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: reduced ? 0 : -5 }} transition={{ duration: reduced ? 0 : .18 }}>{uiText(formatMoney(cents, currency))}</motion.span></AnimatePresence></span>;
}
function Party({ title, party }: { title: string; party: InvoiceParty }) {
  const { t: uiText } = useWorkspaceI18n();
  return <div className="ui-iv__party"><p className="ui-iv__label">{uiText(title)}</p><p>{uiText(party.name || uiText("Company name"))}</p>{party.address.split("\n").map((line, i) => <p key={i}>{uiText(line)}</p>)}{party.email && <p>{uiText(party.email)}</p>}{party.taxId && <p>{uiText("Tax ID: ")}{uiText(party.taxId)}</p>}</div>;
}
function CreditAmount({ value, max, disabled, label, currency, onChange }: { value: number; max: number; disabled: boolean; label: string; currency: InvoiceData["currency"]; onChange: (value: number) => void }) {
  const { t: uiText } = useWorkspaceI18n();
  const [text, setText] = useState<string | null>(null);
  return <label className="ui-iv__amount" data-disabled={disabled || undefined}><span>{uiText(currencySymbol(currency))}</span><input inputMode="decimal" aria-label={uiText(label)} disabled={disabled} value={text ?? formatAmount(value)} onFocus={() => setText(formatAmount(value))} onChange={e => {
    const raw = e.target.value; if (!/^-?[\d,]*(\.\d*)?$/.test(raw)) return;
    setText(raw); const parsed = Number(raw.replaceAll(",", "")); onChange(Math.min(max, Math.max(0, toCents(Number.isFinite(parsed) ? parsed : 0))));
  }} onBlur={() => setText(null)} onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} /></label>;
}
/**
 * The face of the invoice sheet: amount, parties, terms, lines, totals, note and (when it has one) the stamp's impression. Shared by the live
 * preview and by the stamping scene, so the paper that is stamped is this same document, laid out by the same stylesheet.
 */
export function InvoiceSheetBody({ invoice, onConfigurePayment, showStamp = true }: { invoice: InvoiceData; onConfigurePayment?: () => void; showStamp?: boolean }) {
  const { t: uiText } = useWorkspaceI18n();
  const sum = totals(invoice.lines), money = (value: number) => <Money cents={value} currency={invoice.currency} />, paymentUrl = safePaymentUrl(invoice.paymentUrl);
  const brand = <span className="ui-iv__brand"><span className="ui-iv__logo" aria-hidden="true" />{uiText(invoice.seller.name || uiText("Your company"))}</span>;
  return <>
  <header className="ui-iv__head"><div><p className="ui-iv__big">{uiText(money(sum.total))}</p><p className="ui-iv__due">{uiText("Due ")}{uiText(formatDate(invoice.due))}{paymentUrl ? <a href={paymentUrl} target="_blank" rel="noopener noreferrer">{uiText("Pay online")}</a> : <button type="button" className="invoice-pay" onClick={onConfigurePayment} disabled={!onConfigurePayment}>{uiText("Pay online")}</button>}</p></div>{uiText(brand)}</header>
  <div className="ui-iv__parties"><Party title={uiText("From")} party={invoice.seller} /><Party title={uiText("To")} party={invoice.buyer} /></div>
  <div className="ui-iv__terms"><p className="ui-iv__label">{uiText("Terms")}</p><dl><div><dt>{uiText("Invoice no")}</dt><dd><span className="ui-iv__ref">{invoice.number || "—"}</span></dd></div><div><dt>{uiText("Invoice date")}</dt><dd>{uiText(formatDate(invoice.issued))}</dd></div><div><dt>{uiText("Due date")}</dt><dd>{uiText(formatDate(invoice.due))}</dd></div><div><dt>{uiText("Billing period")}</dt><dd>{invoice.period || "—"}</dd></div></dl></div>
  <table className="ui-iv__table"><thead><tr><th scope="col">{uiText("Name")}</th><th scope="col">{uiText("Qty")}</th><th scope="col" className="ui-iv__num">{uiText("Rate")}</th><th scope="col" className="ui-iv__num">{uiText("Tax")}</th><th scope="col" className="ui-iv__num">{uiText("Price")}</th></tr></thead><tbody>{invoice.lines.map((line, index) => <Fragment key={line.id}>{line.group && line.group !== invoice.lines[index - 1]?.group && <tr className="ui-iv__group"><td colSpan={5}>{uiText(line.group)}</td></tr>}<tr data-indent={line.group ? "" : undefined}><td>{line.name || uiText("Untitled item")}</td><td>{uiText(line.qty.toLocaleString("en-US", { maximumFractionDigits: 3 }))}</td><td className="ui-iv__num">{uiText(formatMoney(toCents(line.rate), invoice.currency))}</td><td className="ui-iv__num">{uiText(line.tax)}%</td><td className="ui-iv__num">{uiText(money(lineCents(line)))}</td></tr></Fragment>)}</tbody></table>
  <div className="ui-iv__totals"><div><span>{uiText("Subtotal")}</span><span>{uiText(money(sum.subtotal))}</span></div><div><span>{uiText("Tax")}</span><span>{uiText(money(sum.tax))}</span></div><div className="ui-iv__total"><span>{uiText("Total")}</span><b data-testid="invoice-total">{uiText(money(sum.total))}</b></div></div>{invoice.note && <p className="invoice-paper-note">{invoice.note}</p>}
  {showStamp && invoice.stamp && <div className="invoice-stamp-on-sheet" data-stamp={invoice.stamp.kind}><StampMark stamp={invoice.stamp} style={{ transform: `rotate(${impressionTilt(invoice.stamp)}deg)` }} /></div>}
  </>;
}
interface BlockProps {
  invoice: InvoiceData;
  view: "invoice" | "credit";
  onView: (view: "invoice" | "credit") => void;
  onCredit: (lineId: string, patch: Partial<CreditLine>) => void;
  onIssue: () => void;
  onEditCredit: () => void;
  onPdf: () => void;
  onConfigurePayment: () => void;
  busy: boolean;
}
export function InvoiceBlock({ invoice, view, onView, onCredit, onIssue, onEditCredit, onPdf, onConfigurePayment, busy }: BlockProps) {
  const { t: uiText } = useWorkspaceI18n();
  const ids = useId(), tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const credit = creditTotals(invoice), money = (value: number) => <Money cents={value} currency={invoice.currency} />;
  const tabKey = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault(); const next = e.key === "Home" ? 0 : e.key === "End" ? 1 : 1 - index; onView(next === 0 ? "invoice" : "credit"); tabs.current[next]?.focus();
  };
  const brand = <span className="ui-iv__brand"><span className="ui-iv__logo" aria-hidden="true" />{uiText(invoice.seller.name || uiText("Your company"))}</span>;
  return <section className="ui-iv" data-view={view} aria-label={uiText("Invoice and credit note preview")}>
    <div className="ui-iv__bar"><div className="ui-iv__seg" role="tablist" aria-label={uiText("Document")}><span className="ui-iv__seg-thumb" aria-hidden="true" />{(["invoice", "credit"] as const).map((item, index) => <button key={item} ref={el => { tabs.current[index] = el; }} type="button" role="tab" id={`${ids}-${item}-tab`} aria-controls={`${ids}-${item}`} tabIndex={item === view ? 0 : -1} aria-selected={item === view} onKeyDown={e => tabKey(e, index)} onClick={() => onView(item)}>{uiText(item === "invoice" ? uiText("Invoice") : uiText("Credit note"))}</button>)}</div>
      <div className="ui-iv__actions"><button type="button" className="ui-iv__btn" onClick={onPdf}><BlockIcon kind="download" />{uiText("PDF")}</button>{view === "invoice" && <button type="button" className="ui-iv__btn" onClick={() => onView("credit")}><BlockIcon kind="credit" />{uiText("Credit invoice")}</button>}</div>
    </div>
    <div className="ui-iv__stack">
      <article className="ui-iv__sheet" data-doc="invoice" data-stamped={invoice.stamp ? "" : undefined} id={`${ids}-invoice`} role="tabpanel" aria-labelledby={`${ids}-invoice-tab`} aria-hidden={view !== "invoice"} inert={view !== "invoice"}>
        <InvoiceSheetBody invoice={invoice} onConfigurePayment={onConfigurePayment} />
      </article>
      <article className="ui-iv__sheet" data-doc="credit" id={`${ids}-credit`} role="tabpanel" aria-labelledby={`${ids}-credit-tab`} aria-hidden={view !== "credit"} inert={view !== "credit"}>
        <header className="ui-iv__head"><div><p className="ui-iv__big">{uiText("Credit note")}</p><p className="ui-iv__due">{uiText(formatMoney(credit.total, invoice.currency))} {uiText(" credited on ")}{uiText(formatDate(invoice.credit.date))}{invoice.credit.issued && <span className="ui-iv__badge">{uiText("Issued")}</span>}</p></div>{uiText(brand)}</header>
        <div className="ui-iv__terms"><p className="ui-iv__label">{uiText("Terms")}</p><dl><div><dt>{uiText("Credit note no")}</dt><dd><span className="ui-iv__ref">{invoice.creditNumber || "—"}</span></dd></div><div><dt>{uiText("Related invoice")}</dt><dd><button type="button" className="ui-iv__ref" onClick={() => onView("invoice")}>{invoice.number || "—"}</button></dd></div><div><dt>{uiText("Billing period")}</dt><dd>{invoice.period || "—"}</dd></div><div><dt>{uiText("Date of issue")}</dt><dd>{uiText(formatDate(invoice.credit.date))}</dd></div></dl></div>
        <div className="ui-iv__tray"><p className="ui-iv__tray-title">{uiText("Lines to credit")}</p><div className="ui-iv__card"><div className="ui-iv__crow ui-iv__crow--head"><span /><span>{uiText("Name")}</span><span className="ui-iv__num">{uiText("Total")}</span><span className="ui-iv__num">{uiText("Credit amount")}</span></div>{invoice.lines.map(line => {
          const c = invoice.credit.lines.find(c => c.lineId === line.id), disabled = !c?.selected || invoice.credit.issued || busy;
          return <div className="ui-iv__crow" data-off={!c?.selected ? "" : undefined} key={line.id}><button type="button" role="checkbox" aria-checked={c?.selected ?? false} aria-label={uiText("Credit {0}", [line.name || "Untitled item"])} className="ui-iv__check" disabled={invoice.credit.issued || busy} onClick={() => onCredit(line.id, { selected: !c?.selected })}><BlockIcon kind="check" /></button><span className="ui-iv__cname">{line.name || uiText("Untitled item")}</span><span className="ui-iv__num">{uiText(formatMoney(lineCents(line), invoice.currency))}</span><span className="ui-iv__num"><CreditAmount key={`${line.id}-${lineCents(line)}-${invoice.credit.issued}`} value={c?.cents ?? 0} max={lineCents(line)} disabled={disabled} currency={invoice.currency} label={uiText("Credit amount for {0}", [line.name || "Untitled item"])} onChange={cents => onCredit(line.id, { cents })} /></span></div>;
        })}</div></div>
        <div className="ui-iv__totals"><div><span>{uiText("Subtotal")}</span><span>{uiText(money(credit.subtotal))}</span></div><div><span>{uiText("Tax")}</span><span>{uiText(money(credit.tax))}</span></div><div className="ui-iv__total"><span>{uiText("Adjustment total")}</span><b data-testid="credit-total">-{uiText(money(credit.total))}</b></div><div className="ui-iv__note"><span>{uiText("Applied to invoice")}</span><span>-{uiText(formatMoney(credit.total, invoice.currency))} {uiText(invoice.currency)}</span></div></div>
        <div className="ui-iv__issue"><button type="button" className={invoice.credit.issued ? "ui-iv__btn" : "ui-iv__primary"} disabled={busy || (!invoice.credit.issued && credit.total <= 0)} onClick={invoice.credit.issued ? onEditCredit : onIssue}>{uiText(busy ? uiText("Saving…") : invoice.credit.issued ? uiText("Edit credit note") : uiText("Issue credit note"))}</button></div>
      </article>
    </div>
  </section>;
}
