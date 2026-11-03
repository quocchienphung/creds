"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { activeStep, createPlan, formatElapsed, planReducer, type PlanStep } from "./plan-model";
import { simulatedExecutor, type PlanExecutor } from "./invoice-plan";

type Options = {
  steps: readonly Omit<PlanStep, "state">[];
  executor?: PlanExecutor;
  onRun?: (steps: readonly PlanStep[]) => void;
  onDone?: (steps: readonly PlanStep[], elapsedMs: number) => void;
};

const TICK_MS = 100;

/**
 * Runs the plan engine against an executor: starts each active step once, measures its time, feeds the result back
 * (done / fail), keeps a run clock that stops while a step has failed, and cancels everything on unmount.
 */
export function usePlanEngine({ steps, executor = simulatedExecutor, onRun, onDone }: Options) {
  const [plan, dispatch] = useReducer(planReducer, steps, createPlan);
  const [reading, setReading] = useState({ elapsed: 0, step: 0 });
  const latest = useRef({ executor, onRun, onDone, plan });
  useEffect(() => { latest.current = { executor, onRun, onDone, plan }; });

  const inflight = useRef<{ id: string; controller: AbortController } | null>(null);
  const attempts = useRef(new Map<string, number>());
  const stepStart = useRef(0);
  const clock = useRef({ accumulated: 0, since: 0 });
  const reported = useRef(false);

  const phase = plan.phase;
  const running = phase === "running";

  // Run clock: counts only while running, so the time a plan sits failed is not part of the run.
  useEffect(() => {
    if (!running) return;
    clock.current.since = performance.now();
    const read = () => {
      const at = performance.now();
      setReading({ elapsed: clock.current.accumulated + at - clock.current.since, step: Math.max(0, at - stepStart.current) });
    };
    const id = setInterval(read, TICK_MS);
    read();
    return () => {
      clearInterval(id);
      clock.current.accumulated += performance.now() - clock.current.since;
      clock.current.since = 0;
      setReading(previous => ({ ...previous, elapsed: clock.current.accumulated }));
    };
  }, [running]);

  // Start the active step exactly once; the executor's answer drives the reducer.
  const active = activeStep(plan);
  const activeId = active?.id;
  useEffect(() => {
    if (phase !== "running" || !activeId || inflight.current?.id === activeId) return;
    const step = latest.current.plan.steps.find(item => item.id === activeId);
    if (!step) return;
    const controller = new AbortController();
    inflight.current = { id: activeId, controller };
    stepStart.current = performance.now();
    const attempt = attempts.current.get(activeId) ?? 0;
    attempts.current.set(activeId, attempt + 1);
    Promise.resolve().then(() => latest.current.executor(step, { signal: controller.signal, attempt })).then(result => {
      if (controller.signal.aborted) return;
      inflight.current = null;
      dispatch({ type: "done", id: activeId, tookMs: result?.tookMs ?? performance.now() - stepStart.current });
    }, error => {
      if (controller.signal.aborted) return;
      inflight.current = null;
      dispatch({ type: "fail", id: activeId, error: error instanceof Error && error.message ? error.message : "The step failed" });
    });
  }, [phase, activeId]);

  useEffect(() => () => { inflight.current?.controller.abort(); }, []);

  const elapsedMs = reading.elapsed;
  const stepMs = running && active ? reading.step : 0;

  useEffect(() => {
    if (phase === "done" && !reported.current) {
      reported.current = true;
      latest.current.onDone?.(latest.current.plan.steps, clock.current.accumulated);
    }
    if (phase !== "done") reported.current = false;
  }, [phase]);

  const run = useCallback(() => {
    if (latest.current.plan.phase !== "draft" || latest.current.plan.steps.length === 0) return;
    attempts.current.clear();
    inflight.current?.controller.abort();
    inflight.current = null;
    clock.current = { accumulated: 0, since: 0 };
    setReading({ elapsed: 0, step: 0 });
    latest.current.onRun?.(latest.current.plan.steps);
    dispatch({ type: "run" });
  }, []);

  const retry = useCallback((id: string) => {
    inflight.current = null;
    dispatch({ type: "retry", id });
  }, []);

  const reopen = useCallback(() => {
    inflight.current?.controller.abort();
    inflight.current = null;
    clock.current = { accumulated: 0, since: 0 };
    setReading({ elapsed: 0, step: 0 });
    attempts.current.clear();
    dispatch({ type: "reopen" });
  }, []);

  return { plan, dispatch, run, retry, reopen, elapsedLabel: formatElapsed(elapsedMs), elapsedMs, stepMs };
}
