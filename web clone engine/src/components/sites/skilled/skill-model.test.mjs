import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, mkdir, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createBundle, instructionBytes, parseSkillEvents, parseSkillFiles, parseSkillLibrary, parseSkillMarkdown, sha256, sha256Bytes, totalSkillBytes, validateTransferReceipt } from "./skill-model.ts";
import { installBundle, validateBundle } from "../../../../scripts/skilled/install-bundle.mjs";

const instructions = "---\nname: evidence-check\ndescription: Verify each claim against sources.\n---\n\nRead the evidence before answering.\n";
const makeSkill = async (changes = {}) => ({ id: "s1", name: "evidence-check", description: "Verify each claim against sources.", instructions, sourceUrl: "https://github.com/example/skills/blob/main/evidence-check/SKILL.md", sourceRef: "main", sourcePath: "evidence-check/SKILL.md", sha256: await sha256(instructions), bytes: instructionBytes(instructions), importedAt: "2026-10-22T05:00:00.000Z", target: "Local AI", status: "ready", guardrails: { citeSources: true, verifyBeforeAnswer: true, askWhenUncertain: true }, ...changes });

test("frontmatter handles real scalar/folded descriptions, preserves instruction bytes and rejects invalid metadata", () => {
  assert.deepEqual(parseSkillMarkdown(instructions), { name: "evidence-check", description: "Verify each claim against sources." });
  assert.equal(parseSkillMarkdown("\uFEFF---\r\nname: 'check-facts'\r\ndescription: >-\r\n  Check facts\r\n  before answering.\r\n---\r\nBody").description, "Check facts before answering.");
  assert.equal(parseSkillMarkdown('---\nname: check-facts\ndescription: "Check: facts"\n---\nBody').description, "Check: facts");
  for (const content of ["No frontmatter", "---\nname: ../escape\ndescription: bad\n---\nBody", "---\nname: one\nname: two\ndescription: bad\n---\nBody", "---\nname: good\ndescription: [bad]\n---\nBody"]) assert.throws(() => parseSkillMarkdown(content));
});

test("resource collections reject corrupted records, duplicates and unbounded telemetry", async () => {
  const skill = await makeSkill(); assert.deepEqual(parseSkillLibrary([skill]), [skill]);
  for (const bad of [{ ...skill, bytes: 1 }, { ...skill, target: "any-model" }, { ...skill, guardrails: { citeSources: true } }, { ...skill, name: "../escape" }, { ...skill, importedAt: "today" }, { ...skill, hidden: "unknown" }]) assert.equal(parseSkillLibrary([bad]), undefined);
  assert.equal(parseSkillLibrary([skill, skill]), undefined);
  const event = { id: "e1", kind: "import", label: "Imported", t: Date.now(), durationMs: 123.45, bytes: 100, outcome: "success" };
  assert.deepEqual(parseSkillEvents([event]), [event]);
  for (const bad of [{ ...event, durationMs: Infinity }, { ...event, bytes: -1 }, { ...event, kind: "generated" }]) assert.equal(parseSkillEvents([bad]), undefined);
  assert.equal(parseSkillEvents(Array.from({ length: 201 }, (_, i) => ({ ...event, id: `e${i}` }))), undefined);
});

test("bundles verify hashes and exact receipt coverage instead of trusting a successful HTTP response", async () => {
  const skill = await makeSkill(); const bundle = await createBundle([skill], "workspace-1");
  const receipt = { bundleVersion: 1, workspaceId: "workspace-1", receivedAt: "2026-10-22T06:00:00.000Z", agent: "offline file receiver", bytes: skill.bytes, accepted: [{ id: skill.id, sha256: skill.sha256 }] };
  assert.deepEqual(validateTransferReceipt(receipt, bundle), receipt);
  for (const bad of [{ ...receipt, workspaceId: "wrong" }, { ...receipt, bytes: 1 }, { ...receipt, accepted: [] }, { ...receipt, accepted: [{ id: skill.id, sha256: "0".repeat(64) }] }]) assert.equal(validateTransferReceipt(bad, bundle), undefined);
  await assert.rejects(createBundle([{ ...skill, instructions: instructions + "tamper", bytes: skill.bytes + 6 }], "workspace-1"), /Checksum mismatch/);
  await assert.rejects(createBundle([skill, { ...skill, id: "s2" }], "workspace-1"), /Duplicate/);
});

