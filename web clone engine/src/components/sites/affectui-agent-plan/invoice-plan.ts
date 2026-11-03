import { defaultStepMs, effectOf, type PlanStep } from "./plan-model.ts";

/**
 * The invoice engine on top of the plan card: the steps of taking an invoice from draft to paid, the status each
 * finished step puts the invoice in, and a simulated executor. Nothing is sent and nobody is paid: the executor only
 * waits. To drive real work, pass your own `executor` (and `defaultSteps`) to the card; the step list is data.
 */

export type InvoiceStatus = "draft" | "unpaid" | "paid";

export const invoiceStatusLabels: Record<InvoiceStatus, string> = { draft: "Draft", unpaid: "Unpaid", paid: "Paid" };

export const invoiceTitle = "Invoice from draft to paid";

export const defaultInvoiceSteps: readonly Omit<PlanStep, "state">[] = [
  { id: "draft", title: "Draft the invoice", detail: "Client, line items and due date", tool: "invoice.draft", effect: "draft", simulate: { durationMs: 1300 } },
  { id: "review", title: "Review totals and tax", detail: "Subtotal, tax and amount due", tool: "invoice.review", simulate: { durationMs: 1100 } },
  { id: "send", title: "Send it to the client", detail: "Deliver the invoice and mark it unpaid", tool: "invoice.send", effect: "unpaid", simulate: { durationMs: 1400, failOnce: "Delivery failed: the client's mailbox did not accept it" } },
  { id: "wait", title: "Wait for payment", detail: "Track the due date until the money arrives", tool: "payment.watch", simulate: { durationMs: 1800 } },
  { id: "settle", title: "Record the payment", detail: "Mark the invoice paid and close it", tool: "invoice.settle", effect: "paid", simulate: { durationMs: 1000 } },
];

/** The invoice's status after the steps finished so far: draft until a step that sends it, then unpaid, then paid. */
export function invoiceStatusOf(steps: readonly PlanStep[]): InvoiceStatus {
  const status = effectOf(steps, "draft");
  return status === "unpaid" || status === "paid" ? status : "draft";
}

export type PlanExecutor = (step: PlanStep, context: { signal: AbortSignal; attempt: number }) => Promise<{ tookMs?: number } | void>;

/** Waits the step's simulated duration; a step with `failOnce` rejects on its first attempt only. */
export const simulatedExecutor: PlanExecutor = (step, { signal, attempt }) => new Promise((resolve, reject) => {
  const ms = step.simulate?.durationMs ?? defaultStepMs;
  const timer = setTimeout(() => {
    if (step.simulate?.failOnce && attempt === 0) reject(new Error(step.simulate.failOnce)); else resolve({ tookMs: ms });
  }, ms);
  signal.addEventListener("abort", () => { clearTimeout(timer); reject(new DOMException("aborted", "AbortError")); }, { once: true });
});
