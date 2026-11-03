/**
 * Pure engine of the Agent Plan card: an ordered list of steps that is reviewed and edited (rename, remove, reorder,
 * add) while the plan is a draft, then run step by step, can stop on a failed step and resume from it, and finishes.
 * Nothing here touches the DOM or time, so it is unit-tested directly (plan-model.test.mjs).
 *
 * Behaviour was observed on the public preview (docs/research/agent-plan/README.md): a run walks the steps in order,
 * each shows a live timer while active and "took 1.3s" once done; a failed step stops the run ("Stopped · step N
 * failed") and offers "Retry from here", which resets that step and every later one to pending; when the last step
 * finishes the card says "Done in Ns" and offers "Run again", which returns to review.
 */

export type StepState = "pending" | "active" | "done" | "failed";
export type PlanPhase = "draft" | "running" | "failed" | "done";

/** What a finished step does to the thing the plan is about (for the invoice engine: the invoice's status). */
export type PlanEffect = string;

export type PlanStep = {
  id: string;
  title: string;
  detail?: string;
  /** Short monospace chip, e.g. the tool or action the step uses. */
  tool?: string;
  /** Set on the step's owner when it finishes; see `effectOf`. */
  effect?: PlanEffect;
  /** Simulation hints read by the built-in executor only (`simulatedExecutor`). */
  simulate?: { durationMs?: number; failOnce?: string };
  state: StepState;
  tookMs?: number;
  error?: string;
};

export type PlanState = {
  steps: readonly PlanStep[];
  phase: PlanPhase;
  nextId: number;
  /** The steps as first given, restored by Cancel. */
  baseline: readonly PlanStep[];
};

export type PlanAction =
  | { type: "rename"; id: string; title: string }
  | { type: "remove"; id: string }
  | { type: "move"; id: string; to: number }
  | { type: "add"; title: string }
  | { type: "cancel" }
  | { type: "run" }
  | { type: "done"; id: string; tookMs: number }
  | { type: "fail"; id: string; error: string }
  | { type: "retry"; id: string }
  | { type: "reopen" };

export const defaultStepMs = 1200;

const fresh = (step: PlanStep): PlanStep => ({ ...step, state: "pending", tookMs: undefined, error: undefined });

export function createPlan(steps: readonly Omit<PlanStep, "state">[]): PlanState {
  const list = steps.map(step => ({ ...step, state: "pending" as const }));
  return { steps: list, phase: "draft", nextId: list.length + 1, baseline: list };
}

export function activeStep(state: PlanState): PlanStep | undefined {
  return state.steps.find(step => step.state === "active");
}

export const isEditable = (state: PlanState) => state.phase === "draft";

/** "Running · N of M": the position of the step being worked on (or the one that failed). */
export function progressOf(state: PlanState): { position: number; total: number } {
  const index = state.steps.findIndex(step => step.state === "active" || step.state === "failed");
  return { position: index < 0 ? state.steps.length : index + 1, total: state.steps.length };
}

/** The last effect among finished steps, in order; `fallback` before any effect-carrying step has finished. */
export function effectOf(steps: readonly PlanStep[], fallback: PlanEffect): PlanEffect {
  let current = fallback;
  for (const step of steps) if (step.state === "done" && step.effect) current = step.effect;
  return current;
}

export function estimateMs(steps: readonly PlanStep[]): number {
  return steps.reduce((sum, step) => sum + (step.simulate?.durationMs ?? defaultStepMs), 0);
}

/** "~10 s" under a minute, "~2 min" above (rounded up to whole minutes from 90 s). */
export function formatEstimate(ms: number): string {
  const seconds = Math.max(1, Math.round(ms / 1000));
  return seconds < 90 ? `~${seconds} s` : `~${Math.round(seconds / 60)} min`;
}

/** Elapsed run time as the card shows it: whole seconds, never below 1. */
export function formatElapsed(ms: number): string {
  return `${Math.max(1, Math.round(ms / 1000))}s`;
}

/** A step's own timer: one decimal. */
export function formatStepTime(ms: number): string {
  return `${(Math.max(0, ms) / 1000).toFixed(1)}s`;
}

function startFrom(steps: readonly PlanStep[], index: number): PlanStep[] {
  return steps.map((step, i) => (i === index ? { ...step, state: "active" as const, error: undefined } : step));
}

export function planReducer(state: PlanState, action: PlanAction): PlanState {
  const editing = isEditable(state);
  switch (action.type) {
    case "rename": {
      const title = action.title.trim();
      if (!editing || !title) return state;
      const step = state.steps.find(item => item.id === action.id);
      if (!step || step.title === title) return state;
      return { ...state, steps: state.steps.map(item => (item.id === action.id ? { ...item, title } : item)) };
    }
    case "remove": {
      if (!editing || !state.steps.some(step => step.id === action.id)) return state;
      return { ...state, steps: state.steps.filter(step => step.id !== action.id) };
    }
    case "move": {
      if (!editing) return state;
      const from = state.steps.findIndex(step => step.id === action.id);
      if (from < 0) return state;
      const to = Math.min(state.steps.length - 1, Math.max(0, action.to));
      if (to === from) return state;
      const next = [...state.steps];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return { ...state, steps: next };
    }
    case "add": {
      const title = action.title.trim();
      if (!editing || !title) return state;
      const step: PlanStep = { id: `step-${state.nextId}`, title, state: "pending" };
      return { ...state, steps: [...state.steps, step], nextId: state.nextId + 1 };
    }
    case "cancel":
      return editing ? { ...state, steps: state.baseline.map(fresh), nextId: Math.max(state.nextId, state.baseline.length + 1) } : state;
    case "run": {
      if (!editing || state.steps.length === 0) return state;
      return { ...state, phase: "running", steps: startFrom(state.steps.map(fresh), 0) };
    }
    case "done": {
      if (state.phase !== "running") return state;
      const index = state.steps.findIndex(step => step.id === action.id && step.state === "active");
      if (index < 0) return state;
      const steps = state.steps.map((step, i) => (i === index ? { ...step, state: "done" as const, tookMs: action.tookMs } : step));
      return index === steps.length - 1 ? { ...state, steps, phase: "done" } : { ...state, steps: startFrom(steps, index + 1) };
    }
    case "fail": {
      if (state.phase !== "running") return state;
      const index = state.steps.findIndex(step => step.id === action.id && step.state === "active");
      if (index < 0) return state;
      return { ...state, phase: "failed", steps: state.steps.map((step, i) => (i === index ? { ...step, state: "failed" as const, error: action.error } : step)) };
    }
    case "retry": {
      if (state.phase !== "failed") return state;
      const index = state.steps.findIndex(step => step.id === action.id && step.state === "failed");
      if (index < 0) return state;
      return { ...state, phase: "running", steps: startFrom(state.steps.map((step, i) => (i >= index ? fresh(step) : step)), index) };
    }
    case "reopen":
      return state.phase === "done" || state.phase === "failed" ? { ...state, phase: "draft", steps: state.steps.map(fresh) } : state;
  }
}
