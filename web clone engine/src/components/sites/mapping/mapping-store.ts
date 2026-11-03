import type { CommandResult, EntityKind, Health, MappingChecklistItem, MappingCommand, MappingData, MappingPerson, MappingProject, MappingTask, MappingTeam, TaskStatus } from "./mapping-types.ts";
import { healthOrder, statusOrder } from "./mapping-types.ts";

const LIMITS = { name: 80, text: 400, points: 99, comments: 9999 };
const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const clip = (value: unknown, max: number, fallback = "") => typeof value === "string" ? value.slice(0, max) : fallback;
const safeUrl = (value: unknown) => typeof value === "string" && /^(https?:\/\/|\/|data:image\/)/i.test(value) ? value.slice(0, 2048) : undefined;
const validDate = (value: unknown) => typeof value === "string" && isoDate.test(value) && !Number.isNaN(Date.parse(value)) ? value : null;
const integer = (value: unknown, low: number, high: number, fallback: number) => typeof value === "number" && Number.isFinite(value) ? Math.max(low, Math.min(high, Math.round(value))) : fallback;

export const emptySeq = (): Record<EntityKind, number> => ({ person: 0, team: 0, project: 0, task: 0, item: 0 });
export function emptyData(name = "My workspace"): MappingData { return { version: 1, name, people: [], teams: [], seq: emptySeq() }; }

function next(data: MappingData, kind: EntityKind) {
  const seq = { ...data.seq, [kind]: data.seq[kind] + 1 };
  return { seq, number: seq[kind], id: `${kind}-${seq[kind]}` };
}

export function findTask(data: MappingData, id: string) {
  for (const team of data.teams) for (const project of team.projects) { const task = project.tasks.find(item => item.id === id); if (task) return { team, project, task }; }
  return null;
}
export function findProject(data: MappingData, id: string) {
  for (const team of data.teams) { const project = team.projects.find(item => item.id === id); if (project) return { team, project }; }
  return null;
}

const mapTeams = (data: MappingData, change: (team: MappingTeam) => MappingTeam): MappingData => ({ ...data, teams: data.teams.map(change) });
const mapProjects = (data: MappingData, change: (project: MappingProject) => MappingProject): MappingData => mapTeams(data, team => ({ ...team, projects: team.projects.map(change) }));
const mapTasks = (data: MappingData, change: (task: MappingTask) => MappingTask): MappingData => mapProjects(data, project => ({ ...project, tasks: project.tasks.map(change) }));
const moveTo = <T,>(list: T[], from: number, to: number) => { const copy = [...list], [item] = copy.splice(from, 1); copy.splice(Math.max(0, Math.min(copy.length, to)), 0, item); return copy; };

function cleanTaskPatch(patch: Partial<MappingTask>): Partial<MappingTask> {
  const result: Partial<MappingTask> = {};
  if ("title" in patch) result.title = clip(patch.title, LIMITS.name);
  if ("description" in patch) result.description = clip(patch.description, LIMITS.text);
  if ("status" in patch && statusOrder.includes(patch.status as TaskStatus)) result.status = patch.status;
  if ("assigneeId" in patch) result.assigneeId = patch.assigneeId ?? null;
  if ("due" in patch) result.due = validDate(patch.due);
  if ("points" in patch) result.points = integer(patch.points, 0, LIMITS.points, 1);
  if ("comments" in patch) result.comments = integer(patch.comments, 0, LIMITS.comments, 0);
  return result;
}

/**
 * Pure reducer: the same function a backend can run to validate a command, and what the tests exercise.
 * Unknown ids leave the data unchanged.
 */
