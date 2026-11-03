import assert from "node:assert/strict";
import test from "node:test";
import { applySkillEdit, draftOf, inspectDraft, isDirty, reinsertSkill, withGhosts, withoutSkill } from "./skill-edit.ts";
import { settled } from "./skill-persist.ts";
import { parseSkillRecord, sha256 } from "./skill-model.ts";

const guardrails = { citeSources: true, verifyBeforeAnswer: true, askWhenUncertain: true };
async function skill(name, body = "Check every claim.", extra = {}) {
  const instructions = `---\nname: ${name}\ndescription: "Use when facts matter"\n---\n\n${body}\n`;
  return { id: `id-${name}`, name, description: "Use when facts matter", instructions, sourceUrl: "", sourceRef: "", sourcePath: "", sha256: await sha256(instructions), bytes: new TextEncoder().encode(instructions).length, importedAt: "2026-10-01T00:00:00.000Z", target: "Local AI", status: "ready", guardrails: { ...guardrails }, ...extra };
}

test("a fresh draft is clean, and any change to text, target or guardrails makes it dirty", async () => {
  const s = await skill("alpha");
  assert.equal(isDirty(s, draftOf(s)), false);
  assert.equal(isDirty(s, { ...draftOf(s), instructions: s.instructions + "more" }), true);
  assert.equal(isDirty(s, { ...draftOf(s), instructions: "﻿" + s.instructions }), false, "a BOM is not a change");
  assert.equal(isDirty(s, { ...draftOf(s), target: "AI Agent" }), true);
  assert.equal(isDirty(s, { ...draftOf(s), guardrails: { ...guardrails, citeSources: false } }), true);
});

test("the header is checked while typing, with a sentence for every failure", () => {
  const text = "---\nname: ok-name\ndescription: x\n---\nBody";
  assert.deepEqual(inspectDraft({ instructions: text }), { ok: true, name: "ok-name", description: "x", bytes: new TextEncoder().encode(text).length });
  assert.match(inspectDraft({ instructions: "no header" }).error, /frontmatter/);
  assert.match(inspectDraft({ instructions: "---\nname: Bad Name\ndescription: x\n---\n" }).error, /lowercase/);
  assert.match(inspectDraft({ instructions: "   " }).error, /empty/);
  assert.match(inspectDraft({ instructions: "---\nname: big\ndescription: x\n---\n" + "a".repeat(300 * 1024) }).error, /limit is 256 KB/);
});

test("saving an edit recomputes name, description, size and checksum and keeps everything else", async () => {
  const s = await skill("alpha", "Old body.", { sourceUrl: "https://github.com/o/r", sourceRef: "abc", files: [] });
  const text = "---\nname: alpha-two\ndescription: 'New description'\n---\n\nNew body with more words.\n";
  const next = await applySkillEdit(s, { ...draftOf(s), instructions: text, target: "AI Agent" }, [s]);
  assert.equal(next.name, "alpha-two");
  assert.equal(next.description, "New description");
  assert.equal(next.sha256, await sha256(text));
  assert.equal(next.bytes, new TextEncoder().encode(text).length);
  assert.equal(next.target, "AI Agent");
  assert.equal(next.id, s.id); assert.equal(next.sourceUrl, s.sourceUrl); assert.equal(next.importedAt, s.importedAt); assert.deepEqual(next.files, []);
  assert.ok(parseSkillRecord(next), "the result is a valid record");
  assert.equal(s.name, "alpha", "the stored record is not mutated");
});

test("an edit cannot take the name of another active skill, but may of an archived one", async () => {
  const a = await skill("alpha"), b = await skill("beta"), archived = await skill("gamma", "x", { status: "archived" });
  const rename = name => ({ ...draftOf(b), instructions: b.instructions.replace("name: beta", `name: ${name}`) });
  await assert.rejects(applySkillEdit(b, rename("alpha"), [a, b]), /already named alpha/);
  assert.equal((await applySkillEdit(b, rename("gamma"), [a, b, archived])).name, "gamma");
  assert.equal((await applySkillEdit(b, draftOf(b), [a, b])).name, "beta", "keeping its own name is fine");
});

