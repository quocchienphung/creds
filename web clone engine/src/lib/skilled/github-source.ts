import { MAX_SKILL_BYTES, parseSkillMarkdown, sha256 } from "../../components/sites/skilled/skill-model.ts";

export interface GitHubSkillLocation { sourceUrl: string; rawUrl: string; sourceRef: string; sourcePath: string; kind: "repository" | "folder" | "file" }
export interface ImportedSkill {
  name: string; description: string; instructions: string; sourceUrl: string;
  sourceRef: string; sourcePath: string; sha256: string; bytes: number;
}
export class SkillImportError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) { super(message); this.name = "SkillImportError"; this.status = status; }
}

/** Resolve public GitHub file/tree links without using the GitHub API or following redirects. */
export function resolveGitHubSkillUrl(input: string): GitHubSkillLocation {
  input = input.trim();
  if (input.length > 2048) throw new SkillImportError("GitHub URL is too long.");
  let url: URL;
  try { url = new URL(input); } catch { throw new SkillImportError("Enter a complete HTTPS GitHub URL."); }
  if (url.protocol !== "https:" || url.port || url.username || url.password || !["github.com", "raw.githubusercontent.com"].includes(url.hostname)) throw new SkillImportError("Only public HTTPS github.com or raw.githubusercontent.com skill links are supported.");
  // URL normalizes dot segments, so inspect the original path before that normalization can hide them.
  const originalPath = /^[a-z][a-z0-9+.-]*:\/\/[^/?#]+([^?#]*)/i.exec(input)?.[1] ?? "";
  try {
    if (originalPath.split("/").some(segment => { const decoded = decodeURIComponent(segment); return decoded === "." || decoded === ".." || /[\\\u0000-\u001f]/.test(decoded); })) throw new SkillImportError("GitHub URL contains an invalid path.");
  } catch (error) { if (error instanceof SkillImportError) throw error; throw new SkillImportError("GitHub URL contains invalid escaping."); }
  let parts: string[];
  try { parts = url.pathname.replace(/\/$/, "").slice(1).split("/").map(decodeURIComponent); } catch { throw new SkillImportError("GitHub URL contains invalid escaping."); }
  if (parts.some(part => !part || part === "." || part === ".." || /[\\\0\r\n]/.test(part))) throw new SkillImportError("GitHub URL contains an invalid path.");
  const [owner, repo] = parts;
  if (!owner || !repo || !/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) throw new SkillImportError("A GitHub owner and repository are required.");
  let ref: string;
  let path: string[];
  let kind: GitHubSkillLocation["kind"] = "file";
  if (url.hostname === "github.com") {
    if (parts.length === 2) { ref = "HEAD"; path = ["SKILL.md"]; kind = "repository"; }
    else {
      if (!["blob", "tree"].includes(parts[2]) || !parts[3]) throw new SkillImportError("Use a repository URL or a GitHub file/folder link with a branch, tag or commit.");
      ref = parts[3]; path = parts.slice(4);
      if (parts[2] === "tree") { path.push("SKILL.md"); kind = "folder"; }
    }
  } else { ref = parts[2]; path = parts.slice(3); }
  if (!ref || !path.length || path.at(-1) !== "SKILL.md" || path.some(part => part.includes("/"))) throw new SkillImportError("The link must point to a SKILL.md file (or its GitHub tree folder).");
  if (ref.length > 256 || /[~^:?*\[\]\\\s]/.test(ref) || ref.includes("..") || ref.startsWith("/") || ref.endsWith("/")) throw new SkillImportError("Unsupported Git reference. Use a commit-pinned SKILL.md URL.");
  const rawPath = [owner, repo, ref, ...path].map(encodeURIComponent).join("/");
  return {
    sourceUrl: `https://github.com/${[owner, repo, "blob", ref, ...path].map(encodeURIComponent).join("/")}`,
    rawUrl: `https://raw.githubusercontent.com/${rawPath}`,
    sourceRef: ref, sourcePath: path.join("/"), kind,
  };
}

export async function importGitHubSkill(input: string, fetcher: typeof fetch = fetch): Promise<ImportedSkill> {
  const location = resolveGitHubSkillUrl(input);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetcher(location.rawUrl, { redirect: "error", signal: controller.signal, cache: "no-store", headers: { Accept: "text/plain", "User-Agent": "Logio-Skill-Importer/1.0" } });
    if (!response.ok) throw new SkillImportError(response.status === 404 ? "SKILL.md was not found. Check the public path and branch (use an encoded slash for branch names containing /)." : `GitHub returned HTTP ${response.status}.`, response.status === 404 ? 404 : 502);
    if (response.headers.get("content-type")?.includes("text/html")) throw new SkillImportError("GitHub returned HTML instead of a SKILL.md text file.", 422);
    const declared = Number(response.headers.get("content-length"));
    if (declared > MAX_SKILL_BYTES) throw new SkillImportError("SKILL.md exceeds the 256 KiB limit.", 413);
    if (!response.body) throw new SkillImportError("GitHub returned an empty file.", 422);
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = []; let bytes = 0;
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        bytes += next.value.byteLength;
        if (bytes > MAX_SKILL_BYTES) { await reader.cancel(); throw new SkillImportError("SKILL.md exceeds the 256 KiB limit.", 413); }
        chunks.push(next.value);
      }
    } finally { reader.releaseLock(); }
    const buffer = new Uint8Array(bytes); let offset = 0;
    for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
    let instructions: string;
    try { instructions = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(buffer); } catch { throw new SkillImportError("SKILL.md must be valid UTF-8 text.", 422); }
    if (instructions.includes("\0")) throw new SkillImportError("SKILL.md contains invalid null characters.", 422);
    let metadata: ReturnType<typeof parseSkillMarkdown>;
    try { metadata = parseSkillMarkdown(instructions); } catch (error) { throw new SkillImportError(error instanceof Error ? error.message : "Invalid SKILL.md frontmatter.", 422); }
    return { ...metadata, instructions, sourceUrl: location.sourceUrl, sourceRef: location.sourceRef, sourcePath: location.sourcePath, sha256: await sha256(instructions), bytes };
  } catch (error) {
    if (error instanceof SkillImportError) throw error;
    throw new SkillImportError(controller.signal.aborted ? "GitHub import timed out after 15 seconds." : "Could not read the public GitHub file. Redirects, private repositories and network failures are not supported.", controller.signal.aborted ? 504 : 502);
  } finally { clearTimeout(timeout); }
}
