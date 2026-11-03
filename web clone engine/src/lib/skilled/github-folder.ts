import { unzipSync } from "fflate";
import { isSafeSkillPath, parseSkillMarkdown, parseSkillFiles, sha256, sha256Bytes, type SkillFile } from "../../components/sites/skilled/skill-model.ts";
import { resolveGitHubSkillUrl, SkillImportError, type ImportedSkill } from "./github-source.ts";

const MAX_ARCHIVE = 20 * 1024 * 1024;
export interface ArchiveEntry { name: string; bytes: number; mode: number }
export interface SkillCandidate { name: string; description: string; path: string; url: string }
export type GitHubSourceScan = (ImportedSkill & { files: SkillFile[] }) | { candidates: SkillCandidate[]; skipped?: number };

/** Read the central directory before inflation; never extract archive paths onto disk. */
function archiveIndex(data: Uint8Array) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let end = data.length - 22;
  while (end >= Math.max(0, data.length - 65557) && view.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0 || end < data.length - 65557) throw new SkillImportError("Invalid GitHub archive.", 422);
  const commentLength = view.getUint16(end + 20, true);
  if (end + 22 + commentLength !== data.length || view.getUint16(end + 4, true) !== 0 || view.getUint16(end + 6, true) !== 0) throw new SkillImportError("Unsupported GitHub archive format.", 422);
  const commit = new TextDecoder().decode(data.subarray(end + 22));
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new SkillImportError("GitHub archive is missing its commit identity.", 422);
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  if (count > 20000 || offset >= end) throw new SkillImportError("Repository archive is too large to inspect.", 413);
  const entries: ArchiveEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50) throw new SkillImportError("Invalid archive directory.", 422);
    const length = view.getUint16(offset + 28, true), extra = view.getUint16(offset + 30, true), comment = view.getUint16(offset + 32, true);
    if (offset + 46 + length + extra + comment > end) throw new SkillImportError("Invalid archive entry.", 422);
    let name: string;
    try { name = new TextDecoder("utf-8", { fatal: true }).decode(data.subarray(offset + 46, offset + 46 + length)); }
    catch { throw new SkillImportError("Archive entry names must be valid UTF-8.", 422); }
    entries.push({ name, bytes: view.getUint32(offset + 24, true), mode: view.getUint32(offset + 38, true) >>> 16 });
    offset += 46 + length + extra + comment;
  }
  return { entries, commit };
}

export function inspectArchive(data: Uint8Array) {
  if (data.length < 22 || data.length > MAX_ARCHIVE) throw new SkillImportError("Repository archive exceeds 20 MiB or is invalid.", 413);
  const { entries, commit } = archiveIndex(data);
  const root = entries[0]?.name.split("/")[0];
  if (!root || !isSafeSkillPath(root) || entries.some(entry => !entry.name.startsWith(`${root}/`)) || new Set(entries.map(entry => entry.name)).size !== entries.length) throw new SkillImportError("Archive has inconsistent repository roots or duplicate entries.", 422);
  return { entries, commit, root };
}

