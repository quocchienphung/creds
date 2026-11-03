import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blockShortcuts,menuAnchor} from './block-shortcuts.ts';
import {createBlankProcess,createNode,LIMITS} from './process-model.ts';
const fixture=()=>{const doc=createBlankProcess('Shortcut test');doc.root.task='Coordinate';const node=createNode({name:'Writer',task:'Write the result'});doc.root.children=[node];return {doc,node};};
test('run shortcuts require a configured whole branch, not just a configured parent',()=>{
  const {doc,node}=fixture();assert.equal(blockShortcuts(doc,node,{active:false})[0].disabled,false);
  node.children=[createNode({name:'Unconfigured',task:''})];const action=blockShortcuts(doc,node,{active:false})[0];assert.equal(action.disabled,true);assert.match(action.description,/Unconfigured: Describe the task/);
  node.children=[];node.ai.provider='ollama';node.ai.model='';assert.equal(blockShortcuts(doc,node,{active:false})[0].disabled,true);
});
test('waiting and failed block shortcuts preserve the existing approval and retry paths',()=>{
  const {doc,node}=fixture();assert.equal(blockShortcuts(doc,node,{active:true,run:{status:'waiting',cost:0}})[0].id,'review');
  assert.equal(blockShortcuts(doc,node,{active:false,run:{status:'failed',cost:0}})[0].id,'retry');
  assert.equal(blockShortcuts(doc,node,{active:true,run:{status:'running',cost:0}})[0].id,'trace');
});
test('an active or starting run freezes mutations and a starting run cannot be launched twice',()=>{
  const {doc,node}=fixture();for(const options of [{active:true},{active:false,starting:true}]){
    const list=blockShortcuts(doc,node,options);assert.equal(list.find(a=>a.id==='settings').disabled,false);
    assert.ok(list.filter(a=>['add','duplicate','approval','delete'].includes(a.id)).every(a=>a.disabled));
  }
  assert.equal(blockShortcuts(doc,node,{active:false,starting:true})[0].disabled,true);
});
test('root protections, human approval and subtree copy limits remain enforced',()=>{
  const {doc,node}=fixture();const root=blockShortcuts(doc,doc.root,{active:false});assert.ok(root.find(a=>a.id==='delete').disabled);assert.ok(root.find(a=>a.id==='duplicate').disabled);
  node.ai.provider='human';node.approval=true;assert.ok(blockShortcuts(doc,node,{active:false}).find(a=>a.id==='approval').disabled);
  doc.root.children=Array.from({length:LIMITS.nodes-1},(_,i)=>createNode({name:`Task ${i}`,task:'Do work'}));assert.ok(blockShortcuts(doc,doc.root.children[0],{active:false}).find(a=>a.id==='add').disabled);
});
test('every shortcut has a hotkey and hotkeys never collide within one menu',()=>{
  const {doc,node}=fixture();
  for(const options of [{active:false},{active:true},{active:true,run:{status:'waiting',cost:0}},{active:false,run:{status:'failed',cost:0}}]){
    const keys=blockShortcuts(doc,node,options).map(a=>a.hotkey);assert.ok(keys.every(Boolean));assert.equal(new Set(keys.map(k=>k.toLowerCase())).size,keys.length);
  }
});
test('menu anchor: pointer where clicked, keyboard at the block centre',()=>{
  const rect={left:100,top:200,width:300,height:100};
  assert.deepEqual(menuAnchor({clientX:130,clientY:240,button:2,pointerType:'mouse'},rect),{x:130,y:240,keyboard:false});
  assert.deepEqual(menuAnchor({clientX:130,clientY:240,button:0,pointerType:'touch'},rect),{x:130,y:240,keyboard:false});
  assert.deepEqual(menuAnchor({clientX:0,clientY:0,button:0},rect),{x:250,y:250,keyboard:true});
  assert.deepEqual(menuAnchor({clientX:7,clientY:9,button:-1,pointerType:'mouse'},rect),{x:250,y:250,keyboard:true});
});