test("offline installer validates everything before writes, preserves SKILL.md and emits honest file receipt", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "logio-skills-"));
  try {
    const bundle = await createBundle([await makeSkill()], "workspace-1"); const directory = path.join(temp, "output");
    const bad = structuredClone(bundle); bad.skills[0].instructions += "corrupt";
    await assert.rejects(installBundle(bad, { directory }), /Checksum\/byte mismatch/);
    assert.deepEqual(await readdir(temp), []);
    const result = await installBundle(bundle, { directory });
    assert.equal(await readFile(path.join(directory, "evidence-check", "SKILL.md"), "utf8"), instructions);
    assert.match(await readFile(path.join(directory, "evidence-check", "LOGIO.md"), "utf8"), /Cite supporting sources/);
    assert.ok(validateTransferReceipt(result.receipt, bundle));
    await assert.rejects(installBundle(bundle, { directory }), /Destination exists/);
    await installBundle(bundle, { directory, force: true });
    for (const name of ["../outside", "con", "nul", "C:\\escape"]) { const changed = structuredClone(bundle); changed.skills[0].name = name; assert.throws(() => validateBundle(changed)); }
    await writeFile(path.join(temp, "not-a-folder"), "data");
    await assert.rejects(installBundle(bundle, { directory: path.join(temp, "not-a-folder") }));
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test("offline installer rejects symlink destinations", async t => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "logio-skills-link-"));
  try {
    await mkdir(path.join(temp, "real"));
    try { await symlink(path.join(temp, "real"), path.join(temp, "link"), process.platform === "win32" ? "junction" : "dir"); } catch (error) { if (error.code === "EPERM") { t.skip("No symlink permission"); return; } throw error; }
    const bundle = await createBundle([await makeSkill()], "workspace-1");
    await assert.rejects(installBundle(bundle, { directory: path.join(temp, "link") }), /symbolic link/);
    assert.deepEqual(await readdir(path.join(temp, "real")), []);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

const makeFile = async (filePath, content, encoding = "utf8") => {
  const bytes = Buffer.from(content, encoding === "base64" ? "base64" : "utf8");
  return { path: filePath, content, encoding, bytes: bytes.length, sha256: await sha256Bytes(bytes) };
};

test("support files preserve nested UTF8 and binary bytes, contribute to receipt size, and are isolated from mutation", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "logio-skills-full-"));
  try {
    const binary = Buffer.from([0, 255, 128, 42, 0, 13, 10]);
    const files = [await makeFile("references/guide.md", "# Guide\nKiểm tra nguồn.\n"), await makeFile("assets/pixel.bin", binary.toString("base64"), "base64")];
    const skill = await makeSkill({ files }); const bundle = await createBundle([skill], "workspace-1");
    assert.ok(parseSkillLibrary([skill]));
    assert.equal(totalSkillBytes(skill), skill.bytes + files.reduce((sum, file) => sum + file.bytes, 0));
    files[0].path = "changed.md";
    assert.equal(bundle.skills[0].files[0].path, "references/guide.md");
    const result = await installBundle(bundle, { directory: path.join(temp, "output") });
    assert.deepEqual(await readFile(path.join(result.directory, "evidence-check", "assets", "pixel.bin")), binary);
    assert.equal(await readFile(path.join(result.directory, "evidence-check", "references", "guide.md"), "utf8"), "# Guide\nKiểm tra nguồn.\n");
    assert.equal(result.receipt.bytes, totalSkillBytes(bundle.skills[0])); assert.ok(validateTransferReceipt(result.receipt, bundle));
    assert.deepEqual(result.receipt.accepted[0].files, bundle.skills[0].files.map(file => ({ path: file.path, sha256: file.sha256 })));
    assert.equal(validateTransferReceipt({ ...result.receipt, bytes: skill.bytes }, bundle), undefined);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test("folder receipts acknowledge every exact supporting hash and keep instruction-only compatibility", async () => {
  const files = [await makeFile("refs/guide.md", "guide"), await makeFile("assets/binary.bin", "AAH/", "base64")];
  const skill = await makeSkill({ files }); const bundle = await createBundle([skill], "workspace-1");
  const accepted = { id: skill.id, sha256: skill.sha256, files: files.map(file => ({ path: file.path, sha256: file.sha256 })) };
  const receipt = { bundleVersion: 1, workspaceId: bundle.workspaceId, receivedAt: new Date().toISOString(), agent: "receiver", bytes: totalSkillBytes(skill), accepted: [accepted] };
  assert.ok(validateTransferReceipt(receipt, bundle));
  assert.ok(validateTransferReceipt({ ...receipt, accepted: [{ ...accepted, files: [...accepted.files].reverse() }] }, bundle));
  for (const fileRows of [undefined, [], [accepted.files[0]], [...accepted.files, accepted.files[0]], [{ ...accepted.files[0], sha256: "0".repeat(64) }, accepted.files[1]], [{ ...accepted.files[0], path: "../outside" }, accepted.files[1]], [{ ...accepted.files[0], path: "REFS/GUIDE.MD" }, accepted.files[1]], [{ ...accepted.files[0], path: "SKILL.md" }, accepted.files[1]], [{ ...accepted.files[0], sha256: "wrong" }, accepted.files[1]], [{ ...accepted.files[0], extra: true }, accepted.files[1]]]) {
    assert.equal(validateTransferReceipt({ ...receipt, accepted: [{ ...accepted, files: fileRows }] }, bundle), undefined);
  }
  const legacy = await createBundle([await makeSkill()], "workspace-1");
  const instructionReceipt = { ...receipt, bytes: legacy.skills[0].bytes, accepted: [{ id: skill.id, sha256: skill.sha256 }] };
  assert.ok(validateTransferReceipt(instructionReceipt, legacy));
  assert.ok(validateTransferReceipt({ ...instructionReceipt, accepted: [{ ...instructionReceipt.accepted[0], files: [] }] }, legacy));
  assert.equal(validateTransferReceipt({ ...instructionReceipt, accepted: [accepted] }, legacy), undefined);
  const emptyFolder = await createBundle([await makeSkill({ files: [] })], "workspace-1");
  assert.ok(validateTransferReceipt(instructionReceipt, emptyFolder));
});

test("support parser rejects unsafe, reserved, duplicate and file/directory-conflicting paths", async () => {
  const file = await makeFile("safe.txt", "safe");
  for (const filePath of ["/absolute", "../outside", "refs/../outside", "C:/escape", "C:\\escape", "refs//bad", "./bad", "refs/.", "refs/nul.txt", "con/data", "refs/COM1.exe", "refs/LPT².dat", "refs/trailing.", "refs/trailing ", "refs/clock$.log", "refs/illegal:name", "SKILL.md", "sKiLl.Md", "LOGIO.md", "skill.md/child", "x".repeat(257)]) {
    assert.equal(parseSkillFiles([{ ...file, path: filePath }]), undefined, filePath);
  }
  for (const paths of [["refs/a.md", "REFS/A.md"], ["refs", "refs/a.md"], ["refs/a.md", "refs"]]) assert.equal(parseSkillFiles(paths.map(filePath => ({ ...file, path: filePath }))), undefined);
  assert.equal(parseSkillFiles([{ ...file, encoding: "base64", content: "YQ=", bytes: 1 }]), undefined);
  assert.equal(parseSkillFiles([{ ...file, encoding: "base64", content: "YR==", bytes: 1 }]), undefined);
  assert.equal(parseSkillFiles([{ ...file, bytes: 3 }]), undefined);
  assert.equal(parseSkillFiles(Array.from({ length: 257 }, (_, i) => ({ ...file, path: `file-${i}` }))), undefined);
});

test("all supporting hashes, aggregate bounds and collision paths are rejected before installer writes", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "logio-skills-corrupt-"));
  try {
    const skill = await makeSkill({ files: [await makeFile("refs/a.txt", "original")] });
    const bad = structuredClone(skill); bad.files[0].content = "modified";
    await assert.rejects(createBundle([bad], "workspace-1"), /Checksum mismatch/);
    const bundle = await createBundle([skill], "workspace-1"); bundle.skills[0].files[0].sha256 = "0".repeat(64);
    await assert.rejects(installBundle(bundle, { directory: path.join(temp, "output") }), /Checksum\/byte mismatch/);
    assert.deepEqual(await readdir(temp), []);
    for (const filePath of ["../outside", "con.txt", "SKILL.md", "LOGIO.md"]) {
      const badBundle = structuredClone(bundle); badBundle.skills[0].files[0].path = filePath;
      assert.throws(() => validateBundle(badBundle));
    }
    const collision = await createBundle([skill], "workspace-1"); collision.skills[0].files.push({ ...skill.files[0], path: "REFS/A.TXT" });
    await assert.rejects(installBundle(collision, { directory: path.join(temp, "output") }), /collision/);
    assert.deepEqual(await readdir(temp), []);
    const large = await makeFile("one.bin", "x".repeat(1048576));
    assert.equal(parseSkillFiles([{ ...large, content: large.content + "x", bytes: large.bytes + 1 }]), undefined);
    const tooManyBytes = Array.from({ length: 5 }, (_, i) => ({ ...large, path: `${i}.bin` }));
    assert.equal(parseSkillFiles(tooManyBytes), undefined);
    assert.throws(() => validateBundle({ ...bundle, skills: [{ ...skill, files: tooManyBytes }] }), /4 MiB/);
  } finally { await rm(temp, { recursive: true, force: true }); }
});
