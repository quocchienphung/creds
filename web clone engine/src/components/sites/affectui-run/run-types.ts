export type RunPhase = "running" | "waiting" | "done" | "stopped";
export type StepStatus = "pending" | "running" | "waiting" | "done" | "denied" | "stopped";
export interface ToolCall {
  name: string;
  summary: string;
  icon: "currency" | "search" | "document" | "mail" | "calendar";
  args: Record<string, unknown>;
  result: unknown;
  duration: number;
}
export interface RunApproval {
  title: string;
  description: string;
  risk: "low" | "medium" | "high";
  details: {label: string; value: string}[];
}
export interface RunStep {
  id: string;
  title: string;
  detail: string;
  tool: string;
  calls: ToolCall[];
  approval?: RunApproval;
}
export interface StepRuntime {
  status: StepStatus;
  elapsed: number;
  completedCalls: number;
  callElapsed: number;
  waited?: number;
}
export interface RunSnapshot {
  steps: RunStep[];
  states: Record<string, StepRuntime>;
  phase: RunPhase;
  activeId: string | null;
  elapsed: number;
  startedAt: number;
  waitStartedAt?: number;
  approvals: Record<string, "approved" | "denied">;
}
export interface RunPlanProps {
  title: string;
  snapshot: RunSnapshot;
  onRename: (id: string, title: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onRemove: (id: string) => void;
  onAdd: (title: string) => void;
  onRetry?: (id: string) => void;
  editing?: boolean;
}
export interface RunActivityProps {
  snapshot: RunSnapshot;
  onShowApproval: () => void;
  notify: (message: string) => void;
}
