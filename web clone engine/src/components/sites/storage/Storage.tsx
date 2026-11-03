"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { zipSync } from "fflate";
import { ArrowDownToLine, ArrowRight, BookOpen, Check, CircleHelp, Database, FilePlus2, FileText, FolderOpen, HardDrive, Search, ShieldCheck, Trash2, Upload, X } from "lucide-react";
import { useResource, useResourceStore, useWorkspaceBackend } from "@/lib/workspace-backend/react";
import { WorkspaceDialog } from "../affectui-crm/WorkspaceDialog";
import { SectionSkeleton } from "../shimmer-loader/SectionSkeleton";
import { StorageOnboarding } from "./StorageOnboarding";
import { StorageDropzone, type StorageDropzoneEntry } from "./StorageDropzone";
import { StorageRun, type StorageRunStep, type StorageRunStatus } from "./StorageRun";
import { StorageTreemap } from "./StorageTreemap";
import { StorageCategorySelect } from "./StorageCategorySelect";
import { StorageButton, StorageButtonGroup, StorageCopyButton, StorageExpandingButtonGroup, StorageFloatingButtonGroup, StorageIconMorph, StorageSplitButton } from "./StorageControls";
import { ActionButton } from "../skilled/ui/ActionButton";
import { ConfirmMorph, type ConfirmPhase } from "../skilled/ui/ConfirmMorph";
import { StorageDocumentEditor } from "./StorageDocumentEditor";
import { applyDocumentEdit, draftOfDocument, restoreDocuments, withoutDocuments, type DocumentDraft, type Removed } from "./storage-edit";
import { addPending, clearPending, duePending, readPending } from "./storage-purge";
import { documentExtension, emptyStorage, formatStorageBytes, indexDocument, storageCategories, storageResource, validateDocument, type StorageCategory, type StorageDocument } from "./storage-model";
import { extractDocument } from "./storage-extract";
import { downloadBlob } from "./storage-vault";
import { loadStorageIndex, loadStorageOriginal, removeStorageDocument, searchStorageDocuments, storeStorageDocument } from "./storage-transfer";
import { persistStorage } from "./storage-persistence";
import "./storage.css";
import "./storage-edit.css";

/** After a removal the originals stay in storage this long, so Undo can bring the documents back (the dialog's result shows Undo for 8 s of it). */
const UNDO_MS = 10000;
interface Trash { removed: Removed[]; backend: ReturnType<typeof useWorkspaceBackend>; workspaceId: string }
interface QueueEntry extends StorageDropzoneEntry { file:File; category:StorageCategory }
interface PreparedDocument { entryId:string; file:File; document:StorageDocument; text:string; chunks:string[] }
const newSteps=():StorageRunStep[]=>[
  {id:"receive",label:"Receive documents",detail:"Files stay in the review queue until you choose to process them.",status:"pending"},
  {id:"check",label:"Validate & fingerprint",detail:"Check file size and format, calculate SHA-256, and find exact duplicates in this workspace.",status:"pending"},
  {id:"extract",label:"Read document content",detail:"Extract text from PDF, DOCX, spreadsheets and text files locally. Scanned PDFs are retained as originals without an OCR index.",status:"pending"},
  {id:"organize",label:"Organize & refine",detail:"Keep your chosen subject, normalize whitespace and identify recurring keywords. Original content is never rewritten.",status:"pending"},
  {id:"index",label:"Build searchable index",detail:"Split extracted text into overlapping passages and retain its source fingerprint. This is lexical indexing; no AI is invoked.",status:"pending"},
  {id:"store",label:"Review & store",detail:"Review the extracted content, then approve saving the original and its index to your workspace.",status:"pending"},
];
const errorText=(error:unknown)=>error instanceof Error?error.message:"Something went wrong. Please retry.";

