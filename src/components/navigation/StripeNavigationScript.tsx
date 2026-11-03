import { normalizeStripeNavigation } from "@/lib/stripe-navigation";

/** Keep destinations inserted by DOM controllers local before copying/opening them, too. */
export function stripeNavigationRuntime(normalize: (value: string) => string) {
  const attributes = ["href", "action", "formaction", "data-href", "data-url", "data-submission-url", "data-redirect-url"];
  const selector = "a[href],area[href],form[action],[formaction],[data-href],[data-url],[data-submission-url],[data-redirect-url]";
  function sanitize(element: Element) {
    for (const attribute of attributes) {
      const value = element.getAttribute(attribute);
      if (!value) continue;
      const destination = normalize(value);
      if (destination !== value) element.setAttribute(attribute, destination);
    }
  }
  function scan(root: ParentNode) {
    if (root instanceof Element && root.matches(selector)) sanitize(root);
    root.querySelectorAll(selector).forEach(sanitize);
  }
  scan(document);
  new MutationObserver(records => {
    for (const record of records) {
      if (record.type === "attributes" && record.target instanceof Element) sanitize(record.target);
      else record.addedNodes.forEach(node => {
        if (node instanceof Element) scan(node);
      });
    }
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: attributes });
  // Synchronous event fallback covers a controller assigning a destination during the same task.
  for (const type of ["pointerdown", "focusin", "contextmenu", "click", "auxclick", "submit"]) {
    document.addEventListener(type, event => {
      const target = event.target instanceof Element ? event.target.closest(selector) : null;
      if (target) sanitize(target);
    }, true);
  }
}

/** Mount once in the root head, ahead of the other navigation runtimes. No client bundle needed. */
export function StripeNavigationScript() {
  const script = `(${stripeNavigationRuntime.toString()})(${normalizeStripeNavigation.toString()});`;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
