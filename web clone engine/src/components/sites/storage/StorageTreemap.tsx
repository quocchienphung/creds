"use client";

import { useWorkspaceI18n } from "@/components/sites/i18n/WorkspaceI18n";
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ChevronRight, FolderOpen } from "lucide-react";
import { buildStorageTree, formatStorageBytes, squarify, storageCategories, type MapNode, type MapRect, type StorageDocument } from "./storage-model";
import "./storage-treemap.css";

const hues={Finance:"#4294df",Banking:"#9364bf",SQL:"#efa42f",Data:"#1bb8a1"};
type Tile=MapRect & {node:MapNode;level:number};
type ZoomMotion={kind:"in"|"out";rect:MapRect;targetIds?:Set<string>};
function nestedTiles(nodes:MapNode[],bounds:MapRect,level=0):Tile[] {
  const rects=squarify(nodes,bounds);
  return rects.flatMap(rect=>{
    const node=nodes.find(n=>n.id===rect.id)!;
    const tile={...rect,node,level};
    if(!node.children?.length || level>=1 || rect.width<50 || rect.height<52)return [tile];
    return [tile,...nestedTiles(node.children,{x:rect.x+4,y:rect.y+24,width:Math.max(0,rect.width-8),height:Math.max(0,rect.height-28)},level+1)];
  });
}

