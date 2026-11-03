/** Offline installer. Never executes downloaded instructions or contacts a model. */
import { createHash } from "node:crypto";
import { lstat, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const hash = value => createHash("sha256").update(value, "utf8").digest("hex");
const safeId = value => typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const date = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
const object = value => !!value && typeof value === "object" && !Array.isArray(value);
const string = (value, max, min = 0) => typeof value === "string" && value.length >= min && value.length <= max && !value.includes("\0");
const safePath = value => typeof value === "string" && value.length > 0 && value.length <= 256 && !/[\\<>:"|?*\u0000-\u001f\u007f]/.test(value) && value.split("/").every(part => part && part !== "." && part !== ".." && !/^\s|[.\s]$/.test(part) && !/^(con|prn|aux|nul|clock\$|conin\$|conout\$|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(part));
const supportBytes = file => Buffer.from(file.content, file.encoding === "base64" ? "base64" : "utf8");
const totalBytes = skill => skill.bytes + (skill.files?.reduce((sum, file) => sum + file.bytes, 0) ?? 0);

function validateSupportingFiles(skill) {
  if (skill.files === undefined) return;
  if (!Array.isArray(skill.files) || skill.files.length > 256) throw new Error(`Invalid support files: ${skill.name}.`);
  const paths = new Set(["skill.md", "logio.md"]); let bytes = 0;
  for (const file of skill.files) {
    if (!object(file) || Object.keys(file).some(key => !["path", "content", "encoding", "sha256", "bytes"].includes(key)) || !safePath(file.path)) throw new Error(`Unsafe supporting file path in ${skill.name}.`);
    if (typeof file.content !== "string" || file.content.length > Math.ceil(1048576 / 3) * 4 || !["utf8", "base64"].includes(file.encoding) || typeof file.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(file.sha256) || !Number.isSafeInteger(file.bytes) || file.bytes < 0 || file.bytes > 1048576) throw new Error(`Invalid supporting file: ${skill.name}/${file.path}.`);
    const key = file.path.toLowerCase();
    for (const existing of paths) if (key === existing || key.startsWith(existing + "/") || existing.startsWith(key + "/")) throw new Error(`Supporting file path collision: ${skill.name}/${file.path}.`);
    paths.add(key);
    const content = supportBytes(file);
    if (file.encoding === "base64" && content.toString("base64") !== file.content) throw new Error(`Non-canonical base64: ${skill.name}/${file.path}.`);
    if (content.length !== file.bytes || hash(content) !== file.sha256) throw new Error(`Checksum/byte mismatch: ${skill.name}/${file.path}. No skills were installed.`);
    bytes += content.length;
    if (bytes > 4194304) throw new Error(`Supporting files exceed 4 MiB: ${skill.name}.`);
  }
}

export function validateBundle(bundle) {
  if (!object(bundle) || Object.keys(bundle).some(key => !["version", "workspaceId", "createdAt", "skills"].includes(key)) || bundle.version !== 1 || !safeId(bundle.workspaceId) || !date(bundle.createdAt) || !Array.isArray(bundle.skills) || bundle.skills.length > 200) throw new Error("Invalid v1 skill manifest.");
  const names = new Set(); const ids = new Set();
  for (const skill of bundle.skills) {
    if (!object(skill) || !safeId(skill.id) || !string(skill.name, 64, 1) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skill.name)) throw new Error("Invalid skill ID or folder name.");
    if (Object.keys(skill).some(key => !["id", "name", "description", "instructions", "sourceUrl", "sourceRef", "sourcePath", "sha256", "bytes", "importedAt", "target", "status", "guardrails", "files"].includes(key))) throw new Error(`Unknown skill metadata: ${skill.name}.`);
    if (names.has(skill.name) || ids.has(skill.id) || !safePath(skill.name)) throw new Error(`Duplicate or reserved skill folder: ${skill.name}.`);
    names.add(skill.name); ids.add(skill.id);
    if (!string(skill.instructions, 262144, 1) || !string(skill.description, 2048, 1) || !string(skill.sourceUrl, 2048) || !string(skill.sourceRef, 256) || !string(skill.sourcePath, 2048)) throw new Error(`Invalid skill content: ${skill.name}.`);
    if (!date(skill.importedAt) || !["ready", "archived"].includes(skill.status) || !["Local AI", "AI Agent"].includes(skill.target)) throw new Error(`Invalid skill metadata: ${skill.name}.`);
    if (skill.sourceUrl) { const url = new URL(skill.sourceUrl); if (url.protocol !== "https:" || url.username || url.password) throw new Error(`Invalid skill source URL: ${skill.name}.`); }
    if (!object(skill.guardrails) || Object.keys(skill.guardrails).some(key => !["citeSources", "verifyBeforeAnswer", "askWhenUncertain"].includes(key)) || ["citeSources", "verifyBeforeAnswer", "askWhenUncertain"].some(key => typeof skill.guardrails[key] !== "boolean")) throw new Error(`Invalid guardrails: ${skill.name}.`);
    const bytes = Buffer.byteLength(skill.instructions, "utf8");
    if (bytes > 262144 || bytes !== skill.bytes || !/^[a-f0-9]{64}$/.test(skill.sha256) || hash(skill.instructions) !== skill.sha256) throw new Error(`Checksum/byte mismatch: ${skill.name}. No skills were installed.`);
    validateSupportingFiles(skill);
  }
  return bundle;
}

async function inspectPath(target) {
  let current = path.resolve(target);
  while (true) {
    try { const stat = await lstat(current); if (stat.isSymbolicLink()) throw new Error(`Refusing symbolic link path: ${current}.`); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    const parent = path.dirname(current); if (parent === current) break; current = parent;
  }
}

export async function installBundle(bundle, { directory = "./my-agent-skills", force = false } = {}) {
  validateBundle(bundle);
  const root = path.resolve(/* turbopackIgnore: true */ directory);
  if (root === path.parse(root).root) throw new Error("Choose a dedicated skill folder, not a drive root.");
  const receipt = { bundleVersion: 1, workspaceId: bundle.workspaceId, receivedAt: new Date().toISOString(), agent: "Logio offline installer (files received; model loading not verified)", accepted: bundle.skills.map(skill => ({ id: skill.id, sha256: skill.sha256, ...(skill.files === undefined ? {} : { files: skill.files.map(file => ({ path: file.path, sha256: file.sha256 })) }) })), bytes: bundle.skills.reduce((sum, skill) => sum + totalBytes(skill), 0) };
  const files = [{ target: path.join(root, "manifest.json"), content: JSON.stringify(bundle, null, 2) + "\n" }, { target: path.join(root, "README.md"), content: "# Logio skill bundle\n\nSkills with a files array include the captured supporting files under their original relative paths. Legacy skills without that array include SKILL.md only. See manifest.json for the exact file list, checksums, byte counts, and source revision. External packages, credentials, dependencies outside the captured folder and unlisted licenses are not bundled. Review each original repository and obtain missing dependencies before use. No instructions or supporting scripts were executed by this installer.\n\nConfigure your local AI or agent to explicitly read each selected skill's LOGIO.md and SKILL.md. Files on disk are not proof that a model has loaded or followed them. The receipt confirms validated file delivery only.\n" }];
  for (const skill of bundle.skills) {
    const guardrails = [skill.guardrails.citeSources && "Cite supporting sources for factual claims.", skill.guardrails.verifyBeforeAnswer && "Verify claims against available evidence before answering; distinguish observation from inference.", skill.guardrails.askWhenUncertain && "State uncertainty and ask for missing information instead of inventing an answer."].filter(Boolean);
    files.push({ target: path.join(root, skill.name, "SKILL.md"), content: skill.instructions }, { target: path.join(root, skill.name, "LOGIO.md"), content: `# ${skill.name}: workspace policy\n\nRead this file together with SKILL.md when loading this skill. If WORKSPACE-INSTRUCTIONS.md is included, read and apply those additional user instructions too. Apply higher-priority user and system instructions first.\n\n${guardrails.length ? guardrails.map(line => `- ${line}`).join("\n") : "No additional workspace guardrails selected."}\n\nSource: ${skill.sourceUrl || "Authored in the workspace"}\nReference: ${skill.sourceRef || "local"}\nSource path: ${skill.sourcePath || "SKILL.md"}\nSHA-256 of SKILL.md: ${skill.sha256}\n\n${skill.files === undefined ? "Legacy instruction-only capture: supporting files are not bundled." : `${skill.files.length} supporting file(s) are included; inspect manifest.json for the exact paths and hashes.`} External dependencies and unlisted licenses may still be required. Review source content before allowing an agent to use tools or execute code. These guardrails do not guarantee factual accuracy.\n` });
    for (const file of skill.files ?? []) files.push({ target: path.join(/* turbopackIgnore: true */ root, skill.name, ...file.path.split("/")), content: supportBytes(file) });
  }
  // A receipt is written last, only after all instruction files reach disk.
  files.push({ target: path.join(root, "transfer-receipt.json"), content: JSON.stringify(receipt, null, 2) + "\n" });
  // Validate every checksum and destination before the first mutation.
  await inspectPath(root);
  for (const file of files) {
    const relative = path.relative(root, file.target);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Destination escaped the skill folder.");
    await inspectPath(file.target);
    try { const stat = await lstat(file.target); if (!stat.isFile() || !force) throw new Error(`Destination exists: ${file.target}. Use --force only to replace reviewed files.`); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  for (const file of files) { await mkdir(path.dirname(file.target), { recursive: true }); await writeFile(file.target, file.content, { encoding: "utf8", flag: force ? "w" : "wx" }); }
  return { directory: root, receipt };
}
