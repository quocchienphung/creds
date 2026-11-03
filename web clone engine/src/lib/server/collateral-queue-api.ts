import { apiError, readJson } from "./api-guard.ts";
import { deleteQueueUpload, downloadQueueUpload, listQueueUploads, parseQueueUpdate, QUEUE_UPLOAD_LIMIT, restoreQueueUpload, saveQueueUpload, sweepExpiredQueueUploads, updateQueueUpload } from "./collateral-queue-store.ts";

const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

async function* bodyChunks(request: Request): AsyncGenerator<Uint8Array> {
  const reader = request.body?.getReader();
  if (!reader) throw apiError(400, "A workbook upload is required.");
  let ended = false;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) { ended = true; return; }
      yield part.value;
    }
  } finally {
    if (!ended) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

/** Invoked only after the workspace API's common authorization and same-origin guard. */
export async function collateralQueueApi(request: Request, workspaceId: string, segments: string[]): Promise<Response> {
  await sweepExpiredQueueUploads(workspaceId);
  if (request.method === "POST" && segments.length === 2 && segments[1] === "restore") {
    const body = await readJson(request, 1024);
    if (!body || typeof body !== "object" || !("undoToken" in body) || typeof body.undoToken !== "string") return apiError(400, "An undo token is required.");
    return Response.json({ data: await restoreQueueUpload(workspaceId, segments[0], body.undoToken) }, { headers });
  }
  if (segments.length === 0) {
    if (request.method === "GET") return Response.json({ data: await listQueueUploads(workspaceId) }, { headers });
    if (request.method === "POST") {
      const contentLength = Number(request.headers.get("content-length"));
      if (Number.isFinite(contentLength) && contentLength > QUEUE_UPLOAD_LIMIT) return apiError(413, "The workbook exceeds 120 MiB.");
      let name: string;
      try { name = decodeURIComponent(request.headers.get("x-file-name") ?? ""); }
      catch { return apiError(400, "Invalid workbook file name."); }
      const entry = await saveQueueUpload(workspaceId, name, bodyChunks(request));
      return Response.json({ data: entry }, { status: 201, headers });
    }
  }
  if (segments.length === 1) {
    const id = segments[0];
    if (request.method === "GET") {
      const { entry, bytes } = await downloadQueueUpload(workspaceId, id);
      const name = encodeURIComponent(entry.name).replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
      return new Response(new Uint8Array(bytes), { headers: { ...headers, "Content-Type": "application/octet-stream", "Content-Length": String(bytes.byteLength), "Content-Disposition": `attachment; filename="workbook.xlsx"; filename*=UTF-8''${name}`, "Content-Security-Policy": "default-src 'none'", "X-File-Sha256": entry.sha256 } });
    }
    if (request.method === "PATCH") {
      const update = parseQueueUpdate(await readJson(request, 4096));
      if (!update) return apiError(400, "Invalid upload processing status.");
      return Response.json({ data: await updateQueueUpload(workspaceId, id, update) }, { headers });
    }
    if (request.method === "DELETE") {
      return Response.json({ data: await deleteQueueUpload(workspaceId, id) }, { headers });
    }
  }
  return apiError(404, "Unknown queue route.");
}