export function applyCommand(data: MappingData, command: MappingCommand): CommandResult {
  switch (command.type) {
    case "data.replace": return { data: normalizeData(command.data) ?? data };
    case "workspace.update": return { data: { ...data, name: clip(command.name, LIMITS.name) } };
    case "person.add": {
      const { seq, number, id } = next(data, "person");
      return { data: { ...data, seq, people: [...data.people, { id, name: clip(command.name, LIMITS.name) || `User ${number}`, role: clip(command.role, LIMITS.name, "Member") }] } };
    }
    case "person.update": {
      const patch: Partial<MappingPerson> = {};
      if ("name" in command.patch) patch.name = clip(command.patch.name, LIMITS.name);
      if ("role" in command.patch) patch.role = clip(command.patch.role, LIMITS.name);
      if ("avatarUrl" in command.patch) patch.avatarUrl = safeUrl(command.patch.avatarUrl);
      return { data: { ...data, people: data.people.map(person => person.id === command.id ? { ...person, ...patch } : person) } };
    }
    case "person.remove": {
      const gone = (id: string | null) => id === command.id ? null : id;
      const people = data.people.filter(person => person.id !== command.id);
      const result = mapTeams({ ...data, people }, team => ({ ...team, leadId: gone(team.leadId), memberIds: team.memberIds.filter(id => id !== command.id), projects: team.projects.map(project => ({ ...project, leadId: gone(project.leadId), tasks: project.tasks.map(task => ({ ...task, assigneeId: gone(task.assigneeId) })) })) }));
      return { data: result };
    }
    case "team.add": {
      const { seq, number, id } = next(data, "team");
      return { data: { ...data, seq, teams: [...data.teams, { id, name: clip(command.name, LIMITS.name) || `Team ${number}`, mission: "", leadId: null, memberIds: [], projects: [] }] }, created: { kind: "team", id } };
    }
    case "team.update": {
      const patch: Partial<MappingTeam> = {};
      if ("name" in command.patch) patch.name = clip(command.patch.name, LIMITS.name);
      if ("mission" in command.patch) patch.mission = clip(command.patch.mission, LIMITS.text);
      const known = new Set(data.people.map(person => person.id));
      if ("memberIds" in command.patch) patch.memberIds = [...new Set(command.patch.memberIds ?? [])].filter(id => known.has(id));
      if ("leadId" in command.patch) patch.leadId = command.patch.leadId && known.has(command.patch.leadId) ? command.patch.leadId : null;
      return { data: mapTeams(data, team => team.id === command.id ? { ...team, ...patch } : team) };
    }
    case "team.remove": return { data: { ...data, teams: data.teams.filter(team => team.id !== command.id) } };
    case "team.move": {
      const from = data.teams.findIndex(team => team.id === command.id);
      return from < 0 ? { data } : { data: { ...data, teams: moveTo(data.teams, from, command.toIndex) } };
    }
    case "project.add": {
      if (!data.teams.some(team => team.id === command.teamId)) return { data };
      const { seq, number, id } = next(data, "project");
      const project: MappingProject = { id, name: clip(command.name, LIMITS.name) || `Project ${number}`, brief: "", health: "on-track", due: null, leadId: null, blocker: "", tasks: [] };
      return { data: { ...mapTeams(data, team => team.id === command.teamId ? { ...team, projects: [...team.projects, project] } : team), seq }, created: { kind: "project", id } };
    }
    case "project.update": {
      const patch: Partial<MappingProject> = {};
      if ("name" in command.patch) patch.name = clip(command.patch.name, LIMITS.name);
      if ("brief" in command.patch) patch.brief = clip(command.patch.brief, LIMITS.text);
      if ("blocker" in command.patch) patch.blocker = clip(command.patch.blocker, LIMITS.text);
      if ("health" in command.patch && healthOrder.includes(command.patch.health as Health)) patch.health = command.patch.health;
      if ("due" in command.patch) patch.due = validDate(command.patch.due);
      if ("leadId" in command.patch) patch.leadId = command.patch.leadId && data.people.some(person => person.id === command.patch.leadId) ? command.patch.leadId : null;
      return { data: mapProjects(data, project => project.id === command.id ? { ...project, ...patch } : project) };
    }
    case "project.remove": return { data: mapTeams(data, team => ({ ...team, projects: team.projects.filter(project => project.id !== command.id) })) };
    case "project.move": {
      const found = findProject(data, command.id);
      if (!found || !data.teams.some(team => team.id === command.toTeamId)) return { data };
      const without = mapTeams(data, team => ({ ...team, projects: team.projects.filter(project => project.id !== command.id) }));
      return { data: mapTeams(without, team => {
        if (team.id !== command.toTeamId) return team;
        const projects = [...team.projects];
        projects.splice(Math.max(0, Math.min(projects.length, command.toIndex)), 0, found.project);
        return { ...team, projects };
      }) };
    }
    case "task.add": {
      if (!findProject(data, command.projectId)) return { data };
      const { seq, number, id } = next(data, "task");
      const created: MappingTask = { id, title: clip(command.title, LIMITS.name) || `Task ${number}`, description: "", status: "todo", assigneeId: null, due: null, points: 1, comments: 0, checklist: [] };
      return { data: { ...mapProjects(data, project => project.id === command.projectId ? { ...project, tasks: [...project.tasks, created] } : project), seq }, created: { kind: "task", id } };
    }
    case "task.update": {
      const patch = cleanTaskPatch(command.patch);
      if (patch.assigneeId && !data.people.some(person => person.id === patch.assigneeId)) patch.assigneeId = null;
      return { data: mapTasks(data, task => task.id === command.id ? { ...task, ...patch } : task) };
    }
    case "task.setStatus": {
      if (!statusOrder.includes(command.status)) return { data };
      return { data: mapTasks(data, task => {
        if (task.id !== command.id) return task;
        // The checklist drives "done": ticking everything completes a task, so the two are kept consistent.
        let checklist = task.checklist;
        if (command.status === "done") checklist = checklist.map(item => ({ ...item, done: true }));
        else if (checklist.length && checklist.every(item => item.done)) checklist = checklist.map((item, index) => index === checklist.length - 1 ? { ...item, done: false } : item);
        return { ...task, status: command.status, checklist };
      }) };
    }
    case "task.remove": return { data: mapProjects(data, project => ({ ...project, tasks: project.tasks.filter(task => task.id !== command.id) })) };
    case "item.add": {
      const { seq, id } = next(data, "item");
      return { data: { ...mapTasks(data, task => task.id === command.taskId ? { ...task, checklist: [...task.checklist, { id, label: clip(command.label, LIMITS.name) || `Step ${task.checklist.length + 1}`, done: false }] } : task), seq } };
    }
    case "item.update": {
      const patch: Partial<MappingChecklistItem> = {};
      if ("label" in command.patch) patch.label = clip(command.patch.label, LIMITS.name);
      if ("done" in command.patch) patch.done = !!command.patch.done;
      return { data: mapTasks(data, task => task.id === command.taskId ? { ...task, checklist: task.checklist.map(item => item.id === command.id ? { ...item, ...patch } : item) } : task) };
    }
    case "item.toggle": return { data: mapTasks(data, task => task.id === command.taskId ? { ...task, checklist: task.checklist.map(item => item.id === command.id ? { ...item, done: !item.done } : item) } : task) };
    case "item.remove": return { data: mapTasks(data, task => task.id === command.taskId ? { ...task, checklist: task.checklist.filter(item => item.id !== command.id) } : task) };
  }
}

