"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { CONCURRENCY, RunSimulation, SAMPLE, applyEvent, emptyRun } from "./orchestrator-model.ts";
import type { RunView, Scenario, SimEvent } from "./orchestrator-model.ts";

interface State { view: RunView; events: SimEvent[]; runs: number }
type Action = { type: "reset"; scenario: Scenario } | { type: "events"; events: SimEvent[]; scenario: Scenario };
const init = (scenario: Scenario): State => ({ view: emptyRun(scenario), events: [], runs: 0 });
function reducer(state: State, action: Action): State {
  if (action.type === "reset") return { view: emptyRun(action.scenario), events: [], runs: state.runs + 1 };
  let view = state.view;
  for (const event of action.events) view = applyEvent(view, event, action.scenario);
  return { ...state, view, events: [...state.events, ...action.events] };
}

const storageKey = (workspaceId: string) => `affectui:${workspaceId}:orchestrator`;
function readSaved(workspaceId: string): { concurrency: number; approvals: boolean } {
  try {
    const saved = JSON.parse(window.localStorage.getItem(storageKey(workspaceId)) ?? "null");
    if (saved && typeof saved.concurrency === "number") return { concurrency: Math.min(CONCURRENCY.max, Math.max(CONCURRENCY.min, Math.round(saved.concurrency))), approvals: saved.approvals === true };
  } catch { /* storage can be unavailable or hold something else */ }
  return { concurrency: CONCURRENCY.max, approvals: false };
}

export interface RunController {
  scenario: Scenario;
  view: RunView;
  events: SimEvent[];
  /** how many runs have started: a new one resets what the lanes show */
  runs: number;
  concurrency: number;
  approvals: boolean;
  active: boolean;
  /** ms since Run, frozen once the run has ended or been stopped */
  clock: () => number;
  start: () => void;
  stop: () => void;
  setConcurrency: (value: number) => void;
  setApprovals: (on: boolean) => void;
  retryNow: (lane: number) => void;
  resolve: (lane: number, allow: boolean) => void;
}

/**
 * Runs the sample orchestration in real time: a timer sleeps until the simulation's next event, the events go through one reducer, and the concurrency limit
 * can change while it runs. Nothing is sent anywhere; the run is a simulation.
 */
export function useOrchestratorRun(workspaceId: string, scenario: Scenario = SAMPLE): RunController {
  const [state, dispatch] = useReducer(reducer, scenario, init);
  const sim = useRef<RunSimulation | null>(null);
  const startedAt = useRef(0);
  const frozen = useRef<number | null>(null);
  const timer = useRef(0);
  const saved = useRef<{ concurrency: number; approvals: boolean }>({ concurrency: CONCURRENCY.max, approvals: false });
  const [, rerender] = useReducer((count: number) => count + 1, 0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    saved.current = readSaved(workspaceId);
    rerender();
    return () => { alive.current = false; window.clearTimeout(timer.current); };
  }, [workspaceId]);

  const clock = useCallback(() => frozen.current ?? Math.max(0, performance.now() - startedAt.current), []);
  const persist = useCallback(() => { try { window.localStorage.setItem(storageKey(workspaceId), JSON.stringify(saved.current)); } catch { /* ignore */ } }, [workspaceId]);

  const pump = useCallback(() => {
    window.clearTimeout(timer.current);
    const run = sim.current;
    if (!run || !alive.current) return;
    const now = performance.now() - startedAt.current;
    const events = run.advance(now);
    if (events.length) dispatch({ type: "events", events, scenario });
    const next = run.nextAt();
    if (next === null) {
      // nothing left to do: finished, or every lane that is left is waiting for a person
      if (run.pendingApprovals().length === 0) frozen.current = events.length ? events[events.length - 1].at : now;
      return;
    }
    timer.current = window.setTimeout(pump, Math.max(0, next - (performance.now() - startedAt.current)));
  }, [scenario]);

  const start = useCallback(() => {
    window.clearTimeout(timer.current);
    const run = new RunSimulation(scenario, saved.current.concurrency);
    run.setApprovals(saved.current.approvals);
    sim.current = run;
    startedAt.current = performance.now();
    frozen.current = null;
    dispatch({ type: "reset", scenario });
    pump();
  }, [pump, scenario]);

  const stop = useCallback(() => {
    const run = sim.current;
    if (!run) return;
    const now = performance.now() - startedAt.current;
    run.stop(now);
    window.clearTimeout(timer.current);
    frozen.current = now;
    dispatch({ type: "events", events: [{ at: now, type: "stop" }], scenario });
  }, [scenario]);

  const setConcurrency = useCallback((value: number) => {
    saved.current = { ...saved.current, concurrency: Math.min(CONCURRENCY.max, Math.max(CONCURRENCY.min, value)) };
    persist();
    sim.current?.setConcurrency(saved.current.concurrency, performance.now() - startedAt.current);
    if (sim.current && frozen.current === null) pump();
    rerender();
  }, [persist, pump]);
  const setApprovals = useCallback((on: boolean) => { saved.current = { ...saved.current, approvals: on }; persist(); sim.current?.setApprovals(on); rerender(); }, [persist]);
  const retryNow = useCallback((lane: number) => { if (sim.current?.retryNow(lane, performance.now() - startedAt.current)) pump(); }, [pump]);
  const resolve = useCallback((lane: number, allow: boolean) => { sim.current?.resolveApproval(lane, allow, performance.now() - startedAt.current); frozen.current = null; pump(); }, [pump]);

  const active = state.view.status === "planning" || state.view.status === "running" || state.view.status === "merging";
  return useMemo(() => ({
    scenario, view: state.view, events: state.events, runs: state.runs, concurrency: saved.current.concurrency, approvals: saved.current.approvals, active, clock, start, stop, setConcurrency, setApprovals, retryNow, resolve,
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `saved` is a ref read on purpose, rerender() refreshes it
  }), [scenario, state, active, clock, start, stop, setConcurrency, setApprovals, retryNow, resolve, saved.current.concurrency, saved.current.approvals]);
}
