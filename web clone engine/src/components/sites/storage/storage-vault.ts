export interface VaultDocument { blob: Blob; text: string; chunks: string[] }
async function openVault() {
  return new Promise<IDBDatabase>((resolve,reject)=>{
    const req=indexedDB.open("logio-knowledge-vault",1);
    req.onupgradeneeded=()=>req.result.createObjectStore("documents");
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(new Error("Document storage is unavailable on this device."));
    req.onblocked=()=>reject(new Error("Close older Storage tabs and try again."));
  });
}
async function vaultOperation(workspaceId:string,id:string,action:"get"|"put"|"delete",value?:VaultDocument):Promise<VaultDocument|undefined> {
  const db=await openVault();
  try{return await new Promise((resolve,reject)=>{
    const tx=db.transaction("documents",action==="get"?"readonly":"readwrite"),store=tx.objectStore("documents"),key=`${workspaceId}:${id}`;
    const req=action==="put"?store.put(value,key):action==="delete"?store.delete(key):store.get(key);
    tx.oncomplete=()=>resolve(action==="get"?req.result as VaultDocument|undefined:undefined);
    tx.onabort=tx.onerror=()=>reject(new Error("Could not save this document. Check available device storage and retry."));
  });}finally{db.close();}
}
export const readVault=(workspaceId:string,id:string)=>vaultOperation(workspaceId,id,"get");
export const writeVault=(workspaceId:string,id:string,value:VaultDocument)=>vaultOperation(workspaceId,id,"put",value);
export const deleteVault=(workspaceId:string,id:string)=>vaultOperation(workspaceId,id,"delete");
export function downloadBlob(blob:Blob,name:string) {
  const url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
}
