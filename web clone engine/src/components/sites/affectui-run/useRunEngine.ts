"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createRun, isRunSnapshot, runReducer, type RunAction } from "./run-model";
import { defaultRunSteps } from "./run-seed";
import { useResource, useWorkspaceBackend } from "@/lib/workspace-backend/react";
import { resources } from "../workspace-resources";

const initialRun=createRun(defaultRunSteps);
/**
 * By default the run is simulated here: a clock advances it and the snapshot is kept in the browser.
 * When the backend provides `run` (a server-driven agent), the server advances the run instead: this hook
 * sends the person's actions to it, shows the snapshots it reports and does not run a clock or save the run.
 */
export function useRunEngine(workspaceId:string){
  const backend=useWorkspaceBackend();
  const driven=!!backend.run;
  const [snapshot,setSnapshot,sync]=useResource(resources.agentRun, workspaceId, initialRun, driven ? {persist:false} : undefined);
  const [replay,setReplay]=useState(0);
  const latest=useRef(snapshot);
  const syncRef=useRef(sync);
  useEffect(()=>{latest.current=snapshot;syncRef.current=sync;},[snapshot,sync]);
  const send=useCallback((action:unknown)=>{
    // The server's answer is the truth; if it cannot be reached, fall back to what it last stored.
    void backend.run?.send(workspaceId,action)
      .then(result=>{if(isRunSnapshot(result))syncRef.current.apply(result);})
      .catch(()=>syncRef.current.reload());
  },[backend,workspaceId]);
  const dispatch=useCallback((action:RunAction)=>{
    setSnapshot(current=>runReducer(current,action));
    if(driven && action.type!=="tick" && action.type!=="start")send(action);
  },[driven,send,setSnapshot]);
  useEffect(()=>{
    if(driven)return;
    const timer=window.setTimeout(()=>dispatch({type:"start",now:Date.now()}),0);
    return()=>window.clearTimeout(timer);
  },[dispatch,driven,workspaceId]);
  useEffect(()=>{
    if(driven || snapshot.phase!=="running")return;
    let previous=performance.now();
    const timer=window.setInterval(()=>{
      const now=performance.now();
      if(document.visibilityState==="visible")dispatch({type:"tick",delta:Math.min(250,now-previous),now:Date.now()});
      previous=now;
    },100);
    return()=>window.clearInterval(timer);
  },[driven,snapshot.phase,dispatch]);
  function restart(){
    if(driven){send({type:"restart",steps:latest.current.steps});setReplay(value=>value+1);return;}
    setSnapshot(createRun(latest.current.steps,Date.now()));setReplay(value=>value+1);
  }
  return {snapshot,dispatch,restart,replay,driven,sync};
}
