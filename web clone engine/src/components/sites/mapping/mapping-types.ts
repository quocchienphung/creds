/**
 * The serializable data behind the map. Everything the user sees, and everything a backend would store,
 * is in `MappingData`. Geometry, rollups and camera state are derived and never persisted.
 */
export type TaskStatus = "todo" | "progress" | "review" | "blocked" | "done";
export type Health = "on-track" | "at-risk" | "off-track";
export type EntityKind = "person" | "team" | "project" | "task" | "item";

export interface MappingPerson { id: string; name: string; role: string; avatarUrl?: string }
export interface MappingChecklistItem { id: string; label: string; done: boolean }
export interface MappingTask {
  id: string; title: string; description: string; status: TaskStatus; assigneeId: string | null;
  /** ISO date (YYYY-MM-DD) or null. */
  due: string | null; points: number; comments: number; checklist: MappingChecklistItem[];
}
export interface MappingProject { id: string; name: string; brief: string; health: Health; due: string | null; leadId: string | null; blocker: string; tasks: MappingTask[] }
export interface MappingTeam { id: string; name: string; mission: string; leadId: string | null; memberIds: string[]; projects: MappingProject[] }
export interface MappingData {
  version: 1;
  name: string;
  people: MappingPerson[];
  teams: MappingTeam[];
  /** Highest number handed out per kind, so generated names ("User 7") and ids only ever count upward. */
  seq: Record<EntityKind, number>;
}

export const statusLabels: Record<TaskStatus, string> = { done: "Done", review: "In review", progress: "In progress", todo: "To do", blocked: "Blocked" };
export const healthLabels: Record<Health, string> = { "on-track": "On track", "at-risk": "At risk", "off-track": "Off track" };
export const statusOrder: TaskStatus[] = ["todo", "progress", "review", "blocked", "done"];
export const healthOrder: Health[] = ["on-track", "at-risk", "off-track"];

/** Every change the UI can make. A backend adapter receives these next to the resulting snapshot. */
export type MappingCommand =
  | { type: "workspace.update"; name: string }
  | { type: "person.add"; name?: string; role?: string }
  | { type: "person.update"; id: string; patch: Partial<Omit<MappingPerson, "id">> }
  | { type: "person.remove"; id: string }
  | { type: "team.add"; name?: string }
  | { type: "team.update"; id: string; patch: Partial<Omit<MappingTeam, "id" | "projects">> }
  | { type: "team.remove"; id: string }
  | { type: "team.move"; id: string; toIndex: number }
  | { type: "project.add"; teamId: string; name?: string }
  | { type: "project.update"; id: string; patch: Partial<Omit<MappingProject, "id" | "tasks">> }
  | { type: "project.remove"; id: string }
  | { type: "project.move"; id: string; toTeamId: string; toIndex: number }
  | { type: "task.add"; projectId: string; title?: string }
  | { type: "task.update"; id: string; patch: Partial<Omit<MappingTask, "id" | "checklist">> }
  | { type: "task.setStatus"; id: string; status: TaskStatus }
  | { type: "task.remove"; id: string }
  | { type: "item.add"; taskId: string; label?: string }
  | { type: "item.update"; taskId: string; id: string; patch: Partial<Omit<MappingChecklistItem, "id">> }
  | { type: "item.toggle"; taskId: string; id: string }
  | { type: "item.remove"; taskId: string; id: string }
  | { type: "data.replace"; data: MappingData };

/** Result of a command; `created` lets the UI move the camera to a new team, project or task. */
export interface CommandResult { data: MappingData; created?: { kind: "team" | "project" | "task"; id: string } }
