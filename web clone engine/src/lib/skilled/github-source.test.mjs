import test from "node:test";
import assert from "node:assert/strict";
import { importGitHubSkill, resolveGitHubSkillUrl } from "./github-source.ts";
import { sha256 } from "../../components/sites/skilled/skill-model.ts";

const content = "---\nname: source-reader\ndescription: Read primary source evidence.\n---\nRead the original files.\n";

test("GitHub file/tree/raw links resolve to raw content with explicit provenance and no API", () => {
  for (const url of ["https://github.com/owner/skills/blob/main/source-reader/SKILL.md?raw=1", "https://github.com/owner/skills/tree/main/source-reader", "https://raw.githubusercontent.com/owner/skills/main/source-reader/SKILL.md"]) {
    const resolved = resolveGitHubSkillUrl(url);
    assert.equal(resolved.rawUrl, "https://raw.githubusercontent.com/owner/skills/main/source-reader/SKILL.md");
    assert.equal(resolved.sourceRef, "main"); assert.equal(resolved.sourcePath, "source-reader/SKILL.md");
    assert.equal(resolved.sourceUrl, "https://github.com/owner/skills/blob/main/source-reader/SKILL.md");
  }
  assert.equal(resolveGitHubSkillUrl("https://github.com/owner/repo/tree/abc123").sourcePath, "SKILL.md");
  const root = resolveGitHubSkillUrl("https://github.com/owner/repo/");
  assert.equal(root.sourceRef, "HEAD"); assert.equal(root.sourcePath, "SKILL.md"); assert.equal(root.kind, "repository");
});

test("URL allowlist blocks SSRF, alternate protocols, credentials, escapes and unsupported filenames", () => {
  for (const url of ["http://github.com/o/r/blob/main/SKILL.md", "https://localhost/SKILL.md", "https://github.com.evil.test/o/r/blob/main/SKILL.md", "https://user@github.com/o/r/blob/main/SKILL.md", "https://github.com:444/o/r/blob/main/SKILL.md", "https://api.github.com/repos/o/r", "https://github.com/o", "https://github.com/o/r/blob/main/README.md", "https://github.com/o/r/blob/main/a%2fb/SKILL.md", "https://github.com/o/r/blob/main/%00/SKILL.md", "https://github.com/o/r/../other", "https://github.com/o/r/tree/main/a/%2e%2e/skills", "https://github.com/o/r/tree/main/%2E", "https://github.com/o/r/tree/main/%5c..%5cescape", "https://github.com/o/r/tree/main%2F../skills"]) assert.throws(() => resolveGitHubSkillUrl(url), undefined, url);
});

test("import streams raw bytes, checks metadata and computes SHA-256 without executing instructions", async () => {
  let called;
  const imported = await importGitHubSkill("https://github.com/o/r/blob/abc123/SKILL.md", async (url, options) => { called = { url, options }; return new Response(content, { headers: { "content-type": "text/plain" } }); });
  assert.equal(called.url, "https://raw.githubusercontent.com/o/r/abc123/SKILL.md");
  assert.equal(called.options.redirect, "error"); assert.equal(called.options.cache, "no-store");
  assert.equal(imported.instructions, content); assert.equal(imported.bytes, Buffer.byteLength(content)); assert.equal(imported.sha256, await sha256(content));
  assert.equal(imported.sourceRef, "abc123");
});

test("import rejects oversized streamed files, invalid UTF8/metadata, HTML and upstream failure", async () => {
  const url = "https://github.com/o/r/blob/main/SKILL.md";
  await assert.rejects(importGitHubSkill(url, async () => new Response("x".repeat(262145))), /256 KiB/);
  await assert.rejects(importGitHubSkill(url, async () => new Response("", { headers: { "content-length": "999999" } })), /256 KiB/);
  await assert.rejects(importGitHubSkill(url, async () => new Response(new Uint8Array([0xff]))), /UTF-8/);
  await assert.rejects(importGitHubSkill(url, async () => new Response("not a skill")), /frontmatter/);
  await assert.rejects(importGitHubSkill(url, async () => new Response("<html>", { headers: { "content-type": "text/html" } })), /HTML/);
  await assert.rejects(importGitHubSkill(url, async () => new Response("", { status: 404 })), /not found/);
  await assert.rejects(importGitHubSkill(url, async () => { throw new TypeError("Redirect"); }), /Redirects/);
});
