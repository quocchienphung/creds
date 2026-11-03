import type { InvoiceData } from "./invoice-model";
import { InvoiceSheetBody } from "./InvoiceBlock";

/** The scene's paper is 560 × 790 of its own units; the invoice sheet is laid out at this width and scaled down to fit it. */
export const SHEET_WIDTH = 748;

/**
 * The paper of the stamping scene: the invoice's own sheet (`InvoiceSheetBody`, the same markup and the same stylesheet as the preview in the
 * page), laid out at its real width and set down on the table at A4 proportions. It is the document, not a picture of it: change a line and the
 * paper changes. The impression is laid over it by the scene, so the sheet is drawn without one.
 */
export function InvoicePaper({ invoice }: { invoice: InvoiceData }) {
  return <div className="ui-iv inv-paper" aria-hidden="true" inert>
    <article className="ui-iv__sheet inv-paper__sheet"><InvoiceSheetBody invoice={invoice} showStamp={false} /></article>
  </div>;
}
