"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { AnimatePresence, LayoutGroup, MotionConfig, motion, useReducedMotion } from "motion/react";
import { MenuSurface } from "@/components/interaction/MenuSurface";
import { ArrowLeft, Braces, Check, FileSpreadsheet, HardDrive, ChevronDown, ChevronRight, Search, X } from "lucide-react";
import { AccountTheme } from "./AccountTheme";
import { AccountLanguage } from "./AccountLanguage";
import { CrmIcon } from "./CrmIcon";
import { SidebarFolder } from "./SidebarFolder";
import { CollateralProvider, useCollateralBadges } from "../collateral/CollateralProvider";
import { useWorkspaceRoute, workspaceSections, type WorkspaceSection } from "./workspace-state";
import { WorkspaceDialog } from "./WorkspaceDialog";
import { WorkspaceEditors, type EditorKind } from "./WorkspaceEditors";
import "./reference.css";
import "./crm-overrides.css";
import "./workspace-interactions.css";
import { useResource } from "@/lib/workspace-backend/react";
import { SyncStatus } from "@/lib/workspace-backend/SyncStatus";
import { resources } from "../workspace-resources";
import { SectionSkeleton } from "../shimmer-loader/SectionSkeleton";
import { revealed } from "../ascii-reveal/AsciiReveal";
import { defaultSettings, mergeSettings, type SettingsValues } from "../settings-command/settings-model";
import type { OverlayRect } from "../settings-command/SettingsOverlay";
import { Skeleton } from "../shimmer-loader/Shimmer";

// The Settings grow out of the account menu over whatever page is open; they are not a page of the sidebar.
const SettingsOverlay=dynamic(()=>import("../settings-command/SettingsOverlay").then(module=>module.SettingsOverlay),{ssr:false});
const ExcelFormation=dynamic(()=>import("../collateral/excel-formation/ExcelFormation").then(module=>revealed(module.ExcelFormation)),{loading:()=> <SectionSkeleton section="Excel formation" />});
const JsonFormation=dynamic(()=>import("../collateral/json-formation/JsonFormation").then(module=>revealed(module.JsonFormation)),{loading:()=> <SectionSkeleton section="JSON formation" />});
const UploadQueue=dynamic(()=>import("../collateral/queue/Queue").then(module=>revealed(module.Queue)),{loading:()=> <SectionSkeleton section="Queue" />});
const seedSettings=defaultSettings("Damenci");
const setupGroups=[
  {title:"Set up your workspace",items:["Name your workspace","Invite your teammates","Connect your first app"]},
  {title:"Start working",items:["Create a folder","Start your first chat","Upload a file"]},
  {title:"Make it yours",items:["Add a profile picture","Choose your notifications"]},
];

export function Crm(props: {workspace?:string;user?:{name:string;avatar?:string};onNavigate?:(label:string)=>void;className?:string}) {
  const [workspaceId]=useResource(resources.activeWorkspace, undefined, "acme");
  return <MotionConfig reducedMotion="user"><CollateralProvider key={workspaceId} workspaceId={workspaceId}><Workspace {...props} /></CollateralProvider></MotionConfig>;
}

