import type { IssueCategory, Severity } from "./engine/types";
import { SEVERITIES } from "../labels";

export type StatusFilter = "todo" | "done" | "all";
export interface ReviewFilters { severities: Severity[]; status: StatusFilter; category: IssueCategory | ""; field: string; query: string }
export const defaultFilters: ReviewFilters = { severities: [...SEVERITIES], status: "todo", category: "", field: "", query: "" };
