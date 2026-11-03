import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHttpBackend} from './http-backend.ts';
import {knowledgeChunks} from '../storage/knowledge-contract.ts';
const text='Source content',file=new File([text],'source.txt',{type:'text/plain'}),hash='a'.repeat(64),index={text,chunks:knowledgeChunks(text)};
test('all Storage operations share configurable routes, bearer auth and cookie settings',async()=>{
  const seen=[];
  const backend=createHttpBackend({baseUrl:'https://api.test/v1',credentials:'include',headers:()=>({Authorization:'Bearer test-token','Content-Type':'application/json'}),fetch:async(url,init)=>{
    const headers=new Headers(init.headers);seen.push({url:String(url),method:init.method,headers,credentials:init.credentials,body:init.body});
    if(init.method==='PUT')return Response.json({data:{id:'doc',sha256:hash,bytes:file.size}});
    if(init.method==='DELETE')return new Response(null,{status:204});
    if(String(url).endsWith('/index'))return Response.json({data:index});
    if(String(url).endsWith('/original'))return new Response(text);
    return Response.json({data:{ids:['doc']}});
  }});
  await backend.knowledge.save('w space','doc',file,index,hash);
  assert.deepEqual(await backend.knowledge.load('w space','doc'),index);
  assert.equal(await (await backend.knowledge.download('w space','doc')).text(),text);
  assert.deepEqual(await backend.knowledge.search('w space','SQL & banking'),['doc']);
  await backend.knowledge.remove('w space','doc');
  assert.ok(seen.every(r=>r.headers.get('authorization')==='Bearer test-token'&&r.credentials==='include'));
  assert.equal(seen[0].url,'https://api.test/v1/workspaces/w%20space/storage/documents/doc');
  assert.equal(seen[0].headers.has('content-type'),false);assert.ok(seen[0].body instanceof FormData);
  assert.match(seen[3].url,/search\?q=SQL%20%26%20banking$/);
});
test('upload receipts and indexes are validated; auth and unsupported APIs fail visibly',async()=>{
  const backend=createHttpBackend({baseUrl:'/api',fetch:async()=>Response.json({data:{id:'other',sha256:hash,bytes:file.size}})});
  await assert.rejects(backend.knowledge.save('w','doc',file,index,hash),/receipt/);
  await assert.rejects(backend.knowledge.load('w','doc'),/invalid document index/);
  const denied=createHttpBackend({baseUrl:'/api',fetch:async()=>Response.json({error:{message:'Token required'}},{status:401})});
  await assert.rejects(denied.knowledge.download('w','doc'),e=>e.code==='unauthorized');
  const missing=createHttpBackend({baseUrl:'/api',fetch:async()=>new Response(null,{status:404})});
  await assert.rejects(missing.knowledge.save('w','doc',file,index,hash),e=>e.code==='not-found');
});
