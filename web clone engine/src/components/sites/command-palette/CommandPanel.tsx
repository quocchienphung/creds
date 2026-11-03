"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { animate, motion, useMotionValue, useReducedMotion } from "motion/react";
import { BookOpen, ChartNoAxesCombined, Code, Compass, CreditCard, FileText, Folder, House, MessageSquare, Search, Settings, Shield, Users, Workflow, X } from "lucide-react";
import { searchNavigation, type NavigationItem, type NavigationMatch } from "./navigation-items";

// Fits of rendered preview samples, unit mass; estimates documented in source/spring-fit.json.
export const paletteSpring = { type: "spring", stiffness: 165, damping: 25.5 } as const;
const cursorSpring = { type: "spring", stiffness: 390, damping: 39 } as const;
const icons = { home: House, compass: Compass, page: FileText, card: CreditCard, chart: ChartNoAxesCombined, code: Code, settings: Settings, users: Users, workflow: Workflow, chat: MessageSquare, folder: Folder, book: BookOpen, shield: Shield };

function MatchedLabel({ match }: { match: NavigationMatch }) {
  const positions = new Set(match.positions);
  return <>{[...match.item.label].map((char,i) => positions.has(i) ? <strong key={i}>{char}</strong> : <span key={i}>{char}</span>)}</>;
}