/**
 * Validates untrusted data (a saved file, an import, a backend response) into a safe snapshot, or null.
 * Dangling references are dropped and duplicate ids are rejected rather than guessed at.
 */
export function normalizeData(input: unknown): MappingData | null {
  if (!input || typeof input !== "object") return null;
  const source = input as Record<string, unknown>;
  if (source.version !== 1 || !Array.isArray(source.people) || !Array.isArray(source.teams)) return null;
  const seen = new Set<string>();
  const unique = (id: unknown) => { if (typeof id !== "string" || !id || id.length > 64 || seen.has(id)) return null; seen.add(id); return id; };
  const record = (value: unknown) => value && typeof value === "object" ? value as Record<string, unknown> : {};
  const people: MappingPerson[] = [];
  for (const raw of source.people) { const person = record(raw), id = unique(person.id); if (!id) return null; const avatarUrl = safeUrl(person.avatarUrl); people.push({ id, name: clip(person.name, LIMITS.name), role: clip(person.role, LIMITS.name), ...(avatarUrl ? { avatarUrl } : {}) }); }
  const known = new Set(people.map(person => person.id));
  const ref = (value: unknown) => typeof value === "string" && known.has(value) ? value : null;
  const teams: MappingTeam[] = [];
  for (const rawTeam of source.teams) {
    const team = record(rawTeam), teamId = unique(team.id);
    if (!teamId) return null;
    const projects: MappingProject[] = [];
    for (const rawProject of Array.isArray(team.projects) ? team.projects : []) {
      const project = record(rawProject), projectId = unique(project.id);
      if (!projectId) return null;
      const tasks: MappingTask[] = [];
      for (const rawTask of Array.isArray(project.tasks) ? project.tasks : []) {
        const task = record(rawTask), taskId = unique(task.id);
        if (!taskId) return null;
        const checklist: MappingChecklistItem[] = [];
        for (const rawItem of Array.isArray(task.checklist) ? task.checklist : []) { const item = record(rawItem), itemId = unique(item.id); if (!itemId) return null; checklist.push({ id: itemId, label: clip(item.label, LIMITS.name), done: !!item.done }); }
        tasks.push({ id: taskId, title: clip(task.title, LIMITS.name), description: clip(task.description, LIMITS.text), status: statusOrder.includes(task.status as TaskStatus) ? task.status as TaskStatus : "todo", assigneeId: ref(task.assigneeId), due: validDate(task.due), points: integer(task.points, 0, LIMITS.points, 1), comments: integer(task.comments, 0, LIMITS.comments, 0), checklist });
      }
      projects.push({ id: projectId, name: clip(project.name, LIMITS.name), brief: clip(project.brief, LIMITS.text), health: healthOrder.includes(project.health as Health) ? project.health as Health : "on-track", due: validDate(project.due), leadId: ref(project.leadId), blocker: clip(project.blocker, LIMITS.text), tasks });
    }
    teams.push({ id: teamId, name: clip(team.name, LIMITS.name), mission: clip(team.mission, LIMITS.text), leadId: ref(team.leadId), memberIds: [...new Set((Array.isArray(team.memberIds) ? team.memberIds : []).filter((id): id is string => typeof id === "string" && known.has(id)))], projects });
  }
  // Counters must stay ahead of every numbered id so a new "User n+1" can never collide.
  const seq = emptySeq(), saved = record(source.seq);
  (Object.keys(seq) as EntityKind[]).forEach(kind => { seq[kind] = integer(saved[kind], 0, 1_000_000, 0); });
  const bump = (kind: EntityKind, id: string) => { const match = /^[a-z]+-(\d+)$/.exec(id); if (match) seq[kind] = Math.max(seq[kind], Number(match[1])); };
  people.forEach(person => bump("person", person.id));
  teams.forEach(team => { bump("team", team.id); team.projects.forEach(project => { bump("project", project.id); project.tasks.forEach(task => { bump("task", task.id); task.checklist.forEach(item => bump("item", item.id)); }); }); });
  return { version: 1, name: clip(source.name, LIMITS.name, "My workspace"), people, teams, seq };
}