export function Storage({workspaceId}:{workspaceId:string}) {
  const { t: uiText } = useWorkspaceI18n();
  const backend=useWorkspaceBackend();
  const [library,setLibrary,sync]=useResource(storageResource,workspaceId,emptyStorage);
  const entry=useResourceStore().entry(storageResource,workspaceId,emptyStorage);
  const libraryRef=useRef(library);libraryRef.current=library;
  const [queue,setQueue]=useState<QueueEntry[]>([]);
  const [prepared,setPrepared]=useState<PreparedDocument[]>([]);
  const [status,setStatus]=useState<StorageRunStatus>("idle");
  const [steps,setSteps]=useState(newSteps);
  const [runCount,setRunCount]=useState(0);
  const [category,setCategory]=useState<StorageCategory>("Finance");
  const [filter,setFilter]=useState("All");
  const [search,setSearch]=useState("");
  const [contentMatches,setContentMatches]=useState<Set<string>|null>(null);
  const [selected,setSelected]=useState<string[]>([]);
  const [detailId,setDetailId]=useState<string|null>(null);
  const [preview,setPreview]=useState<string|null>(null);
  const [previewError,setPreviewError]=useState("");
  const [detailEpoch,setDetailEpoch]=useState(0);
  const [searchError,setSearchError]=useState("");
  const [searchEpoch,setSearchEpoch]=useState(0);
  const [guide,setGuide]=useState(false);
  const [noteOpen,setNoteOpen]=useState(false);
  const [noteTitle,setNoteTitle]=useState("");
  const [noteText,setNoteText]=useState("");
  const [deleteIds,setDeleteIds]=useState<string[]>([]);
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");
  const [pendingSave,setPendingSave]=useState(false);
  const [trash,setTrash]=useState<Trash|null>(null);
  const [leftover,setLeftover]=useState<{ids:string[];backend:Trash["backend"];workspaceId:string}|null>(null);
  const trashRef=useRef<Trash|null>(null),trashTimer=useRef<ReturnType<typeof setTimeout>|null>(null),finalizeRef=useRef<()=>Promise<void>>(async()=>{}),sawResult=useRef(false),purgeRef=useRef<(ids:string[],storageBackend:Trash["backend"],storageWorkspace:string)=>Promise<void>>(async()=>{});
  const controller=useRef<AbortController|null>(null),busy=useRef(false),mounted=useRef(true);
  const input=useRef<HTMLInputElement>(null),uploadPanel=useRef<HTMLDivElement>(null),reviewPanel=useRef<HTMLDivElement>(null);
  const reduce=useReducedMotion();
  const locked=status==="running"||status==="review";
  const documents=library.documents;
  // a document just removed keeps its dialog (and its Undo) until the removal becomes final
  const detail=documents.find(d=>d.id===detailId)??trash?.removed.find(r=>r.document.id===detailId)?.document;
  const detailRemoved=!!detail&&!documents.some(d=>d.id===detail.id);
  const query=search.toLocaleLowerCase().trim();
  const visible=useMemo(()=>documents.filter(d=>(filter==="All"||d.category===filter)&&(!query||`${d.name} ${d.category} ${d.excerpt} ${d.keywords.join(" ")}`.toLocaleLowerCase().includes(query)||contentMatches?.has(d.id))),[documents,filter,query,contentMatches]);
  const pending=queue.filter(q=>q.status==="pending"||q.status==="error");
  const indexed=documents.filter(d=>d.extraction==="indexed").length;
  useEffect(()=>{
    mounted.current=true;
    // leaving the page makes a pending removal final, so no original is left behind unreachable
    const leave=()=>void finalizeRef.current();
    window.addEventListener("pagehide",leave);
    return()=>{mounted.current=false;controller.current?.abort();window.removeEventListener("pagehide",leave);leave();};
  },[]);
  useEffect(()=>{if(status!=="review")return;const frame=requestAnimationFrame(()=>{reviewPanel.current?.scrollIntoView({behavior:reduce?"instant":"smooth",block:"nearest"});reviewPanel.current?.focus({preventScroll:true});});return()=>cancelAnimationFrame(frame);},[status,reduce]);
  useEffect(()=>{
    let cancelled=false;const abort=new AbortController();
    if(!detailId)return;
    void loadStorageIndex(backend,workspaceId,detailId,abort.signal).then(value=>{if(!cancelled){setPreview(value?.text??null);setPreviewError("");}}).catch(e=>{if(!cancelled){setPreview(null);setPreviewError(errorText(e));}});
    return()=>{cancelled=true;abort.abort();};
  },[backend,workspaceId,detailId,detailEpoch]);
  useEffect(()=>{
    let cancelled=false;const abort=new AbortController();
    if(!query)return;
    const timer=setTimeout(()=>{void searchStorageDocuments(backend,workspaceId,documents.map(d=>d.id),query,abort.signal).then(ids=>{if(!cancelled){setContentMatches(new Set(ids));setSearchError("");}}).catch(e=>{if(!cancelled)setSearchError(`Full-text search is unavailable: ${errorText(e)}`);});},180);
    return()=>{cancelled=true;abort.abort();clearTimeout(timer);};
  },[backend,documents,query,workspaceId,searchEpoch]);
  // Removals whose files were left behind (the page was closed inside the Undo window) are finished on the next visit.
  useEffect(()=>{
    if(sync.phase!=="ready")return;
    let timer:ReturnType<typeof setTimeout>|undefined;
    const sweep=()=>{
      const {due,waitMs}=duePending(readPending(),workspaceId,Date.now(),UNDO_MS+2000);
      const staged=(id:string)=>trashRef.current?.removed.some(r=>r.document.id===id);
      const back=due.map(item=>item.id).filter(id=>libraryRef.current.documents.some(d=>d.id===id));
      if(back.length)clearPending(workspaceId,back);
      const gone=due.map(item=>item.id).filter(id=>!back.includes(id)&&!staged(id));
      if(gone.length)void purgeRef.current(gone,backend,workspaceId);
      if(waitMs!==null)timer=setTimeout(sweep,waitMs+300);
    };
    sweep();
    return()=>{if(timer)clearTimeout(timer);};
  },[sync.phase,workspaceId,backend]);
  function patchEntry(id:string,patch:Partial<QueueEntry>){if(mounted.current)setQueue(current=>current.map(q=>q.id===id?{...q,...patch}:q));}
  function stepState(id:string,state:StorageRunStep["status"],detail?:string,meta?:string){if(mounted.current)setSteps(current=>current.map(s=>s.id===id?{...s,status:state,...(detail?{detail}:{}),meta}:s));}
  function addFiles(files:File[]) {
    if(locked||busy.current)return;
    setError("");setNotice("");
    const available=25-queue.filter(q=>q.status!=="ready").length;
    let bytes=queue.filter(q=>q.status!=="ready").reduce((s,q)=>s+q.size,0);
    const entries:QueueEntry[]=[];
    for(const file of files.slice(0,Math.max(0,available))) {
      let reason="";try{validateDocument(file);}catch(e){reason=errorText(e);}
      bytes+=file.size;
      if(bytes>100*1024*1024){setError("Keep each batch under 100 MB. Process this batch before adding more.");break;}
      entries.push({id:crypto.randomUUID(),file,name:file.name,size:file.size,category,status:reason?"error":"pending",progress:0,error:reason||undefined});
    }
    if(files.length>available)setError("Add up to 25 files per batch. Process this batch before adding more.");
    setQueue(current=>[...current.filter(q=>q.status!=="ready"),...entries]);
    if(entries.length)setNotice(`${entries.length} document${entries.length===1?"":"s"} added to the review queue.`);
    if(status!=="idle"){setStatus("idle");setSteps(newSteps());}
  }
  function dismissGuide(){setGuide(false);setLibrary(current=>({...current,onboarded:true}));}
  function openDetail(id:string){setPreview(null);setPreviewError("");setDetailId(id);}
  function chooseFiles(){input.current?.click();}
  async function prepareFiles(onlyId?:string) {
    if(busy.current||locked)return false;
    const batch=queue.filter(q=>(q.status==="pending"||q.status==="error")&&(!onlyId||q.id===onlyId));
    if(!batch.length)return false;
    busy.current=true;controller.current=new AbortController();const signal=controller.current.signal;
    setError("");setNotice("");setPrepared([]);setSteps(newSteps());setRunCount(batch.length);setStatus("running");
    let activeStep="receive";
    try {
      batch.forEach(q=>patchEntry(q.id,{status:"processing",progress:5,error:undefined}));
      stepState("receive","completed",`${batch.length} original files received from your device.`,`${batch.length} ${batch.length===1?"file":"files"}`);
      activeStep="check";stepState(activeStep,"running");
      const hashes=new Set(libraryRef.current.documents.map(d=>d.sha256));
      const checked:{entry:QueueEntry;sha256:string}[]=[];
      for(const entry of batch) {
        signal.throwIfAborted();
        try {
          validateDocument(entry.file);
          const digest=await crypto.subtle.digest("SHA-256",await entry.file.arrayBuffer());signal.throwIfAborted();
          const sha256=[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,"0")).join("");
          if(hashes.has(sha256))throw new Error("An identical document is already stored or included in this batch.");
          hashes.add(sha256);checked.push({entry,sha256});patchEntry(entry.id,{progress:22});
        }catch(e){signal.throwIfAborted();patchEntry(entry.id,{status:"error",progress:0,error:errorText(e)});}
      }
      if(!checked.length)throw new Error("No new valid documents to process. Review the file errors below.");
      stepState(activeStep,"completed",`${checked.length} valid files fingerprinted. Exact duplicates were excluded.`,`${checked.length} checked`);
      activeStep="extract";stepState(activeStep,"running");
      const extracted:{entry:QueueEntry;sha256:string;text:string;warning?:string}[]=[];
      for(const item of checked) {
        signal.throwIfAborted();
        try{const result=await extractDocument(item.entry.file,signal,f=>patchEntry(item.entry.id,{progress:22+Math.round(f*30)}));extracted.push({...item,...result});}
        catch(e){signal.throwIfAborted();extracted.push({...item,text:"",warning:`Text could not be extracted: ${errorText(e)} The original can still be stored after your review.`});}
        patchEntry(item.entry.id,{progress:55});
      }
      stepState(activeStep,"completed",`${extracted.filter(d=>d.text.trim()).length} documents yielded text. Originals without readable text are clearly marked in your review.`,`${extracted.length} read`);
      activeStep="organize";stepState(activeStep,"running");
      const organized=extracted.map(item=>({...item,index:indexDocument(item.text)}));
      signal.throwIfAborted();
      organized.forEach(item=>patchEntry(item.entry.id,{progress:68}));
      stepState(activeStep,"completed","Whitespace normalized and frequent keywords counted. Your chosen knowledge area is retained; no content or financial claims are invented.");
      activeStep="index";stepState(activeStep,"running");
      const ready:PreparedDocument[]=organized.map(item=>({entryId:item.entry.id,file:item.entry.file,text:item.index.text,chunks:item.index.chunks,document:{id:crypto.randomUUID(),name:item.entry.name,category:item.entry.category,bytes:item.entry.size,mime:item.entry.file.type||"application/octet-stream",sha256:item.sha256,addedAt:new Date().toISOString(),words:item.index.words,chunks:item.index.chunks.length,excerpt:item.index.excerpt,keywords:item.index.keywords,extraction:item.index.text?"indexed":"original-only",warning:item.warning||(!item.index.text?"No readable text. Only the original will be stored.":undefined)}}));
      const chunks=ready.reduce((s,d)=>s+d.chunks.length,0);
      stepState(activeStep,"completed",`${chunks} overlapping source passages prepared. Search uses original text and frequent keywords.`,`${chunks} ${chunks===1?"passage":"passages"}`);
      ready.forEach(item=>patchEntry(item.entryId,{progress:82}));
      setPrepared(ready);setStatus("review");
      stepState("store","pending","Review the actual extracted text and knowledge areas below. Nothing is saved to your library until you approve.","Your review");
      return true;
    } catch(e) {
      if(signal.aborted){setStatus("stopped");setSteps(current=>current.map(s=>s.status==="running"?{...s,status:"pending",meta:undefined}:s));setNotice("Processing stopped. No unapproved document was saved.");batch.forEach(q=>patchEntry(q.id,{status:"pending",progress:0}));}
      else{setStatus("error");setError(errorText(e));stepState(activeStep,"error",errorText(e));batch.forEach(q=>setQueue(current=>current.map(e=>e.id===q.id&&e.status==="processing"?{...e,status:"error",progress:0,error:errorText(new Error("Processing did not finish. Retry this document."))}:e)));}
      return false;
    } finally {busy.current=false;}
  }
  async function approveFiles() {
    if(busy.current||!prepared.length)return false;
    busy.current=true;controller.current=new AbortController();const signal=controller.current.signal;
    setStatus("running");setError("");stepState("store","running");
    let saved=0;const failed:PreparedDocument[]=[];
    try {
      for(const item of prepared) {
        signal.throwIfAborted();
        try {
          if(libraryRef.current.documents.some(d=>d.sha256===item.document.sha256))throw new Error("This document was already added to the library.");
          await storeStorageDocument(backend,workspaceId,item.document,item.file,{text:item.text,chunks:item.chunks},signal);
          const document=item.document;
          setLibrary(current=>({...current,documents:[document,...current.documents]}));
          libraryRef.current={...libraryRef.current,documents:[document,...libraryRef.current.documents]};
          patchEntry(item.entryId,{status:"ready",progress:100});saved++;
        }catch(e){if(signal.aborted)throw e;failed.push(item);patchEntry(item.entryId,{status:"error",error:errorText(e),progress:82});}
      }
      setPendingSave(true);await persistStorage(entry,backend,workspaceId);setPendingSave(false);
      setPrepared(failed);
      if(failed.length){setStatus("error");stepState("store","error",`${saved} saved; ${failed.length} need attention. Review the file error, then retry.`);setError("Some documents could not be stored. Review the file errors and retry.");}
      else{setStatus("completed");stepState("store","completed",`${saved} originals and their indexes stored. Open a document to review its text and download its original.`,`${saved} saved`);setNotice(`${saved} document${saved===1?"":"s"} stored in your knowledge library.`);}
      return failed.length===0;
    }catch(e){
      if(signal.aborted&&saved){setPendingSave(true);try{await persistStorage(entry,backend,workspaceId);setPendingSave(false);}catch{/* The visible retry keeps the originals accessible until metadata is verified. */}}
      setStatus(signal.aborted?"stopped":"error");setError(signal.aborted?"Storage stopped. Committed originals are retained; retry to finish the batch and verify metadata.":errorText(e));setPrepared(prepared.filter(item=>!libraryRef.current.documents.some(d=>d.id===item.document.id)));stepState("store",signal.aborted?"pending":"error",errorText(e));return false;
    }
    finally{busy.current=false;}
  }
  function discard(){prepared.forEach(item=>patchEntry(item.entryId,{status:"pending",progress:0}));setPrepared([]);setStatus("idle");setSteps(newSteps());setNotice("Review discarded. Your files remain queued.");}
  async function retrySave(){setPendingSave(true);await persistStorage(entry,backend,workspaceId);setPendingSave(false);setError("");if(status==="error"&&!prepared.length){setStatus("completed");stepState("store","completed","The workspace metadata has been saved and verified.");}}
  async function retry(){if(prepared.length)await approveFiles();else if(pendingSave||sync.error)await retrySave();else await prepareFiles();}
  async function downloadDocument(document:StorageDocument){
    downloadBlob(await loadStorageOriginal(backend,workspaceId,document),document.name);
  }
  async function downloadSelected(){
    if(documents.filter(d=>selected.includes(d.id)).reduce((sum,d)=>sum+d.bytes,0)>100*1024*1024)throw new Error("Download up to 100 MB at a time. Select fewer documents for this ZIP.");
    const files:Record<string,Uint8Array>={};
    for(const id of selected){const d=documents.find(d=>d.id===id);if(!d)continue;const original=await loadStorageOriginal(backend,workspaceId,d);files[`${id.slice(0,8)}-${d.name.replace(/[/\\]/g,"_")}`]=new Uint8Array(await original.arrayBuffer());}
    downloadBlob(new Blob([zipSync(files,{level:0}) as Uint8Array<ArrayBuffer>],{type:"application/zip"}),"knowledge-documents.zip");
  }
  // Removing is two steps: the documents leave the library at once (metadata saved and verified), their originals and indexes stay in storage for UNDO_MS so Undo can bring them back.
  function stageTrash(next:Trash|null){trashRef.current=next;if(next)addPending(next.workspaceId,next.removed.map(r=>r.document.id));if(mounted.current)setTrash(next);}
  function disarmTrash(){if(trashTimer.current)clearTimeout(trashTimer.current);trashTimer.current=null;}
  function armTrash(){disarmTrash();trashTimer.current=setTimeout(()=>void finalizeRef.current(),UNDO_MS);}
  async function finalizeTrash(){
    const batch=trashRef.current;if(!batch)return;
    disarmTrash();stageTrash(null);
    // a document that is back in the library never loses its files
    await purgeStored(batch.removed.map(r=>r.document.id).filter(id=>!libraryRef.current.documents.some(d=>d.id===id)),batch.backend,batch.workspaceId);
  }
  /** Delete the originals and indexes of removed documents; what the backend refuses stays listed, with a Retry. */
  async function purgeStored(ids:string[],storageBackend:Trash["backend"],storageWorkspace:string){
    const results=await Promise.allSettled(ids.map(id=>removeStorageDocument(storageBackend,storageWorkspace,id)));
    const failed=ids.filter((_,i)=>results[i].status==="rejected");
    clearPending(storageWorkspace,ids.filter(id=>!failed.includes(id)));
    if(mounted.current)setLeftover(current=>{const all=[...(current?.ids??[]).filter(id=>!ids.includes(id)),...failed];return all.length?{ids:all,backend:storageBackend,workspaceId:storageWorkspace}:null;});
  }
  purgeRef.current=purgeStored;
  finalizeRef.current=finalizeTrash;
  async function removeDocuments(ids:string[]){
    if(!trashRef.current?.removed.some(r=>ids.includes(r.document.id))){
      await finalizeTrash();
      const {library:next,removed}=withoutDocuments(libraryRef.current,ids);
      if(!removed.length)return;
      stageTrash({removed,backend,workspaceId});
      setLibrary(current=>withoutDocuments(current,ids).library);libraryRef.current=next;
    }
    disarmTrash();
    setPendingSave(true);await persistStorage(entry,backend,workspaceId);setPendingSave(false);
    setSelected(current=>current.filter(id=>!ids.includes(id)));setNotice(`${ids.length} document${ids.length===1?"":"s"} removed from this library.`);
    armTrash();
  }
  async function undoRemoval(){
    const batch=trashRef.current;
    if(!batch)throw new Error("It’s too late to undo: these documents were already removed for good.");
    disarmTrash();
    let next:ReturnType<typeof restoreDocuments>;try{next=restoreDocuments(libraryRef.current,batch.removed);}catch(e){armTrash();throw e;}
    setLibrary(current=>restoreDocuments(current,batch.removed));libraryRef.current=next;stageTrash(null);clearPending(batch.workspaceId,batch.removed.map(r=>r.document.id));
    setPendingSave(true);await persistStorage(entry,backend,workspaceId);setPendingSave(false);
    setNotice(`${batch.removed.length} document${batch.removed.length===1?"":"s"} restored.`);
  }
  /** A removal dialog closes when its result has run out (its Undo window is over); after an Undo it stays. */
  function removalPhase(phase:ConfirmPhase,close:()=>void){
    if(phase==="done")sawResult.current=true;
    else if(phase==="idle"){if(sawResult.current){sawResult.current=false;close();void finalizeTrash();}}
    else sawResult.current=false;
  }
  async function saveDetails(id:string,draft:DocumentDraft){
    const before=libraryRef.current.documents.find(d=>d.id===id);
    applyDocumentEdit(libraryRef.current,id,draft);
    setLibrary(current=>{try{return applyDocumentEdit(current,id,draft);}catch{return current;}});
    try{setPendingSave(true);await persistStorage(entry,backend,workspaceId);setPendingSave(false);}
    catch(e){
      // not stored: put the old values back, so the editor still has a change to save and Save changes can be pressed again
      if(before)setLibrary(current=>{try{return applyDocumentEdit(current,id,draftOfDocument(before));}catch{return current;}});
      setPendingSave(false);throw e;
    }
  }
  function exportManifest(){downloadBlob(new Blob([JSON.stringify({version:1,workspaceId,exportedAt:new Date().toISOString(),documents},null,2)],{type:"application/json"}),"knowledge-manifest.json");setNotice("Document manifest exported. Original files are downloaded separately.");}
  async function handleDownload(d:StorageDocument){try{await downloadDocument(d);}catch(e){setError(errorText(e));}}
  if(sync.phase!=="ready")return <SectionSkeleton section="Storage"/>;
  return <div className="stg-workspace" role="region" aria-label={uiText("Storage workspace")}><div className="stg-content">
    <input ref={input} type="file" className="stg-sr-only" multiple accept=".pdf,.docx,.txt,.md,.csv,.tsv,.sql,.json,.xlsx" tabIndex={-1} onChange={e=>{addFiles([...e.target.files||[]]);e.target.value="";}}/>
    <header className="stg-page-head"><div><div className="stg-eyebrow"><HardDrive size={14}/>{uiText("Your knowledge library")}</div><h1>{uiText("Storage")}<span className="stg-heading-dot"/></h1><p>{uiText("A little more knowledge. A clearer picture.")}</p></div><div className="stg-head-actions"><StorageButton variant="ghost" size="sm" aria-label={uiText("Storage guide")} onClick={()=>setGuide(true)}><CircleHelp size={17}/><span className="stg-help-label">{uiText("Guide")}</span></StorageButton><StorageSplitButton disabled={locked} onClick={chooseFiles} actions={[{id:"upload",label:"Upload documents",icon:<Upload size={16}/>,onClick:chooseFiles},{id:"note",label:"Write a knowledge note",icon:<FilePlus2 size={16}/>,onClick:()=>setNoteOpen(true)},{id:"export",label:"Export document manifest",icon:<ArrowDownToLine size={16}/>,onClick:exportManifest,disabled:!documents.length}]}><StorageIconMorph state={locked?"pause":"plus"}/>{uiText("Add documents")}</StorageSplitButton></div></header>
    <div className="stg-stats" aria-label={uiText("Library summary")}>{[{icon:FolderOpen,label:"Documents",value:documents.length.toLocaleString(),note:"Original files in your library"},{icon:Database,label:"Stored data",value:formatStorageBytes(documents.reduce((s,d)=>s+d.bytes,0)),note:backend.remote?"Originals on your connected backend":"Originals saved on this device"},{icon:Search,label:"Searchable",value:indexed.toLocaleString(),note:uiText("{0} original-only · {1} passages", [documents.length-indexed, documents.reduce((s,d)=>s+d.chunks,0)])},{icon:BookOpen,label:"Knowledge areas",value:`${new Set(documents.map(d=>d.category)).size} / 4`,note:"Finance, Banking, SQL & Data"}].map(stat=><div className="stg-stat" key={stat.label}><span><stat.icon size={14}/>{uiText(stat.label)}</span><strong>{uiText(stat.value)}</strong><small>{uiText(stat.note)}</small></div>)}</div>
    <div className="stg-main-grid"><div className="stg-primary"><StorageTreemap documents={documents} onOpen={openDetail} onCategory={setFilter}/>
    {(error||sync.error)&&<div className="stg-error" role="alert"><span>{uiText(error||sync.error?.message||uiText("Verifying document metadata save?"))}</span>{(sync.error||pendingSave)&&<StorageButton size="sm" variant="secondary" onClick={()=>void retrySave().catch(e=>setError(errorText(e)))}>{uiText("Retry save")}</StorageButton>}<button type="button" aria-label={uiText("Dismiss storage error")} onClick={()=>setError("")}><X size={14}/></button></div>}
    {leftover&&<div className="stg-error" role="alert"><span>{uiText(leftover.ids.length)} {uiText(" removed document")}{uiText(leftover.ids.length===1?"":"s")} {uiText(" could not be deleted from storage yet. ")}{uiText(leftover.ids.length===1?uiText("It is"):uiText("They are"))} {uiText(" no longer in your library.")}</span><StorageButton size="sm" variant="secondary" onClick={()=>void purgeStored(leftover.ids,leftover.backend,leftover.workspaceId)}>{uiText("Retry delete")}</StorageButton></div>}
    {searchError&&<div className="stg-error" role="alert"><span>{uiText(searchError)} {uiText(" Filename and metadata search still work.")}</span><StorageButton size="sm" variant="secondary" onClick={()=>setSearchEpoch(current=>current+1)}>{uiText("Retry search")}</StorageButton></div>}
    <div className="stg-notice" role="status">{uiText(notice||"")}</div>
    {trash&&!detailId&&!deleteIds.length&&<div className="stg-undo" role="status"><span>{uiText(trash.removed.length)} {uiText(" document")}{uiText(trash.removed.length===1?"":"s")} {uiText(" removed.")}</span><StorageButton size="sm" variant="secondary" onClick={()=>void undoRemoval().catch(e=>setError(errorText(e)))}>{uiText("Undo")}</StorageButton></div>}
    <section className="stg-library" aria-label={uiText("Document library")}><div className="stg-library-head"><div><h2>{uiText("Documents")}<span>{uiText(documents.length)}</span></h2><p>{uiText("Your sources, ready when you need them.")}</p></div><label className="stg-search"><Search size={15}/><input aria-label={uiText("Search stored documents")} placeholder={uiText("Search your knowledge…")} maxLength={256} value={search} onChange={e=>{setSearch(e.target.value);setSearchError("");setContentMatches(null);}}/>{search&&<button type="button" aria-label={uiText("Clear document search")} onClick={()=>{setSearch("");setSearchError("");setContentMatches(null);}}><StorageIconMorph state="close" size={14}/></button>}</label></div><div className="stg-library-toolbar"><StorageButtonGroup label={uiText("Filter documents by knowledge area")}>{["All",...storageCategories].map(c=><button type="button" key={c} aria-pressed={filter===c} onClick={()=>setFilter(c)}>{uiText(c)}<span>{uiText(c==="All"?documents.length:documents.filter(d=>d.category===c).length)}</span></button>)}</StorageButtonGroup><span className="stg-save-status"><i data-saving={sync.save==="saving"||undefined}/>{uiText(sync.save==="saving"?uiText("Saving…"):sync.save==="error"?uiText("Save needs attention"):uiText("Saved"))}</span></div>
      <div className="stg-documents-table"><div className="stg-table-head"><label><input type="checkbox" aria-label={uiText("Select all visible documents")} checked={visible.length>0&&visible.every(d=>selected.includes(d.id))} onChange={e=>setSelected(e.target.checked?[...new Set([...selected,...visible.map(d=>d.id)])]:selected.filter(id=>!visible.some(d=>d.id===id)))}/><span>{uiText("Document")}</span></label><span>{uiText("Knowledge area")}</span><span>{uiText("Size")}</span><span>{uiText("Added")}</span><span/></div><AnimatePresence initial={false}>{visible.map(d=><motion.div layout={!reduce} key={d.id} className="stg-document-row" initial={reduce?false:{opacity:0,y:5}} animate={{opacity:1,y:0}} exit={{opacity:0,height:0}}><div className="stg-file-name"><input type="checkbox" aria-label={uiText("Select {0}", [d.name])} checked={selected.includes(d.id)} onChange={e=>setSelected(current=>e.target.checked?[...current,d.id]:current.filter(id=>id!==d.id))}/><span className="stg-file-type" data-category={d.category}>{uiText(documentExtension(d.name))}</span><button type="button" onClick={()=>openDetail(d.id)}><strong>{uiText(d.name)}</strong><small>{uiText(d.extraction==="indexed"?uiText("{0} words · Indexed", [d.words.toLocaleString()]):uiText("Original only"))}{uiText(d.warning?uiText(" · Review note"):"")}</small></button></div><span className="stg-subject"><i data-category={d.category}/>{uiText(d.category)}</span><span className="stg-row-bytes">{uiText(formatStorageBytes(d.bytes))}</span><span className="stg-row-date">{uiText(new Date(d.addedAt).toLocaleDateString("en-GB",{day:"numeric",month:"short"}))}</span><StorageExpandingButtonGroup label={uiText("Actions for {0}", [d.name])} actions={[{id:"open",label:"Open",icon:<ArrowRight size={14}/>,onClick:()=>openDetail(d.id)},{id:"download",label:"Download",icon:<ArrowDownToLine size={14}/>,onClick:()=>void handleDownload(d)},{id:"delete",label:"Delete",icon:<Trash2 size={14}/>,danger:true,onClick:()=>setDeleteIds([d.id])}]}/></motion.div>)}</AnimatePresence></div>
      {!visible.length&&<div className="stg-library-empty"><span><FolderOpen size={25}/></span><h3>{uiText(documents.length?uiText("No documents in this view"):uiText("Make room for what you know"))}</h3><p>{uiText(documents.length?uiText("Try a different subject or search term."):uiText("Drop in your first source. We’ll help you keep it organized."))}</p><StorageButton size="sm" variant="secondary" disabled={locked} onClick={()=>{if(documents.length){setSearch("");setSearchError("");setContentMatches(null);setFilter("All");}else chooseFiles();}}>{documents.length?uiText("Clear filters"):<><Upload size={14}/>{uiText("Add your first document")}</>}</StorageButton></div>}
    </section>
    </div><aside className="stg-ingestion" aria-label={uiText("Add and process documents")}><div ref={uploadPanel} className="stg-upload-panel"><div className="stg-panel-title"><h2>{uiText("Grow your library")}</h2><span>{uiText("01 — Import")}</span></div><p>{uiText("Bring the sources you want to build on.")}</p><label className="stg-category-field">{uiText("Knowledge area")}<StorageCategorySelect label={uiText("Upload knowledge area")} value={category} disabled={locked} onChange={value=>{setCategory(value);setQueue(current=>current.map(q=>q.status==="ready"?q:{...q,category:value}));}}/></label><StorageDropzone onFiles={addFiles} disabled={locked} entries={queue} onRemove={id=>{if(!locked)setQueue(current=>current.filter(q=>q.id!==id));}} onRetry={id=>void prepareFiles(id)}/><div className="stg-process-bar"><span>{uiText(pending.length?uiText("{0} waiting to process", [pending.length]):uiText("Add a file or write a note"))}</span><ActionButton size="sm" label={uiText("Process files")} pendingLabel="Processing" successLabel={uiText("Review ready")} disabled={locked||!pending.length} onAction={async()=>{if(!await prepareFiles())throw new Error("Review the file errors before retrying.");}} onActionError={e=>setError(errorText(e))}/></div></div>
      <StorageRun status={status} fileCount={runCount} steps={steps} onStop={()=>controller.current?.abort()} onRetry={()=>void retry().catch(e=>setError(errorText(e)))}>{!!prepared.length&&status!=="running"&&<div ref={reviewPanel} tabIndex={-1} className="stg-review"><div className="stg-review-title"><ShieldCheck size={16}/><strong>{uiText("Your review, before storage")}</strong></div><p>{uiText("Check the content and subject. These are extracts from your files, not generated summaries.")}</p><div className="stg-review-files">{prepared.map(item=><article key={item.entryId}><strong title={item.document.name}><FileText size={13}/>{item.document.name}</strong><label>{uiText("Subject")}<StorageCategorySelect label={uiText("Knowledge area for {0}", [item.document.name])} value={item.document.category} onChange={category=>setPrepared(current=>current.map(p=>p.entryId===item.entryId?{...p,document:{...p.document,category}}:p))}/></label><div className="stg-review-metrics">{uiText(item.document.words.toLocaleString())} {uiText(" words · ")}{uiText(item.document.chunks)} {uiText(" passages · ")}{uiText(item.document.extraction==="indexed"?uiText("Searchable"):uiText("Original only"))}</div>{item.document.warning&&<p className="stg-warning">{uiText(item.document.warning)}</p>}{item.document.excerpt&&<blockquote>{uiText(item.document.excerpt.slice(0,280))}</blockquote>}<div className="stg-keywords">{item.document.keywords.slice(0,5).map(k=><span key={k}>{uiText(k)}</span>)}</div></article>)}</div><div className="stg-review-actions"><StorageButton variant="secondary" size="sm" onClick={discard}>{uiText("Discard")}</StorageButton><ActionButton size="sm" label={uiText("Approve & store")} pendingLabel="Storing" successLabel={uiText("Stored")} icon={<Check size={17} strokeWidth={2} aria-hidden="true"/>} onAction={async()=>{if(!await approveFiles())throw new Error("Storage needs attention.");}}/></div></div>}</StorageRun>
    </aside></div>
    <footer className="stg-page-foot"><span><ShieldCheck size={13}/>{uiText(backend.remote?uiText("Originals and searchable text are stored on your connected backend."):uiText("Stored in this browser · No documents sent to an AI service"))}</span><button type="button" onClick={()=>setGuide(true)}>{uiText("How Storage works")}<ArrowRight size={12}/></button></footer>
    {!!selected.length&&<div className="stg-selection"><span>{uiText(selected.length)} {uiText(" selected")}</span><StorageFloatingButtonGroup label={uiText("Selected document actions")} actions={[{id:"download",label:"Download ZIP",icon:<ArrowDownToLine size={16}/>,onClick:()=>void downloadSelected().catch(e=>setError(errorText(e)))},{id:"delete",label:"Delete",icon:<Trash2 size={16}/>,danger:true,onClick:()=>setDeleteIds(selected)},{id:"clear",label:"Clear",icon:<X size={16}/>,onClick:()=>setSelected([])}]}/></div>}
    <StorageOnboarding open={guide||!library.onboarded} onClose={dismissGuide} onStart={()=>{dismissGuide();uploadPanel.current?.scrollIntoView({behavior:reduce?"instant":"smooth",block:"center"});}}/>
    <WorkspaceDialog open={!!detail} title={uiText(detail?.name||uiText("Document"))} onClose={()=>setDetailId(null)} wide>{detail&&<div className="stg-detail" data-removed={detailRemoved||undefined}><div className="stg-detail-body" inert={detailRemoved||undefined}><div className="stg-detail-meta"><span>{uiText(detail.category)}</span><span>{uiText(formatStorageBytes(detail.bytes))}</span><span>{uiText(detail.words.toLocaleString())} {uiText(" words")}</span><span>{uiText(detail.chunks)} {uiText(" passages")}</span></div><StorageDocumentEditor key={detail.id} document={detail} disabled={detailRemoved} onSave={draft=>saveDetails(detail.id,draft)}/>{detail.warning&&<p className="stg-warning">{uiText(detail.warning)}</p>}{previewError&&<div className="stg-warning" role="alert">{uiText(previewError)}<StorageButton size="sm" variant="secondary" onClick={()=>setDetailEpoch(current=>current+1)}>{uiText("Retry text load")}</StorageButton></div>}<div className="stg-detail-section"><h3>{uiText("Source text ")}<StorageCopyButton value={preview??detail.excerpt} label={uiText("Copy text")} iconOnly/></h3><pre>{preview??(detail.excerpt?`${detail.excerpt}\n\nFull text is unavailable. Showing the saved excerpt.`:"No text index is available. Download the original to review this document.")}</pre></div><div className="stg-keywords">{detail.keywords.map(k=><button type="button" key={k} onClick={()=>{setSearch(k);setContentMatches(null);setFilter("All");setDetailId(null);}}>{uiText(k)}</button>)}</div><div className="stg-fingerprint"><span>{uiText("SHA-256")}</span><code>{detail.sha256}</code><StorageCopyButton value={detail.sha256} label={uiText("Copy fingerprint")} iconOnly/></div></div><div className="stg-detail-actions"><ConfirmMorph label={uiText("Delete document")} icon={<Trash2 size={14}/>} prompt="Remove this document?" confirmMode="hold" confirmLabel={uiText("Delete")} pendingLabel="Removing" doneLabel="Removed" resultTimeout={8000} onConfirm={()=>removeDocuments([detail.id])} onUndo={undoRemoval} onStateChange={phase=>removalPhase(phase,()=>setDetailId(null))}/><ActionButton size="sm" label={uiText("Download original")} pendingLabel="Preparing" successLabel={uiText("Download ready")} icon={<ArrowDownToLine size={17} strokeWidth={2} aria-hidden="true"/>} disabled={detailRemoved} onAction={()=>downloadDocument(detail)} onActionError={e=>setError(errorText(e))}/></div></div>}</WorkspaceDialog>
    <WorkspaceDialog open={noteOpen} title={uiText("Write a knowledge note")} onClose={()=>setNoteOpen(false)}><form className="stg-note" onSubmit={e=>{e.preventDefault();const name=noteTitle.trim().replace(/[\\/]/g,"-");addFiles([new File([noteText],`${name}.md`,{type:"text/markdown"})]);setNoteOpen(false);setNoteTitle("");setNoteText("");}}><label>{uiText("Title")}<input required maxLength={180} value={noteTitle} onChange={e=>setNoteTitle(e.target.value)} placeholder={uiText("What is this note about?")}/></label><label>{uiText("Content")}<textarea required value={noteText} onChange={e=>setNoteText(e.target.value)} placeholder={uiText("Write or paste the knowledge you want to keep…")} rows={9} maxLength={1000000}/></label><p>{uiText("Added to your queue as a Markdown document in ")}{uiText(category)}{uiText(". Review before storage.")}</p><StorageButton type="submit" disabled={!noteTitle.trim()||!noteText.trim()}>{uiText("Add to review queue")}<ArrowRight size={14}/></StorageButton></form></WorkspaceDialog>
    <WorkspaceDialog open={!!deleteIds.length} title={uiText("Remove documents")} onClose={()=>setDeleteIds([])}>{!!deleteIds.length&&<div className="stg-delete"><p>{uiText("Remove ")}{uiText(deleteIds.length)} {uiText(" document")}{uiText(deleteIds.length===1?"":"s")} {uiText(" and ")}{uiText(deleteIds.length===1?uiText("its"):uiText("their"))} {uiText(" searchable index from this workspace?")}</p><p>{uiText("Downloaded copies remain available separately. Workspace originals and indexes are deleted for good after a short window in which you can undo.")}</p><ConfirmMorph label={uiText("Remove {0} document{1}", [deleteIds.length, deleteIds.length===1?"":"s"])} icon={<Trash2 size={14}/>} prompt="Confirm removal?" confirmMode="hold" confirmLabel={uiText("Remove")} pendingLabel="Removing" doneLabel="Removed" resultTimeout={8000} onConfirm={()=>removeDocuments([...deleteIds])} onUndo={undoRemoval} onStateChange={phase=>removalPhase(phase,()=>setDeleteIds([]))}/></div>}</WorkspaceDialog>
  </div></div>;
}
