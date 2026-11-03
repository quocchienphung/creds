"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { AnimatePresence, LayoutGroup, MotionConfig, motion, useReducedMotion } from "motion/react";
import { MenuSurface } from "@/components/interaction/MenuSurface";
import { ArrowLeft, Braces, BookOpen, Check, FileSpreadsheet, GitBranch, HardDrive, ChevronDown, ChevronRight, CirclePlay, FileText, Folder, Gauge, Map, MessageSquarePlus, Network, Search, Star, Waypoints, Workflow, X } from "lucide-react";
import { AccountTheme } from "./AccountTheme";
import { AccountLanguage } from "./AccountLanguage";
import { CrmIcon } from "./CrmIcon";
import { SidebarFolder } from "./SidebarFolder";
import { CollateralProvider, useCollateralBadges } from "../collateral/CollateralProvider";
import { CrmTable } from "./CrmTable";
import { crmTabs, PipelineBoard, PixelIntegration, SalesDocuments } from "./CrmViews";
import { useCrmEngine, type Company } from "./crm-engine";
import { useWorkspaceRoute, workspaceSections, type WorkspaceSection } from "./workspace-state";
import { WorkspaceDialog } from "./WorkspaceDialog";
import { WorkspaceEditors, type EditorKind } from "./WorkspaceEditors";
import { ContactsPage, DealsPage, WorkspaceHome } from "./WorkspacePages";
import { Analytics } from "../affectui-analytics/Analytics";
import { groupOfSection } from "../guide-navigation/navigation-model";
import { WorkspaceLink } from "../guide-navigation/WorkspaceLink";
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
const SettingsBilling=dynamic(()=>import("../affectui-settings/SettingsBilling").then(module=>revealed(module.SettingsBilling)),{loading:()=> <SectionSkeleton section="Usage" />});
const ExcelFormation=dynamic(()=>import("../collateral/excel-formation/ExcelFormation").then(module=>revealed(module.ExcelFormation)),{loading:()=> <SectionSkeleton section="Excel formation" />});
const JsonFormation=dynamic(()=>import("../collateral/json-formation/JsonFormation").then(module=>revealed(module.JsonFormation)),{loading:()=> <SectionSkeleton section="JSON formation" />});
const UploadQueue=dynamic(()=>import("../collateral/queue/Queue").then(module=>revealed(module.Queue)),{loading:()=> <SectionSkeleton section="Queue" />});
const AgentRun=dynamic(()=>import("../affectui-run/AgentRun").then(module=>revealed(module.AgentRun)),{loading:()=> <SectionSkeleton section="Run" />});
const Mapping=dynamic(()=>import("../mapping/BackendMapping").then(module=>revealed(module.BackendMapping)),{loading:()=> <SectionSkeleton section="Mapping" />});
const Invoice=dynamic(()=>import("../invoice/BackendInvoice").then(module=>revealed(module.BackendInvoice)),{loading:()=> <SectionSkeleton section="Invoice" />});
const Tracing=dynamic(()=>import("../tracing/BackendTracing").then(module=>revealed(module.BackendTracing)),{loading:()=> <SectionSkeleton section="Tracing" />});
const Orchestrator=dynamic(()=>import("../orchestrator/Orchestrator").then(module=>revealed(module.Orchestrator)),{loading:()=> <SectionSkeleton section="Orchestrator" />});
const Process=dynamic(()=>import("../process/BackendProcess").then(module=>revealed(module.BackendProcess)),{loading:()=> <SectionSkeleton section="Process" />});
const AssistantHome=dynamic(()=>import("../affectui-assistant/AssistantHome").then(module=>revealed(module.AssistantHome)),{loading:()=> <SectionSkeleton section="New chat" />});
const Skilled=dynamic(()=>import("../skilled/Skilled").then(module=>revealed(module.Skilled)),{loading:()=> <SectionSkeleton section="Skilled" />});
const Storage=dynamic(()=>import("../storage/Storage").then(module=>revealed(module.Storage)),{loading:()=> <SectionSkeleton section="Storage" />});
const Repo=dynamic(()=>import("../repo/Repo").then(module=>revealed(module.Repo)),{loading:()=> <SectionSkeleton section="Repo" />});
const Files=dynamic(()=>import("../affectui-files/Files").then(module=>revealed(module.Files)),{loading:()=> <SectionSkeleton section="Files" />});
const seedSettings=defaultSettings("Logio");
const setupGroups=[
  {title:"Set up your workspace",items:["Name your workspace","Invite your teammates","Connect your first app"]},
  {title:"Start working",items:["Create a folder","Start your first chat","Upload a file"]},
  {title:"Make it yours",items:["Add a profile picture","Choose your notifications"]},
];