function Workspace({workspace="Damenci",user={name:"Damenci"},onNavigate,className=""}:{workspace?:string;user?:{name:string;avatar?:string};onNavigate?:(label:string)=>void;className?:string}) {
  const { t: uiText } = useWorkspaceI18n();
  const { locale, setLocale } = useWorkspaceI18n();
  const badges=useCollateralBadges();
  const [workspaces,setWorkspaces,workspacesSync]=useResource(resources.workspaces, undefined, [{id:"acme",name:workspace},{id:"personal",name:"Personal"}]);
  const [workspaceId,setWorkspaceId,activeSync]=useResource(resources.activeWorkspace, undefined, "acme");
  const workspaceName=workspaces.find(item=>item.id===workspaceId)?.name || workspace;
  const {section,settings,openSettings,closeSettings,navigate:routeTo}=useWorkspaceRoute();
  const [settingsOrigin,setSettingsOrigin]=useState<OverlayRect|null>(null);
  const [profile,,profileSync]=useResource(resources.profile, undefined, {name:user.name,email:"damenci@damenci.com",role:"Head of Sales",avatar:user.avatar});
  const [preferences,setPreferences,preferencesSync]=useResource(resources.preferences, undefined, {dark:false,emailNotifications:true,desktopNotifications:true});
  // Until the workspace, the profile and the preferences have been read once, the page shows its skeleton, not the seed values that
  // would be replaced a moment later (the first thing a reload used to show was the Companies page of the default workspace).
  const coreReady=[workspacesSync,activeSync,profileSync,preferencesSync].every(sync=>sync.phase==="ready");
  const [booted,setBooted]=useState(false);
  if(!booted && coreReady)setBooted(true);
  const booting=!booted;
  const [storedSettings,setStoredSettings]=useResource(resources.commandSettings, workspaceId, seedSettings);
  // The theme lives in the preferences (it paints the whole app) and the name in the workspace list; every other value is the stored copy.
  const savedSettings=useMemo<SettingsValues>(()=>({...mergeSettings(storedSettings,defaultSettings(workspaceName)),workspaceName,language:locale,theme:preferences.theme ?? (preferences.dark ? "dark" : "light")}),[storedSettings,workspaceName,preferences.theme,preferences.dark,locale]);
  const [collapsed,setCollapsed]=useState(false);
  const [drawer,setDrawer]=useState(false);
  const [menu,setMenu]=useState<string|null>(null);
  const [news,setNews]=useResource(resources.news, workspaceId, 2);
  const [guide,setGuide]=useState(false);
  const [guideGroup,setGuideGroup]=useState<string|null>("Set up your workspace");
  const [completed,setCompleted]=useResource(resources.checklist, workspaceId, ["Name your workspace"]);
  const [toast,setToast]=useState<{text:string;id:number}|null>(null);
  const [searchOpen,setSearchOpen]=useState(false);
  const [search,setSearch]=useState("");
  const [editor,setEditor]=useState<EditorKind>("Full changelog");
  const [editorOpen,setEditorOpen]=useState(false);
  const toastTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const reduce=useReducedMotion();
  const sidebarGroups=[{title:"",items:workspaceSections}];
  // The three rules pages share one folder; it opens by itself when one of them is the current page.
  const sidebarFolders=[{id:"collateral",title:"Collateral",items:["Excel formation","JSON formation","Queue"] as const}];
  const [folders,setFolders]=useState<Record<string,boolean>>({});
  const folderOpen=(folder:(typeof sidebarFolders)[number])=>folders[folder.id] ?? (folder.items as readonly string[]).includes(section);
  const navItem=(label:WorkspaceSection)=><button type="button" className="ui-as-side__item" aria-current={section===label ? "page" : undefined} key={label} onClick={()=>navigate(label)}>{section===label && <motion.span className="workspace-nav-pill" layoutId="active-navigation" transition={{type:"spring",stiffness:450,damping:38}} />}{label==="Excel formation" ? <FileSpreadsheet size={16} strokeWidth={1.7} /> : label==="Queue" ? <HardDrive size={16} strokeWidth={1.7} /> : <Braces size={16} strokeWidth={1.7} />}<span className="workspace-nav-label">{uiText(label)}</span>{label==="Excel formation" && badges.open>0 && <span className="ui-as-side__count">{uiText(badges.open)}</span>}{label==="JSON formation" && badges.ready && <span className="collateral-nav-dot" role="img" aria-label={uiText("Ready")} />}</button>;
  const initials=profile.name.split(" ").map(part=>part[0]).slice(0,2).join("");

  function notify(text:string) {
    setToast(current=>({text,id:(current?.id || 0)+1}));
    if(toastTimer.current)clearTimeout(toastTimer.current);
    toastTimer.current=setTimeout(()=>setToast(null),2600);
  }
  function navigate(label:WorkspaceSection) {
    onNavigate?.(label);setDrawer(false);setMenu(null);routeTo(label);
  }
  /** Open the Settings over the current page, growing out of `from` (the box of the menu or pop-up they were opened from). */
  function openSettingsFrom(from:OverlayRect|null,id="1") {
    setSettingsOrigin(from);setMenu(null);setDrawer(false);openSettings(id);
  }
  function applySettings(values:SettingsValues) {
    setLocale(values.language === "vi" ? "vi" : "en");
    const name=values.workspaceName.trim();
    setStoredSettings(values);
    if(name && name!==workspaceName)setWorkspaces(workspaces.map(item=>item.id===workspaceId ? {...item,name} : item));
    setPreferences({...preferences,theme:values.theme,dark:values.theme==="dark" || (values.theme==="system" && window.matchMedia("(prefers-color-scheme: dark)").matches),emailNotifications:values.emailCadence!=="never",desktopNotifications:values.mentions || values.assigned || values.deployFailures});
  }
  function chooseTheme(theme:SettingsValues["theme"]) {
    setPreferences({...preferences,theme,dark:theme==="dark" || (theme==="system" && window.matchMedia("(prefers-color-scheme: dark)").matches)});
  }
  function openEditor(kind:EditorKind) {setMenu(null);setEditor(kind);setEditorOpen(true);}
  function openSearch() {setSearch("");setSearchOpen(true);setMenu(null);}
  function toggleMenu(id:string) {setMenu(current=>current===id ? null : id);}

  // Opening the menu is the cue that the Settings may be next: fetch their code now so the panel can grow out of the menu at once.
  useEffect(()=>{if(menu==="user")void import("../settings-command/SettingsOverlay");},[menu]);
  // A person who chose "System" follows the device: the preference's dark flag tracks it.
  useEffect(()=>{
    if(preferences.theme!=="system")return;
    const mq=window.matchMedia("(prefers-color-scheme: dark)");
    const follow=()=>{if(preferences.dark!==mq.matches)setPreferences({...preferences,dark:mq.matches});};
    follow();mq.addEventListener("change",follow);
    return()=>mq.removeEventListener("change",follow);
  },[preferences,setPreferences]);
  useEffect(()=>{
    const key=(event:KeyboardEvent)=>{
      if(event.key==="Escape"){setMenu(null);setGuide(false);setDrawer(false);}
      if((event.ctrlKey || event.metaKey) && event.key.toLowerCase()==="k"){event.preventDefault();setSearch("");setSearchOpen(true);}
    };
    const outside=(event:PointerEvent)=>{if(event.target instanceof Element && !event.target.closest(".ui-as-anchor"))setMenu(null);};
    const mq=window.matchMedia("(max-width: 900px)");const resize=()=>setDrawer(false);
    window.addEventListener("keydown",key);document.addEventListener("pointerdown",outside);mq.addEventListener("change",resize);
    return()=>{window.removeEventListener("keydown",key);document.removeEventListener("pointerdown",outside);mq.removeEventListener("change",resize);if(toastTimer.current)clearTimeout(toastTimer.current);};
  },[]);

  function popover(id:string,title:string,children:ReactNode,top=false) {
    return <AnimatePresence>{menu===id && <MenuSurface className="ui-as-popover ui-as-menu" data-motion="" data-side={top ? "top" : undefined} side={top ? "top" : "bottom"} role="menu" onKeyDown={event=>{
      if(!["ArrowDown","ArrowUp","Home","End"].includes(event.key))return;event.preventDefault();
      const items=[...event.currentTarget.querySelectorAll<HTMLButtonElement|HTMLAnchorElement>('button:not(:disabled):not([aria-disabled="true"]):not([data-theme-option][aria-checked="false"]):not([data-language-option][aria-checked="false"]),a[href]:not([aria-disabled="true"])')];const current=items.indexOf(document.activeElement as HTMLButtonElement);
      items[event.key==="Home" ? 0 : event.key==="End" ? items.length-1 : (current+(event.key==="ArrowDown" ? 1 : -1)+items.length)%items.length]?.focus();
    }}>{title && <span className="ui-as-menu__title">{uiText(title)}</span>}<div className="ui-as-menu__list">{children}</div></MenuSurface>}</AnimatePresence>;
  }

  const searchItems=[...workspaceSections.map(label=>({id:`section:${label}`,label,kind:"section" as const}))]
    .filter(item=>`${item.label} ${uiText(item.label)}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(search.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()));

  return <LayoutGroup id="sales-workspace"><div className={`crm-page ${className}`} lang={locale} data-theme={preferences.dark ? "dark" : "light"} data-ascii-preset={savedSettings.loadingEffect} data-ui-motion={savedSettings.motion ? undefined : "off"}>
    <div className="ui-as ui-as-app" data-collapsed={collapsed ? "" : undefined} data-drawer={drawer ? "" : undefined}>
      <button type="button" className="ui-as-icon-btn ui-as-side-open" aria-label={uiText("Open sidebar")} onClick={()=>{if(window.matchMedia("(max-width: 900px)").matches)setDrawer(true);else setCollapsed(false);}}><CrmIcon name="Open sidebar" /></button>
      <div className="ui-as-scrim" aria-hidden="true" onClick={()=>setDrawer(false)} />
      <aside className="ui-as-side" aria-label={uiText("Workspace sidebar")} inert={collapsed && !drawer}>
        <nav className="ui-as-side__nav" aria-label={uiText("Main menu")}>{sidebarGroups.map(group=><div className="ui-as-side__group" key={group.title || "main"}>{group.title && <span className="ui-as-side__label">{uiText(group.title)}</span>}{group.items.map(label=>{const folder=sidebarFolders.find(item=>(item.items as readonly string[]).includes(label));if(!folder)return navItem(label);if(label!==folder.items[0])return null;return <SidebarFolder key={folder.id} id={folder.id} title={uiText(folder.title)} open={folderOpen(folder)} lit={(folder.items as readonly string[]).includes(section)} onToggle={open=>setFolders(current=>({...current,[folder.id]:open}))}>{uiText(folder.items.map(child=>navItem(child)))}</SidebarFolder>;})}</div>)}</nav>
        <SyncStatus />
        <div className="ui-as-side__foot">
          <AnimatePresence>{news>0 && <motion.div className="ui-as-news" data-count={news} initial={false} exit={{opacity:0,height:0,marginBottom:-8}} transition={{duration:reduce ? 0 : 0.22}}><div className="ui-as-news__card ui-as-news__card--back"><span className="ui-as-news__kicker">{uiText("New in ")}{workspaceName}</span><button type="button" className="ui-as-news__close" aria-label={uiText("Dismiss earlier update")} onClick={()=>setNews(Math.max(0,news-1))}><X size={12} /></button></div><div className="ui-as-news__card"><div className="ui-as-news__top"><span className="ui-as-news__kicker">{uiText("New in ")}{workspaceName}</span><button type="button" className="ui-as-news__close" aria-label={uiText("Dismiss")} onClick={()=>setNews(Math.max(0,news-1))}><X size={12} /></button></div><strong className="ui-as-news__title">{uiText(news===2 ? uiText("Rules pages") : uiText("Saved in your workspace"))}</strong><button type="button" className="ui-as-news__more" onClick={()=>openEditor("Full changelog")}>{uiText("Full changelog")}<ChevronRight size={12} /></button></div></motion.div>}</AnimatePresence>
          <div className="ui-as-guide-slot"><motion.div layout className="ui-as-guide" data-open={guide ? "" : undefined} transition={{layout:{type:"spring",stiffness:350,damping:34}}}>
            {!guide ? <button type="button" className="ui-as-steps ui-as-guide__content" aria-expanded="false" onClick={()=>setGuide(true)}><span className="ui-as-steps__title">{uiText("Getting started")}<ChevronRight size={12} /></span><span className="ui-as-steps__sub">{uiText(Math.round(completed.length/8*100))}{uiText("% done · ")}<span className="ui-as-steps__cheer">{uiText(completed.length===8 ? uiText("All done!") : uiText("Great start!"))}</span></span><span className="ui-as-steps__bar"><i style={{width:`${completed.length/8*100}%`}} /></span></button> : <div className="crm-guide ui-as-guide__content"><div className="crm-guide__title">{uiText("Getting started")}<button type="button" aria-label={uiText("Close getting started")} onClick={()=>setGuide(false)}><X size={14} /></button></div><span className="ui-as-steps__bar"><i style={{width:`${completed.length/8*100}%`}} /></span>{setupGroups.map(group=><section key={group.title} data-expanded={guideGroup===group.title ? "" : undefined}><h3><button type="button" aria-expanded={guideGroup===group.title} onClick={()=>setGuideGroup(guideGroup===group.title ? null : group.title)}>{uiText(group.title)}<ChevronDown size={12} /></button></h3><AnimatePresence initial={false}>{guideGroup===group.title && <motion.div initial={{height:0,opacity:0}} animate={{height:"auto",opacity:1}} exit={{height:0,opacity:0}} transition={{duration:reduce ? 0 : 0.24}} className="workspace-guide-group">{group.items.map(item=><button type="button" role="checkbox" aria-checked={completed.includes(item)} className="crm-guide__step" key={item} disabled={item==="Connect your first app" && !completed.includes("Invite your teammates")} onClick={()=>setCompleted(completed.includes(item) ? completed.filter(value=>value!==item) : [...completed,item])}><span className="crm-guide__check">{completed.includes(item) && <Check size={10} />}</span>{uiText(item)}</button>)}</motion.div>}</AnimatePresence></section>)}</div>}
          </motion.div></div>
          <span className="ui-as-anchor ui-as-user-menu"><button type="button" className="ui-as-user" aria-haspopup="menu" aria-label={uiText("Account menu, {0}", [profile.name])} aria-expanded={menu==="user"} onClick={()=>toggleMenu("user")}>{booting ? <><Skeleton circle width={22} /><Skeleton width={84} height={11} /></> : <>{profile.avatar ? <img src={profile.avatar} alt="" /> : <span className="ui-as-user__initials">{initials}</span>}{profile.name}</>}<ChevronDown size={12} /></button>{popover("user","",<>
            <div className="account-identity"><span className="account-identity__avatar">{profile.avatar ? <img src={profile.avatar} alt="" /> : initials}</span><span className="account-identity__text"><strong>{profile.name}</strong><small>{profile.email}</small></span></div>
            <div className="workspace-account-divider" />
            <div className="workspace-account-heading">{uiText("Workspaces")}</div>
            {workspaces.map(item=><button type="button" role="menuitemradio" aria-checked={workspaceId===item.id} className="ui-as-menu__item" key={item.id} onClick={()=>{setWorkspaceId(item.id);setMenu(null);}}><span className="ui-as-side__logo">{item.logo ? <img className="settings-sidebar-logo" src={item.logo} alt="" /> : item.name[0]}</span><span className="ui-as-menu__label">{item.name}</span>{workspaceId===item.id && <Check size={14} />}</button>)}
            <button type="button" role="menuitem" className="ui-as-menu__item" onClick={()=>openEditor("Create workspace")}>{uiText("Create workspace")}</button>
            <div className="workspace-account-divider" />
            <button type="button" role="menuitem" className="ui-as-menu__item" aria-label={uiText("Search")} onClick={openSearch}><Search size={14} />{uiText("Search")}</button>
            <button type="button" role="menuitem" className="ui-as-menu__item" onClick={()=>{setCollapsed(true);setDrawer(false);setMenu(null);}}><CrmIcon name="Collapse sidebar" size={14} />{uiText("Collapse sidebar")}</button>
            <button type="button" role="menuitem" className="ui-as-menu__item" aria-haspopup="dialog" onClick={event=>{const box=event.currentTarget.closest(".ui-as-menu")?.getBoundingClientRect();openSettingsFrom(box ? {x:box.left,y:box.top,width:box.width,height:box.height} : null);}}>{uiText("Settings")}</button><AccountTheme value={savedSettings.theme} onChange={chooseTheme} /><AccountLanguage /><Link href="/" role="menuitem" className="ui-as-menu__item"><ArrowLeft size={14} />{uiText("Back to Stripe")}</Link>
          </>,true)}</span>
        </div>
      </aside>
      <main className="ui-as-main" aria-busy={booting || undefined}>{booting && <div className="workspace-surface"><SectionSkeleton section={section} /></div>}{!booting && <AnimatePresence mode="wait" initial={false}><motion.div key={section} className="workspace-surface" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-4}} transition={{duration:reduce ? 0 : 0.18,ease:[0.22,1,0.36,1]}}>
        {section==="Queue" ? <UploadQueue key={workspaceId} workspaceId={workspaceId} /> : section==="JSON formation" ? <JsonFormation key={workspaceId} workspaceId={workspaceId} notify={notify} /> : <ExcelFormation key={workspaceId} workspaceId={workspaceId} notify={notify} />}
      </motion.div></AnimatePresence>}</main>
      <AnimatePresence>{toast && <motion.div className="ui-as-toast" role="status" key={toast.id} initial={{opacity:0,y:8,scale:0.97}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:5,scale:0.98}} transition={{duration:reduce ? 0 : 0.2}}><Check size={14} />{uiText(toast.text)}</motion.div>}</AnimatePresence>
      <WorkspaceDialog open={searchOpen} title={uiText("Search workspace")} onClose={()=>setSearchOpen(false)}><label className="workspace-search workspace-search--dialog"><Search size={17} /><input autoFocus aria-label={uiText("Search workspace")} placeholder={uiText("Search pages…")} value={search} onChange={event=>setSearch(event.target.value)} /></label><div className="crm-search__results"><AnimatePresence initial={false}>{searchItems.map(item=><motion.button type="button" layout initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} key={item.id} onClick={()=>{navigate(item.label as WorkspaceSection);setSearchOpen(false);}}><CrmIcon name={item.label} /><span>{uiText(item.label)}</span><small>{uiText("section")}</small><ChevronRight size={12} /></motion.button>)}</AnimatePresence>{!searchItems.length && <p className="workspace-muted">{uiText("No pages found.")}</p>}</div></WorkspaceDialog>
      <WorkspaceEditors kind={editor} open={editorOpen} onClose={()=>setEditorOpen(false)} createWorkspace={name=>{const id=crypto.randomUUID();setWorkspaces([...workspaces,{id,name}]);setWorkspaceId(id);navigate("Excel formation");notify("Workspace created");}} />
      {settings!==null && <SettingsOverlay profileEmail={profile.email} section={settings} origin={settingsOrigin} saved={savedSettings} onSave={applySettings} notify={notify} onClose={()=>{setSettingsOrigin(null);closeSettings();}} />}
    </div>
  </div></LayoutGroup>;
}
