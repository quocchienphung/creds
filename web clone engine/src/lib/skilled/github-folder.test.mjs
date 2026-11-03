import test from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, strToU8 } from 'fflate';
import { readSkillArchive, importGitHubFolder, scanGitHubSource } from './github-folder.ts';
import { createBundle } from '../../components/sites/skilled/skill-model.ts';

const commit = '0123456789abcdef0123456789abcdef01234567';
const main = '---\nname: evidence-folder\ndescription: Use a real supporting reference.\n---\nRead references/check.md.\n';
function archive(entries) {
  const data = zipSync(Object.fromEntries(Object.entries(entries).map(([key, value]) => [key, typeof value === 'string' ? strToU8(value) : value])));
  const result = new Uint8Array(data.length + 40); result.set(data); result.set(strToU8(commit), data.length);
  new DataView(result.buffer).setUint16(data.length - 2, 40, true);
  return result;
}
const files = () => ({ 'repo-main/skills/evidence/SKILL.md': main, 'repo-main/skills/evidence/references/check.md': 'Inspect primary sources.', 'repo-main/skills/evidence/assets/image.bin': new Uint8Array([0, 255, 1, 90]), 'repo-main/LICENSE': 'MIT license example', 'repo-main/other/secret.txt': 'not in this skill' });
const url = 'https://github.com/owner/repo/tree/main/skills/evidence';

test('public archive scan pins commit, includes folder references/binary/license, excludes unrelated source', async () => {
  const result = await readSkillArchive(archive(files()), url);
  assert.equal(result.sourceRef, commit);
  assert.match(result.sourceUrl, new RegExp(commit));
  assert.equal(result.instructions, main);
  assert.deepEqual(result.files.map(file => file.path).sort(), ['SOURCE-LICENSE.txt', 'assets/image.bin', 'references/check.md']);
  assert.equal(result.files.find(file => file.path.endsWith('bin')).encoding, 'base64');
  const record = { ...result, id: 'skill-1', target: 'Local AI', status: 'ready', importedAt: new Date().toISOString(), guardrails: { citeSources: true, verifyBeforeAnswer: true, askWhenUncertain: true } };
  assert.equal((await createBundle([record], 'acme')).skills[0].files.length, 3);
});

test('scan rejects missing skill, unsafe folder paths, oversized files and archives without commit identity', async () => {
  await assert.rejects(readSkillArchive(archive({ 'repo-main/elsewhere/readme.md': 'none' }), url), /does not contain/);
  await assert.rejects(readSkillArchive(archive({ ...files(), 'repo-main/skills/evidence/../escape.txt': 'bad' }), url), /unsafe/);
  await assert.rejects(readSkillArchive(archive({ ...files(), 'repo-main/skills/evidence/too-big.txt': 'x'.repeat(1024 * 1024 + 1) }), url), /oversized/);
  await assert.rejects(readSkillArchive(zipSync({ 'repo-main/skills/evidence/SKILL.md': strToU8(main) }), url), /commit identity/);
});

test('folder import uses public codeload and rejects unsupported hosts before making a request', async () => {
  let request;
  const result = await importGitHubFolder(url, async (input, options) => { request = { input, options }; return new Response(archive(files())); });
  assert.equal(request.input, 'https://codeload.github.com/owner/repo/zip/main');
  assert.equal(request.options.redirect, 'error');
  assert.equal(result.name, 'evidence-folder');
  await assert.rejects(importGitHubFolder('https://evil.test/repo', async () => { throw new Error('must not fetch'); }), /Only public/);
});

test('repository root discovers actual metadata using one HEAD archive and commit-pinned choices', async () => {
  let calls = 0; let requested;
  const second = main.replaceAll('evidence-folder', 'other-skill').replace('Use a real supporting reference.', 'Read other source evidence.');
  const result = await scanGitHubSource('https://github.com/owner/repo', async input => {
    calls++; requested = input;
    return new Response(archive({ ...files(), 'repo-main/skills/other/SKILL.md': second, 'repo-main/skills/broken/SKILL.md': 'invalid frontmatter' }));
  });
  assert.equal(calls, 1); assert.equal(requested, 'https://codeload.github.com/owner/repo/zip/HEAD');
  assert.equal(result.skipped, 1); assert.equal(result.candidates.length, 2);
  assert.deepEqual(result.candidates.map(row => row.name), ['evidence-folder', 'other-skill']);
  assert.deepEqual(result.candidates.map(row => row.path), ['skills/evidence/SKILL.md', 'skills/other/SKILL.md']);
  assert.equal(result.candidates[0].url, `https://github.com/owner/repo/blob/${commit}/skills/evidence/SKILL.md`);
});

test('folder discovery is scoped; exact folder and root SKILL files still import directly', async () => {
  const content = archive({ ...files(), 'repo-main/elsewhere/other/SKILL.md': main });
  const exact = await scanGitHubSource(url, async () => new Response(content));
  assert.equal(exact.instructions, main); assert.ok(exact.files.length);
  const discovered = await scanGitHubSource('https://github.com/owner/repo/tree/main/skills', async () => new Response(content));
  assert.deepEqual(discovered.candidates.map(row => row.path), ['skills/evidence/SKILL.md']);
  const root = await scanGitHubSource('https://github.com/owner/repo', async () => new Response(archive({ 'repo-main/SKILL.md': main, 'repo-main/ref.md': 'support' })));
  assert.equal(root.name, 'evidence-folder'); assert.deepEqual(root.files.map(file => file.path), ['ref.md']);
  await assert.rejects(scanGitHubSource('https://github.com/owner/repo/blob/main/missing/SKILL.md', async () => new Response(content)), /does not contain/);
});

test('discovery bounds candidates, ignores malformed docs safely, and reports no valid skills clearly', async () => {
  const source = 'https://github.com/owner/repo';
  const candidateLimit = Object.fromEntries(Array.from({ length: 101 }, (_, i) => [`repo-main/skills/s${i}/SKILL.md`, main]));
  await assert.rejects(scanGitHubSource(source, async () => new Response(archive(candidateLimit))), /more than 100/);
  const largeDoc = main + 'x'.repeat(256 * 1024);
  const result = await scanGitHubSource(source, async () => new Response(archive({ ...files(), 'repo-main/large/SKILL.md': largeDoc, 'repo-main/bad-utf8/SKILL.md': new Uint8Array([255]), 'repo-main/../escape/SKILL.md': main })));
  assert.equal(result.candidates.length, 1); assert.equal(result.skipped, 3);
  const full = Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`repo-main/s${i}/SKILL.md`, main + 'x'.repeat(250 * 1024)]));
  await assert.rejects(scanGitHubSource(source, async () => new Response(archive(full))), /4 MiB/);
  await assert.rejects(scanGitHubSource(source, async () => new Response(archive({ 'repo-main/README.md': 'no skills' }))), /No SKILL.md/);
  await assert.rejects(scanGitHubSource(source, async () => new Response(archive({ 'repo-main/broken/SKILL.md': 'bad' }))), /No valid skills/);
});
