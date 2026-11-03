import { MAX_SKILL_BYTES, instructionBytes, parseSkillMarkdown, parseSkillRecord, sha256, type SkillGuardrails, type SkillRecord, type SkillTarget } from "./skill-model.ts";

/** What the editor of a skill holds while it is open: the SKILL.md text and the attributes that can change. */
export interface SkillDraft { instructions: string; target: SkillTarget; guardrails: SkillGuardrails }

export const draftOf = (skill: SkillRecord): SkillDraft => ({ instructions: skill.instructions, target: skill.target, guardrails: { ...skill.guardrails } });

const sameGuardrails = (a: SkillGuardrails, b: SkillGuardrails) => a.citeSources === b.citeSources && a.verifyBeforeAnswer === b.verifyBeforeAnswer && a.askWhenUncertain === b.askWhenUncertain;
const clean = (text: string) => text.replace(/^﻿/, "");
/** Has anything been changed compared with what is stored? */
export const isDirty = (skill: SkillRecord, draft: SkillDraft) => clean(draft.instructions) !== skill.instructions || draft.target !== skill.target || !sameGuardrails(draft.guardrails, skill.guardrails);

export type Inspection = { ok: true; name: string; description: string; bytes: number } | { ok: false; error: string };
/** Live check while typing: the SKILL.md header must parse, and the file must fit. */
export function inspectDraft(draft: Pick<SkillDraft, "instructions">): Inspection {
  const text = clean(draft.instructions), bytes = instructionBytes(text);
  if (!text.trim()) return { ok: false, error: "The instructions can’t be empty." };
  if (bytes > MAX_SKILL_BYTES) return { ok: false, error: `SKILL.md is ${Math.round(bytes / 1024)} KB; the limit is ${MAX_SKILL_BYTES / 1024} KB.` };
  try { const meta = parseSkillMarkdown(text); return { ok: true, name: meta.name, description: meta.description, bytes }; }
  catch (failure) { return { ok: false, error: failure instanceof Error ? failure.message : "Check the SKILL.md header." }; }
}

/**
 * The record with the edit applied: name and description come from the SKILL.md header (the same rule as adding a skill), the checksum and size are
 * recomputed, and everything else (id, source, supporting files, date added) stays. Throws a sentence a person can act on.
 */
export async function applySkillEdit(skill: SkillRecord, draft: SkillDraft, library: readonly SkillRecord[]): Promise<SkillRecord> {
  const inspected = inspectDraft(draft);
  if (!inspected.ok) throw new Error(inspected.error);
  if (skill.status !== "archived" && library.some(item => item.id !== skill.id && item.name === inspected.name && item.status !== "archived")) throw new Error(`Another skill is already named ${inspected.name}. Change the name in the header, or archive the other one first.`);
  const instructions = clean(draft.instructions);
  const next: SkillRecord = { ...skill, name: inspected.name, description: inspected.description, instructions, bytes: inspected.bytes, sha256: await sha256(instructions), target: draft.target, guardrails: { ...draft.guardrails } };
  if (!parseSkillRecord(next)) throw new Error("These changes would make the skill invalid. Check the header and the size.");
  return next;
}

/** The library without one skill, and where it stood (so Undo can put it back there). */
export function withoutSkill(library: readonly SkillRecord[], id: string): { next: SkillRecord[]; index: number; removed: SkillRecord | undefined } {
  const index = library.findIndex(item => item.id === id);
  if (index < 0) return { next: [...library], index: -1, removed: undefined };
  return { next: library.filter(item => item.id !== id), index, removed: library[index] };
}
/** Put a deleted skill back at its old place. Throws when its name has been taken by an active skill meanwhile, or the library is full. */
export function reinsertSkill(library: readonly SkillRecord[], skill: SkillRecord, index: number): SkillRecord[] {
  if (library.some(item => item.id === skill.id)) return [...library];
  if (library.length >= 200) throw new Error("This workspace holds up to 200 skills.");
  if (skill.status !== "archived" && library.some(item => item.name === skill.name && item.status !== "archived")) throw new Error(`A skill named ${skill.name} exists now. Archive it before restoring this one.`);
  const at = Math.max(0, Math.min(index, library.length));
  return [...library.slice(0, at), skill, ...library.slice(at)];
}

export interface Ghost { skill: SkillRecord; index: number }
/** The library with the skills that were just deleted shown in their old places (their card stays to show the result and Undo). */
export function withGhosts(library: readonly SkillRecord[], ghosts: ReadonlyMap<string, Ghost>): { skill: SkillRecord; ghost: boolean }[] {
  const rows = library.map(skill => ({ skill, ghost: false }));
  for (const { skill, index } of [...ghosts.values()].sort((a, b) => a.index - b.index)) {
    if (rows.some(row => row.skill.id === skill.id)) continue;
    rows.splice(Math.max(0, Math.min(index, rows.length)), 0, { skill, ghost: true });
  }
  return rows;
}
