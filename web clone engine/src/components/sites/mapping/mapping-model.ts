import type { Health, MappingChecklistItem, MappingData, TaskStatus } from "./mapping-types.ts";

export { healthLabels, statusLabels } from "./mapping-types.ts";
export type { Health, TaskStatus } from "./mapping-types.ts";

export type NodeKind = "company" | "team" | "project" | "task" | "person";
export interface MapNode { id: number; key: string; kind: NodeKind; parent: number; children: number[]; x: number; y: number; w: number; h: number; ref: number; name: string }
export interface PersonView { id: string; name: string; role: string; avatarUrl?: string; first: string; initials: string }
export interface TeamView { id: string; name: string; lead: number; mission: string; members: number[]; projects: number[]; node: number }
export interface ProjectView { id: string; name: string; brief: string; team: number; health: Health; due: string | null; lead: number; blocker: string; tasks: number[]; people: number[]; node: number }
export interface TaskView { id: string; title: string; description: string; project: number; base: TaskStatus; assignee: number; due: string | null; points: number; comments: number; checklist: MappingChecklistItem[]; node: number }
export interface MapStats { progress: number; open: number; blocked: number; total: number; nextDue: string | null; people: number[]; projects: number; atRisk: number }

/** Layout units. Projects keep a fixed width; their height grows with the number of task rows. */
export const LAYOUT = { projectWidth: 200, projectGap: 16, teamPadding: 20, teamHeader: 84, teamGap: 32, rowLimit: 1648, taskTop: 60, taskPitch: 32, taskHeight: 28, minTaskRows: 4, projectFooter: 30, emptyWorld: { w: 960, h: 540 } };
export const UNASSIGNED: PersonView = { id: "", name: "Unassigned", role: "", first: "Nobody", initials: "?" };

