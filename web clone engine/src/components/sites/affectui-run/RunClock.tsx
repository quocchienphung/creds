"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useEffect, useState } from "react";

/** Only text clocks tick while approval is pending. The workflow and storage remain paused. */
export function RunClock({base,waitingSince,format}:{base:number;waitingSince?:number;format:(ms:number)=>string}){
  const { t: uiText } = useWorkspaceI18n();
  const [now,setNow]=useState(0);
  useEffect(()=>{
    if(!waitingSince)return;
    const frame=requestAnimationFrame(()=>setNow(Date.now()));
    const timer=window.setInterval(()=>{if(document.visibilityState==="visible")setNow(Date.now());},100);
    return()=>{cancelAnimationFrame(frame);clearInterval(timer);};
  },[waitingSince]);
  return <>{uiText(format(base+(waitingSince ? Math.max(0,now-waitingSince) : 0)))}</>;
}
