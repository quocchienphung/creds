import { agentsRoot, dataRoot, matchesNone, readResource, storeWritable, StoreError, validName, validWorkspaceId, writeResource } from "@/lib/server/workspace-store";
import { apiError, authorize, readJson, tokenRequired } from "@/lib/server/api-guard";
import { deliverToAgent, restrictedAgents } from "@/lib/server/agent-delivery";
import { knowledgeApi } from "@/lib/server/knowledge-api";
import { collateralQueueApi } from "@/lib/server/collateral-queue-api";
import { parseStorageLibrary } from "@/components/sites/storage/storage-model";

/**
 * The workspace REST contract (docs/backend-api.md) served from this app, backed by files on this machine.
 * Point the workspace at it with NEXT_PUBLIC_WORKSPACE_API_URL=/api/workspace (or window.__workspaceBackendConfig.baseUrl).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const WRITE_LIMIT = 24 * 1024 * 1024;
const BUNDLE_LIMIT = 48 * 1024 * 1024;
type Context = { params: Promise<{ path: string[] }> };

/** `[account, name]` or `[workspaces, id, name, ...rest]` */
function route(segments: string[]) {
  if (segments[0] === "account" && segments.length === 2) return { workspaceId: undefined, name: segments[1], rest: [] as string[] };
  if (segments[0] === "workspaces" && segments.length >= 3) return { workspaceId: segments[1], name: segments[2], rest: segments.slice(3) };
  return null;
}
const reserved = new Set(["queries", "commands", "uploads", "storage", "collateral-queue"]);

async function handle(request: Request, action: () => Promise<Response>) {
  const denied = authorize(request);
  if (denied) return denied;
  try { return await action(); }
  catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof StoreError) return apiError(error.status, error.message);
    return apiError(500, "The server could not complete this request.");
  }
}

export async function GET(request: Request, context: Context) {
  return handle(request, async () => {
    const segments = (await context.params).path;
    if (segments.length === 1 && segments[0] === "health") {
      return Response.json({ data: { ok: true, store: { writable: await storeWritable(), dir: dataRoot() }, agents: { dir: agentsRoot(), restricted: restrictedAgents() }, auth: { tokenRequired: tokenRequired() } } }, { headers: NO_STORE });
    }
    const target = route(segments);
    if (target?.name === "collateral-queue" && target.workspaceId !== undefined && validWorkspaceId(target.workspaceId)) return collateralQueueApi(request, target.workspaceId, target.rest);
    if (target?.name === "storage" && target.workspaceId !== undefined && validWorkspaceId(target.workspaceId)) return knowledgeApi(request, target.workspaceId, target.rest);
    if (!target || target.rest.length || reserved.has(target.name)) return new Response(null, { status: 404, headers: NO_STORE });
    if (!validName(target.name) || (target.workspaceId !== undefined && !validWorkspaceId(target.workspaceId))) return apiError(400, "Invalid resource.");
    const stored = await readResource(target.workspaceId, target.name);
    if (!stored) return new Response(null, { status: 204, headers: NO_STORE });
    const headers = { ...NO_STORE, ETag: `"${stored.version}"` };
    if (matchesNone(request.headers.get("if-none-match"), stored.version)) return new Response(null, { status: 304, headers });
    return Response.json({ data: stored.data, version: stored.version }, { headers });
  });
}

export async function PUT(request: Request, context: Context) {
  return handle(request, async () => {
    const target = route((await context.params).path);
    if (target?.name === "storage" && target.workspaceId !== undefined && validWorkspaceId(target.workspaceId)) return knowledgeApi(request, target.workspaceId, target.rest);
    if (!target || target.rest.length || reserved.has(target.name)) return apiError(404, "Unknown route.");
    const body = await readJson(request, WRITE_LIMIT);
    if (!body || typeof body !== "object" || Array.isArray(body) || !("data" in body)) return apiError(400, "Expected { data }.");
    if (target.name === "knowledge-library" && !parseStorageLibrary((body as { data: unknown }).data)) return apiError(400, "Invalid knowledge library metadata.");
    const stored = await writeResource(target.workspaceId, target.name, (body as { data: unknown }).data, request.headers.get("if-match"));
    return Response.json({ version: stored.version }, { headers: { ...NO_STORE, ETag: `"${stored.version}"` } });
  });
}

export async function DELETE(request: Request, context: Context) {
  return handle(request, async () => {
    const target = route((await context.params).path);
    if (target?.name === "collateral-queue" && target.workspaceId !== undefined && validWorkspaceId(target.workspaceId)) return collateralQueueApi(request, target.workspaceId, target.rest);
    if (target?.name === "storage" && target.workspaceId !== undefined && validWorkspaceId(target.workspaceId)) return knowledgeApi(request, target.workspaceId, target.rest);
    return apiError(404, "Unknown route.");
  });
}

export async function POST(request: Request, context: Context) {
  return handle(request, async () => {
    const target = route((await context.params).path);
    if (target?.name === "collateral-queue" && target.workspaceId !== undefined && validWorkspaceId(target.workspaceId)) return collateralQueueApi(request, target.workspaceId, target.rest);
    if (target?.workspaceId !== undefined && validWorkspaceId(target.workspaceId) && target.name === "commands" && target.rest.length === 1 && target.rest[0] === "skill.transfer") {
      const receipt = await deliverToAgent(target.workspaceId, await readJson(request, BUNDLE_LIMIT));
      return Response.json({ data: receipt }, { headers: NO_STORE });
    }
    // Uploads, other commands and agent-run actions are not served here: the page falls back (files stay in the saved JSON as data: URLs).
    return apiError(404, "This route is not served by the built-in home server.");
  });
}

export async function PATCH(request: Request, context: Context) {
  return handle(request, async () => {
    const target = route((await context.params).path);
    if (target?.name === "collateral-queue" && target.workspaceId !== undefined && validWorkspaceId(target.workspaceId)) return collateralQueueApi(request, target.workspaceId, target.rest);
    return apiError(404, "Unknown route.");
  });
}