export async function readSkillArchive(data: Uint8Array, input: string): Promise<ImportedSkill & { files: SkillFile[] }> {
  const location = resolveGitHubSkillUrl(input);
  const { entries, commit, root } = inspectArchive(data);
  const directory = location.sourcePath.slice(0, -"SKILL.md".length);
  const prefix = `${root}/${directory}`;
  const selected = entries.filter(entry => entry.name.startsWith(prefix) && !entry.name.endsWith("/"));
  const rootLicense = entries.find(entry => /^(LICENSE(?:\.md|\.txt)?|COPYING|NOTICE)$/i.test(entry.name.slice(root.length + 1)));
  if (rootLicense && !selected.some(entry => entry.name === rootLicense.name)) selected.push(rootLicense);
  if (!selected.some(entry => entry.name === `${prefix}SKILL.md`)) throw new SkillImportError("This repository folder does not contain SKILL.md.", 404);
  if (selected.length > 257 || selected.reduce((sum, entry) => sum + entry.bytes, 0) > 4 * 1024 * 1024) throw new SkillImportError("Skill folder exceeds 256 supporting files or 4 MiB.", 413);
  for (const entry of selected) {
    const type = entry.mode & 0o170000;
    if (entry.bytes > 1024 * 1024 || (type !== 0 && type !== 0o100000)) throw new SkillImportError("Skill contains an oversized file, symbolic link or unsupported entry.", 422);
  }
  const chosenNames = new Set(selected.filter(entry => entry.bytes > 0).map(entry => entry.name));
  let unpacked: Record<string, Uint8Array>;
  try { unpacked = unzipSync(data, { filter: entry => chosenNames.has(entry.name) && entry.originalSize <= 1024 * 1024 }); }
  catch { throw new SkillImportError("Could not decode this GitHub archive.", 422); }
  const main = unpacked[`${prefix}SKILL.md`];
  if (!main || main.length > 256 * 1024) throw new SkillImportError("SKILL.md is empty or exceeds 256 KiB.", 413);
  let instructions: string;
  try { instructions = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(main); }
  catch { throw new SkillImportError("SKILL.md must be valid UTF-8.", 422); }
  let metadata: ReturnType<typeof parseSkillMarkdown>;
  try { metadata = parseSkillMarkdown(instructions); }
  catch (error) { throw new SkillImportError(error instanceof Error ? error.message : "Invalid SKILL.md frontmatter.", 422); }
  const files: SkillFile[] = [];
  for (const entry of selected) {
    if (entry.name === `${prefix}SKILL.md`) continue;
    const content = entry.bytes ? unpacked[entry.name] : new Uint8Array();
    if (!content || content.length !== entry.bytes) throw new SkillImportError("Skill file size does not match its archive entry.", 422);
    const path = entry.name.startsWith(prefix) ? entry.name.slice(prefix.length) : "SOURCE-LICENSE.txt";
    let text: string;
    let encoding: SkillFile["encoding"] = "utf8";
    try { text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(content); if (text.includes("\0")) throw new Error(); }
    catch { text = Buffer.from(content).toString("base64"); encoding = "base64"; }
    files.push({ path, content: text, encoding, bytes: content.length, sha256: await sha256Bytes(content) });
  }
  if (!parseSkillFiles(files)) throw new SkillImportError("Skill contains unsafe, duplicate or unsupported file paths.", 422);
  const parts = new URL(location.sourceUrl).pathname.split("/").filter(Boolean);
  return { ...metadata, instructions, bytes: main.length, sha256: await sha256(instructions), files, sourceRef: commit, sourcePath: location.sourcePath, sourceUrl: `https://github.com/${parts[0]}/${parts[1]}/blob/${commit}/${location.sourcePath.split("/").map(encodeURIComponent).join("/")}` };
}

/** Download one bounded public archive. Discovery and exact imports share the same source bytes. */
export async function downloadArchive(input: string, fetcher: typeof fetch): Promise<Uint8Array> {
  const location = resolveGitHubSkillUrl(input);
  const parts = new URL(location.sourceUrl).pathname.split("/").filter(Boolean);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetcher(`https://codeload.github.com/${parts[0]}/${parts[1]}/zip/${encodeURIComponent(location.sourceRef)}`, { redirect: "error", signal: controller.signal, cache: "no-store" });
    if (!response.ok || !response.body) throw new SkillImportError("Could not download the public repository archive. Check its branch and path.", response.status === 404 ? 404 : 502);
    if (Number(response.headers.get("content-length")) > MAX_ARCHIVE) throw new SkillImportError("Repository archive exceeds 20 MiB.", 413);
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = []; let length = 0;
    try {
      while (true) { const chunk = await reader.read(); if (chunk.done) break; length += chunk.value.length; if (length > MAX_ARCHIVE) { await reader.cancel(); throw new SkillImportError("Repository archive exceeds 20 MiB.", 413); } chunks.push(chunk.value); }
    } finally { reader.releaseLock(); }
    const data = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length; }
    return data;
  } catch (failure) {
    if (failure instanceof SkillImportError) throw failure;
    throw new SkillImportError(controller.signal.aborted ? "Repository scan timed out after 25 seconds." : failure instanceof Error ? failure.message : "Could not scan the skill folder.", 422);
  } finally { clearTimeout(timeout); }
}

