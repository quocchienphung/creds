"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { MenuSurface } from "@/components/interaction/MenuSurface";

import { memo, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence } from "motion/react";
import { Check, Copy, Download, Link2, MessageSquare, Pencil, Share2, X } from "lucide-react";
import { WorkspaceDialog } from "../affectui-crm/WorkspaceDialog";
import { downloadFile } from "../affectui-crm/workspace-state";
import { RunPlan } from "./RunPlan";
import { RunActivity } from "./RunActivity";
import { RunDraft } from "./RunDraft";
import { RunApproval } from "./RunApproval";
import { RunIcon } from "./RunIcon";
import { RunClock } from "./RunClock";
import { useRunEngine } from "./useRunEngine";
import { runTitle } from "./run-seed";
import { subscribeLocation } from "../guide-navigation/navigation-model";
import "./run-reference.css";
import "./run-plan-activity.css";
import "./run-overrides.css";

const MemoDraft=memo(RunDraft);
const MemoApproval=memo(RunApproval);
const clock=(ms:number)=>`${Math.floor(ms/60000)}:${String(Math.floor(ms/1000)%60).padStart(2,"0")}`;
const chatSnapshot=()=>new URLSearchParams(window.location.search).get("panel")==="chat";

export function AgentRun({workspaceId,userName,notify}:{workspaceId:string;userName:string;notify:(message:string)=>void}){
  const { t: uiText } = useWorkspaceI18n();
  const {snapshot,dispatch,restart,replay}=useRunEngine(workspaceId);
  const [panelOpen,setPanelOpen]=useState(true);
  const [overlay,setOverlay]=useState(false);
  const [options,setOptions]=useState(false);
  const [editing,setEditing]=useState(false);
  const [dialog,setDialog]=useState<"share"|"chat"|null>(null);
  const chatRoute=useSyncExternalStore(subscribeLocation,chatSnapshot,()=>false);
  const [draft,setDraft]=useState("");
  const root=useRef<HTMLDivElement>(null),panel=useRef<HTMLElement>(null),menu=useRef<HTMLSpanElement>(null),panelToggle=useRef<HTMLButtonElement>(null);
  const phase=snapshot.phase;
  const active=snapshot.steps.find(step=>step.id===snapshot.activeId);
  const approvalStep=snapshot.steps.find(step=>step.approval && (snapshot.states[step.id]?.status==="waiting" || snapshot.approvals[step.id]));
  const pending=phase==="waiting" && !!approvalStep;
  const status={running:"Running",waiting:"Needs input",done:"Done",stopped:"Stopped"}[phase];
  const totalCalls=snapshot.steps.reduce((sum,step)=>sum+step.calls.length,0);

  useEffect(()=>{
    let disposed=false;
    queueMicrotask(()=>{if(!disposed)setDialog(chatRoute ? "chat" : null);});
    return()=>{disposed=true;};
  },[chatRoute]);

  const showPanel=useCallback(()=>setPanelOpen(true),[]);
  const approve=useCallback(()=>{if(snapshot.activeId){dispatch({type:"approve",id:snapshot.activeId,now:Date.now()});notify("Approval recorded for this simulated run");}},[dispatch,notify,snapshot.activeId]);
  const deny=useCallback(()=>{if(snapshot.activeId){dispatch({type:"deny",id:snapshot.activeId,now:Date.now()});notify("Step denied – run stopped");}},[dispatch,notify,snapshot.activeId]);
  function closePanel(){setPanelOpen(false);requestAnimationFrame(()=>panelToggle.current?.focus());}
  function again(){setEditing(false);restart();}
  async function copyLink(){try{await navigator.clipboard.writeText(window.location.href);notify("Run link copied");}catch{setDialog("share");}}
  function exportRun(){downloadFile("board-prep-run.json",JSON.stringify({title:runTitle,simulation:true,...snapshot,draft},null,2),"application/json;charset=utf-8");notify("Run snapshot downloaded");}

  useEffect(()=>{
    const el=root.current;if(!el)return;
    let first=true;
    const observer=new ResizeObserver(entries=>{const narrow=entries[0].contentRect.width<=1000;setOverlay(narrow);if(first){setPanelOpen(!narrow);first=false;}});
    observer.observe(el);return()=>observer.disconnect();
  },[]);
  useEffect(()=>{
    if(!options)return;
    const outside=(event:PointerEvent)=>{if(event.target instanceof Node&&!menu.current?.contains(event.target))setOptions(false);};
    document.addEventListener("pointerdown",outside);return()=>document.removeEventListener("pointerdown",outside);
  },[options]);
  useEffect(()=>{
    const keys=(event:KeyboardEvent)=>{
      if(document.querySelector('dialog[open]'))return;
      const target=event.target instanceof Element ? event.target : null;
      const typing=!!target?.closest('input,textarea,[contenteditable="true"]');
      if(event.key==="Escape"){
        if(typing)return;
        if(options){setOptions(false);menu.current?.querySelector<HTMLButtonElement>("button")?.focus();return;}
        if(target?.closest('.ui-df__chg,.ui-df__pop'))return;
        if(pending){event.preventDefault();deny();return;}
        if(overlay&&panelOpen){setPanelOpen(false);requestAnimationFrame(()=>panelToggle.current?.focus());}
      }
      if(!typing&&pending&&(event.metaKey||event.ctrlKey)&&event.key==="Enter"){event.preventDefault();approve();}
      if(event.key==="Tab"&&overlay&&panelOpen&&panel.current){
        const items=[...panel.current.querySelectorAll<HTMLElement>('button:not(:disabled),[tabindex="0"],a[href],input')].filter(el=>el.getClientRects().length>0);
        if(!items.length)return;const first=items[0],last=items.at(-1);
        if(event.shiftKey&&(document.activeElement===first||!panel.current.contains(document.activeElement))){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&(document.activeElement===last||!panel.current.contains(document.activeElement))){event.preventDefault();first.focus();}
      }
    };
    document.addEventListener("keydown",keys);return()=>document.removeEventListener("keydown",keys);
  },[approve,deny,pending,overlay,panelOpen,options]);
  useEffect(()=>{
    if(!overlay||!panelOpen)return;
    const frame=requestAnimationFrame(()=>panel.current?.querySelector<HTMLButtonElement>('button')?.focus());return()=>cancelAnimationFrame(frame);
  },[overlay,panelOpen]);

  return <div className="ui-ar" ref={root} data-phase={phase}>
    <div className="ui-ar__main" inert={overlay&&panelOpen}>
      <header className="ui-ar__bar"><div className="ui-ar__crumbs"><RunIcon name="ui-ar__crumbs" /><span>{uiText("Runs")}</span><i>/</i><b>{uiText(runTitle)}</b><span className="ui-ar__pill" data-phase={phase}><span />{uiText(status)}</span></div><div className="ui-ar__tools"><span className="ui-ar__time"><RunIcon name="ui-ar__time" />{phase==="done" ? uiText("Done in {0}s", [Math.round(snapshot.elapsed/1000)]) : <>{uiText("Started ")}{snapshot.startedAt ? new Date(snapshot.startedAt).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}) : uiText("9:14 AM")} · <RunClock base={snapshot.elapsed} waitingSince={phase==="waiting" ? snapshot.waitStartedAt : undefined} format={clock} /></>}</span><button type="button" className="ui-button" data-variant={phase==="running"||phase==="waiting" ? "secondary" : "primary"} data-size="sm" onClick={()=>{if(phase==="running"||phase==="waiting"){dispatch({type:"stop",now:Date.now()});notify("Run stopped");}else again();}}><span className="ui-button__icon">{phase==="running"||phase==="waiting" ? <RunIcon name="Stop run" /> : <RunIcon name="Run again" />}</span><span className="ui-button__label">{uiText(phase==="running"||phase==="waiting" ? uiText("Stop run") : uiText("Run again"))}</span></button><span className="ui-as-anchor" ref={menu}><button type="button" className="ui-as-icon-btn" aria-label={uiText("Run options")} aria-haspopup="menu" aria-expanded={options} onKeyDown={event=>{if(event.key==="ArrowDown"||event.key==="ArrowUp"){event.preventDefault();setOptions(true);requestAnimationFrame(()=>{const items=menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled):not([aria-disabled="true"])');items?.[event.key==="ArrowUp" ? items.length-1 : 0]?.focus();});}}} onClick={()=>setOptions(!options)}><RunIcon name="Run options" /></button><AnimatePresence>{options && <MenuSurface className="ui-as-popover ui-as-menu run-options" role="menu" aria-label={uiText("Run options")} onKeyDown={event=>{
          if(!["ArrowDown","ArrowUp","Home","End"].includes(event.key))return;event.preventDefault();const items=[...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled):not([aria-disabled="true"])')],index=items.indexOf(document.activeElement as HTMLButtonElement);items[event.key==="Home" ? 0 : event.key==="End" ? items.length-1 : (index+(event.key==="ArrowDown" ? 1 : -1)+items.length)%items.length]?.focus();
        }}><button type="button" role="menuitem" className="ui-as-menu__item" onClick={()=>{setOptions(false);void copyLink();}}><Link2 size={14} />{uiText("Copy run link")}</button><button type="button" role="menuitem" className="ui-as-menu__item" onClick={()=>{setOptions(false);setDialog("share");}}><Share2 size={14} />{uiText("Share")}</button><button type="button" role="menuitem" className="ui-as-menu__item" onClick={()=>{setOptions(false);setDialog("chat");}}><MessageSquare size={14} />{uiText("View in Chat")}</button><button type="button" role="menuitem" className="ui-as-menu__item" onClick={()=>{setOptions(false);if(!editing)dispatch({type:"stop",now:Date.now()});setEditing(!editing);}}>{editing ? <Check size={14} /> : <Pencil size={14} />}{uiText(editing ? uiText("Finish editing") : uiText("Edit plan"))}</button></MenuSurface>}</AnimatePresence></span><button ref={panelToggle} type="button" className="ui-as-icon-btn" aria-label={uiText(panelOpen ? uiText("Hide side panel") : uiText("Show side panel"))} aria-pressed={panelOpen} aria-controls="run-side-panel" onClick={()=>setPanelOpen(!panelOpen)}><RunIcon name="Hide side panel" /></button></div></header>
      <div className="ui-ar__scroll"><div className="ui-ar__column"><RunPlan title={uiText(runTitle)} snapshot={snapshot} editing={editing} onRename={(id,title)=>dispatch({type:"rename",id,title})} onMove={(id,direction)=>dispatch({type:"move",id,direction})} onRemove={id=>dispatch({type:"remove",id})} onAdd={title=>dispatch({type:"add",step:{id:crypto.randomUUID(),title,detail:"Custom workspace step",tool:"workspace.task",calls:[{name:"workspace.task",summary:title,icon:"document",args:{task:title},result:{ok:true},duration:800}]}})} onRetry={id=>{setEditing(false);dispatch({type:"retry",id,now:Date.now()});}} /><RunActivity snapshot={snapshot} onShowApproval={showPanel} notify={notify} /></div></div>
    </div>
    {panelOpen && <div className="ui-ar__scrim" aria-hidden="true" onClick={closePanel} />}
    <aside className="ui-ar__panel" id="run-side-panel" aria-label={uiText("Run details and approvals")} role={overlay&&panelOpen ? "dialog" : undefined} aria-modal={overlay&&panelOpen ? true : undefined} ref={panel} hidden={!panelOpen}>
      <header className="ui-ar__bar"><b>{uiText("Needs your input")}</b><div className="ui-ar__tools">{pending && <span className="ui-ar__count">1</span>}<button type="button" className="ui-as-icon-btn run-panel-close" aria-label={uiText("Close side panel")} onClick={closePanel}><X size={16} /></button></div></header>
      <div className="ui-ar__panel-body"><section className="ui-ar__section">{approvalStep ? <MemoApproval step={approvalStep} index={snapshot.steps.indexOf(approvalStep)} decision={snapshot.approvals[approvalStep.id]} onApprove={approve} onDeny={deny} /> : <div className="ui-ar__quiet"><span><RunIcon name="ui-ar__quiet" /></span><b>{uiText("Nothing needs you yet")}</b><p>{uiText("The agent asks here before it sends or books anything.")}</p></div>}</section><section className="ui-ar__section"><span className="ui-ar__label">{uiText("Draft")}</span><MemoDraft key={workspaceId} workspaceId={workspaceId} resetKey={replay} notify={notify} onTextChange={setDraft} /></section><section className="ui-ar__section"><span className="ui-ar__label">{uiText("Details")}</span><dl className="ui-ar__details">{[["Agent","Board prep"],["Triggered by",userName],["Tool calls",String(totalCalls)],["Cost","$0.14"]].map(([label,value])=><div key={label}><dt><RunIcon name={label} />{uiText(label)}</dt><dd>{uiText(value)}</dd></div>)}</dl></section></div>
    </aside>
    <WorkspaceDialog open={dialog==="share"} title={uiText("Share run")} onClose={()=>setDialog(null)}><div className="run-dialog"><p>{uiText("The link opens this workflow. Its progress and draft are stored in this browser. Download a snapshot to share the current results.")}</p><label className="crm-field">{uiText("Run link")}<input readOnly value={typeof window==="undefined" ? "" : window.location.href} onFocus={event=>event.currentTarget.select()} /></label><div className="workspace-form-actions"><button type="button" className="ui-button" data-variant="secondary" data-size="sm" onClick={()=>void copyLink()}><span className="ui-button__icon"><Copy size={14} /></span><span className="ui-button__label">{uiText("Copy link")}</span></button><button type="button" className="ui-button" data-variant="primary" data-size="sm" onClick={exportRun}><span className="ui-button__icon"><Download size={14} /></span><span className="ui-button__label">{uiText("Download snapshot")}</span></button></div></div></WorkspaceDialog>
    <WorkspaceDialog open={dialog==="chat"} title={uiText("Run conversation")} onClose={()=>setDialog(null)} wide><div className="run-dialog"><p className="workspace-muted">{uiText("Local simulation transcript · no external tools or messages are sent.")}</p><div className="run-chat-goal"><b>{userName}</b><p>{uiText(runTitle)}</p></div>{snapshot.steps.filter(step=>snapshot.states[step.id]?.status!=="pending").map(step=><article className="run-chat-step" key={step.id}><b>{uiText("Board prep · ")}{uiText(step.title)}</b><p>{uiText(snapshot.states[step.id].status==="done" ? step.calls.map(call=>call.summary).join(" · ") : snapshot.states[step.id].status==="waiting" ? uiText("Waiting for your approval") : snapshot.states[step.id].status)}</p></article>)}<article className="run-chat-step"><b>{uiText("Draft")}</b><p>{uiText(draft)}</p></article><div className="workspace-form-actions"><button type="button" className="ui-button" data-variant="secondary" data-size="sm" onClick={exportRun}><span className="ui-button__label">{uiText("Download transcript")}</span></button></div></div></WorkspaceDialog>
    <span className="run-sr-only" role="status" aria-live="polite">{uiText(status)}{uiText(active ? uiText(": {0}", [active.title]) : "")}</span>
  </div>;
}