const initialsOf = (name: string) => (name.trim().split(/\s+/).filter(Boolean).map(part => [...part][0]).join("").slice(0, 2).toUpperCase()) || "?";
/** `YYYY-MM-DD` to "Oct 15", independent of the viewer's time zone. */
export function formatDue(date: string | null) {
  if (!date) return "no date";
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export class MappingModel {
  readonly nodes: MapNode[] = [];
  readonly teams: TeamView[] = [];
  readonly projects: ProjectView[] = [];
  readonly tasks: TaskView[] = [];
  readonly people: PersonView[];
  readonly byKey = new Map<string, number>();
  world = { w: LAYOUT.emptyWorld.w, h: LAYOUT.emptyWorld.h };
  readonly data: MappingData;

  constructor(data: MappingData) {
    this.data = data;
    this.people = data.people.map(person => ({ ...person, name: person.name || "Unnamed", first: (person.name.trim().split(/\s+/)[0]) || "Unnamed", initials: initialsOf(person.name) }));
    this.nodes.push({ id: 0, key: "company", kind: "company", parent: -1, children: [], x: 0, y: 0, w: 0, h: 0, ref: 0, name: data.name || "Workspace" });
    this.build();
  }

  person(index: number) { return this.people[index] ?? UNASSIGNED; }
  private personIndex(id: string | null) { return id ? this.people.findIndex(person => person.id === id) : -1; }
  private add(node: Omit<MapNode, "id" | "children">) {
    const id = this.nodes.length;
    this.nodes.push({ ...node, id, children: [] });
    this.nodes[node.parent].children.push(id);
    this.byKey.set(node.key, id);
    return id;
  }

  private build() {
    const { data } = this, { projectWidth: cw, projectGap: gap, teamPadding: pad, teamHeader: header, teamGap, rowLimit } = LAYOUT;
    this.byKey.set("company", 0);
    // Teams flow left to right and wrap when a row would pass the limit. Nothing is positioned by hand.
    let rowX = 0, rowY = 0, rowHeight = 0, right = 0;
    data.teams.forEach((source, teamIndex) => {
      const count = source.projects.length, cols = count <= 1 ? 1 : count <= 4 ? 2 : 3;
      const projectRows = Math.ceil(count / cols);
      const heights = source.projects.map(project => LAYOUT.taskTop + LAYOUT.taskPitch * Math.max(LAYOUT.minTaskRows, Math.ceil(project.tasks.length / 3)) + LAYOUT.projectFooter);
      const rowHeights = Array.from({ length: projectRows }, (_, row) => Math.max(...heights.slice(row * cols, row * cols + cols)));
      const w = 2 * pad + cols * cw + (cols - 1) * gap;
      const h = count ? header + rowHeights.reduce((sum, value) => sum + value, 0) + (projectRows - 1) * gap + pad : header + 60 + pad;
      if (rowX > 0 && rowX + w > rowLimit) { rowY += rowHeight + teamGap; rowX = 0; rowHeight = 0; }
      const members = source.memberIds.map(id => this.personIndex(id)).filter(index => index >= 0);
      const teamNode = this.add({ key: `team:${source.id}`, kind: "team", parent: 0, x: rowX, y: rowY, w, h, ref: teamIndex, name: source.name || "Untitled team" });
      const team: TeamView = { id: source.id, name: source.name || "Untitled team", lead: this.personIndex(source.leadId), mission: source.mission, members, projects: [], node: teamNode };
      this.teams.push(team);
      let projectY = rowY + header;
      source.projects.forEach((item, projectIndex) => {
        const col = projectIndex % cols, row = Math.floor(projectIndex / cols);
        if (col === 0 && row > 0) projectY += rowHeights[row - 1] + gap;
        const x = rowX + pad + col * (cw + gap), y = projectY, height = heights[projectIndex];
        const projectId = this.projects.length;
        const projectNode = this.add({ key: `project:${item.id}`, kind: "project", parent: teamNode, x, y, w: cw, h: height, ref: projectId, name: item.name || "Untitled project" });
        const project: ProjectView = { id: item.id, name: item.name || "Untitled project", brief: item.brief, health: item.health, due: item.due, lead: this.personIndex(item.leadId), blocker: item.blocker, team: teamIndex, tasks: [], people: [], node: projectNode };
        this.projects.push(project); team.projects.push(projectId);
        const tile = (cw - 32) / 3;
        item.tasks.forEach((task, index) => {
          const taskId = this.tasks.length;
          const node = this.add({ key: `task:${task.id}`, kind: "task", parent: projectNode, x: x + 12 + index % 3 * (tile + 4), y: y + LAYOUT.taskTop + LAYOUT.taskPitch * Math.floor(index / 3), w: tile, h: LAYOUT.taskHeight, ref: taskId, name: task.title || "Untitled task" });
          this.tasks.push({ id: task.id, title: task.title || "Untitled task", description: task.description, project: projectId, base: task.status, assignee: this.personIndex(task.assigneeId), due: task.due, points: task.points, comments: task.comments, checklist: task.checklist, node });
          project.tasks.push(taskId);
        });
        project.people = [...new Set([project.lead, ...project.tasks.map(id => this.tasks[id].assignee)].filter(index => index >= 0))].slice(0, 5);
        project.people.forEach((person, index) => this.add({ key: `person:${item.id}:${this.people[person].id}`, kind: "person", parent: projectNode, x: x + 12 + 19 * index, y: y + height - 28, w: 16, h: 16, ref: person, name: this.people[person].name }));
      });
      rowX += w + teamGap; rowHeight = Math.max(rowHeight, h); right = Math.max(right, rowX - teamGap);
    });
    const empty = !data.teams.length;
    this.world = empty ? { ...LAYOUT.emptyWorld } : { w: right, h: rowY + rowHeight };
    Object.assign(this.nodes[0], { w: this.world.w, h: this.world.h });
  }

  nodePath(id: number) {
    const result: number[] = [];
    for (let current = id; current >= 0; current = this.nodes[current].parent) result.unshift(current);
    return result;
  }
  /** The entity keys from the studio down to `id`, stable across edits (indices are not). */
  keyPath(id: number) { return this.nodePath(id).map(index => this.nodes[index].key); }

  status(id: number): TaskStatus {
    const task = this.tasks[id], items = task.checklist;
    if (items.length && items.every(item => item.done)) return "done";
    return task.base === "done" && items.length ? "review" : task.base;
  }
  done(id: number) { return this.tasks[id].checklist.filter(item => item.done).length; }
  completion(id: number) { const items = this.tasks[id].checklist; return this.status(id) === "done" ? 1 : items.length ? this.done(id) / items.length * .8 : 0; }
  tasksOf(id: number): number[] {
    const node = this.nodes[id];
    if (node.kind === "task") return [node.ref];
    if (node.kind === "project") return this.projects[node.ref].tasks;
    if (node.kind === "team") return this.teams[node.ref].projects.flatMap(project => this.projects[project].tasks);
    if (node.kind === "person") return this.tasksOf(node.parent).filter(task => this.tasks[task].assignee === node.ref);
    return this.tasks.map((_, index) => index);
  }
  stats(id: number): MapStats {
    const selected = this.tasksOf(id);
    let weight = 0, completed = 0, open = 0, blocked = 0, nextDue: string | null = null;
    selected.forEach(task => {
      const points = Math.max(1, this.tasks[task].points), status = this.status(task);
      weight += points; completed += points * this.completion(task);
      if (status !== "done") { open++; const due = this.tasks[task].due; if (due && (!nextDue || due < nextDue)) nextDue = due; }
      if (status === "blocked") blocked++;
    });
    const node = this.nodes[id];
    const members = node.kind === "company" ? this.people.map((_, index) => index) : node.kind === "team" ? this.teams[node.ref].members : node.kind === "project" ? this.projects[node.ref].people : node.kind === "task" ? [this.tasks[node.ref].assignee] : [node.ref];
    const portfolio = node.kind === "company" ? this.projects : node.kind === "team" ? this.teams[node.ref].projects.map(project => this.projects[project]) : [];
    return { progress: weight ? completed / weight : 0, open, blocked, total: selected.length, nextDue, people: members.filter(index => index >= 0), projects: portfolio.length, atRisk: portfolio.filter(project => project.health !== "on-track").length };
  }
  /** The task's own description, or a sentence generated from its status, owner and dates. */
  describe(id: number) {
    const task = this.tasks[id], project = this.projects[task.project], status = this.status(id);
    if (task.description.trim()) return task.description.trim();
    const owner = task.assignee >= 0 ? this.person(task.assignee).first : null, due = formatDue(task.due);
    const sentence = status === "done" ? `Done${owner ? `. ${owner} shipped it` : ""}.`
      : status === "review" ? `${owner ? `${owner} opened it` : "Open"} for review.`
      : status === "progress" ? `${owner ? `${owner} is on it` : "In progress"}${task.due ? ` and plans to finish by ${due}` : ""}.`
      : status === "blocked" ? `Blocked by ${project.blocker || "an open dependency"}.`
      : `Not started${task.due ? `. ${owner ? `${owner} picks it up` : "Pick it up"} before ${due}` : ""}.`;
    return project.brief ? `${sentence} ${project.name}: ${project.brief}` : sentence;
  }
}