/** Independent reconstruction of the public inline panel; its modal host owns global shortcuts. */
export function CommandPanel({ items, onSelect, onClose }: {
  items: readonly NavigationItem[]; onSelect: (item: NavigationItem) => void; onClose: () => void;
}) {
  const { t: uiText } = useWorkspaceI18n();
  const reduced = useReducedMotion();
  const id = useId();
  const [query, setQuery] = useState("");
  const localizedItems = useMemo(() => items.map(item => ({ ...item, label: uiText(item.label), description: uiText(item.description), keywords: [...(item.keywords ?? []), item.label, item.description] })), [items, uiText]);
  const matches = useMemo(()=>searchNavigation(localizedItems,query),[localizedItems,query]);
  const [selected, setSelected] = useState<string | null>(null);
  const active = matches.find(match=>match.item.id === selected) ?? matches[0];
  const groups = [...new Set(matches.map(match=>match.item.group))];
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const rows = useRef(new Map<string,HTMLButtonElement>());
  const oldPositions = useRef(new Map<string,number>());
  const [height, setHeight] = useState(342);
  const frameHeight=useMotionValue(342);
  const frameReady=useRef(false);
  const cursorY=useMotionValue(0), cursorHeight=useMotionValue(38);
  const cursorReady=useRef(false);
  const keyboard = useRef(false);
  const [maxHeight,setMaxHeight] = useState(342);

  useLayoutEffect(()=>{
    const measure=()=>setMaxHeight(Math.max(76,Math.min(342,window.innerHeight-88)));
    measure(); window.addEventListener("resize",measure);
    return ()=>window.removeEventListener("resize",measure);
  },[]);

  // Observe intrinsic content, independently of the animated and scrollable frame.
  useLayoutEffect(()=>{
    const node=content.current; if(!node)return;
    const measure=()=>{
      // Child layout effects run before the host calls showModal(). A hidden dialog measures zero;
      // wait for ResizeObserver's visible measurement rather than animating that zero-sized target.
      if(!node.getClientRects().length)return;
      if(!oldPositions.current.size)rows.current.forEach((row,key)=>oldPositions.current.set(key,row.offsetTop+(row.offsetParent instanceof HTMLElement ? row.offsetParent.offsetTop : 0)));
      setHeight(Math.min(maxHeight,Math.round(node.getBoundingClientRect().height+12)));
    };
    measure(); const observer=new ResizeObserver(measure); observer.observe(node);
    return ()=>observer.disconnect();
  },[maxHeight]);

  useLayoutEffect(()=>{
    // The native dialog starts display:none. Supply the first measured size directly, so Motion
    // does not mistake that hidden box for a zero-height panel and spring it open from zero.
    if(!frameReady.current || reduced){frameHeight.set(height);frameReady.current=true;return;}
    const control=animate(frameHeight,height,{type:"spring",stiffness:150,damping:28});
    return ()=>control.stop();
  },[height,reduced,frameHeight]);

  useLayoutEffect(()=>{
    const node=rows.current.get(active?.item.id ?? "");
    if(!node)return;
    let controls: ReturnType<typeof animate>[]=[];
    const measure=()=>{
      if(!node.getClientRects().length)return;
      // offsetTop is measured without transforms from the previous row animation.
      const y=node.offsetTop+(node.offsetParent instanceof HTMLElement ? node.offsetParent.offsetTop : 0);
      controls.forEach(control=>control.stop());controls=[];
      if(!cursorReady.current || reduced){cursorY.set(Math.round(y));cursorHeight.set(node.offsetHeight);cursorReady.current=true;}
      else {controls.push(animate(cursorY,Math.round(y),cursorSpring),animate(cursorHeight,node.offsetHeight,cursorSpring));}
      if(keyboard.current && list.current){
        const scroller=list.current;
        if(y<scroller.scrollTop)scroller.scrollTop=y;
        else if(y+node.offsetHeight>scroller.scrollTop+scroller.clientHeight)scroller.scrollTop=y+node.offsetHeight-scroller.clientHeight;
      }
    };
    measure(); const observer=new ResizeObserver(measure);observer.observe(node);
    return ()=>{observer.disconnect();controls.forEach(control=>control.stop());};
  },[active?.item.id,matches,maxHeight,height,reduced,cursorY,cursorHeight]);

  useLayoutEffect(()=>{
    if(!content.current?.getClientRects().length)return;
    const next=new Map<string,number>(), animations: ReturnType<typeof animate>[]=[];
    const elements=[...rows.current.entries()];
    elements.forEach(([key,node])=>{
      const y=node.offsetTop+(node.offsetParent instanceof HTMLElement ? node.offsetParent.offsetTop : 0);
      next.set(key,y); const previous=oldPositions.current.get(key);
      // Long jumps snap; nearby surviving rows glide like the public preview.
      if(!reduced && previous !== undefined && Math.abs(previous-y)>1 && Math.abs(previous-y)<=80){
        animations.push(animate(node,{y:[previous-y,0]},cursorSpring));
      }
    });
    oldPositions.current=next;
    return ()=>{animations.forEach(animation=>animation.stop());elements.forEach(([,node])=>{node.style.transform="none";});};
  },[matches,reduced]);

  function changeQuery(value:string){keyboard.current=true;setSelected(null);setQuery(value);if(list.current)list.current.scrollTop=0;}
  function onKeyDown(event:KeyboardEvent<HTMLInputElement>){
    if(event.nativeEvent.isComposing)return;
    if(event.key==="Escape"){
      event.preventDefault();event.stopPropagation();
      if(query)changeQuery("");else onClose();
      return;
    }
    if(event.key==="Enter"){
      event.preventDefault(); if(active)onSelect(active.item); return;
    }
    if(!["ArrowDown","ArrowUp","Home","End"].includes(event.key))return;
    event.preventDefault(); if(!matches.length)return;
    keyboard.current=true;
    const current=matches.findIndex(m=>m.item.id===active?.item.id);
    const index=event.key==="Home" ? 0 : event.key==="End" ? matches.length-1 : (current+(event.key==="ArrowDown"?1:-1)+matches.length)%matches.length;
    setSelected(matches[index].item.id);
  }

  return <motion.div className="cp-palette" data-interaction-own="" initial={reduced ? false : {opacity:0,y:6,scale:.98}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,...(reduced ? {} : {y:4,scale:.985}),transition:{duration:.13,ease:[.22,1,.36,1]}}} transition={{...paletteSpring,opacity:{duration:.16,ease:[.16,1,.3,1]}}}>
    <div className="cp-search">
      <span className="cp-search-icon"><Search size={18} strokeWidth={1.75} aria-hidden="true" /></span>
      <label className="cp-sr" htmlFor={id}>{uiText("Navigate pages")}</label>
      <input ref={input} id={id} role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls={`${id}-results`} aria-activedescendant={active ? `${id}-${active.item.id}` : undefined} autoFocus autoComplete="off" spellCheck={false} placeholder={uiText("Search pages")} value={query} onChange={e=>changeQuery(e.target.value)} onKeyDown={onKeyDown} />
      {query && <button className="cp-clear" type="button" aria-label={uiText("Clear search")} onClick={()=>{changeQuery("");input.current?.focus();}}><X size={15} aria-hidden="true" /></button>}
      <button className="cp-close" type="button" aria-label={uiText("Close command palette")} onClick={onClose}>{uiText("Esc")}</button>
      <kbd className="cp-key">{uiText("Tab")}</kbd>
    </div>
    <motion.div className="cp-frame" style={{height:frameHeight}}>
      <div className="cp-results" ref={list} id={`${id}-results`} role="listbox" aria-label={uiText("Pages")} style={{maxHeight}}>
        {active && <motion.span className="cp-highlight" aria-hidden="true" style={{y:cursorY,height:cursorHeight}} />}
        <div className="cp-content" ref={content}>
          {groups.map(group=><div className="cp-group" role="group" aria-label={uiText(group)} key={group}>
            <span className="cp-heading" aria-hidden="true">{uiText(group)}</span>
            {matches.filter(match=>match.item.group===group).map(match=>{
              const Icon=icons[match.item.icon]; const isActive=match.item.id===active?.item.id;
              return <button ref={node=>{if(node)rows.current.set(match.item.id,node);else rows.current.delete(match.item.id);}} type="button" className="cp-result" role="option" aria-selected={isActive} id={`${id}-${match.item.id}`} data-href={match.item.href} key={match.item.id} tabIndex={-1} onPointerMove={event=>{if(event.pointerType!=="touch"){keyboard.current=false;setSelected(match.item.id);}}} onPointerDown={event=>{if(event.pointerType==="mouse")event.preventDefault();}} onClick={()=>onSelect(match.item)}>
                <span className="cp-item-icon"><Icon size={16} strokeWidth={2} aria-hidden="true" /></span>
                <span className="cp-copy"><span className="cp-label"><MatchedLabel match={match} /></span><span className="cp-description">{uiText(match.item.description)}</span></span>
              </button>;
            })}
          </div>)}
          {!matches.length && <div className="cp-empty"><span className="cp-empty-icon"><Search size={20} strokeWidth={1.75} aria-hidden="true" /></span><p>{uiText("No results for “")}{uiText(query)}”</p><span>{uiText("Try a different word or clear the search.")}</span></div>}
        </div>
      </div>
    </motion.div>
    <span className="cp-sr" role="status" aria-live="polite">{uiText(matches.length ? uiText("{0} {1} found", [matches.length, matches.length===1?"page":"pages"]) : uiText("No results"))}</span>
  </motion.div>;
}