export function Crm(props: {workspace?:string;user?:{name:string;avatar?:string};onNavigate?:(label:string)=>void;className?:string}) {
  const [workspaceId]=useResource(resources.activeWorkspace, undefined, "acme");
  return <MotionConfig reducedMotion="user"><CollateralProvider key={workspaceId} workspaceId={workspaceId}><Workspace {...props} /></CollateralProvider></MotionConfig>;
}

function Workspace({workspace="Logio",user={name:"Alex Morgan"},onNavigate,className=""}:{workspace?:string;user?:{name:string;avatar?:string};onNavigate?:(label:string)=>void;className?:string}) {
  const { t: uiText } = useWorkspaceI18n();
  const { locale, setLocale } = useWorkspaceI18n();
  const badges=useCollateralBadges();
  const [workspaces,setWorkspaces,workspacesSync]=useResource(resources.workspaces, undefined, [{id:"acme",name:workspace},{id:"personal",name:"Personal"}]);
  const [workspaceId,setWorkspaceId,activeSync]=useResource(resources.activeWorkspace, undefined, "acme");
  const workspaceName=workspaces.find(item=>item.id===workspaceId)?.name || workspace;
  const engine=useCrmEngine(workspaceId);
  const {section,crmView,settings,openSettings,closeSettings,navigate:routeTo}=useWorkspaceRoute();
  const [settingsOrigin,setSettingsOrigin]=useState<OverlayRect|null>(null);
  const [profile,,profileSync]=useResource(resources.profile, undefined, {name:user.name,email:"alex@logio.com",role:"Head of Sales",avatar:user.avatar});
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
  const [customViews,setCustomViews]=useResource(resources.views, workspaceId, []);
  const [tab,setTab]=useResource(resources.activeTab, workspaceId, "Company CRM");
  const [view,setView]=useState("Head of Sales");
  const [favorites,setFavorites]=useResource(resources.favorites, workspaceId, []);
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
  const [query,setQuery]=useState("");
  const [tableEpoch,setTableEpoch]=useState(0);
  const [chatEpoch,setChatEpoch]=useState(0);
  const [editor,setEditor]=useState<EditorKind>("Full changelog");
  const [editorOpen,setEditorOpen]=useState(false);
  const toastTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const reduce=useReducedMotion();
  const allTabs=[...crmTabs.map(name=>({id:name,name})),...customViews.map(item=>({id:item.id,name:item.name}))];
  const selectedTab=crmView ?? tab;
  const custom=customViews.find(item=>item.id===selectedTab);
  const activeTab=allTabs.some(item=>item.id===selectedTab) ? selectedTab : "Company CRM";
  // The sidebar lists only the pages of the group that owns the current page (see guide-navigation/navigation-model.ts).
  const activeGroup=groupOfSection(section);
  const sidebarGroups=[{title:"",items:activeGroup.sections as readonly WorkspaceSection[]},{title:"Pipelines",items:activeGroup.pipelines as readonly WorkspaceSection[]}].filter(group=>group.items.length);
  // Process, Tracing and Orchestrator share one folder; it opens by itself when one of them is the current page.
  const sidebarFolders=[{id:"techniques",title:"Techniques",items:["Process","Tracing","Orchestrator"] as const},{id:"collateral",title:"Collateral",items:["Excel formation","JSON formation","Queue"] as const}];
  const [folders,setFolders]=useState<Record<string,boolean>>({});
  const folderOpen=(folder:(typeof sidebarFolders)[number])=>folders[folder.id] ?? (folder.items as readonly string[]).includes(section);
  const navItem=(label:WorkspaceSection)=><button type="button" className="ui-as-side__item" aria-current={section===label ? "page" : undefined} key={label} onClick={()=>navigate(label)}>{section===label && <motion.span className="workspace-nav-pill" layoutId="active-navigation" transition={{type:"spring",stiffness:450,damping:38}} />}{label==="Skilled" ? <BookOpen size={16} strokeWidth={1.7} /> : label==="Storage" ? <HardDrive size={16} strokeWidth={1.7} /> : label==="Repo" ? <GitBranch size={16} strokeWidth={1.7} /> : label==="Files" ? <Folder size={16} strokeWidth={1.7} /> : label==="New chat" ? <MessageSquarePlus size={16} strokeWidth={1.7} /> : label==="Mapping" ? <Map size={16} strokeWidth={1.7} /> : label==="Process" ? <Workflow size={16} strokeWidth={1.7} /> : label==="Tracing" ? <Waypoints size={16} strokeWidth={1.7} /> : label==="Orchestrator" ? <Network size={16} strokeWidth={1.7} /> : label==="Invoice" ? <FileText size={16} strokeWidth={1.7} /> : label==="Run" ? <CirclePlay size={16} strokeWidth={1.7} /> : label==="Usage" ? <Gauge size={16} strokeWidth={1.7} /> : label==="Excel formation" ? <FileSpreadsheet size={16} strokeWidth={1.7} /> : label==="Queue" ? <HardDrive size={16} strokeWidth={1.7} /> : label==="JSON formation" ? <Braces size={16} strokeWidth={1.7} /> : <CrmIcon name={label==="Companies" ? "Companies284" : label} />}<span className="workspace-nav-label">{uiText(label)}</span>{label==="Companies" && !booting && <span className="ui-as-side__count">{uiText(workspaceId==="acme" ? 284+engine.rows.length-10 : engine.rows.length)}</span>}{label==="Excel formation" && badges.open>0 && <span className="ui-as-side__count">{uiText(badges.open)}</span>}{label==="JSON formation" && badges.ready && <span className="collateral-nav-dot" role="img" aria-label={uiText("Ready")} />}</button>;
  const viewTitle=custom?.name || view;
  const favorite=favorites.includes(viewTitle);
  const initials=profile.name.split(" ").map(part=>part[0]).slice(0,2).join("");
  const presetOwner=view==="Account executive" ? "Jonas Weber" : view==="Partner manager" ? "Lea Braun" : "";
  const filter=(row:Company)=>(!query || `${row.company} ${row.domain}`.toLowerCase().includes(query.toLowerCase())) && (!(custom?.owner || presetOwner) || row.owner===(custom?.owner || presetOwner));

  function notify(text:string) {
    setToast(current=>({text,id:(current?.id || 0)+1}));
    if(toastTimer.current)clearTimeout(toastTimer.current);
    toastTimer.current=setTimeout(()=>setToast(null),2600);
  }
  function navigate(label:WorkspaceSection) {
    if(label==="New chat")setChatEpoch(current=>current+1);
    onNavigate?.(label);setDrawer(false);setMenu(null);setQuery("");routeTo(label);
  }
  function inviteToWorkspace() {
    navigate("Usage");
    const url=new URL(window.location.href);url.searchParams.set("settings-tab","members");
    window.history.replaceState({},"",url);window.dispatchEvent(new PopStateEvent("popstate"));
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
  function openCompany(name:string) {navigate("Companies");setView("Head of Sales");setTab("Company CRM");setQuery(name);setTableEpoch(current=>current+1);}
  function switchTab(id:string) {onNavigate?.("Companies");setDrawer(false);setMenu(null);setQuery("");setTab(id);routeTo("Companies",id);}
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

  const searchItems=[...workspaceSections.map(label=>({id:`section:${label}`,label,kind:"section" as const})),...allTabs.map(item=>({id:item.id,label:item.name,kind:"view" as const})),...engine.rows.map(row=>({id:row.id,label:row.company || "Untitled",kind:"company" as const}))].filter(item=>`${item.label} ${item.kind === "company" ? "" : uiText(item.label)}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(search.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()));

  return <LayoutGroup id="sales-workspace"><div className={`crm-page ${className}`} lang={locale} data-theme={preferences.dark ? "dark" : "light"} data-ascii-preset={savedSettings.loadingEffect} data-ui-motion={savedSettings.motion ? undefined : "off"}>
    <div className="ui-as ui-as-app" data-collapsed={collapsed ? "" : undefined} data-drawer={drawer ? "" : undefined}>
      <button type="button" className="ui-as-icon-btn ui-as-side-open" aria-label={uiText("Open sidebar")} onClick={()=>{if(window.matchMedia("(max-width: 900px)").matches)setDrawer(true);else setCollapsed(false);}}><CrmIcon name="Open sidebar" /></button>
      <div className="ui-as-scrim" aria-hidden="true" onClick={()=>setDrawer(false)} />
      <aside className="ui-as-side" aria-label={uiText("Workspace sidebar")} inert={collapsed && !drawer}>
        <header className="workspace-sidebar-header">
          <WorkspaceLink className="workspace-explore" href={`/personalize?browse=1&group=${activeGroup.id}`}>{uiText("Explore pages")}<ChevronRight size={15} aria-hidden="true" /></WorkspaceLink>
        </header>
        <nav className="ui-as-side__nav" aria-label={uiText("Main menu")}>{sidebarGroups.map(group=><div className="ui-as-side__group" key={group.title || "main"}>{group.title && <span className="ui-as-side__label">{uiText(group.title)}</span>}{group.items.map(label=>{const folder=sidebarFolders.find(item=>(item.items as readonly string[]).includes(label));if(!folder)return navItem(label);if(label!==folder.items[0])return null;return <SidebarFolder key={folder.id} id={folder.id} title={uiText(folder.title)} open={folderOpen(folder)} lit={(folder.items as readonly string[]).includes(section)} onToggle={open=>setFolders(current=>({...current,[folder.id]:open}))}>{uiText(folder.items.map(child=>navItem(child)))}</SidebarFolder>;})}</div>)}</nav>
        <SyncStatus />
        <div className="ui-as-side__foot">
          <AnimatePresence>{news>0 && <motion.div className="ui-as-news" data-count={news} initial={false} exit={{opacity:0,height:0,marginBottom:-8}} transition={{duration:reduce ? 0 : 0.22}}><div className="ui-as-news__card ui-as-news__card--back"><span className="ui-as-news__kicker">{uiText("New in ")}{workspaceName}</span><button type="button" className="ui-as-news__close" aria-label={uiText("Dismiss earlier update")} onClick={()=>setNews(Math.max(0,news-1))}><X size={12} /></button></div><div className="ui-as-news__card"><div className="ui-as-news__top"><span className="ui-as-news__kicker">{uiText("New in ")}{workspaceName}</span><button type="button" className="ui-as-news__close" aria-label={uiText("Dismiss")} onClick={()=>setNews(Math.max(0,news-1))}><X size={12} /></button></div><strong className="ui-as-news__title">{uiText(news===2 ? uiText("Shared folders") : uiText("A better way to work"))}</strong><button type="button" className="ui-as-news__more" onClick={()=>openEditor("Full changelog")}>{uiText("Full changelog")}<ChevronRight size={12} /></button></div></motion.div>}</AnimatePresence>
          <div className="ui-as-guide-slot"><motion.div layout className="ui-as-guide" data-open={guide ? "" : undefined} transition={{layout:{type:"spring",stiffness:350,damping:34}}}>
            {!guide ? <button type="button" className="ui-as-steps ui-as-guide__content" aria-expanded="false" onClick={()=>setGuide(true)}><span className="ui-as-steps__title">{uiText("Getting started")}<ChevronRight size={12} /></span><span className="ui-as-steps__sub">{uiText(Math.round(completed.length/8*100))}{uiText("% done · ")}<span className="ui-as-steps__cheer">{uiText(completed.length===8 ? uiText("All done!") : uiText("Great start!"))}</span></span><span className="ui-as-steps__bar"><i style={{width:`${completed.length/8*100}%`}} /></span></button> : <div className="crm-guide ui-as-guide__content"><div className="crm-guide__title">{uiText("Getting started")}<button type="button" aria-label={uiText("Close getting started")} onClick={()=>setGuide(false)}><X size={14} /></button></div><span className="ui-as-steps__bar"><i style={{width:`${completed.length/8*100}%`}} /></span>{setupGroups.map(group=><section key={group.title} data-expanded={guideGroup===group.title ? "" : undefined}><h3><button type="button" aria-expanded={guideGroup===group.title} onClick={()=>setGuideGroup(guideGroup===group.title ? null : group.title)}>{uiText(group.title)}<ChevronDown size={12} /></button></h3><AnimatePresence initial={false}>{guideGroup===group.title && <motion.div initial={{height:0,opacity:0}} animate={{height:"auto",opacity:1}} exit={{height:0,opacity:0}} transition={{duration:reduce ? 0 : 0.24}} className="workspace-guide-group">{group.items.map(item=><button type="button" role="checkbox" aria-checked={completed.includes(item)} className="crm-guide__step" key={item} disabled={item==="Connect your first app" && !completed.includes("Invite your teammates")} onClick={()=>setCompleted(completed.includes(item) ? completed.filter(value=>value!==item) : [...completed,item])}><span className="crm-guide__check">{completed.includes(item) && <Check size={10} />}</span>{uiText(item)}</button>)}</motion.div>}</AnimatePresence></section>)}</div>}
          </motion.div></div>
          <span className="ui-as-anchor ui-as-user-menu"><button type="button" className="ui-as-user" aria-haspopup="menu" aria-label={uiText("Account menu, {0}", [profile.name])} aria-expanded={menu==="user"} onClick={()=>toggleMenu("user")}>{booting ? <><Skeleton circle width={22} /><Skeleton width={84} height={11} /></> : <>{profile.avatar ? <img src={profile.avatar} alt="" /> : <span className="ui-as-user__initials">{initials}</span>}{profile.name}</>}<ChevronDown size={12} /></button>{popover("user","",<>
            <div className="account-identity"><span className="account-identity__avatar">{profile.avatar ? <img src={profile.avatar} alt="" /> : initials}</span><span className="account-identity__text"><strong>{profile.name}</strong><small>{profile.email}</small></span></div>
            <div className="workspace-account-divider" />
            <div className="workspace-account-heading">{uiText("Workspaces")}</div>
            {workspaces.map(item=><button type="button" role="menuitemradio" aria-checked={workspaceId===item.id} className="ui-as-menu__item" key={item.id} onClick={()=>{setWorkspaceId(item.id);setMenu(null);setQuery("");setView("Head of Sales");}}><span className="ui-as-side__logo">{item.logo ? <img className="settings-sidebar-logo" src={item.logo} alt="" /> : item.name[0]}</span><span className="ui-as-menu__label">{item.name}</span>{workspaceId===item.id && <Check size={14} />}</button>)}
            <button type="button" role="menuitem" className="ui-as-menu__item" onClick={()=>openEditor("Create workspace")}>{uiText("Create workspace")}</button>
            <div className="workspace-account-divider" />
            <button type="button" role="menuitem" className="ui-as-menu__item" aria-label={uiText("Search")} onClick={openSearch}><Search size={14} />{uiText("Search")}</button>
            <button type="button" role="menuitem" className="ui-as-menu__item" onClick={()=>{setCollapsed(true);setDrawer(false);setMenu(null);}}><CrmIcon name="Collapse sidebar" size={14} />{uiText("Collapse sidebar")}</button>
            <button type="button" role="menuitem" className="ui-as-menu__item" aria-haspopup="dialog" onClick={event=>{const box=event.currentTarget.closest(".ui-as-menu")?.getBoundingClientRect();openSettingsFrom(box ? {x:box.left,y:box.top,width:box.width,height:box.height} : null);}}>{uiText("Settings")}</button><AccountTheme value={savedSettings.theme} onChange={chooseTheme} /><AccountLanguage /><Link href="/" role="menuitem" className="ui-as-menu__item"><ArrowLeft size={14} />{uiText("Back to Stripe")}</Link>
          </>,true)}</span>
        </div>
      </aside>
      <main className="ui-as-main" aria-busy={booting || undefined}>{booting && <div className="workspace-surface"><SectionSkeleton section={section} /></div>}{!booting && <AnimatePresence mode="wait" initial={false}><motion.div key={section} className="workspace-surface" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-4}} transition={{duration:reduce ? 0 : 0.18,ease:[0.22,1,0.36,1]}}>
        {section==="Skilled" ? <Skilled key={workspaceId} workspaceId={workspaceId} /> : section==="Repo" ? <Repo key={workspaceId} workspaceId={workspaceId} /> : section==="Storage" ? <Storage key={workspaceId} workspaceId={workspaceId} /> : section==="Files" ? <Files key={workspaceId} workspaceId={workspaceId} userName={profile.name} notify={notify} /> : section==="New chat" ? <AssistantHome key={`${workspaceId}:${chatEpoch}`} workspaceId={workspaceId} userName={profile.name} onInvite={inviteToWorkspace} notify={notify} startFresh={chatEpoch>0} /> : section==="Invoice" ? <Invoice key={workspaceId} workspaceId={workspaceId} /> : section==="Mapping" ? <Mapping key={workspaceId} workspaceId={workspaceId} /> : section==="Process" ? <Process key={workspaceId} workspaceId={workspaceId} /> : section==="Tracing" ? <Tracing key={workspaceId} workspaceId={workspaceId} /> : section==="Orchestrator" ? <Orchestrator key={workspaceId} workspaceId={workspaceId} /> : section==="Run" ? <AgentRun key={workspaceId} workspaceId={workspaceId} userName={profile.name} notify={notify} /> : section==="Excel formation" ? <ExcelFormation key={workspaceId} workspaceId={workspaceId} notify={notify} /> : section==="Queue" ? <UploadQueue key={workspaceId} workspaceId={workspaceId} /> : section==="JSON formation" ? <JsonFormation key={workspaceId} workspaceId={workspaceId} notify={notify} /> : section==="Usage" ? <SettingsBilling key={workspaceId} workspaceId={workspaceId} workspaceName={workspaceName} notify={notify} onRename={name=>setWorkspaces(workspaces.map(item=>item.id===workspaceId ? {...item,name} : item))} onLogoChange={logo=>setWorkspaces(current=>current.map(item=>item.id===workspaceId ? {...item,logo} : item))} /> : section==="Reports" ? <Analytics workspaceId={workspaceId} notify={notify} /> : section==="Home" ? <WorkspaceHome engine={engine} name={profile.name} navigate={navigate} openCompany={openCompany} /> : section==="Contacts" ? <ContactsPage engine={engine} workspaceId={workspaceId} notify={notify} /> : section!=="Companies" ? <DealsPage engine={engine} section={section} openCompany={openCompany} /> : <div className="ui-as-crm">
          <div className="ui-as-crm__top"><div className="ui-as-crm__path"><Folder size={16} /><span>{uiText("Sales")}</span><i>/</i></div><span className="ui-as-anchor"><button type="button" className="ui-as-crm__view" aria-expanded={menu==="view"} onClick={()=>toggleMenu("view")}>{custom ? viewTitle : uiText(viewTitle)}<ChevronDown size={12} /></button>{popover("view","Views",["Head of Sales","Account executive","Partner manager"].map(label=><button type="button" className="ui-as-menu__item" role="menuitemradio" aria-checked={view===label && !custom} key={label} onClick={()=>{setView(label);switchTab("Company CRM");}}>{uiText(label)}{view===label && !custom && <Check size={13} />}</button>))}</span><button type="button" className="ui-as-icon-btn ui-as-crm__star" aria-label={uiText(favorite ? uiText("Remove from favorites") : uiText("Add to favorites"))} aria-pressed={favorite} onClick={()=>setFavorites(favorite ? favorites.filter(value=>value!==viewTitle) : [...favorites,viewTitle])}><CrmIcon name="Add to favorites" size={15} /></button></div>
          <nav className="ui-as-crm__tabs" aria-label={uiText("Open views")}><button type="button" className="ui-as-icon-btn" aria-label={uiText("New view")} onClick={()=>openEditor("New view")}><CrmIcon name="New view" /></button><span className="ui-as-anchor"><button type="button" className="ui-as-icon-btn" aria-label={uiText("All views")} aria-expanded={menu==="all-views"} onClick={()=>toggleMenu("all-views")}><CrmIcon name="All views" /></button>{popover("all-views","All views",allTabs.map(item=><button type="button" className="ui-as-menu__item" role="menuitem" key={item.id} onClick={()=>{switchTab(item.id);setMenu(null);}}><CrmIcon name={crmTabs.includes(item.name as typeof crmTabs[number]) ? item.name : "Company CRM"} size={18} />{customViews.some(view => view.id === item.id) ? item.name : uiText(item.name)}{favorites.includes(item.name) && <Star size={12} />}</button>))}</span><span className="ui-as-crm__sep" />{allTabs.map(item=><div className="workspace-tab-wrap" key={item.id}><button type="button" className="ui-as-crm__tab" aria-current={activeTab===item.id ? "page" : undefined} onClick={()=>switchTab(item.id)}>{activeTab===item.id && <motion.span className="workspace-tab-pill" layoutId="active-crm-tab" transition={{type:"spring",stiffness:450,damping:38}} />}<span className="ui-as-crm__tab-logo" data-tab={crmTabs.includes(item.name as typeof crmTabs[number]) ? item.name : "Company CRM"}><CrmIcon name={crmTabs.includes(item.name as typeof crmTabs[number]) ? item.name : "Company CRM"} size={11} /></span><span>{customViews.some(view => view.id === item.id) ? item.name : uiText(item.name)}</span></button>{customViews.some(value=>value.id===item.id) && <button type="button" className="workspace-tab-close" aria-label={uiText("Close {0} view", [item.name])} onClick={()=>{setCustomViews(customViews.filter(value=>value.id!==item.id));if(tab===item.id)setTab("Company CRM");}}><X size={11} /></button>}</div>)}</nav>
          {query && <div className="workspace-filter-chip">{uiText("Showing companies matching “")}{uiText(query)}”<button type="button" aria-label={uiText("Clear company search")} onClick={()=>setQuery("")}><X size={12} /></button></div>}
          <AnimatePresence mode="wait" initial={false}><motion.div className="ui-as-crm__table" key={`${activeTab}:${workspaceId}:${viewTitle}:${tableEpoch}`} initial={{opacity:0,y:7}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-4}} transition={{duration:reduce ? 0 : 0.18}}>{activeTab==="Company CRM" || custom?.layout==="table" ? <CrmTable engine={engine} filter={filter} defaultOwner={custom?.owner || presetOwner} onAddRow={()=>setQuery("")} /> : activeTab==="Team strategy" || custom?.layout==="board" ? <PipelineBoard engine={engine} filter={filter} onOpenCompany={openCompany} /> : activeTab==="Pixel integration" ? <PixelIntegration workspaceId={workspaceId} /> : <SalesDocuments engine={engine} workspaceId={workspaceId} />}</motion.div></AnimatePresence>
        </div>}
      </motion.div></AnimatePresence>}</main>
      <AnimatePresence>{toast && <motion.div className="ui-as-toast" role="status" key={toast.id} initial={{opacity:0,y:8,scale:0.97}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:5,scale:0.98}} transition={{duration:reduce ? 0 : 0.2}}><Check size={14} />{uiText(toast.text)}</motion.div>}</AnimatePresence>
      <WorkspaceDialog open={searchOpen} title={uiText("Search workspace")} onClose={()=>setSearchOpen(false)}><label className="workspace-search workspace-search--dialog"><Search size={17} /><input autoFocus aria-label={uiText("Search workspace")} placeholder={uiText("Search companies and views…")} value={search} onChange={event=>setSearch(event.target.value)} /></label><div className="crm-search__results"><AnimatePresence initial={false}>{searchItems.map(item=><motion.button type="button" layout initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} key={item.id} onClick={()=>{if(item.kind==="section")navigate(item.label as WorkspaceSection);else if(item.kind==="view")switchTab(item.id);else openCompany(item.label);setSearchOpen(false);}}><CrmIcon name={item.label} /><span>{item.kind === "company" || customViews.some(view => view.id === item.id) ? item.label : uiText(item.label)}</span><small>{uiText(item.kind)}</small><ChevronRight size={12} /></motion.button>)}</AnimatePresence>{!searchItems.length && <p className="workspace-muted">{uiText("No companies or views found.")}</p>}</div></WorkspaceDialog>
      <WorkspaceEditors kind={editor} open={editorOpen} onClose={()=>setEditorOpen(false)} owners={[...new Set(engine.rows.map(row=>row.owner))].filter(Boolean)} createWorkspace={name=>{const id=crypto.randomUUID();setWorkspaces([...workspaces,{id,name}]);setWorkspaceId(id);navigate("Companies");notify("Workspace created");}} createView={newView=>{setCustomViews([...customViews,newView]);navigate("Companies");setTab(newView.id);notify("View created");}} />
      {settings!==null && <SettingsOverlay profileEmail={profile.email} section={settings} origin={settingsOrigin} saved={savedSettings} onSave={applySettings} notify={notify} onClose={()=>{setSettingsOrigin(null);closeSettings();}} />}
    </div>
  </div></LayoutGroup>;
}