test("an invalid edit is refused with the reason", async () => {
  const s = await skill("alpha");
  await assert.rejects(applySkillEdit(s, { ...draftOf(s), instructions: "plain text" }, [s]), /frontmatter/);
});

test("delete removes a skill and remembers where it stood; undo puts it back there", async () => {
  const [a, b, c] = [await skill("alpha"), await skill("beta"), await skill("gamma")];
  const { next, index, removed } = withoutSkill([a, b, c], b.id);
  assert.deepEqual(next.map(x => x.name), ["alpha", "gamma"]); assert.equal(index, 1); assert.equal(removed?.name, "beta");
  assert.deepEqual(reinsertSkill(next, b, index).map(x => x.name), ["alpha", "beta", "gamma"]);
  assert.deepEqual(reinsertSkill(next, b, 99).map(x => x.name), ["alpha", "gamma", "beta"], "an index past the end goes last");
  assert.equal(reinsertSkill([a, b, c], b, 0).length, 3, "never twice");
  assert.deepEqual(withoutSkill([a], "nope").removed, undefined);
});

test("undo refuses when the name was taken meanwhile or the library is full", async () => {
  const a = await skill("alpha"), clash = { ...(await skill("alpha")), id: "other" };
  assert.throws(() => reinsertSkill([clash], a, 0), /exists now/);
  assert.equal(reinsertSkill([{ ...clash, status: "archived" }], a, 0).length, 2, "an archived namesake does not block it");
  const full = await Promise.all(Array.from({ length: 200 }, (_, i) => skill(`s${i}`)));
  assert.throws(() => reinsertSkill(full, a, 0), /up to 200/);
});

test("a deleted skill stays in its old place as a ghost until it settles", async () => {
  const [a, b, c] = [await skill("alpha"), await skill("beta"), await skill("gamma")];
  const ghosts = new Map([[b.id, { skill: b, index: 1 }]]);
  const rows = withGhosts([a, c], ghosts);
  assert.deepEqual(rows.map(r => `${r.skill.name}${r.ghost ? "*" : ""}`), ["alpha", "beta*", "gamma"]);
  assert.deepEqual(withGhosts([a, b, c], ghosts).map(r => r.ghost), [false, false, false], "once restored it is a real row again");
  const two = new Map([[c.id, { skill: c, index: 2 }], [a.id, { skill: a, index: 0 }]]);
  assert.deepEqual(withGhosts([b], two).map(r => r.skill.name), ["alpha", "beta", "gamma"]);
});

function entryOf(script) {
  let view = { save: "idle", error: null }; const listeners = new Set(); let flushed = 0;
  const set = next => { view = next; for (const l of [...listeners]) l(); };
  return { flushes: () => flushed, flush: async () => { flushed++; await script(set); }, subscribe: l => { listeners.add(l); return () => listeners.delete(l); }, getSnapshot: () => view };
}
test("settled waits for the store, and reports its failure", async () => {
  await settled(entryOf(async set => { set({ save: "saving", error: null }); await Promise.resolve(); set({ save: "idle", error: null }); }));
  await assert.rejects(settled(entryOf(async set => set({ save: "error", error: { message: "Disk is full" } }))), /Disk is full/);
});
test("settled keeps waiting while a flaky save is retried in the background", async () => {
  let release;
  const entry = entryOf(async set => { set({ save: "saving", error: null }); release = () => set({ save: "idle", error: null }); });
  let done = false; const promise = settled(entry).then(() => { done = true; });
  await new Promise(r => setTimeout(r, 20)); assert.equal(done, false, "still saving: not done");
  release(); await promise; assert.equal(done, true);
});
test("settled gives up with a clear message after the timeout", async () => {
  await assert.rejects(settled(entryOf(async set => set({ save: "saving", error: null })), 30), /taking longer than expected/);
});
