"use client";

import type { ComponentProps, MouseEvent } from "react";
import { navigateWorkspaceHref } from "./navigation-model";

export function WorkspaceLink({ href, className, children, onClick, ...props }: ComponentProps<"a"> & { href: string }) {
  function follow(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (event.defaultPrevented || event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigateWorkspaceHref(href);
  }
  return <a {...props} className={className} href={href} onClick={follow}>{children}</a>;
}
