import { test } from 'node:test';
import assert from 'node:assert/strict';
import {buildStorageTree,emptyStorage,indexDocument,parseStorageLibrary,squarify,validateDocument,MAX_DOCUMENT_BYTES} from './storage-model.ts';

const document=(id,category,bytes)=>({id,name:`${id}.txt`,category,bytes,mime:'text/plain',sha256:'a'.repeat(64),addedAt:'2026-10-23T01:00:00Z',words:2,chunks:1,excerpt:'sample words',keywords:['sample'],extraction:'indexed'});
test('library accepts measured records and rejects malformed or executable metadata',()=>{
  assert.deepEqual(parseStorageLibrary(emptyStorage),emptyStorage);
  const good={...emptyStorage,documents:[document('one','SQL',234)]};
  assert.deepEqual(parseStorageLibrary(good),good);
  for(const patch of [{bytes:-1},{bytes:Infinity},{category:'Invented'},{url:'javascript:alert(1)'},{url:'//evil.test/file'},{words:NaN},{chunks:1.2},{sha256:'invented'},{keywords:[123]},{addedAt:'bad'}])assert.equal(parseStorageLibrary({...good,documents:[{...good.documents[0],...patch}]}),undefined);
  assert.equal(parseStorageLibrary({...good,documents:[...good.documents,...good.documents]}),undefined);
});
test('file admission rejects oversize, empty and unsupported documents',()=>{
  for(const name of ['report.pdf','queries.sql','bank.docx','finance.xlsx','data.tsv','notes.md'])assert.doesNotThrow(()=>validateDocument({name,size:20}));
  for(const f of [{name:'a.exe',size:20},{name:'empty.txt',size:0},{name:'huge.pdf',size:MAX_DOCUMENT_BYTES+1}])assert.throws(()=>validateDocument(f));
});
test('lexical index retains source text with overlap; does not generate summaries',()=>{
  const text='Finance finance banking SQL data.\r\n'+('knowledge '.repeat(500));
  const index=indexDocument(text);
  assert.equal(index.text,text.replace(/\r\n/g,'\n').trim());
  assert.equal(index.keywords[0],'knowledge');
  assert.equal(index.chunks[0].slice(-200),index.chunks[1].slice(0,200));
  assert.equal(index.excerpt,index.text.slice(0,800));
  assert.equal(indexDocument('  ').chunks.length,0);
});
test('treemap uses actual original bytes or file counts in each subject',()=>{
  const docs=[document('a','Finance',200),document('b','Finance',800),document('c','SQL',500)];
  assert.equal(buildStorageTree(docs,'files','indexed')[0].value,2);
  assert.equal(buildStorageTree(docs,'bytes','indexed')[0].value,1000);
  assert.equal(buildStorageTree(docs,'files','indexed')[1].value,0);
  const tree=buildStorageTree(docs.map((d,i)=>({...d,extraction:i?'original-only':'indexed'})),'files','indexed');
  assert.equal(tree[0].color,.5);
  assert.equal(tree.reduce((s,n)=>s+n.value,0),docs.length);
});
test('squarified tiles conserve area, stay bounded and never overlap over varied screens',()=>{
  for(const [width,height] of [[1200,420],[300,310],[70,500],[500,70]])for(const values of [[5,3,2,1],[1000,1,1,0],Array.from({length:100},(_,i)=>(i*17)%29+1)]){
    const total=values.reduce((s,v)=>s+v,0),rects=squarify(values.map((value,id)=>({id:String(id),value})),{x:0,y:0,width,height});
    assert.equal(rects.length,values.filter(v=>v>0).length);
    assert.ok(Math.abs(rects.reduce((s,r)=>s+r.width*r.height,0)-width*height)<.001);
    for(const r of rects){assert.ok(r.x>=-.001&&r.y>=-.001&&r.x+r.width<=width+.001&&r.y+r.height<=height+.001);assert.ok(Math.abs(r.width*r.height-width*height*values[Number(r.id)]/total)<.001);}
    for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++){const a=rects[i],b=rects[j];assert.ok(Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)<.001||Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y)<.001);}
  }
  assert.deepEqual(squarify([{id:'zero',value:0}],{x:0,y:0,width:50,height:50}),[]);
});
