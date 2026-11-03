import { defineResource } from "../../../lib/workspace-backend/resource.ts";

export type SkillTarget = "Local AI" | "AI Agent";
export type SkillStatus = "ready" | "archived";
export interface SkillGuardrails { citeSources: boolean; verifyBeforeAnswer: boolean; askWhenUncertain: boolean }
export interface SkillFile { path: string; content: string; encoding: "utf8" | "base64"; sha256: string; bytes: number }
export interface SkillRecord {
  id: string; name: string; description: string; instructions: string;
  sourceUrl: string; sourceRef: string; sourcePath: string;
  sha256: string; bytes: number; importedAt: string;
  target: SkillTarget; status: SkillStatus; guardrails: SkillGuardrails;
  /** Absent on legacy instruction-only records. Empty means the captured folder contained no supporting files. */
  files?: SkillFile[];
}
export interface SkillEvent {
  id: string; skillId?: string; kind: "import" | "save" | "export" | "transfer";
  label: string; t: number; durationMs: number; bytes: number;
  outcome: "success" | "error"; detail?: string;
}
export interface SkillBundle { version: 1; workspaceId: string; createdAt: string; skills: SkillRecord[] }
export interface TransferReceipt {
  bundleVersion: 1; workspaceId: string; receivedAt: string; agent: string;
  accepted: { id: string; sha256: string; files?: { path: string; sha256: string }[] }[]; bytes: number;
}
export const MAX_SKILL_BYTES = 256 * 1024;
export const MAX_SUPPORT_FILE_BYTES = 1024 * 1024;
export const MAX_SUPPORT_BYTES = 4 * 1024 * 1024;
export const MAX_SUPPORT_FILES = 256;
const identifier = /^[A-Za-z0-9_-]{1,128}$/;
const skillName = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const digest = /^[a-f0-9]{64}$/;
const object = (raw: unknown): raw is Record<string, unknown> => !!raw && typeof raw === "object" && !Array.isArray(raw);
const text = (raw: unknown, max: number, min = 0): raw is string => typeof raw === "string" && raw.length >= min && raw.length <= max && !raw.includes("\0");
const finite = (raw: unknown): raw is number => typeof raw === "number" && Number.isFinite(raw) && raw >= 0;
const isoDate = (raw: unknown): raw is string => typeof raw === "string" && /^\d{4}-\d{2}-\d{2}T/.test(raw) && Number.isFinite(Date.parse(raw));
const only = (raw: Record<string, unknown>, keys: string[]) => Object.keys(raw).every(key => keys.includes(key));
export const instructionBytes = (instructions: string) => new TextEncoder().encode(instructions).byteLength;
export const totalSkillBytes = (skill: Pick<SkillRecord, "bytes" | "files">) => skill.bytes + (skill.files?.reduce((sum, file) => sum + file.bytes, 0) ?? 0);

