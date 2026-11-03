export function subscribeLocation(listener: () => void) {
  window.addEventListener("popstate", listener);
  return () => window.removeEventListener("popstate", listener);
}

/** Keep native link behaviors (new tab, copy link) while navigating the workspace locally. */
export function navigateWorkspaceHref(href: string) {
  // A separate page must go through a document navigation; pushState only updates this workspace's state.
  if (new URL(href, window.location.href).pathname !== window.location.pathname) {
    window.location.assign(href);
    return;
  }
  window.history.pushState({}, "", href);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
