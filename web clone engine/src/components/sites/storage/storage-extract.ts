import { unzipSync, strFromU8 } from "fflate";
import { MAX_TEXT_CHARS, documentExtension } from "./storage-model";

export interface ExtractedDocument { text: string; warning?: string }
const checkAbort=(signal:AbortSignal)=>signal.throwIfAborted();
function xml(text:string) {
  const doc=new DOMParser().parseFromString(text,"application/xml");
  if(doc.querySelector("parsererror"))throw new Error("This document contains invalid XML.");
  return doc;
}
function localElements(parent:Document|Element,name:string) { return [...parent.getElementsByTagNameNS("*",name)]; }
function officeText(data:Uint8Array,ext:string) {
  let total=0;
  const files=unzipSync(data,{filter:entry=>{
    const include=ext==="DOCX" ? /^word\/(document|footnotes|endnotes)\.xml$/.test(entry.name) : /^xl\/(sharedStrings|worksheets\/sheet\d+)\.xml$/.test(entry.name);
    if(!include)return false;
    total+=entry.originalSize;
    if(entry.originalSize>12*1024*1024 || total>24*1024*1024)throw new Error("Expanded document content is too large to index on this device.");
    return true;
  }});
  if(ext==="DOCX") {
    if(!files["word/document.xml"])throw new Error("This is not a readable DOCX document.");
    return Object.values(files).map(bytes=>localElements(xml(strFromU8(bytes)),"p").map(p=>localElements(p,"t").map(t=>t.textContent||"").join("")).join("\n")).join("\n");
  }
  const strings=files["xl/sharedStrings.xml"] ? localElements(xml(strFromU8(files["xl/sharedStrings.xml"])),"si").map(si=>localElements(si,"t").map(t=>t.textContent||"").join("")) : [];
  const sheets=Object.entries(files).filter(([name])=>name.includes("worksheets/"));
  if(!sheets.length)throw new Error("No readable worksheets found in this XLSX file.");
  return sheets.map(([name,bytes])=>`${name.split("/").at(-1)}\n`+localElements(xml(strFromU8(bytes)),"row").map(row=>localElements(row,"c").map(cell=>{
    const value=localElements(cell,"v")[0]?.textContent||"";
    return cell.getAttribute("t")==="s" ? strings[Number(value)]||"" : cell.getAttribute("t")==="inlineStr" ? localElements(cell,"t").map(t=>t.textContent||"").join("") : value;
  }).join("\t")).join("\n")).join("\n\n");
}

/** All parsing stays on this origin. No document is sent to an AI or source component service. */
export async function extractDocument(file:File,signal:AbortSignal,onProgress?:(fraction:number)=>void):Promise<ExtractedDocument> {
  checkAbort(signal);
  const ext=documentExtension(file.name);
  let text="",warning:string|undefined;
  if(ext==="PDF") {
    const pdfjs=await import("pdfjs-dist");
    checkAbort(signal);
    pdfjs.GlobalWorkerOptions.workerSrc="/storage/pdf.worker.min.mjs";
    const data=new Uint8Array(await file.arrayBuffer());
    const task=pdfjs.getDocument({data,useSystemFonts:true,disableFontFace:true});
    const abort=()=>{void task.destroy();};signal.addEventListener("abort",abort,{once:true});
    try {
      const pdf=await task.promise;
      const maxPages=Math.min(pdf.numPages,300);
      for(let n=1;n<=maxPages;n++) {
        checkAbort(signal);
        const page=await pdf.getPage(n),content=await page.getTextContent();
        text+=content.items.map(item=>"str" in item ? item.str+(item.hasEOL?"\n":" ") : "").join("")+"\n";
        onProgress?.(n/maxPages);page.cleanup();
        if(text.length>=MAX_TEXT_CHARS){warning="Text index limited to the first 1,000,000 characters. The complete original is preserved.";break;}
      }
      if(pdf.numPages>maxPages)warning="Text index limited to 300 PDF pages. The complete original is preserved.";
    } finally {signal.removeEventListener("abort",abort);await task.destroy();}
    if(!text.trim())warning="No selectable text found. The original is stored; scanned PDFs need OCR before they can be indexed.";
  } else if(ext==="DOCX"||ext==="XLSX") {
    text=officeText(new Uint8Array(await file.arrayBuffer()),ext);
  } else {
    const buffer=await file.arrayBuffer();
    checkAbort(signal);
    const bytes=new Uint8Array(buffer);
    const encoding=bytes[0]===255&&bytes[1]===254?"utf-16le":bytes[0]===254&&bytes[1]===255?"utf-16be":"utf-8";
    text=new TextDecoder(encoding,{fatal:true}).decode(buffer);
    if(text.includes("\u0000"))throw new Error("This file contains binary data. Choose a valid text document.");
    if(ext==="JSON")JSON.parse(text);
  }
  checkAbort(signal);
  if(text.length>MAX_TEXT_CHARS)warning="Text index limited to the first 1,000,000 characters. The complete original is preserved.";
  return {text:text.slice(0,MAX_TEXT_CHARS),warning};
}