/** Portable relative paths; every segment must also be valid on Windows. */
export function isSafeSkillPath(path: unknown): path is string {
  if (typeof path !== "string" || !path.length || path.length > 256 || /[\\<>:"|?*\u0000-\u001f\u007f]/.test(path)) return false;
  return path.split("/").every(part => !!part && part !== "." && part !== ".." && !/^\s|[.\s]$/.test(part) && !/^(con|prn|aux|nul|clock\$|conin\$|conout\$|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(part));
}

export function decodeSkillFile(file: Pick<SkillFile, "content" | "encoding">): Uint8Array {
  if (file.encoding === "utf8") return new TextEncoder().encode(file.content);
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.content)) throw new Error("Invalid base64 skill file.");
  const binary = atob(file.content);
  if (btoa(binary) !== file.content) throw new Error("Non-canonical base64 skill file.");
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

export function parseSkillFiles(raw: unknown): SkillFile[] | undefined {
  if (!Array.isArray(raw) || raw.length > MAX_SUPPORT_FILES) return;
  const paths = new Set<string>(["skill.md", "logio.md"]); let bytes = 0;
  for (const file of raw) {
    if (!object(file) || !only(file, ["path", "content", "encoding", "sha256", "bytes"]) || !isSafeSkillPath(file.path)) return;
    if (typeof file.content !== "string" || file.content.length > Math.ceil(MAX_SUPPORT_FILE_BYTES / 3) * 4 || (file.encoding !== "utf8" && file.encoding !== "base64")) return;
    if (!text(file.sha256, 64) || !digest.test(file.sha256) || !finite(file.bytes) || !Number.isSafeInteger(file.bytes) || file.bytes > MAX_SUPPORT_FILE_BYTES) return;
    try { if (decodeSkillFile(file as unknown as SkillFile).byteLength !== file.bytes) return; } catch { return; }
    bytes += file.bytes; if (bytes > MAX_SUPPORT_BYTES) return;
    const key = file.path.toLowerCase();
    for (const existing of paths) if (key === existing || key.startsWith(existing + "/") || existing.startsWith(key + "/")) return;
    paths.add(key);
  }
  return raw as SkillFile[];
}

export function parseSkillRecord(raw: unknown): SkillRecord | undefined {
  if (!object(raw) || !only(raw, ["id", "name", "description", "instructions", "sourceUrl", "sourceRef", "sourcePath", "sha256", "bytes", "importedAt", "target", "status", "guardrails", "files"])) return;
  if (!text(raw.id, 128, 1) || !identifier.test(raw.id) || !text(raw.name, 64, 1) || !skillName.test(raw.name) || !isSafeSkillPath(raw.name)) return;
  if (!text(raw.description, 2048, 1) || !text(raw.instructions, MAX_SKILL_BYTES, 1) || instructionBytes(raw.instructions) > MAX_SKILL_BYTES) return;
  if (!text(raw.sourceUrl, 2048) || !text(raw.sourceRef, 256) || !text(raw.sourcePath, 2048)) return;
  if (raw.sourceUrl) { try { const url = new URL(raw.sourceUrl); if (url.protocol !== "https:" || url.username || url.password) return; } catch { return; } }
  if (!text(raw.sha256, 64) || !digest.test(raw.sha256) || raw.bytes !== instructionBytes(raw.instructions) || !isoDate(raw.importedAt)) return;
  if ((raw.target !== "Local AI" && raw.target !== "AI Agent") || (raw.status !== "ready" && raw.status !== "archived")) return;
  const g = raw.guardrails;
  if (!object(g) || !only(g, ["citeSources", "verifyBeforeAnswer", "askWhenUncertain"]) || typeof g.citeSources !== "boolean" || typeof g.verifyBeforeAnswer !== "boolean" || typeof g.askWhenUncertain !== "boolean") return;
  if (raw.files !== undefined && !parseSkillFiles(raw.files)) return;
  return raw as unknown as SkillRecord;
}

export function parseSkillLibrary(raw: unknown): SkillRecord[] | undefined {
  if (!Array.isArray(raw) || raw.length > 200 || raw.some(row => !parseSkillRecord(row))) return;
  const rows = raw as SkillRecord[];
  if (new Set(rows.map(row => row.id)).size !== rows.length) return;
  return rows;
}

export function parseSkillEvents(raw: unknown): SkillEvent[] | undefined {
  if (!Array.isArray(raw) || raw.length > 200) return;
  for (const row of raw) {
    if (!object(row) || !only(row, ["id", "skillId", "kind", "label", "t", "durationMs", "bytes", "outcome", "detail"])) return;
    if (!text(row.id, 128, 1) || !identifier.test(row.id) || (row.skillId !== undefined && (!text(row.skillId, 128, 1) || !identifier.test(row.skillId)))) return;
    if (!["import", "save", "export", "transfer"].includes(String(row.kind)) || !text(row.label, 256, 1)) return;
    if (!finite(row.t) || !finite(row.durationMs) || !finite(row.bytes) || !Number.isSafeInteger(row.bytes)) return;
    if (row.outcome !== "success" && row.outcome !== "error") return;
    if (row.detail !== undefined && !text(row.detail, 2048)) return;
  }
  if (new Set(raw.map(row => row.id)).size !== raw.length) return;
  return raw as SkillEvent[];
}

export const skillLibraryResource = defineResource<SkillRecord[]>({ name: "skill-library", scope: "workspace", storage: "backend", collection: true, empty: [], parse: parseSkillLibrary });
export const skillEventsResource = defineResource<SkillEvent[]>({ name: "skill-events", scope: "workspace", storage: "backend", collection: true, live: true, empty: [], parse: parseSkillEvents });

/** Deliberately limited YAML: plain/quoted single lines and literal/folded strings. No YAML evaluation. */
export function parseSkillMarkdown(content: string): { name: string; description: string } {
  const normalized = content.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) throw new Error("SKILL.md must start with YAML frontmatter (---).");
  const closing = normalized.indexOf("\n---\n", 4);
  if (closing < 0) throw new Error("SKILL.md frontmatter must end with --- on its own line.");
  const lines = normalized.slice(4, closing).split("\n");
  const values: Record<string, string> = {};
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trimStart().startsWith("#") || /^\s/.test(line)) continue;
    const match = /^(name|description):\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, key, value] = match;
    if (values[key] !== undefined) throw new Error(`Duplicate ${key} in SKILL.md frontmatter.`);
    if (/^[>|][-+]?\s*$/.test(value)) {
      const block: string[] = [];
      while (i + 1 < lines.length && (/^\s/.test(lines[i + 1]) || !lines[i + 1].trim())) block.push(lines[++i]);
      const indent = Math.min(...block.filter(item => item.trim()).map(item => item.match(/^\s*/)?.[0].length ?? 0));
      values[key] = block.map(item => item.slice(Number.isFinite(indent) ? indent : 0)).join(value.startsWith(">") ? " " : "\n").trim();
    } else if (value.startsWith('"')) {
      try { const parsed: unknown = JSON.parse(value); if (typeof parsed !== "string") throw new Error(); values[key] = parsed; } catch { throw new Error(`Use a valid JSON quoted string for ${key}.`); }
    } else if (value.startsWith("'")) {
      if (!/^'(?:[^']|'')*'$/.test(value)) throw new Error(`Unsupported quoted ${key}.`);
      values[key] = value.slice(1, -1).replace(/''/g, "'");
    } else {
      if (/^[\[\]{}&*!>|@`]/.test(value) || /:\s/.test(value)) throw new Error(`Use a quoted string for ${key}.`);
      values[key] = value.replace(/\s+#.*$/, "").trim();
    }
  }
  if (!values.name || values.name.length > 64 || !skillName.test(values.name)) throw new Error("Skill name must be 1–64 lowercase letters, numbers and single hyphens.");
  if (!values.description || values.description.length > 2048 || values.description.includes("\0")) throw new Error("Skill description is required (maximum 2048 characters).");
  return { name: values.name, description: values.description };
}

export async function sha256(instructions: string): Promise<string> {
  return sha256Bytes(new TextEncoder().encode(instructions));
}

export async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  const result = await globalThis.crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return Array.from(new Uint8Array(result), byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function createBundle(skills: SkillRecord[], workspaceId: string): Promise<SkillBundle> {
  if (!identifier.test(workspaceId) || !parseSkillLibrary(skills)) throw new Error("Invalid skill bundle or workspace.");
  const names = new Set<string>();
  for (const skill of skills) {
    if (names.has(skill.name)) throw new Error(`Duplicate bundle folder: ${skill.name}. Rename one skill before exporting.`);
    names.add(skill.name);
    if (await sha256(skill.instructions) !== skill.sha256) throw new Error(`Checksum mismatch for ${skill.name}. Save the skill again before exporting.`);
    for (const file of skill.files ?? []) if (await sha256Bytes(decodeSkillFile(file)) !== file.sha256) throw new Error(`Checksum mismatch for ${skill.name}/${file.path}. Import the skill again before exporting.`);
  }
  return { version: 1, workspaceId, createdAt: new Date().toISOString(), skills: skills.map(skill => ({ ...skill, guardrails: { ...skill.guardrails }, ...(skill.files === undefined ? {} : { files: skill.files.map(file => ({ ...file })) }) })) };
}

export function validateTransferReceipt(raw: unknown, bundle?: SkillBundle): TransferReceipt | undefined {
  if (!object(raw) || !only(raw, ["bundleVersion", "workspaceId", "receivedAt", "agent", "accepted", "bytes"]) || raw.bundleVersion !== 1) return;
  if (!text(raw.workspaceId, 128, 1) || !identifier.test(raw.workspaceId) || !isoDate(raw.receivedAt) || !text(raw.agent, 256, 1)) return;
  if (!finite(raw.bytes) || !Number.isSafeInteger(raw.bytes) || !Array.isArray(raw.accepted) || raw.accepted.length > 200) return;
  for (const row of raw.accepted) {
    if (!object(row) || !only(row, ["id", "sha256", "files"]) || !text(row.id, 128, 1) || !identifier.test(row.id) || !text(row.sha256, 64) || !digest.test(row.sha256)) return;
    if (row.files !== undefined) {
      if (!Array.isArray(row.files) || row.files.length > MAX_SUPPORT_FILES) return;
      const paths = new Set<string>(["skill.md", "logio.md"]);
      for (const file of row.files) {
        if (!object(file) || !only(file, ["path", "sha256"]) || !isSafeSkillPath(file.path) || !text(file.sha256, 64) || !digest.test(file.sha256)) return;
        const key = file.path.toLowerCase();
        for (const existing of paths) if (key === existing || key.startsWith(existing + "/") || existing.startsWith(key + "/")) return;
        paths.add(key);
      }
    }
  }
  const accepted = raw.accepted as TransferReceipt["accepted"];
  if (new Set(accepted.map(row => row.id)).size !== accepted.length) return;
  if (bundle && (raw.workspaceId !== bundle.workspaceId || accepted.length !== bundle.skills.length || raw.bytes !== bundle.skills.reduce((sum, skill) => sum + totalSkillBytes(skill), 0) || bundle.skills.some(skill => !accepted.some(row => row.id === skill.id && row.sha256 === skill.sha256)))) return;
  if (bundle) {
    for (const skill of bundle.skills) {
      const received = accepted.find(row => row.id === skill.id);
      if (!received) return;
      const expectedFiles = skill.files ?? [];
      if (expectedFiles.length && !received.files) return;
      if (received.files && (received.files.length !== expectedFiles.length || expectedFiles.some(file => !received.files?.some(item => item.path === file.path && item.sha256 === file.sha256)))) return;
    }
  }
  return raw as unknown as TransferReceipt;
}
