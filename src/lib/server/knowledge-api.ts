import { apiError } from "./api-guard.ts";
import { downloadKnowledge, readKnowledge, removeKnowledge, saveKnowledge, searchKnowledge } from "./knowledge-store.ts";

const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const BODY_LIMIT = 24 * 1024 * 1024;
/** Bound multipart bytes while reading, including requests without Content-Length. */
async function formData(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw apiError(400, "A document upload is required.");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      size += chunk.value.length;
      if (size > BODY_LIMIT) { await reader.cancel(); throw apiError(413, "The upload exceeds 24 MiB."); }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  try { return await new Response(Buffer.concat(chunks), { headers: { "Content-Type": request.headers.get("content-type") ?? "" } }).formData(); }
  catch { throw apiError(400, "Expected a multipart document upload."); }
}
/** Called only after the shared workspace authorization guard. */
export async function knowledgeApi(request: Request, workspaceId: string, segments: string[]) {
  if (request.method === "GET" && segments.length === 1 && segments[0] === "search") {
    return Response.json({ data: { ids: await searchKnowledge(workspaceId, new URL(request.url).searchParams.get("q") ?? "") } }, { headers });
  }
  if (segments[0] !== "documents" || !segments[1] || segments.length > 3) return apiError(404, "Unknown storage route.");
  const id = segments[1];
  if (request.method === "PUT" && segments.length === 2) {
    const form = await formData(request), file = form.get("file"), text = form.get("text"), sha256 = form.get("sha256");
    if (!(file instanceof File) || typeof text !== "string" || typeof sha256 !== "string") return apiError(400, "Expected file, normalized text and SHA-256 fields.");
    const receipt = await saveKnowledge(workspaceId, id, file, text, sha256);
    return Response.json({ data: receipt }, { headers });
  }
  if (request.method === "GET" && segments.length === 3 && segments[2] === "index") return Response.json({ data: await readKnowledge(workspaceId, id) }, { headers });
  if (request.method === "GET" && segments.length === 3 && segments[2] === "original") {
    const original = await downloadKnowledge(workspaceId, id);
    const name = encodeURIComponent(original.name).replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16)}`);
    return new Response(new Uint8Array(original.bytes), { headers: { ...headers, "Content-Type": "application/octet-stream", "Content-Length": String(original.bytes.length), "Content-Disposition": `attachment; filename="document"; filename*=UTF-8''${name}`, "Content-Security-Policy": "default-src 'none'" } });
  }
  if (request.method === "DELETE" && segments.length === 2) { await removeKnowledge(workspaceId, id); return new Response(null, { status: 204, headers }); }
  return apiError(404, "Unknown storage route.");
}