export function StorageTreemap({documents,onOpen,onCategory}:{documents:StorageDocument[];onOpen:(id:string)=>void;onCategory:(category:string)=>void}) {
  const { t: uiText } = useWorkspaceI18n();
  const [measure,setMeasure]=useState<"files"|"bytes">("files");
  const [shading,setShading]=useState<"indexed"|"recent">("indexed");
  const [path,setPath]=useState<string[]>([]);
  const [hovered,setHovered]=useState<MapNode|null>(null);
  const [tooltipAt,setTooltipAt]=useState({x:12,y:12});
  const [zoomMotion,setZoomMotion]=useState<ZoomMotion|null>(null);
  const [width,setWidth]=useState(600);
  const root=useRef<HTMLDivElement>(null);
  const reduce=useReducedMotion(),helpId=useId();
  const tree=useMemo(()=>buildStorageTree(documents,measure,shading),[documents,measure,shading]);
  const validPath:MapNode[]=[];
  let children=tree;
  for(const id of path){const n=children.find(n=>n.id===id);if(!n)break;validPath.push(n);children=n.children||[];}
  const current=validPath.at(-1);
  const total=children.reduce((s,n)=>s+n.value,0);
  const height=width<440?310:420;
  const tiles=nestedTiles(children,{x:0,y:0,width,height});
  const format=(n:number)=>measure==="bytes"?formatStorageBytes(n):`${n.toLocaleString()} ${n===1?"file":"files"}`;
  useEffect(()=>{const el=root.current;if(!el)return;const observer=new ResizeObserver(([entry])=>setWidth(entry.contentRect.width));observer.observe(el);return()=>observer.disconnect();},[]);
  function zoom(node:MapNode){
    setHovered(null);
    if(!node.children?.length){onOpen(node.id);return;}
    function find(nodes:MapNode[],parents:string[]=[]):string[]|undefined { for(const n of nodes){if(n.id===node.id)return [...parents,n.id];const path=n.children&&find(n.children,[...parents,n.id]);if(path)return path;} }
    const tile=tiles.find(t=>t.node.id===node.id);
    if(tile)setZoomMotion({kind:"in",rect:tile});
    setPath(find(tree)||[]);onCategory(node.category);
    requestAnimationFrame(()=>root.current?.querySelector<HTMLButtonElement>("button[data-level='0']")?.focus());
  }
  function goToPath(nextPath:string[]){
    setHovered(null);
    let nodes=tree;for(const id of nextPath){nodes=nodes.find(n=>n.id===id)?.children||[];}
    const next=nestedTiles(nodes,{x:0,y:0,width,height});
    const branch=next.find(t=>t.node.id===validPath[nextPath.length]?.id);
    if(branch)setZoomMotion({kind:"out",rect:branch,targetIds:new Set(next.map(t=>t.node.id))});
    setPath(nextPath);
  }
  function back(){goToPath(validPath.slice(0,-1).map(n=>n.id));if(validPath.length===1)onCategory("All");}
  function fromZoom(tile:Tile){
    if(!zoomMotion||reduce)return {x:tile.x,y:tile.y,width:tile.width,height:tile.height,opacity:0};
    const r=zoomMotion.rect;
    if(zoomMotion.kind==="in")return {x:r.x+tile.x/width*r.width,y:r.y+tile.y/height*r.height,width:tile.width/width*r.width,height:tile.height/height*r.height,opacity:0};
    return {x:(tile.x-r.x)*width/r.width,y:(tile.y-r.y)*height/r.height,width:tile.width*width/r.width,height:tile.height*height/r.height,opacity:0};
  }
  function exitZoom(tile:Tile,m:ZoomMotion|null){
    if(!m||reduce)return {opacity:0};
    const r=m.rect;
    return m.kind==="in"?{x:(tile.x-r.x)*width/r.width,y:(tile.y-r.y)*height/r.height,width:tile.width*width/r.width,height:tile.height*height/r.height,opacity:0}:{x:r.x+tile.x/width*r.width,y:r.y+tile.y/height*r.height,width:tile.width/width*r.width,height:tile.height/height*r.height,opacity:0};
  }
  function key(event:KeyboardEvent<HTMLDivElement>) {
    if(["Escape","Backspace"].includes(event.key)){event.preventDefault();back();return;}
    if(!["ArrowRight","ArrowLeft","ArrowDown","ArrowUp","Home","End"].includes(event.key))return;
    event.preventDefault();
    const buttons=[...event.currentTarget.querySelectorAll<HTMLButtonElement>("button[data-level='0']")];
    const index=buttons.indexOf(document.activeElement as HTMLButtonElement);
    if(event.key==="Home"||event.key==="End"){buttons[event.key==="Home"?0:buttons.length-1]?.focus();return;}
    const from=tiles.filter(t=>t.level===0)[Math.max(0,index)];if(!from)return;
    const cx=from.x+from.width/2,cy=from.y+from.height/2;
    const targets=tiles.filter(t=>t.level===0).map((t,i)=>({i,dx:t.x+t.width/2-cx,dy:t.y+t.height/2-cy})).filter(t=>event.key==="ArrowRight"?t.dx>1:event.key==="ArrowLeft"?t.dx< -1:event.key==="ArrowDown"?t.dy>1:t.dy< -1).sort((a,b)=>Math.hypot(a.dx,a.dy)-Math.hypot(b.dx,b.dy));
    buttons[targets[0]?.i??index]?.focus();
  }
  return <section className="stg-map" aria-label={uiText("Knowledge distribution")}>
    <header className="stg-map-head"><div><h2>{uiText("Knowledge map")}</h2><p>{uiText("Every document, in its place.")}</p></div><div className="stg-map-controls">
      <div className="stg-map-segments" role="group" aria-label={uiText("Treemap size")}>{(["files","bytes"] as const).map(value=><button type="button" key={value} aria-pressed={measure===value} onClick={()=>setMeasure(value)}>{measure===value&&<motion.span layoutId="storage-map-measure" transition={{duration:reduce?0:.22}}/>}<span>{uiText(value==="files"?uiText("Files"):uiText("Size"))}</span></button>)}</div>
      <div className="stg-map-segments" role="group" aria-label={uiText("Treemap shading")}>{(["indexed","recent"] as const).map(value=><button type="button" key={value} aria-pressed={shading===value} onClick={()=>setShading(value)}>{shading===value&&<motion.span layoutId="storage-map-shading" transition={{duration:reduce?0:.22}}/>}<span>{uiText(value==="indexed"?uiText("Indexed"):uiText("Recent"))}</span></button>)}</div>
    </div></header>
    <div className="stg-map-summary"><nav aria-label={uiText("Knowledge map breadcrumb")}><button type="button" aria-current={!current?"page":undefined} onClick={()=>{goToPath([]);onCategory("All");}}>{uiText("All knowledge")}</button>{validPath.map((node,index)=><span key={node.id}><ChevronRight size={12}/><button type="button" aria-current={index===validPath.length-1?"page":undefined} onClick={()=>goToPath(validPath.slice(0,index+1).map(n=>n.id))}>{uiText(node.label)}</button></span>)}</nav><motion.strong key={`${measure}:${total}`} initial={reduce?false:{opacity:.3,y:4}} animate={{opacity:1,y:0}}>{uiText(format(total))}</motion.strong></div>
    <p id={helpId} className="stg-sr-only">{uiText("Arrow keys move between regions. Enter opens a region or document. Escape goes back. Size represents ")}{uiText(measure==="files"?uiText("document count"):uiText("original file bytes"))}{uiText(". Shade represents ")}{uiText(shading==="indexed"?uiText("the proportion of searchable documents"):uiText("uploads in the last 30 days"))}.</p>
    <div ref={root} className="stg-map-stage" style={{height}} role="group" aria-label={uiText(current?.label||uiText("All knowledge"))} aria-describedby={helpId} onKeyDown={key} onPointerLeave={()=>setHovered(null)} onPointerMove={event=>{const r=event.currentTarget.getBoundingClientRect();setTooltipAt({x:Math.max(8,Math.min(width-210,event.clientX-r.left+14)),y:Math.max(8,Math.min(height-105,event.clientY-r.top+14))});}}>
      <AnimatePresence initial={false} custom={zoomMotion}>{tiles.map(tile=>{
        const {node}=tile;const room=tile.width>82&&tile.height>45;const tiny=tile.width<44||tile.height<28;
        return <motion.button type="button" key={node.id} data-level={tile.level} className="stg-map-tile" aria-label={uiText("{0}, {1}, {2}%{3}", [node.label, format(node.value), Math.round(node.value/total*100), node.children?.length?", open region":", open document"])} style={{"--stg-hue":hues[node.category],"--stg-fill":`${node.children?.length&&tile.level===0?10:14+node.color*44}%`,zIndex:tile.level+1} as CSSProperties} initial={reduce?false:fromZoom(tile)} animate={{x:tile.x+1,y:tile.y+1,width:Math.max(0,tile.width-2),height:Math.max(0,tile.height-2),opacity:1}} variants={{leave:(m:ZoomMotion|null)=>exitZoom(tile,m)}} exit="leave" transition={{duration:reduce?0:.48,ease:[.22,1,.36,1]}} onClick={()=>zoom(node)} onPointerEnter={()=>setHovered(node)} onFocus={()=>{setHovered(node);setTooltipAt({x:Math.max(8,Math.min(width-210,tile.x+12)),y:Math.max(8,Math.min(height-105,tile.y+26))});}} onBlur={()=>setHovered(null)}>
          {!tiny&&<span className="stg-map-tile-label">{uiText(node.label)}</span>}{room&&<span className="stg-map-tile-value">{uiText(format(node.value))}</span>}
        </motion.button>;
      })}</AnimatePresence>
      {hovered&&<div className="stg-map-tooltip" aria-hidden="true" style={{left:tooltipAt.x,top:tooltipAt.y}}><small>{uiText(current?.label||uiText("All knowledge"))}</small><div><strong>{uiText(hovered.label)}</strong><b>{uiText(format(hovered.value))}</b></div><span>{uiText(Math.round(hovered.value/(total||1)*100))}{uiText("% of this view")}</span><span>{uiText(shading==="indexed"?uiText("Searchable"):uiText("Uploaded within 30 days"))} {uiText(Math.round(hovered.color*100))}%</span></div>}
      {!total&&<div className="stg-map-empty"><div className="stg-map-empty-grid">{storageCategories.map(cat=><div key={cat} style={{"--stg-hue":hues[cat]} as CSSProperties}><span>{uiText(cat)}</span><small>{uiText("0 files")}</small></div>)}</div><span className="stg-map-empty-caption"><FolderOpen size={18}/>{uiText("Your knowledge starts here")}<small>{uiText("Upload a document to bring your map to life.")}</small></span></div>}
    </div>
    <div className="stg-map-foot">{current?<button type="button" onClick={back}><ArrowLeft size={13}/>{uiText("Back one level")}</button>:<span className="stg-map-legend">{storageCategories.map(category=><span key={category}><i style={{background:hues[category]}}/>{uiText(category)}</span>)}</span>}<span className="stg-map-shade">{uiText(shading==="indexed"?uiText("Searchable"):uiText("Last 30 days"))}<span aria-hidden="true">{[14,25,36,47,58].map(v=><i key={v} style={{opacity:v/60}}/>)}</span></span></div>
    <div className="stg-map-reading" aria-live="polite">{hovered?<><b>{uiText(hovered.label)}</b><span>{uiText(format(hovered.value))} · {uiText(Math.round(hovered.value/(total||1)*100))}{uiText("% of this view")}</span></>:<span>{uiText(total?uiText("Select a region to explore · Esc to go back"):uiText("The map shows real uploads. No sample documents."))}</span>}</div>
    <table className="stg-sr-only"><caption>{uiText("Uploaded documents by subject")}</caption><thead><tr><th>{uiText("Document")}</th><th>{uiText("Subject")}</th><th>{uiText("Bytes")}</th><th>{uiText("Searchable")}</th></tr></thead><tbody>{documents.map(d=><tr key={d.id}><th>{uiText(d.name)}</th><td>{uiText(d.category)}</td><td>{uiText(d.bytes)}</td><td>{uiText(d.extraction==="indexed"?uiText("Yes"):uiText("No"))}</td></tr>)}</tbody></table>
  </section>;
}
