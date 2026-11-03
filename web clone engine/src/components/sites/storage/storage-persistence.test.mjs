import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ResourceStore} from '../../../lib/workspace-backend/store.ts';
import {createLocalBackend} from '../../../lib/workspace-backend/local-backend.ts';
import {emptyStorage,storageResource} from './storage-model.ts';
import {persistStorage} from './storage-persistence.ts';
const doc={id:'receipt',name:'original.txt',category:'Finance',bytes:15,mime:'text/plain',sha256:'a'.repeat(64),addedAt:'2026-10-23T01:00:00Z',words:2,chunks:1,excerpt:'source evidence',keywords:['source'],extraction:'indexed'};
const data={...emptyStorage,onboarded:true,documents:[doc]};
test('read-back receipt detects swallowed local quota failure and recovers on retry',async()=>{
  const values=new Map();let fail=true;
  const backend=createLocalBackend({getItem:key=>values.get(key)||null,setItem:(key,value)=>{if(fail)throw new Error('quota');values.set(key,value);}});
  const store=new ResourceStore(backend,backend),entry=store.entry(storageResource,'test',emptyStorage);const stop=entry.subscribe(()=>{});await entry.load();entry.set(data);
  await assert.rejects(()=>persistStorage(entry,backend,'test'),/metadata could not be verified/);
  assert.equal(values.size,0);fail=false;
  await persistStorage(entry,backend,'test');assert.equal(JSON.parse([...values.values()][0]).documents.length,1);stop();store.dispose();
});
test('persistence waits for an already inflight save and then its queued latest edit',async()=>{
  let stored=emptyStorage,saves=0,release;const gate=new Promise(resolve=>{release=resolve;});
  const backend={kind:'test',remote:true,debounceMs:1000,async load(){return {value:stored};},async save(ref,value){saves++;if(saves===1)await gate;stored=value;}};
  const store=new ResourceStore(backend,backend),entry=store.entry(storageResource,'test',emptyStorage);const stop=entry.subscribe(()=>{});await entry.load();entry.set(data);
  const inflight=entry.flush();let finished=false;const receipt=persistStorage(entry,backend,'test').then(()=>{finished=true;});
  await new Promise(resolve=>setTimeout(resolve,10));assert.equal(finished,false);release();await inflight;await receipt;
  assert.ok(saves>=2);assert.deepEqual(stored.documents,[doc]);stop();store.dispose();
});
