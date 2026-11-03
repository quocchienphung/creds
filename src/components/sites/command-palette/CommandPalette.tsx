"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import { CommandPanel } from "./CommandPanel";
import { navigationItems, type NavigationItem } from "./navigation-items";
import "./command-palette.css";

export function CommandPalette() {
  const { t: uiText } = useWorkspaceI18n();
  const [open,setOpen]=useState(false);
  const [dark,setDark]=useState(false);
  const dialog=useRef<HTMLDialogElement>(null);
  const openRef=useRef(false);
  const returnTo=useRef<HTMLElement | null>(null);
  const navigating=useRef(false);
  const pointerOutside=useRef(false);
  const close=useCallback(()=>{openRef.current=false;setOpen(false);},[]);

  useEffect(()=>{
    const key=(event:KeyboardEvent)=>{
      // The requested shortcut is bare Tab only, including from forms and other dialogs.
      // Once open, native Tab/Shift+Tab cycles its input and close/clear controls.
      if(event.key!=="Tab" || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.repeat || event.isComposing || openRef.current)return;
      event.preventDefault();event.stopImmediatePropagation();
      returnTo.current=document.activeElement instanceof HTMLElement ? document.activeElement : null;
      navigating.current=false;
      setDark(document.documentElement.dataset.theme==="dark" || document.documentElement.classList.contains("dark") || !!document.querySelector('.crm-page[data-theme="dark"]'));
      openRef.current=true;setOpen(true);
    };
    window.addEventListener("keydown",key,true);
    const node=dialog.current;
    if(node)node.dataset.ready="true";
    return()=>{window.removeEventListener("keydown",key,true);if(node)delete node.dataset.ready;};
  },[]);

  useLayoutEffect(()=>{
    if(!open)return;
    const node=dialog.current;if(!node)return;
    if(!node.open)node.showModal();
    node.querySelector<HTMLInputElement>('input[role="combobox"]')?.focus({preventScroll:true});
    const previous=document.documentElement.style.overflow;
    document.documentElement.style.overflow="hidden";
    return()=>{document.documentElement.style.overflow=previous;};
  },[open]);

  const finishClose=()=>{
    // A new Tab during the exit cancels dismissal of that new panel.
    if(openRef.current)return;
    dialog.current?.close();
    if(!navigating.current && returnTo.current?.isConnected)returnTo.current.focus({preventScroll:true});
  };

  function select(item:NavigationItem){
    navigating.current=true; close();
    let target=new URL(item.href,window.location.origin);
    const workspace=["/personalize"].includes(window.location.pathname) && !!document.querySelector(".crm-page");
    if(item.group==="Settings" && workspace){
      const current=new URL(window.location.href);
      current.searchParams.set("settings",target.searchParams.get("settings") ?? "general");
      current.searchParams.delete("settings-tab");
      if(current.searchParams.get("section")==="settings")current.searchParams.delete("section");
      target=current;
    }
    // Workspace sections subscribe to popstate; use that contract so active runs/editors stay mounted.
    if(target.pathname===window.location.pathname && workspace){
      if(target.href!==window.location.href){window.history.pushState({},"",target);window.dispatchEvent(new PopStateEvent("popstate"));}
    }else if(target.href!==window.location.href){window.location.assign(target.href);}
  }

  return <dialog ref={dialog} className="cp-dialog" data-theme={dark?"dark":"light"} data-closing={!open || undefined} aria-label={uiText("Navigate pages")} aria-modal="true" onCancel={event=>{event.preventDefault();close();}} onKeyDown={event=>{event.stopPropagation();if(event.key==="Escape" && !event.nativeEvent.isComposing){event.preventDefault();close();}}} onPointerDown={event=>{pointerOutside.current=event.target===event.currentTarget;}} onClick={event=>{if(event.target===event.currentTarget && pointerOutside.current)close();pointerOutside.current=false;}}>
    <AnimatePresence onExitComplete={finishClose}>{open && <CommandPanel key="palette" items={navigationItems} onSelect={select} onClose={close} />}</AnimatePresence>
  </dialog>;
}
