/** Navigation policy only. Asset URLs and visible example text are deliberately untouched. */
export function normalizeStripeNavigation(value: string): string {
  let candidate = value.trim();
  // Handle legacy URL-encoded destinations without turning ordinary local paths into URLs.
  for (let index = 0; index < 3 && /^(?:https?%3a|%2f%2f)/i.test(candidate); index += 1) {
    try { candidate = decodeURIComponent(candidate); } catch { break; }
  }
  if (!/^(?:https?:|[\\/]{2})/i.test(candidate)) return value;
  try {
    const url = new URL(candidate, "https://local.invalid");
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    const blockedDomains = ["stripe.com", "stripedemos.com", "stripe.link", "link.com"];
    if (!blockedDomains.some(domain => host === domain || host.endsWith(`.${domain}`))) return value;
    if (host === "dashboard.stripe.com") {
      if (/^\/(?:login|signin)(?:\/|$)/i.test(url.pathname)) return "/login";
      if (/^\/(?:register|signup)(?:\/|$)/i.test(url.pathname)) return "/signup";
    }
    // Drop queries/fragments: return URLs and other nested destinations must never be followed.
    const pathname = url.pathname.split("/").map(segment => {
      try { return encodeURIComponent(decodeURIComponent(segment)); }
      catch { return encodeURIComponent(segment); }
    }).join("/");
    return `/unavailable/stripe/${host}${pathname}`;
  } catch {
    return value;
  }
}
