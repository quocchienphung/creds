import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRun,runReducer} from './run-model.ts';
const steps=[{id:'a',title:'Read',detail:'',tool:'read',calls:[{duration:300}]},{id:'b',title:'Send',detail:'',tool:'send',calls:[{duration:200}],approval:{title:'Send'}},{id:'c',title:'Review',detail:'',tool:'write',calls:[{duration:100}]}];
const tick=(s,delta)=>runReducer(s,{type:'tick',delta});
test('tools complete in order and approval gates all later side effects',()=>{
  let s=tick(createRun(steps),1000);assert.equal(s.activeId,'b');assert.equal(s.states.a.completedCalls,1);
  s=tick(s,5000);assert.equal(s.phase,'waiting');assert.equal(s.states.b.completedCalls,0);assert.equal(s.states.c.status,'pending');const waiting=s;
  assert.equal(tick(s,99999),waiting);assert.equal(runReducer(s,{type:'approve',id:'a'}),waiting);
  s=runReducer(s,{type:'approve',id:'b'});s=tick(s,200);assert.equal(s.activeId,'c');s=tick(s,800);assert.equal(s.phase,'done');
});
test('deny stops and retry removes previous approval before replaying the step',()=>{
  let s=tick(tick(createRun(steps),1000),700);s=runReducer(s,{type:'deny',id:'b'});assert.equal(s.phase,'stopped');assert.equal(s.states.b.status,'denied');assert.equal(s.states.c.status,'pending');
  s=runReducer(s,{type:'retry',id:'b',now:10});s=tick(s,700);assert.equal(s.phase,'waiting');assert.equal(s.approvals.b,undefined);assert.equal(s.states.a.status,'done');
});
test('approval waiting time is accounted once without executing a gated tool',()=>{
  let s=runReducer(tick(createRun(steps),1000),{type:'tick',delta:700,now:2000});assert.equal(s.phase,'waiting');
  s=runReducer(s,{type:'approve',id:'b',now:9000});assert.equal(s.states.b.waited,7000);assert.equal(s.states.b.completedCalls,0);assert.equal(s.elapsed,8700);
  s=tick(s,100);assert.equal(s.states.b.completedCalls,0);s=tick(s,100);assert.equal(s.states.b.status,'done');assert.equal(s.states.b.waited,7000);
});
test('stop cancels progress; rename/move/remove preserve stable ids and support custom steps',()=>{
  let s=runReducer(tick(createRun(steps),200),{type:'stop'});assert.equal(s.states.a.status,'stopped');assert.equal(tick(s,500),s);
  s=runReducer(s,{type:'rename',id:'c',title:'Renamed'});s=runReducer(s,{type:'move',id:'c',direction:-1});assert.deepEqual(s.steps.map(v=>v.id),['a','c','b']);assert.equal(s.steps[1].title,'Renamed');
  s=runReducer(s,{type:'remove',id:'a'});assert.equal(s.activeId,null);assert.equal(s.states.a,undefined);
  s=runReducer(s,{type:'add',step:{id:'d',title:'Extra',calls:[]}});assert.equal(s.states.d.status,'pending');
});
