import type { ResourceEntry } from "../../../lib/workspace-backend/store.ts";
import type { WorkspaceBackend } from "../../../lib/workspace-backend/types.ts";
import { parseStorageLibrary, storageSignature, type StorageLibrary } from "./storage-model.ts";

/** `flush()` schedules saves but isn't a receipt. Wait for its actual outcome, then read back. */
export async function persistStorage(entry:ResourceEntry<StorageLibrary>,backend:WorkspaceBackend,workspaceId:string) {
  entry.set({...entry.getSnapshot().value});
  await entry.flush();
  if(entry.isDirty||entry.getSnapshot().save==="saving")await new Promise<void>((resolve,reject)=>{
    const timer=setTimeout(()=>{unsubscribe();reject(new Error("The document metadata save is still pending. Originals are kept on this device; retry the save before leaving."));},12000);
    const changed=()=>{
      const view=entry.getSnapshot();
      if(view.error){clearTimeout(timer);unsubscribe();reject(view.error);}
      else if(!entry.isDirty&&view.save==="idle"){clearTimeout(timer);unsubscribe();resolve();}
    };
    const unsubscribe=entry.subscribe(changed);changed();
  });
  const view=entry.getSnapshot();if(view.error)throw view.error;
  const saved=await backend.load<unknown>({name:"knowledge-library",workspaceId});
  const receipt=saved&&parseStorageLibrary(saved.value);
  if(!receipt||storageSignature(receipt)!==storageSignature(entry.getSnapshot().value))throw new Error("The original and index are safe on this device, but the library metadata could not be verified. Retry save before leaving this page.");
}