/** GitHub's public source archive, not an API or executable source bundle. Only the selected skill is retained. */
export async function importGitHubFolder(input: string, fetcher: typeof fetch = fetch): Promise<ImportedSkill & { files: SkillFile[] }> {
  return readSkillArchive(await downloadArchive(input, fetcher), input);
}

/** Every valid SKILL.md under the location's folder, with a commit-pinned link for each. Shared by skill discovery and the repository scan. */
export async function collectSkillCandidates(data: Uint8Array, location: ReturnType<typeof resolveGitHubSkillUrl>): Promise<{ candidates: SkillCandidate[]; skipped: number; commit: string; root: string; entries: ArchiveEntry[] }> {
  const { entries, root, commit } = inspectArchive(data);
  const directory = location.sourcePath.slice(0, -"SKILL.md".length);
  const prefix = `${root}/${directory}`;
  const documents = entries.filter(entry => entry.name.startsWith(prefix) && entry.name.endsWith("/SKILL.md") && !entry.name.endsWith("/"));
  if (documents.length > 100) throw new SkillImportError("This source contains more than 100 skill documents. Choose a narrower GitHub folder to scan.", 413);
  let skipped = 0;
  const selected = documents.filter(entry => {
    const type = entry.mode & 0o170000;
    if (!isSafeSkillPath(entry.name.slice(root.length + 1)) || !entry.bytes || entry.bytes > 256 * 1024 || (type !== 0 && type !== 0o100000)) { skipped++; return false; }
    return true;
  });
  if (selected.reduce((sum, entry) => sum + entry.bytes, 0) > 4 * 1024 * 1024) throw new SkillImportError("Skill discovery exceeds 4 MiB of instruction documents. Choose a narrower GitHub folder.", 413);
  const names = new Set(selected.map(entry => entry.name));
  let unpacked: Record<string, Uint8Array>;
  try { unpacked = unzipSync(data, { filter: entry => names.has(entry.name) && entry.originalSize <= 256 * 1024 }); }
  catch { throw new SkillImportError("Could not decode this GitHub archive.", 422); }
  const parts = new URL(location.sourceUrl).pathname.split("/").filter(Boolean);
  const candidates: SkillCandidate[] = [];
  for (const entry of selected) {
    const bytes = unpacked[entry.name];
    if (!bytes || bytes.length !== entry.bytes) throw new SkillImportError("Skill document size does not match its archive entry.", 422);
    const path = entry.name.slice(root.length + 1);
    try {
      const instructions = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
      if (instructions.includes("\0")) throw new Error();
      const metadata = parseSkillMarkdown(instructions);
      candidates.push({ ...metadata, path, url: `https://github.com/${parts[0]}/${parts[1]}/blob/${commit}/${path.split("/").map(encodeURIComponent).join("/")}` });
    } catch { skipped++; }
  }
  candidates.sort((left, right) => left.path.localeCompare(right.path));
  return { candidates, skipped, commit, root, entries };
}

/** Discover real SKILL.md documents without choosing an arbitrary nested skill. */
export async function scanGitHubSource(input: string, fetcher: typeof fetch = fetch): Promise<GitHubSourceScan> {
  const location = resolveGitHubSkillUrl(input);
  const data = await downloadArchive(input, fetcher);
  const { entries, root } = inspectArchive(data);
  const directory = location.sourcePath.slice(0, -"SKILL.md".length);
  if (entries.some(entry => entry.name === `${root}/${directory}SKILL.md`)) return readSkillArchive(data, input);
  if (location.kind === "file") throw new SkillImportError("This repository path does not contain SKILL.md.", 404);
  const { candidates, skipped } = await collectSkillCandidates(data, location);
  if (!candidates.length) throw new SkillImportError(skipped ? "No valid skills were found. SKILL.md files need a valid name and description in YAML frontmatter." : "No SKILL.md files were found in this repository or folder.", 404);
  return { candidates, ...(skipped ? { skipped } : {}) };
}
