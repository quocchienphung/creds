import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile, access, constants } from "node:fs/promises";
import path from "node:path";

/**
 * A file-backed store for the workspace REST contract (docs/backend-api.md): one JSON file per resource under `LOGIO_DATA_DIR`
 * (default `./.logio-data`). A version is a hash of the stored value, so `If-Match` / `If-None-Match` work without a database.
 */
const nameRule = /^[a-z0-9][a-z0-9-]{0,47}$/;
const idRule = /^[A-Za-z0-9_-]{1,128}$/;

export const dataRoot = () => path.resolve(/* turbopackIgnore: true */ process.env.LOGIO_DATA_DIR || path.join(/* turbopackIgnore: true */ process.cwd(), ".logio-data"));
export const agentsRoot = () => path.resolve(/* turbopackIgnore: true */ process.env.LOGIO_AGENT_SKILLS_DIR || path.join(/* turbopackIgnore: true */ dataRoot(), "agents"));

export class StoreError extends Error {
  readonly status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

export const validName = (name: string) => nameRule.test(name);
export const validWorkspaceId = (id: string) => idRule.test(id);

function fileFor(workspaceId: string | undefined, name: string): string {
  if (!validName(name)) throw new StoreError("Unknown resource name.", 400);
  if (workspaceId !== undefined && !validWorkspaceId(workspaceId)) throw new StoreError("Invalid workspace id.", 400);
  const root = dataRoot();
  const file = path.join(root, workspaceId === undefined ? "account" : path.join("workspaces", workspaceId), `${name}.json`);
  if (path.relative(root, file).startsWith("..")) throw new StoreError("Invalid path.", 400);
  return file;
}

export const versionOf = (data: unknown) => `v${createHash("sha256").update(JSON.stringify(data) ?? "null").digest("hex").slice(0, 20)}`;
const bare = (tag: string) => tag.replace(/^W\//, "").replace(/^"|"$/g, "");

interface Stored { data: unknown; version: string; updatedAt: string }

export async function readResource(workspaceId: string | undefined, name: string): Promise<Stored | null> {
  try {
    const parsed = JSON.parse(await readFile(fileFor(workspaceId, name), "utf8")) as Partial<Stored>;
    return "data" in parsed ? { data: parsed.data, version: versionOf(parsed.data), updatedAt: String(parsed.updatedAt ?? "") } : null;
  } catch (error) {
    if (error instanceof StoreError) throw error;
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new StoreError("The stored resource could not be read.", 500);
  }
}

/** One write at a time per file, so two saves cannot interleave their read-compare-write. */
const queues = new Map<string, Promise<unknown>>();

export async function writeResource(workspaceId: string | undefined, name: string, data: unknown, ifMatch: string | null): Promise<Stored> {
  const file = fileFor(workspaceId, name);
  const run = async (): Promise<Stored> => {
    const current = await readResource(workspaceId, name);
    if (ifMatch && current && bare(ifMatch) !== "*" && bare(ifMatch) !== current.version) throw new StoreError("The stored copy changed. Reload it and try again.", 412);
    const stored: Stored = { data, version: versionOf(data), updatedAt: new Date().toISOString() };
    await mkdir(path.dirname(file), { recursive: true });
    const temp = `${file}.${randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(stored), "utf8");
    await rename(temp, file);
    return stored;
  };
  const next = (queues.get(file) ?? Promise.resolve()).then(run, run);
  queues.set(file, next.catch(() => undefined));
  return next;
}

export const matchesNone = (ifNoneMatch: string | null, version: string) => !!ifNoneMatch && ifNoneMatch.split(",").some(tag => bare(tag.trim()) === version);

/** Whether the data folder can be written, for the status endpoint. */
export async function storeWritable(): Promise<boolean> {
  try { await mkdir(dataRoot(), { recursive: true }); await access(dataRoot(), constants.W_OK); return true; } catch { return false; }
}
