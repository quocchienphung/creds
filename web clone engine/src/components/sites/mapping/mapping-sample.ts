import { emptySeq } from "./mapping-store.ts";
import type { Health, MappingData, MappingPerson, MappingTask, MappingTeam, TaskStatus } from "./mapping-types.ts";

/**
 * Starter content with generic names ("Team 1", "Project 1", "User 1" …). Only the shape (how many teams,
 * projects, tasks and people, and how far along they are) is predefined; every name and value can be edited.
 * [tasks, share done, health (0 on track, 1 at risk, 2 off track), days until due]
 */
const SHAPE: { members: number; projects: [number, number, number, number][] }[] = [
  { members: 5, projects: [[10, .42, 1, 23], [7, .43, 0, 30], [6, .67, 0, 12], [7, .72, 0, 8], [8, .13, 2, 41], [6, .5, 0, 19]] },
  { members: 4, projects: [[9, .56, 0, 27], [8, .38, 1, 16], [6, .33, 0, 34], [7, .29, 0, 44]] },
  { members: 4, projects: [[7, .71, 0, 9], [8, .25, 1, 25], [7, .57, 0, 14], [6, .33, 0, 38]] },
  { members: 4, projects: [[8, .25, 1, 31], [6, .67, 0, 11], [6, .5, 0, 20], [7, .29, 2, 6]] },
  { members: 4, projects: [[8, .5, 0, 18], [6, .67, 0, 10], [8, .25, 1, 36]] },
];
const HEALTH: Health[] = ["on-track", "at-risk", "off-track"];

function randomSource(seed: number) {
  let state = seed;
  return () => {
    let value = Math.imul((state = state + 0x6d2b79f5 | 0) ^ state >>> 15, 1 | state);
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 0x100000000;
  };
}
export function addDays(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}
export const isoToday = (now = new Date()) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

export function createSampleData(today = isoToday()): MappingData {
  const random = randomSource(0x2f6e2b1);
  const seq = emptySeq();
  const people: MappingPerson[] = [];
  const teams: MappingTeam[] = [];
  SHAPE.forEach((shape, teamIndex) => {
    const memberIds = Array.from({ length: shape.members }, () => { const id = `person-${++seq.person}`; people.push({ id, name: `User ${seq.person}`, role: "Member" }); return id; });
    const team: MappingTeam = { id: `team-${++seq.team}`, name: `Team ${teamIndex + 1}`, mission: "", leadId: memberIds[0], memberIds, projects: [] };
    shape.projects.forEach(([count, ratio, health, dueIn], projectIndex) => {
      const lead = memberIds[projectIndex % memberIds.length];
      const done = Math.round(count * ratio), blocked = health === 2 ? 2 : Number(health === 1);
      const tasks: MappingTask[] = [];
      for (let index = 0; index < count; index++) {
        const offset = index - done, active = count - done > 3 ? 2 : 1;
        const status: TaskStatus = offset < 0 ? "done" : offset === 0 && count - done > 3 ? "review" : offset <= active ? "progress" : offset <= active + blocked ? "blocked" : "todo";
        const assigneeId = index === 0 ? lead : memberIds[Math.floor(random() * memberIds.length)];
        const due = status === "done" ? -3 - (done - index) * 3 - Math.floor(3 * random()) : Math.max(1, Math.round((offset + 1) / (count - done) * dueIn) - Math.floor(3 * random()));
        const length = 3 + Math.floor(3 * random());
        const completed = status === "done" ? length : status === "review" ? length - 1 : status === "progress" ? Math.max(1, Math.floor(length / 2)) : Number(status === "blocked");
        const taskId = `task-${++seq.task}`;
        tasks.push({
          id: taskId, title: `Task ${seq.task}`, description: "", status, assigneeId, due: addDays(today, due), points: [1, 2, 3, 5, 8][Math.floor(5 * random())], comments: Math.floor(13 * random()),
          checklist: Array.from({ length }, (_, item) => ({ id: `item-${++seq.item}`, label: `Step ${item + 1}`, done: item < completed })),
        });
      }
      team.projects.push({ id: `project-${++seq.project}`, name: `Project ${seq.project}`, brief: "", health: HEALTH[health], due: addDays(today, dueIn), leadId: lead, blocker: "", tasks });
    });
    teams.push(team);
  });
  return { version: 1, name: "My workspace", people, teams, seq };
}
