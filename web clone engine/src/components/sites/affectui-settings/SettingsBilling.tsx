"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { memo, useCallback, useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import { Check, CreditCard, Download, Mail } from "lucide-react";
import { UsageMeter } from "../affectui-usage-meter/UsageMeter";
import { AnimatedNumber } from "../affectui-analytics/AnimatedNumber";
import { WorkspaceDialog } from "../affectui-crm/WorkspaceDialog";
import { downloadFile, toCsv } from "../affectui-crm/workspace-state";
import { ApiKeysSettings, GeneralSettings, MembersSettings, initialMembers } from "./SettingsTabs";
import usageDays from "./usage-seed.json";
import icons from "./icons.json";
import "../affectui-usage-meter/usage-meter.css";
import "./settings-reference.css";
import "./settings-overrides.css";
import { conforms } from "@/lib/workspace-backend";
import { useQuery, useResource } from "@/lib/workspace-backend/react";
import { QueryNotice } from "@/lib/workspace-backend/SyncStatus";
import { resources } from "../workspace-resources";

const tabs = ["General", "Members", "Billing", "API keys"] as const;
type Tab = typeof tabs[number];
const bundledPlans: BillingPlan[] = [
  { name: "Starter", price: 19, credits: 10000, seats: 3, storage: 10, description: "For individuals trying things out", features: ["10,000 credits / month", "3 seats", "10 GB storage"] },
  { name: "Pro", price: 49, credits: 50000, seats: 10, storage: 100, description: "For small teams shipping every day", features: ["50,000 credits / month", "10 seats", "100 GB storage", "Agents and API access"] },
  { name: "Team", price: 99, credits: 150000, seats: 25, storage: 1000, description: "For growing teams with more seats", features: ["150,000 credits / month", "25 seats", "1 TB storage", "SSO and audit log"] },
];
export interface BillingPlan { name: string; price: number; credits: number; seats: number; storage: number; description: string; features: string[] }
type Plan = BillingPlan;
export interface BillingInvoice { date: string; id: string; amount: number; status: string }
/** What the "usage" read model reports for the period: the credit meter, the storage in use and the renewal date. */
export interface UsageReport { daily: { label: string; value: number | null }[]; categories: { label: string; value: number }[]; storageUsed: number; resetLabel: string; renewsOn: string }
const bundledUsage: UsageReport = {
  daily: usageDays.slice(0, 30), categories: [{ label: "Chat", value: 18400 }, { label: "Agents", value: 9200 }, { label: "API", value: 4100 }, { label: "Images", value: 2300 }],
  storageUsed: 42.6, resetLabel: "Resets in 24 days", renewsOn: "Nov 12, 2026",
};
// Answers from a backend are checked before a screen sees them; a wrong shape is reported and the sample is shown.
const parsePlans = (raw: unknown) => conforms([bundledPlans[0]], raw) && (raw as BillingPlan[]).length > 0 && (raw as BillingPlan[]).every(item => item.features.every(feature => typeof feature === "string")) ? raw as BillingPlan[] : undefined;
const parseInvoices = (raw: unknown) => conforms([{ date: "", id: "", amount: 0, status: "" }], raw) ? raw as BillingInvoice[] : undefined;
const parseUsage = (raw: unknown) => {
  if (!conforms({ daily: [{ label: "" }], categories: [{ label: "", value: 0 }], storageUsed: 0, resetLabel: "", renewsOn: "" }, raw)) return undefined;
  const report = raw as UsageReport;
  return report.daily.every(day => day.value === null || (typeof day.value === "number" && Number.isFinite(day.value))) ? report : undefined;
};
export interface BillingState { plan: string; cycle: "Monthly" | "Yearly"; canceled: boolean; email: string; last4: string; expiry: string }
const initialBilling: BillingState = { plan: "Pro", cycle: "Monthly", canceled: false, email: "billing@logio.com", last4: "4242", expiry: "2028-08" };
const bundledInvoices: BillingInvoice[] = [
  { date: "Oct 12, 2026", id: "INV-2026-0412", amount: 49, status: "Due" },
  { date: "Sep 12, 2026", id: "INV-2026-0371", amount: 49, status: "Paid" },
  { date: "Aug 12, 2026", id: "INV-2026-0329", amount: 69, status: "Paid" },
  { date: "Jul 12, 2026", id: "INV-2026-0288", amount: 49, status: "Paid" },
  { date: "Jun 12, 2026", id: "INV-2026-0240", amount: 49, status: "Paid" },
];
const formatPrice = (value: number) => Math.round(value).toString();
function subscribe(listener: () => void) { window.addEventListener("popstate", listener); return () => window.removeEventListener("popstate", listener); }
function tabSnapshot(): Tab { const value = new URLSearchParams(window.location.search).get("settings-tab"); return tabs.find(tab => tab.toLowerCase().replaceAll(" ", "-") === value) || "Billing"; }
function Icon({ name }: { name: string }) { const svg = (icons as Record<string, string>)[name]; return svg ? <span className="crm-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} /> : null; }
const UsagePanel = memo(function UsagePanel({ plan, workspaceId, onUpgrade }: { plan: Plan; workspaceId: string; onUpgrade: () => void }) {
  const { t: uiText } = useWorkspaceI18n();
  const [members] = useResource(resources.settingsMembers, workspaceId,  workspaceId === "acme" ? initialMembers : initialMembers.slice(0,1));
  const usageQuery = useQuery("usage", workspaceId, {}, bundledUsage, parseUsage);
  const usage = usageQuery.data;
  return <div className="ui-sb-usage"><QueryNotice query={usageQuery} what="usage" />{usageQuery.phase === "ready" && <UsageMeter title={uiText("Usage this period")} plan={uiText("{0} plan", [plan.name])} total={plan.credits} used={usage.categories} daily={usage.daily} resetLabel={usage.resetLabel} resetTitle={uiText("Resets on {0}", [usage.renewsOn])} limits={[{label:"Seats",used:members.length,total:plan.seats},{label:"Storage",used:usage.storageUsed,total:plan.storage,unit:"GB",decimals:1}]} onUpgrade={onUpgrade} />}</div>;
});

export function SettingsBilling({ workspaceId, workspaceName, onRename, onLogoChange, notify }: { workspaceId: string; workspaceName: string; onRename: (name: string) => void; onLogoChange: (logo: string) => void; notify: (message: string) => void }) {
  const { t: uiText } = useWorkspaceI18n();
  const tab = useSyncExternalStore(subscribe, tabSnapshot, () => "Billing" as Tab);
  const [billing, setBilling] = useResource(resources.settingsBilling, workspaceId,  initialBilling);
  const [cycleOverride, setCycle] = useState<"Monthly" | "Yearly" | null>(null);
  const cycle = cycleOverride ?? billing.cycle;
  const [emailEdit, setEmailEdit] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [selected, setSelected] = useState<Plan | null>(null);
  const plansRef = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  // Plans, invoices and the renewal date are computed by the backend; the bundled ones are shown when it has none.
  const plansQuery = useQuery("plans", workspaceId, {}, bundledPlans, parsePlans);
  const invoicesQuery = useQuery("invoices", workspaceId, {}, bundledInvoices, parseInvoices);
  const usageForDates = useQuery("usage", workspaceId, {}, bundledUsage, parseUsage).data;
  const plans = plansQuery.data, invoices = invoicesQuery.data, renewsOn = usageForDates.renewsOn;
  const plan = plans.find(item => item.name === billing.plan) || plans[1] || plans[0];
  const price = (item: Plan, period = cycle) => period === "Yearly" ? Math.round(item.price * 0.8) : item.price;
  function selectTab(next: Tab) {
    const url = new URL(window.location.href);
    if (next === "Billing") url.searchParams.delete("settings-tab"); else url.searchParams.set("settings-tab", next.toLowerCase().replaceAll(" ", "-"));
    if (url.href !== window.location.href) { window.history.pushState({}, "", url); window.dispatchEvent(new PopStateEvent("popstate")); }
  }
  const showPlans = useCallback(() => { plansRef.current?.scrollIntoView({ behavior: reduce ? "instant" : "smooth", block: "start" }); plansRef.current?.focus({ preventScroll: true }); }, [reduce]);
  function exportInvoices(id?: string) {
    const rows = invoices.filter(item => !id || item.id === id);
    downloadFile(`${id || "logio-invoices"}.csv`, toCsv([["Workspace", workspaceName], ["Billing email", billing.email], ["Date", "Invoice", "Amount USD", "Status"], ...rows.map(item => [item.date, item.id, item.amount.toFixed(2), item.status])]), "text/csv;charset=utf-8");
    notify(id ? `${id} downloaded` : "All invoices downloaded");
  }
  return <LayoutGroup id="settings"><div className="ui-sb">
    <h1 className="ui-as-page-title">{uiText("Settings")}</h1><p className="ui-as-page-sub">{uiText("Manage your workspace, your team, your plan and access to the API.")}</p>
    <div className="ui-as-toolbar ui-sb__bar"><div className="ui-as-tabs" role="tablist" aria-label={uiText("Settings")} onKeyDown={event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault(); const index = tabs.indexOf(tab); const next = tabs[event.key === "Home" ? 0 : event.key === "End" ? 3 : (index + (event.key === "ArrowRight" ? 1 : 3)) % 4]; selectTab(next); event.currentTarget.querySelector<HTMLButtonElement>(`[data-tab="${next}"]`)?.focus();
    }}>{tabs.map(name => <button type="button" key={name} id={`settings-tab-${name.replaceAll(" ", "-")}`} data-tab={name} role="tab" className="ui-as-tabs__tab" aria-selected={tab === name} aria-controls="settings-panel" tabIndex={tab === name ? 0 : -1} onClick={() => selectTab(name)}>{tab === name && <motion.span className="settings-tab-pill" layoutId="settings-tab" transition={{ type: "spring", stiffness: 450, damping: 38 }} />}<span>{uiText(name)}</span></button>)}</div></div>
    <AnimatePresence mode="wait" initial={false}><motion.div className="ui-sb__body" id="settings-panel" role="tabpanel" aria-labelledby={`settings-tab-${tab.replaceAll(" ", "-")}`} key={`${workspaceId}:${tab}`} initial={{opacity:0,y:5}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-3}} transition={{duration:reduce ? 0 : 0.16}}>
      {tab === "General" ? <GeneralSettings workspaceId={workspaceId} workspaceName={workspaceName} onRename={onRename} onLogoChange={onLogoChange} notify={notify} /> : tab === "Members" ? <MembersSettings workspaceId={workspaceId} seatLimit={plan.seats} notify={notify} /> : tab === "API keys" ? <ApiKeysSettings workspaceId={workspaceId} notify={notify} /> : <>
        <div className="ui-sb-overview"><UsagePanel plan={plan} workspaceId={workspaceId} onUpgrade={showPlans} /><div className="ui-sb-stack">
          <div className="ui-sb-card ui-sb-plan"><div className="ui-sb-plan__top"><span className="ui-sb-cap">{uiText("Current plan")}</span><span className="ui-sb-pill" data-tone={billing.canceled ? "amber" : "green"}>{uiText(billing.canceled ? uiText("Cancels soon") : uiText("Active"))}</span></div><div className="ui-sb-plan__name">{uiText(plan.name)} <span>· ${uiText(price(plan,billing.cycle))}{uiText("/mo")}</span></div><p className="ui-sb-muted">{uiText(billing.canceled ? uiText("Your plan ends on {0}. You keep every feature until then.", [renewsOn]) : uiText("Renews on {0} · billed {1}", [renewsOn, uiText(billing.cycle)]))}</p><div className="ui-sb-actions"><button type="button" className="ui-button" data-variant="primary" data-size="sm" onClick={showPlans}><span className="ui-button__label">{uiText("Change plan")}</span></button><button type="button" className="ui-button" data-variant="ghost" data-size="sm" onClick={() => { setBilling({...billing,canceled:!billing.canceled}); notify(billing.canceled ? "Plan resumed in this demo" : `Plan canceled in this demo – active until ${renewsOn}`); }}><span className="ui-button__label">{uiText(billing.canceled ? uiText("Resume plan") : uiText("Cancel plan"))}</span></button></div></div>
          <div className="ui-sb-card ui-sb-pay"><div className="ui-sb-pay__row"><span className="ui-sb-visa">{uiText("VISA")}</span><div className="ui-sb-pay__text"><b>{uiText("Visa •••• ")}{uiText(billing.last4)}</b><span>{uiText("Expires ")}{uiText(billing.expiry.slice(5))}/{uiText(billing.expiry.slice(0,4))}</span></div><button type="button" className="ui-button" data-variant="secondary" data-size="sm" onClick={() => setPaymentOpen(true)}><span className="ui-button__icon"><Icon name="Update" /></span><span className="ui-button__label">{uiText("Update")}</span></button></div><div className="ui-sb-pay__row"><span className="ui-sb-tile"><Mail size={15} /></span>{emailEdit ? <form className="ui-sb-inline" onSubmit={event => {event.preventDefault();const email = String(new FormData(event.currentTarget).get("email")).trim();setBilling({...billing,email});setEmailEdit(false);notify("Billing email saved");}} onKeyDown={event=>{if(event.key==="Escape")setEmailEdit(false);}}><input className="ui-sb-input" name="email" type="email" aria-label={uiText("Billing email")} required autoFocus defaultValue={billing.email} /><button className="ui-button" data-variant="primary" data-size="sm" type="submit"><span className="ui-button__label">{uiText("Save")}</span></button><button className="ui-button" data-variant="ghost" data-size="sm" type="button" onClick={()=>setEmailEdit(false)}><span className="ui-button__label">{uiText("Cancel")}</span></button></form> : <><div className="ui-sb-pay__text"><b>{uiText(billing.email)}</b><span>{uiText("Invoices and receipts go here")}</span></div><button type="button" className="ui-button" data-variant="secondary" data-size="sm" onClick={()=>setEmailEdit(true)}><span className="ui-button__label">{uiText("Edit")}</span></button></>}</div></div>
        </div></div>
        <section className="ui-sb-section" ref={plansRef} tabIndex={-1} aria-labelledby="settings-plans"><div className="ui-sb-section__head"><div><h2 className="ui-sb-h2" id="settings-plans">{uiText("Plans")}</h2><p className="ui-sb-muted">{uiText("Switch any time – we prorate the difference.")}</p></div><div className="ui-seg" data-size="sm"><div className="ui-seg__scroller"><div className="ui-seg__track" role="radiogroup" aria-label={uiText("Billing frequency")} onKeyDown={event=>{if(event.key==="ArrowLeft"||event.key==="ArrowRight"){event.preventDefault();const next=cycle==="Monthly" ? "Yearly" : "Monthly";setCycle(next);event.currentTarget.querySelector<HTMLButtonElement>(`[data-cycle="${next}"]`)?.focus();}}}>{(["Monthly","Yearly"] as const).map(value=><button type="button" className="ui-seg__opt" key={value} data-cycle={value} role="radio" aria-checked={cycle===value} data-active={cycle===value ? "" : undefined} tabIndex={cycle===value ? 0 : -1} onClick={()=>setCycle(value)}>{cycle===value && <motion.span className="settings-cycle-pill" layoutId="billing-frequency" transition={{type:"spring",stiffness:450,damping:38}} />}<span className="ui-seg__content"><span className="ui-seg__label"><span className="ui-seg__text">{uiText(value)}</span><span className="ui-seg__text ui-seg__text-bold" aria-hidden="true">{uiText(value)}</span></span>{value==="Yearly" && <span className="ui-seg__badge">−20%</span>}</span></button>)}</div></div></div></div>
          <QueryNotice query={plansQuery} what="plans" />
          {plansQuery.phase === "ready" && <div className="ui-sb-plans">{plans.map(item=>{const current=plan.name===item.name && billing.cycle===cycle;return <div className="ui-sb-card ui-sb-tier" key={item.name} data-current={plan.name===item.name ? "" : undefined}><div className="ui-sb-tier__top"><b>{item.name}</b>{plan.name===item.name && <span className="ui-sb-pill">{uiText("Current")}</span>}</div><div className="ui-sb-tier__price"><strong>$<AnimatedNumber value={price(item)} format={formatPrice} /></strong><span>{uiText(cycle==="Yearly" ? uiText("/ month, billed yearly") : uiText("/ month"))}</span></div><p className="ui-sb-muted">{uiText(item.description)}</p><ul className="ui-sb-tier__list">{item.features.map(text=><li key={text}><Check size={14} />{uiText(text)}</li>)}</ul><button type="button" className="ui-button" data-variant={item.name==="Team" ? "primary" : "secondary"} data-size="sm" disabled={current} onClick={()=>setSelected(item)}><span className="ui-button__label">{current ? uiText("Current plan") : plan.name===item.name ? uiText("Switch to {0}", [uiText(cycle)]) : uiText("Switch to {0}", [item.name])}</span></button></div>;})}</div>}
        </section>
        <section className="ui-sb-section"><div className="ui-sb-section__head"><h2 className="ui-sb-h2">{uiText("Invoices")}</h2><button type="button" className="ui-button" data-variant="secondary" data-size="sm" onClick={()=>exportInvoices()}><span className="ui-button__icon"><Download size={15} /></span><span className="ui-button__label">{uiText("Download all")}</span></button></div>{invoicesQuery.phase === "loading" ? <QueryNotice query={invoicesQuery} what="invoices" /> : <><QueryNotice query={invoicesQuery} what="invoices" /><div className="ui-sb-table-wrap" tabIndex={0} role="region" aria-label={uiText("Invoice history")}><table className="ui-sb-table"><thead><tr><th scope="col">{uiText("Date")}</th><th scope="col">{uiText("Invoice")}</th><th scope="col" className="ui-sb-num">{uiText("Amount")}</th><th scope="col">{uiText("Status")}</th><th scope="col" className="ui-sb-end"><span className="settings-sr-only">{uiText("Download")}</span></th></tr></thead><tbody>{invoices.map(item=><tr key={item.id}><td>{uiText(item.date)}</td><td className="ui-sb-mono">{uiText(item.id)}</td><td className="ui-sb-num">${uiText(item.amount.toFixed(2))}</td><td><span className="ui-sb-pill" data-tone={item.status==="Due" ? "amber" : "green"}>{uiText(item.status)}</span></td><td className="ui-sb-end"><button type="button" className="ui-as-tool" aria-label={uiText("Download {0}", [item.id])} onClick={()=>exportInvoices(item.id)}><Icon name={`Download ${item.id}`} /></button></td></tr>)}</tbody></table></div></>}</section>
      </>}
    </motion.div></AnimatePresence>
    <WorkspaceDialog open={paymentOpen} title={uiText("Update payment method")} onClose={()=>setPaymentOpen(false)}><form key={paymentOpen ? `${billing.last4}:${billing.expiry}` : "closed"} className="settings-dialog-form" onSubmit={event=>{event.preventDefault();const data=new FormData(event.currentTarget);setBilling({...billing,last4:String(data.get("last4")),expiry:String(data.get("expiry"))});setPaymentOpen(false);notify("Demo payment method updated");}}><p>{uiText("Update the card shown in this local demo. No payment is processed.")}</p><label>{uiText("Card ending")}<input className="ui-sb-input" name="last4" aria-label={uiText("Card ending")} inputMode="numeric" pattern="[0-9]{4}" maxLength={4} required defaultValue={billing.last4} /></label><label>{uiText("Expiry")}<input className="ui-sb-input" name="expiry" type="month" min="2026-10" required defaultValue={billing.expiry} /></label><div className="ui-sb-actions"><button type="button" className="ui-button" data-variant="secondary" data-size="sm" onClick={()=>setPaymentOpen(false)}><span className="ui-button__label">{uiText("Cancel")}</span></button><button type="submit" className="ui-button" data-variant="primary" data-size="sm"><span className="ui-button__icon"><CreditCard size={15} /></span><span className="ui-button__label">{uiText("Save payment method")}</span></button></div></form></WorkspaceDialog>
    <WorkspaceDialog open={selected!==null} title={uiText("Change plan")} onClose={()=>setSelected(null)}>{selected && <div className="settings-dialog-form"><p>{uiText("Switch ")}{workspaceName} {uiText(" to ")}<strong>{selected.name}</strong> {uiText(" for ")}<strong>${uiText(price(selected))}{uiText("/month")}</strong>{uiText(", billed ")}{uiText(cycle)}{uiText(cycle==="Yearly" ? uiText(" (${0}/year)", [price(selected)*12]) : "")}.</p><p>{uiText("This updates the local demo. No charge is made.")}</p><div className="ui-sb-actions"><button type="button" className="ui-button" data-variant="secondary" data-size="sm" onClick={()=>setSelected(null)}><span className="ui-button__label">{uiText("Keep ")}{uiText(plan.name)}</span></button><button type="button" className="ui-button" data-variant="primary" data-size="sm" onClick={()=>{setBilling({...billing,plan:selected.name,cycle,canceled:false});setSelected(null);notify(`Switched to ${selected.name} · billed ${cycle.toLowerCase()}`);}}><span className="ui-button__label">{uiText("Confirm switch")}</span></button></div></div>}</WorkspaceDialog>
  </div></LayoutGroup>;
}
