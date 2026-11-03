import type { RunSnapshot, RunStep, StepRuntime } from "./run-types";

export const stepLeadIn = 700;
const emptyRuntime = (): StepRuntime => ({status:"pending",elapsed:0,completedCalls:0,callElapsed:0});
export function createRun(steps: RunStep[], startedAt = 0): RunSnapshot {
  const states = Object.fromEntries(steps.map(step=>[step.id,emptyRuntime()]));
  if(steps[0])states[steps[0].id].status="running";
  return {steps:structuredClone(steps),states,phase:steps.length ? "running" : "done",activeId:steps[0]?.id || null,elapsed:0,startedAt,approvals:{}};
}
export type RunAction =
  | {type:"tick";delta:number;now?:number}
  | {type:"start";now:number}
  | {type:"stop";now?:number}
  | {type:"approve";id:string;now?:number}
  | {type:"deny";id:string;now?:number}
  | {type:"retry";id:string;now:number}
  | {type:"rename";id:string;title:string}
  | {type:"move";id:string;direction:-1|1}
  | {type:"remove";id:string}
  | {type:"add";step:RunStep};

function nextPending(run: RunSnapshot): RunSnapshot {
  const next = run.steps.find(step=>run.states[step.id].status==="pending");
  if(!next)return {...run,activeId:null,phase:"done"};
  return {...run,activeId:next.id,phase:"running",states:{...run.states,[next.id]:{...run.states[next.id],status:"running"}}};
}

function settleWait(run: RunSnapshot,now?:number):RunSnapshot{
  if(!run.waitStartedAt||!now||!run.activeId)return run;
  const waited=Math.max(0,now-run.waitStartedAt),runtime=run.states[run.activeId];
  return {...run,waitStartedAt:undefined,elapsed:run.elapsed+waited,states:{...run.states,[run.activeId]:{...runtime,waited:(runtime.waited||0)+waited}}};
}

/** Deterministic simulation. No network requests or real side effects are dispatched by this model. */
export function runReducer(run: RunSnapshot, action: RunAction): RunSnapshot {
  switch(action.type){
    case "start": return run.startedAt ? run : {...run,startedAt:action.now};
    case "tick": {
      if(run.phase!=="running" || !run.activeId || action.delta<=0)return run;
      const step=run.steps.find(item=>item.id===run.activeId);
      if(!step)return nextPending(run);
      const before=run.states[step.id];
      const elapsed=before.elapsed+action.delta;
      if(step.approval && !run.approvals[step.id] && elapsed>=stepLeadIn){
        return {...run,elapsed:run.elapsed+Math.max(0,stepLeadIn-before.elapsed),phase:"waiting",waitStartedAt:action.now,states:{...run.states,[step.id]:{...before,status:"waiting",elapsed:stepLeadIn}}};
      }
      const total=stepLeadIn+step.calls.reduce((sum,call)=>sum+call.duration,0);
      let callElapsed=Math.max(0,elapsed-stepLeadIn),completedCalls=0;
      for(const call of step.calls){if(callElapsed>=call.duration){completedCalls++;callElapsed-=call.duration;}else break;}
      const done=elapsed>=total;
      const state:StepRuntime={status:done ? "done" : "running",elapsed:Math.min(total,elapsed),completedCalls:Math.min(step.calls.length,completedCalls),callElapsed:done ? 0 : callElapsed,waited:before.waited};
      const advanced={...run,elapsed:run.elapsed+Math.min(action.delta,Math.max(0,total-before.elapsed)),states:{...run.states,[step.id]:state}};
      return done ? nextPending(advanced) : advanced;
    }
    case "stop": {
      if(run.phase!=="running"&&run.phase!=="waiting")return run;
      const settled=settleWait(run,action.now);
      return {...settled,phase:"stopped",states:settled.activeId ? {...settled.states,[settled.activeId]:{...settled.states[settled.activeId],status:"stopped"}} : settled.states};
    }
    case "approve": {
      if(run.phase!=="waiting"||run.activeId!==action.id)return run;
      const settled=settleWait(run,action.now);
      return {...settled,phase:"running",approvals:{...settled.approvals,[action.id]:"approved"},states:{...settled.states,[action.id]:{...settled.states[action.id],status:"running"}}};
    }
    case "deny": {
      if(run.phase!=="waiting"||run.activeId!==action.id)return run;
      const settled=settleWait(run,action.now);
      return {...settled,phase:"stopped",approvals:{...settled.approvals,[action.id]:"denied"},states:{...settled.states,[action.id]:{...settled.states[action.id],status:"denied"}}};
    }
    case "retry": {
      const index=run.steps.findIndex(step=>step.id===action.id);if(index<0)return run;
      const states={...run.states},approvals={...run.approvals};
      run.steps.slice(index).forEach(step=>{states[step.id]=emptyRuntime();delete approvals[step.id];});states[action.id].status="running";
      return {...run,states,approvals,phase:"running",activeId:action.id,waitStartedAt:undefined,startedAt:run.startedAt || action.now};
    }
    case "rename": {
      const title=action.title.trim();return !title ? run : {...run,steps:run.steps.map(step=>step.id===action.id ? {...step,title} : step)};
    }
    case "move": {
      const index=run.steps.findIndex(step=>step.id===action.id),target=index+action.direction;
      if(index<0||target<0||target>=run.steps.length)return run;
      const steps=[...run.steps];[steps[index],steps[target]]=[steps[target],steps[index]];return {...run,steps};
    }
    case "remove": {
      if(run.phase==="running"||run.phase==="waiting")return run;
      const steps=run.steps.filter(step=>step.id!==action.id),states={...run.states},approvals={...run.approvals};delete states[action.id];delete approvals[action.id];
      return {...run,steps,states,approvals,activeId:run.activeId===action.id ? null : run.activeId};
    }
    case "add": return {...run,steps:[...run.steps,action.step],states:{...run.states,[action.step.id]:emptyRuntime()}};
  }
}

/** True for a well-formed run snapshot. Used for anything that did not come from this reducer (storage, a backend). */
export function isRunSnapshot(value: unknown): value is RunSnapshot {
  if (!value || typeof value !== "object") return false;
  const run = value as Partial<RunSnapshot>;
  return Array.isArray(run.steps) && run.steps.every(step => step && typeof step.id === "string" && Array.isArray(step.calls))
    && !!run.states && typeof run.states === "object" && ["running", "waiting", "done", "stopped"].includes(run.phase as string)
    && typeof run.elapsed === "number" && !!run.approvals && typeof run.approvals === "object";
}
