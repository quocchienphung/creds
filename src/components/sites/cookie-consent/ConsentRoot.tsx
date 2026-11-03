"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CookieConsent } from "./CookieConsent";
import type { CookieConsentHandle } from "./CookieConsent";

export const CONSENT_STORAGE_KEY = "logio-cookie-consent";
/** Links that mean "let me change my cookie choice": the footer's, and anything marked with the attribute. */
const SETTINGS_LINK = '[data-cookie-settings], [data-analytics-label="global_footer__cookie_settings"]';
/** Full-screen moments that a bar over the bottom of the page would spoil. */
const QUIET_ROUTES = ["/guide"];

const isDark = () => {
  const root = document.documentElement;
  return root.dataset.theme === "dark" || root.classList.contains("dark") || !!document.querySelector('.crm-page[data-theme="dark"]');
};

/** Mounted once in the root layout: the consent bar for the whole site, with the dark theme followed and the footer's Cookie settings link wired. */
export function ConsentRoot() {
  const handle = useRef<CookieConsentHandle>(null);
  const pathname = usePathname();
  const [dark, setDark] = useState(false);
  const quiet = QUIET_ROUTES.some(route => pathname === route || pathname.startsWith(`${route}/`));

  useEffect(() => {
    const read = () => setDark(isDark());
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    observer.observe(document.body, { attributes: true, attributeFilter: ["data-theme", "class"], subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const click = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest(SETTINGS_LINK) : null;
      if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      handle.current?.openPreferences();
    };
    // On window, like the page-transition runtime that stops link clicks from reaching document: both listen in the capture phase on window
    window.addEventListener("click", click, true);
    return () => window.removeEventListener("click", click, true);
  }, []);

  if (quiet) return null;
  return <CookieConsent ref={handle} storageKey={CONSENT_STORAGE_KEY} version="1" theme={dark ? "dark" : "light"} />;
}
